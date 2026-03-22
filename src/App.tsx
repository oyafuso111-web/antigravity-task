import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { TaskListView } from './components/TaskListView';
import { CalendarView } from './components/CalendarView';
import { TimelineView } from './components/TimelineView';
import { ReportsView } from './components/ReportsView';
import { SettingsModal } from './components/SettingsModal';
import { TaskDetailView } from './components/TaskDetailView';
import { useTaskStore } from './store/useTaskStore';
import { 
  DndContext, 
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import './App.css';

function App() {
  const { 
    activeTimerTaskId, 
    tickTimer, 
    activeTab, 
    isSettingsOpen, 
    setSettingsOpen, 
    reorderTasks, 
    moveTask,
    moveToSmartView,
    updateTask,
    selectedTaskId,
    setSelectedTaskId,
    clearSelection,
    selectedTaskIds
  } = useTaskStore();

  const [, setTick] = useState(0);

  useEffect(() => {
    // Refresh at midnight
    const now = new Date();
    const tonight = new Date(now);
    tonight.setHours(24, 0, 0, 0);
    const msUntilMidnight = tonight.getTime() - now.getTime();

    const timer = setTimeout(() => {
      setTick((t: number) => t + 1); // Trigger re-render
    }, msUntilMidnight + 100); // 100ms buffer

    return () => clearTimeout(timer);
  }, [setTick]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    // Check if we dropped on a calendar day
    if (over.data.current?.type === 'calendar-day') {
      const newDateStr = over.data.current.date; // format: 'yyyy-MM-dd'
      const parsedDate = new Date(newDateStr).toISOString();
      const draggedTaskId = active.data.current?.type === 'task' ? active.data.current.task.id : String(active.id);
      
      const taskIds = selectedTaskIds.length > 1 && selectedTaskIds.includes(draggedTaskId)
        ? selectedTaskIds
        : [draggedTaskId];

      taskIds.forEach(id => {
        updateTask(id, { dueDate: parsedDate });
      });
      clearSelection();
      return;
    }

    // Check if we dropped on a smart view or home bucket in the sidebar
    if (over.data.current?.type === 'smartview') {
      const targetViewId = over.data.current.id;
      // If multi-selected, move all selected tasks
      const draggedTaskId = active.data.current?.type === 'task' ? active.data.current.task.id : String(active.id);
      const taskIds = selectedTaskIds.length > 1 && selectedTaskIds.includes(draggedTaskId)
        ? selectedTaskIds
        : [draggedTaskId];
      taskIds.forEach(id => moveToSmartView(id, targetViewId));
      clearSelection();
      return;
    }

    // Check if we dropped on a project in the sidebar
    if (over.data.current?.type === 'project') {
      const newProjectId = over.data.current.id;
      // If multi-selected, move all selected tasks
      const draggedTaskId = active.data.current?.type === 'task' ? active.data.current.task.id : String(active.id);
      const taskIds = selectedTaskIds.length > 1 && selectedTaskIds.includes(draggedTaskId)
        ? selectedTaskIds
        : [draggedTaskId];
      taskIds.forEach(id => moveTask(id, newProjectId));
      clearSelection();
      return;
    }

    // Check if we are reordering columns
    if (active.data.current?.type === 'column' && over.data.current?.type === 'column') {
      if (active.id !== over.id) {
        useTaskStore.getState().reorderColumns(active.id as string, over.id as string);
      }
      return;
    }

    // Otherwise standard reorder in the list
    if (active.id !== over.id && active.data.current?.type !== 'column' && over.data.current?.type !== 'column') {
      reorderTasks(active.id as string, over.id as string);
    }
  };

  useEffect(() => {
    let timerId: number | undefined;
    if (activeTimerTaskId) {
      timerId = window.setInterval(() => {
        tickTimer();
      }, 1000);
    }
    return () => clearInterval(timerId);
  }, [activeTimerTaskId, tickTimer]);
  useEffect(() => {
    // Auto dark mode logic based on time (after 18:00 or before 06:00)
    const checkTimeForDarkMode = () => {
      const currentHour = new Date().getHours();
      // If after 18:00 or before 6:00, force dark mode (if not relying purely on device settings)
      // The CSS uses prefers-color-scheme, but we can programmatically add .dark to optionally override
      if (currentHour >= 18 || currentHour < 6) {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.remove('dark');
        // We let CSS handles 'light' by default unless we specifically want to force it
        // document.documentElement.classList.add('light'); 
      }
    };

    checkTimeForDarkMode();
    // Optional: Set an interval to check every hour, but usually not strictly necessary for a single session
    const interval = setInterval(checkTimeForDarkMode, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Global Escape key handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearSelection();
        setSelectedTaskId(null);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [clearSelection, setSelectedTaskId]);

  return (
    <DndContext 
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragEnd={handleDragEnd}
    >
      <div className="app-container">
        <Sidebar />
        <main className="main-content">
          <Topbar />
          <div className="content-area">
            <div 
              className={`main-view-container ${selectedTaskId ? 'with-detail' : ''}`}
              onClick={() => { setSelectedTaskId(null); clearSelection(); }}
            >
              {activeTab === 'list' && <TaskListView />}
              {activeTab === 'calendar' && <CalendarView />}
              {activeTab === 'timeline' && <TimelineView />}
              {activeTab === 'reports' && <ReportsView />}
            </div>
            {selectedTaskId && <TaskDetailView taskId={selectedTaskId} />}
          </div>
        </main>

        {isSettingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      </div>
    </DndContext>
  );
}

export default App;
