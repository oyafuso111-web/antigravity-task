import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import type { ColumnId } from '../store/useTaskStore';
import type { Priority, Tag, Task } from '../types';
import { TaskItem } from './TaskItem';
import { parseDateText } from '../utils/dateParser';
import {
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes} 
      {...listeners} 
      className={`header-cell cell-${id}`}
    >
      <span 
        className="header-sort-label"
        onClick={(e) => { e.stopPropagation(); onSort(id); }}
        style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
      >
        {label}
        {sortColumn === id && (
          <span className="sort-indicator" style={{ fontSize: '0.65rem', opacity: 0.7 }}>
            {sortDirection === 'asc' ? '▲' : '▼'}
          </span>
        )}
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
  const { tasks, projects, addTask, activeProjectId, columnOrder, columnWidths, setColumnWidth } = useTaskStore();
  const [sortColumn, setSortColumn] = useState<ColumnId | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [secondarySortColumn, setSecondarySortColumn] = useState<ColumnId | null>(null);
  const [secondarySortDirection, setSecondarySortDirection] = useState<SortDirection>(null);
  
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskProjectId, setNewTaskProjectId] = useState<string | null>(null);
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>('none');
  const [newTaskTagsText, setNewTaskTagsText] = useState('');
  const [newTaskDateText, setNewTaskDateText] = useState('');
  const addTaskInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNewTaskProjectId((activeProjectId === 'p1' || activeProjectId?.startsWith('p-')) ? null : activeProjectId);
  }, [activeProjectId]);

  const handleSort = (col: ColumnId) => {
    if (sortColumn === col) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortColumn(secondarySortColumn);
        setSortDirection(secondarySortDirection);
        setSecondarySortColumn(null);
        setSecondarySortDirection(null);
      }
    } else {
      setSecondarySortColumn(sortColumn);
      setSecondarySortDirection(sortDirection);
      setSortColumn(col);
      setSortDirection('asc');
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

    const newTags: Tag[] = newTaskTagsText.split(',').map(t => {
      const name = t.trim();
      if (!name) return null;
      return { id: crypto.randomUUID(), name, color: 'var(--brand-solid)' };
    }).filter(Boolean) as Tag[];

    let finalHomeBucket: any = null;
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
      tagIds: newTags.map(t => t.id),
      dueDate: finalDueDate,
      homeBucket: finalHomeBucket
    });
    setNewTaskTitle('');
    setNewTaskDateText('');
    setNewTaskTagsText('');
    setNewTaskPriority('none');
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
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
    let filtered = tasks.filter(t => {
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
    if (sortColumn && sortDirection) {
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
            cmp = pA.localeCompare(pB, 'ja');
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
            else cmp = a.dueDate.localeCompare(b.dueDate);
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
    }

    return filtered;
  }, [tasks, activeProjectId, sortColumn, sortDirection, secondarySortColumn, secondarySortDirection, projects]);

  const totalEstimatedMinutes = useMemo(() => {
    return activeTasks.reduce((sum: number, task: Task) => sum + (task.estimatedMinutes || 0), 0);
  }, [activeTasks]);

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
            switch(colId) {
              case 'name':
                return (
                  <div key="name" className="task-cell cell-name" style={{ width: `${columnWidths.name}px`, minWidth: `${columnWidths.name}px`, maxWidth: `${columnWidths.name}px`, flexShrink: 0, flexGrow: 0 }}>
                    <div className="add-icon" style={{transform: 'scale(0.8)', marginRight: '8px', opacity: 0.7}}>+</div>
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
                  <div key="project" className="task-cell cell-project">
                    <select 
                      value={newTaskProjectId || ''} 
                      onChange={e => setNewTaskProjectId(e.target.value || null)}
                      onKeyDown={handleInputKeyDown}
                      style={{ width: '100%', background: 'transparent', border: '1px solid transparent', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}
                      onFocus={e => e.target.style.borderColor = 'var(--border-color)'}
                      onBlur={e => e.target.style.borderColor = 'transparent'}
                    >
                      <option value="">No Project</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
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
                  <div key="tags" className="task-cell cell-tags" style={{ width: `${columnWidths.tags}px`, minWidth: `${columnWidths.tags}px`, maxWidth: `${columnWidths.tags}px`, flexShrink: 0, flexGrow: 0 }}>
                     <input type="text" placeholder="Tags (comma separated)"
                       value={newTaskTagsText} onChange={(e) => setNewTaskTagsText(e.target.value)}
                       onKeyDown={handleInputKeyDown}
                       style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', color: 'var(--text-primary)' }}
                     />
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
