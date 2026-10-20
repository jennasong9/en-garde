// Small helpers for building page elements without writing HTML strings.

export const $ = (selector) => document.querySelector(selector);

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

// Everything the user can change inside `root`: field values, checkboxes, and pressed buttons.
// Two snapshots of this that differ mean there are unsaved changes.
export function formState(root) {
  const fields = [...root.querySelectorAll('input, select, textarea')]
    .map((field) => (field.type === 'checkbox' || field.type === 'radio' ? field.checked : field.value));
  const pressed = [...root.querySelectorAll('[aria-pressed]')].map((button) => button.getAttribute('aria-pressed'));
  return [fields, pressed];
}

// Keeps a dialog with a form open when the user clicks outside it (or presses Escape) while it
// holds changes that were not saved, and shows a warning inside it instead. With nothing changed it
// closes as usual. `getState()` returns the dialog's current state (see formState). Call
// `reset()` once the dialog's fields are filled in, so what is shown counts as "no changes yet".
export function protectUnsavedChanges(dialog, getState) {
  const warning = el('p', {
    class: 'unsaved-warning',
    role: 'alert',
    text: 'You have unsaved changes. Save them, or press Cancel to leave without saving.',
  });
  warning.hidden = true;
  dialog.querySelector('.dialog-head').after(warning);
  let baseline = null;

  const isDirty = () => baseline !== null && JSON.stringify(getState()) !== baseline;
  const warn = () => {
    warning.hidden = false;
    // Restart the attention animation each time the user clicks out.
    warning.classList.remove('flash');
    void warning.offsetWidth;
    warning.classList.add('flash');
    warning.scrollIntoView({ block: 'nearest' });
  };

  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    if (isDirty()) warn();
    else dialog.close();
  });
  dialog.addEventListener('cancel', (event) => {
    if (!isDirty()) return;
    event.preventDefault();
    warn();
  });
  dialog.addEventListener('close', () => {
    baseline = null;
    warning.hidden = true;
  });

  return {
    reset() {
      baseline = JSON.stringify(getState());
      warning.hidden = true;
    },
  };
}

// Closes a dialog when the dimmed area around it is clicked.
export function closeOnBackdropClick(dialog) {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}

const MOUSE_DRAG_PIXELS = 4;
const TOUCH_HOLD_MS = 250;
const TOUCH_SCROLL_PIXELS = 8;

// Makes an element draggable. A mouse drags straight away; a finger has to press and hold first,
// so scrolling the page still works. `handlers.move(event, dx, dy)` runs while dragging (dx and
// dy are the distance from where it started), `handlers.drop(event)` when released, and
// `handlers.cancel()` if the browser abandons the drag. Returns nothing.
export function makeDraggable(element, handlers) {
  let pressed = false;
  let dragging = false;
  let usingTouch = false;
  let startX = 0;
  let startY = 0;
  let holdTimer = null;

  const stop = () => {
    clearTimeout(holdTimer);
    pressed = false;
    dragging = false;
    element.classList.remove('dragging');
  };
  const beginDragging = () => {
    dragging = true;
    element.classList.add('dragging');
  };

  element.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pressed = true;
    dragging = false;
    usingTouch = event.pointerType !== 'mouse';
    startX = event.clientX;
    startY = event.clientY;
    if (usingTouch) holdTimer = setTimeout(beginDragging, TOUCH_HOLD_MS);
    try {
      // Keeps the drag going even if the pointer slips off the element.
      element.setPointerCapture(event.pointerId);
    } catch (error) {
      // The pointer may already be gone; the drag still works while it is over the element.
    }
  });
  element.addEventListener('pointermove', (event) => {
    if (!pressed) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!dragging) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      if (usingTouch) {
        if (distance > TOUCH_SCROLL_PIXELS) stop();
        return;
      }
      if (distance < MOUSE_DRAG_PIXELS) return;
      beginDragging();
    }
    handlers.move(event, dx, dy);
  });
  element.addEventListener('pointerup', (event) => {
    const wasDragging = dragging;
    stop();
    if (wasDragging) handlers.drop(event);
  });
  element.addEventListener('pointercancel', () => {
    const wasDragging = dragging;
    stop();
    if (wasDragging) handlers.cancel();
  });
  // Once a finger is holding the element to drag it, the page must not scroll under it.
  element.addEventListener('touchmove', (event) => {
    if (dragging) event.preventDefault();
  }, { passive: false });
}
