import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire('/tmp/stackshift-browser-smoke/package.json');
const { chromium } = require('playwright');
const root = process.cwd();
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8'
};
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
  catch { res.writeHead(400).end('Bad request'); return; }
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filename = path.resolve(root, relative);
  if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end('Forbidden'); return; }
  fs.stat(filename, (statError, stat) => {
    if (statError || !stat.isFile()) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'content-type': mime[path.extname(filename)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(filename).pipe(res);
  });
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const origin = 'http://127.0.0.1:' + server.address().port;
const initScript = () => {
  const names = ['init', 'loadingStart', 'loadingStop', 'gameplayStart', 'gameplayStop', 'happytime', 'progress'];
  window.__stackShiftEvents = Object.fromEntries(names.map((name) => [name, 0]));
  const call = (name) => (...args) => { window.__stackShiftEvents[name]++; return undefined; };
  window.CrazyGames = { SDK: {
    environment: 'browser-smoke-test',
    init: async () => { window.__stackShiftEvents.init++; },
    user: { systemInfo: { locale: 'es-ES' } },
    data: {
      getItem: (key) => localStorage.getItem('sdk:' + key),
      setItem: (key, value) => localStorage.setItem('sdk:' + key, String(value))
    },
    game: {
      settings: { muteAudio: false },
      addSettingsChangeListener: () => {},
      loadingStart: call('loadingStart'),
      loadingStop: call('loadingStop'),
      gameplayStart: call('gameplayStart'),
      gameplayStop: call('gameplayStop'),
      happytime: call('happytime'),
      reportGameCompletedPercentage: call('progress')
    },
    ad: { requestAd: (type, callbacks) => { callbacks.adStarted(); callbacks.adFinished(); } }
  } };
};
const browser = await chromium.launch({ headless: true });
const pageErrors = [];
async function makePage(options) {
  const context = await browser.newContext(options);
  await context.addInitScript(initScript);
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  await page.waitForSelector('#menu:not(.hide)', { state: 'visible', timeout: 10000 });
  return { context, page };
}
try {
  // Desktop compact iframe: first-run locale, settings/legal, preferences, and gameplay.
  const desktop = await makePage({ viewport: { width: 821, height: 462 }, deviceScaleFactor: 1 });
  const page = desktop.page;
  await page.waitForFunction(() => window.__stackShiftEvents.loadingStart > 0 && window.__stackShiftEvents.loadingStop > 0);
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'es', 'new players should use their CrazyGames SDK locale');
  assert.equal(await page.locator('#menu [data-a="play"]').count(), 1, 'primary gameplay entry should be visible on the menu');
  await page.locator('#menu [data-a="settings"]').click();
  assert.equal(await page.locator('#ov a[href="./terms.html"]').count(), 1, 'settings should link to Terms of Use');
  assert.equal(await page.locator('#ov a[href="./privacy.html"]').count(), 1, 'settings should link to Privacy Policy');
  await page.locator('#settingLang').selectOption('en');
  await page.locator('#ov [data-a="settingsClose"]').click();
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#menu:not(.hide)', { state: 'visible' });
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'en-GB', 'saved language must take precedence over SDK locale on later visits');

  // Legal pages must actually be served and render their content.
  await page.goto(origin + '/terms.html', { waitUntil: 'load' });
  assert.match(await page.title(), /Terms of Use/);
  assert.equal(await page.locator('h1').count(), 1);
  await page.goto(origin + '/privacy.html', { waitUntil: 'load' });
  assert.match(await page.title(), /Privacy Policy/);
  assert.equal(await page.locator('a[href="https://www.crazygames.com/privacy-policy"]').count(), 1);

  // Desktop gameplay startup and reserved Escape / P pause behaviour.
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  await page.waitForSelector('#menu:not(.hide)', { state: 'visible' });
  await page.locator('#menu [data-a="play"]').click();
  await page.waitForSelector('#game:not(.hide)', { state: 'visible' });
  await page.waitForFunction(() => window.__stackShiftEvents.gameplayStart > 0);
  assert.equal(await page.locator('#tut:not(.hide)').count(), 1, 'first-run controls tutorial should appear in game');
  const dimensions = await page.evaluate(() => {
    const stage = document.querySelector('#stage').getBoundingClientRect();
    const board = document.querySelector('#board').getBoundingClientRect();
    return {
      cell: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')),
      stage: { left: stage.left, right: stage.right, width: stage.width },
      board: { left: board.left, right: board.right, width: board.width }
    };
  });
  assert.ok(dimensions.cell >= 24, 'parcel cells should remain readable in the compact desktop iframe: ' + dimensions.cell);
  assert.ok(dimensions.board.left >= dimensions.stage.left - 1 && dimensions.board.right <= dimensions.stage.right + 1, 'board must fit horizontally inside the game stage');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#ov').evaluate((el) => el.classList.contains('hide')), true, 'Escape must remain available to browser/platform fullscreen controls');
  await page.keyboard.press('p');
  await page.waitForSelector('#ov:not(.hide)', { state: 'visible' });
  await page.waitForFunction(() => window.__stackShiftEvents.gameplayStop > 0);
  await page.locator('#ov [data-a="resume"]').click();
  await page.waitForSelector('#ov.hide', { state: 'attached' });
  await page.waitForFunction(() => window.__stackShiftEvents.gameplayStart > 1);
  await page.locator('#rt').click();
  await page.locator('#acts [data-a="clr"]').click();
  assert.equal(await page.locator('#dl').isDisabled(), true, 'Deliver must be disabled until all parcels are placed');
  await page.setViewportSize({ width: 907, height: 510 });
  await page.waitForTimeout(100);
  const medium = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')));
  assert.ok(medium >= 24, 'parcel cells should remain readable at 907x510: ' + medium);
  await desktop.context.close();

  // Touch-oriented landscape viewport: menu taps, board sizing, parcel tap, and pause.
  const mobile = await makePage({ viewport: { width: 800, height: 450 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const mp = mobile.page;
  const playBox = await mp.locator('#menu [data-a="play"]').boundingBox();
  assert.ok(playBox && playBox.height >= 44, 'primary menu control should have a usable touch target');
  await mp.touchscreen.tap(playBox.x + playBox.width / 2, playBox.y + playBox.height / 2);
  await mp.waitForSelector('#game:not(.hide)', { state: 'visible' });
  const mobileMetrics = await mp.evaluate(() => {
    const stage = document.querySelector('#stage').getBoundingClientRect();
    const board = document.querySelector('#board').getBoundingClientRect();
    return {
      cell: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')),
      stage: { left: stage.left, right: stage.right },
      board: { left: board.left, right: board.right }
    };
  });
  assert.ok(mobileMetrics.cell >= 24, 'parcel cells should remain readable at 800x450 touch size: ' + mobileMetrics.cell);
  assert.ok(mobileMetrics.board.left >= mobileMetrics.stage.left - 1 && mobileMetrics.board.right <= mobileMetrics.stage.right + 1, 'touch board must fit within stage');
  const firstParcel = await mp.locator('.pc').first().boundingBox();
  assert.ok(firstParcel && firstParcel.width > 0 && firstParcel.height > 0, 'parcels should render with a usable touch hitbox');
  await mp.touchscreen.tap(firstParcel.x + firstParcel.width / 2, firstParcel.y + firstParcel.height / 2);
  await mp.keyboard.press('p');
  await mp.waitForSelector('#ov:not(.hide)', { state: 'visible' });
  await mp.locator('#ov [data-a="resume"]').click();
  assert.equal(await mp.locator('#ov').evaluate((el) => el.classList.contains('hide')), true);
  await mobile.context.close();
  assert.deepEqual(pageErrors, [], 'browser sessions must not throw uncaught runtime exceptions: ' + pageErrors.join(' | '));
  console.log('Browser smoke tests passed: startup, SDK loading events, locale persistence, legal pages, desktop/touch gameplay, board sizing, parcel hitboxes, rotation/reset, pause/resume, Escape handling, and zero uncaught page errors.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
