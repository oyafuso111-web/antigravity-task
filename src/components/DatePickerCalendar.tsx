import React, { useState } from 'react';

interface Props {
  value: string | null; // YYYY-MM-DD or null
  onChange: (dateStr: string) => void;
  onClear: () => void;
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

export const DatePickerCalendar: React.FC<Props> = ({ value, onChange, onClear }) => {
  const today = new Date();
  const todayStr = formatDate(today);

  // Determine initial display month from value or today
  const initialDate = value ? parseLocalDate(value) : today;
  const [displayYear, setDisplayYear] = useState(initialDate.getFullYear());
  const [displayMonth, setDisplayMonth] = useState(initialDate.getMonth());

  const firstDayOfMonth = new Date(displayYear, displayMonth, 1);
  const startDay = firstDayOfMonth.getDay(); // 0=Sun
  const daysInMonth = new Date(displayYear, displayMonth + 1, 0).getDate();

  // Previous month days to fill the first row
  const prevMonthDays = new Date(displayYear, displayMonth, 0).getDate();

  const goToPrevMonth = () => {
    if (displayMonth === 0) {
      setDisplayYear(displayYear - 1);
      setDisplayMonth(11);
    } else {
      setDisplayMonth(displayMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (displayMonth === 11) {
      setDisplayYear(displayYear + 1);
      setDisplayMonth(0);
    } else {
      setDisplayMonth(displayMonth + 1);
    }
  };

  // Build calendar grid (6 rows x 7 cols)
  const cells: { day: number; month: number; year: number; isCurrentMonth: boolean }[] = [];
  
  // Fill prev month
  for (let i = startDay - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const m = displayMonth === 0 ? 11 : displayMonth - 1;
    const y = displayMonth === 0 ? displayYear - 1 : displayYear;
    cells.push({ day: d, month: m, year: y, isCurrentMonth: false });
  }
  
  // Fill current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, month: displayMonth, year: displayYear, isCurrentMonth: true });
  }
  
  // Fill next month
  const remaining = 42 - cells.length; // 6 rows
  for (let d = 1; d <= remaining; d++) {
    const m = displayMonth === 11 ? 0 : displayMonth + 1;
    const y = displayMonth === 11 ? displayYear + 1 : displayYear;
    cells.push({ day: d, month: m, year: y, isCurrentMonth: false });
  }

  // Only show 5 rows if the 6th row is entirely next month
  const showRows = cells.length > 35 && cells.slice(35).every(c => !c.isCurrentMonth) ? 5 : 6;
  const visibleCells = cells.slice(0, showRows * 7);

  const handleDateClick = (cell: typeof cells[0]) => {
    const dateStr = `${cell.year}-${String(cell.month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
    onChange(dateStr);
  };

  return (
    <div className="datepicker-calendar" style={{ userSelect: 'none', width: '100%', boxSizing: 'border-box' }}>
      {/* Month navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', width: '100%' }}>
        <button
          onClick={goToPrevMonth}
          style={navBtnStyle}
          title="前月"
        >‹</button>
        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', flexShrink: 0 }}>
          {displayYear}年 {displayMonth + 1}月
        </span>
        <button
          onClick={goToNextMonth}
          style={navBtnStyle}
          title="翌月"
        >›</button>
      </div>

      {/* Weekday headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '2px', width: '100%' }}>
        {WEEKDAY_LABELS.map((label, i) => (
          <div key={label} style={{
            textAlign: 'center', fontSize: '0.7rem', fontWeight: 600, padding: '4px 0',
            color: i === 0 ? 'var(--priority-high)' : i === 6 ? '#2D9CDB' : 'var(--text-secondary)'
          }}>
            {label}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', width: '100%' }}>
        {visibleCells.map((cell, idx) => {
          const cellDateStr = `${cell.year}-${String(cell.month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
          const isToday = cellDateStr === todayStr;
          const isSelected = value && cellDateStr === value;
          const dayOfWeek = idx % 7;

          return (
            <div key={idx} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1px 0' }}>
              <button
                onClick={() => handleDateClick(cell)}
                style={{
                  width: '30px', height: '30px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: isToday ? '2px solid var(--brand-solid)' : 'none',
                  borderRadius: '50%',
                  background: isSelected ? 'var(--brand-solid)' : 'transparent',
                  color: isSelected 
                    ? 'white' 
                    : !cell.isCurrentMonth 
                      ? 'var(--text-secondary)' 
                      : dayOfWeek === 0 
                        ? 'var(--priority-high)' 
                        : dayOfWeek === 6 
                          ? '#2D9CDB' 
                          : 'var(--text-primary)',
                  opacity: cell.isCurrentMonth ? 1 : 0.4,
                  fontSize: '0.78rem',
                  fontWeight: isToday || isSelected ? 700 : 400,
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'background 0.15s, color 0.15s',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'transparent';
                }}
              >
                {cell.day}
              </button>
            </div>
          );
        })}
      </div>

      {/* Clear button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px', gap: '8px' }}>
        <button
          onClick={onClear}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-secondary)', fontSize: '0.8rem', padding: '4px 8px'
          }}
        >クリア</button>
      </div>
    </div>
  );
};

// Helper functions
function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseLocalDate(str: string): Date {
  const [y, m, d] = str.split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, d);
}

const navBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-secondary)',
  fontSize: '1.2rem',
  padding: '4px 8px',
  borderRadius: '4px',
  lineHeight: 1,
  flexShrink: 0,
};
