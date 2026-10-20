import { parseFencerLink } from './fencingtracker.js';
import {
  STARTER_ROUTINES,
  normalizeSteps,
  reconcileDone,
  routineProgress,
  routineSummary,
  stepFromText,
  stepsDone,
  toggleStep,
  validateRoutine,
} from './routines.js';
import { dueStatus, isUrgent, matchesTag, sortGoals, stepFromPosition, tapStep, validateGoal, visibleGoals } from './goals.js';
import { appendPrompt, matchesFeeling, placeInCustomOrder, sortEntries, validateEntry } from './journal.js';
import {
  addTemplateToDays,
  addToHistory,
  applyToLinked,
  changesSharedDetails,
  clearOrder,
  copyDay,
  copyMeal,
  dayMacroTotals,
  dayTotals,
  glassesToday,
  hasCustomOrder,
  linkedMeals,
  macroKcal,
  macroProgress,
  macroShares,
  mealTemplate,
  mealsOn,
  mergeIntoHistory,
  moveMeal,
  parseGrams,
  parseKcal,
  placeMeal,
  removeFromHistory,
  searchHistory,
  tapGlass,
  upcomingMeals,
} from './meals.js';
import {
  expandRepeat,
  extraRepeatDates,
  findDuplicates,
  hourRange,
  layoutDay,
  minutesToTime,
  moveStart,
  nextSessions,
  sessionsOn,
  sessionsThisWeek,
  shiftAnchor,
  validateRepeat,
  visibleDays,
  weekStats,
} from './schedule.js';

const results = [];

function test(name, run) {
  try {
    run();
    results.push({ name, error: null });
  } catch (error) {
    results.push({ name, error });
  }
}

function equal(actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error('expected ' + b + ' but got ' + a);
}

const session = (id, date, time, extra = {}) => ({ id, date, time, mins: 60, done: false, ...extra });

// 2026-10-06 is a Tuesday.
test('repeat on Tuesday and Thursday lists every matching day', () => {
  equal(expandRepeat('2026-10-06', '2026-10-20', [2, 4]),
    ['2026-10-06', '2026-10-08', '2026-10-13', '2026-10-15', '2026-10-20']);
});

test('repeat skips the starting day when its weekday is not selected', () => {
  equal(expandRepeat('2026-10-06', '2026-10-14', [3]), ['2026-10-07', '2026-10-14']);
});

test('repeat can end on the same day it starts', () => {
  equal(expandRepeat('2026-10-06', '2026-10-06', [2]), ['2026-10-06']);
});

test('repeat crosses a month and a year boundary', () => {
  equal(expandRepeat('2026-12-29', '2027-01-05', [2]), ['2026-12-29', '2027-01-05']);
});

test('validateRepeat rejects no days, no end date, an end before the start, and over a year', () => {
  equal(validateRepeat('2026-10-06', '2026-11-01', []) !== null, true);
  equal(validateRepeat('2026-10-06', '', [2]) !== null, true);
  equal(validateRepeat('2026-10-06', '2026-10-01', [2]) !== null, true);
  equal(validateRepeat('2026-10-06', '2028-01-01', [2]) !== null, true);
  equal(validateRepeat('2026-10-06', '2026-10-07', [5]) !== null, true);
});

test('validateRepeat accepts a normal repeat', () => {
  equal(validateRepeat('2026-10-06', '2026-11-30', [2, 4]), null);
});

test('sessionsOn returns one day sorted by time', () => {
  const all = [session('b', '2026-10-06', '19:00'), session('a', '2026-10-06', '07:00'), session('c', '2026-10-07', '06:00')];
  equal(sessionsOn(all, '2026-10-06').map((s) => s.id), ['a', 'b']);
});

const now = new Date(2026, 9, 6, 12, 0); // Tue Oct 6, 12:00

test('next three can all be on one day', () => {
  const all = [session('a', '2026-10-06', '13:00'), session('b', '2026-10-06', '15:00'),
    session('c', '2026-10-06', '18:00'), session('d', '2026-10-06', '20:00')];
  equal(nextSessions(all, now).map((s) => s.id), ['a', 'b', 'c']);
});

test('next three can span several days, in date order', () => {
  const all = [session('c', '2026-10-09', '18:00'), session('a', '2026-10-06', '18:00'), session('b', '2026-10-08', '07:00')];
  equal(nextSessions(all, now).map((s) => s.id), ['a', 'b', 'c']);
});

test('next skips done sessions and sessions that already started today', () => {
  const all = [session('past', '2026-10-06', '08:00'), session('done', '2026-10-06', '18:00', { done: true }),
    session('old', '2026-10-01', '18:00'), session('keep', '2026-10-07', '18:00')];
  equal(nextSessions(all, now).map((s) => s.id), ['keep']);
});

test('a session with no time still counts as upcoming today', () => {
  equal(nextSessions([session('x', '2026-10-06', '')], now).map((s) => s.id), ['x']);
});

test('next is empty when nothing is scheduled', () => {
  equal(nextSessions([], now), []);
});

test('weekStats counts this week only (Sunday to Saturday) and finished hours', () => {
  const all = [session('sun', '2026-10-04', '10:00', { done: true, mins: 90 }),
    session('tue', '2026-10-06', '18:00', { mins: 60 }),
    session('sat', '2026-10-10', '10:00', { done: true, mins: 30 }),
    session('next', '2026-10-11', '10:00', { done: true, mins: 60 }),
    session('last', '2026-10-03', '10:00', { done: true, mins: 60 })];
  equal(weekStats(all, now), { planned: 3, done: 2, hours: 2 });
});

test('sessionsThisWeek lists only this week, in order', () => {
  const all = [session('b', '2026-10-10', '09:00'), session('out', '2026-10-11', '09:00'),
    session('a', '2026-10-04', '09:00'), session('prev', '2026-10-03', '09:00')];
  equal(sessionsThisWeek(all, now).map((s) => s.id), ['a', 'b']);
});

test('weekStats with nothing scheduled is all zeros', () => {
  equal(weekStats([], now), { planned: 0, done: 0, hours: 0 });
});

