// Pure scheduling logic: no DOM, no storage, so it can be tested on its own.

export const SESSION_TYPES = {
  footwork: { label: 'Footwork & agility', short: 'Footwork' },
  blade: { label: 'Bladework', short: 'Bladework' },
  bout: { label: 'Bouting', short: 'Bouting' },
  strength: { label: 'Strength & conditioning', short: 'Strength' },
  rest: { label: 'Rest & mobility', short: 'Rest' },
  other: { label: 'Other', short: 'Other' },
};

export const MAX_REPEAT_DAYS = 366;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function pad(n) {
  return n < 10 ? '0' + n : String(n);
}

export function toIso(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

export function parseIso(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function makeId() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function formatTime(time) {
  if (!time) return '';
  const [hours, minutes] = time.split(':');
  const hour = Number(hours);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return (hour % 12 || 12) + ':' + minutes + ' ' + suffix;
}

// All dates from startIso through endIso (inclusive) that fall on one of the weekdays (0 = Sunday).
export function expandRepeat(startIso, endIso, weekdays) {
  const dates = [];
  const end = parseIso(endIso);
  for (const day = parseIso(startIso); day <= end; day.setDate(day.getDate() + 1)) {
    if (weekdays.includes(day.getDay())) dates.push(toIso(day));
  }
  return dates;
}

// Dates to add when repeating a session that already exists on `startIso` (the one being edited):
// every matching day from `startIso` to `endIso` except the session's own day.
export function extraRepeatDates(startIso, endIso, weekdays) {
  return expandRepeat(startIso, endIso, weekdays).filter((date) => date !== startIso);
}

// True when a session matches `fields` in every detail (type, time, length, location, notes).
export function sameDetails(session, fields) {
  return ['type', 'time', 'mins', 'location', 'notes'].every((key) => session[key] === fields[key]);
}

// Days among `dates` that already hold a session with exactly the same details as `fields`,
// with those sessions. `ignoreId` leaves out the session being edited.
export function findDuplicates(sessions, fields, dates, ignoreId = null) {
  const found = [];
  for (const date of dates) {
    const existing = sessions.filter((s) => s.date === date && s.id !== ignoreId && sameDetails(s, fields));
    if (existing.length > 0) found.push({ date, existing });
  }
  return found;
}

// Returns an explanation of what is wrong with a repeat, or null if it is fine.
export function validateRepeat(startIso, endIso, weekdays) {
  if (weekdays.length === 0) return 'Pick at least one day to repeat on.';
  if (!endIso) return 'Choose the date the repeat ends.';
  if (endIso < startIso) return 'The repeat has to end on or after the day you picked.';
  const span = Math.round((parseIso(endIso) - parseIso(startIso)) / MS_PER_DAY);
  if (span > MAX_REPEAT_DAYS) return 'Repeats can run for at most one year. Pick an earlier end date.';
  if (expandRepeat(startIso, endIso, weekdays).length === 0) {
    return 'None of the chosen days fall between those dates.';
  }
  return null;
}

export function compareSessions(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const timeA = a.time || '';
  const timeB = b.time || '';
  if (timeA !== timeB) return timeA < timeB ? -1 : 1;
  return 0;
}

export function sessionsOn(sessions, iso) {
  return sessions.filter((s) => s.date === iso).sort(compareSessions);
}

// The next `count` sessions not yet done, starting from `now`. A session with no time
// stays "upcoming" for its whole day.
export function nextSessions(sessions, now, count = 3) {
  const todayIso = toIso(now);
  const nowTime = pad(now.getHours()) + ':' + pad(now.getMinutes());
  return sessions
    .filter((s) => {
      if (s.done) return false;
      if (s.date > todayIso) return true;
      return s.date === todayIso && (!s.time || s.time >= nowTime);
    })
    .sort(compareSessions)
    .slice(0, count);
}

// Sessions dated this week (Sunday to Saturday), in date and time order.
export function sessionsThisWeek(sessions, now) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  const startIso = toIso(start);
  const endIso = toIso(end);
  return sessions.filter((s) => s.date >= startIso && s.date <= endIso).sort(compareSessions);
}

// Sessions planned and finished this week, and hours finished.
export function weekStats(sessions, now) {
  const thisWeek = sessionsThisWeek(sessions, now);
  const done = thisWeek.filter((s) => s.done);
  const minutes = done.reduce((sum, s) => sum + (s.mins || 0), 0);
  return { planned: thisWeek.length, done: done.length, hours: minutes / 60 };
}

// ---------- calendar views ----------

export const VIEWS = ['month', 'week', '3day', 'day'];
const MIN_BLOCK_MINUTES = 30;
const MINUTES_PER_DAY = 24 * 60;

export function addDays(iso, count) {
  const day = parseIso(iso);
  day.setDate(day.getDate() + count);
  return toIso(day);
}

// The dates a time-grid view shows around the anchor date. The week view runs Sunday to Saturday.
export function visibleDays(view, anchorIso) {
  if (view === 'day') return [anchorIso];
  if (view === '3day') return [0, 1, 2].map((offset) => addDays(anchorIso, offset));
  const weekStart = addDays(anchorIso, -parseIso(anchorIso).getDay());
  return [0, 1, 2, 3, 4, 5, 6].map((offset) => addDays(weekStart, offset));
}

// The anchor date after pressing the previous (-1) or next (+1) arrow in a view.
export function shiftAnchor(view, anchorIso, direction) {
  if (view === 'month') {
    const day = parseIso(anchorIso);
    return toIso(new Date(day.getFullYear(), day.getMonth() + direction, 1));
  }
  const step = { week: 7, '3day': 3, day: 1 }[view];
  return addDays(anchorIso, direction * step);
}

export function timeToMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

// Places a day's timed sessions on an hourly grid. Sessions that overlap in time are
// put side by side: each result has a lane (0-based) out of `lanes` in its overlap group.
// Sessions without a time are left out; the view shows them separately.
export function layoutDay(daySessions) {
  const items = daySessions
    .filter((s) => s.time)
    .map((session) => {
      const start = timeToMinutes(session.time);
      const end = Math.min(MINUTES_PER_DAY, start + Math.max(session.mins || 0, MIN_BLOCK_MINUTES));
      return { session, start, end, lane: 0, lanes: 1 };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  let group = [];
  let laneEnds = [];
  let groupEnd = 0;
  const closeGroup = () => {
    for (const item of group) item.lanes = laneEnds.length;
    group = [];
    laneEnds = [];
  };

  for (const item of items) {
    if (group.length > 0 && item.start >= groupEnd) closeGroup();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = item.end;
    item.lane = lane;
    group.push(item);
    groupEnd = group.length === 1 ? item.end : Math.max(groupEnd, item.end);
  }
  closeGroup();
  return items;
}

// The first and last hour (exclusive end) a time grid should show: 7 am to 9 pm,
// stretched when a session falls outside that.
export function hourRange(layouts) {
  let startHour = 7;
  let endHour = 21;
  for (const item of layouts) {
    startHour = Math.min(startHour, Math.floor(item.start / 60));
    endHour = Math.max(endHour, Math.ceil(item.end / 60));
  }
  return { startHour, endHour };
}

// ---------- moving a session within its day ----------
export const MOVE_STEP_MINUTES = 15;

// The new start (in minutes after midnight) for a session dragged by `deltaMinutes`, snapped to
// the step and kept inside the visible hours so the whole session still fits.
export function moveStart(startMinutes, deltaMinutes, durationMinutes, minStart, maxEnd, step = MOVE_STEP_MINUTES) {
  const snapped = Math.round((startMinutes + deltaMinutes) / step) * step;
  return Math.max(minStart, Math.min(snapped, maxEnd - durationMinutes));
}

export function minutesToTime(minutes) {
  return pad(Math.floor(minutes / 60)) + ':' + pad(minutes % 60);
}
