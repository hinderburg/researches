// Card pictograms (D-023): monochrome inline SVG built from a few primitives, so a card reads at a glance.
// HB.icons.svg(id) returns markup (stroke = currentColor); HB.icons.image(id, color) returns a cached Image for canvas use.
window.HB = window.HB || {};
(function () {
  const wrap = (paths, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}${label ? `<text x="31" y="31" text-anchor="end" font-size="9.5" font-weight="700" fill="currentColor" stroke="none" font-family="system-ui,sans-serif">${label}</text>` : ''}</svg>`;
  // straight arrow, rotated around the centre (0 = up; hex directions are multiples of 60)
  const arrow = (deg, scale) => `<g transform="rotate(${deg} 16 16)${scale ? ` translate(16 16) scale(${scale}) translate(-16 -16)` : ''}"><path d="M16 26 V7 M10 13 L16 7 L22 13"/></g>`;
  const chevrons = n => { let d = `M16 27 V${28 - 7 * n - 1}`; for (let i = 0; i < n; i++) { const y = 28 - 7 * (n - i) - 1; d += ` M10 ${y + 6} L16 ${y} L22 ${y + 6}`; } return `<path d="${d}"/>`; };
  const minions = `<circle cx="9" cy="12" r="3"/><circle cx="23" cy="12" r="3"/><circle cx="16" cy="9" r="3.2"/><path d="M3 24 c0-4 2.7-6 6-6 s6 2 6 6 M17 24 c0-4 2.7-6 6-6 s6 2 6 6"/>`;
  const sword = `<path d="M9 23 L25 7 M17 7 L25 15 M6 26 L9 23"/>`;
  const shield = `<path d="M16 4 L26 8 V15 C26 21 21 26 16 28 C11 26 6 21 6 15 V8 Z"/>`;
  const eye = `<path d="M3 16 C8 8 24 8 29 16 C24 24 8 24 3 16 Z"/><circle cx="16" cy="16" r="4"/>`;
  const flag = `<path d="M8 28 V5 H24 L20 10.5 L24 16 H8"/>`;
  const star = n => { const pts = []; for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? 6 : 12; pts.push((16 + r * Math.cos(a)).toFixed(1) + ',' + (16 + r * Math.sin(a)).toFixed(1)); } return `<polygon points="${pts.join(' ')}"/>`; };
  const cards = `<rect x="3" y="10" width="11" height="15" rx="2" transform="rotate(-14 8.5 17.5)"/><rect x="10.5" y="7" width="11" height="15" rx="2"/><rect x="18" y="10" width="11" height="15" rx="2" transform="rotate(14 23.5 17.5)"/>`;
  const feet = `<ellipse cx="11" cy="20" rx="3.2" ry="5" transform="rotate(-12 11 20)"/><ellipse cx="21" cy="12" rx="3.2" ry="5" transform="rotate(-12 21 12)"/><path d="M8.5 13.5 l1 -1 M11.5 12.5 l1 -1 M18.5 5.5 l1 -1 M21.5 4.5 l1 -1" stroke-width="2"/>`;

  const ICONS = {
    advance: wrap(feet),
    double_advance: wrap(chevrons(2), '2'),
    forced_march: wrap(chevrons(3), '3'),
    hook: wrap(`<path d="M10 27 V13 L22 6"/><path d="M15 4 L23 5.5 L21 13"/>`, '2'),
    long_hook: wrap(`<path d="M10 28 V10 L22 4"/><path d="M15 2.5 L23 3.5 L21 11"/>`, '3'),
    zigzag: wrap(`<path d="M8 27 L14 12 L20 22 L26 7"/><path d="M19 8 L26 6 L27 13"/>`, '2'),
    around: wrap(`<path d="M8 26 V14 A8 8 0 0 1 24 14 V19"/><path d="M19 15 L24 20 L29 15"/>`, '3'),
    ring: wrap(`<path d="M16 26 A10 10 0 1 1 26 16"/><path d="M22 10 L26 16 L30 10"/><circle cx="16" cy="16" r="2.5" fill="currentColor"/>`, '5'),
    charge: wrap(arrow(0) + `<path d="M4 24 L9 19 M6 27 L10 23" stroke-width="2"/>`, '+30%'),
    rally: wrap(minions, '+4'),
    battle_cry: wrap(sword, '+25%'),
    reinforced_formation: wrap(shield + `<path d="M11 13 H21 M11 18 H21"/>`, '×0.7'),
    counter: wrap(shield + `<path d="M11 21 L21 11 M17 11 L21 11 L21 15"/>`, '50%'),
    split_march: wrap(arrow(0) + `<path d="M7 27 V14 M25 27 V14"/>`, '×2'),
    warband_reinforcements: wrap(minions, '+7'),
    recruitment: wrap(minions, '+6'),
    overwatch: wrap(eye, '50%'),
    explosive_charge: wrap(star(8), '4'),
    war_blessing: wrap(star(5), '+15%'),
    reinforced_shields: wrap(shield + `<path d="M6 9 H26" stroke-width="3"/>`, '−40%'),
    scout_route: wrap(cards),
    claim: wrap(flag, '×2'),
    blink: wrap(`<path d="M16 27 V22 M16 18 V14 M16 10 V7 M10 13 L16 7 L22 13"/>`),
  };
  const fallback = wrap('<circle cx="16" cy="16" r="10"/>');
  const imgCache = {};
  function image(id, color) {
    const key = id + '|' + color;
    if (imgCache[key]) return imgCache[key];
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent((ICONS[id] || fallback).replace(/currentColor/g, color));
    imgCache[key] = img;
    return img;
  }
  HB.icons = { svg: id => ICONS[id] || fallback, image };
})();
