// Rules for the fencing rating shown on the Goals page: no DOM and no storage, so they can be
// tested on their own. A rating is a letter and the year it was earned: B26 is a B earned in 2026.
// From lowest to highest the letters are U, E, D, C, B, A. A rating can be earned again each year
// (a B26 can fence for a B27 from January 1, 2027), and it lasts four seasons: a B22 stays through
// the 2025-26 season and, if not earned again, drops on August 1, 2026 to a C carrying that year
// (C26), which in turn drops four seasons later, and so on down to U (unrated).

export const RATING_LADDER = ['U', 'E', 'D', 'C', 'B', 'A'];

// Reads "B26", "b 26" or "B2026" as { letter: 'B', year: 2026 }. A letter alone ("B") has year
// null. Anything else (including empty text or "Unrated") is null.
export function parseRating(text) {
  const match = /^\s*([UEDCBA])\s*'?\s*(\d{2}|\d{4})?\s*$/i.exec(String(text ?? ''));
  if (!match) return null;
  const digits = match[2];
  const year = digits === undefined ? null : digits.length === 2 ? 2000 + Number(digits) : Number(digits);
  return { letter: match[1].toUpperCase(), year };
}

// "B26" for a letter and a four-digit year.
export const ratingLabel = (letter, year) => letter + String(year).slice(-2);

const LAST_SEASONS = 4;
const SEASON_START_MONTH = 7; // August

// The rating the fencer holds today, after any drops since it was earned, as
// { letter, year, expiresOn, dropped }: `expiresOn` is the August 1 it runs out (null for a U or a
// rating with no year); `dropped` is { from, on } (the rating as saved, and the day of the latest
// drop) when it has dropped, else null.
export function currentRating(rating, now) {
  let { letter, year } = rating;
  if (year === null || letter === 'U') return { letter, year, expiresOn: null, dropped: null };
  const from = ratingLabel(letter, year);
  let dropped = null;
  let expiresOn = new Date(year + LAST_SEASONS, SEASON_START_MONTH, 1);
  while (letter !== 'U' && now >= expiresOn) {
    dropped = { from, on: expiresOn };
    letter = RATING_LADDER[RATING_LADDER.indexOf(letter) - 1];
    year = expiresOn.getFullYear();
    expiresOn = letter === 'U' ? null : new Date(year + LAST_SEASONS, SEASON_START_MONTH, 1);
    if (expiresOn === null) year = null;
  }
  return { letter, year, expiresOn, dropped };
}

// What the fencer could aim for next, given a parsed rating and today's date:
//   up    - the next letter up and the label it would have if earned this year (null for an A)
//   renew - the same letter earned again, its label, the day it opens and whether that has come
//           (null when the rating has no year, since there is nothing to count from)
export function ratingTargets(rating, now) {
  const thisYear = now.getFullYear();
  const higher = RATING_LADDER[RATING_LADDER.indexOf(rating.letter) + 1];
  const up = higher ? { letter: higher, label: ratingLabel(higher, thisYear) } : null;
  if (rating.year === null) return { up, renew: null };
  const renewYear = Math.max(rating.year + 1, thisYear);
  const opensOn = new Date(renewYear, 0, 1);
  const today = new Date(thisYear, now.getMonth(), now.getDate());
  const daysUntil = Math.max(0, Math.round((opensOn - today) / 86400000));
  return { up, renew: { label: ratingLabel(rating.letter, renewYear), opensOn, available: daysUntil === 0, daysUntil } };
}

// The goal the strip can pin for a rating label, kept short: "Earn B27" (also for renewing).
export const earnGoalName = (label) => 'Earn ' + label;

// A goal named like "Earn A27" is a rating goal. Only one can be on the board at a time (aiming
// for an A27 and a B27 together makes no sense), so this finds the one in the way of adding
// `name`: the name of an existing rating goal, or null when there is none (or `name` is not one).
const RATING_GOAL = /^Earn [UEDCBA]\d{2}$/i;
export const isRatingGoalName = (name) => RATING_GOAL.test(String(name).trim());

export function ratingGoalConflict(goals, name, ignoreId = null) {
  if (!isRatingGoalName(name)) return null;
  const other = goals.find((goal) => goal.id !== ignoreId && !goal.archived && isRatingGoalName(goal.name));
  return other ? other.name.trim() : null;
}
