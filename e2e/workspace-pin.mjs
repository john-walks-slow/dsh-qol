// Workspace pin (工作区菜单置顶) E2E — target: e2e instance 4188 (see /dsh-e2e skill).
// Requires ≥2 workspaces in the e2e home (setup: stop 4188, append a second
// workspace record to /root/.dsh-e2e/storages/workspace.json, restart).
// Verifies:
//   1. Workspace ROW menu (⋯) gains a Pin to top entry (injected menuitem)
//   2. Clicking it moves the workspace to the top of the sidebar list
//      (host reorder RPC) and closes the menu
//   3. Already-top workspace shows a disabled Pinned entry
//   4. Session-row menus and the picker menu are NOT injected
//   5. Feature toggle off removes the entry, on restores it
//   6. Order persists across reload
// NOTE: the test normalizes the workspace order to [virtual-connect, ws-two]
// at start and restores it at the end, so it is idempotent across runs.
// Usage: node e2e/workspace-pin.mjs
import pw from '/root/projects/camoufox-mcp/node_modules/playwright-core/index.js';
const { firefox } = pw;
const CHROMIUM = '/root/.cache/camoufox/camoufox-bin';
const url = 'http://127.0.0.1:4188/?token=e2etest';

let pass = 0, fail = 0;
function check(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.error('  ✗ ' + msg); }
}

