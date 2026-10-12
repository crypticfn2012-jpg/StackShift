import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const languages = fs.readFileSync(path.join(root, 'languages.js'), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter((m) => !/\bsrc\s*=|type=["']application\/json["']/i.test(m[1]) && m[2].trim());
assert.equal(scripts.length, 1, 'expected one inline game script plus the external language pack');
const source = scripts[0][2];
new vm.Script(source, { filename: 'index.html:inline-game-script' });
new vm.Script(languages, { filename: 'languages.js' });

// Static checks for controls, embeds, safety, legal links, and platform lifecycle.
assert.match(html, /name=["']viewport["'][^>]*viewport-fit=cover/i);
assert.match(html, /user-select:\s*none/i);
assert.match(html, /touch-action:\s*none/i);
assert.match(html, /orientation:\s*landscape/i);
assert.match(source, /SDK\.gs\(\)/, 'gameplay-start event must be wired');
assert.match(source, /SDK\.gx\(\)/, 'gameplay-stop event must be wired');
assert.match(source, /loadingStart\(\)/, 'loading-start event must be wired');
assert.match(source, /loadingStop\(\)/, 'loading-stop event must be wired');
assert.match(source, /systemInfo[\s\S]{0,180}locale/, 'SDK locale must be read');
assert.match(source, /function preferredLanguage\(\)/);
assert.match(source, /e\.key===['"]p['"]\|\|e\.key===['"]P['"]/i, 'P must be the pause keyboard shortcut');
assert.doesNotMatch(source, /e\.key===['"]Escape['"]\)\{pause\(\)/, 'Escape should remain reserved for platform fullscreen behaviour');
assert.match(source, /Math\.min\(235,Math\.max\(170,VH\*\.42\)\)/, 'short embeds should budget more height for the board');
assert.match(html, /id=["']tutText["']/);
assert.match(html, /href=["']\.\/terms\.html["']/);
assert.match(html, /href=["']\.\/privacy\.html["']/);
assert.ok(fs.existsSync(path.join(root, 'terms.html')), 'terms page must be present');
assert.ok(fs.existsSync(path.join(root, 'privacy.html')), 'privacy page must be present');
assert.match(fs.readFileSync(path.join(root, 'terms.html'), 'utf8'), /Stack Shift/i);
assert.match(fs.readFileSync(path.join(root, 'privacy.html'), 'utf8'), /CrazyGames/i);
assert.match(source, /adFinished:\(\)=>\{[^}]*finish\(\)/, 'rewarded ad completion callback must be wired');
assert.match(source, /requestAnimationFrame\(frame\)/, 'game loop must be frame-driven');
assert.match(source, /Math\.min\(\.1,\(ts-last\)\/1e3/, 'timer must use elapsed time rather than frame count');
assert.doesNotMatch(languages, /Escape pauses the game|Escape puts the game on pause|Escape pausiert|Escape met en pause/i, 'translations must not tell players to pause with Escape');

// Exercise production puzzle generator over multiple seeds and all difficulties.
const genStart = source.indexOf('const rng=');
const genEnd = source.indexOf('/* ===== cosmetics ===== */', genStart);
assert.ok(genStart >= 0 && genEnd > genStart, 'puzzle generator section must exist');
const sandbox = {};
vm.runInNewContext(source.slice(genStart, genEnd) + ';globalThis.api={gen,verify,dims,GR,edgeOK};', sandbox, { timeout: 10000 });
const api = sandbox.api;
let generated = 0;
for (const seed of [1, 11, 113, 2026, 65537]) {
  for (let difficulty = 0; difficulty < api.GR.length; difficulty++) {
    for (let order = 0; order < 8; order++) {
      const puzzle = api.gen(seed, order, difficulty);
      assert.ok(puzzle && Array.isArray(puzzle.ps) && puzzle.ps.length, 'generator must return parcels');
      assert.ok(api.verify(puzzle), 'every generated puzzle must contain a valid solution');
      assert.equal(JSON.stringify(puzzle), JSON.stringify(api.gen(seed, order, difficulty)), 'seeded puzzle generation must be deterministic');
      const occupied = new Set();
      for (const piece of puzzle.ps) {
        assert.ok(Array.isArray(piece.cells) && piece.cells.length, 'parcels cannot be empty');
        const size = api.dims(piece.cells);
        const shape = new Set(piece.cells.map(([x, y]) => x + ',' + y));
        assert.equal(shape.size, piece.cells.length, 'parcels may not contain duplicate cells');
        for (const [x, y] of piece.cells) {
          assert.ok(Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < size[0] && y < size[1], 'local coordinates must be normalized');
        }
        for (const [x, y] of piece.sol) {
          const cell = (y + piece.sy) * puzzle.c + x + piece.sx;
          assert.ok(!occupied.has(cell), 'solution parcels may not overlap');
          occupied.add(cell);
        }
      }
      if (puzzle.rule === 'edge') {
        const p = puzzle.ps[puzzle.star];
        assert.ok(p && api.edgeOK(p.sol, p.sx, p.sy, puzzle.edge, puzzle.c, puzzle.r), 'edge-rule solution must touch the required wall');
      }
      if (puzzle.rule === 'fill') assert.equal(occupied.size, puzzle.c * puzzle.r, 'fill-rule solution must cover every board cell');
      generated++;
    }
  }
}

// Test production placement validation for boundaries and overlaps.
const fitStart = source.indexOf('function fit(');
const fitEnd = source.indexOf('const clr=', fitStart);
assert.ok(fitStart >= 0 && fitEnd > fitStart, 'placement validator must exist');
const fitContext = { G: { c: 3, r: 2, ps: [] } };
vm.runInNewContext(source.slice(fitStart, fitEnd) + ';globalThis.runFit=fit;', fitContext, { timeout: 1000 });
const parcel = { cells: [[0, 0], [1, 0]], pl: null };
assert.equal(fitContext.runFit(parcel, 0, 0), 1, 'valid placement should be accepted');
assert.match(fitContext.runFit(parcel, 2, 0), /inside the van/, 'out-of-bounds placement should be rejected');
fitContext.G.ps = [{ cells: [[0, 0]], pl: [0, 0] }];
assert.match(fitContext.runFit(parcel, 0, 0), /already taken/, 'overlap should be rejected');
assert.equal(fitContext.runFit(parcel, 1, 0), 1, 'adjacent parcels should be allowed');

// Approximate sizing at required short landscape, mobile landscape, and portrait viewports.
for (const [width, height] of [[821,462],[907,510],[800,450],[1080,607],[390,844],[768,1024]]) {
  const compactLandscape = width > height && height <= 700;
  const compactPortrait = height > width && width < 600;
  const tabletPortrait = height > width && width >= 600;
  const stageWidth = compactLandscape ? (width - 20) * 0.58 : compactPortrait ? width - 20 : tabletPortrait ? (width - 20) * 0.57 : width - 20;
  const widthBudget = Math.max(8, stageWidth - 16);
  const reservedHeight = compactLandscape ? 190 : compactPortrait ? 340 : tabletPortrait ? 330 : Math.min(310, Math.max(230, height * 0.34));
  const heightBudget = Math.max(80, height - reservedHeight);
  const cell = Math.max(4, Math.min(96, Math.floor(Math.min(widthBudget/5.2,widthBudget/5,heightBudget/8.1))));
  assert.ok(cell >= 24, 'parcel cells too small at ' + width + 'x' + height + ': ' + cell + 'px');
}
assert.match(source, /function syncRotateControl\(\)/, 'rotation must be restricted to active drags');
assert.match(source, /else if\(!d\.moved\)\{p\.pl=d\.oldPl\}/, 'a click/tap without dragging must not rotate a tray parcel');
assert.match(html, /id="rt"[^>]*disabled/, 'rotate must be disabled while idle');
console.log('Acceptance smoke tests passed: syntax, SDK lifecycle, locale/controls/legal links, placement validation, iframe sizing, and ' + generated + ' deterministic puzzle cases.');
