import { burstConfetti } from './confetti.js';
import { $, el } from './dom.js';
import { SESSION_TYPES, formatTime, parseIso, sessionsOn, shiftAnchor, toIso } from './schedule.js';
import {
  cleanStepsByType,
  finishedSession,
  keepTicksFor,
  removeStep,
  saveStep,
  sessionProgress,
  startingSteps,
  stepsDone,
  toggleStep,
} from './sessionsteps.js';
import { loadJson, saveJson } from './storage.js';

// The Routines screen is the Schedule's other half: for one day, a section for each session on
// the Schedule, holding the steps kept for that session's type. The sessions come from the
// Schedule each time the screen is drawn, so it always matches what is due that day.

// Steps for each session type. A first-time visitor gets the starter steps (and any routine saved
// before this screen was tied to the Schedule that is named after a session type).
const savedSteps = loadJson('sessionSteps', null);
let stepsByType = savedSteps === null ? startingSteps(loadJson('routines', [])) : cleanStepsByType(savedSteps);
if (savedSteps === null) saveJson('sessionSteps', stepsByType);

// Which steps are ticked for each session: { sessionId: [step keys] }.
const storedTicks = loadJson('sessionTicks', {});
let ticks = storedTicks !== null && typeof storedTicks === 'object' && !Array.isArray(storedTicks) ? storedTicks : {};

// Whether a ticked step gets a line through it (the user can turn this off).
let strikethrough = loadJson('routineStrikethrough', true) !== false;

// The day being shown, or null to follow today.
let shownIso = null;
// What is being changed: a step form open in one section, and a step waiting for "Really remove?".
let adding = null;
let editing = null;
let confirmingRemove = null;
let formError = '';

const currentDay = () => shownIso || toIso(new Date());

function persistSteps() {
  saveJson('sessionSteps', stepsByType);
}

function persistTicks() {
  saveJson('sessionTicks', ticks);
}

function allSessions() {
  const saved = loadJson('sessions', []);
  return Array.isArray(saved) ? saved : [];
}

