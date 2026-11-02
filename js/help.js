import { hideToast, showToast } from './toast.js';

// The small "?" next to a page title shows that page's tip as a pop-up in the bottom left corner,
// which fades away by itself, so the tip is there for learning the page and gone afterwards.
// Markup: <button class="help-btn" data-help="tipId"> and <div class="help-panel" id="tipId"> holding
// the tip as a short list, one step per item (the panel itself is never shown).
let shownFor = null;

function closeTip() {
  if (shownFor) shownFor.setAttribute('aria-expanded', 'false');
  shownFor = null;
}

export function initHelp() {
  for (const button of document.querySelectorAll('.help-btn')) {
    const steps = Array.from(document.querySelectorAll('#' + button.dataset.help + ' li'), (item) => item.textContent);
    button.addEventListener('click', () => {
      if (shownFor === button) {
        hideToast();
        return;
      }
      showToast(steps, { onClose: closeTip });
      shownFor = button;
      button.setAttribute('aria-expanded', 'true');
    });
  }
  // Moving to another page puts its tip away.
  window.addEventListener('hashchange', () => {
    if (shownFor) hideToast();
  });
}
