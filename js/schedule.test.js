import { ACCENT_CHOICES, normalizeAccent } from './accent.js';
import { FONT_CHOICES, normalizeFont } from './fonts.js';
import { addVideoNote, cleanVideoNotes, formatTimestamp, parseTimestamp, removeVideoNote, validateVideoNote } from './video-review.js';
import {
  MAX_SAVED_ROUTINES,
  cleanSavedRoutines,
  defaultRoutineName,
  routineHasStep,
  routineWithoutStep,
  starterRoutines,
  routineSummary,
  snapshotRoutine,
  validateRoutineName,
} from './routinelibrary.js';
import { parseFencerLink, parseOptionalFencerLink } from './fencingtracker.js';
import { defaultPlanName, mealsFromPlan, planSummary, snapshotPlan, validatePlanName } from './mealplans.js';
import {
  MAX_STEPS,
  SECTION_TYPES,
  cleanStepsByType,
  cleanStepsBySession,
  keepStepsFor,
  migrateStepsToSessions,
  cleanTicks,
  doneAfterTick,
  finishedSession,
  keepTicksFor,
  renameTick,
  removeStep,
  saveStep,
  sessionProgress,
  stepKey,
  stepsDone,
  ticksForDone,
  toggleStep,
  validateStep,
} from './sessionsteps.js';
import { archivedGoals, boardGoals, canArchive, dueStatus, isUrgent, matchesTag, normalizeCardSize, sortGoals, stepFromPosition, tapStep, validateGoal, visibleGoals } from './goals.js';
import { renderFocusStrip } from './focus-strip.js';
import { planAsSheet, planAsText, planDays } from './mealexport.js';
import { DEFAULT_REMINDERS, dueMeals, mealReminderText, normalizeReminders, normalizeSent, waterDue, waterReminderText } from './reminders.js';
import { crc32, sheetToXlsx, zipStored } from './xlsx.js';
import { entriesOn, entryForSession, entryParts, feelingOf, freeSlots, latestFocus, matchesFeeling, normalizeEntries, normalizeSort, placeInCustomOrder, sortEntries, validateEntry } from './journal.js';
import { isStrayClick } from './confirm.js';
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
  MEAL_SLOTS,
  mealTemplate,
  mealsOn,
  mergeIntoHistory,
  moveMeal,
  parseGrams,
  parseKcal,
  placeMeal,
  removeFromHistory,
  searchHistory,
  allPrepped,
  reachedWaterGoal,
  tapGlass,
  upcomingMeals,
} from './meals.js';
import {
  cleanSessions,
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
  SESSION_TYPES,
  scrollAfterZoom,
  shiftAnchor,
  validateRepeat,
  visibleDays,
  weekStats,
} from './schedule.js';

import { RATING_LADDER, currentRating, earnGoalName, isRatingGoalName, parseRating, ratingGoalConflict, ratingLabel, ratingTargets } from './rating.js';
import { mealWhen, todayItems, todayLine, weekLine } from './today.js';
import { checkVideoFile, MAX_VIDEO_BYTES, normalizeVideo, parseYouTubeLink, videoLabel } from './stepvideo.js';
import { cleanDraft, cleanProfileList, newProfileId, profileSummary, startingData, validateNewProfile } from './profiles.js';

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

test('allPrepped is true only for a day that has meals and all are prepped', () => {
  equal(allPrepped({ count: 3, prepped: 3 }), true);
  equal(allPrepped({ count: 3, prepped: 2 }), false);
  equal(allPrepped({ count: 0, prepped: 0 }), false);
});

