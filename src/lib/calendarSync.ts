import ICAL from 'ical.js';
import type { Task, Tag } from '../types';

export const fetchAndParseCalendar = async (
  icalUrl: string,
  existingTasks: Task[],
  tags: Tag[]
): Promise<{ newTasks: Partial<Task>[], updatedTasks: Partial<Task>[], newTag: Tag | null }> => {
  // Use a CORS proxy to bypass browser restrictions
  const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(icalUrl);
  
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
  
  vevents.forEach(vevent => {
    const event = new ICAL.Event(vevent);
    const startDate = event.startDate?.toJSDate();
    const endDate = event.endDate?.toJSDate();
    const summary = event.summary;
    const uid = event.uid;
    
    if (!startDate || !summary || !uid) return;
    
    // Filter events: Today <= startDate <= Today + 35 days
    if (startDate < today || startDate > maxDate) return;
    
    const dueDateStr = startDate.toISOString().split('T')[0];
    
    let estimatedMinutes = 0;
    // Check if it's an all-day event
    const isAllDay = event.startDate.isDate;
    
    if (!isAllDay && endDate) {
      const diffMs = endDate.getTime() - startDate.getTime();
      estimatedMinutes = Math.floor(diffMs / 60000);
    }
    
    const existingTask = existingTasks.find(t => t.externalId === uid);
    
    if (existingTask) {
      // Check if we need to update
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
      // New task
      newTasks.push({
        title: summary,
        dueDate: dueDateStr,
        estimatedMinutes,
        tagIds: [calendarTag!.id],
        projectId: null,
        externalId: uid,
        priority: 'none'
      });
    }
  });
  
  return { newTasks, updatedTasks, newTag };
};
