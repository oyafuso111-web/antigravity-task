export type Priority = 'none' | '1st' | 'high' | 'mid' | 'low';

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Comment {
  id: string;
  userName: string;
  text: string;
  createdAt: string;
}

export interface Recurrence {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  daysOfWeek?: number[]; // 0-6
  dayOfMonth?: number; // 1-31
  weekOfMonth?: number; // 1-4, -1 for last
}

export type HomeBucket = 'inbox' | 'wont-do' | 'do-later' | 'waiting' | 'memo';

export interface TimeBlock {
  id: string;
  startTime: number;
  endTime: number;
}

export interface Task {
  id: string;
  projectId: string | null;
  title: string;
  description: string;
  completed: boolean;
  priority: Priority;
  tagIds: string[];
  dueDate: string | null;
  recurrence: Recurrence | null;
  createdAt: string;
  accumulatedTime: number;
  estimatedMinutes?: number;
  dailyLogs?: Record<string, number>;
  timeBlocks?: TimeBlock[];
  subtasks: Subtask[];
  comments: Comment[];
  order: number;
  homeBucket: HomeBucket | null;
}

export interface Project {
  id: string;
  folderId: string | null; // null if top-level
  name: string;
  color: string;
  isFavorite: boolean;
  createdAt: string;
}

export interface Folder {
  id: string;
  name: string;
}
