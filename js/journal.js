// Pure journal logic: no DOM, no storage, so it can be tested on its own.
// Entries are kept in an object keyed by date (YYYY-MM-DD), so a day holds at most one.

export const FEELINGS = {
  sharp: { label: 'Sharp', icon: '⚡' },
  steady: { label: 'Steady', icon: '●' },
  tired: { label: 'Tired', icon: '◐' },
  rough: { label: 'Rough', icon: '✕' },
};

export const PROMPTS = [
  'What felt sharp today?',
  'What needs work?',
  'How was your footwork?',
  'How did your blade timing feel?',
  'Any pain, fatigue or soreness?',
  'How was your energy and nutrition?',
  'How did you handle pressure in bouts?',
  'What will you focus on next session?',
];

export const MAX_ENTRY_CHARS = 2000;

// Returns what is wrong with an entry, or null if it can be saved.
export function validateEntry({ feeling, text }) {
  if (!FEELINGS[feeling]) return 'Pick how you are feeling first.';
  if (text.trim() === '') return 'Write a few words about your session.';
  if (text.length > MAX_ENTRY_CHARS) return 'Entries can be up to ' + MAX_ENTRY_CHARS + ' characters. Shorten this one a little.';
  return null;
}

// An empty filter set means "show every feeling".
export function matchesFeeling(entry, activeFeelings) {
  return activeFeelings.size === 0 || activeFeelings.has(entry.feeling);
}

export const SORT_OPTIONS = ['created', 'edited', 'custom'];

// When an entry was written or last changed, as a sortable text. Entries saved before the app
// kept these times use the day they are for.
function createdTime(entry) {
  return entry.createdAt || entry.date + 'T12:00:00.000Z';
}
function editedTime(entry) {
  return entry.editedAt || createdTime(entry);
}

// The entries that pass the feeling filter, in the chosen order. `sort.by` is "created" or
// "edited" (then `sort.order` is "asc" or "desc") or "custom" (then `sort.custom` lists dates in
// the user's order; entries not listed yet, such as new ones, come first, newest first).
export function sortEntries(entries, sort, activeFeelings = new Set()) {
  const { by = 'created', order = 'desc', custom = [] } = sort;
  const list = Object.entries(entries)
    .map(([date, entry]) => ({ date, ...entry }))
    .filter((entry) => matchesFeeling(entry, activeFeelings));
  const byTime = (timeOf, direction) => (a, b) => {
    const first = timeOf(a);
    const second = timeOf(b);
    if (first !== second) return (first < second ? -1 : 1) * direction;
    return (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) * direction;
  };
  if (by !== 'custom') return list.sort(byTime(by === 'edited' ? editedTime : createdTime, order === 'asc' ? 1 : -1));
  const position = new Map(custom.map((date, index) => [date, index]));
  const unlisted = list.filter((entry) => !position.has(entry.date)).sort(byTime(createdTime, -1));
  const listed = list.filter((entry) => position.has(entry.date)).sort((a, b) => position.get(a.date) - position.get(b.date));
  return [...unlisted, ...listed];
}

// A new custom order (all the dates) with `date` moved to position `index` among the entries
// that are showing (`visibleOrder`, in the order shown). Hidden entries keep their places.
export function placeInCustomOrder(fullOrder, visibleOrder, date, index) {
  const without = fullOrder.filter((other) => other !== date);
  const visibleOthers = visibleOrder.filter((other) => other !== date);
  let at;
  if (visibleOthers.length === 0) at = without.length;
  else if (index < visibleOthers.length) at = without.indexOf(visibleOthers[index]);
  else at = without.indexOf(visibleOthers[visibleOthers.length - 1]) + 1;
  return [...without.slice(0, at), date, ...without.slice(at)];
}

// Adds a writing prompt on its own line at the end of the text, ready to type an answer under it.
export function appendPrompt(text, prompt) {
  const trimmedEnd = text.replace(/\s+$/, '');
  return (trimmedEnd === '' ? '' : trimmedEnd + '\n\n') + prompt + '\n';
}
