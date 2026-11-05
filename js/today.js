// Pure wording for the "Today" box at the top of every page: no DOM and no storage.
import { formatTime, sessionsOn, toIso } from './schedule.js';
import { DAY_NAMES, plannedMinutes, upcomingMeals } from './meals.js';

const plural = (count, word) => count + ' ' + word + (count === 1 ? '' : 's');

// The one line shown when the Today box is folded, such as "1 of 2 sessions done · 3 of 8 glasses".
export function todayLine({ sessionCount, doneCount, glasses, goal }) {
  const sessions = sessionCount === 0 ? 'No sessions today' : doneCount + ' of ' + plural(sessionCount, 'session') + ' done';
  return sessions + ' · ' + glasses + ' of ' + goal + ' glasses';
}

// When the next meal is: its time if it is today (or just "Today" with no time), else "Tomorrow" or the weekday.
export function mealWhen({ meal, daysAhead }) {
  if (daysAhead === 0) return meal.time ? formatTime(meal.time) : 'Today';
  if (daysAhead === 1) return 'Tomorrow';
  return DAY_NAMES[meal.day].slice(0, 3);
}

// The week's progress shown at the bottom of the box, such as "This week: 2 of 4 sessions · 3.5 h".
export function weekLine({ done, planned, hours }) {
  return 'This week: ' + done + ' of ' + plural(planned, 'session') + ' · ' + String(Math.round(hours * 10) / 10) + ' h';
}

const MINUTES_PER_DAY = 24 * 60;
const toMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

// Everything to do today, in the order it happens: today's sessions and meals, sorted by time.
// An all-day session goes first; a meal with no time (other than Breakfast, Lunch and Dinner, which
// use their usual times) goes last; when two share a time the session comes first. If no meal is
// planned today, the next meal (tomorrow or later) is added at the end so the box is not empty of
// food. Each item is { kind: 'session', session, minutes } or { kind: 'meal', meal, daysAhead, minutes }.
export function todayItems(sessions, meals, now) {
  const items = [
    ...sessionsOn(sessions, toIso(now)).map((session) => ({ kind: 'session', session, minutes: session.time ? toMinutes(session.time) : -1 })),
    ...meals.filter((meal) => meal.day === now.getDay()).map((meal) => ({ kind: 'meal', meal, daysAhead: 0, minutes: plannedMinutes(meal) ?? MINUTES_PER_DAY })),
  ];
  const rank = (item) => item.minutes * 2 + (item.kind === 'meal' ? 1 : 0);
  const ordered = items.map((item, order) => ({ item, order })).sort((a, b) => rank(a.item) - rank(b.item) || a.order - b.order).map(({ item }) => item);
  if (!ordered.some((item) => item.kind === 'meal')) {
    const next = upcomingMeals(meals, now, 1)[0];
    if (next) ordered.push({ kind: 'meal', meal: next.meal, daysAhead: next.daysAhead, minutes: next.minutes });
  }
  return ordered;
}
