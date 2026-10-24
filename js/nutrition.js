import { burstConfetti } from './confetti.js';
import { foldBody, setFolded } from './fold.js';
import { $, closeOnBackdropClick, el, formState, makeDraggable, protectUnsavedChanges } from './dom.js';
import {
  DAY_NAMES,
  MACROS,
  MAX_GRAMS,
  MEAL_SLOTS,
  addTemplateToDays,
  addToHistory,
  allPrepped,
  applyToLinked,
  changesSharedDetails,
  clearOrder,
  copyDay,
  copyMeal,
  dayMacroTotals,
  dayTotals,
  hasCustomOrder,
  linkedMeals,
  macroKcal,
  macroProgress,
  macroShares,
  mealsOn,
  mergeIntoHistory,
  moveMeal,
  parseGrams,
  parseKcal,
  placeMeal,
  removeFromHistory,
  searchHistory,
} from './meals.js';
import { makeId, formatTime } from './schedule.js';
import { defaultPlanName, mealsFromPlan, planSummary, snapshotPlan, validatePlanName } from './mealplans.js';
import { renderNextMeals } from './next-meals.js';
import { loadJson, saveJson } from './storage.js';

const stored = loadJson('meals', []);
let meals = Array.isArray(stored) ? stored : [];

// Every meal the user has added, newest first, so one can be added again without retyping it.
// Meals already in the plan are folded in the first time this runs.
const storedHistory = loadJson('mealHistory', []);
let history = mergeIntoHistory(Array.isArray(storedHistory) ? storedHistory : [], meals);
let historyQuery = '';
// When on, the History column stays but only its title and summary show.
let historyHidden = loadJson('mealHistoryHidden', false) === true;

// The meal plan lists the week Monday to Sunday (day numbers use 0 = Sunday, like the calendar).
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const MACRO_LABELS = { protein: 'Protein', carb: 'Carbs', fat: 'Fat' };
const storedTargets = loadJson('macroTargets', {});
let macroTargets = { protein: null, carb: null, fat: null, ...storedTargets };

const mealDialog = $('#mealDialog');
const copyDialog = $('#copyDialog');
let editingMealId = null;
let formDay = 0;
let confirmingDelete = false;
let copyFromDay = 0;

function persist() {
  saveJson('meals', meals);
  saveJson('mealHistory', history);
}

// Remembers a saved meal in the history (at the top).
function remember(meal) {
  history = addToHistory(history, meal);
}

// Days whose meals are folded away (just the name and summary show). Remembered on this device.
const storedCollapsed = loadJson('mealDaysCollapsed', []);
const collapsedDays = new Set(Array.isArray(storedCollapsed) ? storedCollapsed.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) : []);

// Folds or opens one day in place, so it slides instead of redrawing.
function toggleDay(day, column, toggle) {
  const folding = !collapsedDays.has(day);
  if (folding) collapsedDays.add(day);
  else collapsedDays.delete(day);
  saveJson('mealDaysCollapsed', [...collapsedDays]);
  setFolded(column, toggle, folding);
  updateExpandAll();
}

// One button for the whole plan: "Collapse all" while every day and History is open, otherwise
// "Expand all". It presses whichever panels are not already in the wanted state, so they slide.
const mealToggles = () => [...document.querySelectorAll('#mealGrid .meal-day-toggle')];

function updateExpandAll() {
  const allOpen = mealToggles().every((toggle) => toggle.getAttribute('aria-expanded') === 'true');
  $('#expandAllBtn').textContent = allOpen ? 'Collapse all' : 'Expand all';
}

$('#expandAllBtn').addEventListener('click', () => {
  const open = $('#expandAllBtn').textContent === 'Expand all';
  for (const toggle of mealToggles()) {
    if ((toggle.getAttribute('aria-expanded') === 'true') !== open) toggle.click();
  }
});

export function renderNutrition() {
  renderNextMeals();
  renderMacroTargets();
  const today = new Date().getDay();
  $('#mealGrid').replaceChildren(...WEEK_ORDER.map((day) => dayColumn(DAY_NAMES[day], day, day === today)), historyPanel());
  updateExpandAll();
}

