import ICAL from 'ical.js';
import type { Task, Tag } from '../types';

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
  
  const processOccurrence = (startIcal: any, endIcal: any, summary: string, baseUid: string, isAllDay: boolean, isRecurring: boolean) => {
    if (endIcal && endIcal.compare(startIcalTime) <= 0) return;
    if (startIcal && startIcal.compare(maxIcalTime) > 0) return;

    const y = startIcal.year;
    const m = String(startIcal.month).padStart(2, '0');
    const d = String(startIcal.day).padStart(2, '0');
    const dueDateStr = `${y}-${m}-${d}`;
    
    const occurrenceUid = isRecurring ? `${baseUid}_${dueDateStr}` : baseUid;
    
    let estimatedMinutes = 0;
    if (!isAllDay && endIcal) {
      const startDateJS = startIcal.toJSDate();
      const endDateJS = endIcal.toJSDate();
      const diffMs = endDateJS.getTime() - startDateJS.getTime();
      estimatedMinutes = Math.floor(diffMs / 60000);
    }
    
    const existingTask = existingTasks.find(t => t.externalId === occurrenceUid);
    
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

  vevents.forEach(vevent => {
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
          processOccurrence(details.startDate, details.endDate, summary, uid, isAllDay, true);
        }
      } else {
        processOccurrence(event.startDate, event.endDate, summary, uid, isAllDay, false);
      }
    } catch (err) {
      console.warn('Failed to parse event', err);
    }
  });
  
  return { newTasks, updatedTasks, newTag };
};
