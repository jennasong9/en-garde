import { setSwitchButtons } from './pill.js';
import { showDialog } from './dialog-motion.js';
import { renderFocusStrip } from './focus-strip.js';
import { pingToday } from './today-ping.js';
import { $, closeOnBackdropClick, el, formState, makeDraggable, protectUnsavedChanges } from './dom.js';
import {
  FEELINGS,
  SHORT_FIELDS,
  entriesOn,
  entryForSession,
  entryParts,
  feelingOf,
  freeSlots,
  matchesFeeling,
  normalizeEntries,
  normalizeSort,
  placeInCustomOrder,
  sortEntries,
  validateEntry,
} from './journal.js';
import { isStrayClick } from './confirm.js';
import { SESSION_TYPES, cleanSessions, formatTime, makeId, parseIso, sessionsOn, shiftAnchor, toIso } from './schedule.js';
import { loadJson, saveJson } from './storage.js';
import { createVideoReview } from './video-review-ui.js';
import { deleteVideo } from './videostore.js';

// Entries are kept by id. A day has one entry for each of its sessions plus one general entry.
// (Entries from before that were kept by their date and get an id here.)
let entries = normalizeEntries(loadJson('journal', {}));
saveJson('journal', entries);

let view = 'calendar';
// How the List view is ordered, and (for "Custom") the user's own order of the entries (their ids).
const sort = normalizeSort(loadJson('journalSort', {}));
const storedOrder = loadJson('journalOrder', []);
let customOrder = Array.isArray(storedOrder) ? storedOrder : [];
let anchorIso = toIso(new Date());
const activeFeelings = new Set();

const journalDialog = $('#journalDialog');
let dialogId = null;
let dialogDate = null;
let selectedFeeling = '';
let confirmingDelete = false;
let deleteArmedAt = null;
let saving = false;

// Saves one change (an entry added or changed, or `change` null to delete the one with `id`). The
// saved journal is read again first, so entries written meanwhile from another tab or window of
// the app are kept instead of being overwritten by this tab's older copy.
function persist(id, change) {
  const latest = normalizeEntries(loadJson('journal', {}));
  if (change) latest[id] = change;
  else delete latest[id];
  entries = latest;
  saveJson('journal', entries);
  // Other pages that show entries (the focus strip, the session buttons) can redraw.
  document.dispatchEvent(new CustomEvent('journal-changed'));
}

// The sessions on the Schedule, so an entry can say which one it is about.
function savedSessions() {
  return cleanSessions(loadJson('sessions', []));
}

function sessionLabel(session) {
  return SESSION_TYPES[session.type].label + (session.time ? ', ' + formatTime(session.time) : '');
}

