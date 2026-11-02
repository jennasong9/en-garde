// Opens a pop-up (<dialog>) with a short animation. Given the element it comes from (such as a
// date on a month calendar) the pop-up grows out of that spot; without one it just fades and
// settles into place.

const DURATION_MS = 280;
const EASING = 'cubic-bezier(.2, .8, .2, 1)';

export function showDialog(dialog, origin = null) {
  dialog.showModal();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let from = { opacity: 0, transform: 'translateY(12px) scale(.97)' };
  const spot = origin ? origin.getBoundingClientRect() : null;
  if (spot && spot.width > 0 && spot.height > 0) {
    const box = dialog.getBoundingClientRect();
    const dx = spot.left + spot.width / 2 - (box.left + box.width / 2);
    const dy = spot.top + spot.height / 2 - (box.top + box.height / 2);
    const scale = Math.max(0.05, Math.min(spot.width / box.width, spot.height / box.height, 1));
    from = { opacity: 0, transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(' + scale + ')' };
  }
  dialog.animate([from, { opacity: 1, transform: 'none' }], { duration: DURATION_MS, easing: EASING });
  dialog.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURATION_MS, easing: 'ease-out', pseudoElement: '::backdrop' });
}
