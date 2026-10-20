// Saves to the browser's localStorage. Every call is guarded because storage can be
// blocked (private windows, site settings), and the app should still work without it.

const PREFIX = 'engarde_';

export function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

export function saveJson(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (error) {
    return false;
  }
}
