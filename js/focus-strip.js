import { el } from './dom.js';
import { latestFocus } from './journal.js';
import { parseIso } from './schedule.js';

// The "Next session focus" strip, shown on the Journal page and on the Routines page (so it is in view while doing a session's steps): the focus from the
// most recent journal entry that has one. It is hidden when no entry has a focus yet. Pass
// `openJournal` to add an "Open Journal" button (the Journal page does not need one).
export function renderFocusStrip(strip, entries, { openJournal = null } = {}) {
  const latest = latestFocus(entries);
  strip.hidden = latest === null;
  strip.replaceChildren();
  if (!latest) return;
  const from = parseIso(latest.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  strip.append(
    el('span', { class: 'focus-label', text: 'Next session focus' }),
    el('p', { class: 'focus-text', text: latest.focus }),
    el('span', { class: 'focus-from', text: 'from ' + from }));
  if (openJournal) strip.append(el('button', { class: 'link-btn small', type: 'button', text: 'Open Journal', onclick: () => openJournal(latest.id) }));
}