const browser = await firefox.launch({ executablePath: CHROMIUM, headless: true, args: ['--no-remote'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  console.log('=== A. ENV / load ===');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(6000);

  const env = await page.evaluate(() => ({
    pluginLive: !!document.querySelector('style[data-plugin-css="dsh-qol"]'),
    rows: [...document.querySelectorAll('[class*="projectRow"] [class*="title"]')].map(t => t.textContent.trim()),
    pinAttr: document.documentElement.hasAttribute('data-qol-workspace-pin')
  }));
  console.log('  ' + JSON.stringify(env));
  check(env.pluginLive, 'plugin style tag live');
  check(env.rows.length >= 2, `≥2 workspaces present (${env.rows.join(', ')})`);
  check(env.pinAttr, 'workspace-pin on by default');

  const projectRowTitles = () => page.evaluate(() =>
    [...document.querySelectorAll('[class*="projectRow"] [class*="title"]')].map(t => t.textContent.trim()));

  const openRowMenu = async (index) => {
    // move mouse to row center (locator.hover is unreliable on these rows)
    const box = await page.evaluate((i) => {
      const rows = [...document.querySelectorAll('[class*="projectRow"]')];
      const row = rows[i];
      if (!row) return null;
      const b = row.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }, index);
    if (!box) return false;
    await page.mouse.move(box.x, box.y);
    await page.waitForTimeout(300);
    const clicked = await page.evaluate((i) => {
      const rows = [...document.querySelectorAll('[class*="projectRow"]')];
      const row = rows[i];
      if (!row) return false;
      const actions = row.querySelector('[class*="rowActions"]');
      const btns = actions ? actions.querySelectorAll('button') : [];
      if (!btns[0]) return false;
      btns[0].click();
      return true;
    }, index);
    await page.waitForTimeout(500);
    return clicked;
  };

  const menuInfo = () => page.evaluate(() => {
    const menus = [...document.querySelectorAll('[role="menu"]')];
    if (!menus.length) return null;
    const m = menus[menus.length - 1];
    return [...m.querySelectorAll('[role="menuitem"]')].map(it => ({
      text: it.textContent.trim(),
      pin: it.hasAttribute('data-qol-pin'),
      disabled: it.getAttribute('aria-disabled'),
      cls: it.className
    }));
  });

  const closeAnyMenu = async () => {
    // Click the main area (outside the sidebar), then Escape, then park the
    // mouse far from any row — covers backdrop-click, closeOnPointerLeave
    // and keyboard-dismissal variants of the host Menu.
    await page.mouse.click(700, 400);
    await page.keyboard.press('Escape');
    await page.mouse.move(5, 5);
    await page.waitForTimeout(400);
  };

  // --- normalize: ensure virtual-connect is first (idempotent across runs) ---
  let order = await projectRowTitles();
  if (order[0] !== 'virtual-connect') {
    console.log('  normalizing order (current: ' + JSON.stringify(order) + ')…');
    const idx = order.indexOf('virtual-connect');
    if (idx > 0 && await openRowMenu(idx)) {
      const m = await menuInfo();
      if (m && m[0] && m[0].pin && m[0].text === 'Pin to top') {
        await page.evaluate(() => { document.querySelector('[role="menuitem"][data-qol-pin]').click(); });
        await page.waitForTimeout(1200);
      }
    }
    await closeAnyMenu();
    order = await projectRowTitles();
    console.log('  normalized order: ' + JSON.stringify(order));
  }

  console.log('=== B. Pin entry in workspace row menu ===');
  await openRowMenu(1); // second workspace row (ws-two)
  const menu1 = await menuInfo();
  console.log('  ' + JSON.stringify(menu1));
  check(menu1 && menu1.length === 3, `menu has 3 entries (${menu1 ? menu1.length : 0})`);
  check(menu1 && menu1[0].pin && menu1[0].text === 'Pin to top', 'first entry is injected Pin to top');
  check(menu1 && menu1[1].text === 'Rename' && menu1[2].text === 'Delete workspace', 'host entries intact (Rename / Delete workspace)');
  check(menu1 && !menu1[0].disabled, 'Pin enabled (workspace not at top)');

  console.log('=== C. Click Pin → workspace moves to top, menu closes ===');
  await page.evaluate(() => {
    const pin = document.querySelector('[role="menuitem"][data-qol-pin]');
    if (pin) pin.click();
  });
  await page.waitForTimeout(1200);
  const menuAfter = await menuInfo();
  order = await projectRowTitles();
  console.log('  order: ' + JSON.stringify(order));
  check(menuAfter === null || menuAfter.length === 0, 'menu closed after pin');
  check(order[0] === 'ws-two', `workspace moved to top (first = ${order[0]})`);

  console.log('=== D. Pinned state ===');
  await openRowMenu(0); // now-first workspace (ws-two)
  const menu2 = await menuInfo();
  console.log('  ' + JSON.stringify(menu2));
  check(menu2 && menu2[0].pin && menu2[0].text === 'Pinned', 'already-top workspace shows disabled Pinned');
  check(menu2 && menu2[0].disabled === 'true', 'Pinned entry marked aria-disabled');
  await closeAnyMenu();

  await openRowMenu(1); // second workspace (virtual-connect) — pin still available
  const menu3 = await menuInfo();
  console.log('  ' + JSON.stringify(menu3));
  check(menu3 && menu3[0].pin && menu3[0].text === 'Pin to top' && !menu3[0].disabled, 'second workspace still offers Pin to top');
  await closeAnyMenu();

  console.log('=== E. Session-row menu NOT injected ===');
  await closeAnyMenu();
  const sessBox = await page.evaluate(() => {
    const r = [...document.querySelectorAll('[class*="sessionRow"]')][0];
    if (!r) return null;
    const b = r.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  if (sessBox) {
    // approach in two moves to guarantee a real hover entry
    await page.mouse.move(sessBox.x - 60, sessBox.y);
    await page.waitForTimeout(150);
    await page.mouse.move(sessBox.x, sessBox.y);
    await page.waitForTimeout(350);
  }
  const sessionMenu = await page.evaluate(async () => {
    const row = [...document.querySelectorAll('[class*="sessionRow"]')][0];
    if (!row) return { ok: false, reason: 'no session row' };
    const actions = row.querySelector('[class*="rowActions"]');
    const btns = actions ? actions.querySelectorAll('button') : [];
    if (!btns[0]) return { ok: false, reason: 'no session action button', actions: actions ? getComputedStyle(actions).display : 'none' };
    btns[0].click();
    await new Promise(r => setTimeout(r, 500));
    const menus = [...document.querySelectorAll('[role="menu"]')];
    const m = menus[menus.length - 1];
    if (!m) return { ok: false, reason: 'no menu after click' };
    const items = [...m.querySelectorAll('[role="menuitem"]')].map(it => it.textContent.trim());
    return { ok: true, items, pins: m.querySelectorAll('[data-qol-pin]').length };
  });
  console.log('  ' + JSON.stringify(sessionMenu));
  check(sessionMenu.ok, 'session row menu opened');
  check(sessionMenu.ok && sessionMenu.pins === 0, `session menu has no Pin entry (${sessionMenu.ok ? sessionMenu.items.join(', ') : 'n/a'})`);
  await closeAnyMenu();

  console.log('=== F. Picker menu NOT injected ===');
  await closeAnyMenu();
  const pickerMenu = await page.evaluate(async () => {
    const btns = [...document.querySelectorAll('button')];
    const picker = btns.find(b => /^[A-Za-z0-9_-]+$/.test((b.textContent || '').trim()) && (b.className || '').includes('workspace'));
    if (!picker) return { ok: false, reason: 'no picker button' };
    picker.click();
    await new Promise(r => setTimeout(r, 600));
    const menus = [...document.querySelectorAll('[role="menu"]')];
    const m = menus[menus.length - 1];
    if (!m) return { ok: false, reason: 'no menu after picker click' };
    const items = [...m.querySelectorAll('[role="menuitem"]')].map(it => it.textContent.trim());
    return { ok: true, items, pins: m.querySelectorAll('[data-qol-pin]').length };
  });
  console.log('  ' + JSON.stringify(pickerMenu));
  check(pickerMenu.ok, 'picker menu opened');
  check(pickerMenu.pins === 0, `picker menu has no Pin entry (${pickerMenu.items.join(', ')})`);
  await closeAnyMenu();

  console.log('=== G. Toggle off / on ===');
  const openSettings = async () => {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') || '').trim() === 'Settings');
      if (b) b.click();
    });
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('[role="dialog"] button')];
      const qol = btns.find(b => b.textContent.trim() === 'QoL');
      if (qol) qol.click();
    });
    await page.waitForTimeout(700);
  };
  const setPinToggle = async (on) => {
    const found = await page.evaluate((want) => {
      const rows = [...document.querySelectorAll('.dsh-qol-row')];
      const row = rows.find(r => (r.textContent || '').includes('工作区菜单置顶'));
      if (!row) return false;
      const sw = row.querySelector('.dsh-qol-switch');
      const checked = sw.getAttribute('aria-checked') === 'true';
      if (checked !== want) sw.click();
      return true;
    }, on);
    await page.waitForTimeout(500);
    return found;
  };

  await openSettings();
  const foundRow = await setPinToggle(false);
  check(foundRow, 'settings row 工作区菜单置顶 found');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const attrOff = await page.evaluate(() => !document.documentElement.hasAttribute('data-qol-workspace-pin'));
  check(attrOff, 'attribute removed on toggle off');
  await openRowMenu(0);
  const menuOff = await menuInfo();
  check(menuOff && menuOff.length === 2 && !menuOff.some(i => i.pin), 'no Pin entry while toggle off');
  await closeAnyMenu();

  await openSettings();
  await setPinToggle(true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const attrOn = await page.evaluate(() => document.documentElement.hasAttribute('data-qol-workspace-pin'));
  check(attrOn, 'attribute restored on toggle on');
  await openRowMenu(0);
  const menuOn = await menuInfo();
  check(menuOn && menuOn.some(i => i.pin), 'Pin entry back after toggle on');
  await closeAnyMenu();

  console.log('=== H. Reload persistence ===');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  order = await projectRowTitles();
  console.log('  order after reload: ' + JSON.stringify(order));
  check(order[0] === 'ws-two', 'pinned order survives reload (first = ws-two)');

  console.log('=== I. Restore original order (idempotent teardown) ===');
  // Pin virtual-connect back to the top regardless of current order.
  order = await projectRowTitles();
  if (order[0] !== 'virtual-connect') {
    const idx = order.indexOf('virtual-connect');
    if (idx > 0 && await openRowMenu(idx)) {
      const menuRestore = await menuInfo();
      if (menuRestore && menuRestore[0] && menuRestore[0].pin && menuRestore[0].text === 'Pin to top') {
        await page.evaluate(() => { document.querySelector('[role="menuitem"][data-qol-pin]').click(); });
        await page.waitForTimeout(1200);
      }
    }
    await closeAnyMenu();
  }
  order = await projectRowTitles();
  console.log('  order after restore: ' + JSON.stringify(order));
  check(order[0] === 'virtual-connect', 'original order restored');

  const realErrors = pageErrors.filter(e => !/favicon|net::|ERR_/.test(e));
  check(realErrors.length === 0, `no page errors (${realErrors.length})`);
  if (realErrors.length) console.log('  errors: ' + JSON.stringify(realErrors));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
} catch (err) {
  console.error('E2E crashed:', err);
  process.exit(1);
}
