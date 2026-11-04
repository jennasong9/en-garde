import { el } from './dom.js';

// A small pop-down menu opened by a button. The menu closes when an item is chosen, when the user
// clicks elsewhere or presses Escape, and only one menu is open at a time.
// Markup: <div class="menu-wrap"> <button class="menu-btn"> and <div class="menu-list" hidden> with
// `.menu-item` buttons </div></div>.

function closeAll(except = null) {
  for (const wrap of document.querySelectorAll('.menu-wrap.open')) {
    if (wrap === except) continue;
    wrap.classList.remove('open');
    wrap.querySelector('.menu-list').hidden = true;
    wrap.querySelector('.menu-btn').setAttribute('aria-expanded', 'false');
  }
}

export function setupMenu(wrap) {
  const button = wrap.querySelector('.menu-btn');
  const list = wrap.querySelector('.menu-list');
  button.setAttribute('aria-haspopup', 'true');
  button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const opening = list.hidden;
    closeAll(wrap);
    list.hidden = !opening;
    wrap.classList.toggle('open', opening);
    button.setAttribute('aria-expanded', String(opening));
    if (opening) list.querySelector('.menu-item')?.focus();
  });
  list.addEventListener('click', () => {
    closeAll();
    button.focus();
  });
  wrap.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || list.hidden) return;
    event.stopPropagation();
    closeAll();
    button.focus();
  });
}

// A menu built from `items` ({ text, label, onclick }), opened by a button showing `buttonContent`.
export function buildMenu(buttonClass, buttonLabel, buttonContent, items) {
  const wrap = el('div', { class: 'menu-wrap' },
    el('button', { class: 'menu-btn ' + buttonClass, type: 'button', 'aria-label': buttonLabel, title: buttonLabel }, ...buttonContent),
    el('div', { class: 'menu-list', hidden: '' }, ...items.map((item) => el('button', {
      class: 'menu-item',
      type: 'button',
      text: item.text,
      ...(item.label ? { 'aria-label': item.label } : {}),
      onclick: item.onclick,
    }))));
  setupMenu(wrap);
  return wrap;
}

document.addEventListener('click', () => closeAll());
