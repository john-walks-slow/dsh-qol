// Tab bar display-mode E2E (target: e2e instance 4188, see /dsh-e2e skill).
// Verifies the 260925 changes (revised semantics):
//   1. "+" button pinned OUTSIDE the tabs scroll container (fixed right)
//   2. Settings → QoL gains a 标签显示模式 segmented row (标准 / 最近活跃)
//   3. Both modes share the SAME open/close tab set (openTabs): same tabs,
//      close buttons in BOTH modes, close works in 最近活跃 too
//   4. Ordering differs: 标准 = open order (tab-appearance order); 最近活跃
//      = colored zone (黄/绿/蓝) first, idle after — each zone by updatedAt
//      desc, newest-active leftmost in BOTH zones (14:10 rule); all-idle
//      degenerates to pure sidebar recency. Mode + tabs persist across reload
//   5. Feature toggle off → host strip hidden instantly (attribute gate);
//      toggle cycles produce NO React hook-count pageerrors (hooks-order fix)
// Concurrency: run-level mutex is structural (2026-09-25) — guard() re-execs
//   this script under flock /tmp/dsh-e2e-run.lock when run bare; dsh-e2e run
//   holds the lock itself and marks DSH_E2E_RUN_GUARD=1.
// Usage: node e2e/tabbar-mode.mjs   (or: dsh-e2e run e2e/tabbar-mode.mjs)
import pw from '/root/projects/camoufox-mcp/node_modules/playwright-core/index.js';
import { guard } from './lib/run-guard.mjs';
const { firefox } = pw;
const CHROMIUM = '/root/.cache/camoufox/camoufox-bin';
const url = process.env.DSH_E2E_URL ||
  `http://127.0.0.1:${process.env.DSH_E2E_PORT || 4188}/?token=${process.env.DSH_E2E_TOKEN || 'e2etest'}`;

await guard(); // must precede any browser/instance operation

let pass = 0, fail = 0;
function check(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.error('  ✗ ' + msg); }
}

