import React, { useState, useMemo } from 'react';
import { useTaskStore } from '../store/useTaskStore';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip as ChartTooltip, Legend, ArcElement, LineElement, PointElement
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, addDays, addWeeks, addMonths } from 'date-fns';
import './ReportsView.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, ChartTooltip, Legend, ArcElement, LineElement, PointElement);

type Period = 'daily' | 'weekly' | 'monthly';

interface TaskDateEntry {
  title: string;
  date: string;       // yyyy-MM-dd
  dateDisplay: string; // yyyy/MM/dd
  time: number;
  percent: string;
}

interface ProjectRowProps {
  pId: string;
  name: string;
  color: string;
  totalTime: number;
  percent: string;
  tasks: TaskDateEntry[];
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
        <div className="col-date"></div>
        <div className="col-duration">{formatTime(data.totalTime)}</div>
        <div className="col-percent">{data.percent}</div>
      </div>
      
      {expanded && data.tasks.map((t, idx) => (
        <div key={`${t.title}-${t.date}-${idx}`} className="report-table-row child-row">
          <div className="col-name">{t.title}</div>
          <div className="col-date">
            {t.dateDisplay && <span className="task-date-badge">{t.dateDisplay}</span>}
          </div>
          <div className="col-duration">{formatTime(t.time)}</div>
          <div className="col-percent">{t.percent}</div>
        </div>
      ))}
    </div>
  );
};

