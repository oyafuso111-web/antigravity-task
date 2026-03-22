import { create } from 'zustand';
import type { Task, Project, Folder, Recurrence, HomeBucket, Tag } from '../types';
import { supabase } from '../lib/supabase';

export type AppTab = 'list' | 'calendar' | 'timeline' | 'reports';
export type ColumnId = 'name' | 'project' | 'time' | 'estimatedMinutes' | 'tags' | 'priority' | 'date' | 'createdAt';

interface TaskStore {
  tasks: Task[];
  projects: Project[];
  folders: Folder[];
  tags: Tag[];
  activeProjectId: string | null;
  activeTimerTaskId: string | null;
  selectedTaskId: string | null;
  selectedTaskIds: string[];
  activeTab: AppTab;
  isSettingsOpen: boolean;
  columnOrder: ColumnId[];
  columnWidths: Record<ColumnId, number>;
  highlightedTaskId: string | null;
  weekStartsOn: 0 | 1;
  
  user: any | null;
  
  // Actions
  setUser: (user: any | null) => void;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  
  setActiveProject: (id: string | null) => void;
  setActiveTab: (tab: AppTab) => void;
  setSettingsOpen: (isOpen: boolean) => void;
  setSelectedTaskId: (id: string | null) => void;
  setHighlightedTaskId: (id: string | null) => void;
  setWeekStartsOn: (start: 0 | 1) => void;
  toggleTaskSelection: (id: string, multi: boolean) => void;
  clearSelection: () => void;
  reorderColumns: (activeId: string, overId: string) => void;
  setColumnWidth: (colId: ColumnId, width: number) => void;
  
  fetchInitialData: () => Promise<void>;
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'accumulatedTime' | 'subtasks' | 'comments' | 'order' | 'description' | 'recurrence'> & { homeBucket?: HomeBucket | null }) => void;
  moveToSmartView: (taskId: string, targetViewId: string) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  updateBulkTasksDate: (taskIds: string[], dueDate: string | null) => void;
  deleteTask: (id: string) => void;
  toggleTaskCompletion: (id: string) => void;

  addSubtask: (taskId: string, title: string) => void;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  addComment: (taskId: string, text: string) => void;

  addProject: (name: string, color: string, id?: string, folderId?: string | null) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  toggleProjectFavorite: (projectId: string) => void;
  addFolder: (name: string) => void;
  
  addTag: (name: string, color: string, id?: string) => void;
  updateTag: (id: string, updates: Partial<Tag>) => void;
  deleteTag: (id: string) => void;

  moveTask: (taskId: string, newProjectId: string | null) => void;
  reorderTasks: (activeId: string, overId: string) => void;

  startTimer: (taskId: string) => void;
  pauseTimer: () => void;
  tickTimer: () => void;
  setDailyLog: (taskId: string, dateStr: string, seconds: number) => void;
}

