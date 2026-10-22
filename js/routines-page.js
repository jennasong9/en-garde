import { burstConfetti } from './confetti.js';
import { $, el, formState, makeDraggable, protectUnsavedChanges } from './dom.js';
import {
  MAX_STEPS,
  STARTER_ROUTINES,
  finishedRoutine,
  normalizeSteps,
  reconcileDone,
  routineProgress,
  routineSummary,
  stepsDone,
  toggleStep,
  validateRoutine,
} from './routines.js';
import { makeId, toIso } from './schedule.js';
import { loadJson, saveJson } from './storage.js';

const stored = loadJson('routines', []);
let routines = Array.isArray(stored) ? stored : [];
// Routines saved earlier kept each step as one line of text; they now have a name and a description.
for (const routine of routines) routine.steps = normalizeSteps(routine.steps);

const routineDialog = $('#routineDialog');
// Whether a ticked step gets a line through it (the user can turn this off).
let strikethrough = loadJson('routineStrikethrough', true) !== false;
let selectedId = null;
let editingId = null;
let confirmingDelete = false;
// Delete takes two presses in the edit box, too.
let confirmingDeleteInDialog = false;

function persist() {
  saveJson('routines', routines);
}

export function renderRoutines() {
  if (!routines.some((routine) => routine.id === selectedId)) selectedId = routines.length > 0 ? routines[0].id : null;
  $('#routineSummary').textContent = routines.length === 0
    ? 'No routines yet.'
    : routines.length + (routines.length === 1 ? ' routine' : ' routines');
  $('#routineOption').hidden = routines.length === 0;
  $('#strikeToggle').checked = strikethrough;
  renderList();
  renderDetail();
}

// The left column: one button per routine, the chosen one highlighted.
function renderList() {
  const list = $('#routineList');
  if (routines.length === 0) {
    list.replaceChildren(
      el('p', { class: 'empty', text: 'Nothing here yet. Tap "+ New routine" or add a starter routine.' }),
      el('button', { class: 'btn ghost', type: 'button', text: 'Add starter routines', onclick: addStarterRoutines }));
    return;
  }
  list.replaceChildren(...routines.map((routine) => el('button', {
    class: 'routine-item',
    type: 'button',
    'aria-pressed': String(routine.id === selectedId),
    onclick: () => {
      selectedId = routine.id;
      confirmingDelete = false;
      renderRoutines();
    },
  },
  el('span', { class: 'routine-item-text' }, el('b', { text: routine.name }), el('span', { text: routineSummary(routine) })),
  smallRing(routine))));
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// A ring that fills as `fraction` (0 to 1) of the way round. `size` is its width in pixels.
function progressRing(fraction, size, strokeWidth) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
  svg.setAttribute('class', 'progress-ring');
  svg.setAttribute('aria-hidden', 'true');
  for (const [className, amount] of [['pr-track', 0], ['pr-fill', fraction]]) {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('class', className);
    circle.setAttribute('cx', String(size / 2));
    circle.setAttribute('cy', String(size / 2));
    circle.setAttribute('r', String(radius));
    circle.setAttribute('stroke-width', String(strokeWidth));
    if (className === 'pr-fill') {
      circle.setAttribute('stroke-dasharray', String(circumference));
      circle.setAttribute('stroke-dashoffset', String(circumference * (1 - amount)));
    }
    svg.append(circle);
  }
  return svg;
}

// The small ring on each routine in the list: how many of its steps are done today.
function smallRing(routine) {
  const progress = routineProgress(routine, toIso(new Date()));
  const wrap = el('span', {
    class: 'routine-ring' + (progress.total > 0 && progress.done === progress.total ? ' complete' : ''),
    role: 'img',
    'aria-label': progress.done + ' of ' + progress.total + ' steps done today',
  }, progressRing(progress.fraction, 32, 4));
  if (progress.total > 0 && progress.done === progress.total) wrap.append(el('span', { class: 'routine-ring-check', text: '✓' }));
  return wrap;
}

