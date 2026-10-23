import { $, el, formState, protectUnsavedChanges } from './dom.js';
import { parseFencerLink, parseOptionalFencerLink } from './fencingtracker.js';
import { loadJson, saveJson } from './storage.js';

const FENCING_TIME_LIVE = 'https://www.fencingtimelive.com';

const trackerDialog = $('#trackerDialog');

// The saved link is checked again on load, so only a valid FencingTracker link is ever used.
const stored = parseFencerLink(loadJson('fencingTrackerLink', ''));
let link = stored.url || '';

// A link that opens in a new tab. Its arrow always uses the sans-serif font, so it looks the same
// whichever font the user picked.
function externalLink(href, text) {
  return el('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text + ' ', el('span', { class: 'link-arrow', text: '↗' }));
}

// The links under the fencer's name: their FencingTracker profile (once connected) and
// FencingTimeLive, which is the same for everyone.
function renderLink() {
  const timeLive = externalLink(FENCING_TIME_LIVE, 'Go to FencingTimeLive');
  const tracker = link === ''
    ? [el('button', { class: 'link-btn', type: 'button', text: 'Connect to FencingTracker', onclick: openDialog })]
    : [
      externalLink(link, 'My FencingTracker profile'),
    ];
  $('#fencerLinks').replaceChildren(...tracker, timeLive);
}

function openDialog() {
  $('#trackerInput').value = link;
  $('#trackerError').textContent = '';
  $('#trackerDisconnect').hidden = link === '';
  trackerDialog.showModal();
  trackerGuard.reset();
  $('#trackerInput').focus();
}

export function initFencerLinks() {
  renderLink();
}

// Used by Settings: forgets the saved link.
export function disconnectFencerLink() {
  link = '';
  saveJson('fencingTrackerLink', '');
  renderLink();
}

export function currentFencerLink() {
  return link;
}

// Used by Settings: saves the link typed there (empty removes it). Returns an error message, or
// null when it was saved.
export function saveFencerLink(text) {
  if (link !== '' && text.trim() === '') return 'Paste a link, or press Disconnect to remove yours.';
  const parsed = parseOptionalFencerLink(text);
  if (parsed.error) return parsed.error;
  link = parsed.url;
  saveJson('fencingTrackerLink', link);
  renderLink();
  return null;
}

$('#trackerForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const parsed = parseFencerLink($('#trackerInput').value);
  if (parsed.error) {
    $('#trackerError').textContent = parsed.error;
    return;
  }
  link = parsed.url;
  saveJson('fencingTrackerLink', link);
  trackerDialog.close();
  renderLink();
});

$('#trackerDisconnect').addEventListener('click', () => {
  link = '';
  saveJson('fencingTrackerLink', '');
  trackerDialog.close();
  renderLink();
});

const trackerGuard = protectUnsavedChanges(trackerDialog, () => formState($('#trackerForm')));
$('#trackerClose').addEventListener('click', () => trackerDialog.close());
$('#trackerCancel').addEventListener('click', () => trackerDialog.close());
