import { setFolded } from './fold.js';

// The small "?" next to a page title opens or closes that page's longer tip, so the tips are there
// when wanted and out of the way otherwise.
// Markup: <button class="help-btn" data-help="tipId"> and <div class="help-panel collapsed" id="tipId">
// holding a `.fold` body.
export function initHelp() {
  for (const button of document.querySelectorAll('.help-btn')) {
    const panel = document.getElementById(button.dataset.help);
    button.addEventListener('click', () => setFolded(panel, button, !panel.classList.contains('collapsed')));
  }
}
