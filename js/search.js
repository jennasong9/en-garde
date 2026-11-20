// Pure logic for the search box: no DOM, no storage, so it can be tested on its own. It looks for
// the typed words in sessions, saved routines, goals and journal entries.
import { TAGS } from './goals.js';
import { FEELINGS, NOTES_LABEL, SHORT_FIELDS } from './journal.js';
import { SESSION_TYPES, formatTime, parseIso } from './schedule.js';
import { SECTION_TYPES } from './sessionsteps.js';

export const MIN_QUERY_CHARS = 2;
export const MAX_PER_GROUP = 6;
const SNIPPET_CHARS = 90;

// The typed words, lowercase. An item matches when every word is found somewhere in it.
export const queryWords = (query) => query.toLowerCase().split(/\s+/).filter(Boolean);

const matchesAll = (words, text) => {
  const haystack = text.toLowerCase();
  return words.every((word) => haystack.includes(word));
};

// A date as words a person might type ("friday november 20 2026"), so a search for a weekday or a
// month finds that day.
const dateWords = (iso) => parseIso(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

const shortDate = (iso) => parseIso(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

const clip = (text) => (text.length > SNIPPET_CHARS ? text.slice(0, SNIPPET_CHARS - 1).trimEnd() + '…' : text);

function sessionResults(words, sessions, todayIso) {
  const found = sessions
    .filter((session) => SESSION_TYPES[session.type])
    .filter((session) => matchesAll(words, [SESSION_TYPES[session.type].label, SESSION_TYPES[session.type].short, session.location, session.notes, dateWords(session.date)].filter(Boolean).join(' ')));
  // Sessions still to come first, nearest first, then past ones, latest first.
  const upcoming = found.filter((session) => session.date >= todayIso).sort((a, b) => a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time)));
  const past = found.filter((session) => session.date < todayIso).sort((a, b) => b.date.localeCompare(a.date));
  return [...upcoming, ...past].map((session) => ({
    kind: 'session',
    id: session.id,
    title: SESSION_TYPES[session.type].short + (session.time ? ' · ' + formatTime(session.time) : ' · All day'),
    detail: [shortDate(session.date), session.location, session.done ? 'Done' : ''].filter(Boolean).join(' · '),
    session,
  }));
}

function routineResults(words, savedRoutines) {
  const results = [];
  for (const type of SECTION_TYPES) {
    for (const routine of savedRoutines?.[type] ?? []) {
      const stepText = routine.steps.map((step) => step.name + ' ' + step.desc).join(' ');
      if (!matchesAll(words, [routine.name, stepText, SESSION_TYPES[type].short, SESSION_TYPES[type].label].join(' '))) continue;
      const inNameOnly = matchesAll(words, routine.name + ' ' + SESSION_TYPES[type].short);
      const step = inNameOnly ? null : routine.steps.find((candidate) => words.some((word) => (candidate.name + ' ' + candidate.desc).toLowerCase().includes(word)));
      results.push({
        kind: 'routine',
        id: routine.id,
        title: routine.name,
        detail: SESSION_TYPES[type].short + ' · ' + routine.steps.length + (routine.steps.length === 1 ? ' step' : ' steps') + (step ? ' · has "' + step.name + '"' : ''),
        routineType: type,
      });
    }
  }
  return results;
}

function goalResults(words, goals) {
  return goals
    .filter((goal) => typeof goal?.name === 'string' && TAGS[goal.tag])
    .filter((goal) => matchesAll(words, [goal.name, TAGS[goal.tag].label].join(' ')))
    .map((goal) => ({
      kind: 'goal',
      id: goal.id,
      title: goal.name,
      detail: [TAGS[goal.tag].label, goal.due ? 'due ' + shortDate(goal.due) : '', goal.archived ? 'Archived' : ''].filter(Boolean).join(' · '),
    }));
}

function journalResults(words, entries) {
  const list = Object.values(entries ?? {}).sort((a, b) => b.date.localeCompare(a.date));
  const results = [];
  for (const entry of list) {
    const feeling = FEELINGS[entry.feeling];
    const parts = [...SHORT_FIELDS.map((field) => ({ label: field.label, text: entry[field.key] || '' })), { label: NOTES_LABEL, text: entry.text || '' }].filter((part) => part.text);
    const haystack = [dateWords(entry.date), feeling?.label, entry.sessionLabel, ...parts.map((part) => part.text)].filter(Boolean).join(' ');
    if (!matchesAll(words, haystack)) continue;
    const part = parts.find((candidate) => words.some((word) => candidate.text.toLowerCase().includes(word))) ?? parts[0];
    results.push({
      kind: 'journal',
      id: entry.id,
      title: shortDate(entry.date) + (entry.sessionLabel ? ' · ' + entry.sessionLabel : ''),
      detail: [feeling ? feeling.icon + ' ' + feeling.label : '', part ? part.label + ': ' + clip(part.text) : ''].filter(Boolean).join(' · '),
    });
  }
  return results;
}

// What was found for `query`, as groups { kind, label, results, total } (at most MAX_PER_GROUP
// results shown in each, `total` counting them all). Groups with nothing are left out, and a query
// shorter than MIN_QUERY_CHARS finds nothing.
export function searchAll(query, { sessions = [], savedRoutines = null, goals = [], journal = {} }, todayIso) {
  const words = queryWords(query);
  if (query.trim().length < MIN_QUERY_CHARS) return [];
  const groups = [
    { kind: 'session', label: 'Sessions', all: sessionResults(words, sessions, todayIso) },
    { kind: 'routine', label: 'Saved routines', all: routineResults(words, savedRoutines) },
    { kind: 'goal', label: 'Goals', all: goalResults(words, goals) },
    { kind: 'journal', label: 'Journal entries', all: journalResults(words, journal) },
  ];
  return groups
    .filter((group) => group.all.length > 0)
    .map((group) => ({ kind: group.kind, label: group.label, results: group.all.slice(0, MAX_PER_GROUP), total: group.all.length }));
}
