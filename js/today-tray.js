import { $, el } from './dom.js';
import { DEFAULT_GLASS_GOAL, glassesToday } from './meals.js';
import { SESSION_TYPES, formatTime, toIso, weekStats } from './schedule.js';
import { setFoldSummary } from './foldable-cards.js';
import { loadJson } from './storage.js';
import { mealWhen, todayItems, todayLine, weekLine } from './today.js';

// The "Today" box at the top of every page: today's sessions with a Done tick, the next meal with a
// Prepped tick, and a "+1 glass" button. It reads the saved data each time it is drawn, and asks the
// Schedule, Nutrition and Hydration code to make a change by sending a page event (so each keeps
// ownership of its own data).

const MAX_ROWS_SHOWN = 6;

const savedList = (key) => {
  const saved = loadJson(key, []);
  return Array.isArray(saved) ? saved : [];
};

function ask(name, detail) {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}

// A tick box that asks for a change when pressed. `spot` lets the confetti start at the box.
function tickBox(label, checked, onChange) {
  const box = el('input', { type: 'checkbox', 'aria-label': label });
  box.checked = checked;
  box.addEventListener('change', () => {
    const rect = box.getBoundingClientRect();
    onChange(box.checked, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  return box;
}

// One row of the list: a tick box, when it happens, a colored dot for a session, and what it is.
function itemRow(item) {
  if (item.kind === 'session') {
    const { session } = item;
    const name = SESSION_TYPES[session.type].short;
    const when = session.time ? formatTime(session.time) : 'All day';
    return el('label', { class: 'today-row' + (session.done ? ' done' : '') },
      tickBox('Done: ' + name + ', ' + when, Boolean(session.done), (done, x, y) => ask('session-done-change', { id: session.id, done, syncSteps: true, x, y })),
      el('span', { class: 'today-when', text: when }),
      el('span', { class: 'today-dot type-' + session.type, 'aria-hidden': 'true' }),
      el('span', { class: 'today-text', text: name }));
  }
  const { meal } = item;
  const when = item.daysAhead > 0 ? mealWhen(item) : meal.time ? formatTime(meal.time) : '';
  return el('label', { class: 'today-row' + (meal.prepped ? ' done' : '') },
    tickBox('Prepped: ' + meal.name + (when ? ', ' + when : ''), Boolean(meal.prepped), (prepped, x, y) => ask('meal-prepped-change', { id: meal.id, prepped, x, y })),
    el('span', { class: 'today-when', text: when }),
    el('span', { class: 'today-dot meal', 'aria-hidden': 'true' }),
    el('span', { class: 'today-text', text: meal.name }));
}

function itemRows(items) {
  if (items.length === 0) return [el('p', { class: 'today-empty', text: 'Nothing planned today' })];
  const rows = items.slice(0, MAX_ROWS_SHOWN).map(itemRow);
  if (items.length > MAX_ROWS_SHOWN) {
    rows.push(el('a', { class: 'today-more', href: '#schedule', text: '+' + (items.length - MAX_ROWS_SHOWN) + ' more today' }));
  }
  return rows;
}

export function renderTodayTray() {
  const now = new Date();
  const sessions = savedList('sessions');
  const items = todayItems(sessions.filter((session) => SESSION_TYPES[session.type]), savedList('meals'), now);
  const todaySessions = items.filter((item) => item.kind === 'session').map((item) => item.session);

  const saved = loadJson('hydration', {});
  const goal = Number.isInteger(saved?.goal) && saved.goal >= 1 ? saved.goal : DEFAULT_GLASS_GOAL;
  const glasses = glassesToday(saved ?? {}, toIso(now));
  const week = weekStats(sessions, now);

  const water = el('div', { class: 'today-row' },
    el('span', { class: 'today-text', text: 'Water · ' + glasses + ' of ' + goal }),
    el('button', {
      class: 'btn ghost small today-add',
      type: 'button',
      text: '+1 glass',
      onclick: (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        ask('water-add', { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      },
    }));
  water.querySelector('button').disabled = glasses >= goal;

  $('#todayBody').replaceChildren(
    el('div', { class: 'today-items' }, ...itemRows(items)),
    water,
    el('a', { class: 'today-week', href: '#schedule', text: weekLine({ done: week.done, planned: week.planned, hours: week.hours }) }));
  setFoldSummary('today', todayLine({
    sessionCount: todaySessions.length,
    doneCount: todaySessions.filter((session) => session.done).length,
    glasses,
    goal,
  }));
}
