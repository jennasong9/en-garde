import { $, closeOnBackdropClick, el } from './dom.js';
import { showDialog } from './dialog-motion.js';
import { download, printSheetElement } from './export-plan.js';
import { DEFAULT_GLASS_GOAL, MAX_GLASS_GOAL, MACROS, mealWeekStart } from './meals.js';
import { EXPORT_FORMATS } from './mealexport.js';
import {
  MACRO_RULE,
  dayLabel,
  hydrationLine,
  hydrationReport,
  hydrationSummaryLine,
  macroLine,
  macroReport,
  macroSummaryLine,
  reportAsText,
  reportDays,
  weekLabel,
} from './reportexport.js';
import { toIso } from './schedule.js';
import { loadJson } from './storage.js';

// The "Export weekly report" pop-up on the Nutrition page: the user picks Hydration and/or macro
// targets and a format, and the Monday to Sunday week so far is downloaded as a text file or sent
// to the browser's print window (which can save a PDF). It reads the same saved history as the
// "Last 7 days" charts.

const TITLE = 'En Garde weekly report';
const reportDialog = $('#reportDialog');
const REPORT_FORMATS = ['text', 'print'];

const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

function savedGlassGoal() {
  const goal = asObject(loadJson('hydration', {})).goal;
  return Number.isInteger(goal) && goal >= 1 && goal <= MAX_GLASS_GOAL ? goal : DEFAULT_GLASS_GOAL;
}

const hasMacroTargets = () => {
  const targets = asObject(loadJson('macroTargets', {}));
  return MACROS.some((macro) => Number.isFinite(targets[macro]) && targets[macro] > 0);
};

// The week so far, Monday to Sunday, for whichever sections are chosen.
function buildReport({ water, macros }) {
  const todayIso = toIso(new Date());
  const days = reportDays(mealWeekStart(new Date()));
  return {
    title: TITLE,
    fencer: String(asObject(loadJson('profile', {})).name || ''),
    days,
    hydration: water ? hydrationReport(asObject(loadJson('hydrationLog', {})), days, todayIso, savedGlassGoal()) : null,
    macros: macros ? macroReport(asObject(loadJson('macroLog', {})), days, todayIso) : null,
  };
}

function tableOf(headings, rows) {
  return el('table', {},
    el('thead', {}, el('tr', {}, ...headings.map((heading) => el('th', { text: heading })))),
    el('tbody', {}, ...rows.map((cells) => el('tr', {}, ...cells.map((cell) => el('td', { text: cell }))))));
}

// A sheet for the printer (see "printing-plan" in style.css, which hides everything else).
function printSheet(report) {
  const sheet = el('div', { id: 'printSheet' }, el('h1', { text: report.title }));
  if (report.fencer) sheet.append(el('p', { class: 'print-extra', text: 'Fencer: ' + report.fencer }));
  sheet.append(el('p', { class: 'print-extra', text: 'Week of ' + weekLabel(report.days) }));
  if (report.hydration) {
    sheet.append(el('section', {}, el('h2', { text: 'Hydration' }),
      tableOf(['Day', 'Result'], report.hydration.rows.map((row) => [dayLabel(row.iso), hydrationLine(row)])),
      el('p', { text: hydrationSummaryLine(report.hydration) })));
  }
  if (report.macros) {
    sheet.append(el('section', {}, el('h2', { text: 'Macro targets' }),
      el('p', { class: 'print-numbers', text: MACRO_RULE }),
      tableOf(['Day', 'Result'], report.macros.rows.map((row) => [dayLabel(row.iso), macroLine(row)])),
      el('p', { text: macroSummaryLine(report.macros) })));
  }
  return sheet;
}

// `onDone` shows a message on the page.
export function initExportReport(onDone) {
  $('#reportFormats').replaceChildren(...REPORT_FORMATS.map((name, index) => el('label', { class: 'export-format' },
    el('input', { type: 'radio', name: 'reportFormat', value: name, ...(index === 0 ? { checked: '' } : {}) }),
    el('span', {}, el('b', { text: EXPORT_FORMATS[name].label }), el('small', { text: EXPORT_FORMATS[name].note })))));

  $('#reportBtn').addEventListener('click', () => {
    const macrosSet = hasMacroTargets();
    $('#reportWater').checked = true;
    $('#reportMacros').checked = macrosSet;
    $('#reportMacros').disabled = !macrosSet;
    $('#reportMacrosNote').textContent = macrosSet
      ? 'Grams of each macro from prepped meals against your targets, and the days you hit them.'
      : 'None set yet. Set them under Daily macro targets.';
    $('#reportSummary').textContent = 'The report covers this week, Monday to Sunday: ' + weekLabel(reportDays(mealWeekStart(new Date()))) + '.';
    $('#reportError').textContent = '';
    document.querySelector('input[name="reportFormat"]').checked = true;
    showDialog(reportDialog);
  });

  $('#reportForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const choice = { water: $('#reportWater').checked, macros: $('#reportMacros').checked };
    if (!choice.water && !choice.macros) {
      $('#reportError').textContent = 'Choose Hydration, Macro targets, or both to export.';
      return;
    }
    const report = buildReport(choice);
    const format = document.querySelector('input[name="reportFormat"]:checked').value;
    reportDialog.close();
    if (format === 'print') {
      printSheetElement(printSheet(report));
      return;
    }
    const filename = 'weekly-report-' + report.days[0] + '.txt';
    download(reportAsText(report), 'text/plain;charset=utf-8', filename);
    onDone('Exported your weekly report as ' + filename + '.');
  });

  $('#reportCancel').addEventListener('click', () => reportDialog.close());
  $('#reportClose').addEventListener('click', () => reportDialog.close());
  closeOnBackdropClick(reportDialog);
}