function dayColumn(name, day, isToday) {
  const dayMeals = mealsOn(meals, day);
  const totals = dayTotals(meals, day);
  const summary = totals.count === 0
    ? 'No meals yet'
    : [totals.kcal ? totals.kcal.toLocaleString() + ' kcal' : '', totals.prepped + '/' + totals.count + ' prepped']
      .filter(Boolean).join(' · ');

  const collapsed = collapsedDays.has(day);
  const toggle = el('button', {
    class: 'meal-day-toggle',
    type: 'button',
    'aria-expanded': String(!collapsed),
    'aria-label': name + "'s meals",
    onclick: () => toggleDay(day, column, toggle),
  }, el('h3', { text: name }), el('span', { class: 'chevron', 'aria-hidden': 'true' }));
  const head = el('div', { class: 'meal-day-head' }, toggle, el('span', { class: 'meal-day-summary', text: summary }));
  const links = el('div', { class: 'meal-day-links' });
  if (totals.count > 0) {
    links.append(el('button', {
      class: 'link-btn small',
      type: 'button',
      text: 'Copy to other days',
      onclick: () => openCopy({ day }),
    }));
  }

  if (hasCustomOrder(meals, day)) {
    links.append(el('button', {
      class: 'link-btn small',
      type: 'button',
      text: 'Reset order',
      'aria-label': 'Put ' + name + "'s meals back in the usual order",
      onclick: () => {
        meals = clearOrder(meals, day);
        persist();
        renderNutrition();
        showMealStatus(name + "'s meals are back in the usual order.");
      },
    }));
  }

  const addMeal = el('button', {
    class: 'btn ghost small add-meal',
    type: 'button',
    text: '+ Add meal',
    'aria-label': 'Add a meal on ' + name,
    onclick: () => openMealForm(null, day),
  });
  const column = el('section', { class: 'meal-day' + (isToday ? ' today' : '') + (collapsed ? ' collapsed' : ''), 'aria-label': name, 'data-day': String(day) },
    head,
    foldBody(links, ...(totals.count > 0 ? macroRows(day) : []), ...dayMeals.map(mealCard), addMeal));
  return column;
}

// One row per macro: grams eaten that day, with a bar toward the target when one is set.
function macroRows(day) {
  const totals = dayMacroTotals(meals, day);
  if (MACROS.every((macro) => totals[macro] === 0 && !macroTargets[macro])) return [];
  return MACROS.map((macro) => {
    const target = macroTargets[macro];
    const progress = macroProgress(totals[macro], target);
    const text = totals[macro] + (target ? ' / ' + target : '') + ' g';
    const row = el('div', { class: 'macro-row' },
      el('div', { class: 'macro-row-text' }, el('span', { text: MACRO_LABELS[macro] }), el('span', { text })));
    if (progress) {
      const fill = el('div', { class: 'macro-fill ' + macro + (progress.over ? ' over' : '') });
      fill.style.width = progress.percent + '%';
      row.append(el('div', { class: 'macro-bar', role: 'img', 'aria-label': MACRO_LABELS[macro] + ' ' + progress.percent + ' percent of target' }, fill));
    }
    return row;
  });
}

// ---------- macro targets ----------
const targetInputs = {};
for (const macro of MACROS) {
  const input = el('input', { type: 'number', min: '0', max: String(MAX_GRAMS), inputmode: 'numeric', id: 'target-' + macro });
  input.addEventListener('change', () => saveTarget(macro, input));
  targetInputs[macro] = input;
  $('#macroTargets').append(el('div', { class: 'macro-target' },
    el('label', { class: 'field', for: 'target-' + macro }, MACRO_LABELS[macro] + ' (g)', input),
    el('div', { class: 'macro-bar' }, el('div', { class: 'macro-fill ' + macro, id: 'share-' + macro })),
    el('span', { class: 'macro-share', id: 'sharetext-' + macro })));
}

function saveTarget(macro, input) {
  const parsed = parseGrams(input.value, MACRO_LABELS[macro] + ' target');
  $('#targetError').textContent = parsed.error || '';
  if (parsed.error) {
    input.value = macroTargets[macro] === null ? '' : macroTargets[macro];
    return;
  }
  macroTargets[macro] = parsed.value;
  saveJson('macroTargets', macroTargets);
  renderNutrition();
}

