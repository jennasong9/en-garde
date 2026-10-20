import { $, el } from './dom.js';
import { DAY_NAMES, upcomingMeals } from './meals.js';
import { formatTime } from './schedule.js';
import { loadJson } from './storage.js';

// When a meal is, as short text: "Today 12:30 PM", "Tomorrow", "Fri", or "Next Mon" for a meal
// that already passed this week. Meals without a time of their own show just the day.
function whenText({ meal, daysAhead }) {
  let day = DAY_NAMES[meal.day].slice(0, 3);
  if (daysAhead === 0) day = 'Today';
  else if (daysAhead === 1) day = 'Tomorrow';
  else if (daysAhead >= 7) day = 'Next ' + day;
  return meal.time ? day + ' ' + formatTime(meal.time) : day;
}

// The small "Next meals" list at the top of the app. It reads the saved meal plan each time, so it
// is always current, and it links to the Nutrition page.
export function renderNextMeals() {
  const saved = loadJson('meals', []);
  const upcoming = upcomingMeals(Array.isArray(saved) ? saved : [], new Date(), 3);
  const list = $('#miniMealList');
  if (upcoming.length === 0) {
    list.replaceChildren(el('li', { class: 'mini-meals-empty', text: 'No meals planned yet' }));
    $('#miniMeals').setAttribute('aria-label', 'Next meals: none planned yet. Go to Nutrition.');
    return;
  }
  list.replaceChildren(...upcoming.map((item) => el('li', {},
    el('b', { text: item.meal.name }), el('span', { text: whenText(item) }))));
  $('#miniMeals').setAttribute('aria-label', 'Next meals: '
    + upcoming.map((item) => item.meal.name + ' ' + whenText(item)).join(', ') + '. Go to Nutrition.');
}
