import { $, el, formState, protectUnsavedChanges } from './dom.js';
import { parseFencerLink } from './fencingtracker.js';
import { loadJson, saveJson } from './storage.js';

const FENCING_TIME_LIVE = 'https://www.fencingtimelive.com';

const trackerDialog = $('#trackerDialog');

// The saved link is checked again on load, so only a valid FencingTracker link is ever used.
const stored = parseFencerLink(loadJson('fencingTrackerLink', ''));
let link = stored.url || '';

// The links under the fencer's name: their FencingTracker profile (once connected) and
// FencingTimeLive, which is the same for everyone.
function renderLink() {
  const timeLive = el('a', { href: FENCING_TIME_LIVE, target: '_blank', rel: 'noopener noreferrer', text: 'Go to FencingTimeLive ↗' });
  const tracker = link === ''
    ? [el('button', { class: 'link-btn', type: 'button', text: 'Connect to FencingTracker', onclick: openDialog })]
    : [
      el('a', { href: link, target: '_blank', rel: 'noopener noreferrer', text: 'My FencingTracker profile ↗' }),
      el('button', { class: 'link-btn', type: 'button', text: 'Change', 'aria-label': 'Change FencingTracker link', onclick: openDialog }),
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
