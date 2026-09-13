import ICAL from 'ical.js';
import type { Task, Tag } from '../types';

const generateDeterministicId = async (str: string) => {
  const msgUint8 = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-1', msgUint8);
  const arr = Array.from(new Uint8Array(hashBuffer));
  const hex = arr.map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${(
    (parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80
  ).toString(16)}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
};

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
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 35); // Approx 1 month + a few days
  
  const startIcalTime = ICAL.Time.fromJSDate(today);
  const maxIcalTime = ICAL.Time.fromJSDate(maxDate);
  const safetyStartTime = startIcalTime.clone();
  safetyStartTime.adjust(-7, 0, 0, 0); // 7 days back to catch multi-day events
  
  let calendarTag = tags.find(t => t.name === 'カレンダー');
  let newTag: Tag | null = null;
  
  if (!calendarTag) {
    newTag = {
      id: crypto.randomUUID(),
      name: 'カレンダー',
      color: '#4285F4', // Google Calendar Blue
      createdAt: now.toISOString()
    };
    calendarTag = newTag;
  }
  
  const newTasks: Partial<Task>[] = [];
  const updatedTasks: Partial<Task>[] = [];
  
  const processOccurrence = async (startIcal: any, endIcal: any, summary: string, baseUid: string, isAllDay: boolean, isRecurring: boolean) => {
    if (endIcal && endIcal.compare(startIcalTime) <= 0) return;
    if (startIcal && startIcal.compare(maxIcalTime) > 0) return;

    const y = startIcal.year;
    const m = String(startIcal.month).padStart(2, '0');
    const d = String(startIcal.day).padStart(2, '0');
    const dueDateStr = `${y}-${m}-${d}`;
    
    const occurrenceUid = isRecurring ? `${baseUid}_${dueDateStr}` : baseUid;
    const deterministicId = await generateDeterministicId(occurrenceUid);
    
    let estimatedMinutes = 0;
    if (!isAllDay && endIcal) {
      const startDateJS = startIcal.toJSDate();
      const endDateJS = endIcal.toJSDate();
      const diffMs = endDateJS.getTime() - startDateJS.getTime();
      estimatedMinutes = Math.floor(diffMs / 60000);
    }
    
    // We check both the deterministic ID and the externalId as fallback (though externalId is not persisted in Supabase)
    const existingTask = existingTasks.find(t => t.id === deterministicId || t.externalId === occurrenceUid);
    
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
        externalId: occurrenceUid,
        priority: 'none'
      });
    }
  };

  for (const vevent of vevents) {
    try {
      const event = new ICAL.Event(vevent);
      const summary = event.summary;
      const uid = event.uid;
      
      if (!summary || !uid) return;
      
      const isAllDay = event.startDate.isDate;
      const isRecurring = event.isRecurring();
      
      if (isRecurring) {
        const iterator = event.iterator(safetyStartTime);
        let next: any;
        let loops = 0;
        while ((next = iterator.next()) && loops < 500) {
          loops++;
          if (next.compare(maxIcalTime) > 0) break;
          const details = event.getOccurrenceDetails(next);
          await processOccurrence(details.startDate, details.endDate, summary, uid, isAllDay, true);
        }
      } else {
        await processOccurrence(event.startDate, event.endDate, summary, uid, isAllDay, false);
      }
    } catch (err) {
      console.warn('Failed to parse event', err);
    }
  }
  
  return { newTasks, updatedTasks, newTag };
};
