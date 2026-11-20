import { $, closeOnBackdropClick, el } from './dom.js';
import { showDialog } from './dialog-motion.js';
import { cleanSavedRoutines } from './routinelibrary.js';
import { MIN_QUERY_CHARS, searchAll } from './search.js';
import { cleanSessions, toIso } from './schedule.js';
import { normalizeEntries } from './journal.js';
import { SECTION_TYPES } from './sessionsteps.js';
import { loadJson } from './storage.js';

// The search icon in the header opens a pop-up with a box. Typing shows what was found in sessions,
// saved routines, goals and journal entries; choosing one takes the person to it. The pressing of
// "/" (outside a box you can type in) or Ctrl/Cmd+K opens it too.

const dialog = $('#searchDialog');
const input = $('#searchInput');
const results = $('#searchResults');

// `actions` has one function per kind of result ({ session, sessionRoutine, routine, goal, journal }),
// each given the result and called after the pop-up closes.
export function initSearch(actions) {
  function currentData() {
    const goals = loadJson('goals', []);
    return {
      sessions: cleanSessions(loadJson('sessions', [])),
      savedRoutines: cleanSavedRoutines(loadJson('savedRoutines', null)),
      goals: Array.isArray(goals) ? goals : [],
      journal: normalizeEntries(loadJson('journal', {})),
    };
  }

  function choose(action, result) {
    dialog.close();
    action(result);
  }

  function renderResults() {
    const query = input.value;
    if (query.trim().length < MIN_QUERY_CHARS) {
      results.replaceChildren(el('p', { class: 'search-hint', text: 'Type at least ' + MIN_QUERY_CHARS + ' letters, such as a day, a place, a step or a goal.' }));
      return;
    }
    const groups = searchAll(query, currentData(), toIso(new Date()));
    if (groups.length === 0) {
      results.replaceChildren(el('p', { class: 'search-hint', text: 'Nothing found for "' + query.trim() + '". Try a shorter or different word.' }));
      return;
    }
    results.replaceChildren(...groups.map((group) => el('section', { class: 'search-group' },
      el('h3', { text: group.label }),
      el('ul', {}, ...group.results.map((result) => resultRow(result))),
      group.total > group.results.length ? el('p', { class: 'search-more', text: (group.total - group.results.length) + ' more. Type more words to narrow it down.' }) : '')));
  }

  function resultRow(result) {
    const row = el('li', { class: 'search-row' }, el('button', {
      class: 'search-hit',
      type: 'button',
      onclick: () => choose(actions[result.kind], result),
    }, el('b', { text: result.title }), el('span', { text: result.detail })));
    // A session with steps can also go straight to its routine.
    if (result.kind === 'session' && SECTION_TYPES.includes(result.session.type)) {
      row.append(el('button', {
        class: 'btn ghost small',
        type: 'button',
        text: 'Open routine',
        'aria-label': 'Open the routine for ' + result.title + ', ' + result.detail,
        onclick: () => choose(actions.sessionRoutine, result),
      }));
    }
    return row;
  }

  function open() {
    if (dialog.open) return;
    input.value = '';
    renderResults();
    showDialog(dialog);
    input.focus();
  }

  $('#searchBtn').addEventListener('click', open);
  $('#searchClose').addEventListener('click', () => dialog.close());
  closeOnBackdropClick(dialog);
  input.addEventListener('input', renderResults);
  // Enter opens the first result; the arrow keys move through the results.
  const hits = () => [...results.querySelectorAll('.search-hit')];
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      hits()[0]?.click();
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      hits()[0]?.focus();
    }
  });
  results.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const all = hits();
    const index = all.indexOf(document.activeElement);
    if (index === -1) return;
    event.preventDefault();
    if (event.key === 'ArrowUp' && index === 0) input.focus();
    else all[Math.min(all.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))].focus();
  });
  document.addEventListener('keydown', (event) => {
    const typing = event.target.closest?.('input, textarea, select, [contenteditable]');
    const shortcut = (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey) || (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey));
    if (!shortcut || document.querySelector('dialog[open]:not(#searchDialog)') || $('#searchBtn').closest('[hidden]')) return;
    event.preventDefault();
    open();
  });
}
