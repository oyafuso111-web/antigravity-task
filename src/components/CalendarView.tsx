import React, { useState } from 'react';
import {
  format,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
} from 'date-fns';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useTaskStore } from '../store/useTaskStore';
import type { Task } from '../types';
import './CalendarView.css';

const DraggableCalendarTask: React.FC<{ task: Task }> = ({ task }) => {
  const { setSelectedTaskId, updateTask } = useTaskStore();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `calendar-task-${task.id}`,
    data: {
      type: 'task',
      task
    }
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 999 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`calendar-task-pill ${isDragging ? 'is-dragging' : ''}`}
      title={task.title}
    >
      <button
        className="cal-action-btn cal-complete-btn"
        onClick={(e) => {
          e.stopPropagation();
          updateTask(task.id, { completed: true });
        }}
        onPointerDown={(e) => e.stopPropagation()} /* Prevent dnd-kit drag start on button click */
      >
        ○
      </button>

      <span className="cal-task-title">{task.title}</span>
      <button
        className="cal-action-btn cal-detail-btn"
        onClick={(e) => {
          e.stopPropagation();
          setSelectedTaskId(task.id);
        }}
        onPointerDown={(e) => e.stopPropagation()} /* Prevent dnd-kit drag start */
      >
        ＞
      </button>
    </div>
  );
};

const DroppableCalendarCell: React.FC<{
  day: Date;
  monthStart: Date;
  dayTasks: Task[];
  viewType: 'month' | 'week';
  onAddTask: (day: Date, title: string) => void;
}> = ({ day, monthStart, dayTasks, viewType, onAddTask }) => {
  const dateStr = format(day, 'yyyy-MM-dd');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const handleFocusOut = () => {
    if (newTaskTitle.trim()) {
      onAddTask(day, newTaskTitle.trim());
    }
    setIsAdding(false);
    setNewTaskTitle('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleFocusOut();
    } else if (e.key === 'Escape') {
      setIsAdding(false);
      setNewTaskTitle('');
    }
  };
  const { setNodeRef, isOver } = useDroppable({
    id: `calendar-day-${dateStr}`,
    data: {
      type: 'calendar-day',
      date: dateStr
    }
  });

  const displayTasks = isExpanded || viewType === 'week' ? dayTasks : dayTasks.slice(0, 3);
  const hasMore = dayTasks.length > 3 && viewType === 'month';

  return (
    <div
      ref={setNodeRef}
      className={`calendar-cell ${!isSameMonth(day, monthStart) && viewType === 'month' ? 'dimmed' : ''} ${isSameDay(day, new Date()) ? 'today' : ''} ${isOver ? 'drag-over' : ''} ${isExpanded ? 'expanded' : ''}`}
    >
      <div className="date-header-row">
        <span className="date-number">{format(day, 'd')}</span>
        <button
          className="cal-quick-add-btn"
          onClick={(e) => { e.stopPropagation(); setIsAdding(true); }}
          title="Add task"
        >
          ＋
        </button>
      </div>
      <div className="day-tasks">
        {displayTasks.map(task => (
          <DraggableCalendarTask key={task.id} task={task} />
        ))}
        {isAdding && (
          <input
            autoFocus
            className="cal-quick-add-input"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onBlur={handleFocusOut}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="New Task..."
          />
        )}
        {hasMore && (
          <button
            className="show-more-btn"
            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
          >
            {isExpanded ? '▲ 折りたたむ' : `▼ 他 ${dayTasks.length - 3} 件`}
          </button>
        )}
      </div>
    </div>
  );
};

