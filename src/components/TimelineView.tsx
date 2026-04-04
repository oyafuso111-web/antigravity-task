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
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  isToday,
} from 'date-fns';
import './TimelineView.css';

type ViewMode = 'weekly' | 'monthly';

const getPriorityColor = (p: Priority) => {
  if (p === '1st') return '#E03E3E';
  if (p === 'high') return '#F06A6A';
  if (p === 'mid') return '#E89A2D';
  if (p === 'low') return '#6D6E71';
  return '#9CA3AF';
};

const getPriorityLabel = (p: Priority) => {
  if (p === '1st') return '1st';
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
  const { tasks, projects, updateTask, addTask, toggleTaskCompletion, deleteTask, setSelectedTaskId, timelineJumpTaskId, setTimelineJumpTaskId } = useTaskStore();
  const [viewMode, setViewMode] = useState<ViewMode>('weekly');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filterProjectId, setFilterProjectId] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dropTargetDateStr, setDropTargetDateStr] = useState<string | null>(null);
  const [dropTargetProjectId, setDropTargetProjectId] = useState<string | null>(null);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [jumpHighlightTaskId, setJumpHighlightTaskId] = useState<string | null>(null);
  const gridBodyRef = useRef<HTMLDivElement>(null);

  // Compute date range
  const { days, dateStrs } = useMemo(() => {
    let start: Date, end: Date;
    if (viewMode === 'weekly') {
      start = startOfWeek(currentDate, { weekStartsOn: 1 });
      end = endOfWeek(currentDate, { weekStartsOn: 1 });
    } else {
      start = startOfMonth(currentDate);
      end = endOfMonth(currentDate);
    }
    const days = eachDayOfInterval({ start, end });
    const dateStrs = days.map(d => format(d, 'yyyy-MM-dd'));
    return { days, dateStrs };
  }, [viewMode, currentDate]);

  // Header label
  const headerLabel = useMemo(() => {
    if (viewMode === 'weekly') {
      return `${format(days[0], 'MMM d')} – ${format(days[days.length - 1], 'MMM d, yyyy')}`;
    }
    return format(currentDate, 'MMMM yyyy');
  }, [viewMode, currentDate, days]);

  // Navigation
  const goToday = () => setCurrentDate(new Date());
  const goPrev = () => setCurrentDate(d => viewMode === 'weekly' ? subWeeks(d, 1) : subMonths(d, 1));
  const goNext = () => setCurrentDate(d => viewMode === 'weekly' ? addWeeks(d, 1) : addMonths(d, 1));

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

  // Group tasks by project
  const projectGroups = useMemo(() => {
    const groups: { projectId: string; projectName: string; projectColor: string; tasks: Task[] }[] = [];
    const projectMap = new Map<string, Task[]>();

    filteredTasks.forEach(t => {
      const pId = t.projectId || '__no_project__';
      if (!projectMap.has(pId)) projectMap.set(pId, []);
      projectMap.get(pId)!.push(t);
    });

    // Sort projects: named projects first, then no-project
    const sortedKeys = Array.from(projectMap.keys()).sort((a, b) => {
      if (a === '__no_project__') return 1;
      if (b === '__no_project__') return -1;
      const pA = projects.find(p => p.id === a);
      const pB = projects.find(p => p.id === b);
      return sortProjectsCustom(pA?.name || '', pB?.name || '');
    });

    sortedKeys.forEach(pId => {
      const proj = pId === '__no_project__' ? null : projects.find(p => p.id === pId);
      groups.push({
        projectId: pId,
        projectName: proj?.name || 'プロジェクトなし',
        projectColor: proj?.color || '#9CA3AF',
        tasks: projectMap.get(pId)!.sort((a, b) => {
          const dA = a.dueDate || '';
          const dB = b.dueDate || '';
          return dA.localeCompare(dB);
        })
      });
    });

    return groups;
  }, [filteredTasks, projects]);

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

  // Toggle project collapse
  const toggleProject = useCallback((projectId: string) => {
    setCollapsedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
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

  const handleDragOverCell = useCallback((e: React.DragEvent, dateStr: string, projectId?: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetDateStr(dateStr);
    if (projectId !== undefined) setDropTargetProjectId(projectId);
  }, []);

  const handleDragLeaveCell = useCallback((_e: React.DragEvent) => {
    // Don't clear immediately - let DragOver of next cell handle it
  }, []);

  const handleDropOnCell = useCallback((e: React.DragEvent, dateStr: string, projectId?: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId) {
      const updates: Partial<Task> = { dueDate: dateStr };
      // If dropped on a different project row, also move the project
      if (projectId !== undefined) {
        const task = tasks.find(t => t.id === taskId);
        const currentProjectId = task?.projectId || '__no_project__';
        if (currentProjectId !== projectId) {
          const newProjectId = projectId === '__no_project__' ? null : projectId;
          updates.projectId = newProjectId;
        }
      }
      updateTask(taskId, updates);
    }
    setDragTaskId(null);
    setDropTargetDateStr(null);
    setDropTargetProjectId(null);
  }, [updateTask, tasks]);

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
    toggleTaskCompletion(taskId);
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

    // Expand the project group if it's collapsed
    const taskProjectId = task.projectId || '__no_project__';
    setCollapsedProjects(prev => {
      if (prev.has(taskProjectId)) {
        const next = new Set(prev);
        next.delete(taskProjectId);
        return next;
      }
      return prev;
    });

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
    <div className="tl-view">
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
            Today
          </button>
        </div>
        <div className="tl-controls">
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
      <div className="tl-grid-wrapper">
        {/* Day headers */}
        <div className="tl-grid-header">
          <div className="tl-project-col-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, marginRight: 6 }}>
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
            プロジェクト / タスク
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
                  <span className="tl-day-name">{format(day, viewMode === 'monthly' ? 'E' : 'EEE')}</span>
                  <span className={`tl-day-num ${todayFlag ? 'today-num' : ''}`}>{format(day, 'd')}</span>
                  {taskCount > 0 && (
                    <span className="tl-day-count">{taskCount}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Grid body */}
        <div className="tl-grid-body" ref={gridBodyRef}>
          {projectGroups.length === 0 && unscheduledTasks.length === 0 && (
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

          {projectGroups.map(group => {
            const isCollapsed = collapsedProjects.has(group.projectId);

            return (
              <div key={group.projectId} className="tl-project-group">
                {/* Project header row */}
                <div className="tl-project-row" onClick={() => toggleProject(group.projectId)}>
                  <div className="tl-project-label">
                    <span className={`tl-collapse-icon ${isCollapsed ? '' : 'expanded'}`}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </span>
                    <span className="tl-project-dot" style={{ backgroundColor: group.projectColor }}></span>
                    <span className="tl-project-name">{group.projectName}</span>
                    <span className="tl-project-count">{group.tasks.length}</span>
                  </div>
                  <div className="tl-day-cells">
                    {days.map((day, i) => {
                      const isDropTarget = dropTargetDateStr === dateStrs[i] && dragTaskId !== null;
                      const isProjectDropTarget = dropTargetProjectId === group.projectId && dragTaskId !== null;
                      return (
                        <div
                          key={dateStrs[i]}
                          className={`tl-day-cell-header ${isToday(day) ? 'today' : ''} ${day.getDay() === 0 || day.getDay() === 6 ? 'weekend' : ''} ${isDropTarget ? 'drop-target' : ''} ${isProjectDropTarget ? 'project-drop-target' : ''}`}
                          onDragOver={(e) => handleDragOverCell(e, dateStrs[i], group.projectId)}
                          onDragLeave={handleDragLeaveCell}
                          onDrop={(e) => handleDropOnCell(e, dateStrs[i], group.projectId)}
                        >
                          {/* Show count indicator for collapsed projects */}
                          {isCollapsed && (() => {
                            const count = group.tasks.filter(t => getEffectiveDate(t) === dateStrs[i]).length;
                            return count > 0 ? (
                              <span className="tl-collapsed-count" style={{ backgroundColor: group.projectColor }}>{count}</span>
                            ) : null;
                          })()}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Task rows */}
                {!isCollapsed && group.tasks.map(task => {
                  const effectiveDate = getEffectiveDate(task);
                  const isDragging = dragTaskId === task.id;
                  // Check if task is in visible range
                  const isInRange = effectiveDate && dateStrs.includes(effectiveDate);

                  const isSearchMatch = hasSearchQuery && searchMatchIds.has(task.id);
                  const isDimmed = hasSearchQuery && !isSearchMatch;

                  return (
                    <div key={task.id} data-task-id={task.id} className={`tl-task-row ${isDragging ? 'dragging' : ''} ${!isInRange ? 'out-of-range' : ''} ${isSearchMatch ? 'search-match' : ''} ${isDimmed ? 'search-dimmed' : ''} ${jumpHighlightTaskId === task.id ? 'jump-highlight' : ''}`}>
                      <div className="tl-task-label" title={task.title}>
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
                        >{task.title}</span>
                        {task.priority !== 'none' && (
                          <span className="tl-priority-badge" style={{ color: getPriorityColor(task.priority) }}>
                            {getPriorityLabel(task.priority)}
                          </span>
                        )}
                        {!isInRange && effectiveDate && (
                          <span className="tl-out-date-badge">{effectiveDate.replace(/-/g, '/')}</span>
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
                              onDragOver={(e) => handleDragOverCell(e, dayStr, group.projectId)}
                              onDragLeave={handleDragLeaveCell}
                              onDrop={(e) => handleDropOnCell(e, dayStr, group.projectId)}
                            >
                              {hasTask && (
                                <div
                                  className={`tl-task-chip ${isDragging ? 'chip-dragging' : ''} ${isSearchMatch ? 'chip-search-match' : ''}`}
                                  style={{
                                    backgroundColor: group.projectColor,
                                    borderColor: group.projectColor,
                                  }}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, task.id)}
                                  onDragEnd={handleDragEnd}
                                  title={`${task.title}\n期日: ${dayStr.replace(/-/g, '/')}\nドラッグで移動`}
                                >
                                  <span className="tl-chip-text">{viewMode === 'monthly' ? '' : task.title}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
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
                  return (
                    <div
                      key={task.id}
                      data-task-id={task.id}
                      className={`tl-unscheduled-task ${isDragging ? 'dragging' : ''} ${isSearchMatchU ? 'search-match' : ''} ${isDimmedU ? 'search-dimmed' : ''} ${jumpHighlightTaskId === task.id ? 'jump-highlight' : ''}`}
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
