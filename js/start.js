// The first thing that runs. If a profile is open, it starts the app. Otherwise it shows the
// welcome screen, where the person picks a saved profile or makes a new one. Profiles have no
// passwords: each is just its own saved space in this browser.
import { $ } from './dom.js';
import {
  activeProfileId,
  clearLegacyData,
  legacyData,
  loadProfileList,
  saveProfileData,
  saveProfileList,
  setActiveProfile,
} from './storage.js';
import { lookupUrl, parseFencerLink, readProfilePage } from './fencingtracker.js';
import { cleanDraft, cleanProfileList, newProfileId, profileSummary, startingData, validateNewProfile } from './profiles.js';

const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

// Everything saved before profiles existed becomes the first profile, so nothing is lost.
function adoptOldData() {
  const old = legacyData();
  if (Object.keys(old).length === 0) return;
  const id = newProfileId();
  const oldProfile = old.profile ?? {};
  const name = oldProfile.name && oldProfile.name !== 'Your name' ? oldProfile.name : 'My profile';
  if (!saveProfileData(id, old)) return;
  clearLegacyData();
  saveProfileList([{ id, name, weapon: oldProfile.weapon ?? 'Foil', club: oldProfile.club ?? '' }]);
  setActiveProfile(id);
}

async function startApp() {
  $('.page').hidden = false;
  $('#welcome').hidden = true;
  await import('./app.js');
}

// ---------- the welcome screen ----------
function chooseInGroup(group, button) {
  for (const option of group.querySelectorAll('[role="radio"]')) {
    option.setAttribute('aria-checked', String(option === button));
  }
}

const chosen = (group) => group.querySelector('[aria-checked="true"]')?.dataset.value ?? '';

// Shows the look being picked right away, so the screen itself previews it.
function previewLook() {
  const theme = chosen($('#wTheme'));
  document.documentElement.dataset.theme = theme === 'auto' ? (prefersDark.matches ? 'dark' : 'light') : theme;
  document.documentElement.dataset.font = chosen($('#wFont'));
}

function showSavedProfiles(list) {
  $('#wSaved').hidden = list.length === 0;
  $('#wNewForm').hidden = list.length > 0;
  $('#wShowNew').hidden = list.length === 0;
  $('#wProfiles').replaceChildren(...list.map((entry) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'welcome-profile';
    const name = document.createElement('strong');
    name.textContent = entry.name;
    const detail = document.createElement('span');
    detail.textContent = profileSummary(entry);
    button.append(name, detail);
    button.addEventListener('click', () => {
      setActiveProfile(entry.id);
      window.location.reload();
    });
    return button;
  }));
}

const DRAFT_KEY = 'engarde_welcomeDraft';

// What is typed in the form right now.
function formValues() {
  return {
    name: $('#wName').value,
    weapon: chosen($('#wWeapon')),
    club: $('#wClub').value,
    rating: $('#wRating').value,
    trackerLink: $('#wTracker').value,
    theme: chosen($('#wTheme')),
    font: chosen($('#wFont')),
    mealReminders: $('#wMealReminders').checked,
    waterReminders: $('#wWaterReminders').checked,
  };
}

// The form is kept for the life of the tab, so a refresh in the middle of setup does not wipe it.
// (It is session storage, so it is gone when the tab closes, and it is cleared once the profile is made.)
function saveDraft() {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(formValues()));
  } catch (error) {
    // Without storage the form just starts empty after a refresh.
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch (error) {
    // Nothing to clear.
  }
}

function restoreDraft() {
  let draft = null;
  try {
    draft = cleanDraft(JSON.parse(sessionStorage.getItem(DRAFT_KEY)));
  } catch (error) {
    return false;
  }
  if (!draft) return false;
  $('#wName').value = draft.name;
  $('#wClub').value = draft.club;
  $('#wRating').value = draft.rating;
  $('#wTracker').value = draft.trackerLink;
  $('#wMealReminders').checked = draft.mealReminders;
  $('#wWaterReminders').checked = draft.waterReminders;
  for (const [id, value] of [['#wWeapon', draft.weapon], ['#wTheme', draft.theme], ['#wFont', draft.font]]) {
    const group = $(id);
    const button = [...group.querySelectorAll('[role="radio"]')].find((option) => option.dataset.value === value);
    if (button) chooseInGroup(group, button);
  }
  previewLook();
  return true;
}

