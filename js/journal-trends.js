import { el } from './dom.js';
import { FEELINGS, FEELING_SCORES, feelingTrend, trendDirection } from './journal.js';
import { parseIso, toIso } from './schedule.js';

// The Trends view of the Journal: a line of how you felt in your entries over the last 30 or 90
// days, with a short sentence about which way it is heading. It is drawn again whenever the
// journal is, so it follows new, edited and deleted entries.

export const TREND_RANGES = [{ days: 30, label: '30 days' }, { days: 90, label: '90 days' }];

const SVG_NS = 'http://www.w3.org/2000/svg';
const WIDTH = 360;
const HEIGHT = 170;
const DATE_LABELS = 5;
const LEFT = 56;
const RIGHT = 14;
const TOP = 16;
const BOTTOM = 26;
const ROWS = ['sharp', 'steady', 'tired', 'rough'];

const svgEl = (name, attrs = {}, text = '') => {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text) node.textContent = text;
  return node;
};

const DIRECTION_TEXT = {
  up: 'Trending up: your recent entries feel better than your earlier ones.',
  down: 'Trending down: your recent entries feel harder than your earlier ones.',
  steady: 'Holding steady: your recent entries feel about like your earlier ones.',
};

const shortDate = (iso) => parseIso(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// Fills `box` with the chart for the last `days` days ending on `todayIso`.
export function renderTrends(box, entries, todayIso, days) {
  const points = feelingTrend(entries, todayIso, days);
  box.replaceChildren();
  if (points.length === 0) {
    box.append(el('p', { class: 'empty', text: 'No feelings in the last ' + days + ' days yet. Write an entry and your trend will show up here.' }));
    return;
  }

  const first = parseIso(todayIso);
  first.setDate(first.getDate() - (days - 1));
  const firstTime = first.getTime();
  const span = parseIso(todayIso).getTime() - firstTime;
  const xOf = (iso) => LEFT + ((parseIso(iso).getTime() - firstTime) / span) * (WIDTH - LEFT - RIGHT);
  const yOf = (score) => TOP + ((FEELING_SCORES.sharp - score) / (FEELING_SCORES.sharp - FEELING_SCORES.rough)) * (HEIGHT - TOP - BOTTOM);

  const chart = svgEl('svg', {
    class: 'trend-chart',
    viewBox: '0 0 ' + WIDTH + ' ' + HEIGHT,
    role: 'img',
    'aria-label': 'How you felt in your journal entries over the last ' + days + ' days, from Rough to Sharp',
  });
  for (const feeling of ROWS) {
    const y = yOf(FEELING_SCORES[feeling]);
    chart.append(
      svgEl('line', { class: 'trend-grid', x1: LEFT, x2: WIDTH - RIGHT, y1: y, y2: y }),
      svgEl('text', { class: 'trend-label', x: LEFT - 8, y: y + 4, 'text-anchor': 'end' }, FEELINGS[feeling].label));
  }
  // Evenly spaced dates along the bottom: the first day, a few in between, and "Today".
  for (let tick = 0; tick < DATE_LABELS; tick += 1) {
    const day = new Date(firstTime + (span * tick) / (DATE_LABELS - 1));
    const last = tick === DATE_LABELS - 1;
    const anchor = tick === 0 ? 'start' : last ? 'end' : 'middle';
    const x = LEFT + (tick / (DATE_LABELS - 1)) * (WIDTH - LEFT - RIGHT);
    chart.append(svgEl('text', { class: 'trend-label', x, y: HEIGHT - 6, 'text-anchor': anchor }, last ? 'Today' : shortDate(toIso(day))));
  }
  if (points.length > 1) {
    chart.append(svgEl('polyline', { class: 'trend-line', points: points.map((point) => xOf(point.date) + ',' + yOf(point.score)).join(' ') }));
  }
  for (const point of points) {
    const dot = svgEl('circle', { class: 'trend-dot', cx: xOf(point.date), cy: yOf(point.score), r: 4.5 });
    dot.append(svgEl('title', {}, shortDate(point.date) + ': ' + describeScore(point.score)));
    chart.append(dot);
  }
  box.append(chart);

  const direction = trendDirection(points);
  box.append(el('p', {
    class: 'trend-summary',
    text: direction ? DIRECTION_TEXT[direction] : 'Write a few more entries and the direction of your trend will show here.',
  }));
}

// A score as the nearest feeling's name, such as "Steady", with "about" when it is an average of
// several entries on one day.
function describeScore(score) {
  const nearest = ROWS.reduce((best, feeling) => (Math.abs(FEELING_SCORES[feeling] - score) < Math.abs(FEELING_SCORES[best] - score) ? feeling : best));
  return (Number.isInteger(score) ? '' : 'about ') + FEELINGS[nearest].label;
}
