import { $, el } from './dom.js';

// After "Today" is pressed: ripples of green ring spread out from today's date circle, and the
// circle gives a small pop, so the eye is drawn to the day.

const PING_MS = 2600;
const VIEW_MARGIN = 80;
const CIRCLES = '.cal-cell.today .cal-date, .tg-day-btn.today .tg-day-num';

// `pageSelector` is the screen to look in ('#schedulePage' or '#journalPage').
export function pingToday(pageSelector) {
  const circle = [...$(pageSelector).querySelectorAll(CIRCLES)].find((candidate) => candidate.offsetParent !== null);
  if (!circle) return;
  for (const old of document.querySelectorAll('.today-ping')) old.remove();
  circle.classList.remove('today-pop');
  void circle.offsetWidth;
  circle.classList.add('today-pop');
  circle.append(el('span', { class: 'today-ping', 'aria-hidden': 'true' }), el('span', { class: 'today-ping second', 'aria-hidden': 'true' }));
  // Bring the day into view with room around it, but leave the page alone if it is already there.
  const box = circle.getBoundingClientRect();
  if (box.top < VIEW_MARGIN || box.bottom > window.innerHeight - VIEW_MARGIN) {
    circle.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  setTimeout(() => {
    for (const ring of circle.querySelectorAll('.today-ping')) ring.remove();
    circle.classList.remove('today-pop');
  }, PING_MS);
}