test('reachedWaterGoal is true only on the release that completes the day', () => {
  equal(reachedWaterGoal(7, 8, 8), true);
  equal(reachedWaterGoal(2, 8, 8), true);
  equal(reachedWaterGoal(8, 8, 8), false);
  equal(reachedWaterGoal(8, 7, 8), false);
  equal(reachedWaterGoal(3, 5, 8), false);
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

test('validateEntry needs a known feeling and at least one filled-in box, within the length limits', () => {
  equal(validateEntry({ feeling: 'sharp', text: 'Good day' }), null);
  equal(validateEntry({ feeling: 'sharp', wentWell: 'Lunges', text: '' }), null);
  equal(validateEntry({ feeling: 'sharp', focus: 'Relax my arm' }), null);
  equal(validateEntry({ feeling: '', text: 'Good day' }) !== null, true);
  equal(validateEntry({ feeling: 'happy', text: 'Good day' }) !== null, true);
  equal(validateEntry({ feeling: 'sharp', wentWell: '  ', workOn: '', focus: '', text: '   ' }) !== null, true);
  equal(validateEntry({ feeling: 'sharp', text: 'x'.repeat(2001) }) !== null, true);
  equal(validateEntry({ feeling: 'sharp', wentWell: 'x'.repeat(301) }) !== null, true);
});

test('entryParts lists the filled-in boxes in form order, and old entries show as notes', () => {
  equal(entryParts({ feeling: 'sharp', text: 'Old entry' }), [{ label: 'Notes', text: 'Old entry' }]);
  equal(entryParts({ feeling: 'tired', workOn: ' Timing ', wentWell: 'Lunges', text: '' }),
    [{ label: 'What went well', text: 'Lunges' }, { label: 'What to work on', text: 'Timing' }]);
});

test('latestFocus is the next-session focus of the most recent entry that has one', () => {
  equal(latestFocus({}), null);
  equal(latestFocus({ '2026-10-01': { feeling: 'sharp', text: 'x' } }), null);
  equal(latestFocus({
    '2026-10-01': { feeling: 'sharp', focus: 'Old focus' },
    '2026-10-05': { feeling: 'tired', focus: '  Relax my arm ' },
    '2026-10-09': { feeling: 'steady', text: 'No focus written' },
  }), { id: '2026-10-05', date: '2026-10-05', focus: 'Relax my arm' });
});

test('several entries on one day: the later written one has the latest focus', () => {
  const found = latestFocus({
    a: { id: 'a', date: '2026-10-05', feeling: 'tired', focus: 'Morning focus', createdAt: '2026-10-05T09:00:00Z' },
    b: { id: 'b', date: '2026-10-05', feeling: 'sharp', focus: 'Evening focus', createdAt: '2026-10-05T20:00:00Z' },
  });
  equal(found, { id: 'b', date: '2026-10-05', focus: 'Evening focus' });
});

test('normalizeEntries gives older date-keyed entries an id and a date, and drops what is not an entry', () => {
  const clean = normalizeEntries({ '2026-10-05': { feeling: 'sharp' }, x1: { id: 'x1', date: '2026-10-06', feeling: 'tired' }, bad: 'oops' });
  equal(clean['2026-10-05'], { feeling: 'sharp', id: '2026-10-05', date: '2026-10-05', video: null, videoNotes: [] });
  equal(clean.x1.date, '2026-10-06');
  equal(clean.bad, undefined);
  equal(normalizeEntries(null), {});
});

test('a day can hold one entry for each session plus one general entry', () => {
  const entries = {
    a: { id: 'a', date: '2026-10-05', sessionId: 's1', feeling: 'sharp', createdAt: '2026-10-05T10:00:00Z' },
    b: { id: 'b', date: '2026-10-05', sessionId: '', feeling: 'tired', createdAt: '2026-10-05T09:00:00Z' },
    c: { id: 'c', date: '2026-10-06', sessionId: 's9', feeling: 'steady', createdAt: '2026-10-06T10:00:00Z' },
  };
  equal(entriesOn(entries, '2026-10-05').map((entry) => entry.id), ['b', 'a']);
  equal(entryForSession(entries, '2026-10-05', 's1').id, 'a');
  equal(entryForSession(entries, '2026-10-05', '').id, 'b');
  equal(entryForSession(entries, '2026-10-05', 's2'), null);
  const sessions = [{ id: 's1' }, { id: 's2' }];
  equal(freeSlots(entries, '2026-10-05', sessions), { sessions: [{ id: 's2' }], general: false });
  equal(freeSlots(entries, '2026-10-05', sessions, 'a'), { sessions: [{ id: 's1' }, { id: 's2' }], general: false });
  equal(freeSlots(entries, '2026-10-07', sessions), { sessions, general: true });
});

test('the focus strip shows the latest focus, hides when there is none, and has an Open Journal button only when asked', () => {
  const strip = document.createElement('div');
  renderFocusStrip(strip, {});
  equal(strip.hidden, true);

  const entries = { '2026-10-05': { feeling: 'tired', focus: 'Relax my arm' }, '2026-10-01': { feeling: 'sharp', focus: 'Old focus' } };
  renderFocusStrip(strip, entries);
  equal(strip.hidden, false);
  equal(strip.textContent.includes('Relax my arm'), true);
  equal(strip.textContent.includes('Old focus'), false);
  equal(strip.querySelector('button'), null);

  let opened = 0;
  renderFocusStrip(strip, entries, { openJournal: () => { opened += 1; } });
  const button = strip.querySelector('button');
  equal(button.textContent, 'Open Journal');
  button.click();
  equal(opened, 1);
});

// ---------- exporting the meal plan ----------
const exportMeal = (id, day, name, extra = {}) => ({ id, day, name, desc: '', time: '', kcal: null, protein: null, carb: null, fat: null, prepped: false, ...extra });

test('planDays lists Monday to Sunday with each day\'s meals in order, including empty days', () => {
  const days = planDays([
    exportMeal('a', 0, 'Sunday brunch'),
    exportMeal('b', 1, 'Dinner', { time: '18:30' }),
    exportMeal('c', 1, 'Breakfast', { time: '07:00' }),
  ]);
  equal(days.map((day) => day.name), ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
  equal(days[0].meals.map((meal) => meal.name), ['Breakfast', 'Dinner']);
  equal(days[1].meals, []);
  equal(days[6].meals.map((meal) => meal.name), ['Sunday brunch']);
});

test('planAsText writes each day with its meals, time, contents, calories and macros, and says so for an empty day', () => {
  const text = planAsText('My plan', [
    exportMeal('a', 1, 'Breakfast', { time: '07:00', desc: 'Oats and banana', kcal: 450, protein: 20, carb: 70, fat: 10 }),
    exportMeal('b', 1, 'Snack', { kcal: 150 }),
  ]);
  const lines = text.split('\n');
  equal(lines[0], 'My plan');
  equal(text.includes('Monday'), true);
  equal(text.includes('Breakfast, 7:00 AM'), true);
  equal(text.includes('Oats and banana'), true);
  equal(text.includes('450 kcal'), true);
  equal(text.includes('protein 20 g'), true);
  equal(text.includes('Day total: 600 kcal'), true);
  equal(text.includes('Tuesday\n  No meals planned'), true);
});

// A sheet cell's text or number, for comparing whole rows.
const sheetValues = (sheet) => sheet.rows.map((row) => row.map((cell) => (cell === null ? '' : cell.value)));

test('planAsSheet has a bold header and one row per meal, in week order, with blanks for missing numbers', () => {
  const sheet = planAsSheet([
    exportMeal('a', 2, 'Lunch', { desc: 'Rice, chicken', kcal: 600 }),
    exportMeal('b', 1, 'Breakfast', { time: '07:00' }),
  ]);
  equal(sheetValues(sheet), [
    ['Day', 'Meal', 'Time', "What's in it", 'Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)'],
    ['Monday', 'Breakfast', '7:00 AM', '', '', '', '', ''],
    ['Tuesday', 'Lunch', '', 'Rice, chicken', 600, '', '', ''],
  ]);
  equal(sheet.rows[0].every((cell) => cell.bold), true);
  equal(sheet.rows[1][1].bold, false);
  equal(sheet.rows[2][4].value, 600);
});

test('planAsSheet merges a day\'s cells down its meals, and leaves a day with one meal alone', () => {
  const sheet = planAsSheet([
    exportMeal('a', 1, 'Breakfast', { time: '07:00' }),
    exportMeal('b', 1, 'Lunch', { time: '12:00' }),
    exportMeal('c', 1, 'Dinner', { time: '18:30' }),
    exportMeal('d', 3, 'Snack'),
  ]);
  equal(sheetValues(sheet).slice(1).map((row) => row.slice(0, 2).join('|')),
    ['Monday|Breakfast', '|Lunch', '|Dinner', 'Wednesday|Snack']);
  equal(sheet.merges, ['A2:A4']);
  equal(sheet.rows[1][0].bold, true);
});

test('the daily macro targets and the water goal are added to the text and the spreadsheet only when asked for', () => {
  const meals = [exportMeal('a', 1, 'Breakfast')];
  const extras = { targets: { protein: 150, carb: 250, fat: 70 }, glassGoal: 8 };
  const plain = planAsText('Plan', meals);
  equal(plain.includes('Daily macro targets'), false);
  equal(plain.includes('Water'), false);

  const text = planAsText('Plan', meals, extras);
  equal(text.includes('Daily macro targets: protein 150 g, carbs 250 g, fat 70 g (about 2230 kcal)'), true);
  equal(text.includes('Water: 8 glasses a day'), true);

  const only = planAsText('Plan', meals, { glassGoal: 6 });
  equal(only.includes('Water: 6 glasses a day'), true);
  equal(only.includes('Daily macro targets'), false);

  // A small separate table of daily targets comes first (bold headings), then a blank row, then the meals.
  const sheet = planAsSheet(meals, extras);
  equal(sheetValues(sheet).slice(0, 4), [
    ['Daily targets', 'Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)', 'Water (glasses)'],
    ['Every day', 2230, 150, 250, 70, 8],
    [],
    ['Day', 'Meal', 'Time', "What's in it", 'Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)'],
  ]);
  equal(sheet.rows[0].every((cell) => cell.bold), true);
  equal(sheet.rows[1][0].bold, true);
  equal(sheet.rows.length, 5);
  equal(sheetValues(planAsSheet(meals, { glassGoal: 6 })).slice(0, 2), [['Daily targets', 'Water (glasses)'], ['Every day', 6]]);
  equal(sheetValues(planAsSheet(meals, { targets: { protein: 100, carb: null, fat: null } })).slice(0, 2),
    [['Daily targets', 'Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)'], ['Every day', 400, 100, '', '']]);
  equal(planAsSheet(meals).rows.length, 2);
});

test('crc32 matches the standard check value', () => {
  equal(crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
  equal(crc32(new Uint8Array(0)), 0);
});

test('zipStored makes a zip with every file named and stored as given', () => {
  const zip = zipStored([{ name: 'a.txt', text: 'hello' }, { name: 'dir/b.xml', text: '<x/>' }]);
  const view = new DataView(zip.buffer);
  equal(view.getUint32(0, true), 0x04034b50);
  const text = new TextDecoder().decode(zip);
  equal(text.includes('a.txt') && text.includes('dir/b.xml') && text.includes('hello'), true);
  // The last 22 bytes are the end record, which says how many files there are.
  equal(view.getUint16(zip.length - 22 + 10, true), 2);
});

test('sheetToXlsx writes a workbook with bold styles, the text of the cells and the merged ranges', () => {
  const bytes = sheetToXlsx(planAsSheet([exportMeal('a', 1, 'Breakfast & oats'), exportMeal('b', 1, 'Lunch')]));
  const text = new TextDecoder().decode(bytes);
  equal(text.includes('xl/worksheets/sheet1.xml'), true);
  equal(text.includes('<b/>'), true);
  equal(text.includes('Breakfast &amp; oats'), true);
  equal(text.includes('<mergeCell ref="A2:A3"/>'), true);
});

// ---------- reminders ----------
// 2026-11-03 is a Tuesday (day 2).
const at = (hours, minutes = 0) => new Date(2026, 10, 3, hours, minutes);
const onSettings = { ...DEFAULT_REMINDERS, meals: true, water: true };
const noneSent = { date: '2026-11-03', keys: [], waterAt: 0 };

test('normalizeReminders starts everything off and fixes anything unusable', () => {
  equal(normalizeReminders({}), DEFAULT_REMINDERS);
  equal(DEFAULT_REMINDERS.meals, false);
  equal(DEFAULT_REMINDERS.water, false);
  const fixed = normalizeReminders({ meals: 'yes', water: true, leadMinutes: 9999, waterEveryHours: 0, waterFrom: 'noon', waterTo: '07:00' });
  equal(fixed.meals, false);
  equal(fixed.water, true);
  equal(fixed.leadMinutes, DEFAULT_REMINDERS.leadMinutes);
  equal(fixed.waterEveryHours, DEFAULT_REMINDERS.waterEveryHours);
  equal([fixed.waterFrom, fixed.waterTo], [DEFAULT_REMINDERS.waterFrom, DEFAULT_REMINDERS.waterTo]);
  equal(normalizeReminders({ leadMinutes: 30, waterEveryHours: 3, waterFrom: '09:00', waterTo: '21:30' }).waterTo, '21:30');
  equal(normalizeReminders(null), DEFAULT_REMINDERS);
});

test('a meal reminder is due from the lead time until the meal time, today only, and only once', () => {
  const lunch = exportMeal('l', 2, 'Lunch', { time: '12:30', desc: 'Chicken and rice' });
  equal(dueMeals([lunch], at(12, 14), onSettings, noneSent), []);
  equal(dueMeals([lunch], at(12, 15), onSettings, noneSent).map((due) => due.meal.name), ['Lunch']);
  equal(dueMeals([lunch], at(12, 30), onSettings, noneSent).length, 1);
  equal(dueMeals([lunch], at(12, 31), onSettings, noneSent), []);
  equal(dueMeals([lunch], at(12, 20), onSettings, noneSent)[0].minutesAway, 10);
  const key = dueMeals([lunch], at(12, 20), onSettings, noneSent)[0].key;
  equal(dueMeals([lunch], at(12, 25), onSettings, { ...noneSent, keys: [key] }), []);
});

test('no meal reminder for a prepped meal, another day, or when meal reminders are off, and meals without a time use the typical time', () => {
  const lunch = exportMeal('l', 2, 'Lunch', { time: '12:30' });
  equal(dueMeals([{ ...lunch, prepped: true }], at(12, 20), onSettings, noneSent), []);
  equal(dueMeals([{ ...lunch, day: 3 }], at(12, 20), onSettings, noneSent), []);
  equal(dueMeals([lunch], at(12, 20), { ...onSettings, meals: false }, noneSent), []);
  equal(dueMeals([exportMeal('x', 2, 'Snack')], at(12, 20), onSettings, noneSent), []);
  equal(dueMeals([exportMeal('d', 2, 'Dinner')], at(18, 20), onSettings, noneSent).length, 1);
  equal(dueMeals([lunch], at(12, 20), { ...onSettings, leadMinutes: 5 }, noneSent), []);
});

test('a water reminder is due inside the chosen hours, below the goal, and after the gap since the last one', () => {
  const status = { glasses: 3, goal: 8 };
  equal(waterDue(at(10), onSettings, status, noneSent), true);
  equal(waterDue(at(7, 59), onSettings, status, noneSent), false);
  equal(waterDue(at(20), onSettings, status, noneSent), false);
  equal(waterDue(at(10), onSettings, { glasses: 8, goal: 8 }, noneSent), false);
  equal(waterDue(at(10), { ...onSettings, water: false }, status, noneSent), false);
  const lastAt = at(10).getTime();
  equal(waterDue(at(11, 59), onSettings, status, { ...noneSent, waterAt: lastAt }), false);
  equal(waterDue(at(12), onSettings, status, { ...noneSent, waterAt: lastAt }), true);
});

test('normalizeSent keeps today\'s record and starts fresh on a new day', () => {
  const saved = { date: '2026-11-03', keys: ['a'], waterAt: 5 };
  equal(normalizeSent(saved, '2026-11-03'), saved);
  equal(normalizeSent(saved, '2026-11-04'), { date: '2026-11-04', keys: [], waterAt: 0 });
  equal(normalizeSent(null, '2026-11-04'), { date: '2026-11-04', keys: [], waterAt: 0 });
});

test('reminder text names the meal and how soon it is, and the glasses so far', () => {
  equal(mealReminderText({ meal: exportMeal('l', 2, 'Lunch', { desc: 'Chicken and rice' }), minutesAway: 15 }), 'Lunch in 15 min: Chicken and rice');
  equal(mealReminderText({ meal: exportMeal('l', 2, 'Lunch'), minutesAway: 0 }), 'Lunch is now');
  equal(waterReminderText({ glasses: 3, goal: 8 }), 'Time for a glass of water (3 of 8 today)');
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

test('visibleGoals keeps only the chosen tags, in order, finished goals last', () => {
  const all = [goal('a', { tag: 'fitness', progress: 100 }), goal('b', { tag: 'fitness', progress: 40 }),
    goal('c', { tag: 'tactics', progress: 100 })];
  equal(visibleGoals(all, new Set()).map((g) => g.id), ['b', 'a', 'c']);
  equal(visibleGoals(all, new Set(['tactics'])).map((g) => g.id), ['c']);
  equal(visibleGoals(all, new Set(['technique'])), []);
});
test('only finished, unarchived goals can be archived', () => {
  equal(canArchive(goal('a', { progress: 100 })), true);
  equal(canArchive(goal('a', { progress: 80 })), false);
  equal(canArchive(goal('a', { progress: 100, archived: true })), false);
});

test('archived goals leave the board and list newest archive first', () => {
  const all = [goal('a', { progress: 100, archived: true, archivedOn: '2026-10-01' }), goal('b'),
    goal('c', { progress: 100, archived: true, archivedOn: '2026-10-20' }), goal('d', { progress: 100, archived: true })];
  equal(boardGoals(all).map((g) => g.id), ['b']);
  equal(archivedGoals(all).map((g) => g.id), ['c', 'a', 'd']);
  equal(archivedGoals([goal('x')]), []);
});

const full = (id, date, extra = {}) => ({ id, date, type: 'bout', time: '18:00', mins: 75, location: 'Strip 3', notes: '', done: false, ...extra });
const details = { type: 'bout', time: '18:00', mins: 75, location: 'Strip 3', notes: '' };

test('a saved card size is Small, Medium or Large; the old slider pixels map to the nearest, and anything else is Medium', () => {
  equal(normalizeCardSize('large'), 'large');
  equal(normalizeCardSize(150), 'small');
  equal(normalizeCardSize(250), 'medium');
  equal(normalizeCardSize(420), 'large');
  equal(normalizeCardSize('huge'), 'medium');
  equal(normalizeCardSize(undefined), 'medium');
  equal(normalizeCardSize(NaN), 'medium');
});

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
test('scrollAfterZoom keeps the time under the pinch point in the same place', () => {
  // 3 hours down in 50px hours, pinching 100px below a 40px header: zooming to 100px hours.
  const before = { scrollTop: 90, focal: 100, header: 40, oldPx: 50, newPx: 100 };
  const after = scrollAfterZoom(before.scrollTop, before.focal, before.header, before.oldPx, before.newPx);
  const hourUnderBefore = (before.scrollTop + before.focal - before.header) / before.oldPx;
  const hourUnderAfter = (after + before.focal - before.header) / before.newPx;
  equal(hourUnderAfter, hourUnderBefore);
  equal(scrollAfterZoom(0, 40, 40, 50, 100), 0);
});

test('session types are listed in the order Jenna wants, with Other last', () => {
  equal(Object.keys(SESSION_TYPES), ['footwork', 'blade', 'bout', 'strength', 'rest', 'tournament', 'other']);
});

test('every session type, including Tournament, has a full and a short name', () => {
  equal(Object.keys(SESSION_TYPES).includes('tournament'), true);
  for (const info of Object.values(SESSION_TYPES)) {
    equal(typeof info.label === 'string' && info.label !== '', true);
    equal(typeof info.short === 'string' && info.short !== '', true);
  }
});

test('normalizeFont keeps the three choices and falls back to sans-serif', () => {
  equal(FONT_CHOICES, ['serif', 'sans', 'mono']);
  equal(normalizeFont('serif'), 'serif');
  equal(normalizeFont('mono'), 'mono');
  equal(normalizeFont('comic'), 'sans');
  equal(normalizeFont(null), 'sans');
});

test('normalizeAccent keeps the five colors and falls back to sage', () => {
  equal(ACCENT_CHOICES, ['sage', 'ocean', 'lavender', 'rose', 'sand']);
  equal(normalizeAccent('rose'), 'rose');
  equal(normalizeAccent('neon'), 'sage');
  equal(normalizeAccent(null), 'sage');
});

test('timestamps read as minutes:seconds and come back out the same way', () => {
  equal(parseTimestamp('1:32'), 92);
  equal(parseTimestamp(' 90 '), 90);
  equal(parseTimestamp('1:02:05'), 3725);
  equal(parseTimestamp('1:75'), null);
  equal(parseTimestamp('abc'), null);
  equal(parseTimestamp(''), null);
  equal(formatTimestamp(92), '1:32');
  equal(formatTimestamp(5), '0:05');
  equal(formatTimestamp(3725), '1:02:05');
  equal(formatTimestamp(-4), '0:00');
});

test('a video note needs a time like 1:32 and some text within the limit', () => {
  equal(validateVideoNote({ time: '1:32', text: '  rushed my lunge ' }), { value: { time: 92, text: 'rushed my lunge' } });
  equal(typeof validateVideoNote({ time: 'soon', text: 'x' }).error, 'string');
  equal(typeof validateVideoNote({ time: '0:10', text: '   ' }).error, 'string');
  equal(typeof validateVideoNote({ time: '0:10', text: 'x'.repeat(201) }).error, 'string');
});

test('video notes stay in video order, can be removed, and are capped at 40', () => {
  let notes = addVideoNote([], { time: '2:00', text: 'second' }).notes;
  notes = addVideoNote(notes, { time: '0:30', text: 'first' }).notes;
  equal(notes.map((note) => note.text), ['first', 'second']);
  equal(removeVideoNote(notes, 0).map((note) => note.text), ['second']);
  const full = Array.from({ length: 40 }, (unused, index) => ({ time: index, text: 'n' }));
  equal(typeof addVideoNote(full, { time: '5:00', text: 'one more' }).error, 'string');
});

test('cleanVideoNotes drops damaged notes and sorts the rest', () => {
  equal(cleanVideoNotes('nope'), []);
  equal(cleanVideoNotes([{ time: 50, text: 'b' }, { time: 'x', text: 'bad' }, { time: 10, text: 'a' }, { time: 5, text: '  ' }]),
    [{ time: 10, text: 'a' }, { time: 50, text: 'b' }]);
});

// ---------- saved routines (a session type's steps, saved under a name) ----------
const routineSteps = [{ name: 'Lunge chain', desc: '6 reps' }, { name: 'Advance-retreat', desc: '' }];
const youtube = { kind: 'youtube', id: 'dQw4w9WgXcQ' };
const upload = { kind: 'file', id: 'abc-1', name: 'clip.mp4' };

test('a saved routine keeps the steps in order and any YouTube video, but not uploaded video files', () => {
  const saved = snapshotRoutine([{ ...routineSteps[0], video: youtube }, { ...routineSteps[1], video: upload }], '  Tuesday footwork ', '2026-11-05T10:00:00Z', () => 'r1');
  equal(saved.id, 'r1');
  equal(saved.name, 'Tuesday footwork');
  equal(saved.steps, [{ name: 'Lunge chain', desc: '6 reps', video: youtube }, { name: 'Advance-retreat', desc: '' }]);
  equal(saved.droppedVideos, 1);
});

test('routine names are needed, short, and unique within a session type', () => {
  const existing = [{ name: 'Warm-up focus' }];
  equal(validateRoutineName('Heavy day', existing), null);
  equal(typeof validateRoutineName('   ', existing), 'string');
  equal(typeof validateRoutineName('x'.repeat(61), existing), 'string');
  equal(typeof validateRoutineName('warm-up FOCUS', existing), 'string');
  const many = Array.from({ length: MAX_SAVED_ROUTINES }, (unused, index) => ({ name: 'R' + index }));
  equal(typeof validateRoutineName('One more', many), 'string');
});

test('the suggested routine name uses the session name and avoids names already taken', () => {
  equal(defaultRoutineName('Footwork', []), 'Footwork routine');
  equal(defaultRoutineName('Footwork', [{ name: 'Footwork routine' }, { name: 'Footwork routine (2)' }]), 'Footwork routine (3)');
});

test('routineSummary counts the steps', () => {
  equal(routineSummary({ steps: routineSteps }), '2 steps');
  equal(routineSummary({ steps: [routineSteps[0]] }), '1 step');
});

test('cleanSavedRoutines keeps a list for every section type and drops damaged routines', () => {
  const clean = cleanSavedRoutines({
    footwork: [{ id: 'a', name: 'Good', savedAt: 'x', steps: routineSteps }, { id: 'b', name: '', steps: routineSteps }, { name: 'No id', steps: routineSteps }, 'junk'],
    rest: [{ id: 'c', name: 'Rest steps', steps: routineSteps }],
    blade: 'oops',
  });
  equal(clean.footwork.map((routine) => routine.name), ['Good']);
  equal(clean.blade, []);
  equal(clean.rest, undefined);
  equal(cleanSavedRoutines(null).bout, []);
});

test('parseOptionalFencerLink lets the box be empty (no link) but still checks anything typed', () => {
  equal(parseOptionalFencerLink('   '), { url: '' });
  equal(parseOptionalFencerLink('fencingtracker.com/p/123456/Jane-Doe').url, 'https://fencingtracker.com/p/123456/Jane-Doe');
  equal(typeof parseOptionalFencerLink('https://example.com').error, 'string');
});

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

// ---------- session steps (the Routines screen) ----------
const row = (name, desc = '') => ({ name, desc });
const stepList = (...names) => names.map((name) => row(name));

test('the Routines sections are the session types, in the order of the calendar filters, without Rest and Tournament (neither has steps)', () => {
  equal(SECTION_TYPES, ['footwork', 'blade', 'bout', 'strength', 'other']);
});

test('cleanStepsByType gives every type a list and drops steps that cannot be used', () => {
  const clean = cleanStepsByType({ bout: [row('Good'), row('   '), { name: 'x'.repeat(101) }, 'Text — step', null], strength: 'oops' });
  equal(clean.bout, [row('Good'), row('Text', 'step')]);
  equal(clean.strength, []);
  equal(Object.keys(clean), SECTION_TYPES);
  equal(cleanStepsByType(null).footwork, []);
  equal(cleanStepsByType({ other: Array.from({ length: 40 }, (_, i) => row('Step ' + i)) }).other.length, MAX_STEPS);
  equal(cleanStepsByType({ rest: [row('Stretch')], tournament: [row('Warm up')] }).rest, undefined);
  equal(cleanStepsByType({ tournament: [row('Warm up')] }).tournament, undefined);
});

test('every session has its own steps: the old shared steps go to sessions up to today, later ones start empty', () => {
  const sessions = [
    { id: 'a', type: 'footwork', date: '2026-11-03' },
    { id: 'b', type: 'footwork', date: '2026-11-05' },
    { id: 'c', type: 'footwork', date: '2026-11-09' },
    { id: 'd', type: 'rest', date: '2026-11-03' },
    { id: 'e', type: 'bout', date: '2026-11-03' },
  ];
  const moved = migrateStepsToSessions({ footwork: [row('Lunge')], rest: [row('Stretch')] }, sessions, '2026-11-05');
  equal(Object.keys(moved), ['a', 'b']);
  equal(moved.a.steps, [row('Lunge')]);
});

test('cleanStepsBySession keeps usable steps and the saved routine link, and drops empty or damaged records', () => {
  const clean = cleanStepsBySession({
    a: { steps: [row('Lunge'), row('  ')], routineId: 'r1' },
    b: { steps: [] },
    c: 'junk',
    d: { steps: [row('Parry')] },
  });
  equal(clean, { a: { steps: [row('Lunge')], routineId: 'r1' }, d: { steps: [row('Parry')] } });
  equal(cleanStepsBySession(null), {});
});

test('keepStepsFor keeps the steps of sessions still on the Schedule and reports the rest', () => {
  const result = keepStepsFor({ a: { steps: [row('A')] }, b: { steps: [row('B')] } }, [{ id: 'a' }]);
  equal(Object.keys(result.kept), ['a']);
  equal(result.removed, [{ steps: [row('B')] }]);
});

test('a saved routine can say whether it has a step, and be copied without one', () => {
  const routine = { id: 'r', name: 'R', steps: [row('Lunge', '6 reps'), row('Parry')] };
  equal(routineHasStep(routine, row('Lunge', '6 reps')), true);
  equal(routineHasStep(routine, row('Lunge', 'other')), false);
  equal(routineWithoutStep(routine, row('Lunge', '6 reps')).steps, [row('Parry')]);
  equal(routine.steps.length, 2);
});

test('a new visitor can load starter routines for Footwork and Bladework, and nothing else', () => {
  const starters = starterRoutines(() => 'id', '2026-11-05T00:00:00Z');
  equal(starters.footwork[0].name, 'Starter footwork');
  equal(starters.footwork[0].steps.length, 4);
  equal(starters.blade[0].name, 'Starter bladework');
  equal(starters.bout, []);
});

test('validateStep trims, needs a name, and limits the lengths', () => {
  equal(validateStep({ name: ' Lunge ', desc: ' 10 reps ' }), { value: row('Lunge', '10 reps') });
  equal(validateStep({ name: '', desc: 'oops' }).error, 'Give the step a name.');
  equal(validateStep({ name: 'x'.repeat(101), desc: '' }).error !== undefined, true);
  equal(validateStep({ name: 'Fine', desc: 'x'.repeat(201) }).error !== undefined, true);
});

test('saveStep adds to the end, replaces one in place, and refuses a duplicate or too many', () => {
  const steps = stepList('A', 'B');
  equal(saveStep(steps, row(' C '), -1).steps, stepList('A', 'B', 'C'));
  equal(saveStep(steps, row('Z', 'new'), 0).steps, [row('Z', 'new'), row('B')]);
  equal(saveStep(steps, row('A'), 1).error, 'That step is already in the list.');
  equal(saveStep(steps, row('B'), 1).steps, steps);
  equal(saveStep(steps, row(''), -1).error, 'Give the step a name.');
  equal(saveStep(Array.from({ length: MAX_STEPS }, (_, i) => row('S' + i)), row('One more'), -1).error !== undefined, true);
  equal(steps, stepList('A', 'B'));
});

test('removeStep drops one step and keeps the order of the rest', () => {
  equal(removeStep(stepList('A', 'B', 'C'), 1), stepList('A', 'C'));
});

test('ticks are kept for each session as step keys, so an edited step loses its tick', () => {
  const steps = stepList('A', 'B', 'C');
  equal(stepsDone(steps, []), [false, false, false]);
  const ticked = toggleStep(toggleStep([], steps[1]), steps[2]);
  equal(stepsDone(steps, ticked), [false, true, true]);
  equal(sessionProgress(steps, ticked), { done: 2, total: 3, fraction: 2 / 3 });
  equal(stepsDone(steps, toggleStep(ticked, steps[1])), [false, false, true]);
  equal(stepsDone([row('A'), row('B changed'), row('C')], ticked), [false, false, true]);
  equal(sessionProgress([], []), { done: 0, total: 0, fraction: 0 });
  equal(stepKey(row('A', 'x')) === stepKey(row('A')), false);
});

test('finishedSession is true only for the tick that completes every step', () => {
  equal(finishedSession({ done: 2, total: 3 }, { done: 3, total: 3 }), true);
  equal(finishedSession({ done: 1, total: 3 }, { done: 2, total: 3 }), false);
  equal(finishedSession({ done: 3, total: 3 }, { done: 2, total: 3 }), false);
  equal(finishedSession({ done: 0, total: 0 }, { done: 0, total: 0 }), false);
});

test('keepTicksFor forgets the ticks of sessions that were deleted from the Schedule', () => {
  equal(keepTicksFor({ a: ['x'], b: ['y'] }, [{ id: 'b' }, { id: 'c' }]), { b: ['y'] });
  equal(keepTicksFor({}, []), {});
});

test('the meal kinds are Breakfast, Lunch, Pre-training, Dinner and Snack', () => {
  equal(MEAL_SLOTS, ['Breakfast', 'Lunch', 'Pre-training', 'Dinner', 'Snack']);
});

test('Pre-training without a time sits between Lunch and Dinner', () => {
  const all = [meal('s', 1, 'Snack'), meal('d', 1, 'Dinner'), meal('p', 1, 'Pre-training'), meal('l', 1, 'Lunch'), meal('b', 1, 'Breakfast')];
  equal(mealsOn(all, 1).map((m) => m.name), ['Breakfast', 'Lunch', 'Pre-training', 'Dinner', 'Snack']);
});

// ---------- saved weekly meal plans ----------
const planOf = (name, meals = []) => ({ id: name, name, savedAt: '2026-10-19T12:00:00.000Z', meals });

test('defaultPlanName uses the Monday of this week and avoids names already taken', () => {
  equal(defaultPlanName(new Date(2026, 9, 21), []), 'Week of Oct 19');
  equal(defaultPlanName(new Date(2026, 9, 19), []), 'Week of Oct 19');
  equal(defaultPlanName(new Date(2026, 9, 25), []), 'Week of Oct 19');
  equal(defaultPlanName(new Date(2026, 9, 26), []), 'Week of Oct 26');
  equal(defaultPlanName(new Date(2026, 9, 21), [planOf('Week of Oct 19')]), 'Week of Oct 19 (2)');
  equal(defaultPlanName(new Date(2026, 9, 21), [planOf('week of oct 19'), planOf('Week of Oct 19 (2)')]), 'Week of Oct 19 (3)');
  equal(defaultPlanName(new Date(2026, 10, 2), []), 'Week of Nov 2');
});

test('validatePlanName needs a new name of a sensible length', () => {
  equal(validatePlanName('Cutting week', []), null);
  equal(validatePlanName('  ', []) !== null, true);
  equal(validatePlanName('x'.repeat(61), []) !== null, true);
  equal(validatePlanName('cutting WEEK', [planOf('Cutting week')]) !== null, true);
  equal(validatePlanName('New', Array.from({ length: 30 }, (_, i) => planOf('Plan ' + i))) !== null, true);
});

test('snapshotPlan keeps every meal and day order but unticks prepped and drops ids', () => {
  const all = [meal('a', 1, 'Breakfast', { desc: 'oats', time: '07:00', kcal: 500, prepped: true, rank: 10, groupId: 'g' }), meal('b', 3, 'Lunch', { prepped: true })];
  const plan = snapshotPlan(all, '  Plan A  ', '2026-10-19T12:00:00.000Z', () => 'p1');
  equal(plan.name, 'Plan A');
  equal(plan.id, 'p1');
  equal(plan.meals.map((m) => m.prepped), [false, false]);
  equal(plan.meals[0], { name: 'Breakfast', desc: 'oats', time: '07:00', kcal: 500, protein: null, carb: null, fat: null, day: 1, prepped: false, rank: 10, groupId: 'g' });
  equal(plan.meals[1].id, undefined);
  equal(all[0].prepped, true);
});

test('mealsFromPlan gives every meal a new id and leaves them unprepped', () => {
  let n = 0;
  const plan = snapshotPlan([meal('a', 1, 'Breakfast'), meal('b', 2, 'Lunch')], 'P', 'x', () => 'p');
  const loaded = mealsFromPlan(plan, () => 'id' + ++n);
  equal(loaded.map((m) => [m.id, m.name, m.day, m.prepped]), [['id1', 'Breakfast', 1, false], ['id2', 'Lunch', 2, false]]);
});

test('planSummary counts meals and days', () => {
  equal(planSummary(planOf('P', [meal('a', 1, 'A'), meal('b', 1, 'B'), meal('c', 3, 'C')])), '3 meals on 2 days');
  equal(planSummary(planOf('P', [meal('a', 1, 'A')])), '1 meal on 1 day');
});

// ---------- profiles ----------
const welcomeForm = (extra = {}) => ({ name: ' Ana ', weapon: 'Epee', ...extra });

test('a new profile needs only a name and a weapon', () => {
  const result = validateNewProfile(welcomeForm());
  equal(result.profile.name, 'Ana');
  equal(result.profile.weapon, 'Epee');
  equal([result.profile.club, result.profile.rating, result.profile.trackerLink], ['', '', '']);
  equal([result.profile.theme, result.profile.font], ['auto', 'sans']);
});

test('a new profile without a name or a weapon is refused', () => {
  equal(validateNewProfile(welcomeForm({ name: '   ' })).error, 'Please enter your name.');
  equal(validateNewProfile(welcomeForm({ weapon: '' })).error, 'Please choose your weapon.');
});

test('a new profile refuses a link that is not a FencingTracker profile', () => {
  equal(typeof validateNewProfile(welcomeForm({ trackerLink: 'https://example.com/p/1/x' })).error, 'string');
  equal(validateNewProfile(welcomeForm({ trackerLink: 'fencingtracker.com/p/12/Ana?x=1' })).profile.trackerLink, 'https://fencingtracker.com/p/12/Ana');
});

test('starting data leaves the theme unsaved for "match my device" and turns on chosen reminders', () => {
  const plain = startingData(validateNewProfile(welcomeForm()).profile);
  equal('theme' in plain, false);
  equal(plain.reminders.meals, false);
  const chosen = startingData(validateNewProfile(welcomeForm({ theme: 'dark', font: 'mono', mealReminders: true })).profile);
  equal([chosen.theme, chosen.font, chosen.reminders.meals, chosen.reminders.water], ['dark', 'mono', true, false]);
  equal(chosen.profile, { name: 'Ana', club: '', rating: '', weapon: 'Epee' });
});

test('profile ids differ and the saved list drops damaged entries', () => {
  equal(newProfileId(1000, 0.1) === newProfileId(1000, 0.2), false);
  equal(cleanProfileList([{ id: 'a1', name: 'Ana' }, { id: '../x', name: 'Bad' }, null, { name: 'No id' }]), [{ id: 'a1', name: 'Ana' }]);
  equal(cleanProfileList('nonsense'), []);
});

test('a profile summary joins the weapon and the club, leaving out blanks', () => {
  equal(profileSummary({ weapon: 'Foil', club: 'Point Fencing Club' }), 'Foil · Point Fencing Club');
  equal(profileSummary({ weapon: 'Sabre', club: '' }), 'Sabre');
});

// ---------- step videos ----------
test('parseYouTubeLink accepts watch, short, shorts and embed links and returns the video id', () => {
  const id = 'dQw4w9WgXcQ';
  for (const link of [
    'https://www.youtube.com/watch?v=' + id,
    'youtube.com/watch?v=' + id + '&t=30s',
    'https://youtu.be/' + id + '?si=abc',
    'https://m.youtube.com/shorts/' + id,
    'https://www.youtube.com/embed/' + id,
  ]) equal(parseYouTubeLink(link), { id });
});

test('parseYouTubeLink rejects other sites, look-alikes, channel pages and empty text', () => {
  for (const link of ['', 'https://vimeo.com/123456789', 'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/@fencing', 'https://www.youtube.com/watch?v=short', 'javascript:alert(1)']) {
    equal(typeof parseYouTubeLink(link).error, 'string');
  }
});

test('checkVideoFile needs a video type and no more than the size limit', () => {
  equal(checkVideoFile({ type: 'video/mp4', size: 1000 }), {});
  equal(checkVideoFile({ type: 'video/quicktime', size: MAX_VIDEO_BYTES }), {});
  equal(typeof checkVideoFile({ type: 'image/png', size: 10 }).error, 'string');
  equal(typeof checkVideoFile({ type: 'video/mp4', size: MAX_VIDEO_BYTES + 1 }).error, 'string');
});

test('normalizeVideo keeps a good youtube or file video and drops anything else', () => {
  equal(normalizeVideo({ kind: 'youtube', id: 'dQw4w9WgXcQ', extra: 1 }), { kind: 'youtube', id: 'dQw4w9WgXcQ' });
  equal(normalizeVideo({ kind: 'file', id: 'ab12-cd', name: 'lunge.mp4' }), { kind: 'file', id: 'ab12-cd', name: 'lunge.mp4' });
  equal([normalizeVideo(null), normalizeVideo({ kind: 'youtube', id: '<script>' }), normalizeVideo({ kind: 'file', id: '../x', name: 'a' }), normalizeVideo('x')], [null, null, null, null]);
  equal(videoLabel({ kind: 'file', id: 'a', name: 'lunge.mp4' }), 'lunge.mp4');
});

test('a step keeps its video through validate, save and clean, and a step without one has no video key', () => {
  const video = { kind: 'youtube', id: 'dQw4w9WgXcQ' };
  equal(validateStep({ name: ' Lunge ', desc: '', video }).value, { name: 'Lunge', desc: '', video });
  equal(validateStep({ name: 'Lunge', desc: '' }).value, { name: 'Lunge', desc: '' });
  equal(typeof validateStep({ name: 'Lunge', desc: '', video: { kind: 'youtube', id: 'bad' } }).error, 'string');
  equal(cleanStepsByType({ footwork: [{ name: 'Lunge', desc: '', video }, { name: 'Plain', desc: '', video: { kind: 'x' } }] }).footwork, [{ name: 'Lunge', desc: '', video }, { name: 'Plain', desc: '' }]);
});

test('doneAfterTick marks Done when the last step is ticked and clears it when a complete session is unticked', () => {
  const progress = (done, total) => ({ done, total });
  equal(doneAfterTick(progress(2, 3), progress(3, 3)), true);
  equal(doneAfterTick(progress(3, 3), progress(2, 3)), false);
  equal(doneAfterTick(progress(0, 3), progress(1, 3)), null);
  equal(doneAfterTick(progress(2, 3), progress(1, 3)), null);
  equal(doneAfterTick(progress(0, 0), progress(0, 0)), null);
});

test('ticksForDone ticks every step when a session becomes done and none when it is cleared', () => {
  const steps = [row('Lunge', '10 reps'), row('Parry', '')];
  equal(ticksForDone(steps, true), [stepKey(steps[0]), stepKey(steps[1])]);
  equal(ticksForDone(steps, false), []);
  equal(ticksForDone([], true), []);
});

// ---------- the Today box ----------
test('todayLine says how many of today\'s sessions are done and the water so far', () => {
  equal(todayLine({ sessionCount: 0, doneCount: 0, glasses: 0, goal: 8 }), 'No sessions today · 0 of 8 glasses');
  equal(todayLine({ sessionCount: 1, doneCount: 1, glasses: 3, goal: 8 }), '1 of 1 session done · 3 of 8 glasses');
  equal(todayLine({ sessionCount: 2, doneCount: 1, glasses: 8, goal: 8 }), '1 of 2 sessions done · 8 of 8 glasses');
});

test('mealWhen gives the time today, then Tomorrow, then the weekday', () => {
  equal(mealWhen({ meal: { time: '12:30', day: 3 }, daysAhead: 0 }), '12:30 PM');
  equal(mealWhen({ meal: { time: '', day: 3 }, daysAhead: 0 }), 'Today');
  equal(mealWhen({ meal: { time: '07:00', day: 4 }, daysAhead: 1 }), 'Tomorrow');
  equal(mealWhen({ meal: { time: '07:00', day: 6 }, daysAhead: 3 }), 'Sat');
});

test('weekLine rounds the hours to one decimal and says session or sessions', () => {
  equal(weekLine({ done: 2, planned: 4, hours: 3.46 }), 'This week: 2 of 4 sessions · 3.5 h');
  equal(weekLine({ done: 0, planned: 1, hours: 0 }), 'This week: 0 of 1 session · 0 h');
});

// ---------- fencing rating ----------
test('parseRating reads a letter and a year, and nothing else', () => {
  equal(parseRating('B26'), { letter: 'B', year: 2026 });
  equal(parseRating(' b 26 '), { letter: 'B', year: 2026 });
  equal(parseRating("A'27"), { letter: 'A', year: 2027 });
  equal(parseRating('C2025'), { letter: 'C', year: 2025 });
  equal(parseRating('E'), { letter: 'E', year: null });
  equal([parseRating(''), parseRating('Unrated'), parseRating('F26'), parseRating('B2'), parseRating(null)], [null, null, null, null, null]);
});

test('the ladder runs U, E, D, C, B, A and labels use the last two digits of the year', () => {
  equal(RATING_LADDER, ['U', 'E', 'D', 'C', 'B', 'A']);
  equal(ratingLabel('B', 2027), 'B27');
});

test('a B26 can aim for an A this year, and renews as B27 from January 1, 2027', () => {
  const targets = ratingTargets({ letter: 'B', year: 2026 }, new Date(2026, 10, 4));
  equal(targets.up, { letter: 'A', label: 'A26' });
  equal([targets.renew.label, targets.renew.available, targets.renew.daysUntil], ['B27', false, 58]);
  equal(targets.renew.opensOn.getFullYear() + '-' + targets.renew.opensOn.getMonth() + '-' + targets.renew.opensOn.getDate(), '2027-0-1');
});

test('on January 1 the renewal is available, and an older rating renews for the current year', () => {
  const january = ratingTargets({ letter: 'B', year: 2026 }, new Date(2027, 0, 1));
  equal([january.renew.label, january.renew.available, january.renew.daysUntil], ['B27', true, 0]);
  const old = ratingTargets({ letter: 'C', year: 2024 }, new Date(2026, 5, 10));
  equal([old.renew.label, old.renew.available], ['C26', true]);
});

test('an A has nothing higher to aim for, and a rating with no year has no renewal', () => {
  equal(ratingTargets({ letter: 'A', year: 2026 }, new Date(2026, 5, 1)).up, null);
  equal(ratingTargets({ letter: 'D', year: null }, new Date(2026, 5, 1)).renew, null);
});

test('a rating lasts four seasons, then drops a step and carries the year it dropped', () => {
  const day = (year, month, date) => new Date(year, month, date);
  const asText = (held) => held.letter + (held.year === null ? '' : String(held.year).slice(-2));
  // B22 holds through the 2025-26 season and drops on August 1, 2026.
  const before = currentRating({ letter: 'B', year: 2022 }, day(2026, 6, 31));
  equal([asText(before), before.dropped, before.expiresOn.getFullYear() + '-' + (before.expiresOn.getMonth() + 1) + '-' + before.expiresOn.getDate()], ['B22', null, '2026-8-1']);
  const after = currentRating({ letter: 'B', year: 2022 }, day(2026, 7, 1));
  equal([asText(after), after.dropped.from, after.dropped.on.getFullYear(), after.expiresOn.getFullYear()], ['C26', 'B22', 2026, 2030]);
});

test('an unrenewed rating keeps dropping every four seasons down to U, and then has no end date', () => {
  const held = (year, month) => currentRating({ letter: 'B', year: 2022 }, new Date(year, month, 1));
  equal([held(2030, 7).letter, held(2030, 7).year], ['D', 2030]);
  equal([held(2034, 7).letter, held(2034, 7).year], ['E', 2034]);
  const unrated = held(2038, 7);
  equal([unrated.letter, unrated.year, unrated.expiresOn, unrated.dropped.from], ['U', null, null, 'B22']);
  equal(held(2060, 0).letter, 'U');
});

test('a rating with no year, or a U, never expires', () => {
  equal(currentRating({ letter: 'C', year: null }, new Date(2060, 0, 1)), { letter: 'C', year: null, expiresOn: null, dropped: null });
  equal(currentRating({ letter: 'U', year: 2020 }, new Date(2060, 0, 1)).dropped, null);
});

test('goals for a rating are just "Earn" and the label, including for a renewal', () => {
  equal([earnGoalName('A27'), earnGoalName('B26')], ['Earn A27', 'Earn B26']);
});
test('only one rating goal can be on the board at a time', () => {
  const board = [{ id: 'a', name: 'Earn A27' }, { id: 'b', name: 'Better footwork' }, { id: 'c', name: 'Earn B26', archived: true }];
  equal([isRatingGoalName('Earn B27'), isRatingGoalName(' earn a27 '), isRatingGoalName('Earn an A rating'), isRatingGoalName('Earn F27')], [true, true, false, false]);
  equal(ratingGoalConflict(board, 'Earn B27'), 'Earn A27');
  equal(ratingGoalConflict(board, 'Earn B27', 'a'), null);
  equal(ratingGoalConflict(board, 'Win a bout'), null);
  equal(ratingGoalConflict([{ id: 'c', name: 'Earn B26', archived: true }], 'Earn B27'), null);
});

test('todayItems puts sessions and meals in the order they happen, with all-day first and untimed meals last', () => {
  // 2026-11-04 is a Wednesday (day 3).
  const now = new Date(2026, 10, 4, 9, 0);
  const sessions = [
    session('s3', '2026-11-04', '15:00', { type: 'bout' }),
    session('s2', '2026-11-04', '14:00', { type: 'blade' }),
    session('tourney', '2026-11-04', '', { type: 'tournament' }),
    session('other', '2026-11-05', '08:00'),
  ];
  const meals = [
    { id: 'm-lunch', day: 3, name: 'Lunch', desc: '', time: '' },
    { id: 'm-snack', day: 3, name: 'Snack', desc: '', time: '' },
    { id: 'm-dinner', day: 3, name: 'Dinner', desc: '', time: '18:30' },
    { id: 'm-tomorrow', day: 4, name: 'Breakfast', desc: '', time: '' },
  ];
  const order = todayItems(sessions, meals, now).map((item) => (item.kind === 'session' ? item.session.id : item.meal.id));
  equal(order, ['tourney', 'm-lunch', 's2', 's3', 'm-dinner', 'm-snack']);
});

test('todayItems on a tie puts the session before the meal, and adds the next meal when none is planned today', () => {
  const now = new Date(2026, 10, 4, 9, 0);
  const tie = todayItems([session('s', '2026-11-04', '12:00')], [{ id: 'm', day: 3, name: 'Lunch', desc: '', time: '12:00' }], now);
  equal(tie.map((item) => item.kind), ['session', 'meal']);
  const none = todayItems([], [{ id: 'm', day: 4, name: 'Breakfast', desc: '', time: '' }], now);
  equal([none.length, none[0].kind, none[0].daysAhead], [1, 'meal', 1]);
  equal(todayItems([], [], now), []);
});

// ---------- fixes from the adversarial check (2026-11-11) ----------
test('a second press right after the first is a stray double-click, a later one is on purpose', () => {
  equal(isStrayClick(1000, 1200), true);
  equal(isStrayClick(1000, 1900), false);
  equal(isStrayClick(null, 1200), false);
});

test('feelingOf gives a placeholder for an entry whose feeling is missing or unknown', () => {
  equal(feelingOf({ feeling: 'sharp' }).label, 'Sharp');
  equal(feelingOf({}).label, 'No feeling');
  equal(feelingOf({ feeling: 'angry' }).label, 'No feeling');
});

test('normalizeEntries blanks an unknown feeling and cleans a damaged video and notes', () => {
  const clean = normalizeEntries({
    a: { feeling: 'angry', text: 'kept', video: { kind: 'file', id: '../x', name: 5 }, videoNotes: 'garbage' },
    b: { feeling: 'tired', video: { kind: 'youtube', id: 'dQw4w9WgXcQ' }, videoNotes: [{ time: 5, text: 'hi' }, { time: -1, text: 'bad' }] },
  });
  equal([clean.a.feeling, clean.a.text, clean.a.video, clean.a.videoNotes], ['', 'kept', null, []]);
  equal([clean.b.feeling, clean.b.video.id, clean.b.videoNotes], ['tired', 'dQw4w9WgXcQ', [{ time: 5, text: 'hi' }]]);
});

test('normalizeSort accepts a damaged saved sort setting', () => {
  equal(normalizeSort(null), { by: 'created', order: 'desc' });
  equal(normalizeSort('oops'), { by: 'created', order: 'desc' });
  equal(normalizeSort({ by: 'nonsense', order: 'asc' }), { by: 'created', order: 'asc' });
});

test('cleanTicks keeps only lists of text keys per session', () => {
  equal(cleanTicks(null), {});
  equal(cleanTicks({ s1: 5, s2: ['a', 3, 'b'], s3: ['x'] }), { s2: ['a', 'b'], s3: ['x'] });
});

test('renameTick moves a tick to the edited step, and leaves an unticked step alone', () => {
  const before = { name: 'Lunges', desc: 'slow' };
  const after = { name: 'Lunges', desc: 'fast' };
  equal(renameTick([stepKey(before), 'other'], before, after), [stepKey(after), 'other']);
  equal(renameTick(['other'], before, after), ['other']);
});

test('adding a step to a finished session un-finishes it (Done follows the ticks)', () => {
  const one = [{ name: 'A', desc: '' }];
  const two = [...one, { name: 'B', desc: '' }];
  const ticked = [stepKey(one[0])];
  equal(doneAfterTick(sessionProgress(one, ticked), sessionProgress(two, ticked)), false);
});

test('cleanSessions drops entries that are not sessions', () => {
  const good = { id: 'a', date: '2026-11-05', time: '18:00', mins: 60, type: 'bout', done: false };
  equal(cleanSessions([good, null, 5, 'x', { date: '2026-11-05' }]), [good]);
  equal(cleanSessions(null), []);
});

test('cleanSavedRoutines drops a saved routine that has no steps left', () => {
  const saved = { footwork: [
    { id: 'r1', name: 'Empty', savedAt: '', steps: [] },
    { id: 'r2', name: 'Full', savedAt: '', steps: [{ name: 'A', desc: '' }] },
  ] };
  equal(cleanSavedRoutines(saved).footwork.map((routine) => routine.id), ['r2']);
});

test('a video note counts emoji as one character each', () => {
  const emoji = '😀'.repeat(150);
  equal(validateVideoNote({ time: '0:05', text: emoji }).error, undefined);
  equal(validateVideoNote({ time: '0:05', text: '😀'.repeat(201) }).error !== undefined, true);
});

test('names with hidden text-direction characters are refused', () => {
  equal(validateRoutineName('Lunges\u202Eevil', []) !== null, true);
  equal(validateStep({ name: 'Lunges\u202E', desc: '' }).error !== undefined, true);
  equal(validateRoutineName('Family 👨‍👩‍👧 drills', []), null);
});

test('a word that is not a web address says it does not look like a link', () => {
  equal(parseYouTubeLink('notalink').error.startsWith('That does not look like a link'), true);
  equal(parseYouTubeLink('https://example.com/watch?v=dQw4w9WgXcQ').error.startsWith('Only YouTube'), true);
});

test('cleanDraft keeps what was typed on the welcome form and drops anything unusable', () => {
  const draft = cleanDraft({ name: 'Jenna', weapon: 'Foil', club: 'Point', rating: 'B26', theme: 'dark', font: 'mono', mealReminders: true, waterReminders: 'yes', extra: 'x' });
  equal(draft, { name: 'Jenna', weapon: 'Foil', club: 'Point', rating: 'B26', trackerLink: '', theme: 'dark', font: 'mono', mealReminders: true, waterReminders: false });
  equal(cleanDraft({ name: 5, weapon: 'Axe', theme: 'neon', font: 'comic' }), { name: '', weapon: '', club: '', rating: '', trackerLink: '', theme: 'auto', font: 'sans', mealReminders: false, waterReminders: false });
  equal(cleanDraft(null), null);
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
