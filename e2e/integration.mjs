// Phase-2 integration E2E for dsh-qol on the temp 4176 instance.
// The plugin is REALLY installed in the profile (real require("react"), real
// ctx.slots, real settings.section). Verifies:
//   - page loads, plugin apply ran (html attrs + style tag)
//   - Settings dialog has a "QoL" section with toggle switches
//   - clicking a toggle flips the html attribute + persists to localStorage
//   - settings dialog is full-screen column (settings-mobile CSS)
//   - viewport meta extended
//   - gesture works against the REAL layout service
//   - screenshots of settings page + gesture
import pw from '/root/projects/camoufox-mcp/node_modules/playwright-core/index.js';
const { firefox } = pw;
const CHROMIUM = '/root/.cache/camoufox/camoufox-bin';
const TOKEN = process.env.DSH_E2E_TOKEN_4176;
if (!TOKEN) { console.error('missing DSH_E2E_TOKEN_4176 — set it to the temp 4176 instance token (printed by `dsh web --port 4176`)'); process.exit(1); }
const url = `http://127.0.0.1:4176/?token=${TOKEN}`;

function assert(c, m) { if (!c) throw new Error('FAIL: ' + m); }
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
await page.waitForTimeout(5000);

console.log('=== LOAD (real plugin) ===');
const load = await page.evaluate(() => ({
  attrs: [...document.documentElement.attributes].map(a => a.name).filter(n => n.startsWith('data-qol-')),
  styleTag: !!document.querySelector('style[data-plugin-css="dsh-qol"]'),
  viewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content'),
  hasAppHeight: document.documentElement.style.getPropertyValue('--app-height') !== ''
}));
console.log(JSON.stringify(load, null, 2));
check(load.styleTag, 'CSS style tag injected (real plugin loaded)');
check(load.attrs.length === 14, '14 feature attributes set (got ' + load.attrs.length + ')');
check(load.viewport && load.viewport.includes('interactive-widget=resizes-content'), 'viewport meta extended');
check(load.hasAppHeight, '--app-height var set');

// --- settings dialog + toggle UI ---
console.log('\n=== SETTINGS DIALOG + TOGGLE UI ===');
// open settings
const opened = await page.evaluate(() => {
  const t = document.querySelector('[data-slot="sidebar.settings"] button, [data-slot="settings.trigger"] button, [data-slot="settings.trigger"]');
  if (t) { t.click(); return true; } return false;
});
await page.waitForTimeout(1000);
const dlgInfo = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"][aria-modal="true"][aria-labelledby]:has(> nav)');
  if (!d) return null;
  const cs = getComputedStyle(d);
  return { width: cs.width, flex: cs.flexDirection, radius: cs.borderRadius };
});
console.log('  dialog:', JSON.stringify(dlgInfo));
check(!!dlgInfo, 'settings dialog present');
if (dlgInfo) {
  check(dlgInfo.flex === 'column', 'settings dialog flex column (got ' + dlgInfo.flex + ')');
  check(parseFloat(dlgInfo.width) >= 380, 'settings dialog full-width (got ' + dlgInfo.width + ')');
}

// find the QoL panel — look for the "移动 QoL" label or a settings section
// with dsh-qol switches. The section is registered via settings.section slot.
const panelInfo = await page.evaluate(() => {
  // The settings.section renders as a nav button + content. Find a button
  // whose text includes "移动 QoL" or "QoL".
  const navBtns = [...document.querySelectorAll('[role="dialog"] nav button, [role="dialog"] button')];
  const qolBtn = navBtns.find(b => /QoL|移动/.test(b.textContent || ''));
  if (qolBtn) { qolBtn.click(); return { found: true, label: qolBtn.textContent.trim() }; }
  // maybe the panel renders inline; look for dsh-qol-switch
  const sw = document.querySelector('.dsh-qol-switch, [role="switch"]');
  return { found: false, switches: sw ? 1 : 0, navCount: navBtns.length, navLabels: navBtns.slice(0, 12).map(b => (b.textContent || '').trim()).filter(Boolean) };
});
console.log('  panel:', JSON.stringify(panelInfo));
check(panelInfo.found || panelInfo.switches > 0, 'QoL section/switches found in settings');

// click the first toggle switch and verify attribute flips
if (panelInfo.found) {
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => document.documentElement.hasAttribute('data-qol-sidebar-gesture'));
  const flipped = await page.evaluate(() => {
    const sw = document.querySelector('.dsh-qol-switch');
    if (!sw) return false;
    sw.click();
    return true;
  });
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => ({
    attr: document.documentElement.hasAttribute('data-qol-sidebar-gesture'),
    storage: window.localStorage.getItem('dsh.qol.v1')
  }));
  console.log('  toggle: before=' + before + ' after=' + after.attr + ' storage=' + after.storage);
  check(flipped, 'clicked a toggle switch');
  check(after.attr === !before, 'attribute flipped after click (was ' + before + ', now ' + after.attr + ')');
  check(!!after.storage, 'config persisted to localStorage');
  // flip it back so other tests see default on
  await page.evaluate(() => { const sw = document.querySelector('.dsh-qol-switch'); if (sw) sw.click(); });
  await page.waitForTimeout(100);
}

