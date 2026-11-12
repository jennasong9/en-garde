import { showDialog } from './dialog-motion.js';
import { burstConfetti } from './confetti.js';
import { $, closeOnBackdropClick, el, formState, protectUnsavedChanges } from './dom.js';
import { SESSION_TYPES, cleanSessions, formatTime, makeId, parseIso, sessionsOn, shiftAnchor, toIso } from './schedule.js';
import {
  SECTION_TYPES,
  cleanStepsBySession,
  cleanTicks,
  doneAfterTick,
  finishedSession,
  keepStepsFor,
  keepTicksFor,
  migrateStepsToSessions,
  removeStep,
  renameTick,
  saveStep,
  sessionProgress,
  stepsDone,
  ticksForDone,
  toggleStep,
} from './sessionsteps.js';
import { loadJson, saveJson } from './storage.js';
import { checkVideoFile, parseYouTubeLink, videoLabel, youtubeEmbedUrl, youtubeWatchUrl } from './stepvideo.js';
import { deleteVideo, loadVideo, saveVideo } from './videostore.js';
import { buildMenu } from './menu.js';
import { hasReflection, writeReflection } from './journal-page.js';
import { showToast } from './toast.js';
import {
  cleanSavedRoutines,
  defaultRoutineName,
  routineHasStep,
  routineSummary,
  routineWithoutStep,
  snapshotRoutine,
  starterRoutines,
  validateRoutineName,
} from './routinelibrary.js';

// The Routines screen is the Schedule's other half: for one day, a section for each session on
// the Schedule, holding that session's own steps (a new session starts with none; the user can add
// steps or load a saved routine). The sessions come from the Schedule each time the screen is
// drawn, so it always matches what is due that day.

// The steps of each session: { sessionId: { steps, routineId? } }. Before sessions had their own
// steps, every session of a type shared one list (kept under 'sessionSteps'); the first time this
// runs, sessions up to today get a copy of it so nothing already done loses its steps.
const savedBySession = loadJson('stepsBySession', null);
let stepsBySession;
if (savedBySession === null) {
  stepsBySession = migrateStepsToSessions(loadJson('sessionSteps', null), allSessions(), toIso(new Date()));
  saveJson('stepsBySession', stepsBySession);
} else {
  stepsBySession = cleanStepsBySession(savedBySession);
}

// Which steps are ticked for each session: { sessionId: [step keys] }.
let ticks = cleanTicks(loadJson('sessionTicks', {}));

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
  saveJson('stepsBySession', stepsBySession);
}

const stepsOf = (sessionId) => stepsBySession[sessionId]?.steps ?? [];

// Replaces a session's steps. `routineId` is the saved routine they now match (kept as it was when
// not given); a session with no steps keeps no record.
function setSteps(sessionId, steps, routineId = stepsBySession[sessionId]?.routineId) {
  const next = { ...stepsBySession };
  if (steps.length === 0) delete next[sessionId];
  else next[sessionId] = routineId ? { steps, routineId } : { steps };
  stepsBySession = next;
  persistSteps();
}

// The saved routine a session's steps were last saved to or loaded from, if it still exists.
function linkedRoutine(session) {
  const id = stepsBySession[session.id]?.routineId;
  return (savedRoutines[session.type] || []).find((routine) => routine.id === id) ?? null;
}

function persistTicks() {
  saveJson('sessionTicks', ticks);
}

function allSessions() {
  return cleanSessions(loadJson('sessions', []));
}

// Asks the Schedule to change a session's Done box when a change to its steps (an added step, a
// loaded routine) means it is no longer finished. `before` is the progress before the change.
function syncDone(sessionId, before) {
  const done = doneAfterTick(before, sessionProgress(stepsOf(sessionId), ticks[sessionId] || []));
  if (done !== null) document.dispatchEvent(new CustomEvent('session-done-change', { detail: { id: sessionId, done } }));
}

// Called by the Schedule when a session's Done box is switched: ticks every step of that session
// (or clears them all), so the two screens agree. A type with no steps has nothing to tick.
export function setSessionStepsDone(session) {
  const steps = stepsOf(session.id);
  if (steps.length === 0) return;
  ticks = { ...ticks, [session.id]: ticksForDone(steps, session.done) };
  persistTicks();
}