function renderMacroTargets() {
  const shares = macroShares(macroTargets);
  for (const macro of MACROS) {
    const input = targetInputs[macro];
    if (document.activeElement !== input) input.value = macroTargets[macro] === null ? '' : macroTargets[macro];
    $('#share-' + macro).style.width = shares[macro] + '%';
    $('#sharetext-' + macro).textContent = macroTargets[macro] ? shares[macro] + '% of calories' : '';
  }
  const kcal = macroKcal(macroTargets);
  $('#macroTotal').textContent = kcal === 0
    ? 'No targets set yet. Enter your daily grams above.'
    : 'These targets add up to about ' + kcal.toLocaleString() + ' kcal a day.';
}

// A meal's details as lines: the time and calories together (with a dot between them), then
// protein / carbs / fat. A line is left out when it has nothing to show.
function detailLines(item) {
  const timeAndCalories = [item.time ? formatTime(item.time) : '', item.kcal ? item.kcal + ' kcal' : ''].filter(Boolean).join(' · ');
  const macros = MACROS.filter((macro) => item[macro]).map((macro) => MACRO_LABELS[macro][0] + ' ' + item[macro] + 'g').join(' · ');
  return [timeAndCalories, macros].filter(Boolean);
}

function mealCard(meal) {
  const prepBox = el('input', { type: 'checkbox', 'aria-label': 'Prepped: ' + meal.name });
  prepBox.checked = Boolean(meal.prepped);
  prepBox.addEventListener('change', () => {
    const wasDone = allPrepped(dayTotals(meals, meal.day));
    meal.prepped = prepBox.checked;
    const box = prepBox.getBoundingClientRect();
    persist();
    renderNutrition();
    if (!wasDone && allPrepped(dayTotals(meals, meal.day))) burstConfetti(box.left + box.width / 2, box.top + box.height / 2);
  });

  const main = el('button', {
    class: 'meal-main',
    type: 'button',
    'data-id': meal.id,
    'aria-label': 'Edit ' + meal.name + '. Drag, or press the left and right arrow keys, to move it to another day.',
    onclick: () => openMealForm(meal, meal.day),
  }, el('b', { text: meal.name }));
  for (const line of detailLines(meal)) main.append(el('span', { class: 'meal-meta', text: line }));
  if (meal.desc) main.append(el('span', { class: 'meal-desc', text: meal.desc }));

  const card = el('div', { class: 'meal-card' + (meal.prepped ? ' prepped' : ''), 'data-id': meal.id },
    el('label', { class: 'meal-check' }, prepBox), main);
  makeMealDraggable(card, main, meal.id, meal.day, (day, index) => placeMealAt(meal, day, index));
  main.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const target = WEEK_ORDER[WEEK_ORDER.indexOf(meal.day) + (event.key === 'ArrowLeft' ? -1 : 1)];
      if (target !== undefined) moveMealToDay(meal, target, true);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      // Up and down move it earlier or later within its day.
      event.preventDefault();
      const position = mealsOn(meals, meal.day).findIndex((other) => other.id === meal.id);
      const next = position + (event.key === 'ArrowUp' ? -1 : 1);
      if (next >= 0 && next < mealsOn(meals, meal.day).length) placeMealAt(meal, meal.day, next, true);
    }
  });
  return card;
}

// ---------- drag a meal onto a day, or into place within its day ----------
function dayUnder(x, y) {
  const column = [...document.querySelectorAll('.meal-day[data-day]')].find((candidate) => {
    const box = candidate.getBoundingClientRect();
    return x >= box.left && x < box.right && y >= box.top && y < box.bottom;
  });
  return column || null;
}

// Where a dragged meal would land in a day: how many of that day's other meals are above the pointer.
function insertionIndex(column, y, ignoreId) {
  const cards = [...column.querySelectorAll('.meal-card')].filter((card) => card.dataset.id !== ignoreId);
  return cards.filter((card) => {
    const box = card.getBoundingClientRect();
    return y > box.top + box.height / 2;
  }).length;
}

// Shows a thin line where the dragged meal would land (and removes any earlier line).
function showDropLine(column, index, ignoreId) {
  document.querySelectorAll('.drop-line').forEach((line) => line.remove());
  if (!column) return;
  const cards = [...column.querySelectorAll('.meal-card')].filter((card) => card.dataset.id !== ignoreId);
  column.insertBefore(el('div', { class: 'drop-line' }), cards[index] || column.querySelector('.add-meal'));
}

