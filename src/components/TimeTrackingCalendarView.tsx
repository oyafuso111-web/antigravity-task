import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  eachDayOfInterval,
  isSameDay,
  isToday,
} from 'date-fns';
import { useTaskStore } from '../store/useTaskStore';
import type { Task, TimeBlock } from '../types';
import './TimeTrackingCalendarView.css';

const HOUR_HEIGHT = 48; // px per hour
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface BlockWithTask {
  block: TimeBlock;
  task: Task;
  isActive?: boolean;
}

const formatDuration = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const formatTime = (epochMs: number): string => {
  const d = new Date(epochMs);
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false });
};

// Get a stable color for a task based on its project color or a hash
const getBlockColor = (task: Task, projects: { id: string; color: string }[]): string => {
  if (task.projectId) {
    const proj = projects.find(p => p.id === task.projectId);
    if (proj) return proj.color;
  }
  // Fallback: generate from task id
  const colors = ['#6A44E1', '#E85D75', '#25C26D', '#E89A2D', '#2D9CDB', '#9B59B6', '#1ABC9C', '#E67E22'];
  let hash = 0;
  for (let i = 0; i < task.id.length; i++) hash = (hash * 31 + task.id.charCodeAt(i)) & 0x7fffffff;
  return colors[hash % colors.length];
};

