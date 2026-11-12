// Pure journal logic: no DOM, no storage, so it can be tested on its own.
// Entries are kept in an object keyed by id. Each has a `date` (YYYY-MM-DD) and the session it is
// about (`sessionId`, empty for a general entry about the day). A day holds one entry for each of
// its sessions, plus one general entry. (Entries saved before this were keyed by their date, which
// is why a date works as an id.)

import { normalizeVideo } from './stepvideo.js';
import { cleanVideoNotes } from './video-review.js';

export const FEELINGS = {
  sharp: { label: 'Sharp', icon: '⚡' },
  steady: { label: 'Steady', icon: '●' },
  tired: { label: 'Tired', icon: '◐' },
  rough: { label: 'Rough', icon: '✕' },
};

// The short answers in an entry, then its free notes (kept in `text`, as older entries have it).
export const SHORT_FIELDS = [
  { key: 'wentWell', label: 'What went well' },
  { key: 'workOn', label: 'What to work on' },
  { key: 'focus', label: 'Next session focus' },
];
export const NOTES_LABEL = 'Notes';

// How an entry's feeling is shown. An entry with no (or an unknown) feeling, such as damaged
// saved data, still gets something to show instead of breaking the page.
const NO_FEELING = { label: 'No feeling', icon: '–' };
export const feelingOf = (entry) => FEELINGS[entry.feeling] ?? NO_FEELING;

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

// The saved entries as { id: entry }, each with its id and date filled in (older entries were
// keyed by their date and had no id), and anything that is not an entry left out.
export function normalizeEntries(saved) {
  const result = {};
  if (saved === null || typeof saved !== 'object' || Array.isArray(saved)) return result;
  for (const [id, entry] of Object.entries(saved)) {
    if (entry === null || typeof entry !== 'object') continue;
    result[id] = {
      ...entry,
      id,
      date: entry.date || id,
      feeling: FEELINGS[entry.feeling] ? entry.feeling : '',
      video: normalizeVideo(entry.video),
      videoNotes: cleanVideoNotes(entry.videoNotes),
    };
  }
  return result;
}

// The entries as a list, each with its id and date.
const asList = (entries) => Object.entries(entries).map(([id, entry]) => ({ ...entry, id, date: entry.date ?? id }));

// One day's entries, in the order they were written.
export function entriesOn(entries, iso) {
  return asList(entries).filter((entry) => entry.date === iso)
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || (a.id < b.id ? -1 : 1));
}

// The entry for one session on a day (`sessionId` empty for the day's general entry), or null.
export function entryForSession(entries, iso, sessionId) {
  return entriesOn(entries, iso).find((entry) => (entry.sessionId || '') === (sessionId || '')) ?? null;
}

// What a new entry on a day can be about: the day's sessions that have no entry yet, and whether
// the general entry is still free. `editingId` is the entry being changed (its own place counts as free).
export function freeSlots(entries, iso, sessions, editingId = null) {
  const taken = new Set(entriesOn(entries, iso).filter((entry) => entry.id !== editingId).map((entry) => entry.sessionId || ''));
  return {
    sessions: sessions.filter((session) => !taken.has(session.id)),
    general: !taken.has(''),
  };
}

// The "next session focus" from the most recent entry (latest day, then latest written) that has
// one, or null.
export function latestFocus(entries) {
  const withFocus = asList(entries).filter((entry) => answerOf(entry, 'focus') !== '')
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''));
  if (withFocus.length === 0) return null;
  const latest = withFocus[withFocus.length - 1];
  return { id: latest.id, date: latest.date, focus: answerOf(latest, 'focus') };
}

// An empty filter set means "show every feeling".
export function matchesFeeling(entry, activeFeelings) {
  return activeFeelings.size === 0 || activeFeelings.has(entry.feeling);
}

export const SORT_OPTIONS = ['created', 'edited', 'custom'];

// The saved List order setting, with anything damaged replaced by the default (newest first).
export function normalizeSort(saved) {
  const valid = saved !== null && typeof saved === 'object';
  return {
    by: valid && SORT_OPTIONS.includes(saved.by) ? saved.by : 'created',
    order: valid && saved.order === 'asc' ? 'asc' : 'desc',
  };
}

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
    .map(([id, entry]) => ({ ...entry, id, date: entry.date ?? id }))
    .filter((entry) => matchesFeeling(entry, activeFeelings));
  const byTime = (timeOf, direction) => (a, b) => {
    const first = timeOf(a);
    const second = timeOf(b);
    if (first !== second) return (first < second ? -1 : 1) * direction;
    const byDay = a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    return (byDay || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) * direction;
  };
  if (by !== 'custom') return list.sort(byTime(by === 'edited' ? editedTime : createdTime, order === 'asc' ? 1 : -1));
  const position = new Map(custom.map((id, index) => [id, index]));
  const unlisted = list.filter((entry) => !position.has(entry.id)).sort(byTime(createdTime, -1));
  const listed = list.filter((entry) => position.has(entry.id)).sort((a, b) => position.get(a.id) - position.get(b.id));
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
