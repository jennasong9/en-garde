// Saves to the browser's localStorage. Every call is guarded because storage can be
// blocked (private windows, site settings), and the app should still work without it.
//
// Each saved profile has its own space: its keys start with `engarde_acct.<id>.`. Which profile
// is open is remembered in `engarde_acct.active`, and the list of profiles in `engarde_acct.list`.
// The profile is read once when the page loads, so switching profiles reloads the page.

const ROOT = 'engarde_';
const ACCOUNT_ROOT = ROOT + 'acct.';
const ACTIVE_KEY = ACCOUNT_ROOT + 'active';
const LIST_KEY = ACCOUNT_ROOT + 'list';

function readRaw(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeRaw(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    return false;
  }
}

// The id of the profile that is open, or '' when nobody has chosen one yet.
export function activeProfileId() {
  const id = readRaw(ACTIVE_KEY, '');
  return typeof id === 'string' && /^[a-z0-9]+$/.test(id) ? id : '';
}

const prefix = () => ACCOUNT_ROOT + activeProfileId() + '.';

export function loadJson(key, fallback) {
  return activeProfileId() === '' ? fallback : readRaw(prefix() + key, fallback);
}

export function saveJson(key, value) {
  return activeProfileId() === '' ? false : writeRaw(prefix() + key, value);
}

export const loadProfileList = () => readRaw(LIST_KEY, []);
export const saveProfileList = (list) => writeRaw(LIST_KEY, list);
export const setActiveProfile = (id) => writeRaw(ACTIVE_KEY, id);

// Saves a set of values ({ key: value }) into a profile's own space before it is opened.
export function saveProfileData(id, data) {
  return Object.entries(data).every(([key, value]) => writeRaw(ACCOUNT_ROOT + id + '.' + key, value));
}

// Every saved value of one profile, { key: value } (used for a backup file).
export function readProfileData(id) {
  const own = ACCOUNT_ROOT + id + '.';
  const found = {};
  try {
    for (const name of Object.keys(localStorage).filter((key) => key.startsWith(own))) {
      found[name.slice(own.length)] = JSON.parse(localStorage.getItem(name));
    }
  } catch (error) {
    return found;
  }
  return found;
}

// Removes every saved value that belongs to one profile.
export function deleteProfileData(id) {
  try {
    const own = ACCOUNT_ROOT + id + '.';
    for (const key of Object.keys(localStorage).filter((name) => name.startsWith(own))) {
      localStorage.removeItem(key);
    }
  } catch (error) {
    // Nothing to remove if storage is blocked.
  }
}

// The saved names from before profiles existed: they start with `engarde_` but not with the
// profile space `engarde_acct.`. Pure, so it can be tested without touching real storage.
export function legacyKeyNames(names) {
  return names.filter((name) => name.startsWith(ROOT) && !name.startsWith(ACCOUNT_ROOT));
}

// Data saved before profiles existed lives directly under `engarde_`. Returns it as
// { key: value }, or an empty object when there is none.
export function legacyData() {
  const found = {};
  try {
    for (const name of legacyKeyNames(Object.keys(localStorage))) {
      found[name.slice(ROOT.length)] = JSON.parse(localStorage.getItem(name));
    }
  } catch (error) {
    return {};
  }
  return found;
}

// Removes that old data. It is copied into a profile once and must then go, or deleting the last
// profile would bring it back as a new, empty-looking profile.
export function clearLegacyData() {
  try {
    for (const name of legacyKeyNames(Object.keys(localStorage))) localStorage.removeItem(name);
  } catch (error) {
    // Nothing to remove if storage is blocked.
  }
}