export const TimeTrackingCalendarView: React.FC = () => {
  const { tasks, projects, weekStartsOn, setSelectedTaskId, activeTimerTaskId, timerStartTimestamp, timerTick } = useTaskStore();
  const [currentDate, setCurrentDate] = useState(new Date());
  const gridRef = useRef<HTMLDivElement>(null);
  const [nowTop, setNowTop] = useState(0);

  const weekStart = startOfWeek(currentDate, { weekStartsOn });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Auto-scroll to current time on mount
  useEffect(() => {
    if (gridRef.current) {
      const now = new Date();
      const hourOffset = now.getHours() + now.getMinutes() / 60;
      const scrollTop = Math.max(0, hourOffset * HOUR_HEIGHT - 200);
      gridRef.current.scrollTop = scrollTop;
    }
  }, []);

  // Update now-line every second (for active timer visual)
  useEffect(() => {
    const updateNow = () => {
      const now = new Date();
      const hourOffset = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
      setNowTop(hourOffset * HOUR_HEIGHT);
    };
    updateNow();
    const interval = setInterval(updateNow, activeTimerTaskId ? 1000 : 60000);
    return () => clearInterval(interval);
  }, [activeTimerTaskId]);

  // Gather all time blocks for the visible week + active timer pseudo-block
  const blocksByDay = useMemo(() => {
    const map: Record<string, BlockWithTask[]> = {};
    days.forEach(day => {
      const key = format(day, 'yyyy-MM-dd');
      map[key] = [];
    });

    tasks.forEach(task => {
      (task.timeBlocks || []).forEach(block => {
        const blockDate = new Date(block.startTime);
        const key = format(blockDate, 'yyyy-MM-dd');
        if (map[key] !== undefined) {
          map[key].push({ block, task });
        }
      });
    });

    // Add active timer as a pseudo-block
    if (activeTimerTaskId && timerStartTimestamp) {
      const activeTask = tasks.find(t => t.id === activeTimerTaskId);
      if (activeTask) {
        const now = Date.now();
        const startDate = new Date(timerStartTimestamp);
        const key = format(startDate, 'yyyy-MM-dd');
        if (map[key] !== undefined) {
          map[key].push({
            block: {
              id: '__active__',
              startTime: timerStartTimestamp,
              endTime: now,
            },
            task: activeTask,
            isActive: true,
          });
        }
      }
    }

    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, days, activeTimerTaskId, timerStartTimestamp, timerTick]);

  // Calculate weekly total (including active timer)
  const weeklyTotal = useMemo(() => {
    let total = 0;
    Object.values(blocksByDay).forEach(blocks => {
      blocks.forEach(({ block }) => {
        total += block.endTime - block.startTime;
      });
    });
    return total;
  }, [blocksByDay]);

  // Calculate daily totals
  const dailyTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    Object.entries(blocksByDay).forEach(([key, blocks]) => {
      totals[key] = blocks.reduce((sum, { block }) => sum + (block.endTime - block.startTime), 0);
    });
    return totals;
  }, [blocksByDay]);

  const goToday = () => setCurrentDate(new Date());

  // Find active timer task info for the header banner
  const activeTask = activeTimerTaskId ? tasks.find(t => t.id === activeTimerTaskId) : null;
  const activeElapsed = activeTimerTaskId && timerStartTimestamp ? Date.now() - timerStartTimestamp : 0;

  return (
    <div className="tt-calendar">
      {/* Header */}
      <div className="tt-header">
        <div className="tt-nav">
          <button className="icon-btn" onClick={() => setCurrentDate(d => subWeeks(d, 1))}>◀</button>
          <h2>{format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}</h2>
          <button className="icon-btn" onClick={() => setCurrentDate(d => addWeeks(d, 1))}>▶</button>
          <button className="tt-today-btn" onClick={goToday}>Today</button>
        </div>
        <div className="tt-summary">
          {activeTask && (
            <span className="tt-active-indicator">
              <span className="tt-active-dot"></span>
              <span className="tt-active-task-name">{activeTask.title}</span>
              <span className="tt-active-timer">{formatDuration(activeElapsed)}</span>
            </span>
          )}
          <span>Weekly Total: <span className="tt-summary-value">{formatDuration(weeklyTotal)}</span></span>
        </div>
      </div>

      {/* Grid */}
      <div className="tt-grid-wrapper" ref={gridRef}>
        {/* Time gutter */}
        <div className="tt-time-gutter">
          {/* Day header spacer */}
          <div style={{ height: '64px', flexShrink: 0 }}></div>
          <div style={{ position: 'relative', height: `${24 * HOUR_HEIGHT}px` }}>
            {HOURS.map(h => (
              <div
                key={h}
                className="tt-time-label"
                style={{ top: `${h * HOUR_HEIGHT}px` }}
              >
                {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </div>
            ))}
          </div>
        </div>

        {/* Day columns */}
        <div className="tt-columns">
          {days.map(day => {
            const key = format(day, 'yyyy-MM-dd');
            const dayBlocks = blocksByDay[key] || [];
            const todayNow = isToday(day);
            const dailyTotal = dailyTotals[key] || 0;

            return (
              <div className="tt-day-column" key={key}>
                <div className={`tt-day-header ${isToday(day) ? 'today' : ''}`}>
                  {format(day, 'EEE')}
                  <span className="tt-day-number">{format(day, 'd')}</span>
                  {dailyTotal > 0 && (
                    <span className="tt-day-total">{formatDuration(dailyTotal)}</span>
                  )}
                </div>

                <div className="tt-hours-area">
                  {/* Hour lines */}
                  {HOURS.map(h => (
                    <React.Fragment key={h}>
                      <div className="tt-hour-line" style={{ top: `${h * HOUR_HEIGHT}px` }} />
                      <div className="tt-half-hour-line" style={{ top: `${h * HOUR_HEIGHT + HOUR_HEIGHT / 2}px` }} />
                    </React.Fragment>
                  ))}

                  {/* Now indicator */}
                  {todayNow && <div className="tt-now-line" style={{ top: `${nowTop}px` }} />}

                  {/* Time blocks */}
                  {dayBlocks.map(({ block, task, isActive }) => {
                    const startDate = new Date(block.startTime);
                    const endDate = new Date(block.endTime);
                    const startHourOffset = startDate.getHours() + startDate.getMinutes() / 60 + startDate.getSeconds() / 3600;
                    const endHourOffset = endDate.getHours() + endDate.getMinutes() / 60 + endDate.getSeconds() / 3600 + (isSameDay(startDate, endDate) ? 0 : 24);
                    const top = startHourOffset * HOUR_HEIGHT;
                    const height = Math.max(6, (endHourOffset - startHourOffset) * HOUR_HEIGHT);
                    const color = getBlockColor(task, projects);
                    const duration = block.endTime - block.startTime;
                    const isManual = block.id.startsWith('manual-');

                    return (
                      <div
                        key={block.id}
                        className={`tt-block ${isActive ? 'tt-block-active' : ''} ${isManual ? 'tt-block-manual' : ''}`}
                        style={{
                          top: `${top}px`,
                          height: `${height}px`,
                          backgroundColor: color,
                          borderLeftColor: color,
                        }}
                        title={`${isManual ? '✏️ ' : ''}${task.title}\n${formatTime(block.startTime)} – ${isActive ? 'now' : formatTime(block.endTime)}\n${formatDuration(duration)}${isManual ? ' (手動入力)' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTaskId(task.id);
                        }}
                      >
                        {height > 14 && <span className="tt-block-title">{isManual ? '✏️ ' : ''}{task.title}</span>}
                        {height > 28 && (
                          <span className="tt-block-time">
                            {isManual ? '手動入力' : `${formatTime(block.startTime)} – ${isActive ? 'now' : formatTime(block.endTime)}`}
                          </span>
                        )}
                        {height > 42 && (
                          <span className="tt-block-time">{formatDuration(duration)}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
