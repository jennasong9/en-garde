import { $, el } from './dom.js';
import { addGlass, waterStatus } from './hydration.js';
import { EVERY_CHOICES, LEAD_CHOICES, dueMeals, mealReminderText, normalizeReminders, normalizeSent, waterDue, waterReminderText } from './reminders.js';
import { toIso } from './schedule.js';
import { loadJson, saveJson } from './storage.js';
import { showToast } from './toast.js';

// Meal and water reminders: the Settings switches, and a check every half minute (and when the tab
// comes back into view) that shows a reminder pop-up when one is due. Reminders only appear while
// the app is open in a tab.

const CHECK_MS = 30 * 1000;
const REMINDER_MS = 12 * 1000;

let settings = normalizeReminders(loadJson('reminders', {}));

function save() {
  saveJson('reminders', settings);
}

// The browser notification, when the user has switched it on and the browser has allowed it.
function notify(text) {
  if (settings.notify && 'Notification' in window && Notification.permission === 'granted') {
    new Notification('En Garde', { body: text });
  }
}

function showWaterReminder(prefix = '') {
  const text = waterReminderText(waterStatus());
  showToast(prefix + text, { actionLabel: '+1 glass', onAction: addGlass, ms: REMINDER_MS });
  notify(text);
}

function showMealReminder(due) {
  const text = mealReminderText(due);
  showToast(text, { actionLabel: 'Open Nutrition', onAction: () => { location.hash = '#nutrition'; }, ms: REMINDER_MS });
  notify(text);
}

// Shows at most one reminder, a meal before water, and remembers it so it is not shown again.
function check() {
  if (!settings.meals && !settings.water) return;
  const now = new Date();
  const sent = normalizeSent(loadJson('reminderSent', null), toIso(now));
  const meals = loadJson('meals', []);
  const [nextMeal] = dueMeals(Array.isArray(meals) ? meals : [], now, settings, sent);
  if (nextMeal) {
    saveJson('reminderSent', { ...sent, keys: [...sent.keys, nextMeal.key] });
    showMealReminder(nextMeal);
  } else if (waterDue(now, settings, waterStatus(), sent)) {
    saveJson('reminderSent', { ...sent, waterAt: now.getTime() });
    showWaterReminder();
  }
}

// ---------- the Settings section ----------
function showSettings() {
  $('#remMeals').checked = settings.meals;
  $('#remWater').checked = settings.water;
  $('#remNotify').checked = settings.notify;
  $('#remLead').value = String(settings.leadMinutes);
  $('#remEvery').value = String(settings.waterEveryHours);
  $('#remFrom').value = settings.waterFrom;
  $('#remTo').value = settings.waterTo;
  $('#remLeadField').hidden = !settings.meals;
  $('#remWaterOptions').hidden = !settings.water;
}

function change(update) {
  settings = normalizeReminders({ ...settings, ...update });
  save();
  showSettings();
}

export function initReminders() {
  $('#remLead').replaceChildren(...LEAD_CHOICES.map((minutes) => el('option', { value: String(minutes), text: minutes + ' minutes before' })));
  $('#remEvery').replaceChildren(...EVERY_CHOICES.map((hours) => el('option', { value: String(hours), text: hours === 1 ? 'hour' : hours + ' hours' })));
  showSettings();

  $('#remMeals').addEventListener('change', (event) => change({ meals: event.target.checked }));
  $('#remWater').addEventListener('change', (event) => change({ water: event.target.checked }));
  $('#remLead').addEventListener('change', (event) => change({ leadMinutes: Number(event.target.value) }));
  $('#remEvery').addEventListener('change', (event) => change({ waterEveryHours: Number(event.target.value) }));
  for (const [id, key] of [['#remFrom', 'waterFrom'], ['#remTo', 'waterTo']]) {
    $(id).addEventListener('change', (event) => {
      const wanted = event.target.value;
      // The reminders cannot start after they end, so a time that does not fit is put back.
      if (normalizeReminders({ ...settings, [key]: wanted })[key] !== wanted) {
        $('#remNote').textContent = 'The water reminders must start before they end, so that time was put back.';
        showSettings();
        return;
      }
      $('#remNote').textContent = '';
      change({ [key]: wanted });
    });
  }

  $('#remNotify').addEventListener('change', async (event) => {
    $('#remNote').textContent = '';
    if (!event.target.checked) {
      change({ notify: false });
      return;
    }
    if (!('Notification' in window)) {
      change({ notify: false });
      $('#remNote').textContent = 'This browser does not support notifications, so reminders will only pop up in the app.';
      return;
    }
    const permission = await Notification.requestPermission();
    change({ notify: permission === 'granted' });
    if (permission !== 'granted') $('#remNote').textContent = 'The browser did not allow notifications. You can allow them in its site settings.';
  });

  $('#remTest').addEventListener('click', () => {
    $('#remNote').textContent = '';
    showWaterReminder('Test reminder. ');
  });

  setInterval(check, CHECK_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) check();
  });
  setTimeout(check, 1500);
}
