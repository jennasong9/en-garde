// Pure logic for quick-add templates: no DOM, no storage, so it can be tested on its own. A template
// is { id, name, type, time, mins, location, notes }: the details of a usual session, to start the
// session form from. `time` is '' for an all-day session.
import { SESSION_TYPES, formatTime } from './schedule.js';

export const MAX_TEMPLATES = 8;
export const MAX_TEMPLATE_NAME_CHARS = 40;
const MAX_MINUTES = 600;

// "Footwork 5:00 PM", or "Tournament all day".
export function defaultTemplateName({ type, time }) {
  return SESSION_TYPES[type].short + ' ' + (time ? formatTime(time) : 'all day');
}

// The templates from what was saved, with anything damaged dropped and the most that fit kept.
export function cleanTemplates(saved) {
  if (!Array.isArray(saved)) return [];
  return saved
    .filter((template) => typeof template?.id === 'string'
      && typeof template.name === 'string' && template.name.trim() !== '' && template.name.length <= MAX_TEMPLATE_NAME_CHARS
      && SESSION_TYPES[template.type]
      && (template.time === '' || /^\d{2}:\d{2}$/.test(template.time))
      && Number.isInteger(template.mins) && template.mins >= 0 && template.mins <= MAX_MINUTES)
    .map((template) => ({
      id: template.id,
      name: template.name.trim(),
      type: template.type,
      time: template.time,
      mins: template.mins,
      location: String(template.location ?? ''),
      notes: String(template.notes ?? ''),
    }))
    .slice(0, MAX_TEMPLATES);
}

const sameDetails = (a, b) => a.type === b.type && a.time === b.time && a.mins === b.mins
  && a.location === b.location && a.notes === b.notes;

// What is wrong with saving `fields` under `name` as a template, or null when it can be saved.
// `ignoreId` is the template being edited, which does not count as a clash with itself.
export function validateTemplate(name, fields, templates, ignoreId = null) {
  const others = templates.filter((template) => template.id !== ignoreId);
  const trimmed = name.trim();
  if (trimmed === '') return 'Give the template a name.';
  if (trimmed.length > MAX_TEMPLATE_NAME_CHARS) return 'Keep the name under ' + MAX_TEMPLATE_NAME_CHARS + ' characters.';
  if (!Number.isInteger(fields.mins) || fields.mins < 0 || fields.mins > MAX_MINUTES) return 'Duration must be a whole number of minutes between 0 and ' + MAX_MINUTES + '.';
  if (others.some((template) => template.name.toLowerCase() === trimmed.toLowerCase())) return 'You already have a template with that name. Choose a different name.';
  if (others.some((template) => sameDetails(template, fields))) return 'You already have a template with exactly these details.';
  if (!ignoreId && templates.length >= MAX_TEMPLATES) return 'You have ' + MAX_TEMPLATES + ' templates. Delete one to add another.';
  return null;
}

// The session form's values for a template.
export const fieldsFromTemplate = ({ type, time, mins, location, notes }) => ({ type, time, mins, location, notes });
