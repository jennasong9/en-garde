// With a mouse, a slide switch (dark mode, hide completed, strikethrough) can also be dragged:
// press on it and move to the left half for off or the right half for on, then let go. A finger
// on a phone or tablet just taps. A plain click works as always.

const DRAG_START_PIXELS = 4;

export function enableSwitchDrag() {
  document.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    const toggle = event.target.closest('.switch-toggle');
    if (!toggle || toggle.disabled) return;
    const startX = event.clientX;
    const startedOn = toggle.checked;
    let dragging = false;

    const onMove = (move) => {
      if (!dragging && Math.abs(move.clientX - startX) < DRAG_START_PIXELS) return;
      dragging = true;
      const box = toggle.getBoundingClientRect();
      toggle.checked = move.clientX > box.left + box.width / 2;
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (!dragging) return;
      // The release after a drag is not also a click that would flip the switch back.
      const stopClick = (click) => {
        click.preventDefault();
        click.stopPropagation();
      };
      window.addEventListener('click', stopClick, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', stopClick, { capture: true }), 0);
      if (toggle.checked !== startedOn) toggle.dispatchEvent(new Event('change', { bubbles: true }));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });
}