test('week view shows Sunday to Saturday around the anchor', () => {
  equal(visibleDays('week', '2026-10-14'),
    ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17']);
});

test('3-day and day views start on the anchor, even across a month end', () => {
  equal(visibleDays('3day', '2026-10-30'), ['2026-10-30', '2026-10-31', '2026-11-01']);
  equal(visibleDays('day', '2026-10-30'), ['2026-10-30']);
});

test('arrows move a month, a week, three days or one day', () => {
  equal(shiftAnchor('month', '2026-10-14', 1), '2026-11-01');
  equal(shiftAnchor('month', '2026-01-31', -1), '2025-12-01');
  equal(shiftAnchor('week', '2026-10-14', -1), '2026-10-07');
  equal(shiftAnchor('3day', '2026-10-30', 1), '2026-11-02');
  equal(shiftAnchor('day', '2026-12-31', 1), '2027-01-01');
});

test('layoutDay puts overlapping sessions side by side and leaves others full width', () => {
  const laid = layoutDay([session('a', 'd', '17:00', { mins: 60 }), session('b', 'd', '17:30', { mins: 60 }),
    session('c', 'd', '19:00', { mins: 60 }), session('untimed', 'd', '')]);
  equal(laid.map((i) => [i.session.id, i.lane, i.lanes]), [['a', 0, 2], ['b', 1, 2], ['c', 0, 1]]);
});

test('layoutDay reuses a free lane and gives a very short session a minimum height', () => {
  const laid = layoutDay([session('long', 'd', '09:00', { mins: 120 }), session('x', 'd', '09:30', { mins: 30 }),
    session('y', 'd', '10:00', { mins: 30 }), session('tiny', 'd', '14:00', { mins: 0 })]);
  equal(laid.map((i) => [i.session.id, i.lane, i.lanes]), [['long', 0, 2], ['x', 1, 2], ['y', 1, 2], ['tiny', 0, 1]]);
  equal(laid[3].end - laid[3].start, 30);
});

test('layoutDay stops a late session at midnight', () => {
  equal(layoutDay([session('late', 'd', '23:30', { mins: 120 })])[0].end, 1440);
});

test('hourRange is 7 am to 9 pm unless a session falls outside it', () => {
  equal(hourRange(layoutDay([session('a', 'd', '12:00')])), { startHour: 7, endHour: 21 });
  equal(hourRange(layoutDay([session('early', 'd', '05:30'), session('late', 'd', '21:30', { mins: 90 })])),
    { startHour: 5, endHour: 23 });
});

// ---------- meal plan ----------
const meal = (id, day, name, extra = {}) => ({ id, day, name, desc: '', time: '', kcal: null, prepped: false, ...extra });

test('mealsOn lists one day in time order with untimed meals last', () => {
  const all = [meal('dinner', 1, 'Dinner', { time: '19:00' }), meal('snack', 1, 'Snack'),
    meal('breakfast', 1, 'Breakfast', { time: '07:30' }), meal('other', 2, 'Lunch', { time: '12:00' })];
  equal(mealsOn(all, 1).map((m) => m.id), ['breakfast', 'dinner', 'snack']);
});

test('dayTotals adds calories (ignoring blanks) and counts prepped meals', () => {
  const all = [meal('a', 3, 'A', { kcal: 500, prepped: true }), meal('b', 3, 'B', { kcal: 300 }), meal('c', 3, 'C'),
    meal('d', 4, 'D', { kcal: 900 })];
  equal(dayTotals(all, 3), { count: 3, prepped: 1, kcal: 800 });
  equal(dayTotals(all, 0), { count: 0, prepped: 0, kcal: 0 });
});

test('parseKcal accepts blank and whole numbers, rejects the rest', () => {
  equal(parseKcal('').error, null);
  equal(parseKcal('').value, null);
  equal(parseKcal(' 450 ').value, 450);
  equal(parseKcal('0').value, 0);
  equal(parseKcal('-5').error !== null, true);
  equal(parseKcal('12.5').error !== null, true);
  equal(parseKcal('abc').error !== null, true);
  equal(parseKcal('5001').error !== null, true);
});

test('copyDay replaces the target days, resets prepped, and leaves other days alone', () => {
  let n = 0;
  const next = () => 'new' + ++n;
  const all = [meal('m1', 1, 'Oats', { prepped: true, time: '07:00' }), meal('m2', 1, 'Rice', { time: '12:00' }),
    meal('old', 2, 'Old'), meal('keep', 3, 'Keep')];
  const result = copyDay(all, 1, [2, 1], next);
  equal(result.filter((m) => m.day === 2).map((m) => [m.name, m.prepped]), [['Oats', false], ['Rice', false]]);
  equal(result.filter((m) => m.day === 1).map((m) => m.id), ['m1', 'm2']);
  equal(result.filter((m) => m.day === 3).map((m) => m.id), ['keep']);
  equal(new Set(result.map((m) => m.id)).size, result.length);
});

test('copyDay links each meal with its copies, and keeps an existing link', () => {
  let n = 0;
  const next = () => 'g' + ++n;
  const first = copyDay([meal('a', 1, 'Oats'), meal('b', 1, 'Rice')], 1, [2, 3], next);
  const oats = first.filter((m) => m.name === 'Oats');
  equal(oats.length, 3);
  equal(new Set(oats.map((m) => m.groupId)).size, 1);
  equal(oats[0].groupId !== undefined, true);
  equal(new Set(first.filter((m) => m.name === 'Rice').map((m) => m.groupId)).size, 1);
  equal(oats[0].groupId !== first.find((m) => m.name === 'Rice').groupId, true);
  // copying a copy onward keeps the same group
  const second = copyDay(first, 2, [4], next);
  equal(new Set(second.filter((m) => m.name === 'Oats').map((m) => m.groupId)).size, 1);
  equal(second.filter((m) => m.name === 'Oats').length, 4);
});

test('linkedMeals finds the other copies of a meal, and nothing for a meal never copied', () => {
  const all = [meal('a', 1, 'Oats', { groupId: 'g' }), meal('b', 2, 'Oats', { groupId: 'g' }),
    meal('c', 3, 'Oats', { groupId: 'g' }), meal('d', 4, 'Other', { groupId: 'h' }), meal('e', 5, 'Solo')];
  equal(linkedMeals(all, all[0]).map((m) => m.id), ['b', 'c']);
  equal(linkedMeals(all, all[3]), []);
  equal(linkedMeals(all, all[4]), []);
});

test('changesSharedDetails ignores prepped and day, but notices a real change', () => {
  const original = meal('a', 1, 'Oats', { kcal: 500, time: '07:00', desc: 'banana', protein: 20 });
  const same = { name: 'Oats', desc: 'banana', time: '07:00', kcal: 500, protein: 20, carb: null, fat: null, prepped: true };
  equal(changesSharedDetails(original, same), false);
  equal(changesSharedDetails(original, { ...same, kcal: 550 }), true);
  equal(changesSharedDetails(original, { ...same, name: 'Porridge' }), true);
  // a meal saved before macros existed has no macro fields; blanks count as unchanged
  equal(changesSharedDetails({ id: 'x', day: 1, name: 'Oats' }, { name: 'Oats', desc: '', time: '', kcal: null, protein: null, carb: null, fat: null }), false);
});

test('applyToLinked updates every copy but keeps each day and prepped state', () => {
  const all = [meal('a', 1, 'Oats', { groupId: 'g', prepped: true }), meal('b', 3, 'Oats', { groupId: 'g' }),
    meal('c', 5, 'Oats', { groupId: 'other' })];
  const fields = { name: 'Porridge', desc: 'honey', time: '08:00', kcal: 450, protein: 15, carb: 70, fat: 8, prepped: false };
  const result = applyToLinked(all, all[0], fields);
  equal(result.filter((m) => m.groupId === 'g').map((m) => [m.id, m.day, m.name, m.time, m.kcal, m.prepped]),
    [['a', 1, 'Porridge', '08:00', 450, true], ['b', 3, 'Porridge', '08:00', 450, false]]);
  equal(result.find((m) => m.id === 'c').name, 'Oats');
});

test('macroKcal and macroShares turn gram targets into calories and percents', () => {
  const targets = { protein: 150, carb: 300, fat: 60 };
  equal(macroKcal(targets), 150 * 4 + 300 * 4 + 60 * 9);
  equal(macroShares(targets), { protein: 26, carb: 51, fat: 23 });
  equal(macroShares({ protein: 100, carb: 100, fat: 0 }), { protein: 50, carb: 50, fat: 0 });
  equal(macroShares({ protein: null, carb: null, fat: null }), { protein: 0, carb: 0, fat: 0 });
});

test('parseGrams accepts blank and 0 to 1000, and names the macro in its error', () => {
  equal(parseGrams('', 'Protein').value, null);
  equal(parseGrams('145', 'Protein').value, 145);
  equal(parseGrams('1001', 'Protein').error, 'Protein must be a whole number from 0 to 1000.');
  equal(parseGrams('-1', 'Fat').error !== null, true);
  equal(parseGrams('2.5', 'Carbs').error !== null, true);
});

test('dayMacroTotals adds grams for one day and treats old meals without macros as zero', () => {
  const all = [meal('a', 1, 'A', { protein: 30, carb: 50 }), meal('b', 1, 'B', { protein: 20, fat: 10 }),
    meal('c', 1, 'Old'), meal('d', 2, 'D', { protein: 99 })];
  equal(dayMacroTotals(all, 1), { protein: 50, carb: 50, fat: 10 });
});

test('macroProgress caps the bar at 100, flags going over, and needs a target', () => {
  equal(macroProgress(60, 120), { percent: 50, over: false });
  equal(macroProgress(150, 120), { percent: 100, over: true });
  equal(macroProgress(120, 120), { percent: 100, over: false });
  equal(macroProgress(40, null), null);
  equal(macroProgress(40, 0), null);
});

test('glassesToday only counts glasses logged on the same date', () => {
  equal(glassesToday({ date: '2026-10-13', glasses: 5 }, '2026-10-13'), 5);
  equal(glassesToday({ date: '2026-10-12', glasses: 5 }, '2026-10-13'), 0);
  equal(glassesToday({ date: '', glasses: 0 }, '2026-10-13'), 0);
});

test('tapGlass fills up to the tapped glass and undoes when the last one is tapped again', () => {
  equal(tapGlass(0, 2), 3);
  equal(tapGlass(3, 5), 6);
  equal(tapGlass(3, 1), 2);
  equal(tapGlass(3, 2), 2);
  equal(tapGlass(1, 0), 0);
});

// ---------- journal ----------
const entries = {
  '2026-10-10': { feeling: 'sharp', text: 'Great bouting.' },
  '2026-10-12': { feeling: 'tired', text: 'Slow footwork.' },
  '2026-10-11': { feeling: 'sharp', text: 'Clean flèche.' },
};

test('entries without saved times sort by their day, newest or oldest first', () => {
  equal(sortEntries(entries, { by: 'created', order: 'desc' }).map((e) => e.date), ['2026-10-12', '2026-10-11', '2026-10-10']);
  equal(sortEntries(entries, { by: 'created', order: 'asc' }).map((e) => e.date), ['2026-10-10', '2026-10-11', '2026-10-12']);
});

test('filtering by feeling keeps only those entries, and an empty filter keeps all', () => {
  const sort = { by: 'created', order: 'desc' };
  equal(sortEntries(entries, sort, new Set(['sharp'])).map((e) => e.date), ['2026-10-11', '2026-10-10']);
  equal(sortEntries(entries, sort, new Set(['sharp', 'tired'])).length, 3);
  equal(sortEntries(entries, sort, new Set(['rough'])), []);
  equal(matchesFeeling({ feeling: 'tired' }, new Set()), true);
  equal(matchesFeeling({ feeling: 'tired' }, new Set(['sharp'])), false);
});

test('date created and date edited sort by their own times, in either direction', () => {
  const stamped = {
    '2026-10-10': { feeling: 'sharp', text: 'a', createdAt: '2026-10-10T18:00:00.000Z', editedAt: '2026-10-15T09:00:00.000Z' },
    '2026-10-11': { feeling: 'sharp', text: 'b', createdAt: '2026-10-11T18:00:00.000Z', editedAt: '2026-10-11T18:00:00.000Z' },
    '2026-10-12': { feeling: 'sharp', text: 'c', createdAt: '2026-10-12T18:00:00.000Z', editedAt: '2026-10-13T08:00:00.000Z' },
  };
  equal(sortEntries(stamped, { by: 'created', order: 'desc' }).map((e) => e.date), ['2026-10-12', '2026-10-11', '2026-10-10']);
  equal(sortEntries(stamped, { by: 'edited', order: 'desc' }).map((e) => e.date), ['2026-10-10', '2026-10-12', '2026-10-11']);
  equal(sortEntries(stamped, { by: 'edited', order: 'asc' }).map((e) => e.date), ['2026-10-11', '2026-10-12', '2026-10-10']);
});

test('an entry never edited sorts by when it was created, and an older one by its day', () => {
  const mixed = {
    '2026-10-10': { feeling: 'sharp', text: 'old, no times' },
    '2026-10-11': { feeling: 'sharp', text: 'new', createdAt: '2026-10-11T20:00:00.000Z' },
  };
  equal(sortEntries(mixed, { by: 'edited', order: 'desc' }).map((e) => e.date), ['2026-10-11', '2026-10-10']);
});

test('custom order follows the list, with entries not in it first (newest first)', () => {
  const sort = { by: 'custom', custom: ['2026-10-10', '2026-10-12'] };
  equal(sortEntries(entries, sort).map((e) => e.date), ['2026-10-11', '2026-10-10', '2026-10-12']);
  equal(sortEntries(entries, { by: 'custom', custom: ['2026-10-12', '2026-10-11', '2026-10-10'] }).map((e) => e.date), ['2026-10-12', '2026-10-11', '2026-10-10']);
  equal(sortEntries(entries, { by: 'custom', custom: ['2026-10-12', '2026-10-11', '2026-10-10'] }, new Set(['sharp'])).map((e) => e.date), ['2026-10-11', '2026-10-10']);
});

test('placeInCustomOrder moves an entry to a position and keeps hidden entries where they were', () => {
  const full = ['a', 'b', 'c', 'd'];
  equal(placeInCustomOrder(full, full, 'd', 0), ['d', 'a', 'b', 'c']);
  equal(placeInCustomOrder(full, full, 'a', 3), ['b', 'c', 'd', 'a']);
  equal(placeInCustomOrder(full, full, 'b', 1), ['a', 'b', 'c', 'd']);
  // only a, c, d are showing; b is hidden between a and c
  equal(placeInCustomOrder(full, ['a', 'c', 'd'], 'd', 1), ['a', 'b', 'd', 'c']);
  equal(placeInCustomOrder(full, ['a', 'c', 'd'], 'a', 2), ['b', 'c', 'd', 'a']);
});

test('validateEntry needs a known feeling and some text, within the length limit', () => {
  equal(validateEntry({ feeling: 'sharp', text: 'Good day' }), null);
  equal(validateEntry({ feeling: '', text: 'Good day' }) !== null, true);
  equal(validateEntry({ feeling: 'happy', text: 'Good day' }) !== null, true);
  equal(validateEntry({ feeling: 'sharp', text: '   ' }) !== null, true);
  equal(validateEntry({ feeling: 'sharp', text: 'x'.repeat(2001) }) !== null, true);
});

test('appendPrompt puts a prompt on its own line under what is already written', () => {
  equal(appendPrompt('', 'What needs work?'), 'What needs work?\n');
  equal(appendPrompt('Felt good.\n', 'What needs work?'), 'Felt good.\n\nWhat needs work?\n');
});

// ---------- goals ----------
const goal = (id, extra = {}) => ({ id, name: id, tag: 'technique', due: '', progress: 0, ...extra });

test('tapStep fills up to the tapped step in fifths and steps back from the last one', () => {
  equal(tapStep(0, 0), 20);
  equal(tapStep(0, 2), 60);
  equal(tapStep(40, 4), 100);
  equal(tapStep(60, 1), 40);
  equal(tapStep(60, 2), 40);
  equal(tapStep(20, 0), 0);
  equal(tapStep(100, 4), 80);
});

test('validateGoal needs a name within the length limit and a known tag', () => {
  equal(validateGoal({ name: 'Win a bout', tag: 'competition' }), null);
  equal(validateGoal({ name: '   ', tag: 'competition' }) !== null, true);
  equal(validateGoal({ name: 'x'.repeat(121), tag: 'fitness' }) !== null, true);
  equal(validateGoal({ name: 'Win a bout', tag: 'speed' }) !== null, true);
});

test('sortGoals puts in-progress goals first by deadline, no deadline last, finished at the end', () => {
  const sorted = sortGoals([goal('done', { due: '2026-10-01', progress: 100 }), goal('nodate'),
    goal('late', { due: '2026-12-01' }), goal('soon', { due: '2026-10-20' })]);
  equal(sorted.map((g) => g.id), ['soon', 'late', 'nodate', 'done']);
});

test('matchesTag keeps only the chosen tags, and everything when none are chosen', () => {
  equal(matchesTag(goal('a', { tag: 'tactics' }), new Set()), true);
  equal(matchesTag(goal('a', { tag: 'tactics' }), new Set(['tactics', 'fitness'])), true);
  equal(matchesTag(goal('a', { tag: 'tactics' }), new Set(['fitness'])), false);
});

test('dueStatus says overdue, today, upcoming, none, or done', () => {
  equal(dueStatus(goal('a', { due: '2026-10-10' }), '2026-10-13'), { kind: 'overdue', days: 3 });
  equal(dueStatus(goal('a', { due: '2026-10-13' }), '2026-10-13'), { kind: 'today', days: 0 });
  equal(dueStatus(goal('a', { due: '2026-11-02' }), '2026-10-13'), { kind: 'upcoming', days: 20 });
  equal(dueStatus(goal('a'), '2026-10-13'), { kind: 'none', days: 0 });
  equal(dueStatus(goal('a', { due: '2026-10-01', progress: 100 }), '2026-10-13'), { kind: 'done', days: 0 });
});

test('stepFromPosition maps a pointer over the bars to a step, -1 past the left end', () => {
  equal(stepFromPosition(100, 100, 200), 0);
  equal(stepFromPosition(139, 100, 200), 0);
  equal(stepFromPosition(140, 100, 200), 1);
  equal(stepFromPosition(299, 100, 200), 4);
  equal(stepFromPosition(50, 100, 200), -1);
  equal(stepFromPosition(400, 100, 200), 4);
});

test('isUrgent is true for overdue, due today, and 7 or fewer days left, but not 8', () => {
  equal(isUrgent({ kind: 'overdue', days: 2 }), true);
  equal(isUrgent({ kind: 'today', days: 0 }), true);
  equal(isUrgent({ kind: 'upcoming', days: 1 }), true);
  equal(isUrgent({ kind: 'upcoming', days: 7 }), true);
  equal(isUrgent({ kind: 'upcoming', days: 8 }), false);
  equal(isUrgent({ kind: 'none', days: 0 }), false);
  equal(isUrgent({ kind: 'done', days: 0 }), false);
});

test('visibleGoals applies the tag filter and, when asked, hides completed goals', () => {
  const all = [goal('a', { tag: 'fitness', progress: 100 }), goal('b', { tag: 'fitness', progress: 40 }),
    goal('c', { tag: 'tactics', progress: 100 })];
  equal(visibleGoals(all, new Set(), false).map((g) => g.id), ['b', 'a', 'c']);
  equal(visibleGoals(all, new Set(), true).map((g) => g.id), ['b']);
  equal(visibleGoals(all, new Set(['tactics']), false).map((g) => g.id), ['c']);
  equal(visibleGoals(all, new Set(['tactics']), true), []);
});

const full = (id, date, extra = {}) => ({ id, date, type: 'bout', time: '18:00', mins: 75, location: 'Strip 3', notes: '', done: false, ...extra });
const details = { type: 'bout', time: '18:00', mins: 75, location: 'Strip 3', notes: '' };

test('repeating an edited session lists the other matching days and leaves its own day out', () => {
  equal(extraRepeatDates('2026-10-05', '2026-10-19', [1, 3]), ['2026-10-07', '2026-10-12', '2026-10-14', '2026-10-19']);
  equal(extraRepeatDates('2026-10-06', '2026-10-14', [3]), ['2026-10-07', '2026-10-14']);
  equal(extraRepeatDates('2026-10-06', '2026-10-06', [2]), []);
});

test('findDuplicates finds days holding a session identical in every detail', () => {
  const existing = [full('wed', '2026-10-07'), full('other-time', '2026-10-12', { time: '19:00' }),
    full('other-length', '2026-10-14', { mins: 60 }), full('other-place', '2026-10-19', { location: 'Strip 1' }),
    full('other-notes', '2026-10-21', { notes: 'focus on parries' }), full('other-type', '2026-10-26', { type: 'blade' })];
  const dates = ['2026-10-07', '2026-10-12', '2026-10-14', '2026-10-19', '2026-10-21', '2026-10-26'];
  equal(findDuplicates(existing, details, dates).map((d) => [d.date, d.existing.map((s) => s.id)]), [['2026-10-07', ['wed']]]);
});

test('findDuplicates ignores the session being edited and days with no match', () => {
  const existing = [full('mon', '2026-10-05'), full('wed', '2026-10-07')];
  equal(findDuplicates(existing, details, ['2026-10-05', '2026-10-07', '2026-10-12'], 'mon').map((d) => d.date), ['2026-10-07']);
  equal(findDuplicates(existing, details, ['2026-10-12']), []);
});

test('findDuplicates reports every identical session on a day', () => {
  const existing = [full('a', '2026-10-07'), full('b', '2026-10-07')];
  equal(findDuplicates(existing, details, ['2026-10-07'])[0].existing.map((s) => s.id), ['a', 'b']);
});

// ---------- FencingTracker link ----------
test('parseFencerLink accepts a profile link and keeps it as a clean https link', () => {
  equal(parseFencerLink('https://fencingtracker.com/p/123456/Jane-Doe').url, 'https://fencingtracker.com/p/123456/Jane-Doe');
  equal(parseFencerLink('  https://www.fencingtracker.com/p/123456/Jane-Doe  ').url, 'https://www.fencingtracker.com/p/123456/Jane-Doe');
  equal(parseFencerLink('fencingtracker.com/p/123456/Jane-Doe').url, 'https://fencingtracker.com/p/123456/Jane-Doe');
  equal(parseFencerLink('http://fencingtracker.com/p/123456').url, 'https://fencingtracker.com/p/123456');
  equal(parseFencerLink('https://FencingTracker.com/p/123456/Jane?tab=results#top').url, 'https://fencingtracker.com/p/123456/Jane');
});

test('parseFencerLink rejects links from any other website, including look-alikes', () => {
  for (const bad of ['https://example.com/p/123456/Jane', 'https://fencingtracker.com.evil.com/p/123456/Jane',
    'https://evilfencingtracker.com/p/123456/Jane', 'https://fencingtracker.com@evil.com/p/123456/Jane',
    'https://evil.com/?u=fencingtracker.com/p/123456', 'https://sub.fencingtracker.com/p/123456/Jane']) {
    equal(parseFencerLink(bad).error !== undefined, true);
  }
});

test('parseFencerLink rejects empty text, non-web links, and non-profile pages', () => {
  for (const bad of ['', '   ', 'javascript:alert(1)', 'ftp://fencingtracker.com/p/123456', 'not a link',
    'https://fencingtracker.com/', 'https://fencingtracker.com/rankings', 'https://fencingtracker.com/p/abc/Jane']) {
    equal(parseFencerLink(bad).error !== undefined, true);
  }
});

test('moveStart snaps a drag to 15 minutes', () => {
  equal(moveStart(17 * 60, 52, 60, 7 * 60, 21 * 60), 17 * 60 + 45);
  equal(moveStart(17 * 60, 7, 60, 7 * 60, 21 * 60), 17 * 60);
  equal(moveStart(17 * 60, 8, 60, 7 * 60, 21 * 60), 17 * 60 + 15);
  equal(moveStart(17 * 60, -120, 60, 7 * 60, 21 * 60), 15 * 60);
});

test('moveStart keeps the whole session inside the visible hours', () => {
  equal(moveStart(8 * 60, -600, 60, 7 * 60, 21 * 60), 7 * 60);
  equal(moveStart(19 * 60, 600, 90, 7 * 60, 21 * 60), 21 * 60 - 90);
  equal(moveStart(7 * 60, 0, 60 * 20, 7 * 60, 21 * 60), 7 * 60);
});

test('minutesToTime gives a two-digit hour and minute', () => {
  equal(minutesToTime(0), '00:00');
  equal(minutesToTime(7 * 60 + 5), '07:05');
  equal(minutesToTime(17 * 60 + 45), '17:45');
});

test('copyMeal adds one meal to the chosen days and keeps the other meals there', () => {
  let n = 0;
  const next = () => 'c' + ++n;
  const all = [meal('a', 1, 'Oats', { time: '07:00', kcal: 500, prepped: true }), meal('b', 1, 'Rice'),
    meal('x', 3, 'Lunch', { time: '12:00' })];
  const result = copyMeal(all, all[0], [3, 5, 1], next);
  equal(result.copiedDays, [3, 5]);
  equal(result.skippedDays, []);
  equal(result.meals.filter((m) => m.day === 3).map((m) => m.name), ['Lunch', 'Oats']);
  equal(result.meals.filter((m) => m.day === 5).map((m) => [m.name, m.prepped, m.kcal]), [['Oats', false, 500]]);
  equal(result.meals.filter((m) => m.day === 1).map((m) => m.name), ['Oats', 'Rice']);
  equal(new Set(result.meals.filter((m) => m.name === 'Oats').map((m) => m.groupId)).size, 1);
  equal(result.meals.find((m) => m.id === 'b').groupId, undefined);
  equal(new Set(result.meals.map((m) => m.id)).size, result.meals.length);
});

test('copyMeal skips days that already hold a copy or an identical meal', () => {
  let n = 0;
  const next = () => 'c' + ++n;
  const original = meal('a', 1, 'Oats', { groupId: 'g', kcal: 500 });
  const all = [original, meal('copy', 2, 'Oats', { groupId: 'g', kcal: 500 }),
    meal('same', 3, 'Oats', { kcal: 500 }), meal('different', 4, 'Oats', { kcal: 300 })];
  const result = copyMeal(all, original, [2, 3, 4, 5], next);
  equal(result.skippedDays, [2, 3]);
  equal(result.copiedDays, [4, 5]);
  equal(result.meals.filter((m) => m.day === 4).map((m) => m.kcal), [300, 500]);
});

test('mealTemplate keeps the shared details and drops the day, id and prepped state', () => {
  const t = mealTemplate(meal('a', 3, 'Oats', { desc: 'banana', time: '07:30', kcal: 500, prepped: true, groupId: 'g' }));
  equal(t, { name: 'Oats', desc: 'banana', time: '07:30', kcal: 500, protein: null, carb: null, fat: null });
});

test('addToHistory puts a meal first and does not keep identical copies', () => {
  const oats = meal('a', 1, 'Oats', { kcal: 500 });
  const rice = meal('b', 1, 'Rice', { kcal: 600 });
  let history = addToHistory([], oats);
  history = addToHistory(history, rice);
  equal(history.map((h) => h.name), ['Rice', 'Oats']);
  history = addToHistory(history, meal('c', 4, 'Oats', { kcal: 500 }));
  equal(history.map((h) => h.name), ['Oats', 'Rice']);
  history = addToHistory(history, meal('d', 4, 'Oats', { kcal: 550 }));
  equal(history.map((h) => h.name + h.kcal), ['Oats550', 'Oats500', 'Rice600']);
});

test('addToHistory keeps only the newest entries up to the limit', () => {
  let history = [];
  for (let i = 0; i < 5; i++) history = addToHistory(history, meal('m' + i, 1, 'Meal ' + i), 3);
  equal(history.map((h) => h.name), ['Meal 4', 'Meal 3', 'Meal 2']);
});

test('mergeIntoHistory adds missing plan meals at the end and leaves known ones alone', () => {
  const history = [mealTemplate(meal('a', 1, 'Oats'))];
  const merged = mergeIntoHistory(history, [meal('b', 2, 'Oats'), meal('c', 2, 'Rice'), meal('d', 3, 'Rice')]);
  equal(merged.map((h) => h.name), ['Oats', 'Rice']);
});

test('removeFromHistory drops one entry and searchHistory finds words in the name or description', () => {
  const history = [mealTemplate(meal('a', 1, 'Oats', { desc: 'banana and honey' })), mealTemplate(meal('b', 1, 'Salmon bowl', { desc: 'rice' }))];
  equal(removeFromHistory(history, history[0]).map((h) => h.name), ['Salmon bowl']);
  equal(searchHistory(history, 'HONEY banana').map((h) => h.name), ['Oats']);
  equal(searchHistory(history, 'rice').map((h) => h.name), ['Salmon bowl']);
  equal(searchHistory(history, '  ').length, 2);
  equal(searchHistory(history, 'pizza'), []);
});

test('addTemplateToDays adds to the chosen days, keeps other meals, and skips identical ones', () => {
  let n = 0;
  const next = () => 'n' + ++n;
  const template = mealTemplate(meal('a', 1, 'Oats', { time: '07:30', kcal: 500 }));
  const all = [meal('x', 2, 'Lunch'), meal('same', 3, 'Oats', { time: '07:30', kcal: 500 })];
  const result = addTemplateToDays(all, template, [2, 3, 5, 5], next);
  equal(result.addedDays, [2, 5]);
  equal(result.skippedDays, [3]);
  equal(result.meals.filter((m) => m.day === 2).map((m) => m.name), ['Lunch', 'Oats']);
  equal(result.meals.filter((m) => m.name === 'Oats' && m.id.startsWith('n')).map((m) => [m.day, m.prepped, m.kcal]), [[2, false, 500], [5, false, 500]]);
});

test('moveMeal changes only the day and keeps every other detail', () => {
  const original = meal('a', 1, 'Oats', { time: '07:30', kcal: 500, prepped: true, groupId: 'g', protein: 20 });
  const result = moveMeal([original, meal('b', 1, 'Rice')], 'a', 4);
  equal(result[0], { ...original, day: 4 });
  equal(result[1].day, 1);
});

test('Breakfast, Lunch and Dinner come out in that order however they were added', () => {
  const all = [meal('d', 1, 'Dinner'), meal('s', 1, 'Snack'), meal('b', 1, 'Breakfast'), meal('l', 1, 'Lunch')];
  equal(mealsOn(all, 1).map((m) => m.name), ['Breakfast', 'Lunch', 'Dinner', 'Snack']);
  equal(mealsOn([meal('x', 2, 'dinner'), meal('y', 2, 'LUNCH'), meal('z', 2, 'Breakfast bowl')], 2).map((m) => m.name), ['Breakfast bowl', 'LUNCH', 'dinner']);
});

test('other meals with a time slot in between by time, and meals with a time keep that time', () => {
  const all = [meal('d', 1, 'Dinner'), meal('p', 1, 'Pre-training', { time: '16:30' }), meal('l', 1, 'Lunch'),
    meal('b', 1, 'Breakfast'), meal('sn', 1, 'Snack', { time: '15:30' }), meal('post', 1, 'Post-training', { time: '20:00' }), meal('any', 1, 'Anything')];
  equal(mealsOn(all, 1).map((m) => m.name), ['Breakfast', 'Lunch', 'Snack', 'Pre-training', 'Dinner', 'Post-training', 'Anything']);
  equal(mealsOn([meal('d', 1, 'Dinner', { time: '17:00' }), meal('l', 1, 'Lunch', { time: '13:00' })], 1).map((m) => m.name), ['Lunch', 'Dinner']);
});

test('placeMeal puts a meal at a position and the day keeps that order', () => {
  const all = [meal('b', 1, 'Breakfast'), meal('l', 1, 'Lunch'), meal('d', 1, 'Dinner')];
  const reordered = placeMeal(all, 'd', 1, 0);
  equal(mealsOn(reordered, 1).map((m) => m.name), ['Dinner', 'Breakfast', 'Lunch']);
  equal(mealsOn(placeMeal(reordered, 'b', 1, 5), 1).map((m) => m.name), ['Dinner', 'Lunch', 'Breakfast']);
  equal(mealsOn(placeMeal(reordered, 'l', 1, 1), 1).map((m) => m.name), ['Dinner', 'Lunch', 'Breakfast']);
});

test('placeMeal can drop a meal between meals on another day, and a new meal goes after a hand-ordered day', () => {
  const all = [meal('a', 1, 'Oats'), meal('b', 2, 'Lunch'), meal('c', 2, 'Dinner')];
  const moved = placeMeal(all, 'a', 2, 1);
  equal(mealsOn(moved, 2).map((m) => m.name), ['Lunch', 'Oats', 'Dinner']);
  equal(moved.find((m) => m.id === 'a').day, 2);
  const withNew = [...moved, meal('n', 2, 'Breakfast')];
  equal(mealsOn(withNew, 2).map((m) => m.name), ['Lunch', 'Oats', 'Dinner', 'Breakfast']);
});

test('moving or copying one meal drops its hand-set position, and copying a whole day keeps the order', () => {
  let n = 0;
  const next = () => 'k' + ++n;
  const ordered = placeMeal([meal('b', 1, 'Breakfast'), meal('l', 1, 'Lunch')], 'l', 1, 0);
  const movedAway = moveMeal(ordered, 'l', 3);
  equal(movedAway.find((m) => m.id === 'l').rank, undefined);
  const single = copyMeal(ordered, ordered.find((m) => m.id === 'l'), [4], next).meals.find((m) => m.day === 4);
  equal(single.rank, undefined);
  const wholeDay = copyDay(ordered, 1, [5], next);
  equal(mealsOn(wholeDay, 5).map((m) => m.name), ['Lunch', 'Breakfast']);
});

test('clearOrder puts one day back in the default order and leaves other days alone', () => {
  let all = [meal('b', 1, 'Breakfast'), meal('l', 1, 'Lunch'), meal('d', 1, 'Dinner'), meal('x', 2, 'Dinner'), meal('y', 2, 'Lunch')];
  all = placeMeal(placeMeal(all, 'd', 1, 0), 'x', 2, 1);
  equal([hasCustomOrder(all, 1), hasCustomOrder(all, 2), hasCustomOrder(all, 3)], [true, true, false]);
  const cleared = clearOrder(all, 1);
  equal(mealsOn(cleared, 1).map((m) => m.name), ['Breakfast', 'Lunch', 'Dinner']);
  equal(hasCustomOrder(cleared, 1), false);
  equal(hasCustomOrder(cleared, 2), true);
});

// 2026-10-21 is a Wednesday (day 3).
const wednesdayAt = (hours, minutes = 0) => new Date(2026, 9, 21, hours, minutes);

test('upcomingMeals lists the next meals from now, soonest first, and skips ones already past today', () => {
  const all = [meal('b', 3, 'Breakfast', { time: '07:30' }), meal('l', 3, 'Lunch', { time: '12:30' }), meal('d', 3, 'Dinner', { time: '19:00' }),
    meal('tb', 4, 'Breakfast', { time: '07:30' }), meal('tl', 4, 'Lunch')];
  const next = upcomingMeals(all, wednesdayAt(10), 3);
  equal(next.map((n) => [n.meal.id, n.daysAhead]), [['l', 0], ['d', 0], ['tb', 1]]);
  equal(upcomingMeals(all, wednesdayAt(12, 30), 1).map((n) => n.meal.id), ['l']);
  equal(upcomingMeals(all, wednesdayAt(12, 31), 1).map((n) => n.meal.id), ['d']);
});

test('upcomingMeals wraps into next week, and uses typical times for Breakfast, Lunch and Dinner', () => {
  const all = [meal('mon', 1, 'Lunch', { time: '12:30' }), meal('lunch', 3, 'Lunch'), meal('dinner', 3, 'Dinner')];
  equal(upcomingMeals(all, wednesdayAt(15), 3).map((n) => [n.meal.id, n.daysAhead]), [['dinner', 0], ['mon', 5], ['lunch', 7]]);
  equal(upcomingMeals([meal('only', 3, 'Lunch', { time: '12:30' })], wednesdayAt(15), 3).map((n) => n.daysAhead), [7]);
});

test('upcomingMeals puts a meal with no time at the end of its day, and handles an empty plan', () => {
  const all = [meal('any', 3, 'Snack'), meal('d', 3, 'Dinner', { time: '19:00' })];
  equal(upcomingMeals(all, wednesdayAt(8), 3).map((n) => n.meal.id), ['d', 'any']);
  equal(upcomingMeals([], wednesdayAt(8)), []);
});

// ---------- routines ----------
const row = (name, desc = '') => ({ name, desc });
const stepList = (...names) => names.map((name) => row(name));

test('validateRoutine accepts a good routine, with or without minutes or descriptions', () => {
  equal(validateRoutine({ name: ' Warm-up ', minsText: '15', steps: [row(' Pulse raise ', ' 3 min jogging '), row('Stretch')] }),
    { value: { name: 'Warm-up', mins: 15, steps: [row('Pulse raise', '3 min jogging'), row('Stretch')] } });
  equal(validateRoutine({ name: 'Drill', minsText: '', steps: [row('One')] }).value.mins, null);
});

test('validateRoutine ignores empty rows and keeps the order of the rest', () => {
  const result = validateRoutine({ name: 'Drill', minsText: '', steps: [row(''), row('A'), row('', ''), row('B', 'second'), row('  ', '  ')] });
  equal(result.value.steps, [row('A'), row('B', 'second')]);
});

test('validateRoutine rejects a missing name, bad minutes, and bad steps', () => {
  const ok = { name: 'Drill', minsText: '10', steps: [row('One')] };
  equal(validateRoutine({ ...ok, name: '  ' }).error !== undefined, true);
  equal(validateRoutine({ ...ok, name: 'x'.repeat(61) }).error !== undefined, true);
  equal(validateRoutine({ ...ok, minsText: '-5' }).error !== undefined, true);
  equal(validateRoutine({ ...ok, minsText: '12.5' }).error !== undefined, true);
  equal(validateRoutine({ ...ok, minsText: '601' }).error !== undefined, true);
  equal(validateRoutine({ ...ok, steps: [row(''), row('  ')] }).error !== undefined, true);
  equal(validateRoutine({ ...ok, steps: [row('x'.repeat(101))] }).error !== undefined, true);
  equal(validateRoutine({ ...ok, steps: [row('Fine', 'x'.repeat(201))] }).error !== undefined, true);
  equal(validateRoutine({ ...ok, steps: Array.from({ length: 31 }, (_, i) => row('Step ' + i)) }).error !== undefined, true);
});

test('validateRoutine says which step has a description but no name', () => {
  equal(validateRoutine({ name: 'Drill', minsText: '', steps: [row('One'), row('', 'oops')] }).error, 'Give step 2 a name.');
});

test('stepFromText splits at the first dash with spaces, and leaves other text as a name', () => {
  equal(stepFromText('Lunge chain - advance, advance, lunge - 6 reps'), row('Lunge chain', 'advance, advance, lunge - 6 reps'));
  equal(stepFromText('Pulse raise — 3 min'), row('Pulse raise', '3 min'));
  equal(stepFromText('Pulse raise – 3 min'), row('Pulse raise', '3 min'));
  equal(stepFromText('Warm-up the legs'), row('Warm-up the legs'));
  equal(stepFromText('Advance-retreat - 4 lengths'), row('Advance-retreat', '4 lengths'));
});

test('normalizeSteps turns older text steps into name and description and keeps new ones', () => {
  equal(normalizeSteps(['A — b', 'C', row('D', 'e'), { name: 'F' }]), [row('A', 'b'), row('C'), row('D', 'e'), row('F')]);
});

test('routineSummary gives time and step count, and the starter routines are valid', () => {
  equal(routineSummary({ mins: 15, steps: stepList('a', 'b') }), '15 min · 2 steps');
  equal(routineSummary({ mins: null, steps: stepList('a') }), '1 step');
  for (const starter of STARTER_ROUTINES) {
    equal(validateRoutine({ name: starter.name, minsText: String(starter.mins), steps: starter.steps }).error, undefined);
  }
  equal(STARTER_ROUTINES.length, 4);
  equal(STARTER_ROUTINES[0].steps[0], row('Pulse raise', '3 min light jogging or jump rope.'));
});

const drill = (extra = {}) => ({ id: 'r', name: 'Warm-up', mins: 10, steps: stepList('A', 'B', 'C', 'D'), ...extra });

test('a routine with no saved checks has every step undone', () => {
  equal(stepsDone(drill(), '2026-10-20'), [false, false, false, false]);
  equal(routineProgress(drill(), '2026-10-20'), { done: 0, total: 4, fraction: 0 });
});

test('toggleStep ticks a step for today, and unticks it again', () => {
  const ticked = drill(toggleStep(drill(), 1, '2026-10-20'));
  equal(stepsDone(ticked, '2026-10-20'), [false, true, false, false]);
  const more = drill(toggleStep(ticked, 3, '2026-10-20'));
  equal(routineProgress(more, '2026-10-20'), { done: 2, total: 4, fraction: 0.5 });
  const undone = drill(toggleStep(more, 1, '2026-10-20'));
  equal(stepsDone(undone, '2026-10-20'), [false, false, false, true]);
});

test('checks from an earlier day do not count today', () => {
  const yesterday = drill({ doneDate: '2026-10-19', done: [true, true, true, true] });
  equal(routineProgress(yesterday, '2026-10-20').done, 0);
  const today = drill(toggleStep(yesterday, 0, '2026-10-20'));
  equal(stepsDone(today, '2026-10-20'), [true, false, false, false]);
});

test('editing keeps the check on steps that did not change (name and description), and drops the rest', () => {
  const r = drill({ doneDate: '2026-10-20', done: [true, true, false, true], steps: [row('A', 'x'), row('B'), row('C'), row('D')] });
  equal(reconcileDone(r, [row('A', 'x'), row('B changed'), row('C'), row('D')], '2026-10-20').done, [true, false, false, true]);
  equal(reconcileDone(r, [row('A', 'new description'), row('B')], '2026-10-20').done, [false, true]);
  equal(reconcileDone(r, [row('A', 'x'), row('B'), row('C'), row('D'), row('E')], '2026-10-20').done, [true, true, false, true, false]);
});

const failures = results.filter((r) => r.error);
const summary = document.getElementById('summary');
summary.textContent = failures.length === 0
  ? 'All ' + results.length + ' tests passed.'
  : failures.length + ' of ' + results.length + ' tests failed.';
summary.className = failures.length === 0 ? 'pass' : 'fail';
const list = document.getElementById('results');
for (const { name, error } of results) {
  const item = document.createElement('li');
  item.textContent = (error ? 'FAIL: ' : 'pass: ') + name + (error ? ' — ' + error.message : '');
  item.className = error ? 'fail' : 'pass';
  list.append(item);
}
