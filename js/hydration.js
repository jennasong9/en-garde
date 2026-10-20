import { $, el, makeDraggable } from './dom.js';
import { DEFAULT_GLASS_GOAL, MAX_GLASS_GOAL, glassesToday, tapGlass } from './meals.js';
import { toIso } from './schedule.js';
import { loadJson, saveJson } from './storage.js';

// Today's water count. It is saved with its date so a new day starts at zero.
const stored = loadJson('hydration', {});
let hydration = {
  date: typeof stored.date === 'string' ? stored.date : '',
  glasses: Number.isInteger(stored.glasses) ? stored.glasses : 0,
  goal: Number.isInteger(stored.goal) && stored.goal >= 1 && stored.goal <= MAX_GLASS_GOAL ? stored.goal : DEFAULT_GLASS_GOAL,
};

function persist() {
  saveJson('hydration', hydration);
}

function currentGlasses() {
  return glassesToday(hydration, toIso(new Date()));
}

export function renderHydration() {
  const glasses = currentGlasses();
  $('#drops').replaceChildren(...Array.from({ length: hydration.goal }, (_, index) => el('button', {
    class: 'drop' + (index < glasses ? ' filled' : ''),
    type: 'button',
    'aria-label': 'Glass ' + (index + 1),
    'aria-pressed': String(index < glasses),
  }, dropIcon())));
  showGlasses(glasses);
  if (document.activeElement !== $('#glassGoal')) $('#glassGoal').value = hydration.goal;
}

// Shows `glasses` filled drops and the count, without saving (used while dragging).
function showGlasses(glasses) {
  dropButtons().forEach((drop, index) => {
    drop.classList.toggle('filled', index < glasses);
    drop.setAttribute('aria-pressed', String(index < glasses));
  });
  const reached = glasses >= hydration.goal;
  $('#hydrationText').textContent = glasses + ' of ' + hydration.goal + ' glasses' + (reached ? ' — goal reached!' : '');
}

function setGlasses(glasses) {
  hydration = { ...hydration, date: toIso(new Date()), glasses };
  persist();
  renderHydration();
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
// Dragging across the drops sets the count as you go and saves when you let go. A plain tap fills
// up to that drop, or takes the last filled one back.
makeDraggable(dropsBox, {
  move: (event) => showGlasses(dropIndexAt(event.clientX, event.clientY) + 1),
  drop: (event) => {
    ignoreNextClick = true;
    setTimeout(() => { ignoreNextClick = false; }, 0);
    setGlasses(dropIndexAt(event.clientX, event.clientY) + 1);
  },
  cancel: renderHydration,
});
dropsBox.addEventListener('click', (event) => {
  if (ignoreNextClick) return;
  // A keyboard press has no pointer position, so use the focused drop itself.
  const index = event.detail === 0
    ? dropButtons().indexOf(event.target.closest('.drop'))
    : dropIndexUnder(event.clientX, event.clientY);
  if (index >= 0) setGlasses(tapGlass(currentGlasses(), index));
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
