import React from 'react';
import { useTaskStore } from '../store/useTaskStore';
import { addDays } from 'date-fns';
import './MobileBottomNav.css';

export const MobileBottomNav: React.FC = () => {
  const { 
    setMobileSidebarOpen, 
    setActiveProject, 
    setActiveTab, 
    activeProjectId,
    activeTab,
    addTask 
  } = useTaskStore();

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

  const navItems = [
    {
      id: 'menu',
      label: 'Menu',
      icon: '≡',
      onClick: () => setMobileSidebarOpen(true),
      isActive: false
    },
    {
      id: 'today',
      label: 'Today',
      icon: '📅',
      onClick: () => { setActiveProject('p-today'); setActiveTab('list'); },
      isActive: activeProjectId === 'p-today' && activeTab === 'list'
    },
    {
      id: 'add',
      label: 'Add',
      icon: '＋',
      onClick: handleGlobalAddTask,
      isActive: false,
      isPrimary: true
    },
    {
      id: 'tomorrow',
      label: 'Tomorrow',
      icon: '⏭️',
      onClick: () => { setActiveProject('p-tomorrow'); setActiveTab('list'); },
      isActive: activeProjectId === 'p-tomorrow' && activeTab === 'list'
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: '📊',
      onClick: () => setActiveTab('reports'),
      isActive: activeTab === 'reports'
    }
  ];

  return (
    <nav className="mobile-bottom-nav">
      {navItems.map(item => (
        <button 
          key={item.id} 
          className={`nav-btn ${item.isActive ? 'active' : ''} ${item.isPrimary ? 'primary-btn' : ''}`}
          onClick={item.onClick}
        >
          <span className="nav-icon">{item.icon}</span>
          {!item.isPrimary && <span className="nav-label">{item.label}</span>}
        </button>
      ))}
    </nav>
  );
};