// The right column: the chosen routine's steps.
function renderDetail() {
  const detail = $('#routineDetail');
  const routine = routines.find((item) => item.id === selectedId);
  if (!routine) {
    detail.replaceChildren(el('p', {
      class: 'empty',
      text: routines.length === 0 ? 'A routine\'s steps will show up here.' : 'Pick a routine to see its steps.',
    }));
    return;
  }
  const today = toIso(new Date());
  const done = stepsDone(routine, today);
  const progress = routineProgress(routine, today);
  const steps = el('ul', { class: 'routine-steps' + (strikethrough ? ' strike' : '') }, ...routine.steps.map((step, index) => {
    const box = el('input', { type: 'checkbox', 'data-index': String(index) });
    box.checked = done[index];
    box.addEventListener('change', () => {
      const before = routineProgress(routine, toIso(new Date()));
      const spot = box.getBoundingClientRect();
      Object.assign(routine, toggleStep(routine, index, toIso(new Date())));
      persist();
      renderRoutines();
      $('#routineDetail').querySelector('input[data-index="' + index + '"]')?.focus();
      if (finishedRoutine(before, routineProgress(routine, toIso(new Date())))) burstConfetti(spot.left + spot.width / 2, spot.top + spot.height / 2);
    });
    const text = el('span', { class: 'routine-step-text' }, el('b', { text: step.name }));
    if (step.desc) text.append(' — ' + step.desc);
    return el('li', { class: done[index] ? 'done' : '' }, el('label', { class: 'routine-step' }, box, text));
  }));
  const overall = el('div', { class: 'routine-overall', role: 'img', 'aria-label': progress.done + ' of ' + progress.total + ' steps done today' },
    el('div', { class: 'routine-overall-dial' }, progressRing(progress.fraction, 64, 6),
      el('span', { class: 'routine-overall-count', text: progress.done + '/' + progress.total })),
    el('span', { class: 'routine-overall-label', text: progress.total > 0 && progress.done === progress.total ? 'All done!' : 'done today' }));
  detail.replaceChildren(
    el('div', { class: 'routine-detail-head' },
      el('div', {}, el('h3', { text: routine.name }), el('p', { class: 'routine-meta', text: routineSummary(routine) })),
      overall),
    steps,
    detailActions(routine, progress.done > 0));
}

function detailActions(routine, anyDone = false) {
  if (confirmingDelete) {
    return el('div', { class: 'sticky-actions sticky-confirm' },
      el('span', { text: 'Delete this routine?' }),
      el('button', { class: 'btn danger small', type: 'button', text: 'Yes, delete', onclick: () => deleteRoutine(routine.id) }),
      el('button', {
        class: 'btn ghost small',
        type: 'button',
        text: 'Keep it',
        onclick: () => {
          confirmingDelete = false;
          renderDetail();
        },
      }));
  }
  const actions = el('div', { class: 'sticky-actions' },
    el('button', { class: 'btn ghost small', type: 'button', text: 'Edit', onclick: () => openForm(routine) }),
    el('button', {
      class: 'btn danger small',
      type: 'button',
      text: 'Delete',
      onclick: () => {
        confirmingDelete = true;
        renderDetail();
      },
    }));
  if (anyDone) {
    actions.append(el('button', {
      class: 'link-btn small',
      type: 'button',
      text: 'Clear checks',
      onclick: () => {
        routine.done = [];
        routine.doneDate = '';
        persist();
        renderRoutines();
      },
    }));
  }
  return actions;
}

function deleteRoutine(id) {
  routines = routines.filter((routine) => routine.id !== id);
  confirmingDelete = false;
  persist();
  renderRoutines();
}

function addStarterRoutines() {
  routines = [...routines, ...STARTER_ROUTINES.map((starter) => ({ id: makeId(), ...starter, steps: starter.steps.map((step) => ({ ...step })) }))];
  persist();
  renderRoutines();
}

