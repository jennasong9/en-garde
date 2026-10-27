// Pure logic for the Routines screen: the steps kept for each session type, and checking them off
// for one session. No DOM and no storage, so it can be tested on its own.
//
// Steps belong to a session type ("Bouting"), not to one session: every Bouting session on the
// Schedule shows the same list. The ticks belong to one session, as a list of step keys.

import { SESSION_TYPES } from './schedule.js';

export const MAX_STEPS = 30;
export const MAX_STEP_NAME_CHARS = 100;
export const MAX_STEP_DESC_CHARS = 200;

// The sections, in the same order as the filters under the calendar. A person cannot add to or
// remove from this list; they only change the steps inside each one.
export const SECTION_TYPES = Object.keys(SESSION_TYPES);

// Steps to start with, from the routines in the first prototype.
const STARTER_STEPS = {
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
  return { name: String(step?.name ?? ''), desc: String(step?.desc ?? '') };
}

function isUsable(step) {
  return step.name.trim() !== '' && step.name.length <= MAX_STEP_NAME_CHARS && step.desc.length <= MAX_STEP_DESC_CHARS;
}

// The steps for every section from what was saved, with anything unusable dropped and a list
// (maybe empty) for every type.
export function cleanStepsByType(saved) {
  const result = {};
  for (const type of SECTION_TYPES) {
    const steps = Array.isArray(saved?.[type]) ? saved[type].map(normalizeStep).filter(isUsable) : [];
    result[type] = steps.slice(0, MAX_STEPS);
  }
  return result;
}

// What a new visitor starts with: the starter steps, except that a routine saved before the
// Routines screen was tied to the Schedule keeps its steps when its name is a session type
// ("Footwork", "Bladework", "Bouting"...).
export function startingSteps(oldRoutines) {
  const start = cleanStepsByType(STARTER_STEPS);
  for (const routine of Array.isArray(oldRoutines) ? oldRoutines : []) {
    const name = String(routine?.name ?? '').trim().toLowerCase();
    const type = SECTION_TYPES.find((candidate) => SESSION_TYPES[candidate].short.toLowerCase() === name);
    const steps = Array.isArray(routine?.steps) ? cleanStepsByType({ [type]: routine.steps })[type] : [];
    if (type && steps.length > 0) start[type] = steps;
  }
  return start;
}

// ---------- changing the steps in one section ----------
export function stepKey(step) {
  return step.name + '\n' + step.desc;
}

// Checks what was typed for a step. Returns { error } or { value: { name, desc } }.
export function validateStep({ name, desc }) {
  const step = { name: name.trim(), desc: desc.trim() };
  if (step.name === '') return { error: 'Give the step a name.' };
  if (step.name.length > MAX_STEP_NAME_CHARS) return { error: 'Keep the name under ' + MAX_STEP_NAME_CHARS + ' characters.' };
  if (step.desc.length > MAX_STEP_DESC_CHARS) return { error: 'Keep the description under ' + MAX_STEP_DESC_CHARS + ' characters.' };
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

// The saved ticks without those of sessions that no longer exist on the Schedule.
export function keepTicksFor(ticks, sessions) {
  const ids = new Set(sessions.map((session) => session.id));
  return Object.fromEntries(Object.entries(ticks).filter(([id]) => ids.has(id)));
}