export const ReportsView: React.FC = () => {
  const { tasks, projects, activeTimerTaskId, timerStartTimestamp, timerTick } = useTaskStore();
  const [period, setPeriod] = useState<Period>('weekly');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  // Task filter now uses title (name) instead of ID for grouping
  const [selectedTaskTitle, setSelectedTaskTitle] = useState<string | null>(null);

  const handlePeriodChange = (p: Period) => {
    setPeriod(p);
    setPeriodOffset(0);
  };

  const handleProjectFilterChange = (pId: string | null) => {
    setSelectedProjectId(pId);
    setSelectedTaskTitle(null); // Reset task filter when project changes
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

  // Filter tasks by selected project (task title filter is applied later at aggregation)
  const projectFilteredTasks = useMemo(() => {
    let result = tasks;
    if (selectedProjectId) {
      if (selectedProjectId === 'no-project') {
        result = result.filter(t => !t.projectId);
      } else {
        result = result.filter(t => t.projectId === selectedProjectId);
      }
    }
    return result;
  }, [tasks, selectedProjectId]);

  // Further filter by task title (includes all tasks with matching name)
  const filteredTasks = useMemo(() => {
    if (selectedTaskTitle) {
      return projectFilteredTasks.filter(t => t.title === selectedTaskTitle);
    }
    return projectFilteredTasks;
  }, [projectFilteredTasks, selectedTaskTitle]);

  // Available UNIQUE task titles for the task filter dropdown (scoped to selected project)
  const availableTaskTitlesForFilter = useMemo(() => {
    const titleSet = new Map<string, boolean>(); // title -> hasTimeData
    projectFilteredTasks.forEach(t => {
      const hasTime = t.accumulatedTime > 0
        || (t.dailyLogs && Object.values(t.dailyLogs).some(v => v > 0))
        || t.id === activeTimerTaskId;
      if (hasTime) {
        titleSet.set(t.title, true);
      } else if (!titleSet.has(t.title)) {
        titleSet.set(t.title, false);
      }
    });
    // Only return titles that have time data
    return Array.from(titleSet.entries())
      .filter(([, hasTime]) => hasTime)
      .map(([title]) => title)
      .sort((a, b) => a.localeCompare(b));
  }, [projectFilteredTasks, activeTimerTaskId]);

  // Check if filter is active (not "all")
  const isFiltered = selectedProjectId !== null || selectedTaskTitle !== null;

  // ─── Aggregate time (from filteredTasks) ───
  // Project-level aggregation
  const projectTotals: Record<string, number> = {};
  const projectDaily: Record<string, Record<string, number>> = {};
  // Task-title-level aggregation (grouping same-named tasks together)
  // Key: "projectId::title" to be unique within a project
  const titleGroupDaily: Record<string, Record<string, number>> = {};
  const titleGroupTotals: Record<string, number> = {};

  filteredTasks.forEach(task => {
    const pId = task.projectId || 'no-project';
    const titleKey = `${pId}::${task.title}`;
    if (!projectTotals[pId]) projectTotals[pId] = 0;
    if (!projectDaily[pId]) projectDaily[pId] = {};
    if (!titleGroupDaily[titleKey]) titleGroupDaily[titleKey] = {};
    if (!titleGroupTotals[titleKey]) titleGroupTotals[titleKey] = 0;
    
    let taskTimeInPeriod = 0;
    const isMeActive = task.id === activeTimerTaskId;
    const liveDelta = (isMeActive && timerStartTimestamp) ? Math.floor((timerTick - timerStartTimestamp) / 1000) : 0;
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    if (task.dailyLogs && Object.keys(task.dailyLogs).length > 0) {
      dateStrs.forEach(dStr => {
        let time = task.dailyLogs![dStr] || 0;
        if (isMeActive && dStr === todayStr) {
          time += liveDelta;
        }
        if (time > 0) {
          projectDaily[pId][dStr] = (projectDaily[pId][dStr] || 0) + time;
          titleGroupDaily[titleKey][dStr] = (titleGroupDaily[titleKey][dStr] || 0) + time;
          taskTimeInPeriod += time;
        }
      });
    } else {
      // Fallback
      const fallbackDate = task.dueDate ? new Date(task.dueDate) : new Date(task.createdAt);
      const fallbackDateStr = format(fallbackDate, 'yyyy-MM-dd');
      let time = task.accumulatedTime;
      if (isMeActive) time += liveDelta;

      if (dateStrs.includes(fallbackDateStr) && time > 0) {
        projectDaily[pId][fallbackDateStr] = (projectDaily[pId][fallbackDateStr] || 0) + time;
        titleGroupDaily[titleKey][fallbackDateStr] = (titleGroupDaily[titleKey][fallbackDateStr] || 0) + time;
        taskTimeInPeriod += time;
      }
    }
    
    projectTotals[pId] += taskTimeInPeriod;
    titleGroupTotals[titleKey] += taskTimeInPeriod;
  });

  // Also build a global title-grouped daily for the selected task title filter (across projects)
  const selectedTitleDaily: Record<string, number> = {};
  if (selectedTaskTitle) {
    Object.entries(titleGroupDaily).forEach(([key, dayMap]) => {
      const title = key.split('::').slice(1).join('::');
      if (title === selectedTaskTitle) {
        Object.entries(dayMap).forEach(([dStr, time]) => {
          selectedTitleDaily[dStr] = (selectedTitleDaily[dStr] || 0) + time;
        });
      }
    });
  }

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

  // Build chart data depending on filter state
  const barChartData = useMemo(() => {
    if (selectedTaskTitle) {
      // Single task-title view: bar chart for the merged title
      const pId = selectedProjectId || (filteredTasks.length > 0 ? (filteredTasks[0].projectId || 'no-project') : 'no-project');
      const info = getProjectInfo(pId);
      return {
        labels,
        datasets: [{
          label: selectedTaskTitle,
          backgroundColor: info.color,
          data: dateStrs.map(dStr => (selectedTitleDaily[dStr] || 0) / 3600),
          borderRadius: 4,
          barPercentage: 0.6,
        }]
      };
    } else if (selectedProjectId) {
      // Filtered by project: show grouped-by-title tasks as separate datasets
      const titleKeys = Object.keys(titleGroupTotals)
        .filter(k => k.startsWith(`${selectedProjectId}::`) && titleGroupTotals[k] > 0)
        .sort((a, b) => titleGroupTotals[b] - titleGroupTotals[a]);
      const colors = ['#6A44E1', '#E85D75', '#25C26D', '#E89A2D', '#2D9CDB', '#9B59B6', '#1ABC9C', '#E67E22', '#3498DB', '#E74C3C'];
      return {
        labels,
        datasets: titleKeys.map((titleKey, idx) => {
          const title = titleKey.split('::').slice(1).join('::');
          return {
            label: title,
            backgroundColor: colors[idx % colors.length],
            data: dateStrs.map(dStr => (titleGroupDaily[titleKey]?.[dStr] || 0) / 3600),
            stack: 'Stack 0',
            borderRadius: 4,
            barPercentage: 0.6,
          };
        })
      };
    } else {
      // All: stacked by project
      return {
        labels,
        datasets: validProjectIds.map(pId => {
          const info = getProjectInfo(pId);
          return {
            label: info.name,
            backgroundColor: info.color,
            data: dateStrs.map(dStr => (projectDaily[pId]?.[dStr] || 0) / 3600),
            stack: 'Stack 0',
            borderRadius: 4,
            barPercentage: 0.6
          };
        })
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTasks, labels, dateStrs, selectedProjectId, selectedTaskTitle, validProjectIds, titleGroupDaily, titleGroupTotals, projectDaily, selectedTitleDaily]);

  const barChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: isFiltered && !selectedTaskTitle },
      tooltip: {
        callbacks: {
          label: (ctx: { raw: unknown; dataset: { label?: string } }) => {
            const hoursFlo = ctx.raw as number;
            const totalMinutes = Math.round(hoursFlo * 60);
            const h = Math.floor(totalMinutes / 60);
            const m = totalMinutes % 60;
            return `${ctx.dataset.label}: ${h}h ${m}m`;
          }
        }
      }
    },
    scales: {
      x: { stacked: !selectedTaskTitle, grid: { display: false } },
      y: { stacked: !selectedTaskTitle, beginAtZero: true, border: { display: false }, ticks: { callback: (val: string | number) => val + 'h' } }
    }
  }), [isFiltered, selectedTaskTitle]);

  // 2. Doughnut Chart
  const pieChartData = useMemo(() => {
    if (selectedTaskTitle) {
      // Single task title: show daily distribution
      const daysWithData = dateStrs.filter(d => (selectedTitleDaily[d] || 0) > 0);
      return {
        labels: daysWithData.map(d => {
          const date = new Date(d + 'T00:00:00');
          return format(date, 'MM/dd');
        }),
        datasets: [{
          data: daysWithData.map(d => selectedTitleDaily[d] || 0),
          backgroundColor: ['#6A44E1', '#E85D75', '#25C26D', '#E89A2D', '#2D9CDB', '#9B59B6', '#1ABC9C'],
          borderWidth: 2,
          borderColor: 'var(--bg-surface)'
        }]
      };
    }
    return {
      labels: validProjectIds.map(pId => getProjectInfo(pId).name),
      datasets: [{
        data: validProjectIds.map(pId => projectTotals[pId]),
        backgroundColor: validProjectIds.map(pId => getProjectInfo(pId).color),
        borderWidth: 2,
        borderColor: 'var(--bg-surface)'
      }]
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validProjectIds, selectedTaskTitle, dateStrs, selectedTitleDaily, projectTotals]);

  const pieChartOptions = { 
    responsive: true, 
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: { 
      legend: { position: 'right' as const, labels: { usePointStyle: true, boxWidth: 8 } },
      tooltip: {
        callbacks: {
          label: (ctx: { raw: unknown }) => {
            const val = ctx.raw as number;
            const h = Math.floor(val / 3600);
            const m = Math.floor((val % 3600) / 60);
            return ` ${h}h ${m}m`;
          }
        }
      }
    } 
  };

  // 3. Table Data - grouped by task title, with per-date rows
  const tableData: ProjectRowProps[] = validProjectIds.map(pId => {
    const info = getProjectInfo(pId);
    const taskEntries: TaskDateEntry[] = [];

    // Get unique title keys for this project
    const titleKeys = Object.keys(titleGroupTotals)
      .filter(k => k.startsWith(`${pId}::`) && titleGroupTotals[k] > 0)
      .sort((a, b) => titleGroupTotals[b] - titleGroupTotals[a]);

    titleKeys.forEach(titleKey => {
      const title = titleKey.split('::').slice(1).join('::');
      const dailyTimes = titleGroupDaily[titleKey] || {};
      const datesWithTime = Object.keys(dailyTimes).filter(d => dailyTimes[d] > 0).sort().reverse();

      if (datesWithTime.length === 0) {
        taskEntries.push({
          title,
          date: '',
          dateDisplay: '',
          time: titleGroupTotals[titleKey],
          percent: getPercent(titleGroupTotals[titleKey])
        });
      } else {
        // Always show per-date rows
        datesWithTime.forEach(d => {
          taskEntries.push({
            title,
            date: d,
            dateDisplay: d.replace(/-/g, '/'),
            time: dailyTimes[d],
            percent: getPercent(dailyTimes[d])
          });
        });
      }
    });

    return {
      pId,
      name: info.name,
      color: info.color,
      totalTime: projectTotals[pId],
      percent: getPercent(projectTotals[pId]),
      tasks: taskEntries,
    };
  });

  // Build project filter options from ALL tasks (not just filteredTasks)
  const projectFilterOptions = useMemo(() => {
    const pIds = new Set<string>();
    tasks.forEach(t => pIds.add(t.projectId || 'no-project'));
    return Array.from(pIds).map(pId => ({
      id: pId,
      ...getProjectInfo(pId)
    })).sort((a, b) => a.name.localeCompare(b.name));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, projects]);

  const chartTitle = selectedTaskTitle
    ? `${selectedTaskTitle} の推移`
    : selectedProjectId
      ? `${getProjectInfo(selectedProjectId).name} の内訳`
      : 'Duration by day';

  const doughnutTitle = selectedTaskTitle
    ? '日別配分'
    : 'Project distribution';

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

      {/* Filter Bar */}
      <div className="reports-filter-bar">
        <div className="filter-group">
          <label className="filter-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
            フィルター
          </label>
          <div className="filter-selects">
            <select
              className="filter-select"
              value={selectedProjectId || ''}
              onChange={(e) => handleProjectFilterChange(e.target.value || null)}
            >
              <option value="">すべてのプロジェクト</option>
              {projectFilterOptions.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            <select
              className="filter-select"
              value={selectedTaskTitle || ''}
              onChange={(e) => setSelectedTaskTitle(e.target.value || null)}
              disabled={availableTaskTitlesForFilter.length === 0}
            >
              <option value="">すべてのタスク</option>
              {availableTaskTitlesForFilter.map(title => (
                <option key={title} value={title}>{title}</option>
              ))}
            </select>

            {isFiltered && (
              <button
                className="filter-clear-btn"
                onClick={() => { setSelectedProjectId(null); setSelectedTaskTitle(null); }}
                title="フィルターをクリア"
              >
                ✕ クリア
              </button>
            )}
          </div>
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
        {isFiltered && (
          <div className="summary-card">
            <span className="summary-label">Filter</span>
            <span className="summary-value" style={{ fontSize: '0.85rem' }}>
              {selectedProjectId ? getProjectInfo(selectedProjectId).name : 'All'}
              {selectedTaskTitle ? ` / ${selectedTaskTitle}` : ''}
            </span>
          </div>
        )}
      </div>

      <div className="charts-container">
        <div className="chart-card bar-chart-card">
          <h3 className="chart-title">{chartTitle}</h3>
          <div className="chart-wrapper">
             <Bar options={barChartOptions} data={barChartData} />
          </div>
        </div>
        <div className="chart-card pie-chart-card">
          <h3 className="chart-title">{doughnutTitle}</h3>
          <div className="chart-wrapper doughnut-wrapper">
             <Doughnut options={pieChartOptions} data={pieChartData} />
             <div className="doughnut-center-text">
               <span className="center-time">{formatTime(totalPeriodTime)}</span>
               <span className="center-label">{selectedTaskTitle ? 'TASK' : 'PROJECT'}</span>
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
          <div className="col-date text-muted">DATE</div>
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
