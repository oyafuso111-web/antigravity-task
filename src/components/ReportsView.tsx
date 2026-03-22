import React, { useState, useMemo } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip as ChartTooltip, Legend, ArcElement
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, addDays, addWeeks, addMonths } from 'date-fns';
import './ReportsView.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, ChartTooltip, Legend, ArcElement);

type Period = 'daily' | 'weekly' | 'monthly';

interface ProjectRowProps {
  pId: string;
  name: string;
  color: string;
  totalTime: number;
  percent: string;
  tasks: Array<{ id: string, title: string, time: number, percent: string }>;
}

const ProjectRow: React.FC<{ data: ProjectRowProps }> = ({ data }) => {
  const [expanded, setExpanded] = useState(false);
  
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="report-table-group">
      <div className="report-table-row parent-row" onClick={() => setExpanded(!expanded)}>
        <button className={`expand-chevron ${expanded ? 'expanded' : ''}`}>›</button>
        <div className="col-name">
          <span className="color-dot" style={{ backgroundColor: data.color }}></span>
          <span className="font-medium">{data.name}</span>
          <span className="task-count">({data.tasks.length})</span>
        </div>
        <div className="col-duration">{formatTime(data.totalTime)}</div>
        <div className="col-percent">{data.percent}</div>
      </div>
      
      {expanded && data.tasks.map(t => (
        <div key={t.id} className="report-table-row child-row">
          <div className="col-name">{t.title}</div>
          <div className="col-duration">{formatTime(t.time)}</div>
          <div className="col-percent">{t.percent}</div>
        </div>
      ))}
    </div>
  );
};

