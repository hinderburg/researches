// Flat-top hex grid, "odd-q" offset coordinates (odd columns shifted down by half a cell).
// Facing directions, clockwise from north: 0 N, 1 NE, 2 SE, 3 S, 4 SW, 5 NW.
window.HB = window.HB || {};
(function () {
  const SQRT3 = Math.sqrt(3);
  const DIRS = [{ q: 0, r: -1 }, { q: 1, r: -1 }, { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 }];
  const DIR_NAMES = ['N', 'NE', 'SE', 'S', 'SW', 'NW'];

  const key = (col, row) => col + ',' + row;
  const toAxial = (col, row) => ({ q: col, r: row - (col - (col & 1)) / 2 });
  const toOffset = (q, r) => ({ col: q, row: r + (q - (q & 1)) / 2 });

  function neighbor(col, row, dir) {
    const a = toAxial(col, row);
    const d = DIRS[((dir % 6) + 6) % 6];
    return toOffset(a.q + d.q, a.r + d.r);
  }
  function distance(a, b) {
    const A = toAxial(a.col, a.row), B = toAxial(b.col, b.row);
    const dq = A.q - B.q, dr = A.r - B.r;
    return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
  }
  function dirBetween(from, to) {
    for (let d = 0; d < 6; d++) {
      const n = neighbor(from.col, from.row, d);
      if (n.col === to.col && n.row === to.row) return d;
    }
    return -1;
  }
  // Zone of an attacker standing in direction `dir` (as seen from the defender) relative to the defender's facing.
  // D-003: front = the three forward hexes, side = the two rear-diagonal hexes, back = the single rear hex.
  function relZone(defFacing, dir) {
    const rel = ((dir - defFacing) % 6 + 6) % 6;
    if (rel === 0 || rel === 1 || rel === 5) return 'front';
    if (rel === 3) return 'back';
    return 'side';
  }
  const inFrontArc = (facing, dir) => relZone(facing, dir) === 'front';
  const turn = (facing, delta) => ((facing + delta) % 6 + 6) % 6;

  // Board shape helpers (see D-002): even columns hold ROWS cells, odd columns ROWS-1.
  function rowsInCol(col, rows) { return (col & 1) ? rows - 1 : rows; }
  function exists(col, row, cols, rows) {
    return col >= 0 && col < cols && row >= 0 && row < rowsInCol(col, rows);
  }
  function mirror(col, row, rows) { return { col, row: rowsInCol(col, rows) - 1 - row }; }

  function pixel(col, row, s) {
    return { x: s * 1.5 * col + s, y: s * SQRT3 * (row + 0.5 * (col & 1)) + s * SQRT3 / 2 };
  }
  function boardSize(cols, rows, s) {
    return { w: s * 1.5 * (cols - 1) + 2 * s, h: s * SQRT3 * rows };
  }
  function corners(x, y, s, inset) {
    const r = s - (inset || 0), pts = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i);
      pts.push({ x: x + r * Math.cos(a), y: y + r * Math.sin(a) });
    }
    return pts;
  }
  function pixelToCell(px, py, s, cols, rows) {
    let best = null, bd = Infinity;
    for (let c = 0; c < cols; c++) for (let r = 0; r < rowsInCol(c, rows); r++) {
      const p = pixel(c, r, s);
      const d = (p.x - px) ** 2 + (p.y - py) ** 2;
      if (d < bd) { bd = d; best = { col: c, row: r }; }
    }
    return best && bd <= (s * 0.95) ** 2 ? best : null;
  }
  // Angle (radians) of a facing direction for drawing arrows; 0 = north, clockwise.
  const dirAngle = (dir) => -Math.PI / 2 + dir * Math.PI / 3;

  HB.hex = { SQRT3, DIRS, DIR_NAMES, key, toAxial, toOffset, neighbor, distance, dirBetween, relZone, inFrontArc, turn,
    rowsInCol, exists, mirror, pixel, boardSize, corners, pixelToCell, dirAngle };
})();
