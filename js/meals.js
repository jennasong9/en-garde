// Pure meal-plan logic: no DOM, no storage, so it can be tested on its own.
// A meal belongs to a weekday (0 = Sunday) and the plan repeats every week.

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MAX_KCAL = 5000;

// Where a meal sits in a day's default order, in minutes. A meal with a time goes by that time.
// Breakfast, Lunch and Dinner without a time use a typical time, so they always come out in that
// order. Any other meal without a time goes last.
const TYPICAL_MINUTES = { breakfast: 7 * 60, lunch: 12 * 60, dinner: 18 * 60 + 30 };

function defaultPosition(meal) {
  if (meal.time) {
    const [hours, minutes] = meal.time.split(':').map(Number);
    return hours * 60 + minutes;
  }
  const named = /^\s*(breakfast|lunch|dinner)\b/i.exec(meal.name || '');
  return named ? TYPICAL_MINUTES[named[1].toLowerCase()] : Infinity;
}

// The minutes after midnight a meal is planned for, or null when it has no time and is not one
// of Breakfast, Lunch or Dinner (which use a typical time).
export function plannedMinutes(meal) {
  const position = defaultPosition(meal);
  return position === Infinity ? null : position;
}

// One day's meals in order. Meals the user has dragged into place (they have a `rank`) come first,
// in that order; the rest follow in the default order described above.
export function sortMeals(meals) {
  const ranked = meals.filter((meal) => typeof meal.rank === 'number').sort((a, b) => a.rank - b.rank);
  const unranked = meals.filter((meal) => typeof meal.rank !== 'number').sort((a, b) => {
    const first = defaultPosition(a);
    const second = defaultPosition(b);
    if (first === second) return 0;
    return first < second ? -1 : 1;
  });
  return [...ranked, ...unranked];
}

// Puts a meal on `day` at position `index` among that day's other meals (0 = first) and records
// the day's order, so it stays however it was arranged. Used to reorder within a day, to drop a
// meal between others on another day, and to place a meal added from the history.
export function placeMeal(meals, id, day, index) {
  const moving = meals.find((meal) => meal.id === id);
  const others = sortMeals(meals.filter((meal) => meal.day === day && meal.id !== id));
  const at = Math.max(0, Math.min(index, others.length));
  const order = [...others.slice(0, at), moving, ...others.slice(at)];
  const ranks = new Map(order.map((meal, position) => [meal.id, (position + 1) * 10]));
  return meals.map((meal) => (ranks.has(meal.id) ? { ...meal, day, rank: ranks.get(meal.id) } : meal));
}

export function mealsOn(meals, day) {
  return sortMeals(meals.filter((meal) => meal.day === day));
}

export function dayTotals(meals, day) {
  const dayMeals = meals.filter((meal) => meal.day === day);
  return {
    count: dayMeals.length,
    prepped: dayMeals.filter((meal) => meal.prepped).length,
    kcal: dayMeals.reduce((sum, meal) => sum + (meal.kcal || 0), 0),
  };
}

function parseWholeNumber(text, max, what) {
  const trimmed = String(text).trim();
  if (trimmed === '') return { value: null, error: null };
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 0 || value > max) {
    return { value: null, error: what + ' must be a whole number from 0 to ' + max + '.' };
  }
  return { value, error: null };
}

// Reads the calories box. Empty is fine (null); otherwise it must be a whole number from 0 to 5000.
export function parseKcal(text) {
  return parseWholeNumber(text, MAX_KCAL, 'Calories');
}

// Reads a grams box (protein, carbs or fat). Empty is fine (null); otherwise 0 to 1000.
export function parseGrams(text, what) {
  return parseWholeNumber(text, MAX_GRAMS, what);
}

// ---------- macros ----------
export const MACROS = ['protein', 'carb', 'fat'];
export const MAX_GRAMS = 1000;
const KCAL_PER_GRAM = { protein: 4, carb: 4, fat: 9 };

// Calories that a set of daily gram targets adds up to.
export function macroKcal(grams) {
  return MACROS.reduce((sum, macro) => sum + (grams[macro] || 0) * KCAL_PER_GRAM[macro], 0);
}

