// The first thing that runs. If a profile is open, it starts the app. Otherwise it shows the
// welcome screen, where the person picks a saved profile or makes a new one. Profiles have no
// passwords: each is just its own saved space in this browser.
import { $ } from './dom.js';
import {
  activeProfileId,
  legacyData,
  loadProfileList,
  saveProfileData,
  saveProfileList,
  setActiveProfile,
} from './storage.js';
import { cleanProfileList, newProfileId, profileSummary, startingData, validateNewProfile } from './profiles.js';

const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

// Everything saved before profiles existed becomes the first profile, so nothing is lost.
function adoptOldData() {
  const old = legacyData();
  if (Object.keys(old).length === 0) return;
  const id = newProfileId();
  const oldProfile = old.profile ?? {};
  const name = oldProfile.name && oldProfile.name !== 'Your name' ? oldProfile.name : 'My profile';
  saveProfileData(id, old);
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

function createProfile(event) {
  event.preventDefault();
  const result = validateNewProfile({
    name: $('#wName').value,
    weapon: chosen($('#wWeapon')),
    club: $('#wClub').value,
    rating: $('#wRating').value,
    trackerLink: $('#wTracker').value,
    theme: chosen($('#wTheme')),
    font: chosen($('#wFont')),
    mealReminders: $('#wMealReminders').checked,
    waterReminders: $('#wWaterReminders').checked,
  });
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
}

if (loadProfileList().length === 0) adoptOldData();
const openId = activeProfileId();
if (openId !== '' && cleanProfileList(loadProfileList()).some((entry) => entry.id === openId)) {
  startApp();
} else {
  showWelcome();
}
