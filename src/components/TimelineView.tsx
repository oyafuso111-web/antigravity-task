import React, { useState, useMemo, useCallback } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import type { Task, Priority } from '../types';
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

export const TimelineView: React.FC = () => {
  const { tasks, projects, updateTask, setSelectedTaskId } = useTaskStore();
  const [viewMode, setViewMode] = useState<ViewMode>('weekly');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filterProjectId, setFilterProjectId] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dropTargetDateStr, setDropTargetDateStr] = useState<string | null>(null);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());

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

  // Filter tasks: only with due_date, not completed, optionally by project
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
      return (pA?.name || '').localeCompare(pB?.name || '');
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

  // Tasks without due date (for separate section)
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

  // Count tasks in range for each day
  const taskCountByDay = useMemo(() => {
    const counts: Record<string, number> = {};
    dateStrs.forEach(d => { counts[d] = 0; });
    filteredTasks.forEach(t => {
      if (t.dueDate && counts[t.dueDate] !== undefined) {
        counts[t.dueDate]++;
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

  const handleDragOverCell = useCallback((e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetDateStr(dateStr);
  }, []);

  const handleDragLeaveCell = useCallback((_e: React.DragEvent) => {
    // Don't clear immediately - let DragOver of next cell handle it
  }, []);

  const handleDropOnCell = useCallback((e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId) {
      updateTask(taskId, { dueDate: dateStr });
    }
    setDragTaskId(null);
    setDropTargetDateStr(null);
  }, [updateTask]);

  // Get effective date for rendering (while dragging)
  const getEffectiveDate = useCallback((task: Task): string | null => {
    if (dragTaskId === task.id && dropTargetDateStr) {
      return dropTargetDateStr;
    }
    return task.dueDate;
  }, [dragTaskId, dropTargetDateStr]);

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
        <div className="tl-grid-body">
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
                      return (
                        <div
                          key={dateStrs[i]}
                          className={`tl-day-cell-header ${isToday(day) ? 'today' : ''} ${day.getDay() === 0 || day.getDay() === 6 ? 'weekend' : ''} ${isDropTarget ? 'drop-target' : ''}`}
                          onDragOver={(e) => handleDragOverCell(e, dateStrs[i])}
                          onDragLeave={handleDragLeaveCell}
                          onDrop={(e) => handleDropOnCell(e, dateStrs[i])}
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

                  return (
                    <div key={task.id} className={`tl-task-row ${isDragging ? 'dragging' : ''} ${!isInRange ? 'out-of-range' : ''}`}>
                      <div
                        className="tl-task-label"
                        onClick={() => setSelectedTaskId(task.id)}
                        title={task.title}
                      >
                        <span className="tl-priority-dot" style={{ backgroundColor: getPriorityColor(task.priority) }}></span>
                        <span className="tl-task-title">{task.title}</span>
                        {task.priority !== 'none' && (
                          <span className="tl-priority-badge" style={{ color: getPriorityColor(task.priority) }}>
                            {getPriorityLabel(task.priority)}
                          </span>
                        )}
                        {!isInRange && effectiveDate && (
                          <span className="tl-out-date-badge">{effectiveDate.replace(/-/g, '/')}</span>
                        )}
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
                                  className={`tl-task-chip ${isDragging ? 'chip-dragging' : ''}`}
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
                  return (
                    <div
                      key={task.id}
                      className={`tl-unscheduled-task ${isDragging ? 'dragging' : ''}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onDragEnd={handleDragEnd}
                    >
                      <span className="tl-priority-dot" style={{ backgroundColor: getPriorityColor(task.priority) }}></span>
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
