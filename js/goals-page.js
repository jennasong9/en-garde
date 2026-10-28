import { burstConfetti } from './confetti.js';
import { $, el, formState, protectUnsavedChanges } from './dom.js';
import { setFolded } from './fold.js';
import {
  PROGRESS_STEPS,
  TAGS,
  archivedGoals,
  boardGoals,
  canArchive,
  dueStatus,
  isUrgent,
  matchesTag,
  stepFromPosition,
  tapStep,
  validateGoal,
  visibleGoals,
} from './goals.js';
import { makeId, parseIso, toIso } from './schedule.js';
import { loadJson, saveJson } from './storage.js';

const stored = loadJson('goals', []);
let goals = Array.isArray(stored) ? stored : [];

const activeTags = new Set();
let hideCompleted = loadJson('goalsHideCompleted', false) === true;
const goalDialog = $('#goalDialog');
let editingGoalId = null;
let selectedTag = '';
let confirmingDeleteId = null;
let confirmingArchivedDeleteId = null;
let confirmingDeleteInDialog = false;

function persist() {
  saveJson('goals', goals);
}

// The deadline line as a plain lead-in and a tail that turns red when the deadline is close.
function dueText(goal) {
  const status = dueStatus(goal, toIso(new Date()));
  const dateText = goal.due
    ? parseIso(goal.due).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const urgent = isUrgent(status);
  switch (status.kind) {
    case 'done': return { lead: 'Completed' + (dateText ? ' · was due ' + dateText : ''), tail: '', urgent };
    case 'none': return { lead: 'No deadline', tail: '', urgent };
    case 'overdue': return { lead: '', tail: 'Overdue by ' + plural(status.days, 'day') + ' · ' + dateText, urgent };
    case 'today': return { lead: '', tail: 'Due today', urgent };
    default: return { lead: 'Due ' + dateText + ' · ', tail: plural(status.days, 'day') + ' left', urgent };
  }
}

function plural(count, word) {
  return count + ' ' + word + (count === 1 ? '' : 's');
}

export function renderGoals() {
  const onBoard = boardGoals(goals);
  const finished = onBoard.filter((goal) => goal.progress >= 100).length;
  $('#goalSummary').textContent = onBoard.length === 0
    ? 'Nothing pinned yet.'
    : onBoard.length - finished + ' in progress · ' + finished + ' completed';
  renderTagFilters();
  $('#hideCompleted').checked = hideCompleted;
  $('#goalHiddenNote').textContent = hideCompleted && finished > 0 ? plural(finished, 'completed goal') + ' hidden' : '';
  renderBoard();
  renderArchive();
}

function renderTagFilters() {
  const buttons = Object.entries(TAGS).map(([tag, info]) => el('button', {
    class: 'filter-chip goal-tag-' + tag,
    type: 'button',
    'aria-pressed': String(activeTags.has(tag)),
    onclick: () => {
      if (activeTags.has(tag)) activeTags.delete(tag);
      else activeTags.add(tag);
      renderGoals();
    },
  }, el('i', { style: 'background: var(--pin)' }), info.label));
  if (activeTags.size > 0) {
    buttons.push(el('button', {
      class: 'filter-clear',
      type: 'button',
      text: 'Show all',
      onclick: () => {
        activeTags.clear();
        renderGoals();
      },
    }));
  }
  $('#goalFilters').replaceChildren(...buttons);
}

function renderBoard() {
  const board = $('#goalBoard');
  board.replaceChildren();
  const onBoard = boardGoals(goals);
  if (onBoard.length === 0) {
    board.append(el('p', { class: 'empty', text: 'No goals yet. Tap "+ Pin a new goal" to put your first one on the board.' }));
    return;
  }
  const shown = visibleGoals(onBoard, activeTags, hideCompleted);
  if (shown.length === 0) {
    const taggedGoals = onBoard.filter((goal) => matchesTag(goal, activeTags));
    board.append(el('p', {
      class: 'empty',
      text: taggedGoals.length === 0
        ? 'No goals. Tap "Show all" to reset.'
        : 'Every goal here is completed. Turn off "Hide completed" to see them.',
    }));
    return;
  }
  for (const goal of shown) board.append(goalCard(goal));
}

