import { burstConfetti } from './confetti.js';
import { $, closeOnBackdropClick, el, formState, makeDraggable, protectUnsavedChanges } from './dom.js';
import { setSwitchButtons, updateSwitch } from './pill.js';
import { currentFencerLink, disconnectFencerLink, initFencerLinks, saveFencerLink } from './fencer-links.js';
import { renderGoals } from './goals-page.js';
import { renderHydration } from './hydration.js';
import { renderNextMeals } from './next-meals.js';
import { renderRoutines } from './routines-page.js';
import { renderJournal } from './journal-page.js';
import { renderNutrition } from './nutrition.js';
import { loadJson, saveJson } from './storage.js';
import { initFont } from './fonts.js';
import { initTheme } from './theme.js';
import {
  SESSION_TYPES,
  MOVE_STEP_MINUTES,
  VIEWS,
  expandRepeat,
  extraRepeatDates,
  findDuplicates,
  formatTime,
  hourRange,
  layoutDay,
  makeId,
  minutesToTime,
  moveStart,
  scrollAfterZoom,
  nextSessions,
  parseIso,
  sessionsOn,
  sessionsThisWeek,
  shiftAnchor,
  toIso,
  validateRepeat,
  visibleDays,
  weekStats,
} from './schedule.js';

// What a new user sees until they fill in Settings: a blank name, no club and no rating.
const DEFAULT_PROFILE = { name: 'Your name', club: '', rating: '', weapon: 'Foil' };
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_CHIPS_PER_DAY = 2;

// ---------- state ----------
const storedSessions = loadJson('sessions', []);
let sessions = Array.isArray(storedSessions) ? storedSessions : [];
let profile = { ...DEFAULT_PROFILE, ...loadJson('profile', {}) };

// The calendar shows `view` around `anchorIso`. Phones open on the 3-day view because a
// month of tiny cells is hard to read there.
const VIEW_NAMES = { month: 'Month', week: 'Week', '3day': '3 Day', day: 'Day' };
// Phones get taller hours so a short session has room to wrap its details onto a second line.
const phoneScreen = window.matchMedia('(max-width: 640px)');
const defaultHourHeight = () => (phoneScreen.matches ? 64 : 52);
// How tall one hour is in the Week, 3 Day and Day views. Pinching changes it, and it is remembered.
const MIN_HOUR_HEIGHT = 28;
const MAX_HOUR_HEIGHT = 140;
const savedHourHeight = loadJson('calendarHourHeight', null);
let calendarHourPx = Number.isFinite(savedHourHeight) ? clampHourHeight(savedHourHeight) : defaultHourHeight();
let view = phoneScreen.matches ? '3day' : 'month';
let anchorIso = toIso(new Date());

// Session types currently shown on the calendar. Empty means show every type.
const activeTypes = new Set();

let dialogDate = null;
let formOpen = false;
// While set, the day dialog asks what to do about identical sessions before saving.
let conflict = null;
let editingId = null;
let confirmingDeleteId = null;
let storageWarned = false;

function persist() {
  const saved = saveJson('sessions', sessions);
  if (!saved && !storageWarned) {
    storageWarned = true;
    setStatus('Your browser is blocking saving, so changes will be lost when you close this page.');
  }
}

