import React, { useState, useRef, useEffect } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import type { Priority } from '../types';
import type { Recurrence } from '../types';
import { parseDateText, formatDateDisplay } from '../utils/dateParser';
import './TaskDetailView.css';

interface Props {
  taskId: string;
}

const DAYS = ['Su', 'M', 'Tu', 'W', 'Th', 'F', 'Sa'];

export const TaskDetailView: React.FC<Props> = ({ taskId }) => {
  const { 
    tasks, 
    updateTask, 
    addComment,
    updateComment,
    deleteComment,
    addSubtask, 
    toggleSubtask, 
    setSelectedTaskId, 
    projects, 
    moveTask,
    toggleTaskCompletion,
    deleteTask
  } = useTaskStore();
  const task = tasks.find(t => t.id === taskId);
  
  const [newComment, setNewComment] = useState('');
  const [newSubtask, setNewSubtask] = useState('');
  
  const [showDateInput, setShowDateInput] = useState(false);
  const [dateText, setDateText] = useState('');
  const dateInputRef = useRef<HTMLDivElement>(null);

  // Comment editing state
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');

  useEffect(() => {
    const handleClickOutsideDate = (event: MouseEvent) => {
      if (dateInputRef.current && !dateInputRef.current.contains(event.target as Node)) {
        setShowDateInput(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutsideDate);
    return () => document.removeEventListener('mousedown', handleClickOutsideDate);
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedTaskId(null);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [setSelectedTaskId]);

  if (!task) return <div className="task-detail-panel">Task not found</div>;

  const handleUpdateTitle = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateTask(taskId, { title: e.target.value });
  };

  const handleUpdateDescription = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateTask(taskId, { description: e.target.value });
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (newComment.trim()) {
      addComment(taskId, newComment.trim());
      setNewComment('');
    }
  };

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSubtask.trim()) {
      addSubtask(taskId, newSubtask.trim());
      setNewSubtask('');
    }
  };

  const handleToggleRecurrence = (freq: Recurrence['frequency'] | 'none') => {
    if (freq === 'none') {
      updateTask(taskId, { recurrence: null });
    } else {
      const defaultRecurrence: Recurrence = { frequency: freq, interval: 1 };
      if (freq === 'monthly') {
        defaultRecurrence.dayOfMonth = new Date().getDate();
      }
      updateTask(taskId, { recurrence: defaultRecurrence });
    }
  };

  const setSpecificRecurrence = (updates: Partial<Recurrence>) => {
    if (task.recurrence) {
        updateTask(taskId, { recurrence: { ...task.recurrence, ...updates } });
    }
  };

  const toggleDayOfWeek = (day: number) => {
    if (!task.recurrence) return;
    const currentDays = task.recurrence.daysOfWeek || [];
    const newDays = currentDays.includes(day)
      ? currentDays.filter(d => d !== day)
      : [...currentDays, day].sort();
    setSpecificRecurrence({ daysOfWeek: newDays });
  };

  // Sort projects alphabetically, blank last
  const sortedProjects = [...projects]
    .filter(p => p.id !== 'p1')
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  return (
    <div className="task-detail-panel">
      <div className="detail-header">
        <button className="close-btn" onClick={() => setSelectedTaskId(null)}>✕ Close</button>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button 
            className={`complete-btn-large ${task.completed ? 'completed' : ''}`}
            onClick={() => toggleTaskCompletion(taskId)}
          >
            {task.completed ? '✓ Completed' : 'Mark Complete'}
          </button>
          <button
            className="delete-task-btn"
            onClick={() => {
              if (window.confirm('このタスクを削除しますか？')) {
                deleteTask(taskId);
                setSelectedTaskId(null);
              }
            }}
            style={{
              background: 'none', border: '1px solid var(--priority-high)', 
              color: 'var(--priority-high)', padding: '6px 12px', borderRadius: '6px',
              cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600
            }}
          >
            🗑️ Delete
          </button>
        </div>
      </div>

      <div className="detail-body">
        <input 
          className="detail-title-input" 
          value={task.title} 
          onChange={handleUpdateTitle}
          placeholder="Task Title"
        />

        <div className="detail-fields">
          <div className="field-group">
            <label>Project</label>
            <div className="field-value">
               <select 
                 value={task.projectId || ''} 
                 onChange={(e) => moveTask(task.id, e.target.value || null)}
               >
                 {sortedProjects.map(p => (
                   <option key={p.id} value={p.id}>{p.name}</option>
                 ))}
                 <option value="">No Project</option>
               </select>
            </div>
          </div>

          <div className="field-group">
            <label>Priority</label>
            <div className="field-value">
              <select 
                value={task.priority} 
                onChange={(e) => updateTask(taskId, { priority: e.target.value as Priority })}
                style={{
                  backgroundColor: task.priority === 'none' ? 'transparent' : `var(--priority-${task.priority})`,
                  color: task.priority === 'none' ? 'var(--text-primary)' : 'white',
                  fontWeight: 600,
                  borderRadius: '4px',
                  padding: '4px 8px',
                  border: task.priority === 'none' ? '1px dashed var(--border-color)' : 'none'
                }}
              >
                <option value="none" style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-surface)' }}>None</option>
                <option value="1st" style={{ color: 'white', backgroundColor: 'var(--priority-1st)' }}>1st</option>
                <option value="high" style={{ color: 'white', backgroundColor: 'var(--priority-high)' }}>High</option>
                <option value="mid" style={{ color: 'white', backgroundColor: 'var(--priority-mid)' }}>Mid</option>
                <option value="low" style={{ color: 'white', backgroundColor: 'var(--priority-low)' }}>Low</option>
              </select>
            </div>
          </div>

          <div className="field-group">
            <label>Estimated Time (m)</label>
            <div className="field-value">
              <input 
                type="number" 
                min="0"
                value={task.estimatedMinutes === 0 ? '' : task.estimatedMinutes} 
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  updateTask(taskId, { estimatedMinutes: isNaN(val) ? 0 : val });
                }}
                placeholder="0"
                style={{
                  width: '80px',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-app)',
                  color: 'var(--text-primary)'
                }}
              />
            </div>
          </div>

          <div className="field-group">
            <label>Due Date</label>
            <div className="field-value" ref={dateInputRef} style={{ position: 'relative' }}>
              <span 
                onClick={() => { setShowDateInput(!showDateInput); setDateText(''); }}
                style={{ 
                  cursor: 'pointer', padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--border-color)',
                  display: 'inline-block', minWidth: '140px', background: 'var(--bg-app)',
                  color: task.dueDate ? 'var(--text-primary)' : 'var(--text-secondary)'
                }}
              >
                {task.dueDate ? formatDateDisplay(task.dueDate) : '📅 Set Date'}
              </span>
              {showDateInput && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, zIndex: 20,
                  backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)',
                  borderRadius: '6px', padding: '8px', marginTop: '4px', minWidth: '220px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                }}>
                  <input
                    autoFocus
                    type="text"
                    placeholder="today, 明日, 3/25, 月曜..."
                    value={dateText}
                    onChange={(e) => setDateText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const lower = dateText.toLowerCase().trim();
                        if (lower === 'clear' || lower === 'クリア') {
                          updateTask(taskId, { dueDate: null });
                          setShowDateInput(false);
                          setDateText('');
                          return;
                        }
                        const parsed = parseDateText(dateText);
                        if (parsed) {
                          updateTask(taskId, { dueDate: parsed });
                          setShowDateInput(false);
                          setDateText('');
                        }
                      }
                      if (e.key === 'Escape') {
                        setShowDateInput(false);
                      }
                    }}
                    style={{
                      width: '100%', padding: '6px 8px', border: '1px solid var(--border-color)',
                      borderRadius: '4px', background: 'var(--bg-app)', color: 'var(--text-primary)',
                      fontSize: '0.85rem', outline: 'none', marginBottom: '8px', boxSizing: 'border-box'
                    }}
                  />
                  <input
                    type="date"
                    value={task.dueDate ? task.dueDate.split('T')[0] : ''}
                    onChange={(e) => {
                      updateTask(taskId, { dueDate: e.target.value || null });
                      setShowDateInput(false);
                    }}
                    style={{
                      width: '100%', padding: '6px 8px', border: '1px solid var(--border-color)',
                      borderRadius: '4px', background: 'var(--bg-app)', color: 'var(--text-primary)',
                      fontSize: '0.85rem', cursor: 'pointer', boxSizing: 'border-box'
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="field-group recurrence-field">
            <label>Recurrence</label>
            <div className="field-value">
              <select 
                value={task.recurrence?.frequency || 'none'} 
                onChange={(e) => handleToggleRecurrence(e.target.value as any)}
              >
                <option value="none">None</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
              
              {task.recurrence && (
                <div className="recurrence-custom-options">
                  <div className="interval-setting">
                    Every <input 
                      type="number" 
                      min="1" 
                      value={task.recurrence.interval} 
                      onChange={(e) => setSpecificRecurrence({ interval: parseInt(e.target.value) || 1 })}
                    /> {task.recurrence.frequency}(s)
                  </div>

                  {(task.recurrence.frequency === 'daily' || task.recurrence.frequency === 'weekly') && (
                    <div className="day-selector">
                      {DAYS.map((name, index) => (
                        <button
                          key={name}
                          className={`day-btn ${task.recurrence?.daysOfWeek?.includes(index) ? 'active' : ''}`}
                          onClick={() => toggleDayOfWeek(index)}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  )}

                  {task.recurrence.frequency === 'monthly' && (
                    <div className="monthly-specifics">
                      <div className="monthly-option">
                        <input 
                          type="radio" 
                          id="monthly-day"
                          name="monthly-type" 
                          checked={!!task.recurrence.dayOfMonth} 
                          onChange={() => setSpecificRecurrence({ dayOfMonth: 1, weekOfMonth: undefined, daysOfWeek: undefined })}
                        />
                        <label htmlFor="monthly-day">On day</label>
                        <input 
                          type="number" 
                          min="1" max="31" 
                          value={task.recurrence.dayOfMonth || 1} 
                          onChange={(e) => setSpecificRecurrence({ dayOfMonth: parseInt(e.target.value) || 1 })}
                          disabled={!task.recurrence.dayOfMonth}
                        />
                      </div>
                      <div className="monthly-option">
                        <input 
                          type="radio" 
                          id="monthly-week"
                          name="monthly-type" 
                          checked={!!task.recurrence.weekOfMonth} 
                          onChange={() => setSpecificRecurrence({ dayOfMonth: undefined, weekOfMonth: 1, daysOfWeek: [1] })}
                        />
                        <label htmlFor="monthly-week">On the</label>
                        <select 
                          value={task.recurrence.weekOfMonth || 1} 
                          onChange={(e) => setSpecificRecurrence({ weekOfMonth: parseInt(e.target.value) })}
                          disabled={!task.recurrence.weekOfMonth}
                        >
                          <option value="1">1st</option>
                          <option value="2">2nd</option>
                          <option value="3">3rd</option>
                          <option value="4">4th</option>
                          <option value="-1">Last</option>
                        </select>
                        <select 
                          value={task.recurrence.daysOfWeek?.[0] || 1} 
                          onChange={(e) => setSpecificRecurrence({ daysOfWeek: [parseInt(e.target.value)] })}
                          disabled={!task.recurrence.weekOfMonth}
                        >
                          <option value="0">Sunday</option>
                          <option value="1">Monday</option>
                          <option value="2">Tuesday</option>
                          <option value="3">Wednesday</option>
                          <option value="4">Thursday</option>
                          <option value="5">Friday</option>
                          <option value="6">Saturday</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="detail-section">
          <h3>Description</h3>
          <textarea 
            className="detail-description-area"
            value={task.description}
            onChange={handleUpdateDescription}
            placeholder="Add more detail to this task..."
          />
        </div>

        <div className="detail-section">
          <h3>Subtasks</h3>
          <div className="subtask-list">
            {task.subtasks.map(st => (
              <div key={st.id} className="subtask-item">
                <input 
                  type="checkbox" 
                  checked={st.completed} 
                  onChange={() => toggleSubtask(taskId, st.id)} 
                />
                <span className={st.completed ? 'completed' : ''}>{st.title}</span>
              </div>
            ))}
            <form onSubmit={handleAddSubtask} className="add-subtask-form">
              <input 
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                placeholder="Add subtask..."
              />
            </form>
          </div>
        </div>

        <div className="detail-section">
          <h3>Comments</h3>
          <div className="comment-list">
            {task.comments.map(c => (
              <div key={c.id} className="comment-item">
                <div className="comment-meta">
                  <span className="comment-user">{c.userName}</span>
                  <span className="comment-date">{new Date(c.createdAt).toLocaleString()}</span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => {
                        setEditingCommentId(c.id);
                        setEditCommentText(c.text);
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.75rem', padding: '2px 6px' }}
                      title="Edit comment"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('このコメントを削除しますか？')) {
                          deleteComment(taskId, c.id);
                        }
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--priority-high)', fontSize: '0.75rem', padding: '2px 6px' }}
                      title="Delete comment"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                {editingCommentId === c.id ? (
                  <div style={{ marginTop: '4px' }}>
                    <textarea
                      autoFocus
                      value={editCommentText}
                      onChange={(e) => setEditCommentText(e.target.value)}
                      style={{
                        width: '100%', minHeight: '60px', padding: '8px',
                        border: '1px solid var(--border-color)', borderRadius: '4px',
                        background: 'var(--bg-app)', color: 'var(--text-primary)',
                        fontSize: '0.85rem', resize: 'vertical', boxSizing: 'border-box'
                      }}
                    />
                    <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                      <button
                        onClick={() => {
                          if (editCommentText.trim()) {
                            updateComment(taskId, c.id, editCommentText.trim());
                          }
                          setEditingCommentId(null);
                        }}
                        style={{
                          padding: '4px 12px', borderRadius: '4px', border: 'none',
                          background: 'var(--brand-solid)', color: 'white', cursor: 'pointer', fontSize: '0.8rem'
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingCommentId(null)}
                        style={{
                          padding: '4px 12px', borderRadius: '4px', border: '1px solid var(--border-color)',
                          background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem'
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="comment-text">{c.text}</div>
                )}
              </div>
            ))}
          </div>
          <form onSubmit={handleAddComment} className="add-comment-form">
            <textarea 
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Ask a question or post an update..."
            />
            <button type="submit" disabled={!newComment.trim()}>Comment</button>
          </form>
        </div>
      </div>
    </div>
  );
};