const FENCER_SVG = '<svg viewBox="0 0 64 44" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<circle cx="16" cy="8" r="6" fill="currentColor" stroke="none"/>'
  + '<path d="M16 15 L20 27 M20 27 L9 40 M20 27 L33 31 L35 41 M18 19 L8 14 M18 19 L36 21"/>'
  + '<path d="M36 21 L62 15" stroke-width="1.6"/></svg>';

function goalCard(goal) {
  const due = dueText(goal);
  const card = el('article', { class: 'goal-card goal-tag-' + goal.tag + (goal.progress >= 100 ? ' complete' : ''), 'data-goal': goal.id },
    el('span', { class: 'goal-card-tag', text: TAGS[goal.tag].label }),
    el('h3', { class: 'goal-card-name', text: goal.name }),
    el('div', { class: 'goal-card-due' }, due.lead, el('span', { class: due.urgent ? 'urgent' : '', text: due.tail })));

  const steps = el('div', { class: 'progress-steps', role: 'group', 'aria-label': 'Progress for ' + goal.name });
  const percentLabel = el('span', { class: 'progress-pct', text: goal.progress + '%' });
  for (let index = 0; index < PROGRESS_STEPS; index++) {
    const percent = (index + 1) * (100 / PROGRESS_STEPS);
    steps.append(el('button', {
      class: 'step',
      type: 'button',
      'aria-label': 'Set progress to ' + percent + ' percent',
      'aria-pressed': String(goal.progress >= percent),
      // Mouse and touch are handled by the drag code below; this is for keyboard presses.
      onclick: (event) => {
        if (event.detail === 0) setProgress(goal, tapStep(goal.progress, index));
      },
    }, el('span')));
  }
  // A small fencer rides along the bars, at the front of the progress, closing in on the finish.
  const fencer = el('span', { class: 'goal-fencer', 'aria-hidden': 'true' });
  fencer.innerHTML = FENCER_SVG;
  const track = el('div', { class: 'goal-track' }, steps, fencer);
  track.style.setProperty('--pos', String(goal.progress / 100));
  wireProgressDrag(steps, percentLabel, track, goal);
  card.append(el('div', { class: 'progress-row' }, track, percentLabel));
  card.append(cardActions(goal));
  return card;
}

function setProgress(goal, percent) {
  const wasFinished = goal.progress >= 100;
  goal.progress = percent;
  persist();
  renderGoals();
  if (wasFinished || percent < 100) return;
  // A finished goal is a touch: confetti from its percent.
  const label = document.querySelector('[data-goal="' + goal.id + '"] .progress-pct');
  if (!label) return;
  const spot = label.getBoundingClientRect();
  burstConfetti(spot.left + spot.width / 2, spot.top + spot.height / 2);
}

// Click or tap a bar to set progress, or press and drag along the bars to slide it. While
// dragging only the bars on screen change; the goal is saved when the pointer is released.
function wireProgressDrag(steps, percentLabel, track, goal) {
  let startIndex = null;
  let dragged = false;
  let previewPercent = goal.progress;

  const indexAt = (event) => {
    const box = steps.getBoundingClientRect();
    return stepFromPosition(event.clientX, box.left, box.width);
  };
  const showPercent = (percent) => {
    previewPercent = percent;
    percentLabel.textContent = percent + '%';
    track.style.setProperty('--pos', String(percent / 100));
    [...steps.children].forEach((button, index) => {
      button.setAttribute('aria-pressed', String(percent >= (index + 1) * (100 / PROGRESS_STEPS)));
    });
  };

  steps.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    startIndex = indexAt(event);
    dragged = false;
    steps.setPointerCapture(event.pointerId);
  });
  steps.addEventListener('pointermove', (event) => {
    if (startIndex === null) return;
    const index = indexAt(event);
    if (!dragged && index === startIndex) return;
    dragged = true;
    showPercent((index + 1) * (100 / PROGRESS_STEPS));
  });
  steps.addEventListener('pointerup', () => {
    if (startIndex === null) return;
    const tapped = startIndex;
    startIndex = null;
    setProgress(goal, dragged ? previewPercent : tapStep(goal.progress, tapped));
  });
  steps.addEventListener('pointercancel', () => {
    startIndex = null;
    showPercent(goal.progress);
  });
}

