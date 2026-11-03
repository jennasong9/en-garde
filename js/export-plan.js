import { $, closeOnBackdropClick, el } from './dom.js';
import { showDialog } from './dialog-motion.js';
import { DEFAULT_GLASS_GOAL, MACROS, MAX_GLASS_GOAL } from './meals.js';
import { EXPORT_FORMATS, dayCalories, glassGoalText, planAsSheet, planAsText, planDays, targetsText } from './mealexport.js';
import { planSummary } from './mealplans.js';
import { formatTime, toIso } from './schedule.js';
import { loadJson } from './storage.js';
import { sheetToXlsx } from './xlsx.js';

// The "Export meal plan" pop-up: the user picks a format (and whether to add the daily macro targets
// and the water tracking) and the current week's plan is downloaded as a file, or sent to the
// browser's print window.

const TITLE = 'Weekly meal plan';
const exportDialog = $('#exportPlanDialog');

// The macro targets set on the Nutrition page, or null when none is set.
function savedTargets() {
  const saved = loadJson('macroTargets', {});
  const targets = {};
  for (const macro of MACROS) targets[macro] = saved && Number.isFinite(saved[macro]) && saved[macro] > 0 ? saved[macro] : null;
  return MACROS.some((macro) => targets[macro]) ? targets : null;
}

// The daily water goal (glasses), as set on the Nutrition page.
function savedGlassGoal() {
  const saved = loadJson('hydration', {});
  const goal = saved && saved.goal;
  return Number.isInteger(goal) && goal >= 1 && goal <= MAX_GLASS_GOAL ? goal : DEFAULT_GLASS_GOAL;
}

// A small empty square to tick with a pen, like the ticks on the page.
const tickBox = () => el('span', { class: 'print-box', 'aria-hidden': 'true' });

// A sheet laid out for the printer, with a box to tick beside every meal and every glass of water,
// so the plan can be tracked on paper the way it is on the page. It is added to the page only
// while printing (see "printing-plan" in style.css, which hides everything else).
function printSheet(meals, { targets, glassGoal }) {
  const sheet = el('div', { id: 'printSheet' }, el('h1', { text: TITLE }));
  const targetLine = targets ? targetsText(targets) : '';
  if (targetLine) sheet.append(el('p', { class: 'print-extra', text: 'Daily macro targets: ' + targetLine }));
  if (glassGoal) sheet.append(el('p', { class: 'print-extra', text: 'Water: ' + glassGoalText(glassGoal) }));
  for (const day of planDays(meals)) {
    const list = el('ul', { class: 'print-meals' }, ...day.meals.map((meal) => {
      const details = el('span', {}, el('b', { text: meal.name }));
      if (meal.time) details.append(' · ' + formatTime(meal.time));
      if (meal.desc) details.append(el('div', { text: meal.desc }));
      const numbers = [meal.kcal ? meal.kcal + ' kcal' : '', meal.protein ? 'protein ' + meal.protein + ' g' : '',
        meal.carb ? 'carbs ' + meal.carb + ' g' : '', meal.fat ? 'fat ' + meal.fat + ' g' : ''].filter(Boolean).join(', ');
      if (numbers) details.append(el('div', { class: 'print-numbers', text: numbers }));
      return el('li', {}, tickBox(), details);
    }));
    const total = dayCalories(day.meals);
    const section = el('section', {}, el('h2', { text: day.name + (total > 0 ? ' · ' + total + ' kcal' : '') }),
      day.meals.length === 0 ? el('p', { text: 'No meals planned' }) : list);
    if (glassGoal) {
      section.append(el('div', { class: 'print-water' }, el('span', { text: 'Water' }),
        ...Array.from({ length: glassGoal }, tickBox)));
    }
    sheet.append(section);
  }
  return sheet;
}

function print(meals, extras) {
  const sheet = printSheet(meals, extras);
  document.body.append(sheet);
  document.body.classList.add('printing-plan');
  window.addEventListener('afterprint', () => {
    document.body.classList.remove('printing-plan');
    sheet.remove();
  }, { once: true });
  window.print();
}

function download(content, type, filename) {
  const link = el('a', { href: URL.createObjectURL(new Blob([content], { type })), download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// `getMeals` returns the meals in the current week; `onDone` shows a message on the page.
export function initExportPlan(getMeals, onDone) {
  $('#exportFormats').replaceChildren(...Object.entries(EXPORT_FORMATS).map(([name, format], index) => el('label', { class: 'export-format' },
    el('input', { type: 'radio', name: 'exportFormat', value: name, ...(index === 0 ? { checked: '' } : {}) }),
    el('span', {}, el('b', { text: format.label }), el('small', { text: format.note })))));

  $('#exportPlanBtn').addEventListener('click', () => {
    const meals = getMeals();
    $('#exportSummary').textContent = meals.length === 0
      ? 'There are no meals in this week yet, so there is nothing to export.'
      : 'This exports ' + planSummary({ meals }) + '.';
    $('#exportGo').disabled = meals.length === 0;
    document.querySelector('input[name="exportFormat"]').checked = true;

    // The extras start unticked. Targets can only be included once some are set on the Nutrition page.
    const targets = savedTargets();
    $('#exportTargets').checked = false;
    $('#exportTargets').disabled = targets === null;
    $('#exportTargetsNote').textContent = targets ? targetsText(targets) : 'None set yet. Set them under Daily macro targets.';
    $('#exportWater').checked = false;
    $('#exportWaterNote').textContent = 'Your goal: ' + glassGoalText(savedGlassGoal());
    showDialog(exportDialog);
  });

  $('#exportPlanForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const meals = getMeals();
    if (meals.length === 0) return;
    const extras = {
      targets: $('#exportTargets').checked ? savedTargets() : null,
      glassGoal: $('#exportWater').checked ? savedGlassGoal() : null,
    };
    const format = document.querySelector('input[name="exportFormat"]:checked').value;
    const filename = 'meal-plan-' + toIso(new Date());
    exportDialog.close();
    if (format === 'print') {
      print(meals, extras);
      return;
    }
    if (format === 'excel') download(sheetToXlsx(planAsSheet(meals, extras)), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename + '.xlsx');
    else download(planAsText(TITLE, meals, extras), 'text/plain;charset=utf-8', filename + '.txt');
    onDone('Exported your meal plan as ' + filename + '.' + EXPORT_FORMATS[format].extension + '.');
  });

  $('#exportPlanCancel').addEventListener('click', () => exportDialog.close());
  $('#exportPlanClose').addEventListener('click', () => exportDialog.close());
  closeOnBackdropClick(exportDialog);
}
