// Pure logic for the Routines screen: the steps of each session, and checking them off. No DOM and
// no storage, so it can be tested on its own.
//
// Every session has its own steps (a new session starts with none; steps can be filled in by
// loading a saved routine, see routinelibrary.js). The ticks also belong to one session, as a
// list of step keys. A session's record is { steps, routineId? }, where `routineId` is the saved
// routine its steps were last saved to or loaded from.

import { SESSION_TYPES } from './schedule.js';
import { normalizeVideo } from './stepvideo.js';

export const MAX_STEPS = 30;
export const MAX_STEP_NAME_CHARS = 100;
export const MAX_STEP_DESC_CHARS = 200;

// The sections, in the same order as the filters under the calendar. A person cannot add to or
// remove from this list; they only change the steps inside each one.
// Rest and Tournament are left out: Rest is not a session you do steps in, and a tournament is an
// all-day event.
const NO_STEPS = ['rest', 'tournament'];
export const SECTION_TYPES = Object.keys(SESSION_TYPES).filter((type) => !NO_STEPS.includes(type));

// Steps a new visitor can load as starter routines (from the routines in the first prototype).
export const STARTER_STEPS = {
  footwork: [
    { name: 'Advance-retreat', desc: '4 lengths, small controlled steps.' },
    { name: 'Lunge chain', desc: 'advance, advance, lunge, 6 reps each side.' },
    { name: 'Balestra-lunge', desc: '8 reps, focus on landing quietly.' },
    { name: 'Direction change', desc: 'react to a called cue, 10 reps.' },
  ],
  blade: [
    { name: 'Line work', desc: 'extend to four lines, partner or wall target.' },
    { name: 'Parry-riposte', desc: '4/6, direct riposte, 10 reps each side.' },
    { name: 'Disengage', desc: "under pressure from partner's blade, 10 reps." },
    { name: 'Second intention', desc: 'false attack drawing a parry, then riposte.' },
  ],
};

// Turns one saved step (an older one may be a line of text, "Name — description") into { name, desc }.
function normalizeStep(step) {
  if (typeof step === 'string') {
    const separator = /\s[-–—]\s/.exec(step);
    if (!separator) return { name: step, desc: '' };
    return { name: step.slice(0, separator.index), desc: step.slice(separator.index + separator[0].length) };
  }
  const video = normalizeVideo(step?.video);
  return { name: String(step?.name ?? ''), desc: String(step?.desc ?? ''), ...(video && { video }) };
}

function isUsable(step) {
  return step.name.trim() !== '' && step.name.length <= MAX_STEP_NAME_CHARS && step.desc.length <= MAX_STEP_DESC_CHARS;
}

// The steps for every section from what was saved, with anything unusable dropped and a list
// (maybe empty) for every type.
export function cleanStepsByType(saved) {
  const result = {};
  for (const type of SECTION_TYPES) result[type] = cleanSteps(saved?.[type]);
  return result;
}

// One list of saved steps, with anything unusable dropped (and never more than MAX_STEPS).
export function cleanSteps(saved) {
  return (Array.isArray(saved) ? saved.map(normalizeStep).filter(isUsable) : []).slice(0, MAX_STEPS);
}

// Steps used to be shared by every session of a type. This turns that old list into one record per
// session, for sessions on or before `todayIso` (so what was done keeps its steps); later
// sessions start empty.
export function migrateStepsToSessions(oldByType, sessions, todayIso) {
  const byType = cleanStepsByType(oldByType);
  const result = {};
  for (const session of sessions) {
    const steps = byType[session.type];
    if (steps && steps.length > 0 && session.date <= todayIso) result[session.id] = { steps: steps.map((step) => ({ ...step })) };
  }
  return result;
}

// The saved records, with unusable steps dropped and records that are damaged or empty left out.
export function cleanStepsBySession(saved) {
  const result = {};
  if (saved === null || typeof saved !== 'object' || Array.isArray(saved)) return result;
  for (const [id, record] of Object.entries(saved)) {
    const steps = cleanSteps(record?.steps);
    if (steps.length === 0) continue;
    result[id] = typeof record.routineId === 'string' ? { steps, routineId: record.routineId } : { steps };
  }
  return result;
}

// The records of sessions still on the Schedule (`kept`), and those of sessions that were removed
// (`removed`, so their uploaded video files can be cleaned up).
export function keepStepsFor(stepsBySession, sessions) {
  const ids = new Set(sessions.map((session) => session.id));
  const entries = Object.entries(stepsBySession);
  return {
    kept: Object.fromEntries(entries.filter(([id]) => ids.has(id))),
    removed: entries.filter(([id]) => !ids.has(id)).map(([, record]) => record),
  };
}