// ---------- the steps in the add / edit box ----------
// Each step is a row with a drag handle, a name box and a description box side by side, and a
// remove button. Drag the handle (or press the up and down arrow keys on it) to reorder.
function stepRow(step) {
  const name = el('input', { type: 'text', class: 'step-name', maxlength: '100', placeholder: 'e.g. Pulse raise', value: step.name });
  const desc = el('input', { type: 'text', class: 'step-desc', maxlength: '200', placeholder: 'e.g. 3 min light jogging', value: step.desc });
  const handle = el('button', { class: 'step-handle', type: 'button', text: '⠿', title: 'Drag to reorder' });
  const remove = el('button', { class: 'step-remove', type: 'button', text: '✕' });
  const row = el('div', { class: 'step-row' }, handle, el('span', { class: 'step-number' }), name, desc, remove);

  // Removing a step takes two presses (the first asks "Remove?" and is forgotten after a few
  // seconds or when the button loses focus); an empty step goes straight away.
  let confirmTimer = null;
  const stopConfirming = () => {
    clearTimeout(confirmTimer);
    remove.classList.remove('confirming');
    remove.textContent = '✕';
  };
  remove.addEventListener('click', () => {
    const hasContent = name.value.trim() !== '' || desc.value.trim() !== '';
    if (hasContent && !remove.classList.contains('confirming')) {
      remove.classList.add('confirming');
      remove.textContent = 'Remove?';
      confirmTimer = setTimeout(stopConfirming, 4000);
      return;
    }
    stopConfirming();
    const rows = row.parentElement;
    const neighbor = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    // Always leave one row to type into.
    if (rows.children.length === 0) rows.append(stepRow({ name: '', desc: '' }));
    renumberRows();
    (neighbor || rows.firstElementChild).querySelector('.step-name').focus();
  });
  remove.addEventListener('blur', stopConfirming);

  enableRowDrag(row, handle, name);

  // Enter moves along instead of saving: name -> description -> the next step (a new one after the last).
  name.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    desc.focus();
  });
  desc.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const next = row.nextElementSibling;
    if (next) next.querySelector('.step-name').focus();
    else addStepRow();
  });
  return row;
}

// Lets a step row be dragged up or down by its handle. A small label follows the pointer and a line
// shows where the step would land. The arrow keys on the handle move it one place.
function enableRowDrag(row, handle, nameBox) {
  const rowsBox = () => $('#routineStepRows');
  // The other step rows (not the drop line, which also sits in this box while dragging).
  const others = () => [...rowsBox().querySelectorAll('.step-row')].filter((other) => other !== row);
  const indexAt = (y) => others().filter((other) => {
    const box = other.getBoundingClientRect();
    return y > box.top + box.height / 2;
  }).length;
  let ghost = null;
  let line = null;
  const cleanup = () => {
    if (ghost) ghost.remove();
    if (line) line.remove();
    ghost = null;
    line = null;
    row.classList.remove('drag-source');
  };
  const moveTo = (index) => {
    const rest = others();
    rowsBox().insertBefore(row, rest[index] || null);
    renumberRows();
  };

  makeDraggable(handle, {
    move: (event, dx, dy) => {
      if (!ghost) {
        const box = row.getBoundingClientRect();
        const label = row.querySelector('.step-number').textContent + '. ' + (nameBox.value.trim() || 'New step');
        ghost = el('div', { class: 'step-ghost', text: label });
        Object.assign(ghost.style, { left: box.left + 'px', top: box.top + 'px', width: box.width + 'px' });
        document.body.append(ghost);
        row.classList.add('drag-source');
      }
      ghost.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
      if (line) line.remove();
      line = el('div', { class: 'drop-line' });
      rowsBox().insertBefore(line, others()[indexAt(event.clientY)] || null);
    },
    drop: (event) => {
      const index = indexAt(event.clientY);
      cleanup();
      moveTo(index);
    },
    cancel: cleanup,
  });
  handle.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const rows = [...rowsBox().querySelectorAll('.step-row')];
    const next = rows.indexOf(row) + (event.key === 'ArrowUp' ? -1 : 1);
    if (next < 0 || next >= rows.length) return;
    moveTo(next);
    handle.focus();
  });
}