function cardActions(goal) {
  if (confirmingDeleteId === goal.id) {
    return el('div', { class: 'goal-card-actions goal-card-confirm' },
      el('span', { text: 'Delete this goal?' }),
      el('button', {
        class: 'btn danger small',
        type: 'button',
        text: 'Yes, delete',
        onclick: () => deleteGoal(goal.id),
      }),
      el('button', {
        class: 'btn ghost small',
        type: 'button',
        text: 'Keep it',
        onclick: () => {
          confirmingDeleteId = null;
          renderGoals();
        },
      }));
  }
  const archiveButtons = canArchive(goal)
    ? [el('button', { class: 'btn ghost small', type: 'button', text: 'Archive', 'aria-label': 'Archive ' + goal.name, onclick: () => archiveGoal(goal) })]
    : [];
  return el('div', { class: 'goal-card-actions' },
    ...archiveButtons,
    el('button', { class: 'btn ghost small', type: 'button', text: 'Edit', 'aria-label': 'Edit ' + goal.name, onclick: () => openGoalForm(goal) }),
    el('button', {
      class: 'btn danger small',
      type: 'button',
      text: 'Delete',
      'aria-label': 'Delete ' + goal.name,
      onclick: () => {
        confirmingDeleteId = goal.id;
        renderGoals();
      },
    }));
}

function archiveGoal(goal) {
  goal.archived = true;
  goal.archivedOn = toIso(new Date());
  persist();
  renderGoals();
}

function restoreGoal(goal) {
  delete goal.archived;
  delete goal.archivedOn;
  persist();
  renderGoals();
}

function renderArchive() {
  const archived = archivedGoals(goals);
  $('#goalArchive').hidden = archived.length === 0 && goals.length === 0;
  $('#goalArchiveSummary').textContent = 'Archive (' + archived.length + ')';
  const list = $('#archiveList');
  if (archived.length === 0) {
    list.replaceChildren(el('p', { class: 'empty', text: 'Nothing archived yet. Finish a goal, then tap "Archive" on its card.' }));
    return;
  }
  list.replaceChildren(...archived.map(archivedItem));
}

function archivedItem(goal) {
  const archivedText = goal.archivedOn
    ? ' · archived ' + parseIso(goal.archivedOn).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const actions = confirmingArchivedDeleteId === goal.id
    ? [
      el('span', { text: 'Delete forever?' }),
      el('button', { class: 'btn danger small', type: 'button', text: 'Yes, delete', onclick: () => deleteArchivedGoal(goal.id) }),
      el('button', {
        class: 'btn ghost small',
        type: 'button',
        text: 'Keep it',
        onclick: () => {
          confirmingArchivedDeleteId = null;
          renderGoals();
        },
      }),
    ]
    : [
      el('button', { class: 'btn ghost small', type: 'button', text: 'Restore', 'aria-label': 'Restore ' + goal.name, onclick: () => restoreGoal(goal) }),
      el('button', {
        class: 'btn danger small',
        type: 'button',
        text: 'Delete',
        'aria-label': 'Permanently delete ' + goal.name,
        onclick: () => {
          confirmingArchivedDeleteId = goal.id;
          renderGoals();
        },
      }),
    ];
  return el('div', { class: 'archive-item' },
    el('div', { class: 'archive-info' },
      el('span', { class: 'archive-name', text: goal.name }),
      el('span', { class: 'archive-meta', text: TAGS[goal.tag].label + archivedText })),
    el('div', { class: 'archive-actions' }, ...actions));
}

