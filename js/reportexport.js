// Pure logic for the weekly Hydration and macro report: no DOM, no storage, so it can be tested alone.
import { DAY_NAMES, OUNCES_PER_GLASS, macroDayResult } from './meals.js';
import { addDays, parseIso } from './schedule.js';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MACRO_NAMES = { protein: 'Protein', carb: 'Carbs', fat: 'Fat' };

// The seven days of the week that starts on `weekStartIso` (a Monday), oldest first.
export function reportDays(weekStartIso) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStartIso, index));
}

// "Mon Nov 16"
export function dayLabel(iso) {
  const date = parseIso(iso);
  return DAY_NAMES[date.getDay()].slice(0, 3) + ' ' + MONTH_NAMES[date.getMonth()] + ' ' + date.getDate();
}

// "Nov 16 to Nov 22, 2026"
export function weekLabel(days) {
  const first = parseIso(days[0]);
  const last = parseIso(days[days.length - 1]);
  return MONTH_NAMES[first.getMonth()] + ' ' + first.getDate() + ' to ' + MONTH_NAMES[last.getMonth()] + ' ' + last.getDate() + ', ' + last.getFullYear();
}

// Water for each day: glasses against the goal that day. A day after today is 'future', and a
// past day with nothing saved is 'nodata' (not a made-up zero). Today with nothing saved is 0
// glasses against `todayGoal`.
export function hydrationReport(log, days, todayIso, todayGoal) {
  const rows = days.map((iso) => {
    const saved = log[iso];
    if (iso > todayIso) return { iso, state: 'future' };
    if (!saved && iso !== todayIso) return { iso, state: 'nodata' };
    const glasses = saved ? saved.glasses : 0;
    const goal = saved ? saved.goal : todayGoal;
    return { iso, state: goal ? 'logged' : 'nodata', glasses, goal, ounces: glasses * OUNCES_PER_GLASS, met: goal ? glasses >= goal : false };
  });
  const logged = rows.filter((row) => row.state === 'logged');
  return {
    rows,
    recordedDays: logged.length,
    metDays: logged.filter((row) => row.met).length,
    totalGlasses: logged.reduce((sum, row) => sum + row.glasses, 0),
  };
}

// Macros for each day from the prepped meals, against that day's targets.
export function macroReport(log, days, todayIso) {
  const rows = days.map((iso) => {
    if (iso > todayIso) return { iso, state: 'future' };
    const saved = log[iso];
    const result = saved ? macroDayResult(saved, saved.targets || {}) : null;
    if (!result || Object.keys(result.macros).length === 0) return { iso, state: 'nodata' };
    return {
      iso,
      state: 'logged',
      allHit: result.allHit,
      macros: Object.entries(result.macros).map(([macro, outcome]) => ({
        macro, grams: saved[macro], target: saved.targets[macro], percent: outcome.percent, hit: outcome.hit,
      })),
    };
  });
  const logged = rows.filter((row) => row.state === 'logged');
  return { rows, recordedDays: logged.length, hitDays: logged.filter((row) => row.allHit).length };
}

export const hydrationLine = (row) => {
  if (row.state === 'future') return 'not yet';
  if (row.state === 'nodata') return 'nothing recorded';
  return row.glasses + ' of ' + row.goal + ' glasses (' + row.ounces + ' oz)' + (row.met ? ', goal reached' : '');
};

export const macroLine = (row) => {
  if (row.state === 'future') return 'not yet';
  if (row.state === 'nodata') return 'nothing recorded (no targets set, or no meals prepped)';
  return row.macros.map((entry) => MACRO_NAMES[entry.macro] + ' ' + entry.grams + ' of ' + entry.target + ' g (' + entry.percent + '%)').join(', ')
    + (row.allHit ? ', all targets hit' : ', not all targets hit');
};

export const hydrationSummaryLine = (report) => (report.recordedDays === 0
  ? 'No days recorded this week.'
  : 'Goal reached on ' + report.metDays + ' of ' + report.recordedDays + ' recorded ' + (report.recordedDays === 1 ? 'day' : 'days')
    + '. Total: ' + report.totalGlasses + ' glasses (' + report.totalGlasses * OUNCES_PER_GLASS + ' oz).');

export const macroSummaryLine = (report) => (report.recordedDays === 0
  ? 'No days recorded this week.'
  : 'All targets hit on ' + report.hitDays + ' of ' + report.recordedDays + ' recorded ' + (report.recordedDays === 1 ? 'day' : 'days') + '.');

const MACRO_RULE = 'Only meals ticked as prepped count. A macro is hit when it lands within 90 to 110% of its target.';

// The whole report as plain text. `hydration` and `macros` are the reports above, or null when left out.
export function reportAsText({ title, fencer, days, hydration, macros }) {
  const lines = [title, fencer ? 'Fencer: ' + fencer : '', 'Week of ' + weekLabel(days), ''].filter((line, index) => index !== 1 || line);
  if (lines[lines.length - 1] !== '') lines.push('');
  if (hydration) {
    lines.push('HYDRATION', ...hydration.rows.map((row) => dayLabel(row.iso) + ': ' + hydrationLine(row)), hydrationSummaryLine(hydration), '');
  }
  if (macros) {
    lines.push('MACRO TARGETS', MACRO_RULE, ...macros.rows.map((row) => dayLabel(row.iso) + ': ' + macroLine(row)), macroSummaryLine(macros), '');
  }
  return lines.join('\n');
}

export { MACRO_RULE };
