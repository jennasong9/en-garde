// Pure logic for exporting the weekly meal plan: no DOM, no storage, so it can be tested alone.
import { DAY_NAMES, MACROS, macroKcal, mealsOn } from './meals.js';
import { formatTime } from './schedule.js';

// The ways to export: the name shown, the file ending (none for printing) and what it is for.
export const EXPORT_FORMATS = {
  text: { label: 'Text file', note: 'Easy to read, or to send to a coach.', extension: 'txt' },
  excel: { label: 'Spreadsheet', note: 'Opens in Excel, Google Sheets or Numbers.', extension: 'xlsx' },
  print: { label: 'Print or save as PDF', note: 'Opens your browser\'s print window.', extension: '' },
};

// The week as Monday to Sunday, each with its meals in the order they are shown in the plan.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function planDays(meals) {
  return WEEK_ORDER.map((day) => ({ day, name: DAY_NAMES[day], meals: mealsOn(meals, day) }));
}

const has = (value) => value !== null && value !== undefined && value !== '';

// A meal's numbers as short text: "450 kcal, protein 20 g, carbs 70 g, fat 10 g" (only those filled in).
function numbersText(meal) {
  const parts = [];
  if (has(meal.kcal)) parts.push(meal.kcal + ' kcal');
  if (has(meal.protein)) parts.push('protein ' + meal.protein + ' g');
  if (has(meal.carb)) parts.push('carbs ' + meal.carb + ' g');
  if (has(meal.fat)) parts.push('fat ' + meal.fat + ' g');
  return parts.join(', ');
}

export function dayCalories(dayMeals) {
  return dayMeals.reduce((sum, meal) => sum + (has(meal.kcal) ? Number(meal.kcal) : 0), 0);
}

// What to add to an export besides the meals, as `extras`: `targets` ({ protein, carb, fat } in
// grams) for the daily macro targets, `glassGoal` for the water tracking. Leave one out to leave
// it out of the export.
const MACRO_WORDS = { protein: 'protein', carb: 'carbs', fat: 'fat' };

// "protein 150 g, carbs 250 g, fat 70 g (about 2230 kcal)", or '' when no target is set.
export function targetsText(targets) {
  const parts = MACROS.filter((macro) => targets[macro] > 0).map((macro) => MACRO_WORDS[macro] + ' ' + targets[macro] + ' g');
  return parts.length === 0 ? '' : parts.join(', ') + ' (about ' + macroKcal(targets) + ' kcal)';
}

export const glassGoalText = (glassGoal) => glassGoal + (glassGoal === 1 ? ' glass' : ' glasses') + ' a day';

// The plan as plain text, a day at a time.
export function planAsText(title, meals, { targets = null, glassGoal = null } = {}) {
  const lines = [title];
  const targetLine = targets ? targetsText(targets) : '';
  const header = [targetLine && 'Daily macro targets: ' + targetLine, glassGoal && 'Water: ' + glassGoalText(glassGoal)].filter(Boolean);
  if (header.length > 0) lines.push('', ...header);
  for (const day of planDays(meals)) {
    lines.push('', day.name);
    if (day.meals.length === 0) {
      lines.push('  No meals planned');
      continue;
    }
    for (const meal of day.meals) {
      lines.push('  ' + meal.name + (meal.time ? ', ' + formatTime(meal.time) : ''));
      if (meal.desc) lines.push('    ' + meal.desc);
      const numbers = numbersText(meal);
      if (numbers) lines.push('    ' + numbers);
    }
    const total = dayCalories(day.meals);
    if (total > 0) lines.push('  Day total: ' + total + ' kcal');
  }
  return lines.join('\n') + '\n';
}

// The plan as a sheet for a spreadsheet: `rows` of cells ({ value, bold }, or null for an empty
// cell) and the ranges to `merges` (such as "A2:A4"). If the targets or the water goal are asked
// for, they come first as their own small table (so they are not read as part of the meals, or as
// a total of them), then a blank row, then the meals. A day is written once and merged down its
// meals, so each day reads as one block.
const cell = (value, bold = false) => (has(value) ? { value, bold } : null);
const headingRow = (headings) => headings.map((heading) => cell(heading, true));

export function planAsSheet(meals, { targets = null, glassGoal = null } = {}) {
  const rows = [];
  const merges = [];
  const hasTargets = targets && MACROS.some((macro) => targets[macro] > 0);
  if (hasTargets || glassGoal) {
    const headings = ['Daily targets'];
    const values = [cell('Every day', true)];
    if (hasTargets) {
      headings.push('Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)');
      values.push(cell(macroKcal(targets)), cell(targets.protein), cell(targets.carb), cell(targets.fat));
    }
    if (glassGoal) {
      headings.push('Water (glasses)');
      values.push(cell(glassGoal));
    }
    rows.push(headingRow(headings), values, []);
  }
  rows.push(headingRow(['Day', 'Meal', 'Time', "What's in it", 'Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)']));
  for (const day of planDays(meals)) {
    const first = rows.length + 1;
    day.meals.forEach((meal, index) => {
      rows.push([index === 0 ? cell(day.name, true) : null, cell(meal.name), cell(formatTime(meal.time)), cell(meal.desc),
        cell(meal.kcal), cell(meal.protein), cell(meal.carb), cell(meal.fat)]);
    });
    if (day.meals.length > 1) merges.push('A' + first + ':A' + (first + day.meals.length - 1));
  }
  return { rows, merges };
}
