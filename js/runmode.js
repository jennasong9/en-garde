// Pure logic for the guided run: no DOM, no storage, so it can be tested on its own.

// The step a run should open on: the first one not yet ticked, or the first step when all are ticked.
// `done` is a list of true/false, one per step (see stepsDone in sessionsteps.js).
export function firstUnfinishedIndex(done) {
  const index = done.indexOf(false);
  return index === -1 ? 0 : index;
}

// A running time as "m:ss", or "h:m:ss" from one hour on, for a number of milliseconds.
export function formatClock(milliseconds) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const seconds = String(total % 60).padStart(2, '0');
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  return hours > 0 ? hours + ':' + String(minutes).padStart(2, '0') + ':' + seconds : minutes + ':' + seconds;
}

// "Step 2 of 4".
export const stepCounter = (index, total) => 'Step ' + (index + 1) + ' of ' + total;

// The index after pressing Back or Next: it stays inside the steps. `finished` is true when Next
// was pressed on the last step.
export function moveStep(index, total, direction) {
  const target = index + direction;
  if (target >= total) return { index, finished: true };
  return { index: Math.max(0, target), finished: false };
}
