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

  const maxDateBuffer = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate() + 60);
  const maxDateBufferStr = `${maxDateBuffer.getFullYear()}-${pad2(maxDateBuffer.getMonth() + 1)}-${pad2(maxDateBuffer.getDate())}`;

  // ICAL.Time for the iterator – use fromData to avoid UTC conversion
  const iteratorStart = ICAL.Time.fromData({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate() - 7,   // 7 days back to catch multi-day events
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
    isRecurring: boolean,
    recurrenceIdIcal: any = null
  ) => {
    const dueDateStr = icalTimeToDateStr(startIcal);

    // String-based date filtering – completely timezone-safe
    if (dueDateStr < todayStr) return;
    if (dueDateStr > maxDateStr) return;
    
    // Determine a unique occurrence key
    // For repeating events, if we have a recurrenceId (the original date), use that to map exceptions correctly.
    // Otherwise fallback to the actual due date string.
    let occurrenceSuffix = '';
    if (isRecurring) {
      occurrenceSuffix = '_' + (recurrenceIdIcal ? icalTimeToDateStr(recurrenceIdIcal) : dueDateStr);
    }
    const occurrenceKey = `${baseUid}${occurrenceSuffix}`;
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

  // ---- Group Exceptions and Relate to Master Events ----
  const masterEvents = new Map<string, any>();
  const exceptions: any[] = [];

  for (const vevent of vevents) {
    try {
      const event = new ICAL.Event(vevent);
      if (event.isRecurrenceException()) {
        exceptions.push(event);
      } else {
        masterEvents.set(event.uid, event);
      }
    } catch (err) {
      console.warn('[calendarSync] Failed to parse event into ICAL.Event:', err);
    }
  }

  for (const ex of exceptions) {
    const master = masterEvents.get(ex.uid);
    if (master) {
      master.relateException(ex);
    } else {
      // Treat exception as standalone if master is missing from the export
      masterEvents.set(ex.uid, ex);
    }
  }

  // ---- Iterate over properly structured events ----
  for (const event of masterEvents.values()) {
    try {
      const summary = event.summary;
      const uid = event.uid;
      
      if (!summary || !uid) continue;
      
      const isRecurring = event.isRecurring();
      
      if (isRecurring) {
        const iterator = event.iterator(iteratorStart);
        let next: any;
        let loops = 0;
        
        const relatedExceptions = exceptions.filter(ex => ex.uid === uid);
        
        while ((next = iterator.next()) && loops < 500) {
          loops++;
          // Break condition using buffer to allow shifted exceptions to be processed
          if (icalTimeToDateStr(next) > maxDateBufferStr) break;
          
          let details = event.getOccurrenceDetails(next);
          
          // Manual matching to bypass ical.js timezone string mismatch
          // Google Calendar sometimes exports master as TZID (local) and exception as Z (UTC).
          // We match by comparing the Year, Month, Day of the recurrenceId.
          const matchingEx = relatedExceptions.find(ex => 
             ex.recurrenceId && 
             ex.recurrenceId.year === next.year && 
             ex.recurrenceId.month === next.month && 
             ex.recurrenceId.day === next.day
          );
          
          if (matchingEx) {
            details = {
              startDate: matchingEx.startDate,
              endDate: matchingEx.endDate,
              item: matchingEx,
              recurrenceId: next
            } as any;
          }
          
          const isOccurrenceAllDay = details.startDate.isDate;
          
          await processOccurrence(
            details.startDate,
            details.endDate,
            details.item?.summary || summary,
            uid,
            isOccurrenceAllDay,
            true,
            next
          );
        }
      } else {
        const isAllDay = event.startDate.isDate;
        await processOccurrence(event.startDate, event.endDate, summary, uid, isAllDay, false);
      }
    } catch (err) {
      console.warn('[calendarSync] Failed to process event:', err);
    }
  }
  
  return { newTasks, updatedTasks, newTag };
};