export const CalendarView: React.FC = () => {
  const { tasks, projects, tags, activeProjectId, setActiveProject, addTask, weekStartsOn, setWeekStartsOn } = useTaskStore();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewType, setViewType] = useState<'month' | 'week'>('month');

  let activeFilterName: string | null = null;
  const isProjectFilter = activeProjectId && !activeProjectId.startsWith('p-') && !activeProjectId.startsWith('t-') && activeProjectId !== 'completed' && activeProjectId !== 'p1';
  const isTagFilter = activeProjectId && activeProjectId.startsWith('t-');

  if (isProjectFilter) {
    activeFilterName = projects.find(p => p.id === activeProjectId)?.name || 'Unknown Project';
  } else if (isTagFilter) {
    activeFilterName = tags.find(t => t.id === activeProjectId.replace('t-', ''))?.name || 'Unknown Tag';
  }

  const handleAddTask = (day: Date, title: string) => {
    const isProject = activeProjectId && !activeProjectId.startsWith('p-') && !activeProjectId.startsWith('t-') && activeProjectId !== 'completed' && activeProjectId !== 'p1';
    const tagIds = activeProjectId && activeProjectId.startsWith('t-') ? [activeProjectId.replace('t-', '')] : [];

    addTask({
      title,
      projectId: isProject ? activeProjectId : null,
      completed: false,
      priority: 'none',
      tagIds,
      dueDate: format(day, 'yyyy-MM-dd'),
      homeBucket: null
    });
  };

  const activeTasks = tasks.filter(t => {
    if (t.completed) return false;

    // Explicit project filtering (ignores Inbox 'p1' and smart views)
    if (activeProjectId && !activeProjectId.startsWith('p-') && !activeProjectId.startsWith('t-') && activeProjectId !== 'completed' && activeProjectId !== 'p1') {
      return t.projectId === activeProjectId;
    }

    // Explicit tag filtering
    if (activeProjectId && activeProjectId.startsWith('t-')) {
      const tagId = activeProjectId.replace('t-', '');
      return t.tagIds.includes(tagId);
    }

    // For Smart Views and Inbox, show all tasks unconditionally on the Calendar
    return true;
  });

  const nextPeriod = () => {
    setCurrentDate(viewType === 'month' ? addMonths(currentDate, 1) : addWeeks(currentDate, 2));
  };

  const prevPeriod = () => {
    setCurrentDate(viewType === 'month' ? subMonths(currentDate, 1) : subWeeks(currentDate, 2));
  };

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);

  const startDate = viewType === 'month' 
    ? startOfWeek(monthStart, { weekStartsOn }) 
    : startOfWeek(currentDate, { weekStartsOn });
  const endDate = viewType === 'month' 
    ? endOfWeek(monthEnd, { weekStartsOn }) 
    : endOfWeek(addWeeks(currentDate, 1), { weekStartsOn });

  const dateFormat = "MMMM yyyy";
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const weekDays = weekStartsOn === 0
    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className={`calendar-view ${viewType}`}>
      <div className="calendar-header">
        <div className="calendar-nav">
          <button onClick={prevPeriod} className="icon-btn">◀</button>
          <h2>{viewType === 'month' ? format(currentDate, dateFormat) : `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d')}`}</h2>
          <button onClick={nextPeriod} className="icon-btn">▶</button>
          <button 
            className="toggle-btn" 
            style={{ marginLeft: '12px', padding: '4px 8px', fontSize: '0.75rem' }}
            onClick={() => setWeekStartsOn(weekStartsOn === 0 ? 1 : 0)}
            title="Toggle Sunday/Monday Start"
          >
            {weekStartsOn === 0 ? 'Sun Start' : 'Mon Start'}
          </button>
          {activeFilterName && (
            <div className="cal-filter-pill">
              絞り込み: {activeFilterName}
              <button className="clear-filter-btn" onClick={() => setActiveProject(null)}>×</button>
            </div>
          )}
        </div>

        <div className="view-toggle">
          <button
            className={`toggle-btn ${viewType === 'month' ? 'active' : ''}`}
            onClick={() => setViewType('month')}
          >
            Month
          </button>
          <button
            className={`toggle-btn ${viewType === 'week' ? 'active' : ''}`}
            onClick={() => setViewType('week')}
          >
            Week
          </button>
        </div>
      </div>

      <div className="calendar-grid">
        {weekDays.map(day => (
          <div className="calendar-day-header" key={day}>{day}</div>
        ))}

        {days.map(day => {
          const dayTasks = activeTasks.filter(t => t.dueDate && isSameDay(new Date(t.dueDate), day));
          return (
            <DroppableCalendarCell
              key={day.toString()}
              day={day}
              monthStart={monthStart}
              dayTasks={dayTasks}
              viewType={viewType}
              onAddTask={handleAddTask}
            />
          );
        })}
      </div>
    </div>
  );
};
