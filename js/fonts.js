import { $ } from './dom.js';
import { loadJson, saveJson } from './storage.js';

// The typefaces on offer in Settings. The look of each is set in css/style.css by the
// `data-font` attribute on the page.
export const FONT_CHOICES = ['serif', 'sans', 'mono'];

// Anything else that was saved (or nothing at all) means the standard sans-serif look.
export function normalizeFont(saved) {
  return FONT_CHOICES.includes(saved) ? saved : 'sans';
}

function applyFont(font) {
  document.documentElement.dataset.font = font;
  for (const button of document.querySelectorAll('.font-option')) {
    button.setAttribute('aria-checked', String(button.dataset.font === font));
  }
}

// Hooks up the "Change font" choices in Settings. The saved choice is also applied from a small
// script in index.html's <head>, so the page never flashes the wrong font while it loads.
export function initFont() {
  applyFont(normalizeFont(loadJson('font', 'sans')));
  $('.font-picker').addEventListener('click', (event) => {
    const button = event.target.closest('.font-option');
    if (!button) return;
    saveJson('font', button.dataset.font);
    applyFont(button.dataset.font);
  });
}
