// Checks a pasted FencingTracker profile link. Pure logic: no DOM, no storage.

const HOSTS = ['fencingtracker.com', 'www.fencingtracker.com'];
const EXAMPLE = 'https://fencingtracker.com/p/123456/Your-Name';

// Like parseFencerLink, but an empty box is fine and means "no link" ({ url: '' }).
export function parseOptionalFencerLink(text) {
  return String(text).trim() === '' ? { url: '' } : parseFencerLink(text);
}

// Turns what the user pasted into a clean profile link, or explains what is wrong.
// Returns { url } or { error }.
export function parseFencerLink(text) {
  const trimmed = String(text).trim();
  if (trimmed === '') return { error: 'Paste your FencingTracker profile link first.' };

  // Allow a link pasted without "https://" (for example "fencingtracker.com/p/123456/Name").
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : 'https://' + trimmed;
  let url;
  try {
    url = new URL(withScheme);
  } catch (error) {
    return { error: 'That does not look like a link. It should look like ' + EXAMPLE };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { error: 'Only web links are allowed. It should look like ' + EXAMPLE };
  }
  if (!HOSTS.includes(url.hostname) || url.username !== '' || url.password !== '') {
    return { error: 'That link is not from fencingtracker.com. Copy your profile link from the FencingTracker website.' };
  }
  if (!/^\/p\/\d+(\/|$)/.test(url.pathname)) {
    return { error: 'That is a FencingTracker link, but not a fencer profile. It should look like ' + EXAMPLE };
  }
  // Always use a secure link, and drop any extra query or fragment.
  return { url: 'https://' + url.hostname + url.pathname };
}
