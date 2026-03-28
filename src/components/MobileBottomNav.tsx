import React from 'react';
import { useTaskStore } from '../store/useTaskStore';
import './MobileBottomNav.css';

export const MobileBottomNav: React.FC = () => {
  const { 
    setMobileSidebarOpen, 
    setActiveProject, 
    setActiveTab, 
    activeProjectId,
    activeTab,
    setMobileAddTaskOpen
  } = useTaskStore();

  const handleGlobalAddTask = () => {
    setMobileAddTaskOpen(true);
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
      id: 'inbox',
      label: 'INBOX',
      icon: '📥',
      onClick: () => { setActiveProject('p1'); setActiveTab('list'); },
      isActive: activeProjectId === 'p1' && activeTab === 'list'
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
      id: 'today',
      label: 'Today',
      icon: '📌',
      onClick: () => { setActiveProject('p-today'); setActiveTab('list'); },
      isActive: activeProjectId === 'p-today' && activeTab === 'list'
    },
    {
      id: 'tomorrow',
      label: 'Tomorrow',
      icon: '📅',
      onClick: () => { setActiveProject('p-tomorrow'); setActiveTab('list'); },
      isActive: activeProjectId === 'p-tomorrow' && activeTab === 'list'
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