function longDate(iso, withYear = false) {
  return parseIso(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

const HINT = 'One entry for each session, plus one general entry a day.';

export function renderJournal() {
  renderViewSwitch();
  renderFeelingFilters();
  $('#journalCalendar').hidden = view !== 'calendar';
  $('#journalList').hidden = view !== 'list';
  $('#journalNav').hidden = view !== 'calendar';
  $('#journalSort').hidden = view !== 'list';
  $('#sortBy').value = sort.by;
  $('#sortOrder').value = sort.order;
  $('#sortOrderField').hidden = sort.by === 'custom';
  $('#sortHint').hidden = sort.by !== 'custom';
  $('#journalAdd').textContent = "+ Write today's entry";
  renderFocusStrip($('#journalFocus'), entries);
  if (view === 'calendar') {
    $('#journalTitle').textContent = parseIso(anchorIso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    $('#journalHint').textContent = HINT;
    renderCalendar();
  } else {
    $('#journalTitle').textContent = 'All entries';
    $('#journalHint').textContent = HINT;
    renderList();
  }
}

// Writes an entry's filled-in boxes into `box`, each under its bold label, one per line.
function fillEntryText(box, entry) {
  const parts = entryParts(entry);
  box.replaceChildren(...parts.flatMap((part, index) => [
    el('b', { text: part.label + ': ' }),
    part.text + (index < parts.length - 1 ? '\n' : ''),
  ]));
}

function renderViewSwitch() {
  const names = { calendar: 'Calendar', list: 'List' };
  setSwitchButtons($('#journalViewSwitch'), Object.entries(names).map(([name, label]) => el('button', {
    class: 'view-btn',
    type: 'button',
    text: label,
    'aria-pressed': String(name === view),
    onclick: () => {
      view = name;
      renderJournal();
    },
  })), '[aria-pressed="true"]');
}

function renderFeelingFilters() {
  const buttons = Object.entries(FEELINGS).map(([feeling, info]) => el('button', {
    class: 'filter-chip feeling-' + feeling,
    type: 'button',
    'aria-pressed': String(activeFeelings.has(feeling)),
    onclick: () => {
      if (activeFeelings.has(feeling)) activeFeelings.delete(feeling);
      else activeFeelings.add(feeling);
      renderJournal();
    },
  }, el('i'), info.label));
  if (activeFeelings.size > 0) {
    buttons.push(el('button', {
      class: 'filter-clear',
      type: 'button',
      text: 'Show all',
      onclick: () => {
        activeFeelings.clear();
        renderJournal();
      },
    }));
  }
  $('#feelingFilters').replaceChildren(...buttons);
}

// ---------- calendar view ----------
const MAX_CELL_CHIPS = 2;

// The short name of the session an entry is about ("Footwork"), or '' for a general entry.
// What an entry says it is about: the session's current name while the session is still on the
// Schedule (so it follows a change of type or time), otherwise the name saved with the entry.
function entryLabel(entry) {
  const session = savedSessions().find((other) => other.id === entry.sessionId);
  return session && SESSION_TYPES[session.type] ? sessionLabel(session) : entry.sessionLabel || '';
}

function sessionShortName(entry) {
  const session = savedSessions().find((other) => other.id === entry.sessionId);
  return session && SESSION_TYPES[session.type] ? SESSION_TYPES[session.type].short : '';
}

function renderCalendar() {
  const anchor = parseIso(anchorIso);
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const offset = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cellCount = Math.ceil((offset + daysInMonth) / 7) * 7;
  const todayIso = toIso(new Date());
  const cells = [];

  for (let i = 0; i < cellCount; i++) {
    const day = new Date(year, month, 1 - offset + i);
    const iso = toIso(day);
    const dayEntries = entriesOn(entries, iso);
    const shown = dayEntries.filter((entry) => matchesFeeling(entry, activeFeelings));
    const classes = ['cal-cell'];
    if (day.getMonth() !== month) classes.push('outside');
    if (iso === todayIso) classes.push('today');

    const label = longDate(iso) + ', ' + (shown.length === 0 ? 'no entry' : shown.length + (shown.length === 1 ? ' entry' : ' entries'));
    const cell = el('button', { class: classes.join(' '), type: 'button', 'aria-label': label, 'data-date': iso },
      el('span', { class: 'cal-date', text: String(day.getDate()) }));
    for (const entry of shown.slice(0, MAX_CELL_CHIPS)) {
      const { icon, label: feelingLabel } = feelingOf(entry);
      cell.append(el('span', { class: 'chip feeling-' + entry.feeling },
        el('span', { class: 'chip-text', text: icon + ' ' + (sessionShortName(entry) || feelingLabel) })));
    }
    if (shown.length > MAX_CELL_CHIPS) cell.append(el('span', { class: 'cal-more', text: '+' + (shown.length - MAX_CELL_CHIPS) + ' more' }));
    // A day with one entry opens it for reading (Edit is in that pop-up); a day with several lists
    // them; an empty day starts a new one.
    cell.addEventListener('click', () => {
      if (dayEntries.length === 0) startEntry(iso, '', cell);
      else if (dayEntries.length === 1) openEntryView(dayEntries[0].id, cell);
      else openDayList(iso, cell);
    });
    cells.push(cell);
  }
  $('#journalGrid').replaceChildren(...cells);
}

// ---------- list view ----------
// The entries showing in the List view, in the chosen order.
function currentList() {
  return sortEntries(entries, { ...sort, custom: customOrder }, activeFeelings);
}

function renderList() {
  const list = currentList();
  const container = $('#journalList');
  container.replaceChildren();
  if (list.length === 0) {
    const none = Object.keys(entries).length === 0;
    container.append(el('p', {
      class: 'empty',
      text: none
        ? 'No entries yet.'
        : 'No entries. Tap "Show all" to reset.',
    }));
    return;
  }
  for (const entry of list) container.append(entryCard(entry));
}

// Each entry in the list is a short preview (cut off after a few lines, see .clamped in style.css)
// with an "Open entry" button that reads the whole entry in a pop-up.
function entryCard(entry) {
  const { icon, label } = feelingOf(entry);
  const head = el('div', { class: 'journal-entry-head' },
    el('span', { class: 'journal-entry-date', text: longDate(entry.date, true) }),
    el('span', { class: 'journal-entry-feeling', text: icon + ' ' + label }));
  const card = el('article', { class: 'journal-entry feeling-' + entry.feeling, 'data-id': entry.id }, head);
  const times = writtenText(entry);
  if (times) card.append(el('p', { class: 'journal-entry-times', text: times }));
  if (entryLabel(entry)) card.append(el('p', { class: 'journal-entry-session', text: entryLabel(entry) }));
  if (entry.video) {
    const count = (entry.videoNotes || []).length;
    card.append(el('p', { class: 'journal-entry-video', text: '▶ Video review' + (count ? ' · ' + count + (count === 1 ? ' note' : ' notes') : '') }));
  }
  const text = el('p', { class: 'journal-entry-text clamped' });
  fillEntryText(text, entry);
  card.append(
    text,
    el('div', { class: 'journal-entry-actions' },
      el('button', {
        class: 'btn small',
        type: 'button',
        text: 'Open entry',
        'aria-haspopup': 'dialog',
        onclick: () => openEntryView(entry.id),
      }),
      el('button', { class: 'btn ghost small', type: 'button', text: 'Edit', onclick: () => openEntryForm({ id: entry.id }) })));
  if (sort.by === 'custom') head.prepend(reorderHandle(card, entry));
  return card;
}

// "Written Oct 18, 3:10 PM · Edited Oct 19, 9:05 AM", or nothing for entries saved before the app
// kept these times.
function writtenText(entry) {
  const format = (iso) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const parts = [];
  if (entry.createdAt) parts.push('Written ' + format(entry.createdAt));
  if (entry.editedAt && entry.editedAt !== entry.createdAt) parts.push('Edited ' + format(entry.editedAt));
  return parts.join(' · ');
}

// ---------- arranging entries by hand (the "Custom" sort) ----------
function reorderHandle(card, entry) {
  const id = entry.id;
  const handle = el('button', {
    class: 'entry-handle',
    type: 'button',
    text: '⠿',
    title: 'Drag to move this entry',
    'aria-label': 'Move the entry for ' + longDate(entry.date, true) + (entryLabel(entry) ? ' (' + entryLabel(entry) + ')' : '') + '. Drag, or press the up and down arrow keys.',
  });
  let ghost = null;
  let line = null;
  const insertionIndex = (y) => {
    const cards = [...$('#journalList').querySelectorAll('.journal-entry')].filter((other) => other !== card);
    return cards.filter((other) => {
      const box = other.getBoundingClientRect();
      return y > box.top + box.height / 2;
    }).length;
  };
  const cleanup = () => {
    if (ghost) ghost.remove();
    if (line) line.remove();
    ghost = null;
    line = null;
    card.classList.remove('drag-source');
  };
  makeDraggable(handle, {
    move: (event, dx, dy) => {
      if (!ghost) {
        const box = card.getBoundingClientRect();
        ghost = card.cloneNode(true);
        ghost.classList.add('drag-ghost');
        Object.assign(ghost.style, { position: 'fixed', left: box.left + 'px', top: box.top + 'px', width: box.width + 'px' });
        document.body.append(ghost);
        card.classList.add('drag-source');
      }
      ghost.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
      if (line) line.remove();
      const others = [...$('#journalList').querySelectorAll('.journal-entry')].filter((other) => other !== card);
      line = el('div', { class: 'drop-line' });
      $('#journalList').insertBefore(line, others[insertionIndex(event.clientY)] || null);
    },
    drop: (event) => {
      const index = insertionIndex(event.clientY);
      cleanup();
      moveEntry(id, index);
    },
    cancel: cleanup,
  });
  handle.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const shown = currentList().map((other) => other.id);
    const next = shown.indexOf(id) + (event.key === 'ArrowUp' ? -1 : 1);
    if (next >= 0 && next < shown.length) {
      moveEntry(id, next);
      $('#journalList').querySelector('[data-id="' + id + '"] .entry-handle')?.focus();
    }
  });
  return handle;
}

// Puts an entry at a position among the entries showing, and remembers the whole order.
function moveEntry(id, index) {
  const everything = sortEntries(entries, { ...sort, custom: customOrder }).map((entry) => entry.id);
  const showing = currentList().map((entry) => entry.id);
  customOrder = placeInCustomOrder(everything, showing, id, index);
  saveJson('journalOrder', customOrder);
  renderJournal();
}

$('#sortBy').addEventListener('change', (event) => {
  sort.by = event.target.value;
  saveJson('journalSort', sort);
  renderJournal();
});
$('#sortOrder').addEventListener('change', (event) => {
  sort.order = event.target.value;
  saveJson('journalSort', sort);
  renderJournal();
});

// ---------- read an entry in a pop-up ----------
const entryViewDialog = $('#entryViewDialog');
let viewedId = null;

function openEntryView(id, origin = null) {
  const entry = entries[id];
  viewedId = id;
  const { icon, label } = feelingOf(entry);
  $('#entryViewTitle').textContent = longDate(entry.date, true);
  $('#entryViewFeeling').textContent = icon + ' ' + label;
  $('#entryViewFeeling').className = 'journal-entry-feeling feeling-' + entry.feeling;
  $('#entryViewSession').hidden = !entryLabel(entry);
  $('#entryViewSession').textContent = entryLabel(entry);
  fillEntryText($('#entryViewText'), entry);
  const times = writtenText(entry);
  $('#entryViewTimes').hidden = !times;
  $('#entryViewTimes').textContent = times;
  videoViewer.show(entry);
  showDialog(entryViewDialog, origin);
}

// Opens one entry for reading (used by the focus strip's "Open Journal" button). Returns false when
// there is no such entry.
export function viewEntry(id) {
  if (!entries[id]) return false;
  openEntryView(id);
  return true;
}

// A session's reflection: the button on a session reads "View reflection" when one exists.
export const hasReflection = (session) => entryForSession(entries, session.date, session.id) !== null;

// The "Write reflection" button on a session: opens that session's entry for reading, or a new
// entry about that session.
export function writeReflection(session) {
  const existing = entryForSession(entries, session.date, session.id);
  if (existing) openEntryView(existing.id);
  else startEntry(session.date, session.id);
}

$('#entryViewEdit').addEventListener('click', () => {
  entryViewDialog.close();
  openEntryForm({ id: viewedId });
});
entryViewDialog.addEventListener('close', () => videoViewer.stop());
$('#entryViewDone').addEventListener('click', () => entryViewDialog.close());
$('#entryViewClose').addEventListener('click', () => entryViewDialog.close());
closeOnBackdropClick(entryViewDialog);

// ---------- write or edit an entry ----------
function renderFeelingPicker() {
  $('#feelingPicker').replaceChildren(...Object.entries(FEELINGS).map(([feeling, info]) => el('button', {
    class: 'feeling-btn feeling-' + feeling,
    type: 'button',
    'aria-pressed': String(feeling === selectedFeeling),
    onclick: () => {
      selectedFeeling = feeling;
      renderFeelingPicker();
    },
  }, el('span', { class: 'feeling-icon', text: info.icon }), info.label)));
}

$('#shortFields').replaceChildren(...SHORT_FIELDS.map((field) => el('label', { class: 'field short-field' },
  field.label,
  el('textarea', { id: 'j-' + field.key, rows: '2', maxlength: '300' }))));

// The choices for "Which session was it?": the day's sessions that have no entry yet, the day's
// general entry if it is still free, and the session this entry was saved with if it has since
// been removed from the Schedule. A new entry starts on `preferred` (the session it was started
// from), or on the only free session, or on the general choice.
function fillSessionChoices(iso, entry, preferred) {
  const sessions = sessionsOn(savedSessions(), iso).filter((session) => SESSION_TYPES[session.type]);
  const free = freeSlots(entries, iso, sessions, entry ? entry.id : null);
  const choices = [];
  if (free.general) choices.push(el('option', { value: '', text: 'Not about a particular session' }));
  for (const session of free.sessions) choices.push(el('option', { value: session.id, text: sessionLabel(session) }));
  if (entry && entry.sessionId && !sessions.some((session) => session.id === entry.sessionId)) {
    choices.push(el('option', { value: entry.sessionId, text: entry.sessionLabel + ' (removed from the Schedule)' }));
  }
  $('#jSession').replaceChildren(...choices);
  let chosen = '';
  if (entry) chosen = entry.sessionId || '';
  else if (preferred && free.sessions.some((session) => session.id === preferred)) chosen = preferred;
  else if (free.sessions.length === 1) chosen = free.sessions[0].id;
  else if (!free.general) chosen = free.sessions[0].id;
  $('#jSession').value = chosen;
  $('#jSession').disabled = choices.length <= 1;
}

const videoViewer = createVideoReview($('#entryViewVideo'), () => {}, { readOnly: true });

const videoReview = createVideoReview($('#videoReview'), () => {
  $('#jVideoState').value = videoReview.stateText();
});

// Starts a new entry on a day (about `sessionId`, or a general one when empty). When every place
// that day already has an entry, shows the day's entries instead.
function startEntry(iso, sessionId = '', origin = null) {
  const sessions = sessionsOn(savedSessions(), iso).filter((session) => SESSION_TYPES[session.type]);
  const free = freeSlots(entries, iso, sessions);
  if (!free.general && free.sessions.length === 0) openDayList(iso, origin);
  else openEntryForm({ date: iso, sessionId, origin });
}

// `origin` is the calendar date the pop-up grows out of, when it was opened from one.
function openEntryForm({ id = null, date = null, sessionId = '', origin = null }) {
  const entry = id ? entries[id] : null;
  dialogId = id;
  dialogDate = entry ? entry.date : date;
  selectedFeeling = entry ? entry.feeling : '';
  confirmingDelete = false;
  deleteArmedAt = null;
  $('#journalDialogTitle').textContent = (entry ? 'Edit entry — ' : 'New entry — ') + longDate(dialogDate);
  $('#jText').value = entry ? entry.text || '' : '';
  for (const field of SHORT_FIELDS) $('#j-' + field.key).value = entry ? entry[field.key] || '' : '';
  fillSessionChoices(dialogDate, entry, sessionId);
  $('#journalError').textContent = '';
  const deleteButton = $('#journalDelete');
  deleteButton.hidden = !entry;
  deleteButton.textContent = 'Delete';
  renderFeelingPicker();
  videoReview.show(entry);
  $('#jVideoState').value = videoReview.stateText();
  showDialog(journalDialog, origin);
  journalGuard.reset();
}

// ---------- a day with several entries ----------
const dayDialog = $('#journalDayDialog');
let dayIso = null;

function openDayList(iso, origin = null) {
  dayIso = iso;
  $('#journalDayTitle').textContent = longDate(iso, true);
  renderDayList();
  showDialog(dayDialog, origin);
}

function renderDayList() {
  const sessions = sessionsOn(savedSessions(), dayIso).filter((session) => SESSION_TYPES[session.type]);
  const free = freeSlots(entries, dayIso, sessions);
  $('#journalDayAdd').hidden = !free.general && free.sessions.length === 0;
  $('#journalDayList').replaceChildren(...entriesOn(entries, dayIso).map((entry) => {
    const { icon, label } = feelingOf(entry);
    return el('li', {}, el('button', {
      class: 'day-entry feeling-' + entry.feeling,
      type: 'button',
      onclick: () => {
        dayDialog.close();
        openEntryView(entry.id);
      },
    },
    el('b', { text: entryLabel(entry) || 'General (the whole day)' }),
    el('span', { text: icon + ' ' + label + (entry.video ? ' · ▶ Video review' : '') })));
  }));
}

$('#journalDayAdd').addEventListener('click', () => {
  dayDialog.close();
  startEntry(dayIso);
});
$('#journalDayClose').addEventListener('click', () => dayDialog.close());
closeOnBackdropClick(dayDialog);

$('#journalForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (saving) return;
  const entry = { feeling: selectedFeeling, text: $('#jText').value.trim() };
  for (const field of SHORT_FIELDS) entry[field.key] = $('#j-' + field.key).value.trim();
  const problem = validateEntry(entry);
  if (problem) {
    $('#journalError').textContent = problem;
    return;
  }
  const before = dialogId ? entries[dialogId] : null;
  const chosen = $('#jSession').value;
  const taken = entryForSession(entries, dialogDate, chosen);
  if (taken && taken.id !== dialogId) {
    $('#journalError').textContent = 'That session already has an entry. Open it from the day, or choose another session.';
    return;
  }
  let review;
  saving = true;
  try {
    review = await videoReview.collect();
  } catch (failure) {
    $('#journalError').textContent = failure.message;
    return;
  } finally {
    saving = false;
  }
  const oldFileId = before?.video?.kind === 'file' ? before.video.id : null;
  if (oldFileId && oldFileId !== review.video?.id) deleteVideo(oldFileId).catch(() => {});
  entry.video = review.video;
  entry.videoNotes = review.videoNotes;
  // The chosen session is kept as its id and as a label, so the entry still reads right if the
  // session is later removed from the Schedule.
  const session = savedSessions().find((other) => other.id === chosen);
  entry.sessionId = chosen;
  entry.sessionLabel = session && SESSION_TYPES[session.type] ? sessionLabel(session) : chosen && before ? before.sessionLabel : '';
  const now = new Date().toISOString();
  const keys = ['feeling', 'text', 'sessionId', ...SHORT_FIELDS.map((field) => field.key)];
  const videoChanged = JSON.stringify([before?.video ?? null, before?.videoNotes ?? []]) !== JSON.stringify([entry.video, entry.videoNotes]);
  if (!before) {
    const id = makeId();
    persist(id, { ...entry, id, date: dialogDate, createdAt: now, editedAt: now });
  } else if (videoChanged || keys.some((key) => (before[key] || '') !== entry[key])) {
    persist(dialogId, { ...before, ...entry, editedAt: now });
  }
  journalDialog.close();
  renderJournal();
});