export function renderRoutines() {
  const iso = currentDay();
  const sessions = allSessions();
  const daySessions = sessionsOn(sessions, iso).filter((session) => SESSION_TYPES[session.type]);
  ticks = keepTicksFor(ticks, sessions);
  const { kept, removed } = keepStepsFor(stepsBySession, sessions);
  if (removed.length > 0) {
    for (const record of removed) {
      for (const step of record.steps) if (step.video?.kind === 'file') deleteVideo(step.video.id).catch(() => {});
    }
    stepsBySession = kept;
    persistSteps();
  }

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
  if (!SECTION_TYPES.includes(session.type)) return noStepsSection(session);
  const steps = stepsOf(session.id);
  const doneKeys = ticks[session.id] || [];
  const progress = sessionProgress(steps, doneKeys);
  const info = SESSION_TYPES[session.type];

  const meta = [session.time ? formatTime(session.time) : 'All day', session.mins ? session.mins + ' min' : '', session.location]
    .filter(Boolean).join(' · ');
  const head = el('div', { class: 'routine-section-head' },
    el('h3', { text: info.short }),
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

  const section = el('section', { class: 'routine-section type-' + session.type, 'aria-label': info.short + ' session', 'data-session': session.id }, head, progressRow);
  if (steps.length === 0 && adding !== session.id) {
    section.append(el('p', { class: 'empty routine-empty-steps', text: 'Add steps one by one, or load a saved routine.' }));
  }
  if (steps.length > 0) section.append(list);
  if (adding === session.id) section.append(stepForm(session, -1, { name: '', desc: '' }));
  else {
    section.append(el('div', { class: 'routine-section-actions' },
      el('button', {
        class: 'btn ghost small',
        type: 'button',
        text: '+ Add step',
        'aria-label': 'Add a step to this ' + info.short + ' session',
        onclick: () => openForm(session.id, null),
      }),
      reflectionButton(session),
      buildMenu('btn ghost small', 'Saved ' + info.short + ' routines', ['Saved routines ', el('span', { class: 'chevron', 'aria-hidden': 'true' })], [
        { text: 'Save these steps as a routine', onclick: () => openSaveRoutine(session) },
        { text: 'Load a saved routine', onclick: () => openLoadRoutine(session) },
      ])));
  }
  return section;
}

// "Write reflection" (or "View reflection" once there is one) for a session: opens its Journal
// entry in a pop-up, without leaving this page.
function reflectionButton(session) {
  return el('button', {
    class: 'btn ghost small',
    type: 'button',
    text: hasReflection(session) ? 'View reflection' : 'Write reflection',
    onclick: () => writeReflection(session),
  });
}

// Rest and Tournament are on the Schedule but have no steps to do: just the session itself.
function noStepsSection(session) {
  const info = SESSION_TYPES[session.type];
  const meta = [session.time ? formatTime(session.time) : 'All day', session.mins ? session.mins + ' min' : '', session.location]
    .filter(Boolean).join(' · ');
  const head = el('div', { class: 'routine-section-head' },
    el('h3', { text: info.short }),
    el('span', { class: 'routine-section-meta', text: meta }));
  if (session.done) head.append(el('span', { class: 'routine-done-tag', text: 'Done on the Schedule' }));
  return el('section', { class: 'routine-section type-' + session.type, 'aria-label': info.short + ' session', 'data-session': session.id },
    head, el('div', { class: 'routine-section-actions' }, reflectionButton(session)));
}

function stepRow(session, step, index, isDone) {
  if (editing && editing.id === session.id && editing.index === index) {
    return el('li', {}, stepForm(session, index, step));
  }
  const box = el('input', { type: 'checkbox', 'aria-label': step.name });
  box.checked = isDone;
  box.addEventListener('change', () => {
    const before = sessionProgress(stepsOf(session.id), ticks[session.id] || []);
    const spot = box.getBoundingClientRect();
    ticks = { ...ticks, [session.id]: toggleStep(ticks[session.id] || [], step) };
    persistTicks();
    const after = sessionProgress(stepsOf(session.id), ticks[session.id]);
    const done = doneAfterTick(before, after);
    // The Schedule owns the Done box, so ask it to change (it saves before this screen redraws).
    if (done !== null) document.dispatchEvent(new CustomEvent('session-done-change', { detail: { id: session.id, done } }));
    renderRoutines();
    document.querySelector('[data-session="' + session.id + '"] li:nth-child(' + (index + 1) + ') input')?.focus();
    if (finishedSession(before, after)) burstConfetti(spot.left + spot.width / 2, spot.top + spot.height / 2);
  });
  const text = el('span', { class: 'routine-step-text' }, el('b', { text: step.name }));
  if (step.desc) text.append(' — ' + step.desc);

  const removing = confirmingRemove && confirmingRemove.id === session.id && confirmingRemove.index === index;
  // A step that is also in the saved routine this session came from: ask whether to remove it there too.
  const routine = removing ? linkedRoutine(session) : null;
  const inRoutine = routine && routineHasStep(routine, step) ? routine : null;
  const actions = removing
    ? [
      el('span', { text: 'Remove?' }),
      el('button', { class: 'link-btn small', type: 'button', text: inRoutine ? 'This session only' : 'Yes, remove', onclick: () => removeAt(session, index) }),
      ...(inRoutine ? [el('button', {
        class: 'link-btn small',
        type: 'button',
        text: 'Also from "' + inRoutine.name + '"',
        onclick: () => removeAt(session, index, inRoutine),
      })] : []),
      el('button', { class: 'link-btn small', type: 'button', text: 'Keep', onclick: () => { confirmingRemove = null; renderRoutines(); } }),
    ]
    : [
      ...(step.video ? [el('button', { class: 'link-btn small', type: 'button', text: '▶ Watch', 'aria-label': 'Watch the video for ' + step.name, onclick: () => openVideo(step) })] : []),
      el('button', { class: 'link-btn small', type: 'button', text: 'Edit', 'aria-label': 'Edit ' + step.name, onclick: () => openForm(session.id, index) }),
      el('button', { class: 'link-btn small', type: 'button', text: 'Remove', 'aria-label': 'Remove ' + step.name, onclick: () => { confirmingRemove = { id: session.id, index }; renderRoutines(); } }),
    ];
  const row = el('li', { class: isDone ? 'done' : '' },
    el('label', { class: 'routine-step' }, box, text),
    el('div', { class: 'routine-step-actions' }, ...actions));
  return row;
}

// The "Video" part of the step form: a YouTube link box and an upload button, or, once a video is
// chosen, its name with a Remove button. `choice` holds the video: null (none), a saved video, or
// { kind: 'pending', file } for a file chosen but not saved yet (it is saved with the step).
function videoField(choice, linkBox) {
  const fileInput = el('input', { type: 'file', accept: 'video/*', 'aria-label': 'Choose a video file' });
  fileInput.hidden = true;
  const note = el('p', { class: 'form-error', role: 'alert' });
  const area = el('div', { class: 'step-video-area' });

  const show = () => {
    if (choice.current) {
      const name = choice.current.kind === 'pending' ? choice.current.file.name : videoLabel(choice.current);
      area.replaceChildren(
        el('span', { class: 'step-video-name', text: '▶ ' + name }),
        el('button', { class: 'btn danger small', type: 'button', text: 'Remove video', onclick: () => { choice.current = null; show(); } }));
    } else {
      area.replaceChildren(
        linkBox,
        el('button', { class: 'btn ghost small', type: 'button', text: 'Upload a video file', onclick: () => fileInput.click() }));
    }
  };
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    const problem = checkVideoFile(file).error;
    note.textContent = problem || '';
    if (problem) return;
    choice.current = { kind: 'pending', file };
    show();
  });
  show();
  return el('div', { class: 'step-video' }, el('span', { class: 'step-video-title', text: 'Video (optional)' }), area, fileInput, note);
}

