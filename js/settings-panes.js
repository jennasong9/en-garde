import { setFolded } from './fold.js';
import { $ } from './dom.js';
import { loadJson, saveJson } from './storage.js';

// Settings has two panes: the main list (with sections that fold away) and the profile form,
// which slides in over it. Which sections are folded is remembered on this device; before
// anything is saved they are all open.

const SLIDE_MS = 160;
const SLIDE_PX = 28;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const folded = new Set(loadJson('settingsFolded', []));

function initFoldingSections() {
  for (const section of document.querySelectorAll('.settings-fold')) {
    const key = section.dataset.fold;
    const toggle = section.querySelector('.fold-title');
    const startsFolded = folded.has(key);
    // Put each section in its saved state without sliding, then allow the sliding for later presses.
    section.classList.add('fold-init');
    section.classList.toggle('collapsed', startsFolded);
    toggle.setAttribute('aria-expanded', String(!startsFolded));
    requestAnimationFrame(() => requestAnimationFrame(() => section.classList.remove('fold-init')));
    toggle.addEventListener('click', () => {
      const folding = !section.classList.contains('collapsed');
      if (folding) folded.add(key);
      else folded.delete(key);
      saveJson('settingsFolded', [...folded]);
      setFolded(section, toggle, folding);
    });
  }
}

// Fades and slides a pane out (or in), unless the device asks for less motion.
async function slide(pane, direction, entering) {
  if (reducedMotion.matches) return;
  const offset = entering ? [direction * SLIDE_PX, 0] : [0, -direction * SLIDE_PX];
  const frames = [
    { opacity: entering ? 0 : 1, transform: 'translateX(' + offset[0] + 'px)' },
    { opacity: entering ? 1 : 0, transform: 'translateX(' + offset[1] + 'px)' },
  ];
  await pane.animate(frames, { duration: SLIDE_MS, easing: 'ease' }).finished;
}

// Wires up the panes. `onOpenProfile` fills in the profile form just before it appears, and
// `onLeaveProfile` runs when it goes away (so unsaved typing is dropped).
export function initSettingsPanes({ onOpenProfile, onLeaveProfile }) {
  const panes = { main: $('#settingsMain'), profile: $('#settingsProfile') };
  const titles = { main: 'Settings', profile: 'Edit profile' };
  let current = 'main';

  async function show(name) {
    if (name === current) return;
    const direction = name === 'profile' ? 1 : -1;
    const leaving = panes[current];
    current = name;
    $('#settingsBack').hidden = name === 'main';
    $('#settingsTitle').textContent = titles[name];
    await slide(leaving, direction, false);
    if (current !== name) return;
    leaving.hidden = true;
    if (name === 'main') onLeaveProfile();
    panes[name].hidden = false;
    if (name === 'profile') onOpenProfile();
    await slide(panes[name], direction, true);
  }

  $('#editProfileRow').addEventListener('click', () => show('profile'));
  $('#settingsBack').addEventListener('click', () => show('main'));
  initFoldingSections();

  return {
    // Opens Settings on the main list, with no sliding.
    reset() {
      current = 'main';
      panes.main.hidden = false;
      panes.profile.hidden = true;
      $('#settingsBack').hidden = true;
      $('#settingsTitle').textContent = titles.main;
    },
    goBack: () => show('main'),
  };
}