// Reads the pasted FencingTracker link and fills in what the page shows. Anything the page does
// not show is left as it is, and everything stays editable before the profile is made.
async function lookUpTracker() {
  const status = $('#wLookupStatus');
  const button = $('#wLookup');
  const checked = parseFencerLink($('#wTracker').value);
  status.classList.toggle('error', Boolean(checked.error));
  if (checked.error) {
    status.textContent = checked.error;
    return;
  }
  $('#wTracker').value = checked.url;
  button.disabled = true;
  status.classList.remove('error');
  status.textContent = 'Looking up your profile\u2026';
  try {
    const response = await fetch(lookupUrl(checked.url), { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('status ' + response.status);
    const found = readProfilePage(await response.text());
    if (found.name === '') throw new Error('no name on the page');
    $('#wName').value = found.name.slice(0, 60);
    if (found.club) $('#wClub').value = found.club.slice(0, 80);
    if (found.rating) $('#wRating').value = found.rating;
    if (found.weapon) {
      const group = $('#wWeapon');
      chooseInGroup(group, [...group.querySelectorAll('[role="radio"]')].find((option) => option.dataset.value === found.weapon));
    }
    const missing = [['weapon', found.weapon], ['club', found.club], ['rating', found.rating]].filter(([, value]) => !value).map(([label]) => label);
    status.textContent = 'Filled in from your profile. Please check it' + (missing.length ? ' and add your ' + missing.join(' and ') + ' yourself' : '') + '.';
  } catch (error) {
    status.classList.add('error');
    status.textContent = 'Could not read that profile just now. Check the link and your connection, or type your details below.';
  } finally {
    button.disabled = false;
    saveDraft();
  }
}

function createProfile(event) {
  event.preventDefault();
  const result = validateNewProfile(formValues());
  if (result.error) {
    $('#wError').textContent = result.error;
    return;
  }
  const { profile } = result;
  const id = newProfileId();
  const saved = saveProfileData(id, startingData(profile));
  if (!saved) {
    $('#wError').textContent = 'Your browser is not letting this page save anything. Check that private browsing or blocked site data is off, then try again.';
    return;
  }
  saveProfileList([...loadProfileList(), { id, name: profile.name, weapon: profile.weapon, club: profile.club }]);
  clearDraft();
  setActiveProfile(id);
  window.location.reload();
}

function showWelcome() {
  const list = cleanProfileList(loadProfileList());
  $('.page').hidden = true;
  $('#welcome').hidden = false;
  showSavedProfiles(list);
  for (const group of document.querySelectorAll('#welcome [role="radiogroup"]')) {
    group.addEventListener('click', (event) => {
      const button = event.target.closest('[role="radio"]');
      if (!button) return;
      chooseInGroup(group, button);
      previewLook();
    });
  }
  $('#wShowNew').addEventListener('click', () => {
    $('#wNewForm').hidden = false;
    $('#wShowNew').hidden = true;
    $('#wName').focus();
  });
  $('#wNewForm').addEventListener('submit', createProfile);
  $('#wLookup').addEventListener('click', lookUpTracker);
  $('#wNewForm').addEventListener('input', saveDraft);
  $('#wNewForm').addEventListener('click', saveDraft);
  // A refresh in the middle of setup brings back what was typed, and shows the form again.
  if (restoreDraft()) {
    $('#wNewForm').hidden = false;
    $('#wShowNew').hidden = true;
  }
}

if (loadProfileList().length === 0) adoptOldData();
const openId = activeProfileId();
if (openId !== '' && cleanProfileList(loadProfileList()).some((entry) => entry.id === openId)) {
  startApp();
} else {
  showWelcome();
}
