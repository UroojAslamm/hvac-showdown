export const LET = 'ABCD';
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (ms) => (ms / 1000).toFixed(2) + 's';

export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// GSAP helper: no-op when GSAP failed to load or the user prefers reduced motion
// lagSmoothing(0): on a slow device tweens keep real-time duration instead of crawling
try { window.gsap?.ticker.lagSmoothing(0); window.gsap?.config({ nullTargetWarn: false }); } catch {}
// Entrance tween that only runs when the targets exist and always hands styling back to CSS afterwards
export const enter = (g, sel, vars) => {
  if (!document.querySelector(sel)) return;
  g.from(sel, { ...vars, clearProps: 'transform,opacity' });
};
// Parse a fetch response without throwing on an empty or non-JSON body
export const json = async (r) => {
  const t = await r.text();
  try { return t ? JSON.parse(t) : { ok: false, error: 'empty response' }; } catch { return { ok: false, error: 'bad response' }; }
};
export const anim = (fn) => { if (window.gsap && !reduceMotion) try { fn(window.gsap); } catch {} };

export const ICON = {
  snow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M20.7 7 3.3 17M9 3.5l3 2.2 3-2.2M9 20.5l3-2.2 3 2.2M4 10.3l3.4-.6-1-3.3M20 13.7l-3.4.6 1 3.3M4 13.7l3.4.6-1 3.3M20 10.3l-3.4-.6 1-3.3"/></svg>',
  flame: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.5c1.2 4 5.8 6.4 5.8 12a5.8 5.8 0 0 1-11.6 0c0-2.9 1.6-4.7 2.9-5.8.2 2.1 1.1 3.4 2.8 4C11.2 8.6 11.4 5 12 1.5z"/></svg>',
  nfc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 8.5a5 5 0 0 1 0 7M9 6a9 9 0 0 1 0 12M13 3.5a13 13 0 0 1 0 17"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M7 3.5h10V8a5 5 0 0 1-10 0V3.5z"/><path d="M7 5.5H4a3.5 3.5 0 0 0 3.5 4.5M17 5.5h3a3.5 3.5 0 0 1-3.5 4.5M12 13v4M8 21h8M9.5 17h5v4h-5z"/></svg>',
  medal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><circle cx="12" cy="14.5" r="5.5"/><path d="M8.5 10 6 2.5h4l2 5 2-5h4L15.5 10"/><path d="m12 11.8 1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3.5 8.5h17v4h-17zM5 12.5h14V21H5zM12 8.5V21"/><path d="M12 8.5C10 4 6.5 4.5 7 7c.3 1.4 3 1.5 5 1.5zm0 0c2-4.5 5.5-4 5-1.5-.3 1.4-3 1.5-5 1.5z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
};

let ac;
export function tone(f = 660, d = 0.12, type = 'sine', vol = 0.08, delay = 0) {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const t = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + d + 0.02);
  } catch {}
}
