import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import type { ColumnId } from '../store/useTaskStore';
import type { Priority, Task } from '../types';
import { TaskItem } from './TaskItem';
import { parseDateText } from '../utils/dateParser';
import {
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { sortProjectsCustom } from '../utils/sortUtils';
import {
  isToday,
  isTomorrow,
  isBefore,
  startOfDay,
  addDays,
  parseISO
} from 'date-fns';
import './TaskListView.css';

const columnLabels: Record<ColumnId, string> = {
  name: 'Task Name',
  project: 'Project',
  time: 'Time',
  estimatedMinutes: '見込み時間',
  tags: 'Tags',
  priority: 'Priority',
  date: 'Due Date',
  createdAt: 'Created'
};

type SortDirection = 'asc' | 'desc' | null;

const SortableHeader: React.FC<{
  id: ColumnId,
  label: string,
  sortColumn: ColumnId | null,
  sortDirection: SortDirection,
  onSort: (col: ColumnId) => void,
  width: number,
  onResize: (colId: ColumnId, width: number) => void
}> = ({ id, label, sortColumn, sortDirection, onSort, width, onResize }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data: { type: 'column' }
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: 'grab',
    position: 'relative',
    zIndex: isDragging ? 10 : 1,
    width: `${width}px`,
    minWidth: `${width}px`,
    maxWidth: `${width}px`,
    flexShrink: 0,
    flexGrow: 0,
  } as React.CSSProperties;

  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      onResize(id, startWidth + delta);
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
  };

  const isActiveSort = sortColumn === id;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`header-cell cell-${id}`}
    >
      <span className="header-sort-label" style={{ flex: 1, userSelect: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
        {label}
        {isActiveSort && (
          <span className="sort-indicator" style={{ fontSize: '0.65rem', opacity: 0.7 }}>
            {sortDirection === 'asc' ? '▲' : '▼'}
          </span>
        )}
      </span>
      <span
        className="sort-hover-btn"
        onClick={(e) => { e.stopPropagation(); onSort(id); }}
        title="Sort"
        style={{
          cursor: 'pointer',
          fontSize: '0.6rem',
          opacity: 0,
          padding: '4px 6px',
          borderRadius: '3px',
          transition: 'opacity 0.15s',
          flexShrink: 0,
          color: 'var(--text-secondary)'
        }}
      >
        {isActiveSort ? (sortDirection === 'asc' ? '▼' : '✕') : '▲▼'}
      </span>
      <div
        className="resize-handle"
        onMouseDown={handleResizeStart}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: '5px',
          cursor: 'col-resize',
          zIndex: 20,
        }}
      />
    </div>
  );
};

