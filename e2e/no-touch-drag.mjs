// E2E for the no-touch-drag feature of dsh-qol.
// Loads the plugin source into the live e2e page (real DOM) via a mock
// __ModuleLoader__ harness, calls apply() with a mock ctx, and verifies:
//
//   no-touch-drag (fix for docs/issues/260918-mobile-longpress-freeze):
//   A. while a touch is active, dragstart on a draggable element is
//      cancelled (defaultPrevented) AND the element's own bubble handler
//      does not run (stopPropagation keeps the host React onDragStart from
//      arming an orphaned app-level drag)
//   B. with no active touch (mouse path), dragstart passes through untouched
//   C. with the feature attribute removed, touch dragstart passes through
//   D. after dispose(), the dragstart listener is gone (clean page)
//
// The caret-debug instrumentation is covered separately by e2e/caret-debug.mjs.
// The settings-panel export UI is covered by test-settings-features.mjs
// territory and not exercised here (mock harness has slots=null).
//
// Usage: node e2e/no-touch-drag.mjs
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

// Mock-harness injection (same pattern as mobile.mjs). NOTE: on the app page
// the REAL plugin instance is already active (dsh-qol is linked into the e2e
// profile), so the mock is a second instance — fine for A-C assertions (both
// instances behave identically), but instance-scoped teardown (D) must run on
// a clean about:blank page.
const injectPlugin = async (target) => target.evaluate((pluginSrc) => {
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

  window.__qol = { layoutToggles: 0, disposers: [] };
  const mockCtx = {
    get: (name) => {
      if (name === 'layout') return { toggleSidebar: () => { window.__qol.layoutToggles++; } };
      if (name === 'slots') return null;
      return undefined;
    },
    // real-host semantics: ctx.effect(fn) registers fn and its RETURN VALUE
    // is the teardown — capture it so disposers can actually be invoked
    effect: (fn, label) => { const cleanup = fn(); if (typeof cleanup === 'function') window.__qol.disposers.push(cleanup); }
  };
  try { plugin.apply(mockCtx); } catch (e) { return { log, error: 'apply: ' + e.message }; }

  return {
    log,
    attrs: [...document.documentElement.attributes].map(a => a.name).filter(n => n.startsWith('data-qol-')),
    // find a real draggable session row, else synthesize a fallback target
    dragTarget: (() => {
      const rows = [...document.querySelectorAll('[draggable="true"]')];
      if (rows.length) return { real: true, tag: rows[0].tagName, cls: (rows[0].className || '').slice(0, 40) };
      return { real: false };
    })()
  };
}, src);

const result = await injectPlugin(page);

console.log('=== LOAD RESULT ===');
console.log(JSON.stringify(result, null, 2));

console.log('\n=== CHECKS ===');
check(!result.error, 'plugin loads without error' + (result.error ? ' (' + result.error + ')' : ''));
check(pageErrors.length === 0, 'no page errors during run' + (pageErrors.length ? ' (' + pageErrors.join(' | ') + ')' : ''));
// Set assertion: every feature attribute must be present (the count is
// informational — new features shouldn't break this test).
const REQUIRED_ATTRS = ['data-qol-no-touch-drag', 'data-qol-sidebar-gesture', 'data-qol-active-tabbar', 'data-qol-ime-viewport', 'data-qol-tap-feedback'];
const missing = REQUIRED_ATTRS.filter(a => !result.attrs.includes(a));
check(missing.length === 0,
  'feature attributes present incl. no-touch-drag (total ' + result.attrs.length + (missing.length ? ', MISSING: ' + missing.join(',') : '') + ')');
console.log('  (draggable target: ' + (result.dragTarget.real ? 'real row <' + result.dragTarget.tag + '> ' + result.dragTarget.cls : 'synthetic fallback') + ')');

