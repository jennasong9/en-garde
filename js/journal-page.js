import { setSwitchButtons } from './pill.js';
import { pingToday } from './today-ping.js';
import { $, closeOnBackdropClick, el, formState, makeDraggable, protectUnsavedChanges } from './dom.js';
import { FEELINGS, PROMPTS, SORT_OPTIONS, appendPrompt, matchesFeeling, placeInCustomOrder, sortEntries, validateEntry } from './journal.js';
import { parseIso, shiftAnchor, toIso } from './schedule.js';
import { loadJson, saveJson } from './storage.js';

const stored = loadJson('journal', {});
let entries = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};

let view = 'calendar';
// How the List view is ordered, and (for "Custom") the user's own order of the entry dates.
const storedSort = loadJson('journalSort', {});
const sort = {
  by: SORT_OPTIONS.includes(storedSort.by) ? storedSort.by : 'created',
  order: storedSort.order === 'asc' ? 'asc' : 'desc',
};
const storedOrder = loadJson('journalOrder', []);
let customOrder = Array.isArray(storedOrder) ? storedOrder : [];
// When on, every entry has an "Open entry" button that opens it in a pop-up instead of expanding it in the list.
let popupMode = loadJson('journalPopup', false) === true;
let anchorIso = toIso(new Date());
const activeFeelings = new Set();

const journalDialog = $('#journalDialog');
let dialogDate = null;
let selectedFeeling = '';
let confirmingDelete = false;

function persist() {
  saveJson('journal', entries);
}

function longDate(iso, withYear = false) {
  return parseIso(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

export function renderJournal() {
  renderViewSwitch();
  renderFeelingFilters();
  $('#journalCalendar').hidden = view !== 'calendar';
  $('#journalList').hidden = view !== 'list';
  $('#journalNav').hidden = view !== 'calendar';
  $('#journalListOptions').hidden = view !== 'list';
  $('#journalSort').hidden = view !== 'list';
  $('#sortBy').value = sort.by;
  $('#sortOrder').value = sort.order;
  $('#sortOrderField').hidden = sort.by === 'custom';
  $('#sortHint').hidden = sort.by !== 'custom';
  $('#popupToggle').checked = popupMode;
  // There is one entry per day, so the button says whether it starts today's entry or reopens it.
  $('#journalAdd').textContent = entries[toIso(new Date())] ? "Edit today's entry" : "+ Write today's entry";
  if (view === 'calendar') {
    $('#journalTitle').textContent = parseIso(anchorIso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    $('#journalHint').textContent = 'One entry per day: tap a day, or use the button above for today. Filter by feeling below.';
    renderCalendar();
  } else {
    $('#journalTitle').textContent = 'All entries';
    $('#journalHint').textContent = 'One entry per day. Filter by feeling below.';
    renderList();
  }
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
    const entry = entries[iso];
    const shown = entry && matchesFeeling(entry, activeFeelings);
    const classes = ['cal-cell'];
    if (day.getMonth() !== month) classes.push('outside');
    if (iso === todayIso) classes.push('today');

    const label = longDate(iso) + ', ' + (shown ? FEELINGS[entry.feeling].label + ' entry' : 'no entry');
    const cell = el('button', { class: classes.join(' '), type: 'button', 'aria-label': label, 'data-date': iso },
      el('span', { class: 'cal-date', text: String(day.getDate()) }));
    if (shown) {
      const { icon, label: feelingLabel } = FEELINGS[entry.feeling];
      cell.append(el('span', { class: 'chip feeling-' + entry.feeling },
        el('span', { class: 'chip-text', text: icon + ' ' + feelingLabel })));
    }
    cell.addEventListener('click', () => openEntry(iso));
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
        ? 'No journal entries yet. Switch to Calendar and tap a day to write your first one.'
        : 'No entries. Tap "Show all" to reset.',
    }));
    return;
  }
  for (const entry of list) container.append(entryCard(entry));
  updateTruncation();
}

// Entries longer than this many lines are cut off in the list, with a "Show more" button.
// (The same number is in the .clamped style in style.css.)
const expandedDates = new Set();

function entryCard(entry) {
  const { icon, label } = FEELINGS[entry.feeling];
  const toggle = el('button', {
    class: 'link-btn small entry-toggle',
    type: 'button',
    hidden: '',
    onclick: () => {
      if (popupMode) {
        openEntryView(entry.date);
        return;
      }
      if (expandedDates.has(entry.date)) expandedDates.delete(entry.date);
      else expandedDates.add(entry.date);
      updateTruncation();
    },
  });
  const head = el('div', { class: 'journal-entry-head' },
    el('span', { class: 'journal-entry-date', text: longDate(entry.date, true) }),
    el('span', { class: 'journal-entry-feeling', text: icon + ' ' + label }));
  const card = el('article', { class: 'journal-entry feeling-' + entry.feeling, 'data-date': entry.date }, head);
  const times = writtenText(entry);
  if (times) card.append(el('p', { class: 'journal-entry-times', text: times }));
  card.append(
    el('p', { class: 'journal-entry-text clamped', text: entry.text }),
    el('div', { class: 'journal-entry-actions' },
      toggle,
      el('button', { class: 'btn ghost small', type: 'button', text: 'Edit', onclick: () => openEntry(entry.date) })));
  if (sort.by === 'custom') head.prepend(reorderHandle(card, entry.date));
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
function reorderHandle(card, date) {
  const handle = el('button', {
    class: 'entry-handle',
    type: 'button',
    text: '⠿',
    title: 'Drag to move this entry',
    'aria-label': 'Move the entry for ' + longDate(date, true) + '. Drag, or press the up and down arrow keys.',
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
      moveEntry(date, index);
    },
    cancel: cleanup,
  });
  handle.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const shown = currentList().map((entry) => entry.date);
    const next = shown.indexOf(date) + (event.key === 'ArrowUp' ? -1 : 1);
    if (next >= 0 && next < shown.length) {
      moveEntry(date, next);
      $('#journalList').querySelector('[data-date="' + date + '"] .entry-handle')?.focus();
    }
  });
  return handle;
}