// Makes a meal card (or history entry) draggable by its text. A copy of the card follows the
// pointer, the day under it lights up, and a line shows where it would land. On release over a
// day, `onDrop(day, index)` runs with the day number and the position in that day (0 = first).
// `ownId` is the meal's own id (null for history) and `sourceDay` the day it sits on (or null);
// the day it came from does not light up.
function makeMealDraggable(card, handle, ownId, sourceDay, onDrop) {
  let ghost = null;
  let ignoreNextClick = false;
  const aim = (event) => {
    const column = dayUnder(event.clientX, event.clientY);
    const day = column ? Number(column.dataset.day) : null;
    return { column, day, index: column ? insertionIndex(column, event.clientY, ownId) : 0 };
  };
  const cleanup = () => {
    if (ghost) ghost.remove();
    ghost = null;
    card.classList.remove('drag-source');
    document.querySelectorAll('.meal-day.drop-target').forEach((column) => column.classList.remove('drop-target'));
    document.querySelectorAll('.drop-line').forEach((line) => line.remove());
  };
  const startGhost = () => {
    const box = card.getBoundingClientRect();
    ghost = card.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.removeAttribute('data-id');
    Object.assign(ghost.style, { position: 'fixed', left: box.left + 'px', top: box.top + 'px', width: box.width + 'px' });
    document.body.append(ghost);
    card.classList.add('drag-source');
  };
  // A drag ends with a click on the handle; swallow it so it does not open the editor.
  handle.addEventListener('click', (event) => {
    if (!ignoreNextClick) return;
    event.stopImmediatePropagation();
    event.preventDefault();
  }, true);

  makeDraggable(handle, {
    move: (event, dx, dy) => {
      if (!ghost) startGhost();
      ghost.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
      const { column, day, index } = aim(event);
      document.querySelectorAll('.meal-day[data-day]').forEach((other) => {
        other.classList.toggle('drop-target', other === column && day !== sourceDay);
      });
      showDropLine(column, index, ownId);
    },
    drop: (event) => {
      const { day, index } = aim(event);
      cleanup();
      ignoreNextClick = true;
      setTimeout(() => { ignoreNextClick = false; }, 0);
      if (day !== null) onDrop(day, index);
    },
    cancel: cleanup,
  });
}

// Puts a meal at a position in a day (reordering it within its day, or dropping it between the
// meals of another day). Everything else about it stays the same.
function placeMealAt(meal, day, index, keepFocus = false) {
  const sameDay = day === meal.day;
  meals = placeMeal(meals, meal.id, day, index);
  persist();
  renderNutrition();
  showMealStatus(sameDay ? 'Moved ' + meal.name + ' in ' + DAY_NAMES[day] + '.' : 'Moved ' + meal.name + ' to ' + DAY_NAMES[day] + '.');
  if (keepFocus) document.querySelector('.meal-main[data-id="' + meal.id + '"]')?.focus();
}

// Moves a meal to another day. Everything about it stays the same.
function moveMealToDay(meal, day, keepFocus = false) {
  meals = moveMeal(meals, meal.id, day);
  persist();
  renderNutrition();
  showMealStatus('Moved ' + meal.name + ' to ' + DAY_NAMES[day] + '.');
  if (keepFocus) document.querySelector('.meal-main[data-id="' + meal.id + '"]')?.focus();
}

