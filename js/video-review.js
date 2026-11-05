// Pure rules for the "Video review" part of a Journal entry: notes tied to a moment in a video.
// No DOM and no storage, so they can be tested on their own. A note is { time, text }, where
// `time` is whole seconds into the video.

export const MAX_VIDEO_NOTES = 40;
export const MAX_NOTE_CHARS = 200;
const MAX_SECONDS = 12 * 60 * 60;

// 92 becomes "1:32" and 3725 becomes "1:02:05".
export function formatTimestamp(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, '0');
  return hours > 0 ? hours + ':' + String(minutes).padStart(2, '0') + ':' + rest : minutes + ':' + rest;
}

// Reads "1:32", "1:02:05" or just "90" (seconds) as whole seconds. Returns null for anything else.
export function parseTimestamp(text) {
  const parts = String(text).trim().split(':');
  if (parts.length > 3 || parts.some((part) => !/^\d{1,5}$/.test(part))) return null;
  const numbers = parts.map(Number);
  if (numbers.length > 1 && numbers.slice(1).some((number) => number > 59)) return null;
  const seconds = numbers.reduce((total, number) => total * 60 + number, 0);
  return seconds <= MAX_SECONDS ? seconds : null;
}

// Checks one note as typed. Returns { error } or { value: { time, text } }.
export function validateVideoNote({ time, text }) {
  const seconds = parseTimestamp(time);
  if (seconds === null) return { error: 'Type the time like 1:32 (minutes:seconds).' };
  const trimmed = String(text).trim();
  if (trimmed === '') return { error: 'Write what you noticed at that moment.' };
  if (trimmed.length > MAX_NOTE_CHARS) return { error: 'A note can be up to ' + MAX_NOTE_CHARS + ' characters.' };
  return { value: { time: seconds, text: trimmed } };
}

// The notes with one more added, kept in the order they happen in the video.
export function addVideoNote(notes, note) {
  const result = validateVideoNote(note);
  if (result.error) return result;
  if (notes.length >= MAX_VIDEO_NOTES) return { error: 'You can add up to ' + MAX_VIDEO_NOTES + ' notes to one video.' };
  return { notes: [...notes, result.value].sort((a, b) => a.time - b.time) };
}

export const removeVideoNote = (notes, index) => notes.filter((note, position) => position !== index);

// Saved notes, keeping only the usable ones in time order (so damaged data cannot break the page).
export function cleanVideoNotes(notes) {
  if (!Array.isArray(notes)) return [];
  return notes
    .filter((note) => Number.isInteger(note?.time) && note.time >= 0 && typeof note.text === 'string' && note.text.trim() !== '')
    .map((note) => ({ time: note.time, text: note.text.slice(0, MAX_NOTE_CHARS) }))
    .sort((a, b) => a.time - b.time)
    .slice(0, MAX_VIDEO_NOTES);
}