// Puts an entry at a position among the entries showing, and remembers the whole order.
function moveEntry(date, index) {
  const everything = sortEntries(entries, { ...sort, custom: customOrder }).map((entry) => entry.date);
  const showing = currentList().map((entry) => entry.date);
  customOrder = placeInCustomOrder(everything, showing, date, index);
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

// Sets each entry's button. With pop-ups on, every entry gets "Open entry". With them off, only
// entries that are cut off get "Show more" (or "Show less" once opened in the list). It measures
// the text, so it runs after the list is on screen and again when the window resizes.
function updateTruncation() {
  for (const card of $('#journalList').querySelectorAll('.journal-entry')) {
    const text = card.querySelector('.journal-entry-text');
    const toggle = card.querySelector('.entry-toggle');
    const expanded = !popupMode && expandedDates.has(card.dataset.date);
    text.classList.toggle('clamped', !expanded);
    const cutOff = text.scrollHeight > text.clientHeight + 1;
    toggle.hidden = !popupMode && !expanded && !cutOff;
    if (popupMode) {
      toggle.textContent = 'Open entry';
      toggle.removeAttribute('aria-expanded');
      toggle.setAttribute('aria-haspopup', 'dialog');
    } else {
      toggle.textContent = expanded ? 'Show less' : 'Show more';
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.removeAttribute('aria-haspopup');
    }
  }
}
window.addEventListener('resize', () => {
  if (view === 'list' && !$('#journalPage').hidden) updateTruncation();
});

// ---------- read an entry in a pop-up ----------
const entryViewDialog = $('#entryViewDialog');
let viewedDate = null;

function openEntryView(iso) {
  const entry = entries[iso];
  viewedDate = iso;
  const { icon, label } = FEELINGS[entry.feeling];
  $('#entryViewTitle').textContent = longDate(iso, true);
  $('#entryViewFeeling').textContent = icon + ' ' + label;
  $('#entryViewFeeling').className = 'journal-entry-feeling feeling-' + entry.feeling;
  $('#entryViewText').textContent = entry.text;
  entryViewDialog.showModal();
}

$('#popupToggle').addEventListener('change', (event) => {
  popupMode = event.target.checked;
  saveJson('journalPopup', popupMode);
  updateTruncation();
});
$('#entryViewEdit').addEventListener('click', () => {
  entryViewDialog.close();
  openEntry(viewedDate);
});
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

$('#promptRow').replaceChildren(...PROMPTS.map((prompt) => el('button', {
  class: 'prompt-chip',
  type: 'button',
  text: prompt,
  onclick: () => {
    const box = $('#jText');
    box.value = appendPrompt(box.value, prompt);
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  },
})));

function openEntry(iso) {
  const entry = entries[iso];
  dialogDate = iso;
  selectedFeeling = entry ? entry.feeling : '';
  confirmingDelete = false;
  $('#journalDialogTitle').textContent = (entry ? 'Edit entry — ' : 'New entry — ') + longDate(iso);
  $('#jText').value = entry ? entry.text : '';
  $('#journalError').textContent = '';
  const deleteButton = $('#journalDelete');
  deleteButton.hidden = !entry;
  deleteButton.textContent = 'Delete';
  renderFeelingPicker();
  journalDialog.showModal();
  journalGuard.reset();
}

$('#journalForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const entry = { feeling: selectedFeeling, text: $('#jText').value.trim() };
  const problem = validateEntry(entry);
  if (problem) {
    $('#journalError').textContent = problem;
    return;
  }
  const before = entries[dialogDate];
  const now = new Date().toISOString();
  if (!before) {
    entries[dialogDate] = { ...entry, createdAt: now, editedAt: now };
  } else if (before.feeling !== entry.feeling || before.text !== entry.text) {
    entries[dialogDate] = { ...before, ...entry, editedAt: now };
  }
  persist();
  journalDialog.close();
  renderJournal();
});

// Deleting takes two presses so a stray tap does not remove a reflection.
$('#journalDelete').addEventListener('click', () => {
  if (!confirmingDelete) {
    confirmingDelete = true;
    $('#journalDelete').textContent = 'Really delete?';
    return;
  }
  delete entries[dialogDate];
  persist();
  journalDialog.close();
  renderJournal();
});

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
$('#journalAdd').addEventListener('click', () => openEntry(toIso(new Date())));

$('#journalToday').addEventListener('click', () => {
  anchorIso = toIso(new Date());
  renderJournal();
  pingToday('#journalPage');
});
