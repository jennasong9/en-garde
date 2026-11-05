import { burstConfetti } from './confetti.js';
import { showDialog } from './dialog-motion.js';
import { $, el, formState, protectUnsavedChanges } from './dom.js';
import { setFolded } from './fold.js';
import {
  CARD_SIZES,
  PROGRESS_STEPS,
  TAGS,
  archivedGoals,
  boardGoals,
  canArchive,
  dueStatus,
  isUrgent,
  matchesTag,
  normalizeCardSize,
  stepFromPosition,
  tapStep,
  validateGoal,
  visibleGoals,
} from './goals.js';
import { setSwitchButtons } from './pill.js';
import { RATING_LADDER, currentRating, earnGoalName, parseRating, ratingGoalConflict, ratingTargets } from './rating.js';
import { makeId, parseIso, toIso } from './schedule.js';
import { loadJson, saveJson } from './storage.js';

const stored = loadJson('goals', []);
let goals = Array.isArray(stored) ? stored : [];

const activeTags = new Set();
const goalDialog = $('#goalDialog');
let editingGoalId = null;
let selectedTag = '';
let confirmingDeleteId = null;
let confirmingArchivedDeleteId = null;
let confirmingDeleteInDialog = false;
// Goals whose long name is opened out (a card shows two lines of a name unless opened).
const openedNames = new Set();

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
  ratingError = '';
  renderRatingStrip();
  renderTagFilters();
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

// ---------- the fencing rating strip ----------
// Shows the rating ladder (U to A) with the fencer's rating on it, and what to aim for next: the
// next letter up, and earning the same letter again for the new year. Each can be pinned as a goal.
const openRatingSettings = () => {
  $('#settingsBtn').click();
  $('#editProfileRow').click();
};

// A message under the rating strip when a second rating goal is attempted; cleared on the next redraw.
let ratingError = '';

const ratingConflictMessage = (existing) => 'You already have a rating goal: ' + existing + '. Finish or delete it before adding another.';

function pinRatingGoal(name, due) {
  const existing = ratingGoalConflict(boardGoals(goals), name);
  if (existing) {
    ratingError = ratingConflictMessage(existing);
    renderRatingStrip();
    return;
  }
  goals.push({ id: makeId(), progress: 0, name, tag: 'competition', due });
  persist();
  renderGoals();
}

// An "Earn A26" button. Pressing it adds that goal, due December 31 of its year; once the goal is on
// the board it reads "Earn A26 ✓" and pressing it again takes the goal off the board.
function earnButton(label) {
  const goalName = earnGoalName(label);
  const onBoard = boardGoals(goals).find((goal) => goal.name === goalName);
  const yearEnd = toIso(new Date(2000 + Number(label.slice(1)), 11, 31));
  return el('button', {
    class: 'btn ghost small rating-earn',
    type: 'button',
    text: onBoard ? goalName + ' ✓' : goalName,
    title: onBoard ? 'Press again to remove this goal' : '',
    'aria-label': onBoard ? goalName + ' is on your board. Press to remove it.' : 'Add the goal ' + goalName,
    ...(onBoard ? { 'aria-pressed': 'true' } : {}),
    onclick: () => (onBoard ? deleteGoal(onBoard.id) : pinRatingGoal(goalName, yearEnd)),
  });
}

const shortDate = (date) => date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function renderRatingStrip() {
  const strip = $('#ratingStrip');
  const saved = parseRating(loadJson('profile', {}).rating);
  // What the fencer holds today: a rating that ran out has dropped a step since it was typed in.
  const held = saved ? currentRating(saved, new Date()) : null;
  const currentIndex = held ? RATING_LADDER.indexOf(held.letter) : -1;
  const targets = held ? ratingTargets(held, new Date()) : null;

  const ladder = el('ol', { class: 'rating-ladder', 'aria-label': 'Ratings from lowest to highest' },
    ...RATING_LADDER.map((letter, index) => {
      const state = index === currentIndex ? 'current' : index < currentIndex ? 'earned' : index === currentIndex + 1 && held ? 'next' : 'later';
      const label = index === currentIndex && held.year ? letter + String(held.year).slice(-2) : letter;
      return el('li', { class: 'rating-step ' + state, text: label, ...(state === 'current' ? { 'aria-current': 'true' } : {}) });
    }));

  const head = el('div', { class: 'rating-head' },
    el('h3', { text: 'Your rating' }),
    el('button', { class: 'link-btn small', type: 'button', text: saved ? 'Edit' : 'Add your rating', onclick: openRatingSettings }));
  strip.replaceChildren(head);
  if (!saved) {
    strip.append(ladder, el('p', { class: 'rating-note', text: 'Add your rating to see your path from U up to A.' }));
    return;
  }

  // The ladder with the goals you can add, in one row: aim up, or earn the same rating for next year.
  const buttons = [];
  if (targets.up) buttons.push(earnButton(targets.up.label));
  if (targets.renew) buttons.push(earnButton(targets.renew.label));
  strip.append(el('div', { class: 'rating-row' }, ladder, el('div', { class: 'rating-earn-buttons' }, ...buttons)));

  // A rating lasts four seasons: say when it runs out, or that it already dropped.
  const notes = [];
  if (held.dropped) {
    const heldLabel = held.letter === 'U' ? 'U (unrated)' : held.letter + String(held.year).slice(-2);
    notes.push('Your ' + held.dropped.from + ' dropped to ' + heldLabel + ' on ' + shortDate(held.dropped.on) + '.');
  }
  if (held.expiresOn) notes.push('Expires ' + shortDate(held.expiresOn) + '.');
  if (notes.length > 0) strip.append(el('p', { class: 'rating-note' + (held.dropped ? ' rating-warn' : ''), text: notes.join(' ') }));
  if (ratingError) strip.append(el('p', { class: 'form-error', role: 'alert', text: ratingError }));
}

