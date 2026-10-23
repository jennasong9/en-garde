import { el } from './dom.js';

// A green "pill" that slides under whichever button of a toggle is chosen. The pill is its own
// element, so it can move from one button to the next instead of the green jumping.

const state = new WeakMap();

function pillFor(container) {
  if (!state.has(container)) {
    const pill = el('span', { class: 'pill no-anim', 'aria-hidden': 'true' });
    container.classList.add('has-pill');
    container.prepend(pill);
    // Redraw in place (without sliding) when the toggle or one of its buttons is resized: a window
    // resize, a new font, or the page it sits on being shown for the first time.
    const resizes = new ResizeObserver(() => place(container, false));
    resizes.observe(container);
    state.set(container, { pill, activeSelector: '', resizes, placed: '' });
  }
  return state.get(container);
}

function watchButtons(container) {
  const { pill, resizes } = state.get(container);
  for (const child of container.children) {
    if (child !== pill) resizes.observe(child);
  }
}

function place(container, animate) {
  const info = state.get(container);
  const { pill, activeSelector } = info;
  const active = activeSelector ? container.querySelector(activeSelector) : null;
  const box = container.getBoundingClientRect();
  if (!active || box.width === 0) {
    pill.style.opacity = '0';
    info.placed = '';
    return;
  }
  const target = active.getBoundingClientRect();
  const transform = 'translate(' + (target.left - box.left - container.clientLeft) + 'px, ' + (target.top - box.top - container.clientTop) + 'px)';
  const spot = transform + target.width + 'x' + target.height;
  // A resize check that finds the pill already where it belongs must not cut a slide short.
  if (!animate && spot === info.placed) return;
  info.placed = spot;
  if (!animate) pill.classList.add('no-anim');
  pill.style.opacity = '1';
  pill.style.width = target.width + 'px';
  pill.style.height = target.height + 'px';
  pill.style.transform = transform;
  if (!animate) {
    void pill.offsetWidth;
    pill.classList.remove('no-anim');
  }
}

// Puts `buttons` in the toggle (replacing the old ones but keeping the pill) and slides the pill
// to the one matching `activeSelector`, such as '[aria-pressed="true"]'.
export function setSwitchButtons(container, buttons, activeSelector) {
  const info = pillFor(container);
  info.activeSelector = activeSelector;
  const hadButtons = container.children.length > 1;
  for (const child of [...container.children]) {
    if (child !== info.pill) child.remove();
  }
  container.append(...buttons);
  watchButtons(container);
  place(container, hadButtons);
}

// For a toggle whose buttons stay put (the page tabs): call again after the chosen one changes.
export function updateSwitch(container, activeSelector) {
  const info = pillFor(container);
  const changed = info.activeSelector !== activeSelector || container.children.length > 1;
  info.activeSelector = activeSelector;
  watchButtons(container);
  place(container, changed && info.pill.style.opacity === '1');
}
