import React, { useState, useMemo } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import { useDroppable } from '@dnd-kit/core';
import { sortProjectsCustom } from '../utils/sortUtils';
import './Sidebar.css';

// Droppable sidebar item for smart views and home buckets
const DroppableNavItem: React.FC<{ id: string, label: string, isActive: boolean, onClick: () => void, icon?: string }> = ({ id, label, isActive, onClick, icon }) => {
  const { isOver, setNodeRef } = useDroppable({
    id: `smartview-${id}`,
    data: { type: 'smartview', id }
  });

  return (
    <li 
      ref={setNodeRef}
      className={`nav-item ${isActive ? 'active' : ''} ${isOver ? 'drag-over' : ''}`}
      onClick={onClick}
      style={{ backgroundColor: isOver ? 'var(--bg-hover)' : undefined }}
    >
      {icon && <span className="nav-icon">{icon}</span>}
      {label}
    </li>
  );
};


// Separate component for Droppable Project Item
const DroppableProjectItem: React.FC<{ 
  project: any, 
  isActive: boolean, 
  onClick: () => void, 
  onToggleFavorite: (e: React.MouseEvent) => void,
  onColorChange: (color: string) => void,
  onDelete: (e: React.MouseEvent) => void,
  onRename: (newName: string) => void
}> = ({ project, isActive, onClick, onToggleFavorite, onColorChange, onDelete, onRename }) => {
  const { isOver, setNodeRef } = useDroppable({
    id: `project-${project.id}`,
    data: { type: 'project', id: project.id }
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(project.name);

  return (
    <li 
      ref={setNodeRef}
      className={`nav-item project-item ${isActive ? 'active' : ''} ${isOver ? 'drag-over' : ''}`}
      onClick={onClick}
      style={{ backgroundColor: isOver ? 'var(--bg-hover)' : undefined }}
    >
      <label className="color-picker-label" title="Change color" onClick={(e) => e.stopPropagation()}>
        <span className="color-dot" style={{ backgroundColor: project.color }}></span>
        <input 
          type="color" 
          className="hidden-color-input"
          value={project.color} 
          onChange={(e) => onColorChange(e.target.value)}
        />
      </label>
      {isEditing ? (
        <input
          autoFocus
          className="sidebar-edit-input"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={() => {
            if (editName.trim() && editName !== project.name) {
              onRename(editName.trim());
            } else {
              setEditName(project.name);
            }
            setIsEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
            if (e.key === 'Escape') { setEditName(project.name); setIsEditing(false); }
          }}
          onClick={(e) => e.stopPropagation()}
          style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', color: 'var(--text-primary)', fontSize: 'inherit', padding: '0 4px', borderBottom: '2px solid var(--brand-solid)' }}
        />
      ) : (
        <span 
          className="project-name-text"
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditName(project.name);
            setIsEditing(true);
          }}
        >
          {project.name}
        </span>
      )}
      <button 
        className={`fav-btn ${project.isFavorite ? 'is-fav' : ''}`}
        onClick={onToggleFavorite}
        title={project.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        {project.isFavorite ? '★' : '☆'}
      </button>
      <button
        className="sidebar-delete-btn"
        onClick={onDelete}
        title="Delete project"
      >
        ✕
      </button>
    </li>
  );
};

export const Sidebar: React.FC = () => {
  const { 
    projects, 
    tags, 
    activeProjectId, 
    setActiveProject, 
    setActiveTab, 
    addProject, 
    updateProject,
    deleteProject,
    updateTag, 
    deleteTag,
    toggleProjectFavorite,
    isMobileSidebarOpen,
    setMobileSidebarOpen
  } = useTaskStore();
  const [isAdding, setIsAdding] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [smartViewExpanded, setSmartViewExpanded] = useState(false);
  const [projectsExpanded, setProjectsExpanded] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [homeExpanded, setHomeExpanded] = useState(false);

  const MAX_VISIBLE_PROJECTS = 5;
  const MAX_VISIBLE_TAGS = 5;

  const handleNavClick = (id: string) => {
    setActiveProject(id);
    const smartViews = ['p-today', 'p-tomorrow', 'p-thisweek', 'p-nextweek', 'p-waiting', 'p-wont-do', 'p-do-later', 'p-memo', 'completed', 'p1'];
    if (smartViews.includes(id)) {
      setActiveTab('list');
    }
    setTimeout(() => {
      setMobileSidebarOpen(false);
    }, 150);
  };


  // Sort projects: favorites first, then custom alphanumeric -> kana/kanji -> emoji
  const sortedProjects = useMemo(() => {
    return [...projects]
      .filter(p => p.id !== 'p1')
      .sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return sortProjectsCustom(a.name, b.name);
      });
  }, [projects]);

  const visibleProjects = projectsExpanded ? sortedProjects : sortedProjects.slice(0, MAX_VISIBLE_PROJECTS);
  const hasMoreProjects = sortedProjects.length > MAX_VISIBLE_PROJECTS;

  const sortedTags = useMemo(() => {
    return [...tags].sort((a, b) => sortProjectsCustom(a.name, b.name));
  }, [tags]);

  const visibleTags = tagsExpanded ? sortedTags : sortedTags.slice(0, MAX_VISIBLE_TAGS);
  const hasMoreTags = sortedTags.length > MAX_VISIBLE_TAGS;

  const handleAddProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (newProjectName.trim()) {
      const colors = ['#F06A6A', '#25C26D', '#6A44E1', '#E89A2D', '#2D9CDB'];
      const color = colors[Math.floor(Math.random() * colors.length)];
      addProject(newProjectName, color);
      setNewProjectName('');
      setIsAdding(false);
    }
  };

  // Editable tag component
  const EditableTag: React.FC<{ tag: any }> = ({ tag }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(tag.name);
    
    return (
      <li 
        className={`nav-item ${activeProjectId === `t-${tag.id}` ? 'active' : ''}`}
        onClick={() => handleNavClick(`t-${tag.id}`)}
        style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}
      >
        <label className="color-picker-label" title="Change color" onClick={(e) => e.stopPropagation()}>
          <span className="color-dot" style={{ backgroundColor: tag.color, width: '10px', height: '10px' }}></span>
          <input 
            type="color" 
            className="hidden-color-input"
            value={tag.color} 
            onChange={(e) => updateTag(tag.id, { color: e.target.value })}
          />
        </label>
        {isEditing ? (
          <input
            autoFocus
            className="sidebar-edit-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={() => {
              if (editName.trim() && editName !== tag.name) {
                updateTag(tag.id, { name: editName.trim() });
              } else {
                setEditName(tag.name);
              }
              setIsEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
              if (e.key === 'Escape') { setEditName(tag.name); setIsEditing(false); }
            }}
            onClick={(e) => e.stopPropagation()}
            style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', color: 'var(--text-primary)', fontSize: 'inherit', padding: '0 4px', borderBottom: '2px solid var(--brand-solid)' }}
          />
        ) : (
          <span 
            style={{ flex: 1 }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditName(tag.name);
              setIsEditing(true);
            }}
          >
            {tag.name}
          </span>
        )}
        <button
          className="sidebar-delete-btn"
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`タグ「${tag.name}」を削除しますか？`)) {
              deleteTag(tag.id);
            }
          }}
          title="Delete tag"
        >
          ✕
        </button>
      </li>
    );
  };

  return (
    <>
      <div 
        className={`sidebar-overlay ${isMobileSidebarOpen ? 'active' : ''}`}
        onClick={() => setMobileSidebarOpen(false)}
      />
      <aside className={`sidebar ${isMobileSidebarOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-header">
        <h2 className="brand-text">Antigravity Task</h2>
      </div>
      
      <div className="sidebar-section">
        <h3 className="section-title">Home</h3>
        <ul className="nav-list">
          <DroppableNavItem id="p1" label="INBOX" icon="📥" isActive={activeProjectId === 'p1'} onClick={() => handleNavClick('p1')} />
          <DroppableNavItem id="p-waiting" label="連絡待ち" icon="⏯️" isActive={activeProjectId === 'p-waiting'} onClick={() => handleNavClick('p-waiting')} />
          <DroppableNavItem id="p-memo" label="メモ" icon="📝" isActive={activeProjectId === 'p-memo'} onClick={() => handleNavClick('p-memo')} />
          
          {homeExpanded && (
            <>
              <DroppableNavItem id="p-wont-do" label="やらない" icon="🚫" isActive={activeProjectId === 'p-wont-do'} onClick={() => handleNavClick('p-wont-do')} />
              <DroppableNavItem id="p-do-later" label="来週以降にやる" icon="📦" isActive={activeProjectId === 'p-do-later'} onClick={() => handleNavClick('p-do-later')} />
            </>
          )}
        </ul>
        <button className="expand-btn" onClick={() => setHomeExpanded(!homeExpanded)}>
          <span className={`expand-icon ${homeExpanded ? 'expanded' : ''}`}>▼</span>
          {homeExpanded ? '折りたたむ' : 'もっと見る'}
        </button>
      </div>

      <div className="sidebar-section">
        <h3 className="section-title">Smart Views</h3>
        <ul className="nav-list">
          <DroppableNavItem id="p-today" label="本日" icon="📌" isActive={activeProjectId === 'p-today'} onClick={() => handleNavClick('p-today')} />
          <DroppableNavItem id="p-tomorrow" label="明日" icon="📅" isActive={activeProjectId === 'p-tomorrow'} onClick={() => handleNavClick('p-tomorrow')} />
          {smartViewExpanded && (
            <>
              <DroppableNavItem id="p-thisweek" label="今週" icon="🗓️" isActive={activeProjectId === 'p-thisweek'} onClick={() => handleNavClick('p-thisweek')} />
              <DroppableNavItem id="p-nextweek" label="来週以降" icon="📆" isActive={activeProjectId === 'p-nextweek'} onClick={() => handleNavClick('p-nextweek')} />
            </>
          )}
        </ul>
        <button className="expand-btn" onClick={() => setSmartViewExpanded(!smartViewExpanded)}>
          <span className={`expand-icon ${smartViewExpanded ? 'expanded' : ''}`}>▼</span>
          {smartViewExpanded ? '折りたたむ' : 'もっと見る'}
        </button>
      </div>



      <div className="sidebar-section">
        <h3 className="section-title">Projects</h3>
        <ul className="nav-list project-list">
          {visibleProjects.map(project => (
            <DroppableProjectItem 
              key={project.id}
              project={project}
              isActive={activeProjectId === project.id}
              onClick={() => handleNavClick(project.id)}
              onToggleFavorite={(e) => { e.stopPropagation(); toggleProjectFavorite(project.id); }}
              onColorChange={(color) => updateProject(project.id, { color })}
              onDelete={(e) => {
                e.stopPropagation();
                if (window.confirm(`プロジェクト「${project.name}」を削除しますか？\n所属するタスクはプロジェクトなしになります。`)) {
                  deleteProject(project.id);
                }
              }}
              onRename={(newName) => updateProject(project.id, { name: newName })}
            />
          ))}
        </ul>

        {hasMoreProjects && !projectsExpanded && (
          <button className="expand-btn" onClick={() => setProjectsExpanded(true)}>
            <span className="expand-icon">▼</span>
            他 {sortedProjects.length - MAX_VISIBLE_PROJECTS} 件を表示
          </button>
        )}
        {projectsExpanded && hasMoreProjects && (
          <button className="expand-btn" onClick={() => setProjectsExpanded(false)}>
            <span className="expand-icon expanded">▼</span>
            折りたたむ
          </button>
        )}
        
        {isAdding ? (
          <form onSubmit={handleAddProject} className="add-project-form" style={{ padding: '0 16px', marginTop: '8px' }}>
             <input 
               autoFocus
               type="text" 
               className="add-project-input"
               placeholder="Project Name..." 
               value={newProjectName}
               onChange={(e) => setNewProjectName(e.target.value)}
               onBlur={() => { if(!newProjectName) setIsAdding(false); }}
               style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-app)', color: 'var(--text-primary)' }}
             />
          </form>
        ) : (
          <button className="add-project-btn" onClick={() => setIsAdding(true)}>+ Add Project</button>
        )}
      </div>

      <div className="sidebar-section" style={{ marginTop: '16px' }}>
        <h3 className="section-title">Tags</h3>
        <ul className="nav-list tags-list">
          {visibleTags.map(tag => (
            <EditableTag key={tag.id} tag={tag} />
          ))}
        </ul>
        
        {hasMoreTags && !tagsExpanded && (
          <button className="expand-btn" onClick={() => setTagsExpanded(true)}>
            <span className="expand-icon">▼</span>
            他 {sortedTags.length - MAX_VISIBLE_TAGS} 件を表示
          </button>
        )}
        {tagsExpanded && hasMoreTags && (
          <button className="expand-btn" onClick={() => setTagsExpanded(false)}>
            <span className="expand-icon expanded">▼</span>
            折りたたむ
          </button>
        )}
      </div>

      <div className="sidebar-section" style={{ marginTop: 'auto', borderBottom: 'none' }}>
        <h3 className="section-title">Archive</h3>
        <ul className="nav-list">
          <DroppableNavItem 
            id="completed" 
            label="完了したタスク" 
            icon="✅" 
            isActive={activeProjectId === 'completed'} 
            onClick={() => handleNavClick('completed')} 
          />
        </ul>
      </div>
    </aside>
    </>
  );
};