const getLocalDateStr = (d: Date = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const initialProjects: Project[] = [
  { id: 'p2', name: 'Project Alpha', color: '#F06A6A', folderId: 'f1', isFavorite: false }
];

const initialTags: Tag[] = [
  { id: 'tag1', name: 'Getting Started', color: '#E89A2D' }
];

const initialTasks: Task[] = [
  {
    id: 't1',
    projectId: null,
    title: 'Welcome to Antigravity Task!',
    description: 'This is a task with no due date, so it appears in your Inbox.',
    completed: false,
    priority: 'high',
    tagIds: ['tag1'],
    dueDate: null,
    recurrence: null,
    createdAt: new Date().toISOString(),
    accumulatedTime: 0,
    dailyLogs: {},
    subtasks: [],
    comments: [],
    order: 0,
    homeBucket: 'inbox'
  },
  {
    id: 't2',
    projectId: 'p2',
    title: 'Review the implementation plan',
    description: 'This task is due today.',
    completed: false,
    priority: 'mid',
    tagIds: [],
    dueDate: new Date().toISOString().split('T')[0],
    recurrence: null,
    createdAt: new Date().toISOString(),
    accumulatedTime: 0,
    estimatedMinutes: 0,
    dailyLogs: {},
    subtasks: [],
    comments: [],
    order: 1,
    homeBucket: null
  }
];

const calculateNextOccurrence = (currentDate: string, recurrence: Recurrence): Date | null => {
  const date = new Date(currentDate);
  const { frequency, interval, daysOfWeek, dayOfMonth, weekOfMonth } = recurrence;

  if (frequency === 'daily') {
    if (daysOfWeek && daysOfWeek.length > 0) {
      // Find next occurrence on one of the selected days
      let found = false;
      for (let i = 1; i <= 7 * interval; i++) {
        const next = new Date(date);
        next.setDate(date.getDate() + i);
        if (daysOfWeek.includes(next.getDay())) {
          date.setTime(next.getTime());
          found = true;
          break;
        }
      }
      if (!found) date.setDate(date.getDate() + interval);
    } else {
      date.setDate(date.getDate() + interval);
    }
  } else if (frequency === 'weekly') {
    date.setDate(date.getDate() + (7 * interval));
  } else if (frequency === 'monthly') {
    if (dayOfMonth) {
      date.setMonth(date.getMonth() + interval);
      date.setDate(dayOfMonth);
    } else if (weekOfMonth && daysOfWeek && daysOfWeek.length > 0) {
      date.setMonth(date.getMonth() + interval);
      date.setDate(1);
      const firstDay = date.getDay();
      let diff = (daysOfWeek[0] - firstDay + 7) % 7;
      date.setDate(1 + diff + (weekOfMonth - 1) * 7);
    } else {
      date.setMonth(date.getMonth() + interval);
    }
  } else if (frequency === 'yearly') {
    date.setFullYear(date.getFullYear() + interval);
  }
  return date;
};

export const useTaskStore = create<TaskStore>((set, get) => ({
  user: null,
  tasks: initialTasks,
  projects: initialProjects,
  folders: [{ id: 'f1', name: 'Work' }],
  tags: initialTags,
  activeProjectId: 'p1',
  activeTimerTaskId: null,
  selectedTaskId: null,
  selectedTaskIds: [],
  activeTab: 'list',
  isSettingsOpen: false,
  highlightedTaskId: null,
  weekStartsOn: 0,
  columnOrder: ['name', 'project', 'time', 'estimatedMinutes', 'tags', 'priority', 'date', 'createdAt'],
  columnWidths: {
    name: 400,
    project: 150,
    time: 120,
    estimatedMinutes: 100,
    tags: 200,
    priority: 100,
    date: 120,
    createdAt: 100
  },

  setUser: (user) => set({ user }),
  
  signInWithGoogle: async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, tasks: [], projects: [], tags: [] });
  },

  fetchInitialData: async () => {
    const { user } = get();
    if (!user) return;

    const [tasksRes, projectsRes, tagsRes] = await Promise.all([
      supabase.from('tasks').select('*').order('order', { ascending: true }),
      supabase.from('projects').select('*'),
      supabase.from('tags').select('*')
    ]);

    if (!tasksRes.error) set({ tasks: tasksRes.data || [] });
    if (!projectsRes.error) set({ projects: projectsRes.data || [] });
    if (!tagsRes.error) set({ tags: tagsRes.data || [] });
  },

  setActiveProject: (id) => set({ activeProjectId: id }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),
  setSelectedTaskId: (id) => set({ selectedTaskId: id }),
  setHighlightedTaskId: (id) => set({ highlightedTaskId: id }),
  setWeekStartsOn: (start) => set({ weekStartsOn: start }),
  
  toggleTaskSelection: (id, multi) => set((state) => {
    if (!multi) return { selectedTaskIds: [id] };
    const isSelected = state.selectedTaskIds.includes(id);
    if (isSelected) {
      return { selectedTaskIds: state.selectedTaskIds.filter(taskId => taskId !== id) };
    } else {
      return { selectedTaskIds: [...state.selectedTaskIds, id] };
    }
  }),
  
  clearSelection: () => set({ selectedTaskIds: [] }),

  reorderColumns: (activeId, overId) => set((state) => {
    const oldIndex = state.columnOrder.indexOf(activeId as ColumnId);
    const newIndex = state.columnOrder.indexOf(overId as ColumnId);
    if (oldIndex !== -1 && newIndex !== -1) {
      const newOrder = [...state.columnOrder];
      const [moved] = newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, moved);
      return { columnOrder: newOrder };
    }
    return state;
  }),

  setColumnWidth: (colId, width) => set((state) => ({
    columnWidths: { ...state.columnWidths, [colId]: Math.max(60, width) }
  })),

  addTask: async (taskData) => {
    const { user } = get();
    const newTask: Task = {
      ...taskData,
      id: crypto.randomUUID(),
      tagIds: taskData.tagIds || [],
      description: '',
      recurrence: null,
      createdAt: new Date().toISOString(),
      accumulatedTime: 0,
      estimatedMinutes: taskData.estimatedMinutes || 0,
      dailyLogs: {},
      subtasks: [],
      comments: [],
      order: get().tasks.length,
      homeBucket: taskData.homeBucket || (taskData.dueDate ? null : 'inbox')
    };

    set((state) => ({ tasks: [...state.tasks, newTask] }));

    if (user) {
      await supabase.from('tasks').insert({
        ...newTask,
        user_id: user.id
      });
    }
  },

  moveToSmartView: (taskId, targetViewId) => set((state) => {
    const now = new Date();
    let updatedTags = [...state.tags];
    let waitingTagId: string | null = null;

    if (targetViewId === 'p-waiting') {
      const tagName = '⏯️連絡待ち';
      let waitingTag = updatedTags.find(tag => tag.name === tagName);
      if (!waitingTag) {
        waitingTag = { id: crypto.randomUUID(), name: tagName, color: '#6A44E1' };
        updatedTags.push(waitingTag);
      }
      waitingTagId = waitingTag.id;
    }

    return {
      tags: updatedTags,
      tasks: state.tasks.map(t => {
        if (t.id !== taskId) return t;

        // Smart Views: set dueDate
        if (targetViewId === 'p-today') {
          return { ...t, dueDate: getLocalDateStr(now), homeBucket: null };
        }
        if (targetViewId === 'p-tomorrow') {
          const tomorrow = new Date(now);
          tomorrow.setDate(now.getDate() + 1);
          return { ...t, dueDate: getLocalDateStr(tomorrow), homeBucket: null };
        }
        if (targetViewId === 'p-thisweek') {
          return { ...t, dueDate: getLocalDateStr(now), homeBucket: null };
        }
        if (targetViewId === 'p-nextweek') {
          const nextWeek = new Date(now);
          nextWeek.setDate(now.getDate() + 7);
          return { ...t, dueDate: getLocalDateStr(nextWeek), homeBucket: null };
        }

        // Home Buckets: clear dueDate, set bucket
        if (targetViewId === 'p1') {
          return { ...t, dueDate: null, homeBucket: 'inbox' as HomeBucket };
        }
        if (targetViewId === 'p-wont-do') {
          return { ...t, dueDate: null, homeBucket: 'wont-do' as HomeBucket };
        }
        if (targetViewId === 'p-do-later') {
          return { ...t, dueDate: null, homeBucket: 'do-later' as HomeBucket };
        }
        if (targetViewId === 'p-waiting') {
          const currentTagIds = t.tagIds || [];
          const newTagIds = waitingTagId && !currentTagIds.includes(waitingTagId) 
            ? [...currentTagIds, waitingTagId] 
            : currentTagIds;
          return { ...t, dueDate: null, homeBucket: 'waiting' as HomeBucket, tagIds: newTagIds };
        }
        if (targetViewId === 'p-memo') {
          return { ...t, dueDate: null, homeBucket: 'memo' as HomeBucket };
        }

        return t;
      })
    };
  }),

  updateTask: async (id, updates) => {
    const { user } = get();
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t))
    }));

    if (user) {
      await supabase.from('tasks').update(updates).eq('id', id);
    }
  },

  updateBulkTasksDate: async (taskIds, dueDate) => {
    const { user } = get();
    set((state) => ({
      tasks: state.tasks.map(t => taskIds.includes(t.id) ? { ...t, dueDate } : t)
    }));

    if (user) {
      await supabase.from('tasks').update({ dueDate }).in('id', taskIds);
    }
  },

  deleteTask: async (id) => {
    const { user } = get();
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id)
    }));

    if (user) {
      await supabase.from('tasks').delete().eq('id', id);
    }
  },

  toggleTaskCompletion: (id) => set((state) => {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return state;

    const isMarkingComplete = !task.completed;
    const newTasksState = state.tasks.map((t) => (t.id === id ? { ...t, completed: isMarkingComplete } : t));

    if (isMarkingComplete && task.recurrence) {
      const nextDate = calculateNextOccurrence(task.dueDate || new Date().toISOString(), task.recurrence);
      if (nextDate) {
        const newTask: Task = {
          ...task,
          id: crypto.randomUUID(),
          completed: false,
          dueDate: nextDate.toISOString(),
          createdAt: new Date().toISOString(),
          accumulatedTime: 0,
          dailyLogs: {},
          comments: [],
          subtasks: task.subtasks.map(st => ({ ...st, id: crypto.randomUUID(), completed: false })),
          order: state.tasks.length
        };
        return { tasks: [...newTasksState, newTask] };
      }
    }
    return { tasks: newTasksState };
  }),

  addSubtask: (taskId, title) => set((state) => ({
    tasks: state.tasks.map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          subtasks: [...t.subtasks, { id: crypto.randomUUID(), title, completed: false }]
        };
      }
      return t;
    })
  })),

  toggleSubtask: (taskId, subtaskId) => set((state) => ({
    tasks: state.tasks.map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          subtasks: t.subtasks.map((st) => 
            st.id === subtaskId ? { ...st, completed: !st.completed } : st
          )
        };
      }
      return t;
    })
  })),

  addComment: (taskId, text) => set((state) => ({
    tasks: state.tasks.map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          comments: [...t.comments, {
            id: crypto.randomUUID(),
            userName: 'You',
            text,
            createdAt: new Date().toISOString()
          }]
        };
      }
      return t;
    })
  })),

  addProject: (name, color, explicitId, folderId = null) => set((state) => ({
    projects: [...state.projects, { id: explicitId || crypto.randomUUID(), name, color, folderId, isFavorite: false }]
  })),

  updateProject: (id, updates) => set((state) => ({
    projects: state.projects.map(p => 
      p.id === id ? { ...p, ...updates } : p
    )
  })),

  toggleProjectFavorite: (projectId) => set((state) => ({
    projects: state.projects.map(p => p.id === projectId ? { ...p, isFavorite: !p.isFavorite } : p)
  })),

  addFolder: (name) => set((state) => ({
    folders: [...state.folders, { id: crypto.randomUUID(), name }]
  })),

  addTag: (name, color, id) => set((state) => ({
    tags: [...state.tags, { id: id || crypto.randomUUID(), name, color }]
  })),

  updateTag: (id, updates) => set((state) => ({
    tags: state.tags.map(t => t.id === id ? { ...t, ...updates } : t)
  })),

  deleteTag: (id) => set((state) => ({
    tags: state.tags.filter(t => t.id !== id),
    tasks: state.tasks.map(t => ({
      ...t,
      tagIds: t.tagIds.filter(tagId => tagId !== id)
    }))
  })),

  moveTask: (taskId, newProjectId) => set((state) => ({
    tasks: state.tasks.map(t => t.id === taskId ? { ...t, projectId: newProjectId } : t)
  })),

  reorderTasks: (activeId, overId) => set((state) => {
    const oldIndex = state.tasks.findIndex(t => t.id === activeId);
    const newIndex = state.tasks.findIndex(t => t.id === overId);
    
    if (oldIndex !== -1 && newIndex !== -1) {
      const newTasks = [...state.tasks];
      const [movedTask] = newTasks.splice(oldIndex, 1);
      newTasks.splice(newIndex, 0, movedTask);
      
      // Update order property
      newTasks.forEach((t, i) => { t.order = i; });
      return { tasks: newTasks };
    }
    return state;
  }),

  startTimer: (taskId) => set(() => ({ activeTimerTaskId: taskId })),
  
  pauseTimer: () => set(() => ({ activeTimerTaskId: null })),
  
  tickTimer: () => set((state) => {
    if (!state.activeTimerTaskId) return state;
    const todayStr = getLocalDateStr(new Date());
    return {
      tasks: state.tasks.map(t => {
        if (t.id === state.activeTimerTaskId) {
          const dailyLogs = { ...(t.dailyLogs || {}) };
          dailyLogs[todayStr] = (dailyLogs[todayStr] || 0) + 1;
          return { ...t, accumulatedTime: t.accumulatedTime + 1, dailyLogs };
        }
        return t;
      })
    };
  }),

  setDailyLog: (taskId, dateStr, seconds) => set((state) => ({
    tasks: state.tasks.map(t => {
      if (t.id === taskId) {
        const currentDaily = t.dailyLogs?.[dateStr] || 0;
        const delta = Math.max(0, seconds) - currentDaily;
        const dailyLogs = { ...(t.dailyLogs || {}), [dateStr]: Math.max(0, seconds) };
        return { ...t, accumulatedTime: Math.max(0, t.accumulatedTime + delta), dailyLogs };
      }
      return t;
    })
  }))
}));
