// Delete buttons ask twice ("Delete" then "Really delete?") on the same button. A quick
// double-click would answer both questions in one go, so a second press this soon after the
// first is ignored.
const STRAY_CLICK_MS = 600;

// True when a press at `now` is too soon after the press at `armedAt` to be a real second answer.
export function isStrayClick(armedAt, now) {
  return armedAt !== null && now - armedAt < STRAY_CLICK_MS;
}