// ---------- history of meals added before ----------
function historyPanel() {
  const toggle = el('button', {
    class: 'meal-day-toggle',
    type: 'button',
    'aria-expanded': String(!historyHidden),
    'aria-label': 'Meal history',
    onclick: () => {
      historyHidden = !historyHidden;
      saveJson('mealHistoryHidden', historyHidden);
      summaryLine.textContent = historySummary();
      setFolded(panel, toggle, historyHidden);
      updateExpandAll();
    },
  }, el('h3', { text: 'History' }), el('span', { class: 'chevron', 'aria-hidden': 'true' }));
  const historySummary = () => {
    if (history.length === 0) return 'Meals you add will show up here.';
    if (historyHidden) return history.length + (history.length === 1 ? ' meal saved' : ' meals saved');
    return 'Drag a meal onto a day, or tap one to choose days.';
  };
  const summaryLine = el('span', { class: 'meal-day-summary', text: historySummary() });
  const head = el('div', { class: 'meal-day-head' }, toggle, summaryLine);

  const search = el('input', {
    type: 'search',
    class: 'history-search',
    placeholder: 'Search past meals',
    'aria-label': 'Search past meals',
    value: historyQuery,
  });
  const list = el('div', { class: 'history-list' });
  const draw = () => {
    list.replaceChildren(...historyEntries());
  };
  search.addEventListener('input', () => {
    historyQuery = search.value;
    draw();
  });
  draw();
  const panel = el('section', { class: 'meal-day meal-history' + (historyHidden ? ' collapsed' : ''), 'aria-label': 'History of past meals' },
    head,
    foldBody(...(history.length > 5 ? [search] : []), list));
  return panel;
}

function historyEntries() {
  const shown = searchHistory(history, historyQuery);
  if (shown.length === 0 && history.length > 0) return [el('p', { class: 'empty', text: 'No past meals match that search.' })];
  return shown.map((template) => historyItem(template));
}

function historyItem(template) {
  const main = el('button', {
    class: 'meal-main',
    type: 'button',
    'aria-label': 'Add ' + template.name + ' to days',
    onclick: () => openCopy({ template }),
  }, el('b', { text: template.name }));
  for (const line of detailLines(template)) main.append(el('span', { class: 'meal-meta', text: line }));
  if (template.desc) main.append(el('span', { class: 'meal-desc', text: template.desc }));
  const remove = el('button', {
    class: 'history-remove',
    type: 'button',
    text: '✕',
    title: 'Remove from history',
    'aria-label': 'Remove ' + template.name + ' from history',
    onclick: () => {
      history = removeFromHistory(history, template);
      persist();
      renderNutrition();
    },
  });
  const card = el('div', { class: 'meal-card history-item' }, main, remove);
  makeMealDraggable(card, main, null, null, (day, index) => addFromHistory(template, [day], index));
  return card;
}

// Adds a meal from the history to each of the days (skipping days that already have it).
function addFromHistory(template, days, index = null) {
  const result = addTemplateToDays(meals, template, days, makeId);
  meals = result.meals;
  // Dropped between meals: put it right there.
  if (index !== null && result.added.length === 1) meals = placeMeal(meals, result.added[0].id, result.added[0].day, index);
  history = addToHistory(history, template);
  persist();
  renderNutrition();
  const skipped = result.skippedDays.length > 0 ? ' Skipped ' + dayList(result.skippedDays) + ', which already has it.' : '';
  showMealStatus(result.addedDays.length > 0
    ? 'Added ' + template.name + ' to ' + dayList(result.addedDays) + '.' + skipped
    : template.name + ' is already on ' + dayList(result.skippedDays) + ', so nothing was added.');
}

// ---------- add / edit a meal ----------
// The meal name is picked from a list of the usual kinds of meal. A meal saved earlier with some
// other name (like "Oats") keeps it: that name is added to the list while its box is open.
const mealNameBox = $('#mName');
// A new meal starts on "Select..." and cannot be saved until a kind is chosen.
mealNameBox.append(el('option', { value: '', text: 'Select...', disabled: '' }));
for (const slot of MEAL_SLOTS) mealNameBox.append(el('option', { value: slot, text: slot }));

function setMealName(name) {
  mealNameBox.querySelectorAll('option[data-extra]').forEach((option) => option.remove());
  if (name !== '' && !MEAL_SLOTS.includes(name)) mealNameBox.append(el('option', { value: name, text: name, 'data-extra': '' }));
  mealNameBox.value = name;
}

