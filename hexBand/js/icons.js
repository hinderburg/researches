// Card pictograms (D-023): monochrome inline SVG built from a few primitives, so a card reads at a glance.
// HB.icons.svg(id) returns markup (stroke = currentColor); HB.icons.image(id, color) returns a cached Image for canvas use.
window.HB = window.HB || {};
(function () {
  const wrap = (paths, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}${label ? `<text x="31" y="31" text-anchor="end" font-size="9.5" font-weight="700" fill="currentColor" stroke="none" font-family="system-ui,sans-serif">${label}</text>` : ''}</svg>`;
  const chevrons = n => { let d = `M16 27 V${28 - 7 * n - 1}`; for (let i = 0; i < n; i++) { const y = 28 - 7 * (n - i) - 1; d += ` M10 ${y + 6} L16 ${y} L22 ${y + 6}`; } return `<path d="${d}"/>`; };
  const minions = `<circle cx="9" cy="12" r="3"/><circle cx="23" cy="12" r="3"/><circle cx="16" cy="9" r="3.2"/><path d="M3 24 c0-4 2.7-6 6-6 s6 2 6 6 M17 24 c0-4 2.7-6 6-6 s6 2 6 6"/>`;
  const sword = `<path d="M9 23 L25 7 M17 7 L25 15 M6 26 L9 23"/>`;
  const shield = `<path d="M16 4 L26 8 V15 C26 21 21 26 16 28 C11 26 6 21 6 15 V8 Z"/>`;
  const flag = `<path d="M8 28 V5 H24 L20 10.5 L24 16 H8"/>`;
  const star = n => { const pts = []; for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? 6 : 12; pts.push((16 + r * Math.cos(a)).toFixed(1) + ',' + (16 + r * Math.sin(a)).toFixed(1)); } return `<polygon points="${pts.join(' ')}"/>`; };
  const cards = `<rect x="3" y="10" width="11" height="15" rx="2" transform="rotate(-14 8.5 17.5)"/><rect x="10.5" y="7" width="11" height="15" rx="2"/><rect x="18" y="10" width="11" height="15" rx="2" transform="rotate(14 23.5 17.5)"/>`;
  const feet = `<ellipse cx="11" cy="20" rx="3.2" ry="5" transform="rotate(-12 11 20)"/><ellipse cx="21" cy="12" rx="3.2" ry="5" transform="rotate(-12 21 12)"/><path d="M8.5 13.5 l1 -1 M11.5 12.5 l1 -1 M18.5 5.5 l1 -1 M21.5 4.5 l1 -1" stroke-width="2"/>`;
  const hexagon = (cx, cy, r) => { const pts = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; pts.push((cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1)); } return `<polygon points="${pts.join(' ')}"/>`; };

  const ICONS = {
    advance: wrap(feet),
    double_advance: wrap(chevrons(2), '2'),
    forced_march: wrap(chevrons(3), '3'),
    hook: wrap(`<path d="M10 27 V13 L22 6"/><path d="M15 4 L23 5.5 L21 13"/>`, '2'),
    long_hook: wrap(`<path d="M10 28 V10 L22 4"/><path d="M15 2.5 L23 3.5 L21 11"/>`, '3'),
    zigzag: wrap(`<path d="M8 27 L14 12 L20 22 L26 7"/><path d="M19 8 L26 6 L27 13"/>`, '2'),
    around: wrap(`<path d="M8 26 V14 A8 8 0 0 1 24 14 V19"/><path d="M19 15 L24 20 L29 15"/>`, '3'),
    split_march: wrap(`<path d="M16 26 V7 M10 13 L16 7 L22 13"/>` + hexagon(6, 22, 4) + hexagon(26, 22, 4), '1'),
    dash: wrap(`<path d="M16 28 V12 M10 18 L16 12 L22 18"/>` + hexagon(16, 6, 4.5), '2'),
    flank_claim: wrap(hexagon(16, 16, 4) + hexagon(5.5, 16, 4.5) + hexagon(26.5, 16, 4.5) + `<path d="M9.5 16 H12 M20 16 H22.5" stroke-dasharray="1.5 1.5"/>`),
    volley: wrap(`<path d="M5 27 C8 14 18 8 27 5"/><path d="M20 5 L27 5 L27 12"/><path d="M12 24 L16 20 M14 27 L18 23" stroke-width="2"/>`, '2'),
    rally: wrap(minions, '+4'),
    warband_reinforcements: wrap(minions, '+6'),
    battle_cry: wrap(sword, '+2'),
    reinforced_formation: wrap(shield + `<path d="M11 13 H21 M11 18 H21"/>`, '−2'),
    recruitment: wrap(minions, '+6'),
    cordon: wrap(hexagon(16, 16, 4) + [0, 1, 2, 3, 4, 5].map(i => hexagon(16 + 10.5 * Math.cos(Math.PI / 3 * i), 16 + 10.5 * Math.sin(Math.PI / 3 * i), 3.6)).join('')),
    explosive_charge: wrap(star(8), '4'),
    prayer: wrap(`<path d="M16 4 V28 M8 12 H24"/><path d="M10 28 H22" stroke-width="3"/>`),
    catapult: wrap(`<path d="M6 26 H26 M9 26 L20 8 M14 26 L20 8"/><circle cx="22" cy="6" r="3.5"/><path d="M4 12 C10 6 18 4 26 4" stroke-dasharray="2 2"/>`, '3'),
    scout_draw: wrap(cards + `<path d="M25 3 L29 7 M29 3 L25 7" stroke-width="2"/>`, '+'),
    banner: wrap(flag, '+1'),
    blink: wrap(`<path d="M16 27 V22 M16 18 V14 M16 10 V7 M10 13 L16 7 L22 13"/>`),
    // D-059: citadel cards
    muster: wrap(minions, '+7'),
    heavy_charge: wrap(star(8), '5'),
    trebuchet: wrap(`<path d="M6 26 H26 M9 26 L20 8 M14 26 L20 8"/><circle cx="22" cy="6" r="3.5"/><path d="M4 12 C10 6 18 4 26 4" stroke-dasharray="2 2"/>`, '4'),
    war_horn: wrap(sword, '+3'),
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
