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
    enableDragSwitch(container);
  }
  return state.get(container);
}

const DRAG_START_PIXELS = 4;

// With a mouse, pressing on a toggle and dragging along it chooses whichever button the pointer is
// over, as if each were clicked. A phone or tablet finger does not do this (it would fight with
// scrolling), and a plain click works as always.
function enableDragSwitch(container) {
  const { pill } = state.get(container);
  container.classList.add('drag-switch');
  container.addEventListener('dragstart', (event) => event.preventDefault());

  const buttonNearest = (x) => {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const child of container.children) {
      if (child === pill) continue;
      const box = child.getBoundingClientRect();
      const distance = x < box.left ? box.left - x : Math.max(0, x - box.right);
      if (distance < nearestDistance) {
        nearest = child;
        nearestDistance = distance;
      }
    }
    return nearest;
  };

  container.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    if (!event.target.closest('.view-btn, .page-link')) return;
    const startX = event.clientX;
    let dragging = false;
    let lastIndex = -1;

    const onMove = (move) => {
      if (!dragging && Math.abs(move.clientX - startX) < DRAG_START_PIXELS) return;
      dragging = true;
      const button = buttonNearest(move.clientX);
      if (!button) return;
      const index = [...container.children].indexOf(button);
      if (index === lastIndex) return;
      lastIndex = index;
      const active = container.querySelector(state.get(container).activeSelector);
      if (button !== active) button.click();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (!dragging) return;
      // The release after a drag is not a click on any one button.
      const stopClick = (click) => click.stopPropagation();
      window.addEventListener('click', stopClick, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', stopClick, { capture: true }), 0);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });
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