function longDate(iso) {
  return parseIso(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function describeDay(iso) {
  const todayIso = toIso(new Date());
  if (iso === todayIso) return 'Today';
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (iso === toIso(tomorrow)) return 'Tomorrow';
  return parseIso(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// ---------- header ----------
function renderProfile() {
  $('#fencerName').textContent = profile.name;
  const parts = [profile.weapon, profile.club || 'No club attached', profile.rating ? 'Rating ' + profile.rating : 'Unrated'];
  $('#fencerDetails').textContent = parts.join(' · ');
}

function renderNextUp() {
  const list = $('#nextList');
  list.replaceChildren();
  const upcoming = nextSessions(sessions, new Date(), 3);
  if (upcoming.length === 0) {
    list.append(el('li', { class: 'empty', text: 'Nothing scheduled yet. Tap a day on the calendar to add a session.' }));
    return;
  }
  for (const session of upcoming) {
    const detail = [formatTime(session.time), session.mins ? session.mins + ' min' : ''].filter(Boolean).join(' · ');
    const what = el('div', { class: 'next-what' }, el('b', { text: SESSION_TYPES[session.type].label }));
    if (session.location) what.append(el('div', { class: 'next-where', text: session.location }));
    list.append(
      el('li', { class: 'next-item type-' + session.type },
        el('div', {}, el('div', { class: 'next-when', text: describeDay(session.date) }),
          el('div', { class: 'next-time', text: detail || 'Any time' })),
        what),
    );
  }
}

// Fills a progress ring's arc: `radius` is the circle's radius in its SVG.
function setRing(fill, radius, fraction) {
  fill.style.strokeDashoffset = String(2 * Math.PI * radius * (1 - fraction));
}

function renderStats() {
  const stats = weekStats(sessions, new Date());
  const fraction = stats.planned === 0 ? 0 : stats.done / stats.planned;
  const summary = stats.done + ' of ' + stats.planned + ' sessions done this week';
  $('#ringCount').textContent = stats.done + '/' + stats.planned;
  setRing($('#ringFill'), 52, fraction);
  $('#weekRing').setAttribute('aria-label', summary);
  $('#statHours').textContent = String(Math.round(stats.hours * 10) / 10);

  // The small ring in the header keeps the week's progress in view on the other tabs.
  $('#miniRingCount').textContent = stats.done + '/' + stats.planned;
  setRing($('#miniRingFill'), 18, fraction);
  const hours = Math.round(stats.hours * 10) / 10;
  const hoursText = hours + (hours === 1 ? ' hour' : ' hours') + ' trained';
  $('#miniRingHours').textContent = hoursText;
  $('#miniRing').setAttribute('aria-label', summary + ', ' + hoursText + '. Go to Schedule.');
}

const weekDialog = $('#weekDialog');

function openCompletedThisWeek() {
  const completed = sessionsThisWeek(sessions, new Date()).filter((s) => s.done);
  const list = $('#weekList');
  list.replaceChildren();
  if (completed.length === 0) {
    list.append(el('p', { class: 'empty', text: 'No sessions are marked done yet this week. Open a day and tick "Done" when you finish a session.' }));
  }
  for (const session of completed) {
    const detail = [formatTime(session.time), session.mins ? session.mins + ' min' : '', session.location]
      .filter(Boolean).join(' · ');
    const card = el('div', { class: 'session-card done type-' + session.type },
      el('div', { class: 'session-title', text: SESSION_TYPES[session.type].label }),
      el('div', { class: 'session-meta', text: longDate(session.date) + (detail ? ' · ' + detail : '') }));
    if (session.notes) card.append(el('p', { class: 'session-notes', text: session.notes }));
    list.append(card);
  }
  weekDialog.showModal();
}

// ---------- calendar ----------
function visibleSessionsByDate() {
  const byDate = new Map();
  for (const session of sessions) {
    if (activeTypes.size > 0 && !activeTypes.has(session.type)) continue;
    if (!byDate.has(session.date)) byDate.set(session.date, []);
    byDate.get(session.date).push(session);
  }
  return byDate;
}

function calendarTitle() {
  const anchor = parseIso(anchorIso);
  if (view === 'month') return anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  if (view === 'day') return anchor.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const days = visibleDays(view, anchorIso);
  const first = parseIso(days[0]);
  const last = parseIso(days[days.length - 1]);
  const short = { month: 'short', day: 'numeric' };
  const sameYear = first.getFullYear() === last.getFullYear();
  const sameMonth = sameYear && first.getMonth() === last.getMonth();
  const start = first.toLocaleDateString(undefined, sameYear ? short : { ...short, year: 'numeric' });
  const end = sameMonth ? String(last.getDate()) : last.toLocaleDateString(undefined, short);
  return start + ' – ' + end + ', ' + last.getFullYear();
}

function renderViewSwitch() {
  setSwitchButtons($('#viewSwitch'), VIEWS.map((name) => el('button', {
    class: 'view-btn',
    type: 'button',
    text: VIEW_NAMES[name],
    'aria-pressed': String(name === view),
    onclick: () => {
      view = name;
      renderViewSwitch();
      renderCalendar();
    },
  })), '[aria-pressed="true"]');
  const unit = { month: 'month', week: 'week', '3day': '3 days', day: 'day' }[view];
  $('#prevBtn').setAttribute('aria-label', 'Previous ' + unit);
  $('#nextBtn').setAttribute('aria-label', 'Next ' + unit);
}

function renderCalendar() {
  $('#calendarTitle').textContent = calendarTitle();
  // Give the time views their height before the Month view is hidden. Otherwise the page is
  // briefly shorter, and the browser throws away how far down the page you had scrolled.
  if (view !== 'month') fitTimeViewToMonth();
  $('#monthView').hidden = view !== 'month';
  $('#timeView').hidden = view === 'month';
  if (view === 'month') renderMonth();
  else renderTimeGrid();
}

function clampHourHeight(px) {
  return Math.max(MIN_HOUR_HEIGHT, Math.min(MAX_HOUR_HEIGHT, px));
}

// The Week, 3 Day and Day views are exactly as tall as the Month view (so the page does not jump
// when switching) and scroll inside that height. The Month view is measured for the month being shown.
function fitTimeViewToMonth() {
  const monthView = $('#monthView');
  const wasHidden = monthView.hidden;
  if (wasHidden) {
    renderMonth();
    monthView.hidden = false;
  }
  const height = monthView.getBoundingClientRect().height;
  if (wasHidden) monthView.hidden = true;
  $('#timeView').style.height = height + 'px';
}

function renderMonth() {
  const anchor = parseIso(anchorIso);
  const viewYear = anchor.getFullYear();
  const viewMonth = anchor.getMonth();
  const monthStart = new Date(viewYear, viewMonth, 1);
  const byDate = visibleSessionsByDate();

  const offset = monthStart.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cellCount = Math.ceil((offset + daysInMonth) / 7) * 7;
  const todayIso = toIso(new Date());
  const cells = [];

  for (let i = 0; i < cellCount; i++) {
    const day = new Date(viewYear, viewMonth, 1 - offset + i);
    const iso = toIso(day);
    const daySessions = sessionsOn(byDate.get(iso) || [], iso);
    const classes = ['cal-cell'];
    if (day.getMonth() !== viewMonth) classes.push('outside');
    if (iso === todayIso) classes.push('today');

    const count = daySessions.length;
    const label = longDate(iso) + ', ' + (count === 0 ? 'no sessions' : count + (count === 1 ? ' session' : ' sessions'));
    const cell = el('button', { class: classes.join(' '), type: 'button', 'aria-label': label, 'data-date': iso },
      el('span', { class: 'cal-date', text: String(day.getDate()) }));

    for (const session of daySessions.slice(0, MAX_CHIPS_PER_DAY)) {
      const text = (session.time ? formatTime(session.time).replace(':00', '') + ' ' : '') + SESSION_TYPES[session.type].short;
      cell.append(el('span', { class: 'chip type-' + session.type + (session.done ? ' done' : '') },
        el('span', { class: 'chip-text', text })));
    }
    if (count > MAX_CHIPS_PER_DAY) cell.append(el('span', { class: 'more', text: '+' + (count - MAX_CHIPS_PER_DAY) + ' more' }));
    cell.addEventListener('click', () => openDay(iso));
    cells.push(cell);
  }
  $('#calGrid').replaceChildren(...cells);
}

function hourLabel(hour) {
  return formatTime(String(hour).padStart(2, '0') + ':00').replace(':00', '');
}

function renderTimeGrid() {
  const days = visibleDays(view, anchorIso);
  const byDate = visibleSessionsByDate();
  const todayIso = toIso(new Date());
  const layouts = days.map((iso) => layoutDay(sessionsOn(byDate.get(iso) || [], iso)));
  const { startHour, endHour } = hourRange(layouts.flat());
  const hours = endHour - startHour;
  const scroller = $('#timeView');
  const previousScroll = scroller.scrollTop;
  const viewKey = view + '|' + anchorIso;
  const sameView = viewKey === shownTimeView;
  shownTimeView = viewKey;
  fitTimeViewToMonth();

  const grid = el('div', { class: 'tg' });
  grid.style.setProperty('--cols', String(days.length));
  grid.style.setProperty('--hours', String(hours));
  grid.style.setProperty('--hour-h', calendarHourPx + 'px');
  // Everything in the grid is placed in "hours" of --hour-h, so zooming only changes that one value.
  const atHour = (hoursFromTop) => 'calc(var(--hour-h) * ' + hoursFromTop + ')';

  const head = el('div', { class: 'tg-row tg-head' }, el('div'));
  const anytime = el('div', { class: 'tg-row tg-anytime' }, el('div', { class: 'tg-anytime-label', text: 'Any time' }));
  const body = el('div', { class: 'tg-row' });
  const gutter = el('div', { class: 'tg-gutter' });
  for (let hour = startHour; hour < endHour; hour++) {
    const label = el('span', { class: 'tg-hour-label', text: hourLabel(hour) });
    label.style.top = atHour(hour - startHour);
    if (hour === startHour) label.classList.add('first');
    gutter.append(label);
  }
  body.append(gutter);

  days.forEach((iso, index) => {
    const day = parseIso(iso);
    const daySessions = sessionsOn(byDate.get(iso) || [], iso);
    const count = daySessions.length;
    const dayLabel = longDate(iso) + ', ' + (count === 0 ? 'no sessions' : count + (count === 1 ? ' session' : ' sessions'));
    head.append(el('button', { class: 'tg-day-btn' + (iso === todayIso ? ' today' : ''), type: 'button', 'aria-label': dayLabel, onclick: () => openDay(iso) },
      el('span', { text: day.toLocaleDateString(undefined, { weekday: 'short' }) }),
      el('span', { class: 'tg-day-num', text: String(day.getDate()) })));

    const anytimeCell = el('div', { class: 'tg-anytime-cell' });
    for (const session of daySessions.filter((s) => !s.time)) anytimeCell.append(anyTimeChip(session, days, index));
    anytime.append(anytimeCell);

    const column = el('div', { class: 'tg-col' });
    column.addEventListener('click', (event) => {
      const hour = startHour + Math.floor((event.clientY - column.getBoundingClientRect().top) / calendarHourPx);
      openDay(iso, String(Math.min(hour, endHour - 1)).padStart(2, '0') + ':00');
    });
    for (const item of layouts[index]) column.append(sessionBlock(item, iso, { startHour, endHour }));
    if (iso === todayIso) {
      const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
      if (nowMinutes >= startHour * 60 && nowMinutes < endHour * 60) {
        const line = el('div', { class: 'now-line' });
        line.style.top = atHour((nowMinutes - startHour * 60) / 60);
        column.append(line);
      }
    }
    body.append(column);
  });

  // The day names (and the "Any time" strip) stay at the top while the hours scroll under them.
  const top = el('div', { class: 'tg-top' }, head);
  const hasUntimed = days.some((iso) => (byDate.get(iso) || []).some((s) => !s.time));
  if (hasUntimed) top.append(anytime);
  grid.append(top, body);
  scroller.replaceChildren(grid);
  setHourHeight(calendarHourPx, scroller.getBoundingClientRect().top);
  if (sameView) scroller.scrollTop = previousScroll;
  else scroller.scrollTop = firstScrollPosition(days, layouts, startHour);
}

// The view that was last drawn, so a redraw of the same days keeps where you had scrolled to.
let shownTimeView = '';

// Where a freshly opened Week, 3 Day or Day view starts: around the current time if today is
// showing, otherwise at the earliest session, otherwise at the top.
function firstScrollPosition(days, layouts, startHour) {
  const now = new Date();
  let minutes = null;
  if (days.includes(toIso(now))) minutes = now.getHours() * 60 + now.getMinutes();
  else {
    const starts = layouts.flat().map((item) => item.start);
    if (starts.length > 0) minutes = Math.min(...starts);
  }
  if (minutes === null) return 0;
  const hoursFromTop = Math.max(0, (minutes - startHour * 60) / 60 - 1);
  return hoursFromTop * calendarHourPx;
}

// Zooms the time views to `px` per hour. `focalY` is the screen height of the pinch (or pointer),
// and the scroll position is adjusted so the time under it stays put.
function setHourHeight(px, focalY) {
  const scroller = $('#timeView');
  const grid = scroller.querySelector('.tg');
  if (!grid) return;
  const headerHeight = scroller.querySelector('.tg-top').offsetHeight;
  // Zooming out stops once the day just fills the box, so there is never an empty gap below it.
  const hoursShown = Number(grid.style.getPropertyValue('--hours'));
  const fillHeight = (scroller.clientHeight - headerHeight) / hoursShown;
  const next = Math.max(clampHourHeight(px), Math.min(fillHeight, MAX_HOUR_HEIGHT));
  if (next === calendarHourPx) return;
  const focalOffset = focalY - scroller.getBoundingClientRect().top;
  const scrollTop = scrollAfterZoom(scroller.scrollTop, focalOffset, headerHeight, calendarHourPx, next);
  calendarHourPx = next;
  grid.style.setProperty('--hour-h', next + 'px');
  scroller.scrollTop = scrollTop;
  saveJson('calendarHourHeight', next);
}

// Pinching (two fingers on a phone, a two-finger pinch on a trackpad) zooms the hours in and out.
(function enablePinchZoom() {
  const scroller = $('#timeView');
  // A trackpad pinch arrives as a wheel event with ctrlKey set (Chrome, Edge, Firefox).
  scroller.addEventListener('wheel', (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    setHourHeight(calendarHourPx * Math.exp(-event.deltaY * 0.01), event.clientY);
  }, { passive: false });

  // Safari reports a trackpad pinch as gesture events instead.
  let gestureStart = calendarHourPx;
  scroller.addEventListener('gesturestart', (event) => {
    event.preventDefault();
    gestureStart = calendarHourPx;
  });
  scroller.addEventListener('gesturechange', (event) => {
    event.preventDefault();
    setHourHeight(gestureStart * event.scale, event.clientY);
  });

  // Two fingers on a touch screen.
  let pinch = null;
  const spread = (touches) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  scroller.addEventListener('touchstart', (event) => {
    if (event.touches.length === 2) pinch = { spread: spread(event.touches), px: calendarHourPx };
  }, { passive: true });
  scroller.addEventListener('touchmove', (event) => {
    if (!pinch || event.touches.length !== 2) return;
    event.preventDefault();
    const middleY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
    setHourHeight(pinch.px * (spread(event.touches) / pinch.spread), middleY);
  }, { passive: false });
  const endPinch = (event) => {
    if (event.touches.length < 2) pinch = null;
  };
  scroller.addEventListener('touchend', endPinch);
  scroller.addEventListener('touchcancel', endPinch);
})();

// The Month view's height changes with the window, so the other views follow it.
window.addEventListener('resize', () => {
  if (view !== 'month') fitTimeViewToMonth();
});

// Sessions shorter than this put their time and length beside the type instead of stacked
// under it (a stacked second line would be cut off). In a column too narrow for both, the
// details wrap onto a second line.
const COMPACT_BLOCK_MINUTES = 45;

function sessionBlock(item, iso, bounds) {
  const { startHour } = bounds;
  const { session } = item;
  const minutes = item.end - item.start;
  const compact = minutes < COMPACT_BLOCK_MINUTES;
  const typeName = SESSION_TYPES[session.type].short;
  // A short block's height already shows how long it is, so it only needs the start time.
  const durationText = session.mins && !compact ? session.mins + ' min' : '';
  const timeDetail = (time) => [formatTime(time), durationText].filter(Boolean).join(' · ');
  const timeLabel = el('span', { class: 'tg-sub', text: timeDetail(session.time) });
  const block = el('button', {
    class: 'tg-block type-' + session.type + (session.done ? ' done' : '') + (compact ? ' compact' : ''),
    type: 'button',
    'data-id': session.id,
    title: typeName + ', ' + formatTime(session.time) + (session.mins ? ', ' + session.mins + ' min' : '') + (session.location ? ', ' + session.location : ''),
    'aria-label': SESSION_TYPES[session.type].label + ' at ' + formatTime(session.time) + ' on ' + longDate(iso) + '. Drag, or press the up and down arrow keys, to move it.',
  }, el('b', { text: typeName }), ' ', timeLabel);
  if (session.location && minutes >= 60) block.append(el('span', { class: 'tg-sub', text: session.location }));
  const positionAt = (start) => {
    block.style.top = 'calc(var(--hour-h) * ' + (start - startHour * 60) / 60 + ')';
  };
  positionAt(item.start);
  block.style.height = 'max(calc(var(--hour-h) * ' + minutes / 60 + ' - 2px), 20px)';
  block.style.left = 'calc(' + (item.lane / item.lanes) * 100 + '% + 2px)';
  block.style.width = 'calc(' + 100 / item.lanes + '% - 4px)';

  let ignoreNextClick = false;
  block.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!ignoreNextClick) openDay(iso);
  });
  enableMoveWithinDay(block, item, bounds, {
    preview: (start) => {
      positionAt(start);
      timeLabel.textContent = timeDetail(minutesToTime(start));
    },
    finished: (moved) => {
      ignoreNextClick = true;
      setTimeout(() => { ignoreNextClick = false; }, 0);
      if (moved) moveSessionTo(session, moved);
    },
  });
  return block;
}

// Saves a session's new start time and redraws, keeping its length.
function moveSessionTo(session, startMinutes) {
  session.time = minutesToTime(startMinutes);
  persist();
  renderAll();
  focusSession(session.id);
}

// Saves a session's new date (an "any time" session has no time to change) and redraws.
function moveSessionToDay(session, iso) {
  session.date = iso;
  persist();
  renderAll();
  focusSession(session.id);
}

function focusSession(id) {
  const moved = document.querySelector('[data-id="' + id + '"]');
  if (moved) moved.focus();
}

// Lets a session block be dragged up or down within its own day, keeping its length. The arrow
// keys move it too. `hooks.preview(start)` shows the block at a new start while dragging, and
// `hooks.finished(newStart)` runs on release (newStart is null if it did not move).
function enableMoveWithinDay(block, item, bounds, hooks) {
  const { startHour, endHour } = bounds;
  const duration = item.end - item.start;
  const moveBy = (delta) => moveStart(item.start, delta, duration, startHour * 60, endHour * 60);
  let latest = item.start;

  makeDraggable(block, {
    move: (event, dx, dy) => {
      latest = moveBy((dy * 60) / calendarHourPx);
      hooks.preview(latest);
    },
    drop: () => {
      hooks.finished(latest === item.start ? null : latest);
      latest = item.start;
    },
    cancel: () => {
      hooks.preview(item.start);
      latest = item.start;
    },
  });
  block.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const next = moveBy(event.key === 'ArrowUp' ? -MOVE_STEP_MINUTES : MOVE_STEP_MINUTES);
    if (next !== item.start) hooks.finished(next);
  });
}

