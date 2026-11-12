// Pure logic for saved routines: no DOM, no storage, so it can be tested on its own. A saved
// routine is { id, name, savedAt, steps }, a copy of the steps of one session type. Each session
// type keeps its own list of them, like saved meal plans.
import { HIDDEN_DIRECTION_CHARS, STARTER_STEPS, SECTION_TYPES, cleanSteps, stepKey } from './sessionsteps.js';

export const MAX_SAVED_ROUTINES = 20;
export const MAX_ROUTINE_NAME_CHARS = 60;

// A name such as "Footwork routine", with a number added if a routine already has that name.
export function defaultRoutineName(typeName, routines) {
  const base = typeName + ' routine';
  const taken = new Set(routines.map((routine) => routine.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let number = 2;
  while (taken.has((base + ' (' + number + ')').toLowerCase())) number++;
  return base + ' (' + number + ')';
}

// Returns what is wrong with a name for a new saved routine, or null if it can be used.
export function validateRoutineName(name, routines) {
  const trimmed = name.trim();
  if (trimmed === '') return 'Give the routine a name.';
  if (HIDDEN_DIRECTION_CHARS.test(trimmed)) return 'Remove the hidden text-direction characters.';
  if (trimmed.length > MAX_ROUTINE_NAME_CHARS) return 'Keep the name under ' + MAX_ROUTINE_NAME_CHARS + ' characters.';
  if (routines.some((routine) => routine.name.toLowerCase() === trimmed.toLowerCase())) {
    return 'You already have a routine with that name. Choose a different name.';
  }
  if (routines.length >= MAX_SAVED_ROUTINES) return 'You have ' + MAX_SAVED_ROUTINES + ' saved routines here. Delete one to save another.';
  return null;
}

// A saved copy of the steps. A YouTube link is kept; an uploaded video file is not (the file could
// be removed from the step later), and `droppedVideos` says how many were left out.
export function snapshotRoutine(steps, name, savedAt, makeId) {
  const copies = steps.map((step) => {
    const copy = { name: step.name, desc: step.desc || '' };
    if (step.video?.kind === 'youtube') copy.video = { ...step.video };
    return copy;
  });
  const droppedVideos = steps.filter((step) => step.video?.kind === 'file').length;
  return { id: makeId(), name: name.trim(), savedAt, steps: copies, droppedVideos };
}

// "4 steps".
export function routineSummary(routine) {
  return routine.steps.length + (routine.steps.length === 1 ? ' step' : ' steps');
}

// The saved routines for every section type, with anything damaged dropped.
export function cleanSavedRoutines(saved) {
  const result = {};
  for (const type of SECTION_TYPES) {
    const list = Array.isArray(saved?.[type]) ? saved[type] : [];
    result[type] = list
      .filter((routine) => typeof routine?.id === 'string' && typeof routine.name === 'string' && routine.name.trim() !== '')
      .map((routine) => ({ id: routine.id, name: routine.name, savedAt: String(routine.savedAt ?? ''), steps: cleanSteps(routine.steps) }))
      .filter((routine) => routine.steps.length > 0)
      .slice(0, MAX_SAVED_ROUTINES);
  }
  return result;
}

// Whether a saved routine has this step (steps match by name and description).
export const routineHasStep = (routine, step) => routine.steps.some((other) => stepKey(other) === stepKey(step));

// A copy of a saved routine without this step.
export const routineWithoutStep = (routine, step) => ({ ...routine, steps: routine.steps.filter((other) => stepKey(other) !== stepKey(step)) });

// What a new visitor can load, so there is something to try: the first prototype's Footwork and
// Bladework steps, as saved routines.
export function starterRoutines(makeId, savedAt) {
  const result = cleanSavedRoutines(null);
  for (const type of Object.keys(STARTER_STEPS)) {
    result[type] = [{ id: makeId(), name: 'Starter ' + (type === 'blade' ? 'bladework' : type), savedAt, steps: cleanSteps(STARTER_STEPS[type]) }];
  }
  return result;
}
