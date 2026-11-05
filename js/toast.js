// A small pop-up in the bottom left corner that fades away by itself. Used for the page tips and
// for telling the user they were taken to another page. Only one shows at a time.
const SHOW_MS = 7000;
const FADE_MS = 400;

let toast = null;
let fadeTimer = 0;
let onHide = null;

export function hideToast() {
  clearTimeout(fadeTimer);
  if (!toast) return;
  const leaving = toast;
  const finished = onHide;
  toast = null;
  onHide = null;
  leaving.classList.remove('show');
  setTimeout(() => leaving.remove(), FADE_MS);
  if (finished) finished();
}

// `content` is a sentence, or a list of short steps. With `actionLabel` the pop-up gets a button
// that calls `onAction` and puts the pop-up away. `onClose` runs whenever the pop-up goes away, and
// `ms` is how long it stays.
export function showToast(content, { actionLabel = '', onAction = null, onClose = null, ms = SHOW_MS } = {}) {
  hideToast();
  toast = document.createElement('div');
  toast.className = 'tip-toast';
  toast.setAttribute('role', 'status');
  if (Array.isArray(content)) {
    const list = document.createElement('ul');
    for (const step of content) list.append(Object.assign(document.createElement('li'), { textContent: step }));
    toast.append(list);
  } else {
    toast.append(Object.assign(document.createElement('p'), { textContent: content }));
  }
  if (actionLabel) {
    const button = Object.assign(document.createElement('button'), { type: 'button', className: 'link-btn small toast-action', textContent: actionLabel });
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      hideToast();
      if (onAction) onAction();
    });
    toast.append(button);
  }
  toast.addEventListener('click', hideToast);
  // A pop-up that is open blocks everything outside it, so the toast goes inside it (when there is
  // one) to stay on top and clickable.
  (document.querySelector('dialog[open]') || document.body).append(toast);
  onHide = onClose;
  const shown = toast;
  requestAnimationFrame(() => requestAnimationFrame(() => shown.classList.add('show')));
  fadeTimer = setTimeout(hideToast, ms);
}