// Numbers the rows and labels their boxes for screen readers.
function renumberRows() {
  const rows = [...$('#routineStepRows').children];
  rows.forEach((row, index) => {
    const number = index + 1;
    row.querySelector('.step-number').textContent = String(number);
    row.querySelector('.step-name').setAttribute('aria-label', 'Step ' + number + ' name');
    row.querySelector('.step-desc').setAttribute('aria-label', 'Step ' + number + ' description');
    row.querySelector('.step-handle').setAttribute('aria-label', 'Move step ' + number + '. Drag, or press the up and down arrow keys.');
    row.querySelector('.step-remove').setAttribute('aria-label', 'Remove step ' + number);
  });
  $('#addStepBtn').disabled = rows.length >= MAX_STEPS;
}

function addStepRow() {
  const row = stepRow({ name: '', desc: '' });
  $('#routineStepRows').append(row);
  renumberRows();
  row.querySelector('.step-name').focus();
  row.scrollIntoView({ block: 'nearest' });
}

function readStepRows() {
  return [...$('#routineStepRows').children].map((row) => ({
    name: row.querySelector('.step-name').value,
    desc: row.querySelector('.step-desc').value,
  }));
}

$('#addStepBtn').addEventListener('click', addStepRow);

// ---------- add / edit a routine ----------
function openForm(routine) {
  editingId = routine ? routine.id : null;
  $('#routineDialogTitle').textContent = routine ? 'Edit routine' : 'New routine';
  $('#rName').value = routine ? routine.name : '';
  $('#rMins').value = routine && routine.mins !== null ? routine.mins : '';
  $('#routineStepRows').replaceChildren(...(routine ? routine.steps : [{ name: '', desc: '' }]).map((step) => stepRow(step)));
  renumberRows();
  $('#routineError').textContent = '';
  const deleteButton = $('#routineDelete');
  deleteButton.hidden = !routine;
  deleteButton.textContent = 'Delete';
  confirmingDeleteInDialog = false;
  routineDialog.showModal();
  routineGuard.reset();
  $('#rName').focus();
}

$('#addRoutineBtn').addEventListener('click', () => openForm(null));

$('#strikeToggle').addEventListener('change', (event) => {
  strikethrough = event.target.checked;
  saveJson('routineStrikethrough', strikethrough);
  renderDetail();
});

$('#routineForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const result = validateRoutine({ name: $('#rName').value, minsText: $('#rMins').value, steps: readStepRows() });
  if (result.error) {
    $('#routineError').textContent = result.error;
    return;
  }
  if (editingId) {
    const routine = routines.find((item) => item.id === editingId);
    // Keep today's checks on steps whose text did not change.
    Object.assign(routine, reconcileDone(routine, result.value.steps, toIso(new Date())), result.value);
    selectedId = editingId;
  } else {
    const created = { id: makeId(), ...result.value };
    routines.push(created);
    selectedId = created.id;
  }
  persist();
  routineDialog.close();
  renderRoutines();
});

// Deleting takes two presses so a stray tap does not remove a routine.
$('#routineDelete').addEventListener('click', () => {
  if (!confirmingDeleteInDialog) {
    confirmingDeleteInDialog = true;
    $('#routineDelete').textContent = 'Really delete?';
    return;
  }
  routineDialog.close();
  deleteRoutine(editingId);
});

const routineGuard = protectUnsavedChanges(routineDialog, () => formState($('#routineForm')));
$('#routineClose').addEventListener('click', () => routineDialog.close());
$('#routineCancel').addEventListener('click', () => routineDialog.close());
