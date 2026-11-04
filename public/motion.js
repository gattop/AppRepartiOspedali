// Entrance animation of each new screen.
import { $app } from './ui.js';

// Each time a new screen opens (not on every re-render of the same one), its blocks come in as on
// kyrie.ee: up from 28 px, unblurring, in a short wave; the ones below the fold as they scroll in.

const REVEAL = '.hero > *, .hcard, .rcard, .ocard, .tiles, .panel, .sec, .grow-r, .empty, .who, .form > *';
let revealedPath = null;
let revealObserver = null;

export function reveal() {
  const path = location.hash.split('?')[0];
  if (path === revealedPath) return;
  revealedPath = path;
  revealObserver?.disconnect();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  $app.querySelector('.hero')?.classList.add('draw');
  const els = [...$app.querySelectorAll(REVEAL)].slice(0, 40);
  let wave = 0;
  revealObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      revealObserver.unobserve(el);
      el.style.setProperty('--d', Math.min(wave++ * 0.05, 0.4) + 's');
      requestAnimationFrame(() => el.classList.add('in'));
    }
    wave = Math.max(0, wave - 4);
  }, { rootMargin: '0px 0px -6% 0px' });
  for (const el of els) {
    el.classList.add('rv');
    revealObserver.observe(el);
  }
}