// ---------- moving onto an identical session ----------
const moveDuplicateDialog = $('#moveDuplicateDialog');
let pendingMove = null;

// Asks whether to replace the identical session(s) already on `targetIso` or keep both.
function askAboutDuplicate(session, targetIso, existing) {
  pendingMove = { session, targetIso, existing };
  const detail = [SESSION_TYPES[session.type].label, session.mins ? session.mins + ' min' : '', session.location].filter(Boolean).join(' · ');
  const many = existing.length > 1 ? ' (' + existing.length + ' identical sessions)' : '';
  $('#moveDuplicateText').textContent = longDate(targetIso) + ' already has a session with exactly the same details: '
    + detail + many + '. Replace it with the session you are moving, or keep both?';
  moveDuplicateDialog.showModal();
}

function finishPendingMove(replace) {
  const { session, targetIso, existing } = pendingMove;
  pendingMove = null;
  moveDuplicateDialog.close();
  if (replace) sessions = sessions.filter((s) => !existing.some((e) => e.id === s.id));
  moveSessionToDay(session, targetIso);
}

$('#moveDuplicateKeep').addEventListener('click', () => finishPendingMove(false));
$('#moveDuplicateReplace').addEventListener('click', () => finishPendingMove(true));
for (const id of ['#moveDuplicateCancel', '#moveDuplicateClose']) {
  $(id).addEventListener('click', () => moveDuplicateDialog.close());
}
// Closing the prompt any other way (Escape, clicking outside) leaves the session where it was.
moveDuplicateDialog.addEventListener('close', () => {
  pendingMove = null;
});
closeOnBackdropClick(moveDuplicateDialog);

