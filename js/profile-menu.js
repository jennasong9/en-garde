// The "Profiles" part of Settings: switch to another profile, or delete this one. Switching
// reloads the page, which shows the welcome screen (every profile is chosen there).
import { $ } from './dom.js';
import {
  activeProfileId,
  deleteProfileData,
  loadProfileList,
  saveProfileList,
  setActiveProfile,
} from './storage.js';
import { deleteProfileVideos } from './videostore.js';

const CONFIRM_MS = 4000;

// Keeps the welcome screen's list in step with the open profile's name, weapon and club.
export function rememberProfile(profile) {
  const id = activeProfileId();
  const list = loadProfileList().map((entry) =>
    entry.id === id ? { ...entry, name: profile.name, weapon: profile.weapon, club: profile.club } : entry);
  saveProfileList(list);
}

function leaveProfile() {
  setActiveProfile('');
  window.location.reload();
}

export function initProfileMenu() {
  $('#switchProfile').addEventListener('click', leaveProfile);

  const deleteButton = $('#deleteProfile');
  let confirmTimer = null;
  const resetDelete = () => {
    deleteButton.textContent = 'Delete profile';
    confirmTimer = null;
  };
  deleteButton.addEventListener('click', () => {
    if (confirmTimer === null) {
      deleteButton.textContent = 'Tap again to delete';
      confirmTimer = setTimeout(resetDelete, CONFIRM_MS);
      return;
    }
    clearTimeout(confirmTimer);
    const id = activeProfileId();
    deleteProfileData(id);
    saveProfileList(loadProfileList().filter((entry) => entry.id !== id));
    // Wait for the videos to go before the page reloads, or the reload could cut it short.
    deleteProfileVideos(id).catch(() => {}).then(leaveProfile);
  });
}