function renderBoard() {
  const board = $('#goalBoard');
  board.replaceChildren();
  const onBoard = boardGoals(goals);
  if (onBoard.length === 0) {
    board.append(el('p', { class: 'empty', text: 'No goals yet.' }));
    return;
  }
  const shown = visibleGoals(onBoard, activeTags);
  if (shown.length === 0) {
    board.append(el('p', { class: 'empty', text: 'No goals. Tap "Show all" to reset.' }));
    return;
  }
  for (const goal of shown) board.append(goalCard(goal));
  markLongNames();
}

const FENCER_SVG = '<svg viewBox="0 0 64 44" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<circle cx="16" cy="8" r="6" fill="currentColor" stroke="none"/>'
  + '<path d="M16 15 L20 27 M20 27 L9 40 M20 27 L33 31 L35 41 M18 19 L8 14 M18 19 L36 21"/>'
  + '<path d="M36 21 L62 15" stroke-width="1.6"/></svg>';

// A long goal name shows two lines on its card, so one wordy goal does not make every card in its
// row tall. A card whose name is cut off gets a "Show more" link beside its tag (and "Show less"
// once opened), so the link does not make the card any taller.
function markLongNames() {
  if ($('#goalsPage').hidden) return;
  for (const card of document.querySelectorAll('#goalBoard .goal-card')) {
    card.querySelector('.goal-more')?.remove();
    const name = card.querySelector('.goal-card-name');
    const open = openedNames.has(card.dataset.goal);
    card.classList.remove('expanded');
    const cutOff = name.scrollHeight > name.clientHeight + 1;
    if (!cutOff && !open) continue;
    card.classList.toggle('expanded', open);
    const more = el('button', {
      class: 'link-btn small goal-more',
      type: 'button',
      text: open ? 'Show less' : 'Show more',
      'aria-expanded': String(open),
      onclick: () => {
        if (open) openedNames.delete(card.dataset.goal);
        else openedNames.add(card.dataset.goal);
        markLongNames();
      },
    });
    card.querySelector('.goal-card-top').append(more);
  }
}
window.addEventListener('resize', markLongNames);

function goalCard(goal) {
  const due = dueText(goal);
  const card = el('article', { class: 'goal-card goal-tag-' + goal.tag + (goal.progress >= 100 ? ' complete' : ''), 'data-goal': goal.id },
    el('div', { class: 'goal-card-top' }, el('span', { class: 'goal-card-tag', text: TAGS[goal.tag].label })),
    el('h3', { class: 'goal-card-name', title: goal.name, text: goal.name }),
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
  const edit = el('button', { class: 'btn ghost small', type: 'button', text: 'Edit', 'aria-label': 'Edit ' + goal.name, onclick: () => openGoalForm(goal) });
  // A finished goal gets Archive in place of Delete, so its card keeps the same two buttons (and
  // the same height). It can still be deleted for good from the Archive.
  if (canArchive(goal)) {
    return el('div', { class: 'goal-card-actions' },
      el('button', { class: 'btn ghost small', type: 'button', text: 'Archive', 'aria-label': 'Archive ' + goal.name, onclick: () => archiveGoal(goal) }),
      edit);
  }
  return el('div', { class: 'goal-card-actions' },
    edit,
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
  showDialog(goalDialog);
  goalGuard.reset();
  $('#gName').focus();
}

$('#addGoalBtn').addEventListener('click', () => openGoalForm(null));

$('#goalArchiveToggle').addEventListener('click', () => {
  const archive = $('#goalArchive');
  setFolded(archive, $('#goalArchiveToggle'), !archive.classList.contains('collapsed'));
});

// How big the goal cards are (Small, Medium or Large), which also sets how many fit on a row.
// Remembered on this device.
let cardSize = normalizeCardSize(loadJson('goalCardSize', 'medium'));

function applyCardSize() {
  $('#goalBoard').style.setProperty('--card-min', CARD_SIZES[cardSize].width + 'px');
  setSwitchButtons($('#goalSizeSwitch'), Object.entries(CARD_SIZES).map(([name, info]) => el('button', {
    class: 'view-btn',
    type: 'button',
    text: info.label,
    'aria-pressed': String(name === cardSize),
    onclick: () => {
      cardSize = name;
      saveJson('goalCardSize', cardSize);
      applyCardSize();
      // The cards changed width, so different names are now cut off.
      markLongNames();
    },
  })), '[aria-pressed="true"]');
}
applyCardSize();

$('#goalForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const fields = { name: $('#gName').value.trim(), tag: selectedTag, due: $('#gDue').value };
  const problem = validateGoal(fields);
  if (problem) {
    $('#goalFormError').textContent = problem;
    return;
  }
  const existingRatingGoal = ratingGoalConflict(boardGoals(goals), fields.name, editingGoalId);
  if (existingRatingGoal) {
    $('#goalFormError').textContent = ratingConflictMessage(existingRatingGoal);
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
