import { setFolded } from './fold.js';
import { loadJson, saveJson } from './storage.js';

// Cards at the top of a page whose body can be folded away, leaving the title and a one-line
// summary, so the main part of the page (the calendar, the meal plan) comes first. Which cards are
// folded is remembered on this device; before anything is saved they all start folded.
// Markup: <div class="card foldable" data-fold="name"> <button class="fold-title">...</button>
// <span class="fold-summary"></span> <div class="fold"><div class="fold-inner">...</div></div> </div>

const STARTS_FOLDED = ['nextUp', 'thisWeek', 'macros', 'hydration'];

const saved = loadJson('foldedCards', null);
const folded = new Set(Array.isArray(saved) ? saved : STARTS_FOLDED);

export function initFoldableCards() {
  for (const card of document.querySelectorAll('.foldable')) {
    const key = card.dataset.fold;
    const toggle = card.querySelector('.fold-title');
    const startsFolded = folded.has(key);
    // Put each card in its saved state without sliding, then allow the sliding for later presses.
    card.classList.add('fold-init');
    card.classList.toggle('collapsed', startsFolded);
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.remove('fold-init')));
    toggle.setAttribute('aria-expanded', String(!startsFolded));
    toggle.addEventListener('click', () => {
      const folding = !card.classList.contains('collapsed');
      if (folding) folded.add(key);
      else folded.delete(key);
      saveJson('foldedCards', [...folded]);
      setFolded(card, toggle, folding);
    });
  }
}

// The one line shown under a card's title while it is folded (and when it is open, as a quick read).
export function setFoldSummary(key, text) {
  document.querySelector('.foldable[data-fold="' + key + '"] .fold-summary').textContent = text;
}