function openMealForm(meal, day) {
  editingMealId = meal ? meal.id : null;
  formDay = day;
  confirmingDelete = false;
  $('#mealDialogTitle').textContent = (meal ? 'Edit meal' : 'Add a meal') + ' — ' + DAY_NAMES[day];
  setMealName(meal ? meal.name : '');
  $('#mDesc').value = meal ? meal.desc : '';
  $('#mTime').value = meal ? meal.time : '';
  $('#mKcal').value = meal && meal.kcal !== null ? meal.kcal : '';
  $('#mProtein').value = meal && meal.protein ? meal.protein : '';
  $('#mCarb').value = meal && meal.carb ? meal.carb : '';
  $('#mFat').value = meal && meal.fat ? meal.fat : '';
  $('#mPrepped').checked = meal ? Boolean(meal.prepped) : false;
  $('#mealError').textContent = '';
  const others = meal ? linkedMeals(meals, meal) : [];
  $('#mealLinkedNote').hidden = others.length === 0;
  $('#mealLinkedNote').textContent = 'This meal is also on ' + dayList(others)
    + '. When you save changes, you will be asked whether to apply them to all of those days or just this one.';
  $('#mealCopy').hidden = !meal;
  const deleteButton = $('#mealDelete');
  deleteButton.hidden = !meal;
  deleteButton.textContent = 'Delete';
  mealDialog.showModal();
  mealGuard.reset();
  $('#mName').focus();
}

$('#mealForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('#mName').value.trim();
  const kcal = parseKcal($('#mKcal').value);
  if (!name) {
    $('#mealError').textContent = 'Choose what kind of meal this is.';
    return;
  }
  const grams = {
    protein: parseGrams($('#mProtein').value, 'Protein'),
    carb: parseGrams($('#mCarb').value, 'Carbs'),
    fat: parseGrams($('#mFat').value, 'Fat'),
  };
  const problem = [kcal, ...Object.values(grams)].find((parsed) => parsed.error);
  if (problem) {
    $('#mealError').textContent = problem.error;
    return;
  }
  const fields = {
    name,
    desc: $('#mDesc').value.trim(),
    time: $('#mTime').value,
    kcal: kcal.value,
    protein: grams.protein.value,
    carb: grams.carb.value,
    fat: grams.fat.value,
    prepped: $('#mPrepped').checked,
  };
  if (!editingMealId) {
    const added = { id: makeId(), day: formDay, ...fields };
    meals.push(added);
    finishMealSave(added);
    return;
  }
  const meal = meals.find((m) => m.id === editingMealId);
  const others = linkedMeals(meals, meal);
  if (others.length === 0 || !changesSharedDetails(meal, fields)) {
    Object.assign(meal, fields);
    finishMealSave(meal);
    return;
  }
  // Other days hold copies of this meal: ask whether the change should reach them too.
  pendingEdit = { meal, fields };
  $('#linkedMealText').textContent = 'This meal is also on ' + dayList(others)
    + '. Apply your changes to all of those days, or just to ' + DAY_NAMES[meal.day] + '?';
  linkedMealDialog.showModal();
});

function finishMealSave(savedMeal) {
  remember(savedMeal);
  persist();
  mealDialog.close();
  renderNutrition();
}