// A session with no time, shown in the "Any time" strip. It can be dragged sideways onto another
// day shown in the view (the left and right arrow keys move it too); tapping it opens its day.
function anyTimeChip(session, days, dayIndex) {
  const chip = el('button', {
    class: 'chip type-' + session.type + (session.done ? ' done' : ''),
    type: 'button',
    'data-id': session.id,
    'aria-label': SESSION_TYPES[session.type].label + ', any time, on ' + longDate(days[dayIndex])
      + '. Drag, or press the left and right arrow keys, to move it to another day.',
  }, el('span', { class: 'chip-text', text: SESSION_TYPES[session.type].short }));

  let ignoreNextClick = false;
  chip.addEventListener('click', () => {
    if (!ignoreNextClick) openDay(days[dayIndex]);
  });

  const dayCells = () => [...document.querySelectorAll('.tg-anytime-cell')];
  const dayColumns = () => [...document.querySelectorAll('.tg-col')];
  // Which day column the pointer is over (by its sideways position), or -1 if none.
  const dayAt = (x) => dayCells().findIndex((cell) => {
    const box = cell.getBoundingClientRect();
    return x >= box.left && x < box.right;
  });
  const highlight = (target) => {
    dayCells().forEach((cell, index) => cell.classList.toggle('drop-target', index === target && target !== dayIndex));
    dayColumns().forEach((column, index) => column.classList.toggle('drop-target', index === target && target !== dayIndex));
  };
  const reset = () => {
    chip.style.transform = '';
    highlight(-1);
  };
  const finish = (moved) => {
    ignoreNextClick = true;
    setTimeout(() => { ignoreNextClick = false; }, 0);
    reset();
    if (moved === null) return;
    const target = days[moved];
    const duplicates = findDuplicates(sessions, session, [target], session.id);
    if (duplicates.length === 0) moveSessionToDay(session, target);
    else askAboutDuplicate(session, target, duplicates[0].existing);
  };

  makeDraggable(chip, {
    move: (event, dx, dy) => {
      chip.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
      highlight(dayAt(event.clientX));
    },
    drop: (event) => {
      const target = dayAt(event.clientX);
      finish(target === -1 || target === dayIndex ? null : target);
    },
    cancel: reset,
  });
  chip.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const target = dayIndex + (event.key === 'ArrowLeft' ? -1 : 1);
    if (target >= 0 && target < days.length) finish(target);
  });
  return chip;
}

