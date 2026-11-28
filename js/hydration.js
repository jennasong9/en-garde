import { $, el, makeDraggable } from './dom.js';
import { burstConfetti } from './confetti.js';
import { setFoldSummary } from './foldable-cards.js';
import { DEFAULT_GLASS_GOAL, MAX_GLASS_GOAL, glassesToday, hydrationSummary, reachedWaterGoal, recordGlasses, tapGlass, weekHistory } from './meals.js';
import { addDays, parseIso, toIso } from './schedule.js';
import { loadJson, saveJson } from './storage.js';
import { renderTodayTray } from './today-tray.js';

// Today's water count. It is saved with its date so a new day starts at zero.
const stored = loadJson('hydration', {});
let hydration = {
  date: typeof stored.date === 'string' ? stored.date : '',
  glasses: Number.isInteger(stored.glasses) ? stored.glasses : 0,
  goal: Number.isInteger(stored.goal) && stored.goal >= 1 && stored.goal <= MAX_GLASS_GOAL ? stored.goal : DEFAULT_GLASS_GOAL,
};

// Past days' counts, { 'YYYY-MM-DD': { glasses, goal } }, for the "Last 7 days" chart.
const storedLog = loadJson('hydrationLog', {});
let hydrationLog = storedLog && typeof storedLog === 'object' && !Array.isArray(storedLog) ? storedLog : {};

function persist() {
  saveJson('hydration', hydration);
  hydrationLog = recordGlasses(hydrationLog, toIso(new Date()), currentGlasses(), hydration.goal);
  saveJson('hydrationLog', hydrationLog);
}

function currentGlasses() {
  return glassesToday(hydration, toIso(new Date()));
}

// Today's glasses and the daily goal, for the water reminders.
export function waterStatus() {
  return { glasses: currentGlasses(), goal: hydration.goal };
}

// Adds one glass (the "+1 glass" button on a water reminder). Confetti pops near the reminder when
// that glass reaches the goal.
export function addGlass(x = 120, y = window.innerHeight - 80) {
  const glasses = currentGlasses();
  if (glasses < hydration.goal) setGlasses(glasses + 1, x, y);
}

// The "+1 glass" button in the Today box.
document.addEventListener('water-add', (event) => addGlass(event.detail.x, event.detail.y));

export function renderHydration() {
  const glasses = currentGlasses();
  $('#drops').replaceChildren(...Array.from({ length: hydration.goal }, (_, index) => el('button', {
    class: 'drop' + (index < glasses ? ' filled' : ''),
    type: 'button',
    'aria-label': 'Glass ' + (index + 1),
    'aria-pressed': String(index < glasses),
  }, dropIcon())));
  showGlasses(glasses);
  renderWeek();
  if (document.activeElement !== $('#glassGoal')) $('#glassGoal').value = hydration.goal;
  renderTodayTray();
}

// A small bar for each of the last 7 days, filled by how much of that day's goal was reached.
function renderWeek() {
  const today = toIso(new Date());
  const days = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
  const week = weekHistory(hydrationLog, days, hydration.goal).map((day) => day.iso === today
    ? { ...day, glasses: currentGlasses(), goal: hydration.goal, percent: hydrationSummary(currentGlasses(), hydration.goal).percent, met: currentGlasses() >= hydration.goal }
    : day);
  $('#waterWeek').replaceChildren(...week.map((day) => {
    const name = day.iso === today ? 'Today' : parseIso(day.iso).toLocaleDateString(undefined, { weekday: 'short' });
    const track = el('div', { class: 'water-day-track' }, el('div', { class: 'water-day-fill' }));
    track.style.setProperty('--pct', day.percent + '%');
    return el('div', {
      class: 'water-day' + (day.met ? ' met' : '') + (day.iso === today ? ' today' : ''),
      title: name + ': ' + day.glasses + ' of ' + day.goal + (day.goal === 1 ? ' glass' : ' glasses'),
    }, track, el('span', { class: 'water-day-count', text: String(day.glasses) }), el('span', { class: 'water-day-name', text: name }));
  }));
  const metDays = week.filter((day) => day.met).length;
  $('#waterWeekNote').textContent = 'Goal reached on ' + metDays + ' of the last 7 days. Solid bars mean the goal was met.';
}

