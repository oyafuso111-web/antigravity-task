import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import type { Task, Priority } from '../types';
import { sortProjectsCustom } from '../utils/sortUtils';
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addDays,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  isToday,
} from 'date-fns';
import './TimelineView.css';

type ViewMode = 'weekly' | 'biweekly' | 'monthly';

const getPriorityColor = (p: Priority) => {
  if (p === '1st') return '#E03E3E';
  if (p === 'quick') return '#3B82F6';
  if (p === 'high') return '#F06A6A';
  if (p === 'mid') return '#E89A2D';
  if (p === 'low') return '#6D6E71';
  return '#9CA3AF';
};

const getPriorityLabel = (p: Priority) => {
  if (p === '1st') return '1st';
  if (p === 'quick') return 'すぐ終わる';
  if (p === 'high') return 'High';
  if (p === 'mid') return 'Mid';
  if (p === 'low') return 'Low';
  return '';
};

// Normalize dueDate to yyyy-MM-dd (handles both ISO and date-only strings)
const normalizeDateStr = (d: string | null): string | null => {
  if (!d) return null;
  // Already yyyy-MM-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  // ISO format or full datetime: extract the local date
  try {
    const date = new Date(d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return d.slice(0, 10);
  }
};

export const TimelineView: React.FC = () => {
  const { tasks, projects, tags, updateTask, addTask, toggleTaskCompletion, deleteTask, setSelectedTaskId, timelineJumpTaskId, setTimelineJumpTaskId, sortColumn, sortDirection, secondarySortColumn, secondarySortDirection } = useTaskStore();
  const [viewMode, setViewMode] = useState<ViewMode>('weekly');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [todayStartMode, setTodayStartMode] = useState(false);
  const [filterProjectId, setFilterProjectId] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dropTargetDateStr, setDropTargetDateStr] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [jumpHighlightTaskId, setJumpHighlightTaskId] = useState<string | null>(null);
  const [recentlyDroppedTaskId, setRecentlyDroppedTaskId] = useState<string | null>(null);
  const gridBodyRef = useRef<HTMLDivElement>(null);

  const [completingTaskIds, setCompletingTaskIds] = useState<Set<string>>(new Set());
  const [sidebarWidth, setSidebarWidth] = useState(380);

  const handleSidebarResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      setSidebarWidth(Math.max(150, Math.min(800, startWidth + delta)));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarWidth]);

  // Compute date range
  const { days, dateStrs } = useMemo(() => {
    let start: Date, end: Date;
    if (todayStartMode) {
      // Today-start mode: start from today
      start = new Date();
      start.setHours(0, 0, 0, 0);
      if (viewMode === 'weekly') {
        end = addDays(start, 6);
      } else if (viewMode === 'biweekly') {
        end = addDays(start, 13);
      } else {
        end = addDays(start, 30);
      }
    } else if (viewMode === 'weekly') {
      start = startOfWeek(currentDate, { weekStartsOn: 1 });
      end = endOfWeek(currentDate, { weekStartsOn: 1 });
    } else if (viewMode === 'biweekly') {
      start = startOfWeek(currentDate, { weekStartsOn: 1 });
      end = endOfWeek(addWeeks(currentDate, 1), { weekStartsOn: 1 });
    } else {
      start = startOfMonth(currentDate);
      end = endOfMonth(currentDate);
    }
    const days = eachDayOfInterval({ start, end });
    const dateStrs = days.map(d => format(d, 'yyyy-MM-dd'));
    return { days, dateStrs };
  }, [viewMode, currentDate, todayStartMode]);

  // Header label
  const headerLabel = useMemo(() => {
    if (todayStartMode) {
      return `${format(days[0], 'MMM d')} – ${format(days[days.length - 1], 'MMM d, yyyy')}`;
    }
    if (viewMode === 'weekly' || viewMode === 'biweekly') {
      return `${format(days[0], 'MMM d')} – ${format(days[days.length - 1], 'MMM d, yyyy')}`;
    }
    return format(currentDate, 'MMMM yyyy');
  }, [viewMode, currentDate, days, todayStartMode]);

  // Navigation
  const goToday = () => { setTodayStartMode(false); setCurrentDate(new Date()); };
  const goPrev = () => { setTodayStartMode(false); setCurrentDate(d => viewMode === 'weekly' ? subWeeks(d, 1) : viewMode === 'biweekly' ? subWeeks(d, 2) : subMonths(d, 1)); };
  const goNext = () => { setTodayStartMode(false); setCurrentDate(d => viewMode === 'weekly' ? addWeeks(d, 1) : viewMode === 'biweekly' ? addWeeks(d, 2) : addMonths(d, 1)); };

  // 当日起点: toggle today-start mode & reschedule overdue tasks to today
  const handleTodayStart = useCallback(() => {
    if (todayStartMode) {
      // Turn off today-start mode, go back to normal view at today
      setTodayStartMode(false);
      setCurrentDate(new Date());
      return;
    }

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${day}`;

    // Find overdue tasks (dueDate before today, not completed)
    const overdueTasks = tasks.filter(t => {
      if (t.completed) return false;
      if (!t.dueDate) return false;
      const nd = normalizeDateStr(t.dueDate);
      return nd !== null && nd < todayStr;
    });

    // Move overdue tasks' due dates to today
    overdueTasks.forEach(t => {
      updateTask(t.id, { dueDate: todayStr });
    });

    // Enable today-start mode
    setTodayStartMode(true);
    setCurrentDate(now);
  }, [tasks, updateTask, todayStartMode]);

  // Check if current period contains today
  const hasTodayInRange = useMemo(() => {
    return days.some(d => isToday(d));
  }, [days]);

  // Filter tasks: with due_date, not completed, optionally by project
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (t.completed) return false;
      if (!t.dueDate) return false;
      if (filterProjectId && t.projectId !== filterProjectId) return false;
      return true;
    });
  }, [tasks, filterProjectId]);

  // Sort tasks matching TaskListView order (same sort config + tag grouping in comparator)
  const sortedTasks = useMemo(() => {
    const sorted = [...filteredTasks];

    // Helper: get first tag name for sort grouping
    const getFirstTagName = (task: Task): string => {
      const taskTagIds = task.tagIds || [];
      if (taskTagIds.length === 0) return '';
      const tag = tags.find(t => t.id === taskTagIds[0]);
      return tag?.name || '';
    };

    // Tag comparison helper: same tag → adjacent, no tag → after tagged
    const compareByTag = (a: Task, b: Task): number => {
      const aTag = getFirstTagName(a);
      const bTag = getFirstTagName(b);
      if (aTag === bTag) return 0;
      if (!aTag && bTag) return 1;
      if (aTag && !bTag) return -1;
      return aTag.localeCompare(bTag, 'ja');
    };

    if (sortColumn && sortDirection) {
      // User-chosen sort (same as TaskListView)
      const getComparison = (col: string, dir: string, a: Task, b: Task) => {
        if (!col || !dir) return 0;
        let cmp = 0;
        switch (col) {
          case 'name':
            cmp = a.title.localeCompare(b.title, 'ja');
            break;
          case 'project': {
            const pA = projects.find(p => p.id === a.projectId)?.name || '';
            const pB = projects.find(p => p.id === b.projectId)?.name || '';
            cmp = sortProjectsCustom(pA, pB);
            break;
          }
          case 'priority': {
            const order: Record<string, number> = { '1st': 5, 'quick': 4, 'high': 3, 'mid': 2, 'low': 1, 'none': 0 };
            cmp = (order[a.priority] || 0) - (order[b.priority] || 0);
            break;
          }
          case 'date':
            if (!a.dueDate) cmp = 1;
            else if (!b.dueDate) cmp = -1;
            else {
              const dA = a.dueDate.slice(0, 10);
              const dB = b.dueDate.slice(0, 10);
              cmp = dA.localeCompare(dB);
            }
            break;
          case 'estimatedMinutes':
            cmp = (a.estimatedMinutes || 0) - (b.estimatedMinutes || 0);
            break;
          case 'createdAt':
            cmp = (a.createdAt || '').localeCompare(b.createdAt || '');
            break;
          case 'time':
            cmp = a.accumulatedTime - b.accumulatedTime;
            break;
          default:
            cmp = 0;
        }
        return dir === 'asc' ? cmp : -cmp;
      };

      sorted.sort((a, b) => {
        let cmp = getComparison(sortColumn, sortDirection, a, b);
        if (cmp === 0 && secondarySortColumn && secondarySortDirection) {
          cmp = getComparison(secondarySortColumn, secondarySortDirection, a, b);
        }
        if (cmp === 0) cmp = compareByTag(a, b);
        return cmp;
      });
    } else {
      // Default sort: date asc → priority desc → project name asc → tag group → createdAt asc
      const priorityOrder: Record<string, number> = { '1st': 5, 'quick': 4, 'high': 3, 'mid': 2, 'low': 1, 'none': 0 };
      sorted.sort((a, b) => {
        if (a.dueDate && !b.dueDate) return -1;
        if (!a.dueDate && b.dueDate) return 1;
        if (a.dueDate && b.dueDate) {
          const dA = a.dueDate.slice(0, 10);
          const dB = b.dueDate.slice(0, 10);
          const dc = dA.localeCompare(dB);
          if (dc !== 0) return dc;
        }
        const pc = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
        if (pc !== 0) return pc;
        // Project name asc (null project goes last)
        const hasProjectA = !!a.projectId;
        const hasProjectB = !!b.projectId;
        if (hasProjectA && !hasProjectB) return -1;
        if (!hasProjectA && hasProjectB) return 1;
        const pA = projects.find(p => p.id === a.projectId)?.name || '';
        const pB = projects.find(p => p.id === b.projectId)?.name || '';
        const projCmp = sortProjectsCustom(pA, pB);
        if (projCmp !== 0) return projCmp;
        // Tag group: same tag → adjacent
        const tc = compareByTag(a, b);
        if (tc !== 0) return tc;
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      });
    }

    return sorted;
  }, [filteredTasks, projects, tags, sortColumn, sortDirection, secondarySortColumn, secondarySortDirection]);

  // Tasks without due date (for separate section) — only show uncompleted
  const unscheduledTasks = useMemo(() => {
    return tasks.filter(t => {
      if (t.completed) return false;
      if (t.dueDate) return false;
      if (filterProjectId && t.projectId !== filterProjectId) return false;
      return true;
    });
  }, [tasks, filterProjectId]);

  // Unique projects for filter
  const projectOptions = useMemo(() => {
    const pIds = new Set<string>();
    tasks.filter(t => !t.completed).forEach(t => {
      if (t.projectId) pIds.add(t.projectId);
    });
    return Array.from(pIds)
      .map(id => projects.find(p => p.id === id))
      .filter(Boolean)
      .sort((a, b) => (a!.name || '').localeCompare(b!.name || ''));
  }, [tasks, projects]);

  // Search: find matching task IDs (partial, case-insensitive)
  const searchMatchIds = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    const q = searchQuery.toLowerCase();
    const ids = new Set<string>();
    // Search all non-completed tasks
    tasks.forEach(t => {
      if (!t.completed && t.title.toLowerCase().includes(q)) {
        ids.add(t.id);
      }
    });
    return ids;
  }, [tasks, searchQuery]);

  const hasSearchQuery = searchQuery.trim().length > 0;

  // Count tasks in range for each day
  const taskCountByDay = useMemo(() => {
    const counts: Record<string, number> = {};
    dateStrs.forEach(d => { counts[d] = 0; });
    filteredTasks.forEach(t => {
      const nd = normalizeDateStr(t.dueDate);
      if (nd && counts[nd] !== undefined) {
        counts[nd]++;
      }
    });
    return counts;
  }, [filteredTasks, dateStrs]);

  // Sum estimated minutes per day
  const estimatedMinutesByDay = useMemo(() => {
    const totals: Record<string, number> = {};
    dateStrs.forEach(d => { totals[d] = 0; });
    filteredTasks.forEach(t => {
      const nd = normalizeDateStr(t.dueDate);
      if (nd && totals[nd] !== undefined) {
        totals[nd] += (t.estimatedMinutes || 0);
      }
    });
    return totals;
  }, [filteredTasks, dateStrs]);

  // Format minutes as compact string (e.g. "2h30m", "45m")
  const formatEstimatedTime = useCallback((minutes: number): string => {
    if (minutes <= 0) return '';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0 && m > 0) return `${h}h${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  }, []);



  // ─── HTML5 Drag & Drop handlers ───
  const handleDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
    setDragTaskId(taskId);
    // Small delay to let the ghost render
    requestAnimationFrame(() => {
      const el = e.target as HTMLElement;
      if (el) el.style.opacity = '0.5';
    });
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    const el = e.target as HTMLElement;
    if (el) el.style.opacity = '1';
    setDragTaskId(null);
    setDropTargetDateStr(null);
  }, []);

  const handleDragOverCell = useCallback((e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetDateStr(dateStr);
  }, []);

  const handleDragLeaveCell = useCallback(() => {
    // Don't clear immediately - let DragOver of next cell handle it
  }, []);

  const handleDropOnCell = useCallback((e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId) {
      updateTask(taskId, { dueDate: dateStr });
      setRecentlyDroppedTaskId(taskId);
      setTimeout(() => setRecentlyDroppedTaskId(null), 1500);
    }
    setDragTaskId(null);
    setDropTargetDateStr(null);
  }, [updateTask]);

  // Get effective date for rendering (while dragging)
  const getEffectiveDate = useCallback((task: Task): string | null => {
    if (dragTaskId === task.id && dropTargetDateStr) {
      return dropTargetDateStr;
    }
    return normalizeDateStr(task.dueDate);
  }, [dragTaskId, dropTargetDateStr]);

  // ─── Task actions ───
  const handleCompleteTask = useCallback((e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    setCompletingTaskIds(prev => new Set(prev).add(taskId));
    setTimeout(() => {
      toggleTaskCompletion(taskId);
      setCompletingTaskIds(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }, 500);
  }, [toggleTaskCompletion]);

  const handleDeleteTask = useCallback((e: React.MouseEvent, taskId: string, taskTitle: string) => {
    e.stopPropagation();
    if (window.confirm(`「${taskTitle}」を削除しますか？`)) {
      deleteTask(taskId);
    }
  }, [deleteTask]);

  // ─── Ctrl+Enter: quick add task ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        // Don't trigger if user is typing in an input
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        const title = window.prompt('新しいタスクのタイトルを入力:');
        if (title && title.trim()) {
          const now = new Date();
          const y = now.getFullYear();
          const m = String(now.getMonth() + 1).padStart(2, '0');
          const day = String(now.getDate()).padStart(2, '0');
          const todayStr = `${y}-${m}-${day}`;
          addTask({
            title: title.trim(),
            projectId: filterProjectId,
            completed: false,
            priority: 'none',
            tagIds: [],
            dueDate: todayStr,
            homeBucket: null,
          });
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [addTask, filterProjectId]);

  // ─── Timeline Jump (from Topbar search) ───
  useEffect(() => {
    if (!timelineJumpTaskId) return;
    const jumpTaskId = timelineJumpTaskId; // capture before clearing
    const task = tasks.find(t => t.id === jumpTaskId);
    // Clear the jump signal immediately
    setTimelineJumpTaskId(null);
    if (!task) return;

    const taskDateStr = normalizeDateStr(task.dueDate);



    // Check if the task date is in the current view range
    const isInCurrentRange = taskDateStr && dateStrs.includes(taskDateStr);

    const scrollAndHighlight = () => {
      // Wait for render
      requestAnimationFrame(() => {
        setTimeout(() => {
          const el = gridBodyRef.current?.querySelector(`[data-task-id="${jumpTaskId}"]`) as HTMLElement | null;
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          setJumpHighlightTaskId(jumpTaskId);
          // Clear highlight after 3s
          setTimeout(() => setJumpHighlightTaskId(null), 3000);
        }, 120);
      });
    };

    if (isInCurrentRange || !taskDateStr) {
      // Task is in current range or has no date - just scroll & highlight
      scrollAndHighlight();
    } else {
      // Task is outside current range - switch to the period containing the task date
      const taskDate = new Date(taskDateStr + 'T00:00:00');
      setCurrentDate(taskDate);
      // Need to wait for state update + re-render
      setTimeout(scrollAndHighlight, 200);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelineJumpTaskId]);

  return (
    <div className="tl-view" style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}>
      {/* ── Header ── */}
      <div className="tl-header">
        <div className="tl-nav">
          <button className="tl-nav-btn" onClick={goPrev} title="前の期間">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h2 className="tl-title">{headerLabel}</h2>
          <button className="tl-nav-btn" onClick={goNext} title="次の期間">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <button
            className={`tl-today-btn ${hasTodayInRange ? 'in-range' : ''}`}
            onClick={goToday}
          >
            Default
          </button>
        </div>
        <div className="tl-controls">
          <button
            className={`tl-today-start-btn ${todayStartMode ? 'active' : ''}`}
            onClick={handleTodayStart}
            title="当日起点で表示（期限切れタスクを当日に移動）"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <circle cx="12" cy="16" r="2" />
            </svg>
            Today
          </button>
          <div className="tl-search-box">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="tl-search-input"
              placeholder="タスクを検索..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="tl-search-clear" onClick={() => setSearchQuery('')}>×</button>
            )}
            {hasSearchQuery && (
              <span className="tl-search-count">{searchMatchIds.size}件</span>
            )}
          </div>
          <div className="tl-mode-toggle">
            <button
              className={`tl-mode-btn ${viewMode === 'weekly' ? 'active' : ''}`}
              onClick={() => setViewMode('weekly')}
            >
              Week
            </button>
            <button
              className={`tl-mode-btn ${viewMode === 'biweekly' ? 'active' : ''}`}
              onClick={() => setViewMode('biweekly')}
            >
              2Week
            </button>
            <button
              className={`tl-mode-btn ${viewMode === 'monthly' ? 'active' : ''}`}
              onClick={() => setViewMode('monthly')}
            >
              Month
            </button>
          </div>
          <select
            className="tl-project-filter"
            value={filterProjectId || ''}
            onChange={e => setFilterProjectId(e.target.value || null)}
          >
            <option value="">すべてのプロジェクト</option>
            {projectOptions.map(p => (
              <option key={p!.id} value={p!.id}>{p!.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="tl-grid-wrapper" style={{ position: 'relative' }}>
        {/* Resize handle */}
        <div
          className="tl-sidebar-resizer"
          onMouseDown={handleSidebarResizeStart}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: sidebarWidth,
            width: '8px',
            marginLeft: '-4px',
            cursor: 'col-resize',
            zIndex: 50,
            backgroundColor: 'transparent'
          }}
          title="ドラッグして列幅を調整"
        />
        {/* Day headers */}
        <div className="tl-grid-header">
          <div className="tl-project-col-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, marginRight: 6 }}>
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
            タスク
          </div>
          <div className="tl-day-headers">
            {days.map((day, i) => {
              const todayFlag = isToday(day);
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              const taskCount = taskCountByDay[dateStrs[i]] || 0;
              return (
                <div
                  key={dateStrs[i]}
                  className={`tl-day-header ${todayFlag ? 'today' : ''} ${isWeekend ? 'weekend' : ''}`}
                  onDragOver={(e) => handleDragOverCell(e, dateStrs[i])}
                  onDragLeave={handleDragLeaveCell}
                  onDrop={(e) => handleDropOnCell(e, dateStrs[i])}
                >
                  <span className="tl-day-name">{format(day, viewMode === 'weekly' ? 'EEE' : 'E')}</span>
                  <span className={`tl-day-num ${todayFlag ? 'today-num' : ''}`}>{format(day, 'd')}</span>
                  {taskCount > 0 && (
                    <span className="tl-day-count">{taskCount}</span>
                  )}
                  {estimatedMinutesByDay[dateStrs[i]] > 0 && (
                    <span className="tl-day-estimated">{formatEstimatedTime(estimatedMinutesByDay[dateStrs[i]])}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Grid body */}
        <div className="tl-grid-body" ref={gridBodyRef}>
          {sortedTasks.length === 0 && unscheduledTasks.length === 0 && (
            <div className="tl-empty">
              <div className="tl-empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                  <line x1="9" y1="16" x2="15" y2="16" />
                </svg>
              </div>
              <p className="tl-empty-title">タスクがありません</p>
              <p className="tl-empty-sub">期日の設定されたタスクがここに表示されます</p>
            </div>
          )}

          {sortedTasks.map(task => {
              const effectiveDate = getEffectiveDate(task);
              const isDragging = dragTaskId === task.id;
              const isInRange = effectiveDate && dateStrs.includes(effectiveDate);
              const isSearchMatch = hasSearchQuery && searchMatchIds.has(task.id);
              const isDimmed = hasSearchQuery && !isSearchMatch;
              const isCompleting = completingTaskIds.has(task.id);
              const isRecentlyDropped = recentlyDroppedTaskId === task.id;
              const proj = task.projectId ? projects.find(p => p.id === task.projectId) : null;
              const taskColor = proj?.color || '#9CA3AF';

              return (
                <div key={task.id} data-task-id={task.id} className={`tl-task-row ${isDragging ? 'dragging' : ''} ${!isInRange ? 'out-of-range' : ''} ${isSearchMatch ? 'search-match' : ''} ${isDimmed ? 'search-dimmed' : ''} ${jumpHighlightTaskId === task.id ? 'jump-highlight' : ''} ${isCompleting ? 'completing-animation' : ''}`}>
                  <div className="tl-task-label" title={task.title} draggable onDragStart={(e) => handleDragStart(e, task.id)} onDragEnd={handleDragEnd}>
                    <button
                      className="tl-complete-btn"
                      onClick={(e) => handleCompleteTask(e, task.id)}
                      title="タスクを完了"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                      </svg>
                    </button>
                    {proj && (
                      <span className="tl-task-project-indicator" style={{ backgroundColor: proj.color }} title={proj.name}></span>
                    )}
                    <span
                      className="tl-task-title"
                      onClick={() => setSelectedTaskId(task.id)}
                    >{task.title}</span>
                    {task.priority !== 'none' && (
                      <span className="tl-priority-badge" style={{ color: getPriorityColor(task.priority) }}>
                        {getPriorityLabel(task.priority)}
                      </span>
                    )}
                    {!isInRange && effectiveDate && (
                      <span className="tl-out-date-badge">{effectiveDate.replace(/-/g, '/')}</span>
                    )}
                    <span className="tl-estimated-input-wrapper">
                      <svg className="tl-estimated-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <input
                        type="number"
                        className="tl-estimated-input"
                        value={task.estimatedMinutes || ''}
                        placeholder="—"
                        min={0}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          updateTask(task.id, { estimatedMinutes: isNaN(val) ? 0 : val });
                        }}
                        title="見込み時間（分）"
                      />
                      <span className="tl-estimated-unit">m</span>
                    </span>
                    <span className="tl-hover-actions">
                      <button
                        className="tl-action-btn tl-action-delete"
                        onClick={(e) => handleDeleteTask(e, task.id, task.title)}
                        title="タスクを削除"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                      <button
                        className="tl-action-btn"
                        onClick={(e) => { e.stopPropagation(); setSelectedTaskId(task.id); }}
                        title="詳細を開く"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </button>
                    </span>
                  </div>
                  <div className="tl-day-cells">
                    {days.map((day, i) => {
                      const dayStr = dateStrs[i];
                      const hasTask = effectiveDate === dayStr;
                      const isDropTarget = isDragging && dropTargetDateStr === dayStr;
                      const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                      return (
                        <div
                          key={dayStr}
                          className={`tl-day-cell ${isToday(day) ? 'today' : ''} ${isWeekend ? 'weekend' : ''} ${isDropTarget ? 'drop-target' : ''}`}
                          onDragOver={(e) => handleDragOverCell(e, dayStr)}
                          onDragLeave={handleDragLeaveCell}
                          onDrop={(e) => handleDropOnCell(e, dayStr)}
                        >
                          {hasTask && (
                            <div
                              className={`tl-task-chip ${isDragging ? 'chip-dragging' : ''} ${isSearchMatch ? 'chip-search-match' : ''} ${isRecentlyDropped ? 'chip-drop-highlight' : ''}`}
                              style={{
                                backgroundColor: taskColor,
                                borderColor: taskColor,
                              }}
                              draggable
                              onDragStart={(e) => handleDragStart(e, task.id)}
                              onDragEnd={handleDragEnd}
                              title={`${task.title}\n期日: ${dayStr.replace(/-/g, '/')}\nドラッグで移動`}
                            >
                              <span className="tl-chip-text">{viewMode === 'weekly' ? task.title : ''}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
          })}

          {/* Unscheduled tasks section */}
          {unscheduledTasks.length > 0 && (
            <div className="tl-project-group tl-unscheduled-group">
              <div className="tl-unscheduled-header">
                <div className="tl-unscheduled-label">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>期日未設定</span>
                  <span className="tl-unscheduled-count">{unscheduledTasks.length}</span>
                </div>
                <span className="tl-unscheduled-hint">日付列にドラッグして期日を設定</span>
              </div>
              <div className="tl-unscheduled-list">
                {unscheduledTasks.map(task => {
                  const isDragging = dragTaskId === task.id;
                  const proj = task.projectId ? projects.find(p => p.id === task.projectId) : null;
                  const isSearchMatchU = hasSearchQuery && searchMatchIds.has(task.id);
                  const isDimmedU = hasSearchQuery && !isSearchMatchU;
                  const isCompletingU = completingTaskIds.has(task.id);
                  const isRecentlyDroppedU = recentlyDroppedTaskId === task.id;
                  return (
                    <div
                      key={task.id}
                      data-task-id={task.id}
                      className={`tl-unscheduled-task ${isDragging ? 'dragging' : ''} ${isSearchMatchU ? 'search-match' : ''} ${isDimmedU ? 'search-dimmed' : ''} ${jumpHighlightTaskId === task.id ? 'jump-highlight' : ''} ${isCompletingU ? 'completing-animation' : ''} ${isRecentlyDroppedU ? 'chip-drop-highlight' : ''}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onDragEnd={handleDragEnd}
                    >
                      <button
                        className="tl-complete-btn"
                        onClick={(e) => handleCompleteTask(e, task.id)}
                        title="タスクを完了"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                        </svg>
                      </button>
                      <span
                        className="tl-task-title"
                        onClick={() => setSelectedTaskId(task.id)}
                      >
                        {task.title}
                      </span>
                      {proj && (
                        <span className="tl-unsched-project" style={{ color: proj.color }}>
                          <span className="tl-mini-dot" style={{ backgroundColor: proj.color }}></span>
                          {proj.name}
                        </span>
                      )}
                      {task.priority !== 'none' && (
                        <span className="tl-priority-badge" style={{ color: getPriorityColor(task.priority) }}>
                          {getPriorityLabel(task.priority)}
                        </span>
                      )}
                      <span className="tl-hover-actions">
                        <button
                          className="tl-action-btn tl-action-delete"
                          onClick={(e) => handleDeleteTask(e, task.id, task.title)}
                          title="タスクを削除"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                        <button
                          className="tl-action-btn"
                          onClick={(e) => { e.stopPropagation(); setSelectedTaskId(task.id); }}
                          title="詳細を開く"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </button>
                      </span>
                      <span className="tl-drag-handle">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="9" cy="6" r="1" />
                          <circle cx="15" cy="6" r="1" />
                          <circle cx="9" cy="12" r="1" />
                          <circle cx="15" cy="12" r="1" />
                          <circle cx="9" cy="18" r="1" />
                          <circle cx="15" cy="18" r="1" />
                        </svg>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
