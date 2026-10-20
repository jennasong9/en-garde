// Pure goal logic: no DOM, no storage, so it can be tested on its own.

export const TAGS = {
  technique: { label: 'Technique' },
  competition: { label: 'Competition' },
  tactics: { label: 'Tactics' },
  fitness: { label: 'Fitness' },
};

// Progress moves in fifths: 0, 20, 40, 60, 80, 100 percent.
export const PROGRESS_STEPS = 5;
export const MAX_GOAL_CHARS = 120;

// Tapping step number `index` (0-based) fills up to it; tapping the last filled step takes it back.
// Takes and returns a percent.
export function tapStep(percent, index) {
  const filled = percent / (100 / PROGRESS_STEPS);
  const next = index + 1 === filled ? filled - 1 : index + 1;
  return next * (100 / PROGRESS_STEPS);
}

// Which progress step a pointer is over while dragging along the bars: 0 to 4, or -1 when it
// is past the left end (which means 0%). Past the right end counts as the last step.
export function stepFromPosition(x, left, width) {
  if (x < left) return -1;
  if (x >= left + width) return PROGRESS_STEPS - 1;
  return Math.floor(((x - left) / width) * PROGRESS_STEPS);
}

// Returns what is wrong with a goal, or null if it can be saved.
export function validateGoal({ name, tag }) {
  if (name.trim() === '') return 'Describe what you want to achieve.';
  if (name.length > MAX_GOAL_CHARS) return 'Keep the goal under ' + MAX_GOAL_CHARS + ' characters.';
  if (!TAGS[tag]) return 'Pick a tag for this goal.';
  return null;
}

// Goals still in progress first, soonest deadline first (no deadline last), then finished goals.
export function sortGoals(goals) {
  const rank = (goal) => (goal.progress >= 100 ? 1 : 0);
  return [...goals].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const dueA = a.due || '9999-99-99';
    const dueB = b.due || '9999-99-99';
    if (dueA === dueB) return 0;
    return dueA < dueB ? -1 : 1;
  });
}

// An empty filter set means "show every tag".
export function matchesTag(goal, activeTags) {
  return activeTags.size === 0 || activeTags.has(goal.tag);
}

// The goals to show: those matching the tag filter, minus finished ones when `hideCompleted` is on.
export function visibleGoals(goals, activeTags, hideCompleted) {
  return sortGoals(goals).filter((goal) => matchesTag(goal, activeTags) && !(hideCompleted && goal.progress >= 100));
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function dayNumber(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

// Where a goal stands against its "complete by" date.
export function dueStatus(goal, todayIso) {
  if (goal.progress >= 100) return { kind: 'done', days: 0 };
  if (!goal.due) return { kind: 'none', days: 0 };
  const days = dayNumber(goal.due) - dayNumber(todayIso);
  if (days < 0) return { kind: 'overdue', days: -days };
  if (days === 0) return { kind: 'today', days: 0 };
  return { kind: 'upcoming', days };
}

export const URGENT_DAYS = 7;

// True when a deadline needs attention: overdue, due today, or within a week (inclusive).
export function isUrgent(status) {
  if (status.kind === 'overdue' || status.kind === 'today') return true;
  return status.kind === 'upcoming' && status.days <= URGENT_DAYS;
}
