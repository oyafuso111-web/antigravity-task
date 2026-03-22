// Shared date text parser for Antigravity Task Manager
// Supports: today/本日/今日, tomorrow/明日, monday-saturday/月曜-土曜, M/D, YYYY-MM-DD

export const parseDateText = (text: string): string | null => {
  const now = new Date();
  const getLocalDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const lower = text.toLowerCase().trim();
  if (!lower) return null;

  // Today
  if (lower === 'today' || lower === '本日' || lower === '今日') {
    return getLocalDateStr(now);
  }

  // Tomorrow
  if (lower === 'tomorrow' || lower === '明日') {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return getLocalDateStr(d);
  }

  // Day of week mapping
  const dayMap: Record<string, number> = {
    'sunday': 0, '日曜': 0,
    'monday': 1, '月曜': 1,
    'tuesday': 2, '火曜': 2,
    'wednesday': 3, '水曜': 3,
    'thursday': 4, '木曜': 4,
    'friday': 5, '金曜': 5,
    'saturday': 6, '土曜': 6,
  };

  if (dayMap[lower] !== undefined) {
    const targetDay = dayMap[lower];
    const d = new Date(now);
    const currentDay = d.getDay();
    let diff = targetDay - currentDay;
    if (diff <= 0) diff += 7; // Always next occurrence
    d.setDate(d.getDate() + diff);
    return getLocalDateStr(d);
  }

  // M/D format (e.g., 3/25)
  const slashMatch = lower.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (slashMatch) {
    const m = parseInt(slashMatch[1]);
    const d = parseInt(slashMatch[2]);
    const year = now.getFullYear();
    return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(lower)) {
    return lower;
  }

  // M/D/YYYY or MM/DD/YYYY
  const fullSlash = lower.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (fullSlash) {
    const m = parseInt(fullSlash[1]);
    const d = parseInt(fullSlash[2]);
    const y = parseInt(fullSlash[3]);
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  return null;
};

export const getLocalDateStr = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const formatDateDisplay = (dateStr: string | null): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('T')[0].split('-');
  return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
};