export const ReportsView: React.FC = () => {
  const { tasks, projects } = useTaskStore();
  const [period, setPeriod] = useState<Period>('weekly');
  const [periodOffset, setPeriodOffset] = useState(0);

  const handlePeriodChange = (p: Period) => {
    setPeriod(p);
    setPeriodOffset(0);
  };

  const baseDate = useMemo(() => {
    const today = new Date();
    if (period === 'daily') return addDays(today, periodOffset);
    if (period === 'weekly') return addWeeks(today, periodOffset);
    return addMonths(today, periodOffset);
  }, [period, periodOffset]);

  // Determine the date range based on period
  const dateRange = useMemo(() => {
    if (period === 'daily') {
      return [baseDate]; 
    } else if (period === 'weekly') {
      return eachDayOfInterval({ start: startOfWeek(baseDate, { weekStartsOn: 1 }), end: endOfWeek(baseDate, { weekStartsOn: 1 }) });
    } else {
      return eachDayOfInterval({ start: startOfMonth(baseDate), end: endOfMonth(baseDate) });
    }
  }, [period, baseDate]);

  const dateStrs = useMemo(() => dateRange.map(d => format(d, 'yyyy-MM-dd')), [dateRange]);
  const labels = useMemo(() => dateRange.map(d => period === 'monthly' ? format(d, 'd') : format(d, 'EEE MM/dd')), [dateRange, period]);

  // Aggregate time
  const projectTotals: Record<string, number> = {};
  const projectDaily: Record<string, Record<string, number>> = {};
  const taskTotals: Record<string, number> = {};

  tasks.forEach(task => {
    const pId = task.projectId || 'no-project';
    if (!projectTotals[pId]) projectTotals[pId] = 0;
    if (!projectDaily[pId]) projectDaily[pId] = {};
    
    let taskTimeInPeriod = 0;
    if (task.dailyLogs && Object.keys(task.dailyLogs).length > 0) {
      dateStrs.forEach(dStr => {
        const time = task.dailyLogs![dStr] || 0;
        if (time > 0) {
          projectDaily[pId][dStr] = (projectDaily[pId][dStr] || 0) + time;
          taskTimeInPeriod += time;
        }
      });
    } else {
      // Fallback: If no daily logs exist but the task has accumulatedTime, log it on its creation/due date if it's within range
      const fallbackDate = task.dueDate ? new Date(task.dueDate) : new Date(task.createdAt);
      const fallbackDateStr = format(fallbackDate, 'yyyy-MM-dd');
      if (dateStrs.includes(fallbackDateStr) && task.accumulatedTime > 0) {
        projectDaily[pId][fallbackDateStr] = (projectDaily[pId][fallbackDateStr] || 0) + task.accumulatedTime;
        taskTimeInPeriod += task.accumulatedTime;
      }
    }
    
    projectTotals[pId] += taskTimeInPeriod;
    taskTotals[task.id] = taskTimeInPeriod;
  });

  const totalPeriodTime = Object.values(projectTotals).reduce((sum, val) => sum + val, 0);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getPercent = (seconds: number) => {
    if (totalPeriodTime === 0) return '0.00%';
    return ((seconds / totalPeriodTime) * 100).toFixed(2) + '%';
  };

  const getProjectInfo = (pId: string) => {
    if (pId === 'no-project') return { name: 'Without project', color: '#9CA3AF' };
    const p = projects.find(p => p.id === pId);
    return { name: p?.name || 'Unknown Project', color: p?.color || '#9CA3AF' };
  };

  // 1. Bar Chart
  const validProjectIds = Object.keys(projectTotals).filter(id => projectTotals[id] > 0).sort((a,b) => projectTotals[b] - projectTotals[a]);
  
  const barDatasets = validProjectIds.map(pId => {
    const info = getProjectInfo(pId);
    return {
      label: info.name,
      backgroundColor: info.color,
      data: dateStrs.map(dStr => (projectDaily[pId]?.[dStr] || 0) / 3600),
      stack: 'Stack 0',
      borderRadius: 4,
      barPercentage: 0.6
    };
  });

  const barChartData = { labels, datasets: barDatasets };
  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${ctx.dataset.label}: ${ctx.raw.toFixed(2)}h`
        }
      }
    },
    scales: {
      x: { stacked: true, grid: { display: false } },
      y: { stacked: true, beginAtZero: true, border: { display: false }, ticks: { callback: (val: any) => val + 'h' } }
    }
  };

  // 2. Doughnut Chart
  const pieDatasets = [{
    data: validProjectIds.map(pId => projectTotals[pId]),
    backgroundColor: validProjectIds.map(pId => getProjectInfo(pId).color),
    borderWidth: 2,
    borderColor: 'var(--bg-surface)'
  }];

  const pieChartData = { labels: validProjectIds.map(pId => getProjectInfo(pId).name), datasets: pieDatasets };
  const pieChartOptions = { 
    responsive: true, 
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: { 
      legend: { position: 'right' as const, labels: { usePointStyle: true, boxWidth: 8 } },
      tooltip: {
        callbacks: {
          label: (ctx: any) => {
            const val = ctx.raw as number;
            const h = Math.floor(val / 3600);
            const m = Math.floor((val % 3600) / 60);
            return ` ${h}h ${m}m`;
          }
        }
      }
    } 
  };

  // 3. Table Data
  const tableData: ProjectRowProps[] = validProjectIds.map(pId => {
    const info = getProjectInfo(pId);
    const pTasks = tasks
      .filter(t => (t.projectId || 'no-project') === pId && taskTotals[t.id] > 0)
      .sort((a,b) => taskTotals[b.id] - taskTotals[a.id])
      .map(t => ({
        id: t.id,
        title: t.title,
        time: taskTotals[t.id],
        percent: getPercent(taskTotals[t.id])
      }));

    return {
      pId,
      name: info.name,
      color: info.color,
      totalTime: projectTotals[pId],
      percent: getPercent(projectTotals[pId]),
      tasks: pTasks
    };
  });

  return (
    <div className="reports-view">
      <div className="reports-header-nav">
        <div className="nav-tabs">
          <button className="nav-tab active">Summary</button>
          <button className="nav-tab">Detailed</button>
        </div>
        <div className="nav-actions">
          <button className="action-btn">Export</button>
        </div>
      </div>

      <div className="reports-toolbar">
        <div className="period-nav-group">
          <button className="period-nav-btn" onClick={() => setPeriodOffset(o => o - 1)}>‹</button>
          <div className="period-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            {period === 'daily' && format(baseDate, 'MMM d, yyyy')}
            {period === 'weekly' && `${format(dateRange[0], 'MMM d')} - ${format(dateRange[6], 'MMM d, yyyy')}`}
            {period === 'monthly' && format(baseDate, 'MMMM yyyy')}
          </div>
          <button className="period-nav-btn" onClick={() => setPeriodOffset(o => o + 1)} disabled={periodOffset >= 0}>›</button>
        </div>

        <div className="period-toggles">
          <button className={`period-btn ${period === 'daily' ? 'active' : ''}`} onClick={() => handlePeriodChange('daily')}>Daily</button>
          <button className={`period-btn ${period === 'weekly' ? 'active' : ''}`} onClick={() => handlePeriodChange('weekly')}>Weekly</button>
          <button className={`period-btn ${period === 'monthly' ? 'active' : ''}`} onClick={() => handlePeriodChange('monthly')}>Monthly</button>
        </div>
      </div>

      <div className="reports-summary-cards">
        <div className="summary-card">
          <span className="summary-label">Total Hours</span>
          <span className="summary-value brand-text">{formatTime(totalPeriodTime)}</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Average Daily Hours</span>
          <span className="summary-value">{(totalPeriodTime / 3600 / dateRange.length).toFixed(2)} Hours</span>
        </div>
      </div>

      <div className="charts-container">
        <div className="chart-card bar-chart-card">
          <h3 className="chart-title">Duration by day</h3>
          <div className="chart-wrapper">
             <Bar options={barChartOptions} data={barChartData} />
          </div>
        </div>
        <div className="chart-card pie-chart-card">
          <h3 className="chart-title">Project distribution</h3>
          <div className="chart-wrapper doughnut-wrapper">
             <Doughnut options={pieChartOptions} data={pieChartData} />
             <div className="doughnut-center-text">
               <span className="center-time">{formatTime(totalPeriodTime)}</span>
               <span className="center-label">PROJECT</span>
             </div>
          </div>
        </div>
      </div>

      <div className="reports-table-container">
        <div className="table-header-row">
          <h3 className="chart-title">Project and description breakdown</h3>
        </div>
        <div className="table-cols-header">
          <div className="col-name text-muted">PROJECT | DESCRIPTION</div>
          <div className="col-duration text-muted">DURATION</div>
          <div className="col-percent text-muted">DURATION %</div>
        </div>
        <div className="table-body">
          {tableData.map(row => (
            <ProjectRow key={row.pId} data={row} />
          ))}
          {tableData.length === 0 && (
            <div className="empty-state">No time tracked for this period.</div>
          )}
        </div>
      </div>
    </div>
  );
};
