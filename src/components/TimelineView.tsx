import React from 'react';
import { useTaskStore } from '../store/useTaskStore';
import { differenceInDays, addDays, format, startOfWeek, endOfWeek } from 'date-fns';
import './TimelineView.css';

export const TimelineView: React.FC = () => {
  const { tasks, activeProjectId } = useTaskStore();
  
  const activeTasks = tasks.filter(t => !t.completed && (t.projectId === activeProjectId || activeProjectId === 'p1'));
  
  // Display a 2 week view starting from this week
  const today = new Date();
  const startDate = startOfWeek(today);
  const endDate = endOfWeek(addDays(today, 7));
  const totalDays = differenceInDays(endDate, startDate) + 1;
  
  const days = Array.from({ length: totalDays }).map((_, i) => addDays(startDate, i));

  // A helper to place tasks on the timeline. 
  // We'll assume task spans from createdAt to dueDate.
  // If no dueDate, we'll give it a 1-day span.
  const getTaskPos = (task: any) => {
    const start = new Date(task.createdAt);
    const end = task.dueDate ? new Date(task.dueDate) : addDays(start, 1);
    
    // Bounds check
    const startOffset = Math.max(0, differenceInDays(start, startDate));
    const span = Math.max(1, differenceInDays(end, start));
    
    // If it starts after the timeline or ends before, we can still render what's visible
    return { left: `${(startOffset / totalDays) * 100}%`, width: `${(span / totalDays) * 100}%` };
  };

  return (
    <div className="timeline-view">
      <div className="timeline-header">
        <h2>Timeline View</h2>
      </div>

      <div className="timeline-container">
        {/* Timeline Axis */}
        <div className="timeline-axis">
          <div className="timeline-task-col-header">Task Name</div>
          <div className="timeline-days">
            {days.map((day, i) => (
              <div key={i} className="timeline-day-header">
                {format(day, 'MMM d')}
              </div>
            ))}
          </div>
        </div>

        {/* Timeline Grid */}
        <div className="timeline-grid-container">
           {activeTasks.map(task => {
             const { left, width } = getTaskPos(task);
             return (
               <div key={task.id} className="timeline-row">
                 <div className="timeline-task-name">
                    <span 
                      className="priority-dot" 
                      style={{ backgroundColor: task.priority === 'high' ? 'var(--priority-high)' : task.priority === 'medium' ? 'var(--priority-med)' : 'var(--priority-low)' }}
                    />
                   {task.title}
                 </div>
                 <div className="timeline-bar-area">
                   <div 
                     className="timeline-bar" 
                     style={{ 
                       left, 
                       width, 
                       backgroundColor: task.priority === 'high' ? 'var(--priority-high)' : 'var(--brand-solid)'
                     }}
                     title={`Due: ${task.dueDate ? format(new Date(task.dueDate), 'MMM d, yyyy') : 'No Due Date'}`}
                   >
                     {task.title}
                   </div>
                 </div>
               </div>
             );
           })}
        </div>
      </div>
    </div>
  );
};