// Deleting takes two presses so a stray tap does not remove a reflection.
$('#journalDelete').addEventListener('click', () => {
  if (!confirmingDelete) {
    confirmingDelete = true;
    deleteArmedAt = Date.now();
    $('#journalDelete').textContent = 'Really delete?';
    return;
  }
  if (isStrayClick(deleteArmedAt, Date.now())) return;
  if (entries[dialogId]?.video?.kind === 'file') deleteVideo(entries[dialogId].video.id).catch(() => {});
  persist(dialogId, null);
  journalDialog.close();
  renderJournal();
});

journalDialog.addEventListener('close', () => videoReview.stop());
const journalGuard = protectUnsavedChanges(journalDialog, () => formState($('#journalForm')));
$('#journalClose').addEventListener('click', () => journalDialog.close());
$('#journalCancel').addEventListener('click', () => journalDialog.close());

// ---------- month navigation ----------
$('#journalPrev').addEventListener('click', () => {
  anchorIso = shiftAnchor('month', anchorIso, -1);
  renderJournal();
});
$('#journalNext').addEventListener('click', () => {
  anchorIso = shiftAnchor('month', anchorIso, 1);
  renderJournal();
});
$('#journalAdd').addEventListener('click', () => startEntry(toIso(new Date())));

$('#journalToday').addEventListener('click', () => {
  anchorIso = toIso(new Date());
  renderJournal();
  pingToday('#journalPage');
});
