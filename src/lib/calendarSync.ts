import ICAL from 'ical.js';
import type { Task, Tag } from '../types';

// Generate a deterministic UUID-like string from a seed string.
// Same input always produces the same output, preventing duplicate tasks.
const generateDeterministicId = async (str: string): Promise<string> => {
  const msgUint8 = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-1', msgUint8);
  const arr = Array.from(new Uint8Array(hashBuffer));
  const hex = arr.map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${(
    (parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80
  ).toString(16)}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

// Extract YYYY-MM-DD from an ICAL.Time without any timezone conversion.
// This avoids the JST→UTC offset issue that caused all-day events to disappear.
const icalTimeToDateStr = (t: any): string =>
  `${t.year}-${pad2(t.month)}-${pad2(t.day)}`;

export const fetchAndParseCalendar = async (
  icalUrl: string,
  existingTasks: Task[],
  tags: Tag[]
): Promise<{ newTasks: Partial<Task>[], updatedTasks: Partial<Task>[], newTag: Tag | null }> => {
  // Use our own Vercel serverless function to bypass CORS restrictions
  const proxyUrl = '/api/calendarProxy?url=' + encodeURIComponent(icalUrl);
  
  const response = await fetch(proxyUrl);
  if (!response.ok) {
    throw new Error('Failed to fetch calendar data');
  }
  
  const icsData = await response.text();
  const jcalData = ICAL.parse(icsData);
  const comp = new ICAL.Component(jcalData);
  const vevents = comp.getAllSubcomponents('vevent');
  
  // ---- Date boundaries (string-based, timezone-safe) ----
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const maxDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 35);
  const maxDateStr = `${maxDate.getFullYear()}-${pad2(maxDate.getMonth() + 1)}-${pad2(maxDate.getDate())}`;

  // ICAL.Time for the iterator – use fromData to avoid UTC conversion
  const iteratorStart = ICAL.Time.fromData({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate() - 7,   // 7 days back to catch multi-day events
    isDate: true
  });
  const iteratorMax = ICAL.Time.fromData({
    year: maxDate.getFullYear(),
    month: maxDate.getMonth() + 1,
    day: maxDate.getDate(),
    isDate: true
  });
  
  // ---- Tag handling ----
  let calendarTag = tags.find(t => t.name === 'カレンダー');
  let newTag: Tag | null = null;
  
  if (!calendarTag) {
    newTag = {
      id: crypto.randomUUID(),
      name: 'カレンダー',
      color: '#4285F4',
      createdAt: now.toISOString()
    };
    calendarTag = newTag;
  }
  
  // ---- Process events ----
  const newTasks: Partial<Task>[] = [];
  const updatedTasks: Partial<Task>[] = [];
  // Track IDs we've already processed in this run to avoid within-run duplicates
  const processedIds = new Set<string>();

  const processOccurrence = async (
    startIcal: any,
    endIcal: any,
    summary: string,
    baseUid: string,
    isAllDay: boolean,
    isRecurring: boolean
  ) => {
    const dueDateStr = icalTimeToDateStr(startIcal);

    // String-based date filtering – completely timezone-safe
    if (dueDateStr < todayStr) return;
    if (dueDateStr > maxDateStr) return;
    
    const occurrenceKey = isRecurring ? `${baseUid}_${dueDateStr}` : baseUid;
    const deterministicId = await generateDeterministicId(occurrenceKey);

    // Skip if we already processed this occurrence in this sync run
    if (processedIds.has(deterministicId)) return;
    processedIds.add(deterministicId);
    
    let estimatedMinutes = 0;
    if (!isAllDay && endIcal) {
      const startJs = startIcal.toJSDate();
      const endJs = endIcal.toJSDate();
      const diffMs = endJs.getTime() - startJs.getTime();
      estimatedMinutes = Math.max(0, Math.floor(diffMs / 60000));
    }
    
    // Check if the task already exists (by deterministic ID or legacy externalId)
    const existingTask = existingTasks.find(
      t => t.id === deterministicId || t.externalId === occurrenceKey
    );
    
    if (existingTask) {
      let changed = false;
      const updates: Partial<Task> = {};
      
      if (existingTask.title !== summary) {
        updates.title = summary;
        changed = true;
      }
      if (existingTask.dueDate !== dueDateStr) {
        updates.dueDate = dueDateStr;
        changed = true;
      }
      if (existingTask.estimatedMinutes !== estimatedMinutes) {
        updates.estimatedMinutes = estimatedMinutes;
        changed = true;
      }
      
      if (changed) {
        updatedTasks.push({ id: existingTask.id, ...updates });
      }
    } else {
      newTasks.push({
        id: deterministicId,
        title: summary,
        dueDate: dueDateStr,
        estimatedMinutes,
        tagIds: [calendarTag!.id],
        projectId: null,
        externalId: occurrenceKey,
        priority: 'none'
      });
    }
  };

  for (const vevent of vevents) {
    try {
      // Skip exception/override events – they have a RECURRENCE-ID property.
      // These are handled automatically by getOccurrenceDetails() of the
      // parent recurring event, so processing them here would cause duplicates.
      if (vevent.hasProperty('recurrence-id')) continue;

      const event = new ICAL.Event(vevent);
      const summary = event.summary;
      const uid = event.uid;
      
      if (!summary || !uid) continue;
      
      const isAllDay = event.startDate.isDate;
      const isRecurring = event.isRecurring();
      
      if (isRecurring) {
        const iterator = event.iterator(iteratorStart);
        let next: any;
        let loops = 0;
        while ((next = iterator.next()) && loops < 500) {
          loops++;
          // String-based break condition
          if (icalTimeToDateStr(next) > maxDateStr) break;
          const details = event.getOccurrenceDetails(next);
          await processOccurrence(
            details.startDate,
            details.endDate,
            details.item?.summary || summary,
            uid,
            isAllDay,
            true
          );
        }
      } else {
        await processOccurrence(event.startDate, event.endDate, summary, uid, isAllDay, false);
      }
    } catch (err) {
      console.warn('[calendarSync] Failed to parse event:', err);
    }
  }
  
  return { newTasks, updatedTasks, newTag };
};
