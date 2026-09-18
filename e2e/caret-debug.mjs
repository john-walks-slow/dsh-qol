// E2E for the caret-debug temporary instrumentation of dsh-qol
// (docs/issues/260918-composer-caret-jump).
//
// Runs against the e2e instance in a FRESH browser context (empty
// localStorage — about:blank is an opaque origin where storage access
// throws). The page's real plugin instance has caret-debug OFF by default,
// so it never touches the `dsh.qol.caretdebug` key; the harness presets
// localStorage["dsh.qol.v1"] before its own apply() — exercising the real
// loadConfig→apply path a user's toggle would take. A synthetic composer
// seat is first-class (the plugin resolves the editable from the selection).
//
// Verifies:
//   - with the toggle ON: composition events inside [data-composer-seat] are
//     recorded as METADATA (data.len=N — never the text)
//   - a selection teleport mid→end without any pointerdown persists a
//     jump-to-end snapshot to localStorage["dsh.qol.caretdebug"], whose log
//     contains the composition + sel entries and the JUMP-DETECTED line
//   - the snapshot cap: no more than 3 captures are retained
//   - with the toggle OFF (default): no recording at all
//
// Usage: node e2e/caret-debug.mjs
// Target defaults to the isolated e2e instance (see skill dsh-e2e):
//   http://127.0.0.1:4188/?token=e2etest   (override with DSH_E2E_URL)
import pw from '/root/projects/camoufox-mcp/node_modules/playwright-core/index.js';
const { firefox } = pw;
import fs from 'node:fs';
const CHROMIUM = '/root/.cache/camoufox/camoufox-bin';

const url = process.env.DSH_E2E_URL || 'http://127.0.0.1:4188/?token=e2etest';
const src = fs.readFileSync('/root/projects/dsh-qol/lib/client.js', 'utf8');

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }

const browser = await firefox.launch({ executablePath: CHROMIUM, headless: true, args: ['--no-remote'] });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  deviceScaleFactor: 3
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(4000);

// Inject the plugin on the clean page with a preset toggle config.
// `preset` is merged into localStorage["dsh.qol.v1"] BEFORE apply().
const injectPlugin = (preset) => page.evaluate(({ pluginSrc, preset }) => {
  try { window.localStorage.clear(); } catch (e) {}
  if (preset) window.localStorage.setItem('dsh.qol.v1', JSON.stringify(preset));

  const log = [];
  let captured = null;
  const origLoader = window.__ModuleLoader__;
  window.__ModuleLoader__ = { load: (reg) => { captured = reg; } };
  try { (1, eval)(pluginSrc); } catch (e) { log.push('eval-err: ' + e.message); }
  window.__ModuleLoader__ = origLoader;
  if (!captured) return { log, error: 'no registration captured' };

  const mockReact = {
    createElement: (t, p, ...c) => ({ type: t, props: p, children: c }),
    useRef: (v) => ({ current: v }),
    useState: (v) => [v, () => {}],
    useReducer: (r, s) => [s, () => {}]
  };
  const req = (spec) => { if (spec === 'react') return mockReact; throw new Error('unknown require: ' + spec); };
  let plugin;
  try { plugin = captured.factory(req); } catch (e) { return { log, error: 'factory: ' + e.message }; }

  window.__qol = { disposers: [] };
  const mockCtx = {
    get: (name) => (name === 'slots' ? null : undefined),
    effect: (fn) => { const c = fn(); if (typeof c === 'function') window.__qol.disposers.push(c); }
  };
  try { plugin.apply(mockCtx); } catch (e) { return { log, error: 'apply: ' + e.message }; }

  return {
    log,
    attrs: [...document.documentElement.attributes].map(a => a.name).filter(n => n.startsWith('data-qol-'))
  };
}, { pluginSrc: src, preset });

// Build a synthetic composer and drive the instrumented event paths.
const driveComposer = `(() => {
  const seat = document.createElement('div');
  seat.setAttribute('data-composer-seat', '');
  const edit = document.createElement('div');
  edit.setAttribute('contenteditable', 'true');
  edit.id = '__qol_edit';
  edit.textContent = 'x'.repeat(20);
  seat.appendChild(edit);
  document.body.appendChild(seat);

  edit.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  edit.dispatchEvent(new CompositionEvent('compositionstart', { data: 'nihao' }));
  edit.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'niha' }));
  edit.dispatchEvent(new CompositionEvent('compositionend', { data: 'nihao' }));

  const sel = window.getSelection();
  let r = document.createRange();
  r.setStart(edit.firstChild, 5); r.setEnd(edit.firstChild, 5);
  sel.removeAllRanges(); sel.addRange(r);
  return true;
})()`;
const teleportTo = (offset) => page.evaluate((off) => {
  const edit = document.querySelector('#__qol_edit');
  const sel = window.getSelection();
  const r = document.createRange();
  r.setStart(edit.firstChild, off); r.setEnd(edit.firstChild, off);
  sel.removeAllRanges(); sel.addRange(r);
  return true;
}, offset);
const snapshots = () => page.evaluate(() => {
  try {
    const raw = window.localStorage.getItem('dsh.qol.caretdebug');
    return { snaps: JSON.parse(raw || '[]'), rawLen: raw ? raw.length : 0 };
  } catch (e) { return { parseError: e.name + ': ' + e.message }; }
});