await page.screenshot({ path: '/tmp/e2e-qol-settings.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// --- gesture against real layout service ---
console.log('\n=== GESTURE (real layout) ===');
const collapsedBefore = await page.evaluate(() => {
  const f = document.querySelector('[class*="_frame"]:has(> [class*="_sidebarCol"])');
  return f ? f.hasAttribute('data-sidebar-collapsed') : null;
});
console.log('  sidebar collapsed before:', collapsedBefore);
// right swipe to open (TouchEvent dispatch — the plugin listens to Touch Events)
await page.evaluate(() => {
  const node = document.body;
  const mk = (x) => new Touch({ identifier: 1, target: node, clientX: x, clientY: 200 });
  const fire = (type, x) => {
    const t = mk(x);
    node.dispatchEvent(new TouchEvent(type, { touches: [t], changedTouches: [t], targetTouches: [t], bubbles: true, cancelable: true }));
  };
  fire('touchstart', 80);
  for (let i = 1; i <= 6; i++) fire('touchmove', 80 + (80 * i / 6));
  fire('touchend', 160);
});
await page.waitForTimeout(400);
const collapsedAfterOpen = await page.evaluate(() => {
  const f = document.querySelector('[class*="_frame"]:has(> [class*="_sidebarCol"])');
  return f ? f.hasAttribute('data-sidebar-collapsed') : null;
});
console.log('  sidebar collapsed after right-swipe:', collapsedAfterOpen);
check(collapsedAfterOpen === false, 'right swipe opened the sidebar (collapsed ' + collapsedBefore + '→' + collapsedAfterOpen + ')');

await page.screenshot({ path: '/tmp/e2e-qol-sidebar-open.png' });

// left swipe to close
await page.evaluate(() => {
  const node = document.body;
  const mk = (x) => new Touch({ identifier: 2, target: node, clientX: x, clientY: 200 });
  const fire = (type, x) => {
    const t = mk(x);
    node.dispatchEvent(new TouchEvent(type, { touches: [t], changedTouches: [t], targetTouches: [t], bubbles: true, cancelable: true }));
  };
  fire('touchstart', 300);
  for (let i = 1; i <= 6; i++) fire('touchmove', 300 - (80 * i / 6));
  fire('touchend', 220);
});
await page.waitForTimeout(400);
const collapsedAfterClose = await page.evaluate(() => {
  const f = document.querySelector('[class*="_frame"]:has(> [class*="_sidebarCol"])');
  return f ? f.hasAttribute('data-sidebar-collapsed') : null;
});
check(collapsedAfterClose === true, 'left swipe closed the sidebar (collapsed →' + collapsedAfterClose + ')');

// --- tabbar middle-click close ---
console.log('\n=== TABBAR MIDDLE-CLICK CLOSE ===');
// Sidebar treeitems include project group rows (_projectRow) — only
// session rows switch sessions; the selected one is marked _selected.
// A blank "New Session" is destroyed by the host once you navigate away,
// so the second switch needs a real session from another project group
// (click a project row to expand it first).
const openSidebar = () => page.evaluate(() => { const b = document.querySelector('.astb-sidebar-toggle'); if (b) b.click(); });
const clickSessionRow = () => page.evaluate(() => {
  const rows = [...document.querySelectorAll('[role="treeitem"]')];
  const row = rows.find(r => /_sessionRow/.test(r.className || '') && !/_selected/.test(r.className || ''));
  if (!row) return false;
  row.click();
  return true;
});
// Click unselected session rows; when the visible groups are exhausted,
// expand the next project group (tracked by name — aria-expanded is not
// reliable: the current project shows its rows without being "expanded")
// and continue.
const switchToAnotherSession = async () => {
  const tried = [];
  for (let i = 0; i < 10; i++) {
    const clicked = await clickSessionRow();
    if (clicked) return true;
    const projName = await page.evaluate((skip) => {
      const projs = [...document.querySelectorAll('[role="treeitem"]')].filter(r => /_projectRow/.test(r.className || ''));
      const proj = projs.find(p => !skip.includes((p.textContent || '').trim()));
      if (!proj) return null;
      proj.click();
      return (proj.textContent || '').trim();
    }, tried);
    if (projName === null) return false;
    tried.push(projName);
    await page.waitForTimeout(400);
  }
  return false;
};

await openSidebar();
await page.waitForTimeout(600);
const switched1 = await switchToAnotherSession();  // → first real session
await page.waitForTimeout(1200);
await openSidebar();                               // switch-collapse closed it
await page.waitForTimeout(600);
const switched2 = await switchToAnotherSession();  // → second real session
await page.waitForTimeout(1200);
const tabInfo = await page.evaluate(() => ({
  count: document.querySelectorAll('.astb-tab').length,
  openTabs: JSON.parse(window.localStorage.getItem('dsh.qol.opentabs') || '[]')
}));
console.log('  after two session switches:', JSON.stringify(tabInfo));
check(switched1 && switched2, 'switched sessions twice via sidebar rows');
check(tabInfo.count === 2, 'two visible tabs after switches (got ' + tabInfo.count + ')');
if (tabInfo.count === 2) {
  // real middle-click on the non-active tab via playwright mouse
  const target = await page.evaluate(() => {
    const t = [...document.querySelectorAll('.astb-tab')].find(x => !x.className.includes('active'));
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, title: t.title };
  });
  await page.mouse.click(target.x, target.y, { button: 'middle' });
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({
    count: document.querySelectorAll('.astb-tab').length,
    openTabs: JSON.parse(window.localStorage.getItem('dsh.qol.opentabs') || '[]')
  }));
  console.log('  after middle-click:', JSON.stringify(after));
  check(after.count === 1, 'middle-click closed the background tab (got ' + after.count + ' tabs)');
  check(!after.openTabs.some(t => target.title.includes(t)), 'closed tab removed from openTabs storage');
}

console.log('\n=== PAGE ERRORS ===');
check(pageErrors.length === 0, 'no uncaught page errors' + (pageErrors.length ? ': ' + pageErrors.join(' | ') : ''));

await browser.close();
console.log('\n=== SUMMARY === pass=' + pass + ' fail=' + fail);
process.exit(fail > 0 ? 1 : 0);
