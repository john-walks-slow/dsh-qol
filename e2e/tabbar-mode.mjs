// Tab bar display-mode E2E (target: e2e instance 4188, see /dsh-e2e skill).
// Verifies the 260925 changes:
//   1. "+" button pinned OUTSIDE the tabs scroll container (fixed right)
//   2. Settings → QoL gains a 标签显示模式 segmented row (标准 / 最近活跃)
//   3. 最近活跃 mode: no close buttons, all real sessions shown (vs
//      standard's open-tabs-only), storage + reload persistence
//   4. Feature toggle off → host strip hidden instantly (attribute gate);
//      toggle cycles produce NO React hook-count pageerrors (hooks-order fix)
// Usage: node e2e/tabbar-mode.mjs
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
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 3,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.0.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  console.log('=== A. ENV / load ===');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(6000);

  const env = await page.evaluate(() => ({
    pluginLive: !!document.querySelector('style[data-plugin-css="dsh-qol"]'),
    host: !!document.querySelector('.qol-tabbar-host'),
    bar: !!document.querySelector('.astb-bar'),
    tabs: document.querySelectorAll('.astb-tab').length,
    closeBtns: document.querySelectorAll('.astb-close-btn').length,
    modeAttr: document.documentElement.hasAttribute('data-qol-active-tabbar')
  }));
  console.log('  ' + JSON.stringify(env));
  check(env.pluginLive, 'plugin style tag live');
  check(env.host, 'tab bar host in DOM');
  check(env.bar, 'tab bar rendered (0 tabs is correct: fresh profile, no session opened yet)');
  check(env.modeAttr, 'active-tabbar on by default');
  check(env.closeBtns === env.tabs, `standard mode: every tab has a close button (${env.closeBtns}/${env.tabs})`);

  console.log('=== B. "+" pinned outside the scroll container ===');
  const plus = await page.evaluate(() => {
    const bar = document.querySelector('.astb-bar');
    const cont = document.querySelector('.astb-tabs-container');
    const ctl = document.querySelector('.astb-controls');
    if (!bar || !cont || !ctl) return { ok: false };
    const barR = bar.getBoundingClientRect(), ctlR = ctl.getBoundingClientRect();
    return {
      ok: true,
      insideContainer: cont.contains(ctl),
      isSibling: ctl.parentElement === bar && cont.parentElement === bar,
      orderOk: Array.prototype.indexOf.call(bar.children, ctl) > Array.prototype.indexOf.call(bar.children, cont),
      rightOffset: barR.right - ctlR.right,
      containerScrollable: getComputedStyle(cont).overflowX
    };
  });
  console.log('  ' + JSON.stringify(plus));
  check(plus.ok && !plus.insideContainer, '"+" not inside .astb-tabs-container');
  check(plus.isSibling, '"+" is a direct child of .astb-bar');
  check(plus.orderOk, '"+" comes after the scroll container');
  check(plus.rightOffset >= 0 && plus.rightOffset <= 12, `"+" pinned at right edge (offset ${plus.rightOffset}px)`);

  console.log('=== C. Settings → QoL mode row ===');
  const openSettings = async () => {
    await page.evaluate(() => {
      const railSettings = document.querySelector('button[class*="VOzbGW_rail"]');
      if (railSettings) { railSettings.click(); return; }
      const btns = [...document.querySelectorAll('button')];
      const settingsBtn = btns.find(b => (b.getAttribute('aria-label') || '').toLowerCase().includes('settings') || b.textContent.trim() === 'Settings');
      if (settingsBtn) settingsBtn.click();
    });
    await page.waitForTimeout(1200);
    // navigate to QoL section
    await page.evaluate(() => {
      const nav = document.querySelector('[role="dialog"]:has(> nav) > nav');
      if (!nav) return;
      const btn = [...nav.querySelectorAll('button')].find(b => b.textContent.trim() === 'QoL');
      if (btn) btn.click();
    });
    await page.waitForTimeout(600);
  };
  await openSettings();

  const modeRow0 = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!dialog) return { dialog: false };
    const row = [...document.querySelectorAll('.dsh-qol-moderow')].find(r => dialog.contains(r));
    if (!row) return { dialog: true, row: false };
    const btns = [...row.querySelectorAll('button')].map(b => b.textContent.trim());
    return { dialog: true, row: true, btns, hint: row.querySelector('div[style*="12px"]')?.textContent || '' };
  });
  console.log('  ' + JSON.stringify(modeRow0));
  check(modeRow0.dialog, 'settings dialog opened');
  check(modeRow0.row, '标签显示模式 row present while active-tabbar on');
  check(modeRow0.btns?.join(',') === '标准,最近活跃', 'segmented buttons 标准 / 最近活跃');
  check((modeRow0.hint || '').includes('打开顺序'), 'default mode hint describes 标准 behavior');

  console.log('=== D. Switch to 最近活跃 ===');
  await page.evaluate(() => {
    const row = document.querySelector('.dsh-qol-moderow');
    const btn = [...row.querySelectorAll('button')].find(b => b.textContent.trim() === '最近活跃');
    btn.click();
  });
  await page.waitForTimeout(600);
  const recent1 = await page.evaluate(() => {
    const stored = JSON.parse(window.localStorage.getItem('dsh.qol.v1') || '{}');
    return {
      mode: stored['active-tabbar-mode'],
      tabs: document.querySelectorAll('.astb-tab').length,
      closeBtns: document.querySelectorAll('.astb-close-btn').length,
      hostVisible: getComputedStyle(document.querySelector('.qol-tabbar-host')).display !== 'none'
    };
  });
  console.log('  ' + JSON.stringify(recent1));
  check(recent1.mode === 'recent', 'localStorage active-tabbar-mode = recent');
  check(recent1.closeBtns === 0, 'recent mode: zero close buttons');
  check(recent1.tabs >= env.tabs, `recent mode shows ≥ standard tabs (${recent1.tabs} vs ${env.tabs})`);
  check(recent1.tabs >= 2, `recent mode lists all real sessions (${recent1.tabs} tabs)`);
  check(recent1.hostVisible, 'tab bar still visible');

  // sorted state dot sanity: dots only carry known state classes
  const dots = await page.evaluate(() => [...document.querySelectorAll('.astb-indicator-slot')].map(d => d.className.replace('astb-indicator-slot', '').trim()));
  console.log('  dots:', JSON.stringify(dots));
  check(dots.every(d => ['', 'warning', 'running', 'completed'].includes(d)), 'indicator classes within known set');

  // Sorting direction: sidebar rows are newest-first (host byRecency), and
  // with all-idle seed sessions the recent-mode tabs must follow the same
  // recency order (mixed-rank degenerates to pure updatedAt desc).
  await page.evaluate(() => { document.querySelector('.astb-sidebar-toggle')?.click(); });
  await page.waitForTimeout(1000);
  const order = await page.evaluate(() => {
    const tabTitles = [...document.querySelectorAll('.astb-tab')].map(t => (t.getAttribute('title') || '').replace(/\s*\(session-[^)]*\)\s*(\[.*\])?$/, '').trim());
    // Sidebar session rows carry a relative-time suffix (9min / 12min…);
    // group headers and the blank New Session row do not.
    const rowTexts = [...document.querySelectorAll('[role="treeitem"]')]
      .map(r => (r.getAttribute('aria-label') || r.textContent || '').trim())
      .filter(t => t && /\d\s*(s|min|h|d|sec|秒|分钟|小时|天)/i.test(t));
    return { tabTitles, rowTexts };
  });
  await page.evaluate(() => { document.querySelector('.astb-sidebar-toggle')?.click(); });
  await page.waitForTimeout(600);
  const n = Math.min(order.tabTitles.length, order.rowTexts.length, 5);
  console.log('  tabs:', JSON.stringify(order.tabTitles.slice(0, 6)));
  console.log('  rows:', JSON.stringify(order.rowTexts.slice(0, 6)));
  let orderOk = n > 0;
  for (let i = 0; i < n; i++) {
    if (!order.rowTexts[i].startsWith(order.tabTitles[i])) { orderOk = false; break; }
  }
  check(n === 0 || orderOk, `recent-mode tab order follows sidebar recency order (${n}-prefix)`);

  console.log('=== E. Reload persistence ===');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const recent2 = await page.evaluate(() => ({
    mode: (JSON.parse(window.localStorage.getItem('dsh.qol.v1') || '{}'))['active-tabbar-mode'],
    closeBtns: document.querySelectorAll('.astb-close-btn').length,
    tabs: document.querySelectorAll('.astb-tab').length
  }));
  console.log('  ' + JSON.stringify(recent2));
  check(recent2.mode === 'recent', 'mode survives reload');
  check(recent2.closeBtns === 0, 'still no close buttons after reload');

  console.log('=== F. Back to 标准 (with a session opened) ===');
  // Standard mode only shows OPENED sessions — on a fresh browser profile
  // with nothing selected it is correctly empty. Open one via a recent-mode
  // tab first so standard mode has a reason to show something.
  await page.evaluate(() => {
    const tab = document.querySelector('.astb-tab');
    if (tab) tab.click();
  });
  await page.waitForTimeout(1500);
  const opened = await page.evaluate(() => !!document.querySelector('.astb-tab.active'));
  check(opened, 'clicked a tab → session opened (active tab present)');

  await openSettings();
  await page.evaluate(() => {
    const row = document.querySelector('.dsh-qol-moderow');
    const btn = [...row.querySelectorAll('button')].find(b => b.textContent.trim() === '标准');
    btn.click();
  });
  await page.waitForTimeout(600);
  const std2 = await page.evaluate(() => {
    const stored = JSON.parse(window.localStorage.getItem('dsh.qol.v1') || '{}');
    return {
      mode: stored['active-tabbar-mode'],
      closeBtns: document.querySelectorAll('.astb-close-btn').length,
      tabs: document.querySelectorAll('.astb-tab').length
    };
  });
  console.log('  ' + JSON.stringify(std2));
  check(std2.mode === 'standard', 'mode back to standard');
  check(std2.tabs >= 1, `opened session keeps its tab in standard mode (${std2.tabs} tabs)`);
  check(std2.closeBtns === std2.tabs, `close buttons restored (${std2.closeBtns}/${std2.tabs})`);

  console.log('=== G. Feature toggle off / on (hook-order fix) ===');
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.dsh-qol-row')];
    const row = rows.find(r => r.textContent.includes('活跃会话 Tab Bar'));
    row.querySelector('.dsh-qol-switch').click();
  });
  await page.waitForTimeout(600);
  const off = await page.evaluate(() => ({
    attrOff: !document.documentElement.hasAttribute('data-qol-active-tabbar'),
    hostDisplay: getComputedStyle(document.querySelector('.qol-tabbar-host')).display,
    modeRowGone: !document.querySelector('.dsh-qol-moderow')
  }));
  console.log('  ' + JSON.stringify(off));
  check(off.attrOff, 'attribute removed on toggle off');
  check(off.hostDisplay === 'none', 'host strip hidden instantly (display:none)');
  check(off.modeRowGone, 'mode row disappears from settings panel');

  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.dsh-qol-row')];
    const row = rows.find(r => r.textContent.includes('活跃会话 Tab Bar'));
    row.querySelector('.dsh-qol-switch').click();
  });
  await page.waitForTimeout(600);
  const on = await page.evaluate(() => ({
    attrOn: document.documentElement.hasAttribute('data-qol-active-tabbar'),
    tabs: document.querySelectorAll('.astb-tab').length,
    hostDisplay: getComputedStyle(document.querySelector('.qol-tabbar-host')).display,
    modeRowBack: !!document.querySelector('.dsh-qol-moderow')
  }));
  console.log('  ' + JSON.stringify(on));
  check(on.attrOn && on.tabs >= 1 && on.hostDisplay !== 'none', 'toggle on restores the bar');
  check(on.modeRowBack, 'mode row returns');

  console.log('=== H. Page errors ===');
  console.log('  errors:', JSON.stringify(pageErrors));
  check(pageErrors.length === 0, 'no pageerrors (React hook-count fix holds across mode/toggle flips)');

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
} finally {
  await browser.close();
}