function renderTypeFilters() {
  const buttons = Object.entries(SESSION_TYPES).map(([type, info]) => {
    const selected = activeTypes.has(type);
    return el('button', {
      class: 'filter-chip type-' + type,
      type: 'button',
      'aria-pressed': String(selected),
      onclick: () => {
        if (selected) activeTypes.delete(type);
        else activeTypes.add(type);
        renderTypeFilters();
        renderCalendar();
      },
    }, el('i'), info.short);
  });
  if (activeTypes.size > 0) {
    buttons.push(el('button', {
      class: 'filter-clear',
      type: 'button',
      text: 'Show all',
      onclick: () => {
        activeTypes.clear();
        renderTypeFilters();
        renderCalendar();
      },
    }));
  }
  $('#typeFilters').replaceChildren(...buttons);
}

function renderAll() {
  renderProfile();
  renderNextUp();
  renderStats();
  renderCalendar();
}

// ---------- day dialog ----------
const dayDialog = $('#dayDialog');

function setStatus(message) {
  $('#dayStatus').textContent = message;
}

// Opens a day. With `presetTime` (from tapping an empty time slot) it goes straight to the
// add-session form with that time filled in.
function openDay(iso, presetTime = '') {
  dialogDate = iso;
  formOpen = false;
  editingId = null;
  confirmingDeleteId = null;
  setStatus('');
  renderDay();
  dayDialog.showModal();
  if (presetTime) openForm(null, presetTime);
}