// ---------- changing the steps in one section ----------
export function stepKey(step) {
  return step.name + '\n' + step.desc;
}

// Characters that flip the direction of the text around them. They are invisible, so a name
// that holds one can display backwards or hide what it says.
export const HIDDEN_DIRECTION_CHARS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/;

// Checks what was typed for a step (and its video, if any). Returns { error } or { value: { name, desc, video? } }.
export function validateStep({ name, desc, video }) {
  const step = { name: name.trim(), desc: desc.trim() };
  if (step.name === '') return { error: 'Give the step a name.' };
  if (HIDDEN_DIRECTION_CHARS.test(step.name + step.desc)) return { error: 'Remove the hidden text-direction characters.' };
  if (step.name.length > MAX_STEP_NAME_CHARS) return { error: 'Keep the name under ' + MAX_STEP_NAME_CHARS + ' characters.' };
  if (step.desc.length > MAX_STEP_DESC_CHARS) return { error: 'Keep the description under ' + MAX_STEP_DESC_CHARS + ' characters.' };
  if (video) {
    const checked = normalizeVideo(video);
    if (!checked) return { error: 'That video could not be used.' };
    step.video = checked;
  }
  return { value: step };
}

// Adds a step to the end of `steps`, or replaces the one at `index`. Returns { steps } or { error }.
// Two identical steps are refused: they could not be ticked separately.
export function saveStep(steps, row, index = -1) {
  const checked = validateStep(row);
  if (checked.error) return checked;
  const adding = index < 0 || index >= steps.length;
  if (adding && steps.length >= MAX_STEPS) return { error: 'A session can have up to ' + MAX_STEPS + ' steps.' };
  if (steps.some((other, position) => position !== index && stepKey(other) === stepKey(checked.value))) {
    return { error: 'That step is already in the list.' };
  }
  return { steps: adding ? [...steps, checked.value] : steps.map((step, position) => (position === index ? checked.value : step)) };
}

export function removeStep(steps, index) {
  return steps.filter((_, position) => position !== index);
}

// ---------- ticking steps off for one session ----------
// `doneKeys` is the list of step keys ticked for that session.

// One true/false per step.
export function stepsDone(steps, doneKeys) {
  return steps.map((step) => doneKeys.includes(stepKey(step)));
}

export function toggleStep(doneKeys, step) {
  const key = stepKey(step);
  return doneKeys.includes(key) ? doneKeys.filter((other) => other !== key) : [...doneKeys, key];
}

export function sessionProgress(steps, doneKeys) {
  const total = steps.length;
  const done = stepsDone(steps, doneKeys).filter(Boolean).length;
  return { done, total, fraction: total === 0 ? 0 : done / total };
}

// True when a tick takes a session (with at least one step) from unfinished to every step done.
export function finishedSession(before, after) {
  return after.total > 0 && before.done < before.total && after.done === after.total;
}

// What a tick means for the session's Done box on the Schedule: true when the tick finished every
// step, false when it un-finished a session that was complete, and null when Done should be left
// as it is (so a Done ticked by hand on the Schedule is not undone by an unrelated tick).
export function doneAfterTick(before, after) {
  if (finishedSession(before, after)) return true;
  const wasComplete = before.total > 0 && before.done === before.total;
  return wasComplete && after.done < after.total ? false : null;
}

// The ticks for a session whose Done box was just switched: every step ticked when it became
// done, none when it was cleared.
export function ticksForDone(steps, done) {
  return done ? steps.map(stepKey) : [];
}

// The saved ticks as { sessionId: [step keys] }, keeping only lists of text keys (damaged saved
// data would otherwise break the page that reads them).
export function cleanTicks(saved) {
  if (saved === null || typeof saved !== 'object' || Array.isArray(saved)) return {};
  return Object.fromEntries(
    Object.entries(saved)
      .filter(([, keys]) => Array.isArray(keys))
      .map(([id, keys]) => [id, keys.filter((key) => typeof key === 'string')]),
  );
}

// The ticks after a step was edited: a ticked step stays ticked under its new name and description.
export function renameTick(doneKeys, oldStep, newStep) {
  const oldKey = stepKey(oldStep);
  return doneKeys.map((key) => (key === oldKey ? stepKey(newStep) : key));
}

// The saved ticks without those of sessions that no longer exist on the Schedule.
export function keepTicksFor(ticks, sessions) {
  const ids = new Set(sessions.map((session) => session.id));
  return Object.fromEntries(Object.entries(ticks).filter(([id]) => ids.has(id)));
}