console.log('=== CARET-DEBUG (clean page, toggle ON) ===');
let result = await injectPlugin({ 'caret-debug': true });
check(!result.error, 'plugin loads without error' + (result.error ? ' (' + result.error + ')' : ''));
check(result.attrs.includes('data-qol-caret-debug'), 'toggle preset turns the caret-debug attribute on');

await page.evaluate(driveComposer);
await page.waitForTimeout(150);
// no pointerdown ever fires — teleport the selection to the end
await teleportTo(20);
await page.waitForTimeout(150);

let snapR = await snapshots();
if (!snapR || !Array.isArray(snapR.snaps)) console.log('  (snapR dump: ' + JSON.stringify(snapR).slice(0, 400) + ')');
let snap = snapR.snaps;
let last = Array.isArray(snap) && snap.length ? snap[snap.length - 1] : null;
if (snapR.parseError) console.log('  (snapshot read error: ' + snapR.parseError + ', rawLen=' + snapR.rawLen + ')');
let logText = last ? last.log.join('\n') : '';
check(!!last, 'jump-to-end snapshot persisted to localStorage (got ' + (Array.isArray(snap) ? snap.length : 'parse-error') + ')');
check(!!last && /jump-to-end f5→20/.test(last.reason), 'snapshot reason records the teleport 5→20 (got ' + (last && last.reason) + ')');
check(logText.includes('JUMP-DETECTED'), 'captured log contains JUMP-DETECTED');
check(logText.includes('compositionstart') && logText.includes('compositionend'), 'captured log contains composition entries');
check(/compositionupdate data\.len=4/.test(logText), 'composition data recorded as METADATA length only (data.len=4, no raw text)');
check(/sel f=5\/20/.test(logText) && /sel f=20\/20/.test(logText), 'captured log contains both sel reports (mid and end)');

// snapshot cap: 2 more teleports (start↔end) → still at most 3 captures
await teleportTo(0);   // end→start (20→0, boundary, ≥4 chars) → capture
await page.waitForTimeout(100);
await teleportTo(20);  // start→end → capture
await page.waitForTimeout(100);
snapR = await snapshots(); snap = snapR.snaps;
if (snapR.parseError) console.log('  (snapshot read error: ' + snapR.parseError + ')');
check(Array.isArray(snap) && snap.length === 3, 'snapshot cap retains the last 3 captures (got ' + (Array.isArray(snap) ? snap.length : 'parse-error') + ')');

console.log('\n=== CARET-DEBUG (clean page, default OFF) ===');
// tear down the ON instance first — its listeners would keep writing
// snapshots and pollute the OFF assertions
await page.evaluate(() => { window.__qol.disposers.forEach((d) => { try { d(); } catch (e) {} }); });
await page.evaluate(() => { document.querySelectorAll('[data-composer-seat]').forEach(e => e.remove()); });
result = await injectPlugin(null); // fresh apply, no preset → all defaults
check(!result.error, 'plugin reloads without error');
check(!result.attrs.includes('data-qol-caret-debug'), 'default config leaves the caret-debug attribute off');
await page.evaluate(driveComposer);
await page.waitForTimeout(150);
await teleportTo(20);
await page.waitForTimeout(150);
snapR = await snapshots(); snap = snapR.snaps;
if (snapR.parseError) console.log('  (snapshot read error: ' + snapR.parseError + ')');
check(Array.isArray(snap) && snap.length === 0, 'with the feature off, no snapshot is written (got ' + (Array.isArray(snap) ? snap.length : 'parse-error') + ')');

console.log('\n=== PAGE ERRORS ===');
check(pageErrors.length === 0, 'no page errors' + (pageErrors.length ? ' (' + pageErrors.join(' | ') + ')' : ''));

console.log('\n=== SUMMARY: ' + pass + ' passed, ' + fail + ' failed ===');
await browser.close();
process.exit(fail ? 1 : 0);