// Each macro's share of the calories, as whole percents (0 when nothing is set).
export function macroShares(grams) {
  const total = macroKcal(grams);
  const shares = {};
  for (const macro of MACROS) {
    shares[macro] = total === 0 ? 0 : Math.round(((grams[macro] || 0) * KCAL_PER_GRAM[macro] * 100) / total);
  }
  return shares;
}

export function dayMacroTotals(meals, day) {
  const totals = { protein: 0, carb: 0, fat: 0 };
  for (const meal of meals) {
    if (meal.day !== day) continue;
    for (const macro of MACROS) totals[macro] += meal[macro] || 0;
  }
  return totals;
}

// How far `total` grams is toward a `target`: percent filled (capped at 100) and whether it is over.
// Null when there is no target to compare with.
export function macroProgress(total, target) {
  if (!target) return null;
  return { percent: Math.min(100, Math.round((total * 100) / target)), over: total > target };
}

// ---------- hydration ----------
export const DEFAULT_GLASS_GOAL = 8;
export const MAX_GLASS_GOAL = 20;

// Glasses logged today. The count belongs to one date, so any other date starts at zero.
export function glassesToday(hydration, todayIso) {
  return hydration.date === todayIso ? hydration.glasses : 0;
}

// Tapping glass number `index` (0-based) fills up to it; tapping the last filled glass undoes it.
export function tapGlass(current, index) {
  return index + 1 === current ? current - 1 : index + 1;
}

// The details of a meal that "apply to all days" changes. Which day it is on and whether it is
// prepped stay separate for each day.
export const SHARED_MEAL_FIELDS = ['name', 'desc', 'time', 'kcal', 'protein', 'carb', 'fat'];

// Returns a new meal list where each of `toDays` holds copies of `fromDay`'s meals
// (not prepped), replacing whatever was on those days. A meal and its copies share a
// `groupId`, so they can be edited together later.
export function copyDay(meals, fromDay, toDays, makeId) {
  const targets = toDays.filter((day) => day !== fromDay);
  const groupIds = new Map(mealsOn(meals, fromDay).map((meal) => [meal.id, meal.groupId || makeId()]));
  const withGroups = meals.map((meal) => (groupIds.has(meal.id) ? { ...meal, groupId: groupIds.get(meal.id) } : meal));
  const source = mealsOn(withGroups, fromDay);
  const kept = withGroups.filter((meal) => !targets.includes(meal.day));
  const copies = targets.flatMap((day) => source.map((meal) => ({ ...meal, id: makeId(), day, prepped: false })));
  return [...kept, ...copies];
}

// True when `other` is already a copy of `meal`, or has exactly the same shared details.
function isCopyOf(meal, other) {
  if (meal.groupId && other.groupId === meal.groupId) return true;
  return sameMealDetails(meal, other);
}

// Adds a copy of one meal (not prepped, linked to the original) to each of `toDays`, keeping the
// other meals already on those days. A day that already holds a copy of it, or an identical
// meal, is skipped. Returns { meals, copiedDays, skippedDays }.
export function copyMeal(meals, meal, toDays, makeId) {
  const targets = [...new Set(toDays)].filter((day) => day !== meal.day);
  const groupId = meal.groupId || makeId();
  const copiedDays = [];
  const skippedDays = [];
  const additions = [];
  for (const day of targets) {
    if (meals.some((other) => other.day === day && isCopyOf(meal, other))) skippedDays.push(day);
    else {
      copiedDays.push(day);
      additions.push({ ...meal, id: makeId(), day, prepped: false, groupId, rank: undefined });
    }
  }
  const updated = meals.map((other) => (other.id === meal.id ? { ...other, groupId } : other));
  return { meals: [...updated, ...additions], copiedDays, skippedDays };
}

// The other meals that were copied from, or to, this one (none if it was never copied).
export function linkedMeals(meals, meal) {
  if (!meal.groupId) return [];
  return meals.filter((other) => other.groupId === meal.groupId && other.id !== meal.id);
}

// True when `fields` changes any of the details that "apply to all days" would copy over.
export function changesSharedDetails(meal, fields) {
  return !sameMealDetails(meal, fields);
}

// True when two meals (or a meal and a template) match in every shared detail. A blank and a
// missing value count as the same.
export function sameMealDetails(a, b) {
  const normalized = (value) => (value === undefined || value === '' ? null : value);
  return SHARED_MEAL_FIELDS.every((key) => normalized(a[key]) === normalized(b[key]));
}