export const TaskListView: React.FC = () => {
  const {
    tasks, projects, tags, addProject, addTag, addTask, activeProjectId,
    columnOrder, columnWidths, setColumnWidth,
    sortColumn, sortDirection, secondarySortColumn, secondarySortDirection, setSortConfig
  } = useTaskStore();

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskProjectId, setNewTaskProjectId] = useState<string | null>(null);
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>('none');
  const [newTaskTagsText, setNewTaskTagsText] = useState('');
  const [newTaskDateText, setNewTaskDateText] = useState('');
  const addTaskInputRef = useRef<HTMLInputElement>(null);

  const [showNewTaskProjectDropdown, setShowNewTaskProjectDropdown] = useState(false);
  const [newTaskProjectSearch, setNewTaskProjectSearch] = useState('');
  const [newTaskProjectSelectedIndex, setNewTaskProjectSelectedIndex] = useState(0);
  const newTaskProjectDropdownRef = useRef<HTMLDivElement>(null);

  const [newTaskTagIds, setNewTaskTagIds] = useState<string[]>([]);
  const [showNewTaskTagDropdown, setShowNewTaskTagDropdown] = useState(false);
  const [newTaskTagSearch, setNewTaskTagSearch] = useState('');
  const [newTaskTagSelectedIndex, setNewTaskTagSelectedIndex] = useState(0);
  const newTaskTagDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (newTaskProjectDropdownRef.current && !newTaskProjectDropdownRef.current.contains(e.target as Node)) {
        setShowNewTaskProjectDropdown(false);
      }
      if (newTaskTagDropdownRef.current && !newTaskTagDropdownRef.current.contains(e.target as Node)) {
        setShowNewTaskTagDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    setTimeout(() => {
      setNewTaskProjectId((activeProjectId === 'p1' || activeProjectId?.startsWith('p-') || activeProjectId?.startsWith('t-')) ? null : activeProjectId);
    }, 0);
  }, [activeProjectId]);

  const handleSort = (col: ColumnId) => {
    if (sortColumn === col) {
      if (sortDirection === 'asc') {
        setSortConfig(col, 'desc', secondarySortColumn, secondarySortDirection);
      } else if (sortDirection === 'desc') {
        setSortConfig(secondarySortColumn, secondarySortDirection, null, null);
      }
    } else {
      setSortConfig(col, 'asc', sortColumn, sortDirection);
    }
  };

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) return;

    let finalDueDate: string | null = null;
    if (newTaskDateText.trim()) {
      finalDueDate = parseDateText(newTaskDateText);
    } else {
      const now = new Date();
      const getLocalDateStr = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
      if (activeProjectId === 'p-today') {
        finalDueDate = getLocalDateStr(now);
      } else if (activeProjectId === 'p-tomorrow') {
        finalDueDate = getLocalDateStr(addDays(now, 1));
      } else if (activeProjectId === 'p-thisweek') {
        finalDueDate = getLocalDateStr(now);
      } else if (activeProjectId === 'p-nextweek') {
        finalDueDate = getLocalDateStr(addDays(now, 7));
      }
    }



    let finalHomeBucket: 'inbox' | 'memo' | 'waiting' | 'wont-do' | 'do-later' | null = null;
    if (!finalDueDate) {
      if (activeProjectId === 'p-memo') finalHomeBucket = 'memo';
      else if (activeProjectId === 'p-waiting') finalHomeBucket = 'waiting';
      else if (activeProjectId === 'p-wont-do') finalHomeBucket = 'wont-do';
      else if (activeProjectId === 'p-do-later') finalHomeBucket = 'do-later';
      else if (activeProjectId === 'p1') finalHomeBucket = 'inbox';
    }

    addTask({
      title: newTaskTitle.trim(),
      projectId: newTaskProjectId,
      completed: false,
      priority: newTaskPriority,
      estimatedMinutes: 0,
      tagIds: newTaskTagIds, // Use populated array
      dueDate: finalDueDate,
      homeBucket: finalHomeBucket
    });
    setNewTaskTitle('');
    setNewTaskDateText('');
    setNewTaskTagIds([]);
    setNewTaskTagsText(''); // Keep around for compatibility if needed elsewhere
    setNewTaskPriority('none');
    setNewTaskProjectId((activeProjectId === 'p1' || activeProjectId?.startsWith('p-') || activeProjectId?.startsWith('t-')) ? null : activeProjectId);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.nativeEvent.isComposing) return;
      if (!newTaskTitle.trim()) return;
      e.preventDefault();
      handleAddTask();
    }
  };

  const handleGridNavigation = (e: React.KeyboardEvent) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;

    // Avoid hijacking native text cursor movement unless at boundaries
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text') {
      const input = target as HTMLInputElement;
      if (e.key === 'ArrowLeft' && input.selectionStart !== 0) return;
      if (e.key === 'ArrowRight' && (input.selectionEnd !== input.value.length)) return;
    }

    // Allow native select dropdown navigation
    if (target.tagName === 'SELECT' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      return;
    }

    e.preventDefault();

    const rows = Array.from(document.querySelectorAll('.task-row')) as HTMLElement[];
    if (!rows.length) return;

    const currentRowIdx = rows.findIndex(r => r.contains(target));
    if (currentRowIdx === -1) return;

    const cells = Array.from(rows[currentRowIdx].querySelectorAll('.task-cell')) as HTMLElement[];
    let currentColIdx = cells.findIndex(c => c.contains(target));
    if (currentColIdx === -1) currentColIdx = 0;

    let nextRowIdx = currentRowIdx;
    let nextColIdx = currentColIdx;

    if (e.key === 'ArrowUp') nextRowIdx = Math.max(0, currentRowIdx - 1);
    else if (e.key === 'ArrowDown') nextRowIdx = Math.min(rows.length - 1, currentRowIdx + 1);
    else if (e.key === 'ArrowLeft') nextColIdx = Math.max(0, currentColIdx - 1);
    else if (e.key === 'ArrowRight') nextColIdx = Math.min(cells.length - 1, currentColIdx + 1);

    const nextCell = rows[nextRowIdx].querySelectorAll('.task-cell')[nextColIdx] as HTMLElement;
    if (nextCell) {
      // Find an interactive element inside the cell
      const focusable = nextCell.querySelector('input, select, button, [tabindex]') as HTMLElement;
      if (focusable && focusable !== nextCell) {
        focusable.focus();
      } else {
        // Fallback: focus the cell itself (needs tabIndex on the div)
        nextCell.focus();
      }
    }
  };

  // Ctrl+Enter global shortcut
  const handleGlobalKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      addTaskInputRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);

  const activeTasks = useMemo(() => {
    const filtered = tasks.filter(t => {
      if (activeProjectId === 'completed') {
        return t.completed;
      }

      if (t.completed) return false;

      const getSafeDate = (dateInput: string) => {
        if (dateInput.length === 10) {
          const [y, m, d] = dateInput.split('-').map(Number);
          return new Date(y, m - 1, d);
        }
        return parseISO(dateInput);
      };

      const taskDate = t.dueDate ? getSafeDate(t.dueDate) : null;
      const today = startOfDay(new Date());
      const sevenDaysLater = addDays(today, 7);

      // Home Buckets
      if (activeProjectId === 'p1') {
        return !t.dueDate && (t.homeBucket === 'inbox' || !t.homeBucket);
      }
      if (activeProjectId === 'p-wont-do') {
        return !t.dueDate && t.homeBucket === 'wont-do';
      }
      if (activeProjectId === 'p-do-later') {
        return !t.dueDate && t.homeBucket === 'do-later';
      }
      if (activeProjectId === 'p-waiting') {
        return !t.dueDate && t.homeBucket === 'waiting';
      }
      if (activeProjectId === 'p-memo') {
        return !t.dueDate && t.homeBucket === 'memo';
      }

      // Smart Views
      if (activeProjectId === 'p-today') {
        return taskDate !== null && (isToday(taskDate) || isBefore(taskDate, today));
      }
      if (activeProjectId === 'p-tomorrow') {
        return taskDate !== null && isTomorrow(taskDate);
      }
      if (activeProjectId === 'p-thisweek') {
        return taskDate !== null && taskDate >= today && taskDate < sevenDaysLater;
      }
      if (activeProjectId === 'p-nextweek') {
        return taskDate !== null && taskDate >= sevenDaysLater;
      }

      if (activeProjectId && activeProjectId.startsWith('t-')) {
        const tagId = activeProjectId.slice(2);
        const safeTagIds = t.tagIds || [];
        return safeTagIds.includes(tagId);
      } else {
        return t.projectId === activeProjectId;
      }
    });

    // Apply sorting
    const isArchive = activeProjectId === 'completed';

    if (sortColumn && sortDirection) {
      // User-chosen sort
      const getComparison = (col: ColumnId, dir: SortDirection, a: Task, b: Task) => {
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
            const order: Record<string, number> = { '1st': 4, 'high': 3, 'mid': 2, 'low': 1, 'none': 0 };
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

      filtered.sort((a, b) => {
        let cmp = getComparison(sortColumn, sortDirection, a, b);
        if (cmp === 0 && secondarySortColumn && secondarySortDirection) {
          cmp = getComparison(secondarySortColumn, secondarySortDirection, a, b);
        }
        return cmp;
      });
    } else {
      // Default sort
      if (isArchive) {
        // Archive: date descending
        filtered.sort((a, b) => {
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          const dA = a.dueDate.slice(0, 10);
          const dB = b.dueDate.slice(0, 10);
          return dB.localeCompare(dA);
        });
      } else {
        // Active: date asc → priority desc → project name asc
        const priorityOrder: Record<string, number> = { '1st': 4, 'high': 3, 'mid': 2, 'low': 1, 'none': 0 };
        filtered.sort((a, b) => {
          // Date asc (null last)
          if (a.dueDate && !b.dueDate) return -1;
          if (!a.dueDate && b.dueDate) return 1;
          if (a.dueDate && b.dueDate) {
            const dA = a.dueDate.slice(0, 10);
            const dB = b.dueDate.slice(0, 10);
            const dc = dA.localeCompare(dB);
            if (dc !== 0) return dc;
          }
          // Priority desc
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
          // CreatedAt asc as final tiebreaker (newer tasks at bottom of group)
          return (a.createdAt || '').localeCompare(b.createdAt || '');
        });
      }
    }

    return filtered;
  }, [tasks, activeProjectId, sortColumn, sortDirection, secondarySortColumn, secondarySortDirection, projects]);

  const totalEstimatedMinutes = useMemo(() => {
    return activeTasks.reduce((sum: number, task: Task) => sum + (task.estimatedMinutes || 0), 0);
  }, [activeTasks]);

  const filteredNewTaskProjects = projects.filter(p =>
    p.id !== 'p1' && p.name.toLowerCase().includes(newTaskProjectSearch.toLowerCase())
  ).sort((a, b) => sortProjectsCustom(a.name, b.name));

  const newTaskProject = projects.find(p => p.id === newTaskProjectId);

  const safeTags = tags || [];
  const newTaskTags = newTaskTagIds.map(id => safeTags.find(t => t.id === id)).filter(Boolean) as { id: string, name: string, color: string }[];
  const filteredNewTaskTags = safeTags.filter(t =>
    t.name.toLowerCase().includes(newTaskTagSearch.toLowerCase()) &&
    !newTaskTagIds.includes(t.id)
  );

  const getHeaderLabel = (id: ColumnId) => {
    if (id === 'estimatedMinutes') {
      const h = Math.floor(totalEstimatedMinutes / 60);
      const m = totalEstimatedMinutes % 60;
      const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
      return `見込み時間（${timeStr}）`;
    }
    return columnLabels[id];
  };

  return (
    <div className="task-list-view">

      {/* List Header */}
      <div className="list-header" style={{ display: 'flex' }}>
        <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
          {columnOrder.map(colId => (
            <SortableHeader
              key={colId}
              id={colId}
              label={getHeaderLabel(colId)}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
              width={columnWidths[colId]}
              onResize={setColumnWidth}
            />
          ))}
        </SortableContext>
      </div>

      {/* Task List */}
      <div className="task-list" onKeyDown={handleGridNavigation}>
        <SortableContext
          items={activeTasks.map(t => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {activeTasks.map((task) => (
            <TaskItem key={task.id} task={task} />
          ))}
        </SortableContext>

        {/* Add Task Input (now inside scrollable list) */}
        {activeProjectId !== 'completed' && (
          <div className={`task-row add-task-row ${newTaskTitle || newTaskDateText || newTaskTagsText || newTaskProjectId || newTaskPriority !== 'none' ? 'has-input' : ''}`}>
            {columnOrder.map(colId => {
              switch (colId) {
                case 'name':
                  return (
                    <div key="name" className="task-cell cell-name" style={{ width: `${columnWidths.name}px`, minWidth: `${columnWidths.name}px`, maxWidth: `${columnWidths.name}px`, flexShrink: 0, flexGrow: 0 }}>
                      <div className="add-icon" style={{ transform: 'scale(0.8)', marginRight: '8px', opacity: 0.7 }}>+</div>
                      <input
                        ref={addTaskInputRef}
                        type="text"
                        placeholder="Add task... (Ctrl+Enter)"
                        value={newTaskTitle}
                        onChange={e => setNewTaskTitle(e.target.value)}
                        onKeyDown={handleInputKeyDown}
                        style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', color: 'var(--text-primary)' }}
                      />
                    </div>
                  );
                case 'project':
                  return (
                    <div key="project" className="task-cell cell-project" tabIndex={0}
                      style={{ width: `${columnWidths.project}px`, minWidth: `${columnWidths.project}px`, maxWidth: `${columnWidths.project}px`, flexShrink: 0, flexGrow: 0, position: 'relative', overflow: 'visible' }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowNewTaskProjectDropdown(true);
                          setNewTaskProjectSearch('');
                        }
                      }}
                    >
                      <div className="project-selector-wrapper" ref={newTaskProjectDropdownRef} style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }}>
                        <span
                          className="pill project-pill"
                          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', flex: 1, overflow: 'hidden' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowNewTaskProjectDropdown(!showNewTaskProjectDropdown);
                            setNewTaskProjectSearch('');
                          }}
                          title={newTaskProject ? `${newTaskProject.name}` : 'プロジェクトを選択'}
                        >
                          {newTaskProject ? (
                            <>
                              <span className="color-dot" style={{ backgroundColor: newTaskProject.color, width: '8px', height: '8px', borderRadius: '50%' }}></span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{newTaskProject.name}</span>
                            </>
                          ) : <span style={{ opacity: 0.6 }}>No Project</span>}
                        </span>
                        <button
                          className="project-change-btn"
                          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.75rem', padding: '2px 4px', flexShrink: 0, borderRadius: '3px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowNewTaskProjectDropdown(!showNewTaskProjectDropdown);
                            setNewTaskProjectSearch('');
                          }}
                        >
                          ›
                        </button>

                        {showNewTaskProjectDropdown && (
                          <div className="project-dropdown" style={{
                            position: 'absolute', bottom: '100%', left: 0, zIndex: 100, // Show above row
                            backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)',
                            borderRadius: '6px', padding: '4px', marginBottom: '4px', minWidth: '180px',
                            boxShadow: '0 -4px 12px rgba(0,0,0,0.15)',
                            maxHeight: '240px', display: 'flex', flexDirection: 'column'
                          }}>
                            <input
                              autoFocus
                              type="text"
                              placeholder="Search or create..."
                              value={newTaskProjectSearch}
                              onChange={(e) => {
                                setNewTaskProjectSearch(e.target.value);
                                setNewTaskProjectSelectedIndex(0);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowUp') {
                                  e.preventDefault(); e.stopPropagation();
                                  setNewTaskProjectSelectedIndex(prev => Math.max(0, prev - 1));
                                } else if (e.key === 'ArrowDown') {
                                  e.preventDefault(); e.stopPropagation();
                                  const maxIdx = newTaskProjectSearch.trim() && !projects.find(p => p.name.toLowerCase() === newTaskProjectSearch.toLowerCase().trim()) ? filteredNewTaskProjects.length + 1 : Math.max(0, filteredNewTaskProjects.length);
                                  setNewTaskProjectSelectedIndex(prev => Math.min(maxIdx, prev + 1));
                                } else if (e.key === 'Enter') {
                                  if (e.nativeEvent.isComposing) return;
                                  e.preventDefault(); e.stopPropagation();
                                  if (filteredNewTaskProjects.length === 0 && !newTaskProjectSearch.trim()) {
                                    setShowNewTaskProjectDropdown(false);
                                    return;
                                  }
                                  if (newTaskProjectSelectedIndex === 0) {
                                    setNewTaskProjectId(null); // No project
                                  } else if (newTaskProjectSelectedIndex <= filteredNewTaskProjects.length) {
                                    setNewTaskProjectId(filteredNewTaskProjects[newTaskProjectSelectedIndex - 1].id);
                                  } else if (newTaskProjectSearch.trim()) {
                                    const colors = ['#F06A6A', '#25C26D', '#6A44E1', '#E89A2D', '#2D9CDB'];
                                    const color = colors[Math.floor(Math.random() * colors.length)];
                                    const newId = crypto.randomUUID();
                                    addProject(newTaskProjectSearch.trim(), color, newId);
                                    setNewTaskProjectId(newId);
                                  }
                                  setShowNewTaskProjectDropdown(false);
                                  setNewTaskProjectSearch('');
                                  setNewTaskProjectSelectedIndex(0);
                                  setTimeout(() => addTaskInputRef.current?.focus(), 0); // Focus back to input
                                } else if (e.key === 'Escape') {
                                  setShowNewTaskProjectDropdown(false);
                                }
                              }}
                              style={{
                                width: '100%', padding: '6px 8px', border: 'none',
                                borderBottom: '1px solid var(--border-color)',
                                background: 'transparent', color: 'var(--text-primary)',
                                fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box'
                              }}
                            />
                            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
                              <div
                                className="project-dropdown-item"
                                style={{
                                  padding: '6px 12px', fontSize: '0.875rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '4px',
                                  backgroundColor: newTaskProjectSelectedIndex === 0 ? 'var(--bg-hover)' : 'transparent'
                                }}
                                onClick={() => { setNewTaskProjectId(null); setShowNewTaskProjectDropdown(false); setNewTaskProjectSearch(''); setTimeout(() => addTaskInputRef.current?.focus(), 0); }}
                                onMouseEnter={() => setNewTaskProjectSelectedIndex(0)}
                              >
                                <span className="color-dot" style={{ backgroundColor: 'transparent', border: '1px dashed var(--border-color)', width: '8px', height: '8px', borderRadius: '50%' }}></span>
                                No Project
                              </div>
                              {filteredNewTaskProjects.map((p, idx) => (
                                <div
                                  key={p.id} className="project-dropdown-item"
                                  style={{
                                    padding: '6px 12px', fontSize: '0.875rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '4px',
                                    backgroundColor: newTaskProjectSelectedIndex === idx + 1 ? 'var(--bg-hover)' : 'transparent'
                                  }}
                                  onClick={() => { setNewTaskProjectId(p.id); setShowNewTaskProjectDropdown(false); setNewTaskProjectSearch(''); setTimeout(() => addTaskInputRef.current?.focus(), 0); }}
                                  onMouseEnter={() => setNewTaskProjectSelectedIndex(idx + 1)}
                                >
                                  <span className="color-dot" style={{ backgroundColor: p.color, width: '8px', height: '8px', borderRadius: '50%' }}></span>
                                  {p.name}
                                </div>
                              ))}
                              {newTaskProjectSearch.trim() && !projects.find(p => p.name.toLowerCase() === newTaskProjectSearch.toLowerCase().trim()) && (
                                <div
                                  className="project-dropdown-item create-new"
                                  style={{
                                    padding: '6px 12px', fontSize: '0.875rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                                    borderRadius: '4px', borderTop: '1px solid var(--border-color)', marginTop: '4px', color: 'var(--brand-solid)', fontWeight: 500,
                                    backgroundColor: newTaskProjectSelectedIndex === filteredNewTaskProjects.length + 1 ? 'var(--bg-hover)' : 'transparent'
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const colors = ['#F06A6A', '#25C26D', '#6A44E1', '#E89A2D', '#2D9CDB'];
                                    const color = colors[Math.floor(Math.random() * colors.length)];
                                    const newId = crypto.randomUUID();
                                    addProject(newTaskProjectSearch.trim(), color, newId);
                                    setNewTaskProjectId(newId);
                                    setShowNewTaskProjectDropdown(false);
                                    setNewTaskProjectSearch('');
                                    setTimeout(() => addTaskInputRef.current?.focus(), 0);
                                  }}
                                  onMouseEnter={() => setNewTaskProjectSelectedIndex(filteredNewTaskProjects.length + 1)}
                                >
                                  + "{newTaskProjectSearch.trim()}" を新規作成
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                case 'priority':
                  return (
                    <div key="priority" className="task-cell cell-priority">
                      <select
                        value={newTaskPriority}
                        onChange={(e) => setNewTaskPriority(e.target.value as Priority)}
                        onKeyDown={handleInputKeyDown}
                        style={{
                          width: '100%', background: 'transparent', border: '1px solid transparent',
                          color: newTaskPriority === 'none' ? 'var(--text-primary)' : 'white',
                          backgroundColor: newTaskPriority === 'none' ? 'transparent' : `var(--priority-${newTaskPriority})`,
                          outline: 'none', cursor: 'pointer', borderRadius: '4px', padding: '2px 4px'
                        }}
                        onFocus={e => e.target.style.borderColor = 'var(--border-color)'}
                        onBlur={e => e.target.style.borderColor = 'transparent'}
                      >
                        <option value="none" style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-surface)' }}>—</option>
                        <option value="1st" style={{ color: 'white', backgroundColor: 'var(--priority-1st)' }}>1st</option>
                        <option value="high" style={{ color: 'white', backgroundColor: 'var(--priority-high)' }}>High</option>
                        <option value="mid" style={{ color: 'white', backgroundColor: 'var(--priority-mid)' }}>Mid</option>
                        <option value="low" style={{ color: 'white', backgroundColor: 'var(--priority-low)' }}>Low</option>
                      </select>
                    </div>
                  );
                case 'tags':
                  return (
                    <div key="tags" className="task-cell cell-tags" tabIndex={0}
                      style={{ width: `${columnWidths.tags}px`, minWidth: `${columnWidths.tags}px`, maxWidth: `${columnWidths.tags}px`, flexShrink: 0, flexGrow: 0, position: 'relative', overflow: 'visible' }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowNewTaskTagDropdown(true);
                          setNewTaskTagSearch('');
                        }
                      }}
                    >
                      <div className="tag-selector-wrapper" ref={newTaskTagDropdownRef} style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center', width: '100%', minHeight: '22px' }}>
                        {newTaskTags.map(tag => (
                          <span
                            key={tag.id}
                            className="pill tag-pill"
                            style={{ backgroundColor: tag.color + '33', color: tag.color, display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            {tag.name}
                            <button
                              className="tag-delete-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setNewTaskTagIds(prev => prev.filter(id => id !== tag.id));
                              }}
                              title="タグを削除"
                              style={{ background: 'none', border: 'none', color: tag.color, cursor: 'pointer', padding: 0, fontSize: '0.9rem', lineHeight: 1 }}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                        <button
                          className="add-tag-btn"
                          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.875rem', padding: '0 4px', opacity: newTaskTags.length ? 1 : 0.6 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowNewTaskTagDropdown(!showNewTaskTagDropdown);
                            setNewTaskTagSearch('');
                          }}
                        >
                          {newTaskTags.length ? '+' : 'Tags...'}
                        </button>

                        {showNewTaskTagDropdown && (
                          <div className="tag-dropdown" style={{
                            position: 'absolute', bottom: '100%', left: 0, zIndex: 100, // Show above row
                            backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)',
                            borderRadius: '6px', padding: '4px', marginBottom: '4px', minWidth: '180px',
                            boxShadow: '0 -4px 12px rgba(0,0,0,0.15)',
                            maxHeight: '240px', display: 'flex', flexDirection: 'column'
                          }}>
                            <input
                              autoFocus
                              type="text"
                              placeholder="Search or create..."
                              value={newTaskTagSearch}
                              onChange={(e) => {
                                setNewTaskTagSearch(e.target.value);
                                setNewTaskTagSelectedIndex(0);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowUp') {
                                  e.preventDefault(); e.stopPropagation();
                                  setNewTaskTagSelectedIndex(prev => Math.max(0, prev - 1));
                                } else if (e.key === 'ArrowDown') {
                                  e.preventDefault(); e.stopPropagation();
                                  const maxIdx = newTaskTagSearch.trim() && !safeTags.find(t => t.name.toLowerCase() === newTaskTagSearch.toLowerCase().trim()) ? filteredNewTaskTags.length : Math.max(0, filteredNewTaskTags.length - 1);
                                  setNewTaskTagSelectedIndex(prev => Math.min(maxIdx, prev + 1));
                                } else if (e.key === 'Enter') {
                                  if (e.nativeEvent.isComposing) return;
                                  e.preventDefault(); e.stopPropagation();
                                  if (filteredNewTaskTags.length === 0 && !newTaskTagSearch.trim()) {
                                    setShowNewTaskTagDropdown(false);
                                    return;
                                  }
                                  if (newTaskTagSelectedIndex < filteredNewTaskTags.length) {
                                    // Selected existing tag
                                    const existing = filteredNewTaskTags[newTaskTagSelectedIndex];
                                    if (!newTaskTagIds.includes(existing.id)) {
                                      setNewTaskTagIds(prev => [...prev, existing.id]);
                                    }
                                  } else if (newTaskTagSearch.trim()) {
                                    // Create new tag
                                    const colors = ['#888888', '#F06A6A', '#25C26D', '#6A44E1', '#E89A2D', '#2D9CDB'];
                                    const color = colors[Math.floor(Math.random() * colors.length)];
                                    const newId = crypto.randomUUID();
                                    addTag(newTaskTagSearch.trim(), color, newId);
                                    setNewTaskTagIds(prev => [...prev, newId]);
                                  }
                                  setShowNewTaskTagDropdown(false);
                                  setNewTaskTagSearch('');
                                  setNewTaskTagSelectedIndex(0);
                                  setTimeout(() => addTaskInputRef.current?.focus(), 0);
                                } else if (e.key === 'Escape') {
                                  setShowNewTaskTagDropdown(false);
                                }
                              }}
                              style={{
                                width: '100%', padding: '6px 8px', border: 'none',
                                borderBottom: '1px solid var(--border-color)',
                                background: 'transparent', color: 'var(--text-primary)', outline: 'none'
                              }}
                            />
                            <div style={{ overflowY: 'auto', flex: 1 }}>
                              {filteredNewTaskTags.map((t, idx) => (
                                <div
                                  key={t.id}
                                  style={{
                                    padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem',
                                    backgroundColor: newTaskTagSelectedIndex === idx ? 'var(--bg-hover)' : 'transparent'
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setNewTaskTagIds(prev => [...prev, t.id]);
                                    setShowNewTaskTagDropdown(false);
                                    setNewTaskTagSearch('');
                                    setTimeout(() => addTaskInputRef.current?.focus(), 0);
                                  }}
                                  onMouseEnter={() => setNewTaskTagSelectedIndex(idx)}
                                >
                                  <span className="color-dot" style={{ backgroundColor: t.color, width: '8px', height: '8px', borderRadius: '50%' }}></span>
                                  {t.name}
                                </div>
                              ))}
                              {newTaskTagSearch.trim() && !safeTags.find(t => t.name.toLowerCase() === newTaskTagSearch.toLowerCase().trim()) && (
                                <div
                                  style={{
                                    padding: '6px 8px', cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--brand-solid)', borderTop: filteredNewTaskTags.length > 0 ? '1px solid var(--border-color)' : 'none',
                                    backgroundColor: newTaskTagSelectedIndex === filteredNewTaskTags.length ? 'var(--bg-hover)' : 'transparent'
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const colors = ['#888888', '#F06A6A', '#25C26D', '#6A44E1', '#E89A2D', '#2D9CDB'];
                                    const color = colors[Math.floor(Math.random() * colors.length)];
                                    const newId = crypto.randomUUID();
                                    addTag(newTaskTagSearch.trim(), color, newId);
                                    setNewTaskTagIds(prev => [...prev, newId]);
                                    setShowNewTaskTagDropdown(false);
                                    setNewTaskTagSearch('');
                                    setTimeout(() => addTaskInputRef.current?.focus(), 0);
                                  }}
                                  onMouseEnter={() => setNewTaskTagSelectedIndex(filteredNewTaskTags.length)}
                                >
                                  + "{newTaskTagSearch.trim()}" を新規作成
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                case 'date':
                  return (
                    <div key="date" className="task-cell cell-date">
                      <input type="text" placeholder="today, 明日..."
                        value={newTaskDateText} onChange={e => setNewTaskDateText(e.target.value)}
                        onKeyDown={handleInputKeyDown}
                        style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', color: 'var(--text-primary)' }}
                      />
                    </div>
                  );
                default:
                  return <div key={colId} className={`task-cell cell-${colId}`}></div>;
              }
            })}
          </div>
        )}
      </div>
    </div>
  );
};
