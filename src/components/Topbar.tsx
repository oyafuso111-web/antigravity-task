import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import { addDays, isToday, isTomorrow, isBefore, startOfDay, parseISO } from 'date-fns';
import type { Task } from '../types';
import './Topbar.css';

export const Topbar: React.FC = () => {
  const { activeTab, setActiveTab, setSettingsOpen, addTask, activeProjectId, projects, tasks, setActiveProject, setHighlightedTaskId, setTimelineJumpTaskId, user, signInWithGoogle } = useTaskStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchHighlightIndex, setSearchHighlightIndex] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const getPageTitle = () => {
    if (activeProjectId === 'p1') return 'INBOX';
    if (activeProjectId === 'p-wont-do') return 'やらない';
    if (activeProjectId === 'p-do-later') return '来週以降にやる';
    if (activeProjectId === 'p-waiting') return '連絡待ち';
    if (activeProjectId === 'p-today') return '本日';
    if (activeProjectId === 'p-tomorrow') return '明日';
    if (activeProjectId === 'p-thisweek') return '今週';
    if (activeProjectId === 'p-nextweek') return '来週以降';
    if (activeProjectId === 'completed') return '完了したタスク';
    if (activeProjectId?.startsWith('t-')) {
      const tagId = activeProjectId.slice(2);
      const tag = useTaskStore.getState().tags.find(t => t.id === tagId);
      return tag ? `# ${tag.name}` : 'My Tasks';
    }
    const project = projects.find(p => p.id === activeProjectId);
    return project ? project.name : 'My Tasks';
  };

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return tasks
      .filter(t => t.title.toLowerCase().includes(q))
      .slice(0, 8);
  }, [searchQuery, tasks]);

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
      if (taskDate >= today && taskDate < sevenDaysLater) return 'p-thisweek';
      return 'p-nextweek';
    }

    // No due date – use homeBucket
    if (task.homeBucket === 'waiting') return 'p-waiting';
    if (task.homeBucket === 'wont-do') return 'p-wont-do';
    if (task.homeBucket === 'do-later') return 'p-do-later';
    if (task.homeBucket === 'memo') return 'p-memo';
    if (task.projectId) return task.projectId;
    return 'p1'; // inbox
  };

  const navigateToTask = (task: Task) => {
    // If currently viewing the timeline, jump within the timeline instead of navigating away
    if (activeTab === 'timeline') {
      setSearchQuery('');
      setShowSearchDropdown(false);
      setTimelineJumpTaskId(task.id);
      return;
    }

    const viewId = getTaskViewId(task);
    setActiveProject(viewId);
    setActiveTab('list');
    setSearchQuery('');
    setShowSearchDropdown(false);

    // Highlight after a brief delay so the view renders first
    setTimeout(() => {
      setHighlightedTaskId(task.id);
      // Auto-clear highlight after 2.5 s
      setTimeout(() => setHighlightedTaskId(null), 2500);
    }, 80);
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
        navigateToTask(searchResults[searchHighlightIndex]);
      }
    }
  };

  const handleGlobalAddTask = () => {
    const title = window.prompt('Enter new task title:');
    if (title && title.trim()) {
      const now = new Date();
      const getLocalDateStr = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };

      let dueDate: string | null = null;
      if (activeProjectId === 'p-today') {
        dueDate = getLocalDateStr(now);
      } else if (activeProjectId === 'p-tomorrow') {
        dueDate = getLocalDateStr(addDays(now, 1));
      } else if (activeProjectId === 'p-thisweek') {
        dueDate = getLocalDateStr(now);
      } else if (activeProjectId === 'p-nextweek') {
        dueDate = getLocalDateStr(addDays(now, 7));
      }

      addTask({
        title: title.trim(),
        projectId: (activeProjectId === 'p1' || activeProjectId?.startsWith('p-')) ? null : activeProjectId,
        completed: false,
        priority: 'none',
        tagIds: [],
        dueDate: dueDate,
        homeBucket: dueDate ? null : 'inbox',
      });
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1 className="page-title">{getPageTitle()}</h1>
        <div className="tabs">
          <button className={`tab ${activeTab === 'list' ? 'active' : ''}`} onClick={() => setActiveTab('list')}>List</button>
          <button className={`tab ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>Calendar</button>
          <button className={`tab ${activeTab === 'calendar2' ? 'active' : ''}`} onClick={() => setActiveTab('calendar2')}>Time Tracker</button>
          <button className={`tab ${activeTab === 'timeline' ? 'active' : ''}`} onClick={() => setActiveTab('timeline')}>Timeline</button>
          <button className={`tab ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>Reports</button>
        </div>
      </div>

      <div className="topbar-right">
        {/* Search Bar */}
        <div className="search-wrapper" ref={searchRef}>
          <div className={`search-input-container ${showSearchDropdown && (searchResults.length > 0 || searchQuery.trim()) ? 'open' : ''}`}>
            <span className="search-icon">🔍</span>
            <input
              ref={searchInputRef}
              type="text"
              className="search-input"
              placeholder="タスクを検索..."
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
              {searchResults.map((task, idx) => {
                const taskProject = projects.find(p => p.id === task.projectId);
                return (
                  <div
                    key={task.id}
                    className={`search-result-item ${idx === searchHighlightIndex ? 'highlighted' : ''}`}
                    onClick={() => navigateToTask(task)}
                    onMouseEnter={() => setSearchHighlightIndex(idx)}
                  >
                    <span
                      className="search-result-title"
                      style={{ textDecoration: task.completed ? 'line-through' : 'none', opacity: task.completed ? 0.6 : 1 }}
                    >
                      {task.title}
                    </span>
                    {taskProject && (
                      <span className="search-result-project" style={{ color: taskProject.color }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: taskProject.color, display: 'inline-block', marginRight: '4px' }} />
                        {taskProject.name}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {showSearchDropdown && searchQuery.trim() && searchResults.length === 0 && (
            <div className="search-dropdown">
              <div className="search-empty">「{searchQuery}」に一致するタスクが見つかりません</div>
            </div>
          )}
        </div>

        <button className="brand-bg brand-btn" onClick={handleGlobalAddTask}>+ Add Task</button>
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
    </header>
  );
};