// Returns a new meal list where every meal copied from the same original takes the shared
// details from `fields`; each keeps its own day and prepped state.
export function applyToLinked(meals, meal, fields) {
  const shared = Object.fromEntries(SHARED_MEAL_FIELDS.map((key) => [key, fields[key]]));
  return meals.map((other) => (meal.groupId && other.groupId === meal.groupId ? { ...other, ...shared } : other));
}

// ---------- meal history ----------
// The history remembers the meals the user has added, as templates (a meal's shared details,
// with no day), newest first, so one can be added again later without retyping it.
export const HISTORY_LIMIT = 40;

export function mealTemplate(meal) {
  return {
    name: meal.name,
    desc: meal.desc || '',
    time: meal.time || '',
    kcal: meal.kcal ?? null,
    protein: meal.protein ?? null,
    carb: meal.carb ?? null,
    fat: meal.fat ?? null,
  };
}

// Puts a meal at the top of the history, removing an identical earlier entry.
export function addToHistory(history, meal, limit = HISTORY_LIMIT) {
  const template = mealTemplate(meal);
  return [template, ...history.filter((entry) => !sameMealDetails(entry, template))].slice(0, limit);
}

// Adds any meals in the plan that the history does not have yet, at the end (as the oldest).
export function mergeIntoHistory(history, meals, limit = HISTORY_LIMIT) {
  const merged = [...history];
  for (const meal of meals) {
    if (!merged.some((entry) => sameMealDetails(entry, meal))) merged.push(mealTemplate(meal));
  }
  return merged.slice(0, limit);
}

export function removeFromHistory(history, template) {
  return history.filter((entry) => !sameMealDetails(entry, template));
}

// History entries whose name or description contains the search words (all entries if blank).
export function searchHistory(history, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return history.filter((entry) => {
    const text = (entry.name + ' ' + entry.desc).toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

// Adds a meal from a history template to each of `toDays`, keeping the meals already there. A
// day that already has an identical meal is skipped. Returns { meals, addedDays, skippedDays }.
export function addTemplateToDays(meals, template, toDays, makeId) {
  const addedDays = [];
  const skippedDays = [];
  const additions = [];
  for (const day of new Set(toDays)) {
    if (meals.some((meal) => meal.day === day && sameMealDetails(meal, template))) skippedDays.push(day);
    else {
      addedDays.push(day);
      additions.push({ ...template, id: makeId(), day, prepped: false });
    }
  }
  return { meals: [...meals, ...additions], addedDays, skippedDays, added: additions };
}

// Forgets the hand-set order of a day, so its meals go back to the default order.
export function clearOrder(meals, day) {
  return meals.map((meal) => (meal.day === day && meal.rank !== undefined ? { ...meal, rank: undefined } : meal));
}

// True when the user has arranged a day's meals by hand.
export function hasCustomOrder(meals, day) {
  return meals.some((meal) => meal.day === day && typeof meal.rank === 'number');
}

// Moves one meal to another day, keeping everything else about it (time, calories, prepped...).
// It takes its place in that day's default order unless the user drags it into position.
export function moveMeal(meals, id, day) {
  return meals.map((meal) => (meal.id === id ? { ...meal, day, rank: undefined } : meal));
}

// ---------- next meals ----------
// The next meals coming up from `now`, soonest first. The plan repeats every week, so a meal
// whose time has passed today next comes round in 7 days. A meal with no time at all counts as
// the end of its day. Each result has the meal, how many days ahead it is (0 = today) and its minutes.
export function upcomingMeals(meals, now, count = 3) {
  const today = now.getDay();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return meals
    .map((meal, order) => {
      const minutes = plannedMinutes(meal) ?? 23 * 60 + 59;
      let daysAhead = (meal.day - today + 7) % 7;
      if (daysAhead === 0 && minutes < nowMinutes) daysAhead = 7;
      return { meal, daysAhead, minutes, order };
    })
    .sort((a, b) => a.daysAhead * 1440 + a.minutes - (b.daysAhead * 1440 + b.minutes) || a.order - b.order)
    .slice(0, count)
    .map(({ meal, daysAhead, minutes }) => ({ meal, daysAhead, minutes }));
}
