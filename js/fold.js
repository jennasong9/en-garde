import { el } from './dom.js';

// Folding panels: a title button with a chevron, and a body that slides open and shut.
// Markup: <panel> <button aria-expanded> ... </button> <div class="fold"><div class="fold-inner">...</div></div>
// The CSS in style.css does the sliding; this builds the body and flips the state.

// The sliding body. Pass in what goes inside it.
export function foldBody(...children) {
  return el('div', { class: 'fold' }, el('div', { class: 'fold-inner' }, ...children));
}

const SETTLE_FALLBACK_MS = 450;
const STRETCH_MS = 160;

// Opens or closes `panel`. `panel` gets the class "collapsed" while it is folded. A panel in a
// grid row is kept short while it opens (so it grows smoothly) and then eases out to the height
// of its row.
export function setFolded(panel, toggle, folded) {
  toggle.setAttribute('aria-expanded', String(!folded));
  if (folded) {
    panel.classList.remove('expanding');
    panel.classList.add('collapsed');
    return;
  }
  panel.classList.remove('collapsed');
  panel.classList.add('expanding');
  const fold = panel.querySelector(':scope > .fold');
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    fold.removeEventListener('transitionend', onEnd);
    const from = panel.offsetHeight;
    panel.classList.remove('expanding');
    const to = panel.offsetHeight;
    if (to !== from && !panel.classList.contains('collapsed')) {
      panel.animate([{ height: from + 'px' }, { height: to + 'px' }], { duration: STRETCH_MS, easing: 'ease' });
    }
  };
  const onEnd = (event) => {
    if (event.target === fold) settle();
  };
  fold.addEventListener('transitionend', onEnd);
  setTimeout(settle, SETTLE_FALLBACK_MS);
}