function renderDay() {
  $('#dayTitle').textContent = longDate(dialogDate);
  const list = $('#dayList');
  list.replaceChildren();
  $('#sessionForm').hidden = !formOpen || Boolean(conflict);
  $('#conflictPanel').hidden = !conflict;
  list.hidden = formOpen;
  $('#addSessionBtn').hidden = formOpen;
  dayGuard.reset();
  if (formOpen) return;

  const daySessions = sessionsOn(sessions, dialogDate);
  if (daySessions.length === 0) {
    list.append(el('p', { class: 'empty day-empty', text: 'No sessions on this day yet.' }));
    return;
  }
  for (const session of daySessions) list.append(sessionCard(session));
}

function sessionCard(session) {
  const detail = [formatTime(session.time), session.mins ? session.mins + ' min' : '', session.location]
    .filter(Boolean).join(' · ');
  const doneBox = el('input', { type: 'checkbox' });
  doneBox.checked = session.done;
  doneBox.addEventListener('change', () => {
    session.done = doneBox.checked;
    const spot = doneBox.getBoundingClientRect();
    persist();
    renderAll();
    renderDay();
    if (session.done) burstConfetti(spot.left + spot.width / 2, spot.top + spot.height / 2);
  });

  const card = el('div', { class: 'session-card type-' + session.type + (session.done ? ' done' : '') },
    el('div', { class: 'session-title', text: SESSION_TYPES[session.type].label }));
  if (detail) card.append(el('div', { class: 'session-meta', text: detail }));
  if (session.notes) card.append(el('p', { class: 'session-notes', text: session.notes }));
  card.append(el('div', { class: 'session-actions' },
    el('label', { class: 'done-toggle' }, doneBox, 'Done'),
    el('button', { class: 'btn ghost small', type: 'button', text: 'Edit', onclick: () => openForm(session) }),
    el('button', {
      class: 'btn danger small',
      type: 'button',
      text: 'Delete',
      onclick: () => {
        confirmingDeleteId = session.id;
        renderDay();
      },
    })));
  if (confirmingDeleteId === session.id) card.append(deleteConfirmation(session));
  return card;
}

function deleteConfirmation(session) {
  const row = el('div', { class: 'confirm-row' }, el('p', { text: 'Delete this session?' }));
  row.append(el('button', {
    class: 'btn danger small',
    type: 'button',
    text: session.seriesId ? 'Just this one' : 'Yes, delete',
    onclick: () => deleteSessions((s) => s.id === session.id, 'Session deleted.'),
  }));
  if (session.seriesId) {
    row.append(el('button', {
      class: 'btn danger small',
      type: 'button',
      text: 'This and all later sessions',
      onclick: () => deleteSessions((s) => s.seriesId === session.seriesId && s.date >= session.date, 'Deleted this and all later sessions.'),
    }));
  }
  row.append(el('button', {
    class: 'btn ghost small',
    type: 'button',
    text: 'Keep it',
    onclick: () => {
      confirmingDeleteId = null;
      renderDay();
    },
  }));
  return row;
}

function deleteSessions(matches, message) {
  sessions = sessions.filter((s) => !matches(s));
  confirmingDeleteId = null;
  persist();
  renderAll();
  renderDay();
  setStatus(message);
}

// ---------- session form ----------
const typeSelect = $('#fType');
for (const [type, info] of Object.entries(SESSION_TYPES)) {
  typeSelect.append(el('option', { value: type, text: info.short }));
}

