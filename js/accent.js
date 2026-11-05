import { $ } from './dom.js';
import { loadJson, saveJson } from './storage.js';

// The color schemes on offer in Settings. Each one's look is set in css/style.css by the
// `data-accent` attribute on the page, and works in both light and dark mode. Sage is the
// original look and needs no overrides.
export const ACCENT_CHOICES = ['sage', 'ocean', 'lavender', 'rose', 'sand'];

// Anything else that was saved (or nothing at all) means the standard sage green.
export function normalizeAccent(saved) {
  return ACCENT_CHOICES.includes(saved) ? saved : 'sage';
}

function applyAccent(accent) {
  document.documentElement.dataset.accent = accent;
  for (const button of document.querySelectorAll('.accent-option')) {
    button.setAttribute('aria-checked', String(button.dataset.accent === accent));
  }
}

// Hooks up the "Color" choices in Settings. The saved choice is also applied from a small script
// in index.html's <head>, so the page never flashes the wrong color while it loads.
export function initAccent() {
  applyAccent(normalizeAccent(loadJson('accent', 'sage')));
  $('.accent-picker').addEventListener('click', (event) => {
    const button = event.target.closest('.accent-option');
    if (!button) return;
    saveJson('accent', button.dataset.accent);
    applyAccent(button.dataset.accent);
  });
}