// The little form for adding a step (index -1) or changing one.
function stepForm(session, index, step) {
  const sessionId = session.id;
  const name = el('input', { type: 'text', maxlength: '100', value: step.name, 'aria-label': 'Step name' });
  const desc = el('input', { type: 'text', maxlength: '200', value: step.desc, 'aria-label': 'Step description' });
  const link = el('input', { type: 'text', inputmode: 'url', autocomplete: 'off', spellcheck: 'false', placeholder: 'Paste a YouTube link', 'aria-label': 'YouTube link' });
  const choice = { current: step.video ?? null };
  const error = el('p', { class: 'form-error', role: 'alert', text: formError });
  const submit = el('button', { class: 'btn small', type: 'submit', text: index < 0 ? 'Add step' : 'Save step' });
  const form = el('form', { class: 'routine-step-form', novalidate: '' },
    el('label', { class: 'field' }, 'Step', name),
    el('label', { class: 'field' }, 'Description', desc),
    videoField(choice, link),
    error,
    el('div', { class: 'form-actions' },
      submit,
      el('button', { class: 'btn ghost small', type: 'button', text: 'Cancel', onclick: closeForm })));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fail = (message) => {
      formError = message;
      error.textContent = message;
      submit.disabled = false;
    };
    submit.disabled = true;
    let video = choice.current;
    let savedNewFile = null;
    try {
      if (video === null && link.value.trim() !== '') {
        const parsed = parseYouTubeLink(link.value);
        if (parsed.error) return fail(parsed.error);
        video = { kind: 'youtube', id: parsed.id };
      } else if (video?.kind === 'pending') {
        savedNewFile = await saveVideo(video.file);
        video = { kind: 'file', id: savedNewFile, name: video.file.name };
      }
    } catch (problem) {
      return fail(problem.message);
    }
    const result = saveStep(stepsOf(sessionId), { name: name.value, desc: desc.value, video }, index);
    if (result.error) {
      if (savedNewFile) deleteVideo(savedNewFile).catch(() => {});
      return fail(result.error);
    }
    const oldStep = index >= 0 ? stepsOf(sessionId)[index] : null;
    const before = sessionProgress(stepsOf(sessionId), ticks[sessionId] || []);
    if (oldStep?.video?.kind === 'file' && oldStep.video.id !== video?.id) deleteVideo(oldStep.video.id).catch(() => {});
    setSteps(sessionId, result.steps);
    // An edited step that was ticked stays ticked, and Done follows the ticks.
    if (oldStep) {
      ticks = { ...ticks, [sessionId]: renameTick(ticks[sessionId] || [], oldStep, result.steps[index]) };
      persistTicks();
    }
    syncDone(sessionId, before);
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

function openForm(sessionId, index) {
  adding = index === null ? sessionId : null;
  editing = index === null ? null : { id: sessionId, index };
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

// Removes a step from one session, and from `alsoFrom` (a saved routine) when that is given.
function removeAt(session, index, alsoFrom = null) {
  const step = stepsOf(session.id)[index];
  if (step?.video?.kind === 'file') deleteVideo(step.video.id).catch(() => {});
  setSteps(session.id, removeStep(stepsOf(session.id), index));
  if (alsoFrom) {
    const changed = routineWithoutStep(alsoFrom, step);
    const emptied = changed.steps.length === 0;
    // A routine with no steps left would only wipe a session when loaded, so it goes too.
    savedRoutines = {
      ...savedRoutines,
      [session.type]: savedRoutines[session.type].flatMap((routine) => (routine.id !== changed.id ? [routine] : emptied ? [] : [changed])),
    };
    persistRoutines();
    showToast(emptied ? 'Removed. "' + alsoFrom.name + '" had no steps left, so it was deleted.' : 'Removed from "' + alsoFrom.name + '" too.');
  }
  confirmingRemove = null;
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

// Shows the Routines page on a given day (used by the Schedule's "Open routine" button).
export const showRoutinesDay = goToDay;

$('#routineToday').addEventListener('click', () => goToDay(toIso(new Date())));
$('#routinePrev').addEventListener('click', () => goToDay(shiftAnchor('day', currentDay(), -1)));
$('#routineNext').addEventListener('click', () => goToDay(shiftAnchor('day', currentDay(), 1)));

$('#strikeToggle').addEventListener('change', (event) => {
  strikethrough = event.target.checked;
  saveJson('routineStrikethrough', strikethrough);
  renderRoutines();
});

// ---------- watching a step's video ----------
const videoDialog = $('#videoDialog');
let videoUrl = null;

function closeVideo() {
  videoDialog.close();
}

videoDialog.addEventListener('close', () => {
  // Emptying the pop-up stops the video.
  $('#videoBody').replaceChildren();
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = null;
});
$('#videoClose').addEventListener('click', closeVideo);
closeOnBackdropClick(videoDialog);

async function openVideo(step) {
  $('#videoTitle').textContent = step.name;
  const body = $('#videoBody');
  body.replaceChildren(el('p', { class: 'empty', text: 'Loading the video…' }));
  showDialog(videoDialog);
  if (step.video.kind === 'youtube') {
    body.replaceChildren(
      el('iframe', {
        class: 'video-frame',
        src: youtubeEmbedUrl(step.video.id),
        title: step.name + ' (YouTube video)',
        allow: 'fullscreen; picture-in-picture; encrypted-media',
        referrerpolicy: 'strict-origin-when-cross-origin',
      }),
      el('a', { class: 'video-fallback', href: youtubeWatchUrl(step.video.id), target: '_blank', rel: 'noopener', text: 'Open in YouTube ↗' }));
    return;
  }
  try {
    const file = await loadVideo(step.video.id);
    if (!videoDialog.open) return;
    if (!file) {
      body.replaceChildren(el('p', { class: 'form-error', text: 'This video is not saved on this device any more. Edit the step to add it again.' }));
      return;
    }
    videoUrl = URL.createObjectURL(file);
    body.replaceChildren(el('video', { class: 'video-frame', src: videoUrl, controls: '', playsinline: '', 'aria-label': step.name }));
  } catch (problem) {
    body.replaceChildren(el('p', { class: 'form-error', text: problem.message }));
  }
}


// ---------- saved routines ----------
// "Save these steps as a routine" keeps a named copy of one session type's steps, and "Load a
// saved routine" puts one of those copies back in place of the steps now there. Each session type
// has its own list.
// A first-time visitor starts with a Footwork and a Bladework starter routine to try.
const storedRoutines = loadJson('savedRoutines', null);
let savedRoutines = storedRoutines === null ? starterRoutines(makeId, new Date().toISOString()) : cleanSavedRoutines(storedRoutines);
if (storedRoutines === null) saveJson('savedRoutines', savedRoutines);
const saveRoutineDialog = $('#saveRoutineDialog');
const loadRoutineDialog = $('#loadRoutineDialog');
// The session whose Saved routines menu is in use.
let librarySession = null;
// The routine whose Load or Delete button was pressed once and is waiting for a second press.
let confirmingRoutine = null;

const persistRoutines = () => saveJson('savedRoutines', savedRoutines);

function openSaveRoutine(session) {
  librarySession = session;
  const type = session.type;
  const steps = stepsOf(session.id);
  $('#saveRoutineTitle').textContent = 'Save ' + SESSION_TYPES[type].short + ' routine';
  $('#routineName').value = defaultRoutineName(SESSION_TYPES[type].short, savedRoutines[type]);
  $('#saveRoutineError').textContent = '';
  const uploads = steps.filter((step) => step.video?.kind === 'file').length;
  $('#saveRoutineSummary').textContent = steps.length === 0
    ? 'There are no steps here yet, so there is nothing to save.'
    : 'This will save ' + routineSummary({ steps }) + '.'
      + (uploads > 0 ? ' Uploaded video files are not saved with a routine, but YouTube links are.' : '');
  showDialog(saveRoutineDialog);
  saveRoutineGuard.reset();
  $('#routineName').select();
}

$('#saveRoutineForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const steps = stepsOf(librarySession.id);
  const libraryType = librarySession.type;
  if (steps.length === 0) {
    $('#saveRoutineError').textContent = 'Add some steps first.';
    return;
  }
  const problem = validateRoutineName($('#routineName').value, savedRoutines[libraryType]);
  if (problem) {
    $('#saveRoutineError').textContent = problem;
    return;
  }
  const { droppedVideos, ...routine } = snapshotRoutine(steps, $('#routineName').value, new Date().toISOString(), makeId);
  savedRoutines = { ...savedRoutines, [libraryType]: [routine, ...savedRoutines[libraryType]] };
  persistRoutines();
  setSteps(librarySession.id, steps, routine.id);
  saveRoutineDialog.close();
  showToast('Saved "' + routine.name + '" (' + routineSummary(routine) + ').');
});

function openLoadRoutine(session) {
  librarySession = session;
  confirmingRoutine = null;
  $('#loadRoutineTitle').textContent = 'Load ' + SESSION_TYPES[session.type].short + ' routine';
  renderRoutineList();
  showDialog(loadRoutineDialog);
}

function renderRoutineList() {
  const routines = savedRoutines[librarySession.type];
  $('#loadRoutineHelp').hidden = routines.length === 0;
  const list = $('#routineList');
  if (routines.length === 0) {
    list.replaceChildren(el('li', { class: 'empty', text: 'No saved routines yet. Use "Save these steps as a routine" to make one.' }));
    return;
  }
  list.replaceChildren(...routines.map((routine) => {
    const saved = routine.savedAt ? new Date(routine.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const asking = confirmingRoutine && confirmingRoutine.id === routine.id ? confirmingRoutine.action : null;
    const row = el('li', { class: 'plan-item' },
      el('div', { class: 'plan-info' },
        el('b', { text: routine.name }),
        el('span', { text: (saved ? 'Saved ' + saved + ' · ' : '') + routineSummary(routine) })));
    const ask = (action) => () => {
      confirmingRoutine = { id: routine.id, action };
      renderRoutineList();
    };
    if (asking) {
      row.append(el('div', { class: 'plan-confirm' },
        el('span', { text: asking === 'load' ? 'Replace the steps in this session?' : 'Delete this routine?' }),
        el('button', {
          class: 'btn small' + (asking === 'delete' ? ' danger' : ''),
          type: 'button',
          text: asking === 'load' ? 'Yes, load it' : 'Yes, delete',
          onclick: () => (asking === 'load' ? loadRoutine(routine) : deleteRoutine(routine)),
        }),
        el('button', { class: 'btn ghost small', type: 'button', text: 'Cancel', onclick: () => { confirmingRoutine = null; renderRoutineList(); } })));
    } else {
      row.append(el('div', { class: 'plan-buttons' },
        el('button', { class: 'btn small', type: 'button', text: 'Load', 'aria-label': 'Load ' + routine.name, onclick: ask('load') }),
        el('button', { class: 'btn danger small', type: 'button', text: 'Delete', 'aria-label': 'Delete ' + routine.name, onclick: ask('delete') })));
    }
    return row;
  }));
}

function loadRoutine(routine) {
  const before = sessionProgress(stepsOf(librarySession.id), ticks[librarySession.id] || []);
  for (const step of stepsOf(librarySession.id)) {
    if (step.video?.kind === 'file') deleteVideo(step.video.id).catch(() => {});
  }
  setSteps(librarySession.id, routine.steps.map((step) => ({ ...step })), routine.id);
  ticks = { ...ticks, [librarySession.id]: [] };
  persistTicks();
  syncDone(librarySession.id, before);
  adding = null;
  editing = null;
  confirmingRemove = null;
  confirmingRoutine = null;
  loadRoutineDialog.close();
  renderRoutines();
  showToast('Loaded "' + routine.name + '" (' + routineSummary(routine) + ').');
}

function deleteRoutine(routine) {
  const type = librarySession.type;
  savedRoutines = { ...savedRoutines, [type]: savedRoutines[type].filter((other) => other.id !== routine.id) };
  persistRoutines();
  confirmingRoutine = null;
  renderRoutineList();
}

const saveRoutineGuard = protectUnsavedChanges(saveRoutineDialog, () => formState($('#saveRoutineForm')));
$('#saveRoutineClose').addEventListener('click', () => saveRoutineDialog.close());
$('#saveRoutineCancel').addEventListener('click', () => saveRoutineDialog.close());
closeOnBackdropClick(loadRoutineDialog);
$('#loadRoutineClose').addEventListener('click', () => loadRoutineDialog.close());
