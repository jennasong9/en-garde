// Pure logic for saved weekly meal plans: no DOM, no storage, so it can be tested on its own.
// A saved plan is { id, name, savedAt, meals: [...] }, a copy of every meal in the week with
// nothing ticked as prepped.

export const MAX_SAVED_PLANS = 30;
export const MAX_PLAN_NAME_CHARS = 60;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// A name for the plan being saved, such as "Week of Oct 19" (the Monday of this week), with a
// number added if a plan already has that name.
export function defaultPlanName(now, plans) {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const base = 'Week of ' + MONTHS[monday.getMonth()] + ' ' + monday.getDate();
  const taken = new Set(plans.map((plan) => plan.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let number = 2;
  while (taken.has((base + ' (' + number + ')').toLowerCase())) number++;
  return base + ' (' + number + ')';
}

// Returns what is wrong with a name for a new saved plan, or null if it can be used.
export function validatePlanName(name, plans) {
  const trimmed = name.trim();
  if (trimmed === '') return 'Give the plan a name.';
  if (trimmed.length > MAX_PLAN_NAME_CHARS) return 'Keep the name under ' + MAX_PLAN_NAME_CHARS + ' characters.';
  if (plans.some((plan) => plan.name.toLowerCase() === trimmed.toLowerCase())) {
    return 'You already have a plan with that name. Choose a different name.';
  }
  if (plans.length >= MAX_SAVED_PLANS) return 'You have ' + MAX_SAVED_PLANS + ' saved plans. Delete one to save another.';
  return null;
}

// A saved copy of the week: every meal, with each day's hand-set order kept and nothing prepped.
export function snapshotPlan(meals, name, savedAt, makeId) {
  const copies = meals.map((meal) => {
    const copy = {
      name: meal.name,
      desc: meal.desc || '',
      time: meal.time || '',
      kcal: meal.kcal ?? null,
      protein: meal.protein ?? null,
      carb: meal.carb ?? null,
      fat: meal.fat ?? null,
      day: meal.day,
      prepped: false,
    };
    if (typeof meal.rank === 'number') copy.rank = meal.rank;
    if (meal.groupId) copy.groupId = meal.groupId;
    return copy;
  });
  return { id: makeId(), name: name.trim(), savedAt, meals: copies };
}

// The meals a saved plan puts back in the week (new ids, nothing prepped).
export function mealsFromPlan(plan, makeId) {
  return plan.meals.map((meal) => ({ ...meal, id: makeId(), prepped: false }));
}

// "12 meals on 5 days".
export function planSummary(plan) {
  const days = new Set(plan.meals.map((meal) => meal.day)).size;
  const meals = plan.meals.length + (plan.meals.length === 1 ? ' meal' : ' meals');
  return meals + ' on ' + days + (days === 1 ? ' day' : ' days');
}
