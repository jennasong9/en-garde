import { $, el } from './dom.js';
import { upcomingMeals } from './meals.js';
import { loadJson } from './storage.js';

// The small "Next meals" list at the top of every page: each meal's name and what is in it (cut
// off with "..." when long). It reads the saved meal plan each time, so it is always current, and
// it links to the Nutrition page.
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
    el('b', { text: item.meal.name }), el('span', { text: item.meal.desc }))));
  $('#miniMeals').setAttribute('aria-label', 'Next meals: '
    + upcoming.map((item) => item.meal.name + (item.meal.desc ? ', ' + item.meal.desc : '')).join('; ') + '. Go to Nutrition.');
}