const dayChips = $('#dayChips');
WEEKDAY_NAMES.forEach((name, index) => {
  dayChips.append(el('button', {
    class: 'day-chip',
    type: 'button',
    text: name,
    'data-day': String(index),
    'aria-pressed': 'false',
    onclick: (event) => {
      const chip = event.currentTarget;
      chip.setAttribute('aria-pressed', chip.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      updateRepeatSummary();
    },
  }));
});

function selectedWeekdays() {
  return [...dayChips.children].filter((c) => c.getAttribute('aria-pressed') === 'true').map((c) => Number(c.dataset.day));
}

function setSelectedWeekdays(days) {
  for (const chip of dayChips.children) {
    chip.setAttribute('aria-pressed', days.includes(Number(chip.dataset.day)) ? 'true' : 'false');
  }
}

function plural(count, word) {
  return count + ' ' + word + (count === 1 ? '' : 's');
}

// The values currently typed into the session form (length is not checked here).
function readFields() {
  const minsText = $('#fMins').value.trim();
  return {
    type: typeSelect.value,
    time: $('#fTime').value,
    mins: minsText === '' ? 0 : Number(minsText),
    location: $('#fLocation').value.trim(),
    notes: $('#fNotes').value.trim(),
  };
}

// What saving the form would do: the days that get a new session, and the days to check for
// identical sessions. Returns { error } when a repeat is not valid.
function planSave() {
  const repeating = $('#fRepeat').checked;
  const weekdays = selectedWeekdays();
  const until = $('#fUntil').value;
  if (repeating) {
    const error = validateRepeat(dialogDate, until, weekdays);
    if (error) return { error };
  }
  if (editingId) {
    const addDates = repeating ? extraRepeatDates(dialogDate, until, weekdays) : [];
    if (repeating && addDates.length === 0) return { error: 'There are no other matching days between those dates.' };
    return { repeating, until, addDates, checkDates: [dialogDate, ...addDates] };
  }
  const addDates = repeating ? expandRepeat(dialogDate, until, weekdays) : [dialogDate];
  return { repeating, until, addDates, checkDates: addDates };
}

function updateRepeatSummary() {
  const summary = $('#repeatSummary');
  const plan = planSave();
  summary.classList.toggle('invalid', Boolean(plan.error));
  if (plan.error) {
    summary.textContent = plan.error;
    return;
  }
  const noun = editingId ? 'more session' : 'session';
  let text = 'Adds ' + plural(plan.addDates.length, noun) + ', through ' + longDate(plan.until) + '.';
  const duplicates = findDuplicates(sessions, readFields(), plan.checkDates, editingId).length;
  if (duplicates > 0) {
    text += ' ' + plural(duplicates, 'day') + ' already ' + (duplicates === 1 ? 'has' : 'have') + ' an identical session, so you will be asked what to do.';
  }
  summary.textContent = text;
}

function openForm(session, presetTime = '') {
  formOpen = true;
  conflict = null;
  editingId = session ? session.id : null;
  confirmingDeleteId = null;
  setStatus('');
  $('#formError').textContent = '';
  $('#formTitle').textContent = session ? 'Edit session' : 'Add a session';
  $('#saveSession').textContent = session ? 'Save changes' : 'Save session';
  typeSelect.value = session ? session.type : 'footwork';
  $('#fTime').value = session ? session.time : presetTime;
  $('#fMins').value = session ? session.mins : 60;
  $('#fLocation').value = session ? session.location : '';
  $('#fNotes').value = session ? session.notes : '';
  $('#fRepeat').checked = false;
  $('#fUntil').value = '';
  setSelectedWeekdays([parseIso(dialogDate).getDay()]);
  $('#repeatOptions').hidden = true;
  $('#editNote').hidden = !session;
  renderDay();
  typeSelect.focus();
}

function closeForm() {
  formOpen = false;
  conflict = null;
  editingId = null;
  renderDay();
}

$('#fRepeat').addEventListener('change', (event) => {
  $('#repeatOptions').hidden = !event.target.checked;
  if (event.target.checked) updateRepeatSummary();
});
$('#fUntil').addEventListener('input', updateRepeatSummary);
// The identical-session check depends on every detail, so re-check when any of them change.
for (const field of [typeSelect, $('#fTime'), $('#fMins'), $('#fLocation'), $('#fNotes')]) {
  field.addEventListener('change', () => {
    if ($('#fRepeat').checked) updateRepeatSummary();
  });
}
$('#addSessionBtn').addEventListener('click', () => openForm(null));
$('#cancelForm').addEventListener('click', closeForm);

$('#sessionForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const fields = readFields();
  if (!Number.isInteger(fields.mins) || fields.mins < 0 || fields.mins > 600) {
    $('#formError').textContent = 'Duration must be a whole number of minutes between 0 and 600.';
    return;
  }
  const plan = planSave();
  if (plan.error) {
    $('#formError').textContent = plan.error;
    return;
  }
  const duplicates = findDuplicates(sessions, fields, plan.checkDates, editingId);
  if (duplicates.length === 0) {
    applySave(fields, plan, []);
    return;
  }
  conflict = { fields, plan, duplicates, choices: new Map(duplicates.map((d) => [d.date, 'keep'])) };
  renderConflict();
  renderDay();
});

// Saves the form: updates the edited session, adds the new ones, and first removes the
// identical sessions the user chose to replace.
function applySave(fields, plan, replaceIds) {
  if (replaceIds.length > 0) sessions = sessions.filter((s) => !replaceIds.includes(s.id));
  let seriesId = null;
  if (editingId) {
    const session = sessions.find((s) => s.id === editingId);
    Object.assign(session, fields);
    if (plan.repeating) session.seriesId = session.seriesId || makeId();
    seriesId = session.seriesId;
  } else if (plan.repeating) {
    seriesId = makeId();
  }
  for (const date of plan.addDates) {
    sessions.push({ id: makeId(), ...(seriesId ? { seriesId } : {}), date, done: false, ...fields });
  }
  const parts = [];
  if (editingId) {
    parts.push('Session updated.');
    if (plan.addDates.length > 0) parts.push('Added ' + plural(plan.addDates.length, 'more session') + '.');
  } else {
    parts.push(plan.addDates.length === 1 ? 'Session added.' : 'Added ' + plural(plan.addDates.length, 'session') + '.');
  }
  if (replaceIds.length > 0) parts.push('Replaced ' + plural(replaceIds.length, 'identical session') + '.');
  finishSave(parts.join(' '));
}

