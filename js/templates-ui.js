import { $, closeOnBackdropClick, el } from './dom.js';
import { showDialog } from './dialog-motion.js';
import { SESSION_TYPES, formatTime, makeId } from './schedule.js';
import { loadJson, saveJson } from './storage.js';
import { MAX_TEMPLATES, cleanTemplates, defaultTemplateName, validateTemplate } from './templates.js';

// Quick-add templates: the usual sessions to start the session form from. This file keeps them in
// the browser's storage, saves one from a session's details, and runs the "Quick-add templates"
// pop-up where they are added, edited, renamed and deleted.

let templates = cleanTemplates(loadJson('sessionTemplates', []));
let onChange = () => {};
const dialog = $('#templatesDialog');
const form = $('#templateForm');
// The template being edited ('' for a new one), and the one waiting for "Yes, delete".
let editingId = '';
let confirmingDeleteId = '';

const persist = () => saveJson('sessionTemplates', templates);

export const getTemplates = () => templates;

// Saves a session's details as a template named like "Footwork 5:00 PM". Returns a sentence saying
// what happened, for the day pop-up's status line.
export function saveTemplateFrom(fields) {
  const name = defaultTemplateName(fields);
  const problem = validateTemplate(name, fields, templates);
  if (problem) return 'Quick-add template not saved. ' + problem;
  templates = [...templates, { id: makeId(), name, ...fields }];
  persist();
  onChange();
  return 'Saved "' + name + '" as a quick-add template.';
}

function details(template) {
  return [SESSION_TYPES[template.type].label, template.time ? formatTime(template.time) : 'All day', template.mins && template.time ? template.mins + ' min' : '', template.location]
    .filter(Boolean).join(' · ');
}

function renderList() {
  $('#templateNew').disabled = templates.length >= MAX_TEMPLATES;
  $('#templateNew').hidden = form.hidden === false;
  $('#templateList').replaceChildren(...(templates.length === 0
    ? [el('li', { class: 'empty', text: 'No templates yet. Tap "+ New template", or tick "Save as a quick-add template" when you add a session.' })]
    : templates.map((template) => {
      const row = el('li', { class: 'plan-item' }, el('div', { class: 'plan-info' }, el('b', { text: template.name }), el('span', { text: details(template) })));
      if (confirmingDeleteId === template.id) {
        row.append(el('div', { class: 'plan-confirm' },
          el('span', { text: 'Delete this template?' }),
          el('button', { class: 'btn danger small', type: 'button', text: 'Yes, delete', onclick: () => remove(template) }),
          el('button', { class: 'btn ghost small', type: 'button', text: 'Cancel', onclick: () => { confirmingDeleteId = ''; renderList(); } })));
      } else {
        row.append(el('div', { class: 'plan-buttons' },
          el('button', { class: 'btn small', type: 'button', text: 'Edit', 'aria-label': 'Edit ' + template.name, onclick: () => openForm(template) }),
          el('button', { class: 'btn danger small', type: 'button', text: 'Delete', 'aria-label': 'Delete ' + template.name, onclick: () => { confirmingDeleteId = template.id; renderList(); } })));
      }
      return row;
    })));
}

function remove(template) {
  templates = templates.filter((other) => other.id !== template.id);
  persist();
  confirmingDeleteId = '';
  renderList();
  onChange();
}

// An all-day session has no start time or length, and a tournament has no set length.
function showTimeFields() {
  const allDay = $('#tAllDay').checked;
  $('#tTimeField').hidden = allDay;
  $('#tDurationField').hidden = allDay || $('#tType').value === 'tournament';
}

function openForm(template) {
  editingId = template ? template.id : '';
  confirmingDeleteId = '';
  $('#templateFormTitle').textContent = template ? 'Edit template' : 'New template';
  $('#tName').value = template ? template.name : '';
  $('#tType').value = template ? template.type : 'footwork';
  $('#tAllDay').checked = template ? template.time === '' : false;
  $('#tTime').value = template ? template.time : '17:00';
  $('#tMins').value = template ? template.mins : 60;
  $('#tLocation').value = template ? template.location : '';
  $('#tNotes').value = template ? template.notes : '';
  $('#tError').textContent = '';
  showTimeFields();
  form.hidden = false;
  renderList();
  $('#tName').focus();
}

function closeForm() {
  form.hidden = true;
  editingId = '';
  renderList();
}

export function initTemplates(changed) {
  onChange = changed;
  for (const [type, info] of Object.entries(SESSION_TYPES)) $('#tType').append(el('option', { value: type, text: info.short }));
  $('#tType').addEventListener('change', () => {
    if ($('#tType').value === 'tournament') $('#tAllDay').checked = true;
    showTimeFields();
  });
  $('#tAllDay').addEventListener('change', showTimeFields);

  $('#templateNew').addEventListener('click', () => openForm(null));
  $('#templateCancel').addEventListener('click', closeForm);
  $('#templatesClose').addEventListener('click', () => dialog.close());
  closeOnBackdropClick(dialog);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const allDay = $('#tAllDay').checked;
    const hasLength = !allDay && $('#tType').value !== 'tournament';
    const minsText = hasLength ? $('#tMins').value.trim() : '';
    const fields = {
      type: $('#tType').value,
      time: allDay ? '' : $('#tTime').value,
      mins: minsText === '' ? 0 : Number(minsText),
      location: $('#tLocation').value.trim(),
      notes: $('#tNotes').value.trim(),
    };
    const name = $('#tName').value.trim() || defaultTemplateName(fields);
    const problem = validateTemplate(name, fields, templates, editingId || null);
    if (problem) {
      $('#tError').textContent = problem;
      return;
    }
    templates = editingId
      ? templates.map((template) => (template.id === editingId ? { id: editingId, name, ...fields } : template))
      : [...templates, { id: makeId(), name, ...fields }];
    persist();
    closeForm();
    onChange();
  });

  $('#manageTemplates').addEventListener('click', () => {
    form.hidden = true;
    confirmingDeleteId = '';
    renderList();
    showDialog(dialog);
  });
}
