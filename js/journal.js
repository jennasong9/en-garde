// Pure journal logic: no DOM, no storage, so it can be tested on its own.
// Entries are kept in an object keyed by date (YYYY-MM-DD), so a day holds at most one.

export const FEELINGS = {
  sharp: { label: 'Sharp', icon: '⚡' },
  steady: { label: 'Steady', icon: '●' },
  tired: { label: 'Tired', icon: '◐' },
  rough: { label: 'Rough', icon: '✕' },
};

// The short answers in an entry, then its free notes (kept in `text`, as older entries have it).
export const SHORT_FIELDS = [
  { key: 'wentWell', label: 'What went well', placeholder: 'e.g. Clean lunges and good distance' },
  { key: 'workOn', label: 'What to work on', placeholder: 'e.g. Timing on the parry-riposte' },
  { key: 'focus', label: 'Next session focus', placeholder: 'e.g. Keep my arm relaxed' },
];
export const NOTES_LABEL = 'Notes';

export const MAX_ENTRY_CHARS = 2000;
export const MAX_SHORT_CHARS = 300;

const answerOf = (entry, key) => (entry[key] || '').trim();

// Returns what is wrong with an entry, or null if it can be saved.
export function validateEntry(entry) {
  if (!FEELINGS[entry.feeling]) return 'Pick how you are feeling first.';
  const keys = [...SHORT_FIELDS.map((field) => field.key), 'text'];
  if (keys.every((key) => answerOf(entry, key) === '')) return 'Fill in at least one box about your session.';
  if ((entry.text || '').length > MAX_ENTRY_CHARS) return 'Notes can be up to ' + MAX_ENTRY_CHARS + ' characters. Shorten them a little.';
  const tooLong = SHORT_FIELDS.find((field) => (entry[field.key] || '').length > MAX_SHORT_CHARS);
  if (tooLong) return '"' + tooLong.label + '" can be up to ' + MAX_SHORT_CHARS + ' characters. Shorten it a little.';
  return null;
}

// The filled-in parts of an entry as { label, text }, in the order of the writing form.
export function entryParts(entry) {
  const parts = SHORT_FIELDS.map((field) => ({ label: field.label, text: answerOf(entry, field.key) }));
  parts.push({ label: NOTES_LABEL, text: answerOf(entry, 'text') });
  return parts.filter((part) => part.text !== '');
}

// The "next session focus" from the most recent entry (by day) that has one, or null.
export function latestFocus(entries) {
  const dates = Object.keys(entries).filter((date) => answerOf(entries[date], 'focus') !== '').sort();
  if (dates.length === 0) return null;
  const date = dates[dates.length - 1];
  return { date, focus: answerOf(entries[date], 'focus') };
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
