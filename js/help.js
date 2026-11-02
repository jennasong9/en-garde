// The small "?" next to a page title shows that page's tip as a pop-up in the bottom left corner,
// which fades away by itself, so the tip is there for learning the page and gone afterwards.
// Markup: <button class="help-btn" data-help="tipId"> and <div class="help-panel" id="tipId"> holding
// the tip as a short list, one step per item (the panel itself is never shown).
const SHOW_MS = 7000;
const FADE_MS = 400;

let toast = null;
let fadeTimer = 0;
let removeTimer = 0;
let shownFor = null;

function hideTip() {
  clearTimeout(fadeTimer);
  clearTimeout(removeTimer);
  if (!toast) return;
  const leaving = toast;
  toast = null;
  if (shownFor) shownFor.setAttribute('aria-expanded', 'false');
  shownFor = null;
  leaving.classList.remove('show');
  setTimeout(() => leaving.remove(), FADE_MS);
}

function showTip(button, steps) {
  hideTip();
  toast = document.createElement('div');
  toast.className = 'tip-toast';
  toast.setAttribute('role', 'status');
  const list = document.createElement('ul');
  for (const step of steps) list.append(Object.assign(document.createElement('li'), { textContent: step }));
  toast.append(list);
  toast.addEventListener('click', hideTip);
  document.body.append(toast);
  shownFor = button;
  button.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => requestAnimationFrame(() => toast && toast.classList.add('show')));
  fadeTimer = setTimeout(hideTip, SHOW_MS);
}

export function initHelp() {
  for (const button of document.querySelectorAll('.help-btn')) {
    const steps = Array.from(document.querySelectorAll('#' + button.dataset.help + ' li'), (item) => item.textContent);
    button.addEventListener('click', () => (shownFor === button ? hideTip() : showTip(button, steps)));
  }
  // Moving to another page puts its tip away.
  window.addEventListener('hashchange', hideTip);
}
