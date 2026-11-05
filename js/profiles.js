// Rules for saved profiles: no DOM and no storage, so they can be tested on their own.
// A profile is a name plus the fencer's details and a few starting preferences. There are no
// passwords; a profile is just a separate saved space in this browser.
import { parseOptionalFencerLink } from './fencingtracker.js';
import { FONT_CHOICES } from './fonts.js';
import { DEFAULT_REMINDERS } from './reminders.js';

export const WEAPONS = ['Foil', 'Epee', 'Sabre'];
export const THEME_CHOICES = ['auto', 'light', 'dark'];

// Checks the welcome form. Only the name and the weapon are required. Returns
// { profile } (cleaned up, ready to save) or { error } (a sentence for the person).
export function validateNewProfile(form) {
  const name = String(form.name ?? '').trim();
  if (name === '') return { error: 'Please enter your name.' };
  if (!WEAPONS.includes(form.weapon)) return { error: 'Please choose your weapon.' };
  const link = parseOptionalFencerLink(form.trackerLink ?? '');
  if (link.error) return { error: link.error };
  return {
    profile: {
      name,
      weapon: form.weapon,
      club: String(form.club ?? '').trim(),
      rating: String(form.rating ?? '').trim(),
      trackerLink: link.url,
      theme: THEME_CHOICES.includes(form.theme) ? form.theme : 'auto',
      font: FONT_CHOICES.includes(form.font) ? form.font : 'sans',
      mealReminders: form.mealReminders === true,
      waterReminders: form.waterReminders === true,
    },
  };
}

// The saved values a new profile starts with, keyed the way the app stores them. "Match my
// device" for the theme means saving nothing, so the app keeps following the device.
export function startingData(profile) {
  const data = {
    profile: { name: profile.name, club: profile.club, rating: profile.rating, weapon: profile.weapon },
    font: profile.font,
    reminders: { ...DEFAULT_REMINDERS, meals: profile.mealReminders, water: profile.waterReminders },
  };
  if (profile.trackerLink !== '') data.fencingTrackerLink = profile.trackerLink;
  if (profile.theme !== 'auto') data.theme = profile.theme;
  return data;
}

// A short id that is different every time, safe to use inside a storage key.
export function newProfileId(now = Date.now(), random = Math.random()) {
  return now.toString(36) + random.toString(36).slice(2, 6);
}

// The list as saved, with anything unusable dropped.
export function cleanProfileList(saved) {
  if (!Array.isArray(saved)) return [];
  return saved.filter((item) => item && typeof item.id === 'string' && /^[a-z0-9]+$/.test(item.id) && typeof item.name === 'string');
}

// The line shown for a profile on the welcome screen, such as "Jenna · Foil · Point Fencing Club".
export function profileSummary(entry) {
  return [entry.weapon, entry.club].filter((part) => part).join(' · ');
}
