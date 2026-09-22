// Card pictograms (D-023): monochrome inline SVG built from a few primitives, so a card reads at a glance.
window.HB = window.HB || {};
(function () {
  const wrap = (paths, label) => `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}${label ? `<text x="31" y="31" text-anchor="end" font-size="9.5" font-weight="700" fill="currentColor" stroke="none" font-family="system-ui,sans-serif">${label}</text>` : ''}</svg>`;
  // straight arrow, rotated around the centre (0 = up; hex directions are multiples of 60)
  const arrow = deg => `<g transform="rotate(${deg} 16 16)"><path d="M16 26 V7 M10 13 L16 7 L22 13"/></g>`;
  const chevrons = n => { let d = `M16 27 V${28 - 7 * n - 1}`; for (let i = 0; i < n; i++) { const y = 28 - 7 * (n - i) - 1; d += ` M10 ${y + 6} L16 ${y} L22 ${y + 6}`; } return `<path d="${d}"/>`; };
  const minions = `<circle cx="9" cy="12" r="3"/><circle cx="23" cy="12" r="3"/><circle cx="16" cy="9" r="3.2"/><path d="M3 24 c0-4 2.7-6 6-6 s6 2 6 6 M17 24 c0-4 2.7-6 6-6 s6 2 6 6"/>`;
  const sword = `<path d="M9 23 L25 7 M17 7 L25 15 M6 26 L9 23"/>`;
  const shield = `<path d="M16 4 L26 8 V15 C26 21 21 26 16 28 C11 26 6 21 6 15 V8 Z"/>`;
  const eye = `<path d="M3 16 C8 8 24 8 29 16 C24 24 8 24 3 16 Z"/><circle cx="16" cy="16" r="4"/>`;
  const flag = `<path d="M8 28 V5 H24 L20 10.5 L24 16 H8"/>`;
  const star = n => { const pts = []; for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? 6 : 12; pts.push((16 + r * Math.cos(a)).toFixed(1) + ',' + (16 + r * Math.sin(a)).toFixed(1)); } return `<polygon points="${pts.join(' ')}"/>`; };
  const cards = `<rect x="3" y="10" width="11" height="15" rx="2" transform="rotate(-14 8.5 17.5)"/><rect x="10.5" y="7" width="11" height="15" rx="2"/><rect x="18" y="10" width="11" height="15" rx="2" transform="rotate(14 23.5 17.5)"/>`;

  const ICONS = {
    advance: wrap(arrow(0)),
    double_advance: wrap(chevrons(2), '2'),
    forced_march: wrap(chevrons(3), '3'),
    forward_left: wrap(arrow(-60)),
    forward_right: wrap(arrow(60)),
    backstep: wrap(`<path d="M16 6 V25 M10 19 L16 25 L22 19"/><path d="M11 3 H21" stroke-dasharray="2 2"/>`),
    pivot: wrap(`<path d="M23 11 A9 9 0 1 0 25 18"/><path d="M19 5 L24 11 L18 14"/>`, '60°'),
    rally: wrap(minions, '+4'),
    battle_cry: wrap(sword, '+25%'),
    hook_turn: wrap(`<path d="M9 27 V13 a7 7 0 0 1 7 -7 h9"/><path d="M21 2 L26 6 L21 10"/>`),
    reinforced_formation: wrap(shield + `<path d="M11 13 H21 M11 18 H21"/>`, '×0.7'),
    rear_assault: wrap(sword + `<path d="M6 10 L10 6 M6 6 L10 10"/>`, '×1.9'),
    split_march: wrap(arrow(0) + `<path d="M7 27 V14 M25 27 V14"/>`, '×2'),
    warband_reinforcements: wrap(minions, '+7'),
    tactical_reversal: wrap(`<path d="M12 6 V18 a5 5 0 0 0 10 0 V13"/><path d="M18 16 L22 12 L26 16"/><path d="M8 12 L12 18 L16 12"/>`, '180°'),
    recruitment: wrap(minions, '+6'),
    overwatch: wrap(eye, '50%'),
    explosive_charge: wrap(star(8), '4'),
    war_blessing: wrap(star(5), '+15%'),
    reinforced_shields: wrap(shield + `<path d="M6 9 H26" stroke-width="3"/>`, '−40%'),
    scout_route: wrap(cards),
    claim: wrap(flag, '×2'),
    blink: wrap(`<path d="M16 27 V22 M16 18 V14 M16 10 V7 M10 13 L16 7 L22 13"/>`),
  };
  HB.icons = { svg: id => ICONS[id] || wrap('<circle cx="16" cy="16" r="10"/>') };
})();