// Shows `glasses` filled drops and the count, without saving (used while dragging).
function showGlasses(glasses) {
  dropButtons().forEach((drop, index) => {
    drop.classList.toggle('filled', index < glasses);
    drop.setAttribute('aria-pressed', String(index < glasses));
  });
  const summary = hydrationSummary(glasses, hydration.goal);
  $('#hydrationText').textContent = glasses + ' of ' + hydration.goal + (hydration.goal === 1 ? ' glass' : ' glasses');
  $('#hydrationDetail').textContent = summary.ounces + ' of ' + summary.goalOunces + ' oz \u00b7 ' + summary.message;
  $('#waterBar').style.setProperty('--pct', summary.percent + '%');
  $('#waterBar').setAttribute('aria-valuenow', String(summary.percent));
  setFoldSummary('hydration', glasses + ' of ' + hydration.goal + (hydration.goal === 1 ? ' glass' : ' glasses') + ' today');
}

// Saves the count. Confetti pops from (x, y) when this release is the one that reaches the goal.
function setGlasses(glasses, x, y) {
  const reached = reachedWaterGoal(currentGlasses(), glasses, hydration.goal);
  hydration = { ...hydration, date: toIso(new Date()), glasses };
  persist();
  renderHydration();
  if (reached) burstConfetti(x, y);
}

// ---------- tap or drag across the drops ----------
const dropsBox = $('#drops');
const dropButtons = () => [...dropsBox.querySelectorAll('.drop')];

// The drop (0-based) nearest the pointer, or -1 when the pointer is left of the first drop,
// which means no glasses. Drops wrap onto more rows, so this uses distance, not just sideways.
function dropIndexAt(x, y) {
  const drops = dropButtons();
  if (drops.length === 0) return -1;
  const first = drops[0].getBoundingClientRect();
  if (x < first.left && y <= first.bottom) return -1;
  let nearest = 0;
  let nearestDistance = Infinity;
  drops.forEach((drop, index) => {
    const box = drop.getBoundingClientRect();
    const distance = (x - (box.left + box.width / 2)) ** 2 + (y - (box.top + box.height / 2)) ** 2;
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  });
  return nearest;
}

// The drop the pointer is exactly over, or -1 (for taps, so empty space beside the drops does nothing).
function dropIndexUnder(x, y) {
  return dropButtons().findIndex((drop) => {
    const box = drop.getBoundingClientRect();
    return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
  });
}

let ignoreNextClick = false;
// The drop a mouse or finger went down on, so a press that starts on empty space and ends on a
// drop is not mistaken for a tap on that drop.
let pressedDropIndex = -1;
dropsBox.addEventListener('pointerdown', (event) => {
  pressedDropIndex = dropIndexUnder(event.clientX, event.clientY);
});
// Dragging across the drops sets the count as you go and saves when you let go. A plain tap fills
// up to that drop, or takes the last filled one back.
makeDraggable(dropsBox, {
  // Only a press on a drop starts a drag; the empty space beside the drops does nothing.
  canStart: (event) => event.target.closest('.drop') !== null,
  move: (event) => showGlasses(dropIndexAt(event.clientX, event.clientY) + 1),
  drop: (event) => {
    ignoreNextClick = true;
    setTimeout(() => { ignoreNextClick = false; }, 0);
    setGlasses(dropIndexAt(event.clientX, event.clientY) + 1, event.clientX, event.clientY);
  },
  cancel: renderHydration,
});
dropsBox.addEventListener('click', (event) => {
  if (ignoreNextClick) return;
  // A keyboard press has no pointer position, so use the focused drop itself.
  const index = event.detail === 0
    ? dropButtons().indexOf(event.target.closest('.drop'))
    : dropIndexUnder(event.clientX, event.clientY);
  if (index < 0 || (event.detail !== 0 && index !== pressedDropIndex)) return;
  const box = dropButtons()[index].getBoundingClientRect();
  const x = event.detail === 0 ? box.left + box.width / 2 : event.clientX;
  const y = event.detail === 0 ? box.top : event.clientY;
  setGlasses(tapGlass(currentGlasses(), index), x, y);
});

function dropIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 30');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M12 2C12 2 3 13 3 19a9 9 0 0 0 18 0C21 13 12 2 12 2z');
  svg.append(path);
  return svg;
}

$('#glassGoal').addEventListener('change', (event) => {
  const goal = Number(event.target.value);
  if (!Number.isInteger(goal) || goal < 1 || goal > MAX_GLASS_GOAL) {
    $('#goalError').textContent = 'The goal must be a whole number of glasses from 1 to ' + MAX_GLASS_GOAL + '.';
    event.target.value = hydration.goal;
    return;
  }
  $('#goalError').textContent = '';
  hydration = { ...hydration, goal };
  persist();
  renderHydration();
});

// A new day may begin while the page sits open in a tab.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !$('#nutritionPage').hidden) renderHydration();
});
