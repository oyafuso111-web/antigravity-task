import React, { useState, useEffect, useRef } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import './MobileAddTaskModal.css';

export const MobileAddTaskModal: React.FC = () => {
  const { 
    isMobileAddTaskOpen, 
    setMobileAddTaskOpen, 
    addTask, 
    projects, 
    tags,
    activeProjectId
  } = useTaskStore();

  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [projectId, setProjectId] = useState<string>('');
  const [priority, setPriority] = useState<'none'|'low'|'mid'|'high'|'1st'>('none');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [isListening, setIsListening] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'ja-JP';
      
      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setTitle((prev) => prev ? prev + transcript : transcript);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
    }
  }, []);

  useEffect(() => {
    if (isMobileAddTaskOpen) {
      setTitle('');
      // Default to today if in 'p-today' view, etc.
      if (activeProjectId === 'p-today') {
        setDueDate(new Date().toISOString().split('T')[0]);
      } else {
        setDueDate('');
      }
      
      // Default project
      if (activeProjectId && activeProjectId !== 'p1' && !activeProjectId.startsWith('p-')) {
        setProjectId(activeProjectId);
      } else {
        setProjectId('');
      }
      
      setPriority('none');
      setSelectedTagIds([]);
      
      // Auto focus after mount
      setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
    }
  }, [isMobileAddTaskOpen, activeProjectId]);

  if (!isMobileAddTaskOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    addTask({
      title: title.trim(),
      projectId: projectId || null,
      completed: false,
      priority: priority,
      tagIds: selectedTagIds,
      dueDate: dueDate || null,
      homeBucket: dueDate ? null : 'inbox',
    });

    setMobileAddTaskOpen(false);
  };

  const toggleTag = (id: string) => {
    setSelectedTagIds(prev => 
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const toggleListen = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
    }
  };

  return (
    <>
      <div 
        className="mobile-modal-overlay active"
        onClick={() => setMobileAddTaskOpen(false)}
      />
      <div className="mobile-add-modal active">
        <div className="mobile-modal-header">
          <h3>New Task</h3>
          <button className="close-btn" onClick={() => setMobileAddTaskOpen(false)}>✕</button>
        </div>
        
        <form onSubmit={handleSubmit} className="mobile-modal-body">
          <div className="form-group title-group">
            <div className="title-input-wrapper">
              <input 
                ref={inputRef}
                type="text" 
                className="task-title-input" 
                placeholder="What needs to be done?" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
              <button 
                type="button" 
                className={`mic-btn ${isListening ? 'listening' : ''}`}
                onClick={toggleListen}
                title="音声入力"
              >
                {isListening ? '🔴' : '🎤'}
              </button>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group half">
              <label>Due Date</label>
              <input 
                type="date" 
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="form-group half">
              <label>Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as any)}>
                <option value="none">None</option>
                <option value="low">Low</option>
                <option value="mid">Medium</option>
                <option value="high">High</option>
                <option value="1st">Top (1st)</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Project</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">INBOX (No Project)</option>
              {projects.filter(p => p.id !== 'p1').map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Tags</label>
            <div className="tag-chips">
              {tags.map(tag => {
                const isSelected = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    className={`tag-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleTag(tag.id)}
                    style={{ 
                      borderColor: tag.color,
                      backgroundColor: isSelected ? tag.color : 'transparent',
                      color: isSelected ? 'white' : 'var(--text-primary)'
                    }}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="save-btn" disabled={!title.trim()}>
              Save Task
            </button>
          </div>
        </form>
      </div>
    </>
  );
};