// "Wednesday and Friday", "Tuesday, Wednesday and Friday": the days of some meals (or day
// numbers), Monday first.
function dayList(items) {
  const days = items.map((item) => (typeof item === 'number' ? item : item.day));
  const names = WEEK_ORDER.filter((day) => days.includes(day)).map((day) => DAY_NAMES[day]);
  return names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

// ---------- edit a meal that was copied to other days ----------
const linkedMealDialog = $('#linkedMealDialog');
let pendingEdit = null;

function finishLinkedEdit(applyToAll) {
  const { meal, fields } = pendingEdit;
  pendingEdit = null;
  linkedMealDialog.close();
  if (applyToAll) meals = applyToLinked(meals, meal, fields);
  const saved = meals.find((m) => m.id === meal.id);
  Object.assign(saved, applyToAll ? { prepped: fields.prepped } : fields);
  finishMealSave(saved);
}

$('#linkedMealAll').addEventListener('click', () => finishLinkedEdit(true));
$('#linkedMealOne').addEventListener('click', () => finishLinkedEdit(false));
for (const id of ['#linkedMealBack', '#linkedMealClose']) {
  $(id).addEventListener('click', () => linkedMealDialog.close());
}
// Closing the question any other way leaves the meal as it was and keeps the form open.
linkedMealDialog.addEventListener('close', () => {
  pendingEdit = null;
});
closeOnBackdropClick(linkedMealDialog);

// Deleting takes two presses so a stray tap does not remove a meal.
$('#mealDelete').addEventListener('click', () => {
  if (!confirmingDelete) {
    confirmingDelete = true;
    $('#mealDelete').textContent = 'Really delete?';
    return;
  }
  meals = meals.filter((m) => m.id !== editingMealId);
  persist();
  mealDialog.close();
  renderNutrition();
});

const mealGuard = protectUnsavedChanges(mealDialog, () => formState($('#mealForm')));
$('#mealClose').addEventListener('click', () => mealDialog.close());
$('#mealCancel').addEventListener('click', () => mealDialog.close());

// ---------- saved weekly meal plans ----------
// "Save weekly meal plan" keeps a copy of every meal in the week (nothing ticked as prepped), and
// "Load saved meal plan" puts one of those copies back in place of the current week.
const storedPlans = loadJson('mealPlans', []);
let savedPlans = Array.isArray(storedPlans) ? storedPlans : [];
const savePlanDialog = $('#savePlanDialog');
const loadPlanDialog = $('#loadPlanDialog');
// The plan whose Load or Delete button was pressed once and is waiting for a second press.
let confirming = null;

function persistPlans() {
  saveJson('mealPlans', savedPlans);
}

$('#savePlanBtn').addEventListener('click', () => {
  $('#planName').value = defaultPlanName(new Date(), savedPlans);
  $('#savePlanError').textContent = '';
  $('#savePlanSummary').textContent = meals.length === 0
    ? 'There are no meals in this week yet, so there is nothing to save.'
    : 'This will save ' + planSummary({ meals }) + '.';
  savePlanDialog.showModal();
  savePlanGuard.reset();
  $('#planName').select();
});

$('#savePlanForm').addEventListener('submit', (event) => {
  event.preventDefault();
  if (meals.length === 0) {
    $('#savePlanError').textContent = 'Add some meals to the week first.';
    return;
  }
  const problem = validatePlanName($('#planName').value, savedPlans);
  if (problem) {
    $('#savePlanError').textContent = problem;
    return;
  }
  const plan = snapshotPlan(meals, $('#planName').value, new Date().toISOString(), makeId);
  savedPlans = [plan, ...savedPlans];
  persistPlans();
  savePlanDialog.close();
  showMealStatus('Saved "' + plan.name + '" (' + planSummary(plan) + ').');
});

$('#loadPlanBtn').addEventListener('click', () => {
  confirming = null;
  renderPlanList();
  loadPlanDialog.showModal();
});

function renderPlanList() {
  const list = $('#planList');
  $('#loadPlanHelp').hidden = savedPlans.length === 0;
  if (savedPlans.length === 0) {
    list.replaceChildren(el('li', { class: 'empty', text: 'No saved plans yet. Use "Save weekly meal plan" to keep one.' }));
    return;
  }
  list.replaceChildren(...savedPlans.map((plan) => {
    const saved = new Date(plan.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const asking = confirming && confirming.id === plan.id ? confirming.action : null;
    const row = el('li', { class: 'plan-item' },
      el('div', { class: 'plan-info' },
        el('b', { text: plan.name }),
        el('span', { text: 'Saved ' + saved + ' · ' + planSummary(plan) })));
    if (asking) {
      row.append(el('div', { class: 'plan-confirm' },
        el('span', { text: asking === 'load' ? 'Replace this week\'s meals?' : 'Delete this plan?' }),
        el('button', {
          class: 'btn small' + (asking === 'delete' ? ' danger' : ''),
          type: 'button',
          text: asking === 'load' ? 'Yes, load it' : 'Yes, delete',
          onclick: () => (asking === 'load' ? loadPlan(plan) : deletePlan(plan)),
        }),
        el('button', {
          class: 'btn ghost small',
          type: 'button',
          text: 'Cancel',
          onclick: () => {
            confirming = null;
            renderPlanList();
          },
        })));
    } else {
      row.append(el('div', { class: 'plan-buttons' },
        el('button', {
          class: 'btn small',
          type: 'button',
          text: 'Load',
          'aria-label': 'Load ' + plan.name,
          onclick: () => {
            confirming = { id: plan.id, action: 'load' };
            renderPlanList();
          },
        }),
        el('button', {
          class: 'btn danger small',
          type: 'button',
          text: 'Delete',
          'aria-label': 'Delete ' + plan.name,
          onclick: () => {
            confirming = { id: plan.id, action: 'delete' };
            renderPlanList();
          },
        })));
    }
    return row;
  }));
}

function loadPlan(plan) {
  meals = mealsFromPlan(plan, makeId);
  persist();
  confirming = null;
  loadPlanDialog.close();
  renderNutrition();
  showMealStatus('Loaded "' + plan.name + '" (' + planSummary(plan) + '). Everything starts unticked.');
}

function deletePlan(plan) {
  savedPlans = savedPlans.filter((other) => other.id !== plan.id);
  persistPlans();
  confirming = null;
  renderPlanList();
}

const savePlanGuard = protectUnsavedChanges(savePlanDialog, () => formState($('#savePlanForm')));
$('#savePlanClose').addEventListener('click', () => savePlanDialog.close());
$('#savePlanCancel').addEventListener('click', () => savePlanDialog.close());
closeOnBackdropClick(loadPlanDialog);
$('#loadPlanClose').addEventListener('click', () => loadPlanDialog.close());

// ---------- copy a day, or one meal, to other days ----------
// `copySource` is { day } to copy a whole day, or { meal } to copy just that meal.
let copySource = null;

function openCopy(source) {
  copySource = source;
  const from = source.meal ? source.meal.day : source.day;
  if (source.template) $('#copyTitle').textContent = 'Add ' + source.template.name + ' to days';
  else $('#copyTitle').textContent = source.meal ? 'Copy ' + source.meal.name + ' to other days' : 'Copy ' + DAY_NAMES[from] + "'s meals";
  $('#copyNote').textContent = source.meal || source.template
    ? 'Adds this meal to the chosen days and keeps the other meals already there. It starts as not prepped.'
    : 'Meals already on the chosen days are replaced. Copies start as not prepped.';
  $('#copyError').textContent = '';
  // A day's own meal can only go to the other days; a history meal can go to any day.
  const otherDays = WEEK_ORDER.filter((other) => other !== from).map((index) => ({ name: DAY_NAMES[index], index }));
  $('#copyDays').replaceChildren(...otherDays.map(({ name, index }) => {
    return el('button', {
      class: 'day-chip',
      type: 'button',
      text: name.slice(0, 3),
      'data-day': String(index),
      'aria-pressed': 'false',
      onclick: (event) => {
        const chip = event.currentTarget;
        chip.setAttribute('aria-pressed', chip.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      },
    });
  }));
  copyDialog.showModal();
  copyGuard.reset();
}

let statusTimer = null;
function showMealStatus(message) {
  $('#mealStatus').textContent = message;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { $('#mealStatus').textContent = ''; }, 8000);
}

$('#copyForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const targets = [...$('#copyDays').querySelectorAll('[aria-pressed="true"]')].map((chip) => Number(chip.dataset.day));
  if (targets.length === 0) {
    $('#copyError').textContent = 'Pick at least one day to copy to.';
    return;
  }
  if (copySource.template) {
    copyDialog.close();
    addFromHistory(copySource.template, targets);
    return;
  }
  if (copySource.meal) {
    const result = copyMeal(meals, copySource.meal, targets, makeId);
    meals = result.meals;
    const skipped = result.skippedDays.length > 0 ? ' Skipped ' + dayList(result.skippedDays) + ', which already has it.' : '';
    showMealStatus(result.copiedDays.length > 0
      ? 'Copied ' + copySource.meal.name + ' to ' + dayList(result.copiedDays) + '.' + skipped
      : copySource.meal.name + ' is already on ' + dayList(result.skippedDays) + ', so nothing was copied.');
  } else {
    meals = copyDay(meals, copySource.day, targets, makeId);
    showMealStatus('Copied ' + DAY_NAMES[copySource.day] + "'s meals to " + dayList(targets) + '.');
  }
  persist();
  copyDialog.close();
  renderNutrition();
});

const copyGuard = protectUnsavedChanges(copyDialog, () => formState($('#copyForm')));
$('#copyClose').addEventListener('click', () => copyDialog.close());
$('#copyCancel').addEventListener('click', () => copyDialog.close());

// From the edit box, copy the saved version of this meal.
$('#mealCopy').addEventListener('click', () => {
  const meal = meals.find((m) => m.id === editingMealId);
  mealDialog.close();
  openCopy({ meal });
});