// ============ no-touch-drag ============
if (!result.error) {
  console.log('\n=== NO-TOUCH-DRAG ===');

  // helper: dispatch a touch event with the given touches list on a node
  // helper: dispatch dragstart on a node and report defaultPrevented +
  // whether the node's own bubble-phase handler ran
  await page.evaluate(() => {
    window.__qolDrag = { marker: 0 };

    // ensure a draggable target exists
    if (!document.querySelector('#__qol_drag_target')) {
      let el = document.querySelector('[draggable="true"]');
      if (!el) {
        el = document.createElement('div');
        el.textContent = 'drag me';
        document.body.appendChild(el);
      }
      el.id = '__qol_drag_target';
      el.setAttribute('draggable', 'true');
      // bubble-phase marker — must NOT run when the plugin cancels at capture
      el.addEventListener('dragstart', () => { window.__qolDrag.marker++; });
    }
  });

  const fireDragstart = `(() => {
    window.__qolDrag.marker = 0;
    const el = document.querySelector('#__qol_drag_target');
    const ev = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() });
    el.dispatchEvent(ev);
    return { prevented: ev.defaultPrevented, marker: window.__qolDrag.marker };
  })()`;
  const fireTouch = (type) => `(() => {
    const el = document.querySelector('#__qol_drag_target');
    const t = new Touch({ identifier: 1, target: el, clientX: 20, clientY: 20 });
    el.dispatchEvent(new TouchEvent('${type}', { touches: ${type === 'touchend' ? '[]' : '[t]'}, changedTouches: [t], targetTouches: ${type === 'touchend' ? '[]' : '[t]'}, bubbles: true, cancelable: true }));
    return true;
  })()`;

  // A. touch active → dragstart cancelled, bubble handler not run
  await page.evaluate(fireTouch('touchstart'));
  const a = await page.evaluate(fireDragstart);
  check(a.prevented === true, 'A: touch-active dragstart is defaultPrevented');
  check(a.marker === 0, 'A: element bubble dragstart handler does NOT run (got ' + a.marker + ')');

  // B. touch released (mouse path) → dragstart passes through
  await page.evaluate(fireTouch('touchend'));
  const b = await page.evaluate(fireDragstart);
  check(b.prevented === false, 'B: no-touch (mouse) dragstart passes through');
  check(b.marker === 1, 'B: element bubble dragstart handler runs (got ' + b.marker + ')');

  // C. feature attribute removed → touch dragstart passes through
  await page.evaluate(() => document.documentElement.removeAttribute('data-qol-no-touch-drag'));
  await page.evaluate(fireTouch('touchstart'));
  const c = await page.evaluate(fireDragstart);
  check(c.prevented === false && c.marker === 1, 'C: with attribute removed, touch dragstart passes through and handler runs');
  await page.evaluate(fireTouch('touchend'));
  await page.evaluate(() => document.documentElement.setAttribute('data-qol-no-touch-drag', ''));

  // D. teardown on a CLEAN page (about:blank — the app page above also runs
  // the real linked plugin instance, whose listeners would survive the mock
  // harness's dispose)
  console.log('\n=== NO-TOUCH-DRAG (clean page) ===');
  const blank = await ctx.newPage();
  blank.on('pageerror', e => pageErrors.push(e.message));
  const r2 = await injectPlugin(blank);
  check(!r2.error, 'plugin loads on about:blank without error' + (r2.error ? ' (' + r2.error + ')' : ''));
  await blank.evaluate(() => {
    window.__qolDrag = { marker: 0 };
    const el = document.createElement('div');
    el.id = '__qol_drag_target';
    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', () => { window.__qolDrag.marker++; });
    document.body.appendChild(el);
  });
  const blankTouch = (type) => `(() => {
    const el = document.querySelector('#__qol_drag_target');
    const t = new Touch({ identifier: 1, target: el, clientX: 20, clientY: 20 });
    el.dispatchEvent(new TouchEvent('${type}', { touches: ${type === 'touchend' ? '[]' : '[t]'}, changedTouches: [t], targetTouches: ${type === 'touchend' ? '[]' : '[t]'}, bubbles: true, cancelable: true }));
    return true;
  })()`;
  const blankDragstart = `(() => {
    window.__qolDrag.marker = 0;
    const el = document.querySelector('#__qol_drag_target');
    const ev = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() });
    el.dispatchEvent(ev);
    return { prevented: ev.defaultPrevented, marker: window.__qolDrag.marker };
  })()`;
  await blank.evaluate(blankTouch('touchstart'));
  const d0 = await blank.evaluate(blankDragstart);
  check(d0.prevented === true && d0.marker === 0, 'D-pre: clean-page instance blocks touch dragstart');
  await blank.evaluate(() => { window.__qol.disposers.forEach(d => { try { d(); } catch (e) {} }); });
  const d = await blank.evaluate(blankDragstart);
  check(d.prevented === false && d.marker === 1, 'D: after dispose, touch dragstart passes through');
  await blank.close();
}

console.log('\n=== SUMMARY: ' + pass + ' passed, ' + fail + ' failed ===');
await browser.close();
process.exit(fail ? 1 : 0);
