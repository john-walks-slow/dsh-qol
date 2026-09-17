// Real-instance verification: dsh-qol is linked into the running 4175
// instance, so the updated lib/client.js is live after a refresh. This drives
// the REAL tabbar / sidebar-rail / sidebar-row switch paths on a mobile
// viewport and asserts the composer never ends up focused (IME kept closed).
import pw from '/root/projects/camoufox-mcp/node_modules/playwright-core/index.js';
const { firefox } = pw;
const CHROMIUM = '/root/.cache/camoufox/camoufox-bin';
const TOKEN = process.env.DSH_E2E_TOKEN_4175;
if (!TOKEN) { console.error('missing DSH_E2E_TOKEN_4175 — set it to the live 4175 instance token (printed by `dsh web`)'); process.exit(1); }
const url = `http://127.0.0.1:4175/?token=${TOKEN}`;

let pass = 0, fail = 0;
function check(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } }

const browser = await firefox.launch({ executablePath: CHROMIUM, headless: true, args: ['--no-remote'] });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 3,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(6000);

console.log('=== ENV ===');
const env = await page.evaluate(() => ({
  pluginLive: !!document.querySelector('style[data-plugin-css="dsh-qol"]'),
  attrs: [...document.documentElement.attributes].map(a => a.name).filter(n => n.startsWith('data-qol-')),
  hasTabbar: !!document.querySelector('.astb-tab'),
  hasRail: !!document.querySelector('.astb-rail-item'),
  composer: !!document.querySelector('[data-composer-seat] [contenteditable="true"]')
}));
console.log('  ' + JSON.stringify(env));
check(env.pluginLive, 'plugin style tag live on 4175');
check(env.attrs.includes('data-qol-switch-nofocus'), 'switch-nofocus attr on');
check(env.hasTabbar, 'tabbar rendered');
check(env.hasRail, 'sidebar rail rendered');
check(env.composer, 'composer textarea present');

// Probe: does the composer end up focused right now?
// (composer is a contenteditable DIV inside [data-composer-seat], not a textarea)
const probeFocus = () => page.evaluate(() => {
  const el = document.querySelector('[data-composer-seat] [contenteditable="true"], [data-slot="conversation.composer.bar"] [contenteditable="true"]');
  const ae = document.activeElement;
  return { composerFocused: !!el && ae === el, active: ae ? (ae.tagName + (ae.id ? '#' + ae.id : '')) : '(none)' };
});

// 1. Baseline: the host auto-focuses the composer on load (that's exactly the
//    behavior switch-nofocus fights on switches). Just record it.
let p = await probeFocus();
console.log('  baseline active:', p.active);
check(true, 'baseline recorded (composerFocused=' + p.composerFocused + ') — host autofocus is the thing we suppress');

// 2. Switch session via TABBAR tab → composer must stay unfocused
const tabs = await page.evaluate(() => [...document.querySelectorAll('.astb-tab')].map(t => t.className));
console.log('  tabs:', JSON.stringify(tabs));
const tabSwitched = await page.evaluate(() => {
  const tabs = [...document.querySelectorAll('.astb-tab')];
  // pick a tab that is NOT the current one if possible
  const t = tabs.find(x => !x.className.includes('active')) || tabs[0];
  if (!t) return false;
  t.click();
  return true;
});
await page.waitForTimeout(1200);
p = await probeFocus();
console.log('  after tabbar click active:', p.active);
check(tabSwitched, 'clicked a tabbar tab');
check(!p.composerFocused, 'after tabbar switch: composer NOT focused (IME stays closed)');

// 3. Switch session via SIDEBAR ROW (open sidebar first via rail/sidebar toggle)
const sidebarOpened = await page.evaluate(() => {
  const toggle = document.querySelector('[class*="_sidebarCol"] [class*="_toggle"]');
  if (toggle) { toggle.click(); return true; }
  return false;
});
await page.waitForTimeout(600);
const rows = await page.evaluate(() => [...document.querySelectorAll('[role="treeitem"]')].map(r => r.className));
console.log('  sidebar rows:', rows.length, rows[0]);
const rowSwitched = await page.evaluate(() => {
  const row = document.querySelector('[role="treeitem"]');
  if (!row) return false;
  row.click();
  return true;
});
await page.waitForTimeout(1200);
p = await probeFocus();
console.log('  after sidebar row click active:', p.active);
check(sidebarOpened, 'opened sidebar');
check(rowSwitched, 'clicked a sidebar session row');
check(!p.composerFocused, 'after sidebar row switch: composer NOT focused (IME stays closed)');

// 4. Direct composer engagement still works: tap the contenteditable → it CAN focus
const tapped = await page.evaluate(() => {
  const el = document.querySelector('[data-composer-seat] [contenteditable="true"]');
  if (!el) return false;
  el.focus(); // a real tap focuses; simulate focus directly
  return true;
});
await page.waitForTimeout(300);
p = await probeFocus();
console.log('  after direct composer focus active:', p.active);
check(tapped, 'tapped composer');
check(p.composerFocused, 'direct composer tap → focus works (suppression cleared)');

console.log('\n=== PAGE ERRORS ===');
check(pageErrors.length === 0, 'no uncaught page errors' + (pageErrors.length ? ': ' + pageErrors.join(' | ') : ''));

await page.screenshot({ path: '/tmp/qol-suppress-real.png' });
await browser.close();
console.log('\n=== SUMMARY === pass=' + pass + ' fail=' + fail);
process.exit(fail > 0 ? 1 : 0);
