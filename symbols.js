// symbols.js — SVG renderers for the tattva symbols and the 2-hour ring. No time math here.
import { TATTVAS } from './clocks.js';

const SHAPES = {
  // black/indigo egg
  egg: '<path d="M24 3 C34 3 42 17 42 29 C42 39 34 45 24 45 C14 45 6 39 6 29 C6 17 14 3 24 3 Z"/>',
  circle: '<circle cx="24" cy="24" r="19.5"/>',
  triangle: '<polygon points="24,4.5 44,42 4,42"/>',
  square: '<rect x="5.5" y="5.5" width="37" height="37"/>',
  // crescent: outer circle c(24,24) r20 minus inner circle c(32,24) r17
  crescent: '<path d="M34.94 7.26 A20 20 0 1 0 34.94 40.74 A17 17 0 1 1 34.94 7.26 Z"/>',
};

/** Inline SVG for one tattva symbol. */
export function tattvaSymbol(name, { title = true } = {}) {
  const t = TATTVAS[name];
  const shape = SHAPES[t.shape];
  const stroke = t.name === 'Akasha' ? t.ink : 'rgba(0,0,0,0.35)';
  return `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${t.name}">${title ? `<title>${t.name} (${t.element})</title>` : ''}<g fill="${t.color}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round">${shape}</g></svg>`;
}

function polar(cx, cy, r, frac) {
  const a = frac * Math.PI * 2 - Math.PI / 2; // start at 12 o'clock
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arcPath(cx, cy, r, f0, f1) {
  const [x0, y0] = polar(cx, cy, r, f0);
  const [x1, y1] = polar(cx, cy, r, f1);
  const large = f1 - f0 > 0.5 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/**
 * One tattva cycle as a ring. `segments` come from clocks.tattvaRingSegments();
 * `fraction` (0..1) is the current position; `current` is the main tattva name.
 */
export function ringSVG(segments, fraction, current) {
  const S = 120, c = 60, r = 50, w = 12;
  let out = `<svg viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`;
  out += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="rgba(201,168,76,0.18)" stroke-width="1"/>`;
  for (const seg of segments) {
    const gap = 0.004;
    const d = arcPath(c, c, r, seg.start + gap, seg.end - gap);
    const active = seg.name === current;
    out += `<path d="${d}" fill="none" stroke="${seg.info.color}" stroke-width="${w}" opacity="${active ? 1 : 0.45}"/>`;
    if (seg.name === 'Akasha') {
      // indigo reads as black on black: trace a thin edge so the egg's slice is visible
      out += `<path d="${d}" fill="none" stroke="${seg.info.ink}" stroke-width="${w}" opacity="0.25"/>`;
    }
    // sub-tattva ticks
    for (let k = 1; k < 5; k++) {
      const f = seg.start + (seg.end - seg.start) * (k / 5);
      const [ax, ay] = polar(c, c, r - w / 2, f);
      const [bx, by] = polar(c, c, r + w / 2, f);
      out += `<line x1="${ax.toFixed(2)}" y1="${ay.toFixed(2)}" x2="${bx.toFixed(2)}" y2="${by.toFixed(2)}" stroke="rgba(8,8,8,0.7)" stroke-width="1"/>`;
    }
  }
  // sunrise/cycle-start mark
  const [sx, sy] = polar(c, c, r + w / 2 + 3, 0);
  out += `<circle cx="${sx.toFixed(2)}" cy="${sy.toFixed(2)}" r="1.6" fill="#c9a84c" opacity="0.7"/>`;
  // moving marker
  const [mx, my] = polar(c, c, r, fraction);
  out += `<circle cx="${mx.toFixed(2)}" cy="${my.toFixed(2)}" r="5.5" fill="#c9a84c" stroke="#080808" stroke-width="2"/>`;
  // hand from centre
  out += `<line x1="${c}" y1="${c}" x2="${mx.toFixed(2)}" y2="${my.toFixed(2)}" stroke="#c9a84c" stroke-width="1" opacity="0.5"/>`;
  out += `<circle cx="${c}" cy="${c}" r="2" fill="#c9a84c"/>`;
  out += '</svg>';
  return out;
}
