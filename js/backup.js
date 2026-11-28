// Backup files: one profile's saved data written to a file, and read back as a new profile. Pure
// logic (no DOM, no storage), so it can be tested on its own. Uploaded videos and meal photos live
// in a different place and are not part of a backup; YouTube links are kept.

export const BACKUP_FORMAT = 'en-garde-backup';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_CHARS = 20 * 1024 * 1024;

const KEY_PATTERN = /^[A-Za-z0-9_]{1,60}$/;

// The backup for one profile: its name, weapon and club (for the profile list) and every saved
// value, { key: value }. `savedAt` is an ISO date-time.
export function makeBackup(profile, data, savedAt) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    savedAt,
    profile: { name: profile.name, weapon: profile.weapon ?? '', club: profile.club ?? '' },
    data,
  };
}

// "en-garde-backup-jenna-song-2026-11-28.json": letters and numbers only, so any name is safe.
export function backupFileName(name, dateIso) {
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return 'en-garde-backup-' + (slug ? slug + '-' : '') + dateIso + '.json';
}

// Checks the text of a chosen file. Returns { profile, data } for a usable backup, or { error }
// in plain words.
export function readBackup(text) {
  if (typeof text !== 'string' || text.trim() === '') return { error: 'That file is empty.' };
  if (text.length > MAX_BACKUP_CHARS) return { error: 'That file is too big to be an En Garde backup.' };
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { error: 'That file is not an En Garde backup (it could not be read).' };
  }
  if (!parsed || typeof parsed !== 'object' || parsed.format !== BACKUP_FORMAT) {
    return { error: 'That file is not an En Garde backup.' };
  }
  if (!Number.isInteger(parsed.version) || parsed.version < 1 || parsed.version > BACKUP_VERSION) {
    return { error: 'That backup was made by a newer version of En Garde. Update the app and try again.' };
  }
  const { data } = parsed;
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length === 0) {
    return { error: 'That backup has no saved data in it.' };
  }
  if (!Object.keys(data).every((key) => KEY_PATTERN.test(key))) {
    return { error: 'That backup is damaged (it has unexpected entries).' };
  }
  const named = data.profile && typeof data.profile === 'object' ? data.profile : parsed.profile;
  const name = typeof named?.name === 'string' ? named.name.trim().slice(0, 60) : '';
  if (name === '') return { error: 'That backup has no profile name in it.' };
  const text80 = (value) => (typeof value === 'string' ? value.trim().slice(0, 80) : '');
  return {
    profile: { name, weapon: ['Foil', 'Epee', 'Sabre'].includes(named.weapon) ? named.weapon : 'Foil', club: text80(named.club) },
    data,
  };
}
