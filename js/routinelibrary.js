// Pure logic for saved routines: no DOM, no storage, so it can be tested on its own. A saved
// routine is { id, name, savedAt, steps }, a copy of the steps of one session type. Each session
// type keeps its own list of them, like saved meal plans.
import { compareSessions } from './schedule.js';
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

// A copy of steps to give another session or a saved routine. A YouTube link is kept; an uploaded
// video file is not (the file belongs to one step, and removing it there would break the copy), and
// `droppedVideos` says how many were left out.
export function copyOfSteps(steps) {
  const copies = steps.map((step) => {
    const copy = { name: step.name, desc: step.desc || '' };
    if (step.video?.kind === 'youtube') copy.video = { ...step.video };
    return copy;
  });
  const droppedVideos = steps.filter((step) => step.video?.kind === 'file').length;
  return { steps: copies, droppedVideos };
}

// A saved copy of the steps.
export function snapshotRoutine(steps, name, savedAt, makeId) {
  const { steps: copies, droppedVideos } = copyOfSteps(steps);
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

// Every saved routine, grouped by session type for the "Saved routines" screen: only types that
// have at least one, in the order the types are listed, each with its routines newest first.
export function routineGroups(saved) {
  return SECTION_TYPES
    .map((type) => ({ type, routines: [...(saved?.[type] ?? [])].sort((a, b) => b.savedAt.localeCompare(a.savedAt)) }))
    .filter((group) => group.routines.length > 0);
}

export const savedRoutineCount = (saved) => SECTION_TYPES.reduce((sum, type) => sum + (saved?.[type]?.length ?? 0), 0);

// The saved routines with one renamed. Returns { saved, error }: `error` says what is wrong with
// the new name (and `saved` is unchanged), or is null. Keeping the same name, or only changing its
// capital letters, is allowed.
export function renameRoutine(saved, type, id, newName) {
  const others = (saved[type] ?? []).filter((routine) => routine.id !== id);
  const error = validateRoutineName(newName, others);
  if (error) return { saved, error };
  const routines = saved[type].map((routine) => (routine.id === id ? { ...routine, name: newName.trim() } : routine));
  return { saved: { ...saved, [type]: routines }, error: null };
}

// The next sessions of a type, from `fromIso` on, soonest first: the places a saved routine can be loaded.
export function upcomingSessionsOfType(sessions, type, fromIso, limit = 8) {
  return sessions
    .filter((session) => session.type === type && session.date >= fromIso)
    .sort((a, b) => a.date.localeCompare(b.date) || compareSessions(a, b))
    .slice(0, limit);
}
