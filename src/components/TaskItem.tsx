import React, { useState, useRef, useEffect } from 'react';
import type { Task, Priority } from '../types';
import { useTaskStore } from '../store/useTaskStore';
import type { ColumnId } from '../store/useTaskStore';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { parseDateText, formatDateDisplay } from '../utils/dateParser';
import './TaskItem.css';

interface Props {
  task: Task;
}

export const TaskItem: React.FC<Props> = ({ task }) => {
  const { 
    projects,
    tags,
    moveTask,
    updateTask,
    addProject,
    addTag,
    toggleTaskCompletion, 
    setActiveProject,
    activeTimerTaskId,
    startTimer,
    pauseTimer,
    columnOrder,
    columnWidths,
    setSelectedTaskId,
    selectedTaskIds,
    toggleTaskSelection,
    clearSelection,
    updateBulkTasksDate,
    setDailyLog,
    highlightedTaskId
  } = useTaskStore();
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [projectSelectedIndex, setProjectSelectedIndex] = useState(0);

  const rowRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when highlighted
  useEffect(() => {
    if (highlightedTaskId === task.id && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedTaskId, task.id]);

  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const [tagSelectedIndex, setTagSelectedIndex] = useState(0);
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [editMinutes, setEditMinutes] = useState<string>('0');
  
  const [showDateInput, setShowDateInput] = useState(false);
  const [dateText, setDateText] = useState('');
  const dateInputRef = useRef<HTMLDivElement>(null);

  const getLocalDateStr = (d: Date = new Date()) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const todayStr = getLocalDateStr();
  const todayTimeSecs = task.dailyLogs?.[todayStr] || 0;

  const isTimerActive = activeTimerTaskId === task.id;
  const project = projects.find(p => p.id === task.projectId);
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(event.target as Node)) {
        setShowProjectDropdown(false);
      }
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(event.target as Node)) {
        setShowTagDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    const handleClickOutsideDate = (event: MouseEvent) => {
      if (dateInputRef.current && !dateInputRef.current.contains(event.target as Node)) {
        setShowDateInput(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutsideDate);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('mousedown', handleClickOutsideDate);
    };
  }, []);

  const handleTimerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTimerActive) {
      pauseTimer();
    } else {
      startTimer(task.id);
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const isMultiSelected = selectedTaskIds.includes(task.id);

  const rowStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: isDragging ? 'relative' : 'static',
    zIndex: isDragging ? 1 : 0,
  } as React.CSSProperties;

  // Build className-based selection/timer styles for the task-row
  const rowClasses = ['task-row'];
  if (isTimerActive) rowClasses.push('timer-active');
  if (isMultiSelected) rowClasses.push('multi-selected');
  if (task.completed) rowClasses.push('completed');
  if (highlightedTaskId === task.id) rowClasses.push('search-highlighted');

  const getPriorityColor = (p: Priority) => {
    if (p === '1st') return 'var(--priority-1st)';
    if (p === 'high') return 'var(--priority-high)';
    if (p === 'mid') return 'var(--priority-mid)';
    if (p === 'low') return 'var(--priority-low)';
    return 'transparent'; // 'none'
  };


  const handleDateUpdate = (newDate: string | null) => {
    if (selectedTaskIds.length > 1 && selectedTaskIds.includes(task.id)) {
      updateBulkTasksDate(selectedTaskIds, newDate);
    } else {
      updateTask(task.id, { dueDate: newDate });
    }
  };

  const filteredProjects = projects.filter(p => 
    p.id !== 'p1' && p.name.toLowerCase().includes(projectSearch.toLowerCase())
  );

  const handleRowClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      toggleTaskSelection(task.id, true);
    } else {
      clearSelection();
      toggleTaskSelection(task.id, false);
    }
  };

  const renderCell = (colId: ColumnId) => {
    switch (colId) {
      case 'name':
        return (
          <div key="name" className="task-cell cell-name" tabIndex={0}
            style={{ width: `${columnWidths.name}px`, minWidth: `${columnWidths.name}px`, maxWidth: `${columnWidths.name}px`, flexShrink: 0, flexGrow: 0 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                setSelectedTaskId(task.id);
              }
            }}
          >
            <button 
              className="complete-btn" 
              onClick={(e) => { e.stopPropagation(); toggleTaskCompletion(task.id); }}
              title="Mark Complete"
            >
              <div className="check-circle" />
            </button>
            <span className="task-title">
              {isTimerActive && <span className="timer-indicator">⏱️ </span>}
              {task.title}
            </span>
            <button
              className="icon-btn details-btn"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedTaskId(task.id);
              }}
              title="Open Details"
              style={{ padding: '2px 6px', fontSize: '0.75rem', flexShrink: 0, display: 'flex', alignItems: 'center', opacity: 0.5 }}
            >
              詳細 〉
            </button>
          </div>
        );
      case 'time': {
        const displayLabel = task.accumulatedTime > 0 || isTimerActive 
            ? `${formatTime(todayTimeSecs)} (${formatTime(task.accumulatedTime)})`
            : '';
        return (
          <div key="time" className="task-cell cell-time" tabIndex={0}
            style={{ width: `${columnWidths.time}px`, minWidth: `${columnWidths.time}px`, maxWidth: `${columnWidths.time}px`, flexShrink: 0, flexGrow: 0 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                setEditMinutes(Math.floor(todayTimeSecs / 60).toString());
                setIsEditingTime(true);
              }
            }}
          >
            {isEditingTime ? (
              <input 
                type="number"
                value={editMinutes}
                onChange={e => setEditMinutes(e.target.value)}
                onBlur={() => {
                  const val = parseInt(editMinutes, 10);
                  if (!isNaN(val) && val >= 0) {
                    setDailyLog(task.id, todayStr, val * 60);
                  }
                  setIsEditingTime(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                  if (e.key === 'Escape') {
                    setIsEditingTime(false);
                  }
                }}
                autoFocus
                style={{ width: '60px', padding: '2px 4px', fontSize: '0.75rem', outline: 'none', border: '1px solid var(--brand-solid)', borderRadius: '4px', background: 'var(--bg-app)', color: 'var(--text-primary)' }}
                min="0"
                step="1"
                title="Enter minutes"
              />
            ) : (
              <span 
                className={`timer-display ${isTimerActive ? 'brand-text' : ''}`} 
                onClick={(e) => {
                  e.stopPropagation();
                  setEditMinutes(Math.floor(todayTimeSecs / 60).toString());
                  setIsEditingTime(true);
                }}
                title="Click to edit today's minutes"
                style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', display: 'inline-block', minWidth: '40px', padding: '2px 0' }}
              >
                 {displayLabel || <span style={{ opacity: 0.5 }}>0m (0m)</span>}
              </span>
            )}
            <div className="task-actions" style={{ opacity: isTimerActive ? 1 : undefined }}>
              <button 
                className={`icon-btn timer-btn ${isTimerActive ? 'active brand-text' : ''}`} 
                onClick={handleTimerClick}
                title={isTimerActive ? "Pause Timer" : "Start Timer"}
              >
                {isTimerActive ? '⏸' : '▶'}
              </button>
            </div>
          </div>
        );
      }
      case 'project': {
        return (
          <div key="project" className="task-cell cell-project" tabIndex={0}
            style={{ width: `${columnWidths.project}px`, minWidth: `${columnWidths.project}px`, maxWidth: `${columnWidths.project}px`, flexShrink: 0, flexGrow: 0, position: 'relative', overflow: 'visible' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                setShowProjectDropdown(!showProjectDropdown);
                setProjectSearch('');
              }
            }}
          >
             <div className="project-selector-wrapper" ref={projectDropdownRef} style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }}>
               <span 
                 className="pill project-pill"
                 style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', flex: 1, overflow: 'hidden' }}
                 onClick={(e) => {
                   e.stopPropagation();
                   if (project) {
                     setActiveProject(project.id);
                   } else {
                     setShowProjectDropdown(!showProjectDropdown);
                     setProjectSearch('');
                   }
                 }}
                 title={project ? `${project.name} のタスク一覧を表示` : 'プロジェクトを選択'}
               >
                 {project ? (
                   <>
                     <span className="color-dot" style={{ backgroundColor: project.color, width: '8px', height: '8px', borderRadius: '50%' }}></span>
                     <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
                   </>
                 ) : 'Select Project'}
               </span>
               <button
                 className="project-change-btn"
                 style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.75rem', padding: '2px 4px', flexShrink: 0, borderRadius: '3px' }}
                 onClick={(e) => {
                   e.stopPropagation();
                   setShowProjectDropdown(!showProjectDropdown);
                   setProjectSearch('');
                 }}
                 title="プロジェクトを変更"
               >
                 ›
               </button>
               {showProjectDropdown && (
                 <div className="project-dropdown" style={{
                   position: 'absolute', top: '100%', left: 0, zIndex: 10,
                   backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)',
                   borderRadius: '6px', padding: '4px', marginTop: '4px', minWidth: '180px',
                   boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                   maxHeight: '240px', display: 'flex', flexDirection: 'column'
                 }}>
                   <input
                     autoFocus
                     type="text"
                     placeholder="Search or create..."
                     value={projectSearch}
                     onChange={(e) => {
                       setProjectSearch(e.target.value);
                       setProjectSelectedIndex(0);
                     }}
                     onClick={(e) => e.stopPropagation()}
                     onKeyDown={(e) => {
                       if (e.key === 'ArrowUp') {
                         e.preventDefault(); e.stopPropagation();
                         setProjectSelectedIndex(prev => Math.max(0, prev - 1));
                       } else if (e.key === 'ArrowDown') {
                         e.preventDefault(); e.stopPropagation();
                         const maxIdx = projectSearch.trim() && !projects.find(p => p.name.toLowerCase() === projectSearch.toLowerCase().trim()) ? filteredProjects.length : Math.max(0, filteredProjects.length - 1);
                         setProjectSelectedIndex(prev => Math.min(maxIdx, prev + 1));
                       } else if (e.key === 'Enter') {
                         if (e.nativeEvent.isComposing) return;
                         e.preventDefault(); e.stopPropagation();
                         if (filteredProjects.length === 0 && !projectSearch.trim()) {
                           setShowProjectDropdown(false);
                           return;
                         }
                         if (projectSelectedIndex < filteredProjects.length) {
                           moveTask(task.id, filteredProjects[projectSelectedIndex].id);
                         } else if (projectSearch.trim()) {
                           const colors = ['#F06A6A', '#25C26D', '#6A44E1', '#E89A2D', '#2D9CDB'];
                           const color = colors[Math.floor(Math.random() * colors.length)];
                           const newId = crypto.randomUUID();
                           addProject(projectSearch.trim(), color, newId);
                           moveTask(task.id, newId);
                         }
                         setShowProjectDropdown(false);
                         setProjectSearch('');
                         setProjectSelectedIndex(0);
                       }
                     }}
                     style={{
                       width: '100%', padding: '6px 8px', border: 'none',
                       borderBottom: '1px solid var(--border-color)',
                       background: 'transparent', color: 'var(--text-primary)',
                       fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box'
                     }}
                   />
                   <div style={{ overflowY: 'auto', flex: 1 }}>
                     {filteredProjects.map((p, idx) => (
                       <div 
                         key={p.id} className="project-dropdown-item"
                         style={{ 
                           padding: '6px 12px', fontSize: '0.875rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '4px',
                           backgroundColor: projectSelectedIndex === idx ? 'var(--bg-hover)' : 'transparent'
                         }}
                         onClick={() => { moveTask(task.id, p.id); setShowProjectDropdown(false); setProjectSearch(''); }}
                         onMouseEnter={() => setProjectSelectedIndex(idx)}
                       >
                         <span className="color-dot" style={{ backgroundColor: p.color, width: '8px', height: '8px', borderRadius: '50%' }}></span>
                         {p.name}
                       </div>
                     ))}
                     {projectSearch.trim() && !projects.find(p => p.name.toLowerCase() === projectSearch.toLowerCase().trim()) && (
                       <div 
                         className="project-dropdown-item create-new"
                         style={{
                           padding: '6px 12px', fontSize: '0.875rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                           borderRadius: '4px', borderTop: '1px solid var(--border-color)', marginTop: '4px', color: 'var(--brand-solid)', fontWeight: 500,
                           backgroundColor: projectSelectedIndex === filteredProjects.length ? 'var(--bg-hover)' : 'transparent'
                         }}
                         onClick={(e) => {
                           e.stopPropagation();
                           const colors = ['#F06A6A', '#25C26D', '#6A44E1', '#E89A2D', '#2D9CDB'];
                           const color = colors[Math.floor(Math.random() * colors.length)];
                           const newId = crypto.randomUUID();
                           addProject(projectSearch.trim(), color, newId);
                           moveTask(task.id, newId);
                           setShowProjectDropdown(false);
                           setProjectSearch('');
                         }}
                         onMouseEnter={() => setProjectSelectedIndex(filteredProjects.length)}
                       >
                         + "{projectSearch.trim()}" を新規作成
                       </div>
                     )}
                   </div>
                 </div>
               )}
             </div>
          </div>
        );
      }
      case 'tags': {
        const safeTags = tags || [];
        const safeTagIds = task.tagIds || [];
        const taskTags = safeTagIds.map(id => safeTags.find(t => t.id === id)).filter(Boolean) as {id: string, name: string, color: string}[];
        const filteredTags = safeTags.filter(t => 
          t.name.toLowerCase().includes(tagSearch.toLowerCase()) && 
          !safeTagIds.includes(t.id)
        );

        return (
          <div key="tags" className="task-cell cell-tags" tabIndex={0}
            style={{ width: `${columnWidths.tags}px`, minWidth: `${columnWidths.tags}px`, maxWidth: `${columnWidths.tags}px`, flexShrink: 0, flexGrow: 0, position: 'relative', overflow: 'visible' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                setShowTagDropdown(!showTagDropdown);
                setTagSearch('');
              }
            }}
          >
            <div className="tag-selector-wrapper" ref={tagDropdownRef} style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center', width: '100%' }}>
              {taskTags.map(tag => (
                <span 
                  key={tag.id} 
                  className="pill tag-pill" 
                  style={{ backgroundColor: tag.color + '33', color: tag.color, cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveProject(`t-${tag.id}`);
                  }}
                  title={`${tag.name} のタスク一覧を表示`}
                >
                  {tag.name}
                  <button
                    className="tag-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      const newTagIds = safeTagIds.filter(id => id !== tag.id);
                      updateTask(task.id, { tagIds: newTagIds });
                    }}
                    title="タグを削除"
                  >
                    －
                  </button>
                </span>
              ))}
              <button 
                className="add-tag-btn"
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.875rem', padding: '0 4px' }}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTagDropdown(!showTagDropdown);
                  setTagSearch('');
                }}
              >
                +
              </button>

              {showTagDropdown && (
                <div className="tag-dropdown" style={{
                  position: 'absolute', top: '100%', left: 0, zIndex: 10,
                  backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)',
                  borderRadius: '6px', padding: '4px', marginTop: '4px', minWidth: '180px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  maxHeight: '240px', display: 'flex', flexDirection: 'column'
                }}>
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search or create..."
                    value={tagSearch}
                    onChange={(e) => {
                      setTagSearch(e.target.value);
                      setTagSelectedIndex(0);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp') {
                        e.preventDefault(); e.stopPropagation();
                        setTagSelectedIndex(prev => Math.max(0, prev - 1));
                      } else if (e.key === 'ArrowDown') {
                        e.preventDefault(); e.stopPropagation();
                        const maxIdx = tagSearch.trim() && !safeTags.find(t => t.name.toLowerCase() === tagSearch.toLowerCase().trim()) ? filteredTags.length : Math.max(0, filteredTags.length - 1);
                        setTagSelectedIndex(prev => Math.min(maxIdx, prev + 1));
                      } else if (e.key === 'Enter') {
                        if (e.nativeEvent.isComposing) return;
                        e.preventDefault(); e.stopPropagation();
                        if (filteredTags.length === 0 && !tagSearch.trim()) {
                          setShowTagDropdown(false);
                          return;
                        }
                        if (tagSelectedIndex < filteredTags.length) {
                          const existing = filteredTags[tagSelectedIndex];
                          if (!safeTagIds.includes(existing.id)) {
                            updateTask(task.id, { tagIds: [...safeTagIds, existing.id] });
                          }
                        } else if (tagSearch.trim()) {
                          const colors = ['#888888', '#F06A6A', '#25C26D', '#6A44E1', '#E89A2D', '#2D9CDB'];
                          const color = colors[Math.floor(Math.random() * colors.length)];
                          const newId = crypto.randomUUID();
                          addTag(tagSearch.trim(), color, newId);
                          updateTask(task.id, { tagIds: [...safeTagIds, newId] });
                        }
                        setShowTagDropdown(false);
                        setTagSearch('');
                        setTagSelectedIndex(0);
                      }
                    }}
                    style={{
                      width: '100%', padding: '6px 8px', border: 'none',
                      borderBottom: '1px solid var(--border-color)',
                      background: 'transparent', color: 'var(--text-primary)', outline: 'none'
                    }}
                  />
                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    {filteredTags.map((t, idx) => (
                      <div 
                        key={t.id}
                        style={{ 
                          padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem',
                          backgroundColor: tagSelectedIndex === idx ? 'var(--bg-hover)' : 'transparent'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateTask(task.id, { tagIds: [...safeTagIds, t.id] });
                          setShowTagDropdown(false);
                          setTagSearch('');
                        }}
                        onMouseEnter={() => setTagSelectedIndex(idx)}
                      >
                        <span className="color-dot" style={{ backgroundColor: t.color, width: '8px', height: '8px', borderRadius: '50%' }}></span>
                        {t.name}
                      </div>
                    ))}
                    {tagSearch.trim() && !safeTags.find(t => t.name.toLowerCase() === tagSearch.toLowerCase().trim()) && (
                      <div
                        style={{ 
                          padding: '6px 8px', cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--brand-solid)', borderTop: filteredTags.length > 0 ? '1px solid var(--border-color)' : 'none',
                          backgroundColor: tagSelectedIndex === filteredTags.length ? 'var(--bg-hover)' : 'transparent'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          const colors = ['#888888', '#F06A6A', '#25C26D', '#6A44E1', '#E89A2D', '#2D9CDB'];
                          const color = colors[Math.floor(Math.random() * colors.length)];
                          const newId = crypto.randomUUID();
                          addTag(tagSearch.trim(), color, newId);
                          updateTask(task.id, { tagIds: [...safeTagIds, newId] });
                          setShowTagDropdown(false);
                          setTagSearch('');
                        }}
                        onMouseEnter={() => setTagSelectedIndex(filteredTags.length)}
                      >
                        + "{tagSearch.trim()}" を新規作成
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      }
      case 'priority':
        return (
          <div key="priority" className="task-cell cell-priority" tabIndex={0}
            style={{ width: `${columnWidths.priority}px`, minWidth: `${columnWidths.priority}px`, maxWidth: `${columnWidths.priority}px`, flexShrink: 0, flexGrow: 0 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const sel = e.currentTarget.querySelector('select') as HTMLSelectElement;
                if (sel) sel.focus();
              }
            }}
          >
            <select
              value={task.priority}
              onChange={(e) => updateTask(task.id, { priority: e.target.value as any })}
              style={{
                backgroundColor: getPriorityColor(task.priority),
                color: task.priority === 'none' ? 'var(--text-secondary)' : 'white',
                border: task.priority === 'none' ? '1px dashed var(--border-color)' : 'none',
                borderRadius: '12px',
                padding: '2px 8px',
                fontSize: '0.75rem',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
                textAlign: 'center'
              }}
            >
              <option value="none">—</option>
              <option value="1st">1st</option>
              <option value="high">High</option>
              <option value="mid">Mid</option>
              <option value="low">Low</option>
            </select>
          </div>
        );
      case 'date': {
        const displayDate = formatDateDisplay(task.dueDate);
        return (
          <div key="date" className="task-cell cell-date" ref={dateInputRef} tabIndex={0}
            style={{ width: `${columnWidths.date}px`, minWidth: `${columnWidths.date}px`, maxWidth: `${columnWidths.date}px`, flexShrink: 0, flexGrow: 0, position: 'relative' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                setShowDateInput(!showDateInput);
                setDateText('');
              }
            }}
          >
            <span 
              className="date-display-btn"
              onClick={(e) => { e.stopPropagation(); setShowDateInput(!showDateInput); setDateText(''); }}
              style={{ 
                cursor: 'pointer', fontSize: '0.85rem', color: task.dueDate ? 'var(--text-primary)' : 'var(--text-secondary)',
                padding: '2px 6px', borderRadius: '4px', display: 'inline-block',
                border: '1px solid transparent'
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
            >
              {displayDate || '📅 set'}
            </span>
            {showDateInput && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, zIndex: 20,
                backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)',
                borderRadius: '6px', padding: '8px', marginTop: '4px', minWidth: '180px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
              }} onClick={e => e.stopPropagation()}>
                <input
                  autoFocus
                  type="text"
                  placeholder="today, 明日, 3/25..."
                  value={dateText}
                  onChange={(e) => setDateText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const lower = dateText.toLowerCase().trim();
                      if (lower === 'clear' || lower === 'クリア') {
                        handleDateUpdate(null);
                        setShowDateInput(false);
                        setDateText('');
                        return;
                      }
                      const parsed = parseDateText(dateText);
                      if (parsed) {
                        handleDateUpdate(parsed);
                        setShowDateInput(false);
                        setDateText('');
                      }
                    }
                    if (e.key === 'Escape') {
                      setShowDateInput(false);
                    }
                  }}
                  style={{
                    width: '100%', padding: '4px 6px', border: '1px solid var(--border-color)',
                    borderRadius: '4px', background: 'var(--bg-app)', color: 'var(--text-primary)',
                    fontSize: '0.8rem', outline: 'none', marginBottom: '6px', boxSizing: 'border-box'
                  }}
                />
                <input
                  type="date"
                  value={task.dueDate ? task.dueDate.split('T')[0] : ''}
                  onChange={(e) => {
                    handleDateUpdate(e.target.value || null);
                    setShowDateInput(false);
                  }}
                  style={{
                    width: '100%', padding: '4px 6px', border: '1px solid var(--border-color)',
                    borderRadius: '4px', background: 'var(--bg-app)', color: 'var(--text-primary)',
                    fontSize: '0.8rem', cursor: 'pointer', boxSizing: 'border-box'
                  }}
                />
              </div>
            )}
          </div>
        );
      }
      case 'estimatedMinutes':
        return (
          <div key="estimatedMinutes" className="task-cell cell-estimatedMinutes" tabIndex={0}
            style={{ width: `${columnWidths.estimatedMinutes}px`, minWidth: `${columnWidths.estimatedMinutes}px`, maxWidth: `${columnWidths.estimatedMinutes}px`, flexShrink: 0, flexGrow: 0 }}
          >
            <input 
              type="number"
              className="estimated-minutes-input"
              value={task.estimatedMinutes === 0 ? '' : task.estimatedMinutes}
              onChange={e => {
                const val = parseInt(e.target.value, 10);
                updateTask(task.id, { estimatedMinutes: isNaN(val) ? 0 : val });
              }}
              placeholder="0"
              onClick={e => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              style={{
                width: '60px',
                padding: '2px 4px',
                fontSize: '0.75rem',
                outline: 'none',
                border: '1px solid transparent',
                borderRadius: '4px',
                background: 'transparent',
                color: 'var(--text-primary)',
                textAlign: 'center'
              }}
              onMouseEnter={(e) => e.currentTarget.style.border = '1px solid var(--border-color)'}
              onMouseLeave={(e) => e.currentTarget.style.border = '1px solid transparent'}
              title="Estimate in minutes"
              min="0"
            />
          </div>
        );
      case 'createdAt':
        return (
          <div key="createdAt" className="task-cell cell-createdAt" tabIndex={0}
            style={{ width: `${columnWidths.createdAt}px`, minWidth: `${columnWidths.createdAt}px`, maxWidth: `${columnWidths.createdAt}px`, flexShrink: 0, flexGrow: 0 }}
          >
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {task.createdAt ? new Date(task.createdAt).toLocaleDateString('ja-JP') : ''}
            </span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div 
      ref={(node) => {
        setNodeRef(node);
        // @ts-ignore
        rowRef.current = node;
      }} 
      style={rowStyle} 
      {...attributes} 
      {...listeners}
    >
      <div 
        className={rowClasses.join(' ')}
        onClick={handleRowClick}
      >
        {columnOrder.map(colId => renderCell(colId))}
      </div>
    </div>
  );
};

