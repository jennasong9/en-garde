// The "Profiles" part of Settings: switch to another profile, or delete this one. Switching
// reloads the page, which shows the welcome screen (every profile is chosen there).
import { backupFileName, makeBackup } from './backup.js';
import { $ } from './dom.js';
import { download } from './export-plan.js';
import {
  activeProfileId,
  clearLegacyData,
  deleteProfileData,
  loadProfileList,
  readProfileData,
  saveProfileList,
  setActiveProfile,
} from './storage.js';
import { deleteProfilePhotos } from './photostore.js';
import { showToast } from './toast.js';
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

// Saves the open profile's data to a file the person can keep.
function downloadBackup() {
  const id = activeProfileId();
  const data = readProfileData(id);
  const entry = loadProfileList().find((item) => item.id === id) ?? {};
  const profile = { ...entry, ...(data.profile ?? {}) };
  const now = new Date();
  const date = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const file = backupFileName(profile.name ?? '', date);
  download(JSON.stringify(makeBackup(profile, data, now.toISOString())), 'application/json', file);
  showToast('Backup saved as ' + file + ' (check your Downloads folder).');
}

export function initProfileMenu() {
  $('#switchProfile').addEventListener('click', leaveProfile);
  $('#downloadBackup').addEventListener('click', downloadBackup);

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
    const remaining = loadProfileList().filter((entry) => entry.id !== id);
    saveProfileList(remaining);
    // With no profile left, old pre-profiles data must not be turned into a new one.
    if (remaining.length === 0) clearLegacyData();
    // Wait for the videos and photos to go before the page reloads, or the reload could cut it short.
    Promise.all([deleteProfileVideos(id), deleteProfilePhotos(id)].map((removal) => removal.catch(() => {}))).then(leaveProfile);
  });
}