// ---------- identical sessions ----------
// Shown when a save would create a session identical to one already on that day: the user
// picks, for each such day, to keep both sessions or replace the existing one.
function renderConflict() {
  const { duplicates, choices } = conflict;
  $('#conflictIntro').textContent = duplicates.length === 1
    ? 'This day already has a session with exactly the same details. Replace the existing session, or keep both?'
    : plural(duplicates.length, 'day') + ' already have a session with exactly the same details. For each day, replace the existing session or keep both.';
  $('#conflictBulk').hidden = duplicates.length === 1;
  $('#conflictList').replaceChildren(...duplicates.map(({ date, existing }) => {
    const first = existing[0];
    const detail = [SESSION_TYPES[first.type].label, formatTime(first.time), first.mins ? first.mins + ' min' : '', first.location]
      .filter(Boolean).join(' · ') + (existing.length > 1 ? ' (' + existing.length + ' identical sessions)' : '');
    const choiceButton = (value, label) => el('button', {
      class: 'view-btn',
      type: 'button',
      text: label,
      'aria-pressed': String(choices.get(date) === value),
      onclick: () => {
        choices.set(date, value);
        renderConflict();
      },
    });
    return el('li', { class: 'conflict-item' },
      el('div', { class: 'conflict-date', text: longDate(date) }),
      el('div', { class: 'conflict-detail', text: detail }),
      el('div', { class: 'view-switch conflict-choice', role: 'group', 'aria-label': 'What to do on ' + longDate(date) },
        choiceButton('keep', 'Keep both'), choiceButton('replace', 'Replace existing')));
  }));
}

function setAllChoices(value) {
  for (const { date } of conflict.duplicates) conflict.choices.set(date, value);
  renderConflict();
}
$('#conflictKeepAll').addEventListener('click', () => setAllChoices('keep'));
$('#conflictReplaceAll').addEventListener('click', () => setAllChoices('replace'));
$('#conflictBack').addEventListener('click', () => {
  conflict = null;
  renderDay();
});
$('#conflictApply').addEventListener('click', () => {
  const { fields, plan, duplicates, choices } = conflict;
  const replaceIds = duplicates
    .filter(({ date }) => choices.get(date) === 'replace')
    .flatMap(({ existing }) => existing.map((s) => s.id));
  applySave(fields, plan, replaceIds);
});

function finishSave(message) {
  persist();
  formOpen = false;
  conflict = null;
  editingId = null;
  renderAll();
  renderDay();
  setStatus(message);
}

// ---------- dialogs ----------
// The day box holds a form while a session is being added or edited; clicking outside then asks
// to save instead of closing.
const dayGuard = protectUnsavedChanges(dayDialog, () => [
  formOpen ? formState($('#sessionForm')) : null,
  conflict ? formState($('#conflictPanel')) : null,
]);
closeOnBackdropClick(weekDialog);
$('#weekClose').addEventListener('click', () => weekDialog.close());
$('#viewCompletedBtn').addEventListener('click', openCompletedThisWeek);
$('#dayClose').addEventListener('click', () => dayDialog.close());

// ---------- settings dialog (profile and appearance) ----------
const settingsDialog = $('#settingsDialog');
const settingsGuard = protectUnsavedChanges(settingsDialog, () => formState($('#profileForm')));
$('#settingsClose').addEventListener('click', () => settingsDialog.close());
$('#cancelProfile').addEventListener('click', () => settingsDialog.close());

$('#settingsBtn').addEventListener('click', () => {
  $('#pName').value = profile.name;
  $('#pClub').value = profile.club;
  $('#pRating').value = profile.rating;
  $('#pWeapon').value = profile.weapon;
  $('#pTracker').value = currentFencerLink();
  $('#pTrackerDisconnect').hidden = currentFencerLink() === '';
  $('#profileError').textContent = '';
  settingsDialog.showModal();
  settingsGuard.reset();
});

$('#pTrackerDisconnect').addEventListener('click', () => {
  disconnectFencerLink();
  $('#pTracker').value = '';
  $('#pTrackerDisconnect').hidden = true;
  settingsGuard.reset();
});

$('#profileForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('#pName').value.trim();
  if (!name) {
    $('#profileError').textContent = 'Please enter a name.';
    return;
  }
  const linkProblem = saveFencerLink($('#pTracker').value);
  if (linkProblem) {
    $('#profileError').textContent = linkProblem;
    return;
  }
  profile = { name, club: $('#pClub').value.trim(), rating: $('#pRating').value.trim(), weapon: $('#pWeapon').value };
  saveJson('profile', profile);
  renderProfile();
  settingsDialog.close();
});

// ---------- calendar navigation ----------
$('#prevBtn').addEventListener('click', () => {
  anchorIso = shiftAnchor(view, anchorIso, -1);
  renderCalendar();
});
$('#nextBtn').addEventListener('click', () => {
  anchorIso = shiftAnchor(view, anchorIso, 1);
  renderCalendar();
});
$('#todayBtn').addEventListener('click', () => {
  anchorIso = toIso(new Date());
  renderCalendar();
});

phoneScreen.addEventListener('change', renderCalendar);
renderViewSwitch();
renderTypeFilters();
renderAll();

initFencerLinks();
initTheme();
initFont();

// ---------- pages ----------
const PAGES = ['schedule', 'routines', 'nutrition', 'journal', 'goals'];

function showPage() {
  const requested = location.hash.slice(1);
  const page = PAGES.includes(requested) ? requested : 'schedule';
  for (const name of PAGES) {
    const capitalized = name[0].toUpperCase() + name.slice(1);
    $('#' + name + 'Page').hidden = name !== page;
    $('#nav' + capitalized).setAttribute('aria-current', name === page ? 'page' : 'false');
  }
  updateSwitch($('.page-nav'), '[aria-current="page"]');
  renderNextMeals();
  if (page === 'nutrition') {
    renderNutrition();
    renderHydration();
  }
  if (page === 'journal') renderJournal();
  if (page === 'goals') renderGoals();
  if (page === 'routines') renderRoutines();
}
window.addEventListener('hashchange', showPage);
// The next meal changes as the day goes on, so refresh the small list while the app stays open.
setInterval(renderNextMeals, 60 * 1000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) renderNextMeals();
});
showPage();
