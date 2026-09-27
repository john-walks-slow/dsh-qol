// E2E for the enter-newline feature of dsh-qol (run via dsh-e2e run).
//
// Real-plugin, config-driven: writes the feature flag into localStorage
// ("dsh.qol.v1"), reloads, and drives the REAL composer with the REAL keyboard
// (no mock plugin instance — the linked plugin serves lib/client.js fresh on
// every page load).
//
//   A. env: plugin live, fresh (idle) session opened, composer editable focused
//   B. enable enter-newline via localStorage + reload → html[data-qol-enter-newline]
//   C. real keys: "line1" + Enter + "line2" → editable shows BOTH lines (newline
//      inserted) and the draft is NOT submitted (editable not cleared)
//   D. Shift+Enter still inserts a newline ("line3" third line)
//   E. boundary guards via synthetic keydown (marker on the editable proves the
//      event reached the element = our capture handler passed it through):
//      E1. isComposing Enter passes through (no preventDefault from us)
//      E2. Enter with an open [data-trigger-menu] passes through (empty draft →
//          the host's submit path no-ops, nothing is sent)
//      E3. repeat Enter inserts exactly one newline
//      E4. real (non-synthetic) Enter NEVER reaches the editable's own capture
//          listener (our stopPropagation ahead of Lexical) — folded into C
//   F. Ctrl+Enter still SENDS: editable clears + the multi-line text appears in
//      the conversation
//   G. disable via localStorage + reload → attribute gone; plain Enter sends
//      again (host-native behavior restored)
//   H. localStorage restored to its pre-test value
//
// Concurrency: mutates instance state (sends 2 real messages) → run-guard.
// Usage: node e2e/enter-newline.mjs   (or: dsh-e2e run e2e/enter-newline.mjs)
import pw from '/root/projects/camoufox-mcp/node_modules/playwright-core/index.js';
import { guard } from './lib/run-guard.mjs';
const { firefox } = pw;
const CHROMIUM = '/root/.cache/camoufox/camoufox-bin';
const url = process.env.DSH_E2E_URL ||
  `http://127.0.0.1:${process.env.DSH_E2E_PORT}/?token=${process.env.DSH_E2E_TOKEN || 'e2etest'}`;

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
    userAgent: 'Mozilla/5.0 (Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  const editableText = () => page.evaluate(() => document.querySelector('[data-composer-input]')?.innerText ?? null);
  const setFeature = (on) => page.evaluate((v) => {
    const raw = window.localStorage.getItem('dsh.qol.v1');
    const cfg = raw ? JSON.parse(raw) : {};
    cfg['enter-newline'] = v;
    window.localStorage.setItem('dsh.qol.v1', JSON.stringify(cfg));
  }, on);
  // A capture marker ON the editable: fires only when our document-capture
  // handler did NOT stopPropagation (i.e. it passed the event through).
  const armMarker = () => page.evaluate(() => {
    const el = document.querySelector('[data-composer-input]');
    if (!el) return false;
    window.__enMarker = 0;
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) window.__enMarker++; }, true);
    return true;
  });
  const markerCount = () => page.evaluate(() => window.__enMarker ?? -1);
  // The plugin client loads asynchronously after the page — poll for it
  // instead of a fixed sleep (a busy e2e instance can take much longer).
  const waitPlugin = async (ms = 25000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await page.evaluate(() => !!document.querySelector('style[data-plugin-css="dsh-qol"]'))) return true;
      await page.waitForTimeout(500);
    }
    return false;
  };
  // Sidebar may start collapsed (mobile default) — open it if needed.
  const ensureSidebar = async () => {
    for (let i = 0; i < 6; i++) {
      if (await page.evaluate(() => !!document.querySelector('[aria-label="新建会话"], [aria-label="New session"]'))) return true;
      await page.evaluate(() => document.querySelector('.astb-sidebar-toggle')?.click());
      await page.waitForTimeout(800);
    }
    return false;
  };
  // Fresh idle session (avoids busy sessions left by earlier e2e runs).
  const openFreshSession = async () => {
    try {
      await page.waitForSelector('[data-composer-card]', { timeout: 20000 });
    } catch { return false; }
    if (!(await ensureSidebar())) return false;
    await page.evaluate(() => document.querySelector('[aria-label="新建会话"], [aria-label="New session"]')?.click());
    await page.waitForTimeout(1500);
    return page.evaluate(() => !!document.querySelector('[data-composer-input][contenteditable="true"]'));
  };
  const focusComposer = () => page.evaluate(() => {
    const el = document.querySelector('[data-composer-input][contenteditable="true"]');
    if (el) { el.focus(); return true; }
    return false;
  });
  // Wait until the draft is submitted: editable cleared AND text visible in
  // the conversation (outside the composer card).
  const waitSent = async (needle, ms = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const r = await page.evaluate((n) => {
        const ed = document.querySelector('[data-composer-input]');
        const card = document.querySelector('[data-composer-card]');
        return { draft: ed ? ed.innerText : null, sent: !!(card && !card.innerText.includes(n)) && document.body.innerText.includes(n) };
      }, needle);
      if (r.draft === '' && r.sent) return true;
      await page.waitForTimeout(500);
    }
    return false;
  };
  const clearDraft = () => page.evaluate(() => {
    const el = document.querySelector('[data-composer-input]');
    if (!el) return;
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('delete');
  });

  // Not submitted = draft still holds the text after a settle window.
  const waitUnsent = async () => {
    await page.waitForTimeout(1200);
    const t = await editableText();
    return t !== null && t !== '';
  };

  console.log('=== A. ENV / load ===');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  check(await waitPlugin(), 'plugin client loaded after goto');
  const savedQol = await page.evaluate(() => window.localStorage.getItem('dsh.qol.v1'));
  const envA = await page.evaluate(() => ({
    pluginLive: !!document.querySelector('style[data-plugin-css="dsh-qol"]'),
    editable: !!document.querySelector('[data-composer-input][contenteditable="true"]')
  }));
  check(envA.pluginLive, 'plugin live on the page');
  // Always start in a FRESH session: the current one may be busy running a
  // turn left behind by an earlier e2e run (busy-Enter would steer/queue
  // instead of the plain submit this test asserts).
  check(await openFreshSession(), 'fresh idle session opened for the run');
  check(await focusComposer(), 'composer focused');

  console.log('\n=== B. enable via localStorage + reload ===');
  await setFeature(true);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  check(await waitPlugin(), 'plugin client loaded after reload');
  const attrB = await page.evaluate(() => document.documentElement.hasAttribute('data-qol-enter-newline'));
  check(attrB, 'html[data-qol-enter-newline] present after reload');
  // The reload dropped the old page's fresh session → open one + refocus.
  check(await openFreshSession(), 'fresh session after reload');
  check(await focusComposer(), 'composer focused after reload');
  check(await armMarker(), 'editable capture marker armed');

  console.log('\n=== C. plain Enter inserts a newline, does NOT send ===');
  await page.keyboard.type('line1');
  await page.keyboard.press('Enter');
  await page.keyboard.type('line2');
  await page.waitForTimeout(600);
  const tC = await editableText();
  check(tC === 'line1\nline2', 'editable holds both lines after Enter (got ' + JSON.stringify(tC) + ')');
  check((await markerCount()) === 0, 'Enter never reached the editable\'s own listener (stopPropagation ahead of Lexical)');
  check(await waitUnsent(), 'draft NOT submitted (still present)');

  console.log('\n=== D. Shift+Enter still a newline ===');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('line3');
  await page.waitForTimeout(600);
  const tD = await editableText();
  check(tD === 'line1\nline2\nline3', 'three lines after Shift+Enter (got ' + JSON.stringify(tD) + ')');

  console.log('\n=== E. boundary guards (synthetic events) ===');
  // E1: IME composition Enter passes through (no preventDefault of ours).
  await clearDraft();
  const e1 = await page.evaluate(() => {
    const el = document.querySelector('[data-composer-input]');
    const before = window.__enMarker;
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true });
    el.dispatchEvent(ev);
    return { prevented: ev.defaultPrevented, delta: window.__enMarker - before };
  });
  // delta is informational only: the host's own layers may drop a composing
  // keydown before it reaches the editable — that is host behavior, not ours.
  console.log('  (E1 marker delta: ' + e1.delta + ' — host layers may drop composing keys)');
  check(e1.prevented === false, 'E1: composing Enter not defaultPrevented by us (passed through)');
  // E2: open trigger menu → Enter passes through; empty draft keeps the host
  // submit path a no-op, so nothing is sent.
  const e2 = await page.evaluate(() => {
    const el = document.querySelector('[data-composer-input]');
    const before = window.__enMarker;
    const menu = document.createElement('div');
    menu.setAttribute('data-trigger-menu', '');
    document.body.appendChild(menu);
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    const delta = window.__enMarker - before;
    menu.remove();
    return { delta, text: el.innerText };
  });
  check(e2.delta === 1, 'E2: Enter with open trigger menu passes through');
  check(e2.text === '', 'E2: nothing inserted while the menu is open');
  // E3: held Enter keeps inserting newlines — text-editing intuition (the
  // host's repeat guard protects against repeat SUBMITS, not repeat newlines).
  // Lexical reconciles the DOM asynchronously: read the text a tick later.
  // "x\n\n": a line break at the END of the content renders as a double <br>
  // (contenteditable can't show a trailing single <br>); the editor model
  // still holds a single \n — same as the host's own Shift+Enter behavior.
  await page.keyboard.type('x');
  const e3 = await page.evaluate(() => new Promise((resolve) => {
    const el = document.querySelector('[data-composer-input]');
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, repeat: true });
    el.dispatchEvent(ev);
    setTimeout(() => resolve({ text: el.innerText }), 150);
  }));
  check(e3.text === 'x\n\n', 'E3: repeat Enter inserts a newline (got ' + JSON.stringify(e3.text) + ')');
  // hook-order pageerrors would break the real plugin instance — guard anyway.
  check(pageErrors.length === 0, 'no page errors so far' + (pageErrors.length ? ' (' + pageErrors.join(' | ') + ')' : ''));

  console.log('\n=== F. Ctrl+Enter still sends ===');
  await clearDraft();
  await page.keyboard.type('send-probe-1');
  await page.keyboard.press('Enter');
  await page.keyboard.type('send-probe-2');
  await page.keyboard.press('Control+Enter');
  check(await waitSent('send-probe-2'), 'Ctrl+Enter submits: draft cleared + message rendered');
  const tF = await editableText();
  check(tF === '', 'editable empty after Ctrl+Enter send (got ' + JSON.stringify(tF) + ')');

  console.log('\n=== G. disable → host-native Enter send restored ===');
  await setFeature(false);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  check(await waitPlugin(), 'plugin client loaded after reload (disabled mode)');
  check(await page.evaluate(() => !document.documentElement.hasAttribute('data-qol-enter-newline')), 'attribute gone after disable + reload');
  check(await openFreshSession(), 'fresh session for the disabled-mode check');
  check(await focusComposer(), 'composer focused (disabled mode)');
  await page.keyboard.type('off-probe');
  await page.keyboard.press('Enter');
  check(await waitSent('off-probe'), 'plain Enter sends again once disabled');

  console.log('\n=== H. restore pre-test config ===');
  await page.evaluate((raw) => {
    if (raw === null) window.localStorage.removeItem('dsh.qol.v1');
    else window.localStorage.setItem('dsh.qol.v1', raw);
  }, savedQol);
  const restored = await page.evaluate(() => window.localStorage.getItem('dsh.qol.v1'));
  check(restored === savedQol, 'localStorage dsh.qol.v1 restored');
  check(pageErrors.length === 0, 'no page errors during the whole run' + (pageErrors.length ? ' (' + pageErrors.join(' | ') + ')' : ''));

  console.log('\n=== SUMMARY: ' + pass + ' passed, ' + fail + ' failed ===');
} finally {
  await browser.close();
}
process.exit(fail ? 1 : 0);