function deleteArchivedGoal(id) {
  confirmingArchivedDeleteId = null;
  deleteGoal(id);
}

function deleteGoal(id) {
  goals = goals.filter((goal) => goal.id !== id);
  confirmingDeleteId = null;
  persist();
  renderGoals();
}

// ---------- add / edit a goal ----------
function renderTagPicker() {
  $('#goalTagPicker').replaceChildren(...Object.entries(TAGS).map(([tag, info]) => el('button', {
    class: 'day-chip',
    type: 'button',
    text: info.label,
    'aria-pressed': String(tag === selectedTag),
    onclick: () => {
      selectedTag = tag;
      renderTagPicker();
    },
  })));
}

function openGoalForm(goal) {
  editingGoalId = goal ? goal.id : null;
  selectedTag = goal ? goal.tag : '';
  confirmingDeleteInDialog = false;
  $('#goalDialogTitle').textContent = goal ? 'Edit goal' : 'Pin a new goal';
  $('#gName').value = goal ? goal.name : '';
  $('#gDue').value = goal ? goal.due : '';
  $('#goalFormError').textContent = '';
  const deleteButton = $('#goalDelete');
  deleteButton.hidden = !goal;
  deleteButton.textContent = 'Delete';
  renderTagPicker();
  goalDialog.showModal();
  goalGuard.reset();
  $('#gName').focus();
}

$('#addGoalBtn').addEventListener('click', () => openGoalForm(null));

$('#goalArchiveToggle').addEventListener('click', () => {
  const archive = $('#goalArchive');
  setFolded(archive, $('#goalArchiveToggle'), !archive.classList.contains('collapsed'));
});

// How big the goal cards are, which also sets how many fit on a row. Remembered on this device.
const MIN_CARD_SIZE = 140;
const MAX_CARD_SIZE = 420;
const DEFAULT_CARD_SIZE = 250;
const storedSize = loadJson('goalCardSize', DEFAULT_CARD_SIZE);
let cardSize = Number.isFinite(storedSize) ? Math.max(MIN_CARD_SIZE, Math.min(MAX_CARD_SIZE, storedSize)) : DEFAULT_CARD_SIZE;

function applyCardSize() {
  $('#goalBoard').style.setProperty('--card-min', cardSize + 'px');
  $('#goalCardSize').value = String(cardSize);
}
applyCardSize();

$('#goalCardSize').addEventListener('input', (event) => {
  cardSize = Number(event.target.value);
  applyCardSize();
  saveJson('goalCardSize', cardSize);
});

$('#hideCompleted').addEventListener('change', (event) => {
  hideCompleted = event.target.checked;
  saveJson('goalsHideCompleted', hideCompleted);
  renderGoals();
});

$('#goalForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const fields = { name: $('#gName').value.trim(), tag: selectedTag, due: $('#gDue').value };
  const problem = validateGoal(fields);
  if (problem) {
    $('#goalFormError').textContent = problem;
    return;
  }
  if (editingGoalId) Object.assign(goals.find((goal) => goal.id === editingGoalId), fields);
  else goals.push({ id: makeId(), progress: 0, ...fields });
  persist();
  goalDialog.close();
  renderGoals();
});

// Deleting takes two presses so a stray tap does not remove a goal.
$('#goalDelete').addEventListener('click', () => {
  if (!confirmingDeleteInDialog) {
    confirmingDeleteInDialog = true;
    $('#goalDelete').textContent = 'Really delete?';
    return;
  }
  goalDialog.close();
  deleteGoal(editingGoalId);
});

const goalGuard = protectUnsavedChanges(goalDialog, () => formState($('#goalForm')));
$('#goalClose').addEventListener('click', () => goalDialog.close());
$('#goalCancel').addEventListener('click', () => goalDialog.close());