export function renderRoutines() {
  const iso = currentDay();
  const sessions = allSessions();
  const daySessions = sessionsOn(sessions, iso).filter((session) => SESSION_TYPES[session.type]);
  ticks = keepTicksFor(ticks, sessions);

  const dateText = parseIso(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const count = daySessions.length;
  $('#routineSummary').textContent = (iso === toIso(new Date()) ? 'Today · ' : '') + dateText
    + ' · ' + (count === 0 ? 'no sessions' : count + (count === 1 ? ' session' : ' sessions'));
  $('#strikeToggle').checked = strikethrough;

  const sections = $('#routineSections');
  if (count === 0) {
    sections.replaceChildren(el('div', { class: 'routine-empty' },
      el('p', { class: 'empty', text: 'No sessions are scheduled for this day. Add one on the Schedule and it will show up here with its steps.' }),
      el('button', { class: 'btn ghost', type: 'button', text: 'Go to Schedule', onclick: () => { location.hash = '#schedule'; } })));
    return;
  }
  sections.replaceChildren(...daySessions.map(sessionSection));
}

function sessionSection(session) {
  const steps = stepsByType[session.type];
  const doneKeys = ticks[session.id] || [];
  const progress = sessionProgress(steps, doneKeys);
  const info = SESSION_TYPES[session.type];

  const meta = [session.time ? formatTime(session.time) : 'Any time', session.mins ? session.mins + ' min' : '', session.location]
    .filter(Boolean).join(' · ');
  const head = el('div', { class: 'routine-section-head' },
    el('h3', { text: info.label }),
    el('span', { class: 'routine-section-meta', text: meta }));
  if (session.done) head.append(el('span', { class: 'routine-done-tag', text: 'Done on the Schedule' }));

  const fill = el('span', { class: 'routine-bar-fill' });
  fill.style.width = Math.round(progress.fraction * 100) + '%';
  const bar = el('span', { class: 'routine-bar', role: 'img', 'aria-label': progress.done + ' of ' + progress.total + ' steps done' }, fill);
  const progressRow = el('div', { class: 'routine-progress' },
    bar,
    el('span', { text: progress.total === 0 ? 'No steps yet' : progress.done + ' of ' + progress.total + ' steps' }));

  const done = stepsDone(steps, doneKeys);
  const list = el('ul', { class: 'routine-steps' + (strikethrough ? ' strike' : '') },
    ...steps.map((step, index) => stepRow(session, step, index, done[index])));

  const section = el('section', { class: 'routine-section type-' + session.type, 'aria-label': info.label + ' session', 'data-session': session.id }, head, progressRow);
  if (steps.length === 0 && !(adding === session.type)) {
    section.append(el('p', { class: 'empty routine-empty-steps', text: 'No steps for ' + info.short + ' sessions yet.' }));
  }
  if (steps.length > 0) section.append(list);
  if (adding === session.type) section.append(stepForm(session.type, -1, { name: '', desc: '' }));
  else {
    section.append(el('button', {
      class: 'btn ghost small',
      type: 'button',
      text: '+ Add step',
      'aria-label': 'Add a step to ' + info.short + ' sessions',
      onclick: () => openForm(session.type, null),
    }));
  }
  return section;
}

function stepRow(session, step, index, isDone) {
  const type = session.type;
  if (editing && editing.type === type && editing.index === index) {
    return el('li', {}, stepForm(type, index, step));
  }
  const box = el('input', { type: 'checkbox', 'aria-label': step.name });
  box.checked = isDone;
  box.addEventListener('change', () => {
    const before = sessionProgress(stepsByType[type], ticks[session.id] || []);
    const spot = box.getBoundingClientRect();
    ticks = { ...ticks, [session.id]: toggleStep(ticks[session.id] || [], step) };
    persistTicks();
    renderRoutines();
    document.querySelector('[data-session="' + session.id + '"] li:nth-child(' + (index + 1) + ') input')?.focus();
    if (finishedSession(before, sessionProgress(stepsByType[type], ticks[session.id]))) {
      burstConfetti(spot.left + spot.width / 2, spot.top + spot.height / 2);
    }
  });
  const text = el('span', { class: 'routine-step-text' }, el('b', { text: step.name }));
  if (step.desc) text.append(' — ' + step.desc);

  const removing = confirmingRemove && confirmingRemove.type === type && confirmingRemove.index === index;
  const actions = removing
    ? [
      el('span', { text: 'Remove?' }),
      el('button', { class: 'link-btn small', type: 'button', text: 'Yes, remove', onclick: () => removeAt(type, index) }),
      el('button', { class: 'link-btn small', type: 'button', text: 'Keep', onclick: () => { confirmingRemove = null; renderRoutines(); } }),
    ]
    : [
      el('button', { class: 'link-btn small', type: 'button', text: 'Edit', 'aria-label': 'Edit ' + step.name, onclick: () => openForm(type, index) }),
      el('button', { class: 'link-btn small', type: 'button', text: 'Remove', 'aria-label': 'Remove ' + step.name, onclick: () => { confirmingRemove = { type, index }; renderRoutines(); } }),
    ];
  const row = el('li', { class: isDone ? 'done' : '' },
    el('label', { class: 'routine-step' }, box, text),
    el('div', { class: 'routine-step-actions' }, ...actions));
  return row;
}

// The little form for adding a step (index -1) or changing one.
function stepForm(type, index, step) {
  const name = el('input', { type: 'text', maxlength: '100', placeholder: 'e.g. Pulse raise', value: step.name, 'aria-label': 'Step name' });
  const desc = el('input', { type: 'text', maxlength: '200', placeholder: 'e.g. 3 min light jogging (optional)', value: step.desc, 'aria-label': 'Step description' });
  const error = el('p', { class: 'form-error', role: 'alert', text: formError });
  const form = el('form', { class: 'routine-step-form', novalidate: '' },
    el('label', { class: 'field' }, 'Step', name),
    el('label', { class: 'field' }, 'Description', desc),
    error,
    el('div', { class: 'form-actions' },
      el('button', { class: 'btn small', type: 'submit', text: index < 0 ? 'Add step' : 'Save step' }),
      el('button', { class: 'btn ghost small', type: 'button', text: 'Cancel', onclick: closeForm })));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const result = saveStep(stepsByType[type], { name: name.value, desc: desc.value }, index);
    if (result.error) {
      formError = result.error;
      error.textContent = result.error;
      return;
    }
    stepsByType = { ...stepsByType, [type]: result.steps };
    persistSteps();
    closeForm();
  });
  form.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeForm();
    }
  });
  queueMicrotask(() => name.focus());
  return form;
}

function openForm(type, index) {
  adding = index === null ? type : null;
  editing = index === null ? null : { type, index };
  confirmingRemove = null;
  formError = '';
  renderRoutines();
}

function closeForm() {
  adding = null;
  editing = null;
  formError = '';
  renderRoutines();
}

function removeAt(type, index) {
  stepsByType = { ...stepsByType, [type]: removeStep(stepsByType[type], index) };
  confirmingRemove = null;
  persistSteps();
  renderRoutines();
}

// ---------- the day, and the strikethrough switch ----------
function goToDay(iso) {
  shownIso = iso === toIso(new Date()) ? null : iso;
  adding = null;
  editing = null;
  confirmingRemove = null;
  renderRoutines();
}

$('#routineToday').addEventListener('click', () => goToDay(toIso(new Date())));
$('#routinePrev').addEventListener('click', () => goToDay(shiftAnchor('day', currentDay(), -1)));
$('#routineNext').addEventListener('click', () => goToDay(shiftAnchor('day', currentDay(), 1)));

$('#strikeToggle').addEventListener('change', (event) => {
  strikethrough = event.target.checked;
  saveJson('routineStrikethrough', strikethrough);
  renderRoutines();
});
