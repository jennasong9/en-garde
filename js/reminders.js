// Pure rules for meal and water reminders: no DOM, no storage, so they can be tested on their own.
import { plannedMinutes } from './meals.js';
import { toIso } from './schedule.js';

export const LEAD_CHOICES = [5, 10, 15, 30, 60];
export const EVERY_CHOICES = [1, 2, 3, 4];

// Everything starts off. `leadMinutes` is how long before a meal its reminder shows; the water
// reminders come every `waterEveryHours` between `waterFrom` and `waterTo`; `notify` also shows a
// browser notification (when the browser allows it).
export const DEFAULT_REMINDERS = {
  meals: false,
  water: false,
  notify: false,
  leadMinutes: 15,
  waterEveryHours: 2,
  waterFrom: '08:00',
  waterTo: '20:00',
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

// The saved settings with anything unusable put back to its default.
export function normalizeReminders(saved) {
  const source = saved !== null && typeof saved === 'object' ? saved : {};
  const from = TIME_PATTERN.test(source.waterFrom) ? source.waterFrom : DEFAULT_REMINDERS.waterFrom;
  const to = TIME_PATTERN.test(source.waterTo) ? source.waterTo : DEFAULT_REMINDERS.waterTo;
  const validHours = toMinutes(from) < toMinutes(to);
  return {
    meals: source.meals === true,
    water: source.water === true,
    notify: source.notify === true,
    leadMinutes: LEAD_CHOICES.includes(source.leadMinutes) ? source.leadMinutes : DEFAULT_REMINDERS.leadMinutes,
    waterEveryHours: EVERY_CHOICES.includes(source.waterEveryHours) ? source.waterEveryHours : DEFAULT_REMINDERS.waterEveryHours,
    waterFrom: validHours ? from : DEFAULT_REMINDERS.waterFrom,
    waterTo: validHours ? to : DEFAULT_REMINDERS.waterTo,
  };
}

// What has already been reminded today, { date, keys: [meal reminders sent], waterAt: when the last
// water reminder was }. A record from another day is dropped, so every day starts fresh.
export function normalizeSent(saved, todayIso) {
  if (saved !== null && typeof saved === 'object' && saved.date === todayIso && Array.isArray(saved.keys)
    && Number.isFinite(saved.waterAt)) {
    return saved;
  }
  return { date: todayIso, keys: [], waterAt: 0 };
}

// The meals to remind about now: today's meals that are not prepped, from `leadMinutes` before their
// time until their time, that have not been reminded yet. Soonest first.
export function dueMeals(meals, now, settings, sent) {
  if (!settings.meals) return [];
  const today = toIso(now);
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  return meals
    .filter((meal) => meal.day === now.getDay() && !meal.prepped)
    .map((meal) => ({ meal, start: plannedMinutes(meal), key: today + '|' + meal.id }))
    .filter(({ start, key }) => start !== null && minutesNow >= start - settings.leadMinutes && minutesNow <= start && !sent.keys.includes(key))
    .sort((a, b) => a.start - b.start)
    .map(({ meal, start, key }) => ({ meal, key, minutesAway: start - minutesNow }));
}

// Whether a water reminder is due: inside the chosen hours, below the goal, and at least
// `waterEveryHours` since the last one.
export function waterDue(now, settings, { glasses, goal }, sent) {
  if (!settings.water || glasses >= goal) return false;
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  if (minutesNow < toMinutes(settings.waterFrom) || minutesNow >= toMinutes(settings.waterTo)) return false;
  return now.getTime() - sent.waterAt >= settings.waterEveryHours * 60 * 60 * 1000;
}

export function mealReminderText({ meal, minutesAway }) {
  if (minutesAway <= 0) return meal.name + ' is now';
  return meal.name + ' in ' + minutesAway + ' min' + (meal.desc ? ': ' + meal.desc : '');
}

export const waterReminderText = ({ glasses, goal }) => 'Time for a glass of water (' + glasses + ' of ' + goal + ' today)';
