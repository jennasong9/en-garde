// A short burst of confetti, drawn with temporary page elements that remove themselves.

const COLORS = ['#7fa886', '#a9c8e8', '#f2c46d', '#e89aa8', '#b9a3e3', '#f4efe6'];
const PIECES = 48;

// Shoots confetti up and out from the page point (x, y), then it falls and fades.
export function burstConfetti(x, y) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 1000;';
  document.body.append(layer);

  const animations = Array.from({ length: PIECES }, () => {
    const piece = document.createElement('i');
    const size = 6 + Math.random() * 6;
    piece.style.cssText = 'position: absolute; left: ' + x + 'px; top: ' + y + 'px; width: ' + size + 'px; height: '
      + size * (Math.random() < 0.5 ? 1 : 0.5) + 'px; background: ' + COLORS[Math.floor(Math.random() * COLORS.length)]
      + '; border-radius: ' + (Math.random() < 0.3 ? '50%' : '2px') + ';';
    layer.append(piece);
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const speed = 90 + Math.random() * 170;
    const dx = Math.cos(angle) * speed;
    const peak = Math.sin(angle) * speed;
    const spin = (Math.random() - 0.5) * 900;
    return piece.animate([
      { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
      { transform: 'translate(' + dx * 0.6 + 'px, ' + peak + 'px) rotate(' + spin * 0.5 + 'deg)', opacity: 1, offset: 0.4 },
      { transform: 'translate(' + dx + 'px, ' + (peak + 260 + Math.random() * 120) + 'px) rotate(' + spin + 'deg)', opacity: 0 },
    ], { duration: 1300 + Math.random() * 700, easing: 'cubic-bezier(.2, .6, .4, 1)', fill: 'forwards' });
  });
  Promise.all(animations.map((animation) => animation.finished)).then(() => layer.remove(), () => layer.remove());
  // Backstop for a browser that stops animating (a hidden tab), so pieces never pile up.
  setTimeout(() => layer.remove(), 4000);
}
