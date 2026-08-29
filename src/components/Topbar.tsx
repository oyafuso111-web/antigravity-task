import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import { addDays, isToday, isTomorrow, isBefore, startOfDay, parseISO } from 'date-fns';
import type { Task, Project, Priority } from '../types';
import './Topbar.css';

type SearchResult =
  | { kind: 'task'; task: Task; matchField?: string }
  | { kind: 'project'; project: Project };

export const Topbar: React.FC = () => {
  const { activeTab, setActiveTab, setSettingsOpen, addTask, activeProjectId, projects, tasks, setActiveProject, setHighlightedTaskId, setTimelineJumpTaskId, selectedTaskId, setSelectedTaskId, user, signInWithGoogle, showCompleted, toggleShowCompleted, isProjectDetailOpen, setProjectDetailOpen } = useTaskStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchHighlightIndex, setSearchHighlightIndex] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);

  // Add Task Modal state
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalDueDate, setModalDueDate] = useState('');
  const [modalPriority, setModalPriority] = useState<Priority>('none');
  const [modalEstimatedMinutes, setModalEstimatedMinutes] = useState<number>(0);
  const modalTitleRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const getPageTitle = () => {
    if (activeProjectId === 'p1') return 'INBOX';
    if (activeProjectId === 'p-wont-do') return 'やらない';
    if (activeProjectId === 'p-do-later') return '来週以降にやる';
    if (activeProjectId === 'p-waiting') return '連絡待ち';
    if (activeProjectId === 'p-today') return '本日';
    if (activeProjectId === 'p-tomorrow') return '明日';
    if (activeProjectId === 'p-dayafter') return '明後日';
    if (activeProjectId === 'p-dayafter2') return '明々後日';
    if (activeProjectId === 'p-thisweek') return '今週';
    if (activeProjectId === 'p-nextweek') return '来週以降';
    if (activeProjectId === 'p-no-date') return '期日未設定';
    if (activeProjectId === 'completed') return '完了したタスク';
    if (activeProjectId?.startsWith('t-')) {
      const tagId = activeProjectId.slice(2);
      const tag = useTaskStore.getState().tags.find(t => t.id === tagId);
      return tag ? `# ${tag.name}` : 'My Tasks';
    }
    const project = projects.find(p => p.id === activeProjectId);
    return project ? project.name : 'My Tasks';
  };

  const searchResults = useMemo((): SearchResult[] => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const matchedProjects: SearchResult[] = projects
      .filter(p => p.id !== 'p1' && p.name.toLowerCase().includes(q))
      .slice(0, 4)
      .map(p => ({ kind: 'project', project: p }));
    const matchedTasks: SearchResult[] = tasks
      .filter(t => {
        if (t.title.toLowerCase().includes(q)) return true;
        if (t.description && t.description.toLowerCase().includes(q)) return true;
        if (t.subtasks && t.subtasks.some(st => st.title.toLowerCase().includes(q))) return true;
        if (t.comments && t.comments.some(c => c.text.toLowerCase().includes(q))) return true;
        return false;
      })
      .sort((a, b) => {
        // 1) Incomplete tasks first, then completed
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (!a.completed) {
          // 2) Incomplete: sort by dueDate descending (null = last)
          if (a.dueDate && b.dueDate) return b.dueDate.localeCompare(a.dueDate);
          if (a.dueDate && !b.dueDate) return -1;
          if (!a.dueDate && b.dueDate) return 1;
          return 0;
        } else {
          // 3) Completed: sort by createdAt descending (proxy for completion date)
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        }
      })
      .slice(0, 8)
      .map(t => {
        // Determine which field matched for display hint
        let matchField: string | undefined;
        if (!t.title.toLowerCase().includes(q)) {
          if (t.description && t.description.toLowerCase().includes(q)) {
            matchField = 'Description';
          } else if (t.subtasks && t.subtasks.some(st => st.title.toLowerCase().includes(q))) {
            matchField = 'Subtask';
          } else if (t.comments && t.comments.some(c => c.text.toLowerCase().includes(q))) {
            matchField = 'Comment';
          }
        }
        return { kind: 'task', task: t, matchField };
      });
    return [...matchedProjects, ...matchedTasks];
  }, [searchQuery, tasks, projects]);

  useEffect(() => {
    setTimeout(() => {
      setSearchHighlightIndex(0);
    }, 0);
  }, [searchQuery]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Determine which view a task belongs to and navigate there
  const getTaskViewId = (task: Task): string => {
    if (task.completed) return 'completed';

    if (task.dueDate) {
      const getSafeDate = (d: string) =>
        d.length === 10 ? (() => { const [y, m, day] = d.split('-').map(Number); return new Date(y, m - 1, day); })() : parseISO(d);
      const taskDate = getSafeDate(task.dueDate);
      const today = startOfDay(new Date());
      const sevenDaysLater = addDays(today, 7);
      if (isToday(taskDate) || isBefore(taskDate, today)) return 'p-today';
      if (isTomorrow(taskDate)) return 'p-tomorrow';
      const dayAfterTomorrow = addDays(today, 2);
      const twoDaysAfterTomorrow = addDays(today, 3);
      if (taskDate >= dayAfterTomorrow && taskDate < twoDaysAfterTomorrow) return 'p-dayafter';
      if (taskDate >= twoDaysAfterTomorrow && taskDate < addDays(today, 4)) return 'p-dayafter2';
      if (taskDate >= today && taskDate < sevenDaysLater) return 'p-thisweek';
      return 'p-nextweek';
    }

    // No due date – use homeBucket
    if (task.homeBucket === 'waiting') return 'p-waiting';
    if (task.homeBucket === 'wont-do') return 'p-wont-do';
    if (task.homeBucket === 'do-later') return 'p-do-later';
    if (task.homeBucket === 'memo') return 'p-memo';
    if (task.projectId) return 'p-no-date';
    return 'p1'; // inbox
  };

  const navigateToTask = (task: Task) => {
    // If currently viewing the timeline, jump within the timeline instead of navigating away
    if (activeTab === 'timeline') {
      setSearchQuery('');
      setShowSearchDropdown(false);
      setTimelineJumpTaskId(task.id);
      // If detail panel is open, switch it to the selected task
      if (selectedTaskId) {
        setSelectedTaskId(task.id);
      }
      return;
    }

    const viewId = getTaskViewId(task);
    setActiveProject(viewId);
    setActiveTab('list');
    setSearchQuery('');
    setShowSearchDropdown(false);

    // If detail panel is open, switch it to the selected task
    if (selectedTaskId) {
      setSelectedTaskId(task.id);
    }

    // Highlight after a brief delay so the view renders first
    setTimeout(() => {
      setHighlightedTaskId(task.id);
      // Auto-clear highlight after 2.5 s
      setTimeout(() => setHighlightedTaskId(null), 2500);
    }, 80);
  };

  const navigateToProject = (project: Project) => {
    setActiveProject(project.id);
    setActiveTab('list');
    setSearchQuery('');
    setShowSearchDropdown(false);
  };

  const handleSearchResultSelect = (result: SearchResult) => {
    if (result.kind === 'task') {
      navigateToTask(result.task);
    } else {
      navigateToProject(result.project);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setShowSearchDropdown(false);
      setSearchQuery('');
      return;
    }
    if (!showSearchDropdown || searchResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSearchHighlightIndex(i => Math.min(i + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSearchHighlightIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults[searchHighlightIndex]) {
        handleSearchResultSelect(searchResults[searchHighlightIndex]);
      }
    }
  };

  const openAddTaskModal = () => {
    const now = new Date();
    const getLocalDateStr = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    // Pre-fill date based on current view
    let defaultDate = '';
    if (activeProjectId === 'p-today') defaultDate = getLocalDateStr(now);
    else if (activeProjectId === 'p-tomorrow') defaultDate = getLocalDateStr(addDays(now, 1));
    else if (activeProjectId === 'p-dayafter') defaultDate = getLocalDateStr(addDays(now, 2));
    else if (activeProjectId === 'p-dayafter2') defaultDate = getLocalDateStr(addDays(now, 3));
    else if (activeProjectId === 'p-thisweek') defaultDate = getLocalDateStr(now);
    else if (activeProjectId === 'p-nextweek') defaultDate = getLocalDateStr(addDays(now, 7));

    setModalTitle('');
    setModalDueDate(defaultDate);
    setModalPriority('none');
    setModalEstimatedMinutes(0);
    setShowAddTaskModal(true);
    setTimeout(() => modalTitleRef.current?.focus(), 50);
  };

  const handleModalSubmit = useCallback(() => {
    if (!modalTitle.trim()) return;
    const dueDate = modalDueDate || null;

    let homeBucket: 'inbox' | 'memo' | 'waiting' | 'wont-do' | 'do-later' | null = null;
    if (!dueDate) {
      if (activeProjectId === 'p-memo') homeBucket = 'memo';
      else if (activeProjectId === 'p-waiting') homeBucket = 'waiting';
      else if (activeProjectId === 'p-wont-do') homeBucket = 'wont-do';
      else if (activeProjectId === 'p-do-later') homeBucket = 'do-later';
      else if (activeProjectId === 'p1') homeBucket = 'inbox';
    }

    addTask({
      title: modalTitle.trim(),
      projectId: (activeProjectId === 'p1' || activeProjectId?.startsWith('p-') || activeProjectId?.startsWith('t-')) ? null : activeProjectId,
      completed: false,
      priority: modalPriority,
      estimatedMinutes: modalEstimatedMinutes || 0,
      tagIds: [],
      dueDate,
      homeBucket,
    });
    setShowAddTaskModal(false);
  }, [modalTitle, modalDueDate, modalPriority, modalEstimatedMinutes, activeProjectId, addTask]);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1 key={activeProjectId} className="page-title title-enter">{getPageTitle()}</h1>
        <div className="tabs">
          <button className={`tab ${activeTab === 'list' ? 'active' : ''}`} onClick={() => setActiveTab('list')}>List</button>
          <button className={`tab ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>Calendar</button>
          <button className={`tab ${activeTab === 'timeline' ? 'active' : ''}`} onClick={() => setActiveTab('timeline')}>Timeline</button>
          <button className={`tab ${activeTab === 'calendar2' ? 'active' : ''}`} onClick={() => setActiveTab('calendar2')}>Time Tracker</button>
          <button className={`tab ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>Reports</button>
        </div>
      </div>

      <div className="topbar-right">
        {/* Project Detail Button (only for real projects) */}
        {activeProjectId && !activeProjectId.startsWith('p-') && activeProjectId !== 'p1' && activeProjectId !== 'completed' && !activeProjectId.startsWith('t-') && projects.some(p => p.id === activeProjectId) && (
          <button
            id="project-detail-btn"
            className={`toggle-completed-btn ${isProjectDetailOpen ? 'active' : ''}`}
            onClick={() => setProjectDetailOpen(!isProjectDetailOpen)}
            title={isProjectDetailOpen ? 'プロジェクト詳細を閉じる' : 'プロジェクト詳細を開く'}
            style={isProjectDetailOpen ? { borderColor: 'var(--brand-solid)', color: 'var(--brand-solid)', background: 'linear-gradient(135deg, rgba(106,68,225,0.12), rgba(106,68,225,0.06))' } : {}}
          >
            <span className="toggle-completed-icon">📋</span>
            <span className="toggle-completed-label">{isProjectDetailOpen ? '詳細を閉じる' : 'プロジェクト詳細'}</span>
          </button>
        )}

        {/* Toggle Completed Tasks */}
        <button
          id="toggle-completed-btn"
          className={`toggle-completed-btn ${showCompleted ? 'active' : ''}`}
          onClick={toggleShowCompleted}
          title={showCompleted ? '完了タスクを非表示' : '完了タスクを表示'}
        >
          <span className="toggle-completed-icon">✓</span>
          <span className="toggle-completed-label">{showCompleted ? '完了を非表示' : '完了を表示'}</span>
        </button>

        {/* Search Bar */}
        <div className="search-wrapper" ref={searchRef}>
          <div className={`search-input-container ${showSearchDropdown && (searchResults.length > 0 || searchQuery.trim()) ? 'open' : ''}`}>
            <span className="search-icon">🔍</span>
            <input
              ref={searchInputRef}
              type="text"
              className="search-input"
              placeholder="タスク・プロジェクトを検索..."
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setShowSearchDropdown(true);
              }}
              onFocus={() => {
                if (searchQuery.trim()) setShowSearchDropdown(true);
              }}
              onKeyDown={handleSearchKeyDown}
            />
            {searchQuery && (
              <button
                className="search-clear-btn"
                onClick={() => {
                  setSearchQuery('');
                  setShowSearchDropdown(false);
                  searchInputRef.current?.focus();
                }}
              >
                ×
              </button>
            )}
          </div>

          {showSearchDropdown && searchResults.length > 0 && (
            <div className="search-dropdown">
              {/* Project results section */}
              {searchResults.some(r => r.kind === 'project') && (
                <div className="search-section-label">プロジェクト</div>
              )}
              {searchResults.map((result, idx) => {
                if (result.kind === 'project') {
                  const p = result.project;
                  return (
                    <div
                      key={`proj-${p.id}`}
                      className={`search-result-item ${idx === searchHighlightIndex ? 'highlighted' : ''}`}
                      onClick={() => handleSearchResultSelect(result)}
                      onMouseEnter={() => setSearchHighlightIndex(idx)}
                      title={p.name}
                    >
                      <span className="search-result-kind-icon">📁</span>
                      <span className="search-result-title">
                        {p.name}
                      </span>
                      <span className="search-result-project" style={{ color: p.color }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: p.color, display: 'inline-block' }} />
                      </span>
                    </div>
                  );
                }
                return null;
              })}
              {/* Task results section */}
              {searchResults.some(r => r.kind === 'task') && (
                <div className="search-section-label">タスク</div>
              )}
              {searchResults.map((result, idx) => {
                if (result.kind === 'task') {
                  const task = result.task;
                  const matchField = result.matchField;
                  const taskProject = projects.find(p => p.id === task.projectId);
                  return (
                    <div
                      key={`task-${task.id}`}
                      className={`search-result-item ${idx === searchHighlightIndex ? 'highlighted' : ''}`}
                      onClick={() => handleSearchResultSelect(result)}
                      onMouseEnter={() => setSearchHighlightIndex(idx)}
                      title={`${task.title}${task.dueDate ? `  📅 ${task.dueDate.slice(0, 10).replace(/-/g, '/')}` : ''}${taskProject ? `  📁 ${taskProject.name}` : ''}`}
                    >
                      <span className="search-result-kind-icon" style={{ opacity: task.completed ? 0.5 : 0.7 }}>{task.completed ? '✅' : '☐'}</span>
                      <span
                        className="search-result-title"
                        style={{ textDecoration: task.completed ? 'line-through' : 'none', opacity: task.completed ? 0.6 : 1 }}
                      >
                        {task.title}
                      </span>
                      {task.dueDate && (
                        <span style={{
                          fontSize: '0.7rem',
                          padding: '1px 6px',
                          borderRadius: '3px',
                          backgroundColor: 'var(--bg-hover)',
                          color: 'var(--text-secondary)',
                          flexShrink: 0,
                          whiteSpace: 'nowrap'
                        }}>
                          📅 {task.dueDate.slice(0, 10).replace(/-/g, '/')}
                        </span>
                      )}
                      {matchField && (
                        <span style={{
                          fontSize: '0.65rem',
                          padding: '1px 6px',
                          borderRadius: '3px',
                          backgroundColor: 'var(--bg-hover)',
                          color: 'var(--text-secondary)',
                          flexShrink: 0,
                          whiteSpace: 'nowrap'
                        }}>
                          {matchField}
                        </span>
                      )}
                      {taskProject && (
                        <span className="search-result-project" style={{ color: taskProject.color }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: taskProject.color, display: 'inline-block', marginRight: '4px' }} />
                          {taskProject.name}
                        </span>
                      )}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          )}

          {showSearchDropdown && searchQuery.trim() && searchResults.length === 0 && (
            <div className="search-dropdown">
              <div className="search-empty">「{searchQuery}」に一致する結果が見つかりません</div>
            </div>
          )}
        </div>

        <button className="brand-bg brand-btn" onClick={openAddTaskModal}>+ Add Task</button>
        {user ? (
          <div className="user-avatar logged-in" onClick={() => setSettingsOpen(true)} title="Settings & Sync" style={{ cursor: 'pointer', padding: 0, overflow: 'hidden' }}>
            <img src={user.user_metadata.avatar_url} alt="avatar" style={{width: '100%', height: '100%', objectFit: 'cover'}} />
          </div>
        ) : (
          <div className="user-avatar" onClick={() => signInWithGoogle()} title="Googleでログイン" style={{ cursor: 'pointer' }}>
            👤
          </div>
        )}
      </div>

      {/* Add Task Modal */}
      {showAddTaskModal && (
        <div
          className="add-task-modal-overlay"
          onClick={() => setShowAddTaskModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            backgroundColor: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(2px)',
          }}
        >
          <div
            className="add-task-modal"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Escape') setShowAddTaskModal(false);
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleModalSubmit();
              }
            }}
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '24px',
              width: '460px',
              maxWidth: '90vw',
              boxShadow: '0 16px 48px rgba(0,0,0,0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>新規タスク作成</h3>

            {/* Title */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>タスク名 *</label>
              <input
                ref={modalTitleRef}
                type="text"
                value={modalTitle}
                onChange={e => setModalTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    handleModalSubmit();
                  }
                }}
                placeholder="タスクのタイトルを入力..."
                style={{
                  padding: '10px 12px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-app)',
                  color: 'var(--text-primary)',
                  fontSize: '0.95rem',
                  outline: 'none',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--brand-solid)'}
                onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
              />
            </div>

            {/* Row: Due Date + Priority */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>期日</label>
                <input
                  type="date"
                  value={modalDueDate}
                  onChange={e => setModalDueDate(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    backgroundColor: 'var(--bg-app)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    outline: 'none',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--brand-solid)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
                />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>優先度</label>
                <select
                  value={modalPriority}
                  onChange={e => setModalPriority(e.target.value as Priority)}
                  style={{
                    padding: '8px 10px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    backgroundColor: modalPriority === 'none' ? 'var(--bg-app)' : `var(--priority-${modalPriority})`,
                    color: modalPriority === 'none' ? 'var(--text-primary)' : 'white',
                    fontSize: '0.85rem',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--brand-solid)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
                >
                  <option value="none" style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-surface)' }}>—</option>
                  <option value="1st" style={{ color: 'white', backgroundColor: 'var(--priority-1st)' }}>1st</option>
                  <option value="quick" style={{ color: 'white', backgroundColor: 'var(--priority-quick)' }}>すぐ終わる</option>
                  <option value="high" style={{ color: 'white', backgroundColor: 'var(--priority-high)' }}>High</option>
                  <option value="mid" style={{ color: 'white', backgroundColor: 'var(--priority-mid)' }}>Mid</option>
                  <option value="low" style={{ color: 'white', backgroundColor: 'var(--priority-low)' }}>Low</option>
                </select>
              </div>
            </div>

            {/* Estimated Minutes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>見込み時間（分）</label>
              <input
                type="number"
                min={0}
                value={modalEstimatedMinutes || ''}
                onChange={e => setModalEstimatedMinutes(parseInt(e.target.value, 10) || 0)}
                placeholder="0"
                style={{
                  padding: '8px 10px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-app)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  outline: 'none',
                  width: '120px',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--brand-solid)'}
                onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
              />
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
              <button
                onClick={() => setShowAddTaskModal(false)}
                style={{
                  padding: '8px 18px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  backgroundColor: 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >キャンセル</button>
              <button
                onClick={handleModalSubmit}
                disabled={!modalTitle.trim()}
                style={{
                  padding: '8px 24px',
                  border: 'none',
                  borderRadius: '8px',
                  background: modalTitle.trim() ? 'var(--brand-solid)' : 'var(--border-color)',
                  color: 'white',
                  fontSize: '0.85rem',
                  cursor: modalTitle.trim() ? 'pointer' : 'not-allowed',
                  fontWeight: 700,
                  transition: 'opacity 0.15s',
                }}
              >作成</button>
            </div>

            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textAlign: 'right', marginTop: '-8px' }}>
              Enter で作成 ・ Esc でキャンセル
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