const browser = await firefox.launch({ executablePath: CHROMIUM, headless: true, args: ['--no-remote'] });
try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 3,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  // Sidebar session rows: treeitems with a relative-time suffix (group
  // headers and the blank 新会话 row carry no time). Top row = newest.
  const rowTexts = () => page.evaluate(() =>
    [...document.querySelectorAll('[role="treeitem"]')]
      .map(r => (r.getAttribute('aria-label') || r.textContent || '').trim())
      .filter(t => t && /\d\s*(s|min|h|d|sec|秒|分钟|小时|天)/i.test(t))
  );
  const tabTitles = () => page.evaluate(() =>
    [...document.querySelectorAll('.astb-tab')].map(t => (t.getAttribute('title') || '').replace(/\s*\(session-[^)]*\)\s*(\[.*\])?$/, '').trim())
  );
  // Session ids from tab title attributes ("title (session-xxx) [flags]").
  const tabIds = () => page.evaluate(() =>
    [...document.querySelectorAll('.astb-tab')]
      .map(t => (t.getAttribute('title') || '').match(/\(session-([a-f0-9-]+)\)/)?.[1])
      .filter(Boolean)
  );
  const rowTitle = (t) => t.replace(/\d+\s*(s|min|h|d|sec|秒|分钟|小时|天)$/i, '').trim();
  // One element of `a` not covered by multiset `b`.
  const diff = (a, b) => {
    const pool = [...b];
    for (const x of a) { const i = pool.indexOf(x); if (i === -1) return x; pool.splice(i, 1); }
    return null;
  };
  const ensureSidebar = async () => {
    for (let i = 0; i < 6; i++) {
      if (await page.evaluate(() => document.querySelectorAll('[role="treeitem"]').length) > 0) return true;
      await page.evaluate(() => document.querySelector('.astb-sidebar-toggle')?.click());
      await page.waitForTimeout(800);
    }
    return false;
  };
  // Atomic snapshot: tabs + dots + sidebar rows read in ONE evaluate (same
  // reactive store, same render tick). A concurrent agent's session update
  // then lands in ALL views or none — separate frozen reads mixed pre- and
  // post-update views and produced spurious non-monotonic positions.
  // Leaves the sidebar COLLAPSED (default state for composer work).
  const atomicSnapshot = async () => {
    if (!(await ensureSidebar())) return null;
    const snap = await page.evaluate(() => ({
      tabs: [...document.querySelectorAll('.astb-tab')]
        .map(t => (t.getAttribute('title') || '').replace(/\s*\(session-[^)]*\)\s*(\[.*\])?$/, '').trim()),
      dots: [...document.querySelectorAll('.astb-indicator-slot')]
        .map(d => d.className.replace('astb-indicator-slot', '').trim()),
      rows: [...document.querySelectorAll('[role="treeitem"]')]
        .map(r => (r.getAttribute('aria-label') || r.textContent || '').trim())
        .filter(t => t && /\d\s*(s|min|h|d|sec|秒|分钟|小时|天)/i.test(t))
    }));
    await page.evaluate(() => {
      if (document.querySelectorAll('[role="treeitem"]').length > 0) document.querySelector('.astb-sidebar-toggle')?.click();
    });
    await page.waitForTimeout(800);
    return snap;
  };

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

  const openSettings = async () => {
    await page.evaluate(() => {
      const railSettings = document.querySelector('button[class*="VOzbGW_rail"]');
      if (railSettings) { railSettings.click(); return; }
      const btns = [...document.querySelectorAll('button')];
      const settingsBtn = btns.find(b => (b.getAttribute('aria-label') || '').toLowerCase().includes('settings') || b.textContent.trim() === 'Settings');
      if (settingsBtn) settingsBtn.click();
    });
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      const nav = document.querySelector('[role="dialog"]:has(> nav) > nav');
      if (!nav) return;
      const btn = [...nav.querySelectorAll('button')].find(b => b.textContent.trim() === 'QoL');
      if (btn) btn.click();
    });
    await page.waitForTimeout(600);
  };
  const setMode = async (label) => {
    await openSettings();
    await page.evaluate((l) => {
      const row = document.querySelector('.dsh-qol-moderow');
      const btn = [...row.querySelectorAll('button')].find(b => b.textContent.trim() === l);
      btn.click();
    }, label);
    await page.waitForTimeout(600);
  };

  console.log('=== C. Settings → QoL mode row ===');
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
  // Close the dialog AND wait for its unmount — the modal teardown
  // re-renders the shell and briefly unmounts the sidebar tree.
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    if (await page.evaluate(() => !document.querySelector('[role="dialog"]'))) break;
  }
  check(await page.evaluate(() => !document.querySelector('[role="dialog"]')), 'settings dialog closed before seeding');

  console.log('=== D. Seed tabs via sidebar (oldest → newest, adaptive) ===');
  // Click candidate rows bottom-up until 6 tabs exist. Self-heals against
  // sidebar reordering (opens may bump updatedAt), duplicate titles, and
  // blank 新会话 rows (they enter openTabs but render no tab).
  check(await ensureSidebar(), 'sidebar expanded');
  const rows0 = await rowTexts();
  console.log('  rows:', JSON.stringify(rows0.slice(0, 8)));
  check(rows0.length >= 3, `sidebar has ≥3 session rows (${rows0.length})`);

  const appearOrder = []; // tab titles in open (append) order
  for (let round = 0; round < 18 && appearOrder.length < 6; round++) {
    if (!(await ensureSidebar())) break;
    const tabs = await tabTitles();
    const rows = await rowTexts();
    const cand = [...rows].reverse().find(t => {
      const title = rowTitle(t);
      return title && !/^新会话/.test(title) && !tabs.includes(title);
    });
    if (!cand) break;
    const clicked = await page.evaluate((rowText) => {
      const el = [...document.querySelectorAll('[role="treeitem"]')]
        .find(r => ((r.getAttribute('aria-label') || r.textContent || '').trim()) === rowText);
      if (!el) return false;
      el.click();
      return true;
    }, cand);
    if (!clicked) { await page.waitForTimeout(400); continue; }
    await page.waitForTimeout(1100);
    const fresh = diff(await tabTitles(), tabs);
    if (fresh) appearOrder.push(fresh);
    else console.log('  (click produced no new tab, retrying with next candidate)');
  }
  // Fresh recency snapshot AFTER seeding (opens may have reordered rows).
  const rows1 = await rowTexts();
  await page.evaluate(() => {
    if (document.querySelectorAll('[role="treeitem"]').length > 0) document.querySelector('.astb-sidebar-toggle')?.click();
  });
  await page.waitForTimeout(800);

  const stdTitles = await tabTitles();
  const stdIds = await tabIds();
  const stdState = await page.evaluate(() => ({
    tabs: document.querySelectorAll('.astb-tab').length,
    closeBtns: document.querySelectorAll('.astb-close-btn').length,
    activePresent: !!document.querySelector('.astb-tab.active'),
    openTabs: JSON.parse(window.localStorage.getItem('dsh.qol.opentabs') || '[]')
  }));
  console.log('  appearOrder:', JSON.stringify(appearOrder));
  console.log('  rows1:', JSON.stringify(rows1));
  console.log('  std:', JSON.stringify({ stdTitles, ...stdState }));
  check(stdState.tabs === 6, `6 tabs after seeding (${stdState.tabs})`);
  check(appearOrder.length === 6 && stdTitles.length === 6
    && appearOrder.every((t, i) => t === stdTitles[i]),
    '标准 order = open order (tabs appear left→right in click order)');
  // openTabs may legitimately hold extra hidden ids (a blank auto-restored
  // current enters it but renders no tab) — the contract is containment.
  // openTabs ids carry a "session-" prefix; normalize both sides.
  const norm = (id) => id.replace(/^session-/, '');
  check(stdIds.every(id => stdState.openTabs.some(o => norm(o) === norm(id))),
    `every displayed tab id ∈ openTabs (${stdIds.length} ids vs ${stdState.openTabs.length} entries)`);
  check(stdState.closeBtns === stdState.tabs, `standard: close button on every tab (${stdState.closeBtns}/${stdState.tabs})`);
  check(stdState.activePresent, 'current session has an active tab');
  const seededPos = stdTitles.map(t => rows1.findIndex(r => rowTitle(r) === t));
  const ordersDiffer = rows1.length >= 3 && !rows1.slice(0, 3).every((r, i) => rowTitle(r) === stdTitles[i]);
  console.log(`  seeded sidebar positions: [${seededPos.join(', ')}]; open order ${ordersDiffer ? 'differs from' : 'COINCIDES with'} sidebar top order`);

  console.log('=== E. Switch to 最近活跃 ===');
  await setMode('最近活跃');
  const recent1 = await page.evaluate(() => ({
    mode: (JSON.parse(window.localStorage.getItem('dsh.qol.v1') || '{}'))['active-tabbar-mode'],
    tabs: document.querySelectorAll('.astb-tab').length,
    closeBtns: document.querySelectorAll('.astb-close-btn').length,
    hostVisible: getComputedStyle(document.querySelector('.qol-tabbar-host')).display !== 'none',
    hint: document.querySelector('.dsh-qol-moderow div[style*="12px"]')?.textContent || ''
  }));
  check(recent1.mode === 'recent', 'localStorage active-tabbar-mode = recent');
  check(recent1.tabs === stdState.tabs, `same tab set as 标准 (${recent1.tabs} vs ${stdState.tabs})`);
  check(recent1.closeBtns === recent1.tabs, `最近活跃 keeps close buttons (${recent1.closeBtns}/${recent1.tabs})`);
  check(recent1.hostVisible, 'tab bar still visible');
  // Version gate: a stale client build (concurrent stash → HMR rollback)
  // fails HERE with the old hint text, naming the root cause directly.
  check((recent1.hint || '').includes('最近活跃'), 'hint text follows the mode');
  check((recent1.hint || '').includes('区内均最新最左'), 'hint describes the 14:10 unified zone ordering');
  // Close the settings dialog before touching sidebar/composer.
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    if (await page.evaluate(() => !document.querySelector('[role="dialog"]'))) break;
  }
  check(await page.evaluate(() => !document.querySelector('[role="dialog"]')), 'settings dialog closed before colored-zone work');
  const snapE = await atomicSnapshot();
  check(!!snapE, 'atomic snapshot: tabs + dots + sidebar rows in one tick');
  const recentTitles = snapE ? snapE.tabs : [];
  const dots = snapE ? snapE.dots : [];
  console.log('  ' + JSON.stringify({ recentTitles, dots }));
  check(dots.every(d => ['', 'warning', 'running', 'completed'].includes(d)), 'indicator classes within known set');

  const allIdle = dots.every(d => d === '');
  if (allIdle) {
    // All-idle degenerates the two-group sort to pure updatedAt desc. The
    // sidebar is recency-sorted (top = newest), so the tabs' sidebar
    // positions must be STRICTLY INCREASING left→right.
    const pos = recentTitles.map(t => snapE.rows.findIndex(r => rowTitle(r) === t));
    console.log('  recent tab sidebar positions (atomic):', JSON.stringify(pos));
    check(pos.length === 6 && pos.every(p => p !== -1) && pos.every((p, i) => i === 0 || pos[i - 1] < p),
      '最近活跃 order = activity order (atomic snapshot: sidebar positions strictly increasing, newest leftmost)');
  } else {
    // Colored tabs present: verify grouping only — every colored tab left
    // of every idle tab (zone directions verified by code review).
    const firstIdle = dots.findIndex(d => d === '');
    const grouped = dots.every((d, i) => (d !== '' ? firstIdle === -1 || i < firstIdle : i >= firstIdle));
    check(grouped, '最近活跃 groups colored states before idle tabs');
  }
  check(ordersDiffer || !allIdle, 'order assertion is discriminating (open order ≠ sidebar top order)');

  console.log('=== E2. Colored zone: running tabs jump left, newest-leftmost (14:10 rule) ===');
  // Pins the NEW direction of the colored zone with REAL running (blue)
  // tabs — previously "cannot fake in e2e, covered by code review" territory.
  // X = oldest seeded tab, Y = second-oldest; BOTH get long-generation
  // prompts so both are still RUNNING while we assert (a quick "hi" would
  // complete, and a completed CURRENT session shows no dot and may drop
  // out of the colored zone — racy). Y is sent AFTER X → Y = newer
  // activity → expected order [Y, X, ...idle keeps current recency...].
  const e2Closed = [];
  if (allIdle && recentTitles.length >= 4) {
    const X = recentTitles[recentTitles.length - 1];
    const Y = recentTitles[recentTitles.length - 2];
    const idleExpected = [...recentTitles.slice(0, recentTitles.length - 2)].sort();
    // Tab click → session switch. Two hazards, both handled: (a) the click
    // arms a 2500ms IME-suppress window (_armSuppress → rAF-blur on
    // focusin) — wait PAST it before touching the composer; (b) the
    // switch can remount the composer and swallow a click — verify focus,
    // retry, and verify the typed text actually landed before sending.
    // Every failure returns a readable step string (no silent no-ops).
    const sendMessageOnce = async (title, text) => {
      const clicked = await page.evaluate((t) => {
        const tab = [...document.querySelectorAll('.astb-tab')]
          .find(el => (el.getAttribute('title') || '').startsWith(t + ' ('));
        if (!tab) return false;
        tab.click();
        return true;
      }, title);
      if (!clicked) return 'tab-not-found:' + title;
      await page.waitForTimeout(3000); // > _SUPPRESS_MS (2500)
      let focused = false;
      for (let i = 0; i < 3 && !focused; i++) {
        const c = await page.evaluate(() => {
          const el = document.querySelector('[data-composer-input]');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        });
        if (!c) return 'composer-missing';
        await page.mouse.click(c.x, c.y);
        await page.waitForTimeout(250);
        focused = await page.evaluate(() =>
          document.activeElement === document.querySelector('[data-composer-input]'));
      }
      if (!focused) return 'composer-focus-failed';
      await page.keyboard.type(text, { delay: 5 });
      await page.waitForTimeout(300);
      const landed = await page.evaluate((prefix) => {
        const el = document.querySelector('[data-composer-input]');
        const v = el ? (el.value ?? el.textContent ?? '') : '';
        return v.includes(prefix);
      }, text.slice(0, 6));
      if (!landed) return 'type-did-not-land:' + text.slice(0, 6);
      const sent = await page.evaluate(() => {
        const send = [...document.querySelectorAll('button')]
          .find(b => (b.getAttribute('aria-label') || '').includes('Send'));
        if (!send) return 'send-btn-missing';
        if (send.disabled || send.getAttribute('aria-disabled') === 'true') return 'send-btn-disabled';
        send.click();
        return null;
      });
      if (sent) return sent;
      await page.waitForTimeout(1500);
      return null; // success
    };
    const sendMessage = async (title, text) => {
      const err = await sendMessageOnce(title, text);
      if (err === null) return null;
      console.log(`  (send to "${title}" failed at step: ${err} — one full retry)`);
      return sendMessageOnce(title, text);
    };
    const rX = await sendMessage(X, '请认真写一首300字的诗，写完整，不要提前结束');
    check(rX === null, `sent long-generation message to X="${X}" (oldest tab)${rX ? ' — ' + rX : ''}`);
    const rY = await sendMessage(Y, '请认真写一篇600字的散文，写完整，不要提前结束');
    check(rY === null, `sent long-generation message to Y="${Y}" AFTER X (Y = newer activity)${rY ? ' — ' + rY : ''}`);
    const snap2 = await atomicSnapshot();
    check(!!snap2, 'post-send atomic snapshot captured');
    const e2Titles = snap2 ? snap2.tabs : [];
    const e2Dots = snap2 ? snap2.dots : [];
    console.log('  e2:', JSON.stringify({ e2Titles, e2Dots }));
    check(e2Dots[0] !== '' && e2Dots[1] !== '', `both messaged tabs are colored (running): [${e2Dots[0]}, ${e2Dots[1]}]`);
    check(e2Titles[0] === Y && e2Titles[1] === X, `colored zone newest-leftmost: expected [${Y}, ${X}], got [${e2Titles[0]}, ${e2Titles[1]}]`);
    check(e2Dots.slice(2).every(d => d === ''), 'colored tabs sit left of every idle tab (zone precedence)');
    const idlePos = e2Titles.slice(2).map(t => snap2.rows.findIndex(r => rowTitle(r) === t));
    check(idlePos.length === 4 && idlePos.every(p => p !== -1) && idlePos.every((p, i) => i === 0 || idlePos[i - 1] < p),
      'idle zone keeps its recency order behind the colored zone (atomic positions strictly increasing)');
    // Close the two colored tabs BY TITLE — index-based closes cascade if
    // a retry or concurrent reorder shifted positions. X first (non-
    // active), then Y (current — its close triggers the landing switch).
    const closeByTitle = (t) => page.evaluate((title) => {
      const tab = [...document.querySelectorAll('.astb-tab')]
        .find(el => (el.getAttribute('title') || '').startsWith(title + ' ('));
      if (!tab) return false;
      tab.querySelector('.astb-close-btn')?.click();
      return true;
    }, t);
    check(await closeByTitle(X), `closed X="${X}" (non-active, by title)`);
    await page.waitForTimeout(900);
    check(await closeByTitle(Y), `closed Y="${Y}" (active — landing switch, by title)`);
    await page.waitForTimeout(900);
    e2Closed.push(X, Y);
    const backTitles = await tabTitles();
    console.log('  back to main flow:', JSON.stringify(backTitles));
    check(backTitles.length === 4, `back to 4 tabs after closing X and Y (${backTitles.length})`);
    check(JSON.stringify([...backTitles].sort()) === JSON.stringify(idleExpected),
      'remaining tabs = the E idle set (sorted-set equality, tolerant of zone-internal order)');
  } else {
    console.log('  (colored tabs already present at E — deterministic E2 skipped, grouping check above covers zone precedence)');
  }

  console.log('=== F1. Close the ACTIVE tab IN 最近活跃 (landing check) ===');
  // Closing the current tab must land on the most recently ACTIVE remaining
  // tab (the mode's own ordering idea) — NOT on the last-opened one. With
  // all-idle tabs that is the leftmost remaining tab; the 标准 landing rule
  // would pick the rightmost, so the assertion discriminates the branch.
  const recentTitles4 = await tabTitles(); // fresh post-E2 snapshot (E2 may have closed 2)
  const activeIdx = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.astb-tab')];
    const i = tabs.findIndex(t => t.classList.contains('active'));
    return i;
  });
  check(activeIdx >= 0, 'active tab present before close');
  const closedTitle1 = activeIdx >= 0 ? recentTitles4[activeIdx] : null;
  const closedId1 = activeIdx >= 0 ? (await tabIds())[activeIdx] : null;
  const remainingBefore = recentTitles4.filter((t, i) => i !== activeIdx);
  await page.evaluate((i) => {
    document.querySelectorAll('.astb-close-btn')[i].click();
  }, activeIdx);
  await page.waitForTimeout(900);
  const afterClose1 = await page.evaluate(() => ({
    tabs: document.querySelectorAll('.astb-tab').length,
    openTabs: JSON.parse(window.localStorage.getItem('dsh.qol.opentabs') || '[]'),
    activeTitle: (document.querySelector('.astb-tab.active')?.getAttribute('title') || '')
      .replace(/\s*\(session-[^)]*\)\s*(\[.*\])?$/, '').trim()
  }));
  const afterClose1Titles = await tabTitles();
  console.log('  ' + JSON.stringify({ afterClose1Titles, ...afterClose1 }));
  check(afterClose1.tabs === recentTitles4.length - 1, `tab count drops by one (${afterClose1.tabs})`);
  check(!afterClose1Titles.some(t => t === closedTitle1), `closed active tab "${closedTitle1}" is gone`);
  check(closedId1 && afterClose1.openTabs.every(o => o.replace(/^session-/, '') !== closedId1),
    `closed session id removed from openTabs (${closedId1})`);
  if (allIdle) {
    check(afterClose1.activeTitle === remainingBefore[0],
      `landing = most recently active remaining tab ("${remainingBefore[0]}"), got "${afterClose1.activeTitle}"`);
  } else {
    check(!!afterClose1.activeTitle, 'a landing tab became active');
  }

  console.log('=== F2. Close a NON-active tab IN 最近活跃 ===');
  const closeIdx = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.astb-tab')];
    for (let i = tabs.length - 1; i >= 0; i--) if (!tabs[i].classList.contains('active')) return i;
    return -1;
  });
  const closedTitle = closeIdx >= 0 ? afterClose1Titles[closeIdx] : null;
  const closedId = closeIdx >= 0 ? (await tabIds())[closeIdx] : null;
  check(closeIdx >= 0, 'a non-active tab exists to close');
  await page.evaluate((i) => {
    const btns = document.querySelectorAll('.astb-close-btn');
    btns[i].click();
  }, closeIdx);
  await page.waitForTimeout(800);
  const afterClose = await page.evaluate(() => ({
    tabs: document.querySelectorAll('.astb-tab').length,
    openTabs: JSON.parse(window.localStorage.getItem('dsh.qol.opentabs') || '[]'),
    activePresent: !!document.querySelector('.astb-tab.active')
  }));
  const afterCloseTitles = await tabTitles();
  console.log('  ' + JSON.stringify({ afterCloseTitles, ...afterClose }));
  check(afterClose.tabs === recentTitles4.length - 2, `tab count drops again (${afterClose.tabs})`);
  check(!afterCloseTitles.some(t => closedTitle && t === closedTitle), `closed tab "${closedTitle}" is gone`);
  check(closedId && afterClose.openTabs.every(o => o.replace(/^session-/, '') !== closedId),
    `closed session id removed from openTabs (${closedId})`);
  check(afterClose.activePresent, 'current session untouched (closed a non-current tab)');

  console.log('=== G. Back to 标准 ===');
  await setMode('标准');
  const std2 = await page.evaluate(() => ({
    mode: (JSON.parse(window.localStorage.getItem('dsh.qol.v1') || '{}'))['active-tabbar-mode'],
    tabs: document.querySelectorAll('.astb-tab').length,
    closeBtns: document.querySelectorAll('.astb-close-btn').length
  }));
  const std2Titles = await tabTitles();
  console.log('  ' + JSON.stringify({ std2Titles, ...std2 }));
  check(std2.mode === 'standard', 'mode back to standard');
  const expectOrder = appearOrder.filter(t => !e2Closed.includes(t) && t !== closedTitle && t !== closedTitle1);
  check(std2.tabs === expectOrder.length, `close persists across mode switch (${std2.tabs} tabs)`);
  check(!std2Titles.some(t => closedTitle && t === closedTitle), 'closed tab stays closed in 标准');
  check(std2.closeBtns === std2.tabs, `close buttons in 标准 (${std2.closeBtns}/${std2.tabs})`);
  check(std2Titles.length === expectOrder.length && std2Titles.every((t, i) => t === expectOrder[i]),
    '标准 order = remaining open order');

  console.log('=== H. Reload persistence ===');
  await setMode('最近活跃');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const recent2 = await page.evaluate(() => ({
    mode: (JSON.parse(window.localStorage.getItem('dsh.qol.v1') || '{}'))['active-tabbar-mode'],
    tabs: document.querySelectorAll('.astb-tab').length,
    closeBtns: document.querySelectorAll('.astb-close-btn').length,
    openTabs: JSON.parse(window.localStorage.getItem('dsh.qol.opentabs') || '[]')
  }));
  console.log('  ' + JSON.stringify(recent2));
  check(recent2.mode === 'recent', 'mode survives reload');
  check(recent2.tabs === expectOrder.length, `open tabs survive reload (${recent2.tabs})`);
  check(recent2.closeBtns === recent2.tabs, `close buttons still on every tab (${recent2.closeBtns}/${recent2.tabs})`);

  console.log('=== I. Feature toggle off / on (hook-order fix) ===');
  await openSettings();
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
  check(on.attrOn && on.tabs === expectOrder.length && on.hostDisplay !== 'none', 'toggle on restores the bar with the same tabs');
  check(on.modeRowBack, 'mode row returns');

  console.log('=== J. Page errors ===');
  console.log('  errors:', JSON.stringify(pageErrors));
  check(pageErrors.length === 0, 'no pageerrors (React hook-count fix holds across mode/toggle flips)');

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
} finally {
  await browser.close();
}
