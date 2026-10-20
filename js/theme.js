import { $ } from './dom.js';
import { loadJson, saveJson } from './storage.js';

// Light or dark look. Until the user picks one, the app follows the device's setting. (The same
// check also runs from a small script in index.html's <head>, so the page never flashes the
// wrong colors while it loads.)
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

function savedTheme() {
  const saved = loadJson('theme', null);
  return saved === 'dark' || saved === 'light' ? saved : null;
}

export function currentTheme() {
  return savedTheme() || (prefersDark.matches ? 'dark' : 'light');
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

export function setTheme(theme) {
  saveJson('theme', theme);
  applyTheme(theme);
}

// Hooks up the Dark mode switch in Settings.
export function initTheme() {
  applyTheme(currentTheme());
  const toggle = $('#darkModeToggle');
  toggle.checked = currentTheme() === 'dark';
  toggle.addEventListener('change', () => setTheme(toggle.checked ? 'dark' : 'light'));
  // If the device switches between light and dark and the user never chose, follow it.
  prefersDark.addEventListener('change', () => {
    if (savedTheme()) return;
    applyTheme(currentTheme());
    toggle.checked = currentTheme() === 'dark';
  });
}
