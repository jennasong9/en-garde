// Pure routine logic: no DOM, no storage, so it can be tested on its own.
// A routine is a reusable drill list: { id, name, mins, steps: [{ name, desc }, ...] }. A step has
// a name and an optional description, shown as "Name — description".

export const MAX_STEPS = 30;
export const MAX_STEP_NAME_CHARS = 100;
export const MAX_STEP_DESC_CHARS = 200;
export const MAX_NAME_CHARS = 60;
export const MAX_ROUTINE_MINUTES = 600;

// Checks the routine form. `steps` is one { name, desc } per row of the form, as typed (rows with
// nothing in them are ignored). Returns { error } or { value: { name, mins, steps } }.
export function validateRoutine({ name, minsText, steps: rows }) {
  const trimmedName = name.trim();
  if (trimmedName === '') return { error: 'Give the routine a name, like Warm-up.' };
  if (trimmedName.length > MAX_NAME_CHARS) return { error: 'Keep the name under ' + MAX_NAME_CHARS + ' characters.' };

  const minutes = minsText.trim();
  let mins = null;
  if (minutes !== '') {
    mins = Number(minutes);
    if (!Number.isInteger(mins) || mins < 0 || mins > MAX_ROUTINE_MINUTES) {
      return { error: 'Minutes must be a whole number from 0 to ' + MAX_ROUTINE_MINUTES + '.' };
    }
  }

  const steps = [];
  for (const [index, row] of rows.entries()) {
    const step = { name: row.name.trim(), desc: row.desc.trim() };
    if (step.name === '' && step.desc === '') continue;
    if (step.name === '') return { error: 'Give step ' + (index + 1) + ' a name.' };
    if (step.name.length > MAX_STEP_NAME_CHARS) return { error: 'Keep each step name under ' + MAX_STEP_NAME_CHARS + ' characters.' };
    if (step.desc.length > MAX_STEP_DESC_CHARS) return { error: 'Keep each description under ' + MAX_STEP_DESC_CHARS + ' characters.' };
    steps.push(step);
  }
  if (steps.length === 0) return { error: 'Add at least one step.' };
  if (steps.length > MAX_STEPS) return { error: 'A routine can have up to ' + MAX_STEPS + ' steps.' };
  return { value: { name: trimmedName, mins, steps } };
}

// Turns one line of text, "Pulse raise — 3 min jogging", into { name, desc }, splitting at the
// first dash with a space on each side (a hyphen, en dash or em dash). Used for routines saved
// before steps had separate boxes.
export function stepFromText(text) {
  const separator = /\s[-–—]\s/.exec(text);
  if (!separator) return { name: text, desc: '' };
  return { name: text.slice(0, separator.index), desc: text.slice(separator.index + separator[0].length) };
}

// A routine's steps as { name, desc } objects, whether they were saved that way or as text.
export function normalizeSteps(steps) {
  return steps.map((step) => (typeof step === 'string' ? stepFromText(step) : { name: step.name, desc: step.desc || '' }));
}

export function sameStep(a, b) {
  return a !== undefined && b !== undefined && a.name === b.name && a.desc === b.desc;
}

// "15 min · 4 steps", leaving out the time when none was set.
export function routineSummary(routine) {
  const steps = routine.steps.length + (routine.steps.length === 1 ? ' step' : ' steps');
  return routine.mins ? routine.mins + ' min · ' + steps : steps;
}

// ---------- checking steps off ----------
// A routine remembers which steps were done and on which day, so the checks start fresh each day.
// `todayIso` is today's date as YYYY-MM-DD.

// One true/false per step: done today or not.
export function stepsDone(routine, todayIso) {
  const saved = routine.doneDate === todayIso && Array.isArray(routine.done) ? routine.done : [];
  return routine.steps.map((_, index) => saved[index] === true);
}

export function routineProgress(routine, todayIso) {
  const total = routine.steps.length;
  const done = stepsDone(routine, todayIso).filter(Boolean).length;
  return { done, total, fraction: total === 0 ? 0 : done / total };
}

// True when a tick takes a routine (with at least one step) from unfinished to every step done.
export function finishedRoutine(before, after) {
  return after.total > 0 && before.done < before.total && after.done === after.total;
}

// The routine's check marks after the step at `index` is ticked or unticked today.
export function toggleStep(routine, index, todayIso) {
  const done = stepsDone(routine, todayIso);
  done[index] = !done[index];
  return { doneDate: todayIso, done };
}

// After the steps are edited: keep a check mark only for a step whose text is unchanged.
export function reconcileDone(routine, newSteps, todayIso) {
  const before = stepsDone(routine, todayIso);
  return { doneDate: todayIso, done: newSteps.map((step, index) => before[index] === true && sameStep(routine.steps[index], step)) };
}

// The routines from the first prototype, offered as a starting point.
const STARTER_TEXT = [
  {
    name: 'Warm-up sequence',
    mins: 15,
    steps: [
      'Pulse raise — 3 min light jogging or jump rope.',
      'Dynamic stretch — leg swings, walking lunges, arm circles.',
      'En garde holds — 3 x 30s to load the stance.',
      'Footwork ramp — advance/retreat, gradually increasing speed.',
    ],
  },
  {
    name: 'Footwork ladder',
    mins: 20,
    steps: [
      'Advance-retreat — 4 lengths, small controlled steps.',
      'Lunge chain — advance, advance, lunge, 6 reps each side.',
      'Balestra-lunge — 8 reps, focus on landing quietly.',
      'Direction change — react to a called cue, 10 reps.',
    ],
  },
  {
    name: 'Bladework fundamentals',
    mins: 25,
    steps: [
      'Line work — extend to four lines, partner or wall target.',
      'Parry-riposte — 4/6, direct riposte, 10 reps each side.',
      "Disengage — under pressure from partner's blade, 10 reps.",
      'Second intention — false attack drawing a parry, then riposte.',
    ],
  },
  {
    name: 'Cool-down',
    mins: 10,
    steps: [
      'Light footwork — easy advance/retreat, heart rate down.',
      'Static stretch — hip flexors, hamstrings, shoulders, 30s each.',
      'Breathing — 2 minutes of slow nasal breathing.',
      'Note the session — jot one thing that worked in the journal.',
    ],
  },
];

export const STARTER_ROUTINES = STARTER_TEXT.map((routine) => ({ ...routine, steps: normalizeSteps(routine.steps) }));
