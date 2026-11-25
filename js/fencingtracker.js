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

const WEAPON_NAMES = { foil: 'Foil', epee: 'Epee', 'épée': 'Epee', sabre: 'Sabre', saber: 'Sabre' };
const RATING_PATTERN = /^[UEDCBA]\d{2}$/;

// Reads a FencingTracker profile page (its HTML text) and returns whatever it can find:
// { name, club, weapon, rating }, each '' when the page does not show it. The weapon and rating
// come from the newest row of the "Rating history" table. Pure: the page is passed in.
export function readProfilePage(html) {
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  const text = (element) => (element ? element.textContent.replace(/\s+/g, ' ').trim() : '');
  let weapon = '';
  let rating = '';
  let newest = -Infinity;
  for (const row of doc.querySelectorAll('tr[data-ranking-search]')) {
    const cells = [...row.querySelectorAll('td')].map(text);
    const rowWeapon = WEAPON_NAMES[(cells[0] || '').toLowerCase()];
    if (!rowWeapon || !RATING_PATTERN.test(cells[1] || '')) continue;
    const time = Date.parse(cells[2]);
    const when = Number.isNaN(time) ? -Infinity : time;
    if (weapon === '' || when > newest) {
      weapon = rowWeapon;
      rating = cells[1];
      newest = when;
    }
  }
  return {
    name: text(doc.querySelector('h1')),
    club: text(doc.querySelector('.person-hero__club-link')),
    weapon,
    rating,
  };
}

// The address to fetch for a checked profile link. The "www." address does not allow other
// websites to read it, so the lookup always uses the plain fencingtracker.com address.
export function lookupUrl(url) {
  const address = new URL(url);
  address.hostname = 'fencingtracker.com';
  return address.href;
}
