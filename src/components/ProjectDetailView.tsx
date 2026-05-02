import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import './ProjectDetailView.css';

interface Props {
  projectId: string;
}

export const ProjectDetailView: React.FC<Props> = ({ projectId }) => {
  const {
    projects,
    tasks,
    updateProject,
    addProjectComment,
    updateProjectComment,
    deleteProjectComment,
    setProjectDetailOpen
  } = useTaskStore();

  const project = projects.find(p => p.id === projectId);

  const [newComment, setNewComment] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');

  // Local state for description with debounced save
  const [localDescription, setLocalDescription] = useState(project?.description || '');
  const descriptionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descriptionTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-resize textarea to fit content
  const autoResizeTextarea = useCallback(() => {
    const el = descriptionTextareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.max(140, el.scrollHeight) + 'px';
    }
  }, []);

  // Sync local description when project changes externally (e.g. fetchInitialData)
  // but only if the user hasn't made local edits that are pending save
  const pendingSaveRef = useRef(false);
  useEffect(() => {
    if (!pendingSaveRef.current && project?.description !== undefined) {
      setLocalDescription(project.description || '');
    }
  }, [project?.description]);

  // Auto-resize when localDescription changes (including external sync)
  useEffect(() => {
    autoResizeTextarea();
  }, [localDescription, autoResizeTextarea]);

  // Keep a ref to the latest description for use in cleanup/visibility handlers
  const latestDescriptionRef = useRef(localDescription);
  useEffect(() => {
    latestDescriptionRef.current = localDescription;
  }, [localDescription]);

  // Flush pending description save on unmount or when tab becomes hidden
  useEffect(() => {
    const flushPendingSave = () => {
      if (descriptionTimerRef.current) {
        clearTimeout(descriptionTimerRef.current);
        descriptionTimerRef.current = null;
      }
      if (pendingSaveRef.current) {
        useTaskStore.getState().updateProject(projectId, { description: latestDescriptionRef.current });
        pendingSaveRef.current = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        flushPendingSave();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushPendingSave();
    };
  }, [projectId]);

  const debouncedSaveDescription = useCallback((value: string) => {
    if (descriptionTimerRef.current) {
      clearTimeout(descriptionTimerRef.current);
    }
    pendingSaveRef.current = true;
    descriptionTimerRef.current = setTimeout(() => {
      updateProject(projectId, { description: value });
      pendingSaveRef.current = false;
      descriptionTimerRef.current = null;
    }, 500);
  }, [projectId, updateProject]);

  // Escape key to close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Flush any pending description save before closing
        if (descriptionTimerRef.current) {
          clearTimeout(descriptionTimerRef.current);
          descriptionTimerRef.current = null;
          updateProject(projectId, { description: localDescription });
          pendingSaveRef.current = false;
        }
        setProjectDetailOpen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [setProjectDetailOpen, projectId, updateProject, localDescription]);

  // Task statistics
  const stats = useMemo(() => {
    const projectTasks = tasks.filter(t => t.projectId === projectId);
    const completed = projectTasks.filter(t => t.completed);
    const incomplete = projectTasks.filter(t => !t.completed);
    const totalTime = projectTasks.reduce((sum, t) => sum + (t.accumulatedTime || 0), 0);
    const total = projectTasks.length;
    const progressPercent = total > 0 ? Math.round((completed.length / total) * 100) : 0;

    return {
      total,
      completedCount: completed.length,
      incompleteCount: incomplete.length,
      totalTime,
      progressPercent
    };
  }, [tasks, projectId]);

  if (!project) {
    return (
      <div className="project-detail-panel">
        <div className="project-detail-header">
          <button className="close-btn" onClick={() => setProjectDetailOpen(false)}>✕ Close</button>
        </div>
        <div className="project-detail-body">
          <p>Project not found</p>
        </div>
      </div>
    );
  }

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setLocalDescription(value);
    debouncedSaveDescription(value);
    autoResizeTextarea();
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (newComment.trim()) {
      addProjectComment(projectId, newComment.trim());
      setNewComment('');
    }
  };

  const comments = project.comments || [];
  const createdDate = new Date(project.createdAt);

  return (
    <div className="project-detail-panel" onClick={(e) => e.stopPropagation()}>
      <div className="project-detail-header">
        <button className="close-btn" onClick={() => setProjectDetailOpen(false)}>✕ Close</button>
      </div>

      <div className="project-detail-body">
        {/* Project Name */}
        <div className="project-detail-name">
          <span className="project-color-dot" style={{ backgroundColor: project.color }} />
          <h2>{project.name}</h2>
        </div>

        {/* Progress Bar */}
        <div className="progress-section">
          <div className="progress-header">
            <span className="progress-label">進捗</span>
            <span className="progress-percent">{stats.progressPercent}%</span>
          </div>
          <div className="progress-bar-track">
            <div
              className="progress-bar-fill"
              style={{ width: `${stats.progressPercent}%` }}
            />
          </div>
        </div>

        {/* Stats - 3 cards in a row */}
        <div className="project-stats">
          <div className="stat-card completed">
            <span className="stat-label">完了</span>
            <span className="stat-value">{stats.completedCount}</span>
          </div>
          <div className="stat-card incomplete">
            <span className="stat-label">未完了</span>
            <span className="stat-value">{stats.incompleteCount}</span>
          </div>
          <div className="stat-card time">
            <span className="stat-label">作業時間</span>
            <span className="stat-value">{formatTime(stats.totalTime)}</span>
          </div>
        </div>

        {/* Description / Purpose */}
        <div className="project-section">
          <h3>🎯 目的 / 目標</h3>
          <textarea
            ref={descriptionTextareaRef}
            className="project-description-area"
            value={localDescription}
            onChange={handleDescriptionChange}
            onBlur={() => {
              // Flush any pending debounced save immediately on blur
              if (descriptionTimerRef.current) {
                clearTimeout(descriptionTimerRef.current);
                descriptionTimerRef.current = null;
                updateProject(projectId, { description: localDescription });
                pendingSaveRef.current = false;
              }
            }}
            placeholder="このプロジェクトの目的や目標を記入してください..."
          />
        </div>

        {/* Comments - matching TaskDetailView layout */}
        <div className="project-section">
          <h3>💬 コメント ({comments.length})</h3>

          <div className="comment-list">
            {comments.map(c => (
              <div key={c.id} className="comment-item">
                <div className="comment-meta">
                  <span className="comment-user">{c.userName}</span>
                  <span className="comment-date">{new Date(c.createdAt).toLocaleString('ja-JP')}</span>
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
                          deleteProjectComment(projectId, c.id);
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
                            updateProjectComment(projectId, c.id, editCommentText.trim());
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
              placeholder="コメントを入力..."
            />
            <button type="submit" disabled={!newComment.trim()}>Comment</button>
          </form>
        </div>

        {/* Created Date */}
        <div className="project-created-date">
          作成日: {createdDate.toLocaleDateString('ja-JP', {
            year: 'numeric', month: 'long', day: 'numeric'
          })}
        </div>
      </div>
    </div>
  );
};
