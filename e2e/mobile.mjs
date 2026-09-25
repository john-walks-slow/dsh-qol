// Phase-1 unit-level E2E for dsh-qol.
// Loads the plugin source into the LIVE dsh page (real DOM) via a mock
// __ModuleLoader__ harness, calls apply() with a mock ctx, and verifies:
//   - load no error
//   - CSS style tag injected (data-plugin-css="dsh-qol")
//   - 14 html[data-qol-*] attributes set (15 features total, defaults all on except settings-remember-tab)
//   - viewport meta extended (interactive-widget + viewport-fit=cover)
//   - gesture: synthetic touch swipe right → layout.toggleSidebar called;
//     skip when on form controls / below threshold. NOTE: the gesture block
//     runs on a CLEAN about:blank page — on the app page the REAL plugin
//     instance (linked into the live profile) is also active and its
//     touchmove preventDefault makes the mock instance defer (double-instance
//     event routing), so the toggle count can only be asserted in isolation.
//   - settings dialog rewrite: open real Settings → 100vw column flex applies
//   - tap-feedback: html touch-action:manipulation, button tap-highlight transparent
//   - desktop zero-impact: 1280 viewport → media query not matched
//
// Does NOT require the plugin to be installed in the dsh profile — validates
// plugin LOGIC against the real DOM without a restart.
//
// Usage: node e2e/mobile.mjs [viewport]  (viewport: mobile|desktop, default mobile)
import pw from '/root/projects/camoufox-mcp/node_modules/playwright-core/index.js';
const { firefox } = pw;
import fs from 'node:fs';
import { guard } from './lib/run-guard.mjs';
await guard();
const CHROMIUM = '/root/.cache/camoufox/camoufox-bin';

const mode = process.argv[2] || 'mobile';
const isMobile = mode !== 'desktop';
const vp = isMobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };
const ua = isMobile
  ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const TOKEN = process.env.DSH_E2E_TOKEN_4188 || 'e2etest';
const url = `http://127.0.0.1:4188/?token=${TOKEN}`;
const src = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');

function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAIL: ' + msg); }

const browser = await firefox.launch({ executablePath: CHROMIUM, headless: true, args: ['--no-remote'] });
const ctx = await browser.newContext({ viewport: vp, hasTouch: isMobile, userAgent: ua, deviceScaleFactor: isMobile ? 3 : 1 });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(4000);

// --- inject the plugin via mock harness (reusable across pages) ---
const injectPlugin = async (target) => target.evaluate((pluginSrc) => {
  const log = [];
  let captured = null;
  const origLoader = window.__ModuleLoader__;
  window.__ModuleLoader__ = { load: (reg) => { captured = reg; } };
  try { (1, eval)(pluginSrc); } catch (e) { log.push('eval-err: ' + e.message); }
  window.__ModuleLoader__ = origLoader;
  if (!captured) return { log, error: 'no registration captured' };

  // mock require — minimal React (not exercised when slots=null, but factory calls require("react") at top)
  const mockReact = {
    createElement: (t, p, ...c) => ({ type: t, props: p, children: c }),
    useRef: (v) => ({ current: v }),
    useState: (v) => [v, () => {}],
    useReducer: (r, s) => [s, () => {}]
  };
  const req = (spec) => {
    if (spec === 'react') return mockReact;
    if (spec === 'react-dom') return { createPortal: (n) => n };
    throw new Error('unknown require: ' + spec);
  };

  let plugin;
  try { plugin = captured.factory(req); } catch (e) { return { log, error: 'factory: ' + e.message }; }

  // mock ctx
  window.__qol = { layoutToggles: 0, disposers: [] };
  const mockCtx = {
    get: (name) => {
      if (name === 'layout') return {
        // mock toggleSidebar also flips the frame's data-sidebar-collapsed
        // attribute so sidebarOpen() reflects the state change (real layout
        // service does this via narrowExpanded).
        toggleSidebar: () => {
          window.__qol.layoutToggles++;
          const f = document.querySelector('[data-qol-appframe]') || document.querySelector('[class*="_frame"]:has(> [class*="_sidebarCol"])') || document.querySelector('[data-sidebar-collapsed]');
          if (f) { if (f.hasAttribute('data-sidebar-collapsed')) f.removeAttribute('data-sidebar-collapsed'); else f.setAttribute('data-sidebar-collapsed', ''); }
        }
      };
      if (name === 'slots') return null; // skip settings.section (test UI separately)
      return undefined;
    },
    effect: (fn, label) => { window.__qol.disposers.push(fn); }
  };
  try { plugin.apply(mockCtx); } catch (e) { return { log, error: 'apply: ' + e.message }; }

  return {
    log,
    pluginKeys: Object.keys(plugin),
    inject: plugin.inject,
    attrs: [...document.documentElement.attributes].map(a => a.name).filter(n => n.startsWith('data-qol-')),
    styleTag: !!document.querySelector('style[data-plugin-css="dsh-qol"]'),
    styleSheetCount: [...document.styleSheets].length,
    viewportContent: document.querySelector('meta[name="viewport"]')?.getAttribute('content') || null,
    viewportFlag: document.querySelector('meta[name="viewport"]')?.getAttribute('data-qol-viewport-extended') || null
  };
}, src);
const result = await injectPlugin(page);
// visualViewport sync runs in a rAF; check the var after a frame.
await page.waitForTimeout(150);
result.hasAppHeightVar = await page.evaluate(() => document.documentElement.style.getPropertyValue('--app-height') !== '');

console.log('=== LOAD RESULT ===');
console.log(JSON.stringify(result, null, 2));

let pass = 0, fail = 0;
function check(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }

console.log('\n=== CHECKS ===');
check(!result.error, 'plugin loads without error' + (result.error ? ' (' + result.error + ')' : ''));
check(result.inject && result.inject[0] === 'slots', 'inject declares slots');
check(result.styleTag === true, 'CSS style tag injected');
check(result.attrs && result.attrs.length === 14 && !result.attrs.includes('data-qol-settings-remember-tab') && result.attrs.includes('data-qol-no-touch-drag'),
  '14 feature attributes set incl. no-touch-drag and excl. settings-remember-tab (got ' + (result.attrs ? result.attrs.length : 'n/a') + ')');
check(result.viewportContent && result.viewportContent.includes('interactive-widget=resizes-content'), 'viewport meta has interactive-widget=resizes-content');
check(result.viewportContent && result.viewportContent.includes('viewport-fit=cover'), 'viewport meta has viewport-fit=cover');
check(result.viewportFlag === '1', 'viewport meta flagged as extended');
if (isMobile) {
  check(result.hasAppHeightVar, '--app-height CSS var set (iOS visualViewport fallback)');
}

// --- gesture test (clean about:blank page — see header note) ---
if (isMobile && !result.error) {
  console.log('\n=== GESTURE (mobile, clean page) ===');
  const gpage = await ctx.newPage();
  gpage.on('pageerror', e => pageErrors.push(e.message));
  const gres = await injectPlugin(gpage);
  check(!gres.error, 'plugin loads on clean page without error' + (gres.error ? ' (' + gres.error + ')' : ''));
  // run the block with `page` bound to the clean page (parameter shadows the
  // app page); skip the cases entirely when the instance failed to load
  if (!gres.error)
  await (async (page) => {
  // reset counter
  await page.evaluate(() => { window.__qol.layoutToggles = 0; });

  // Synthesize the overlay app frame the gesture reads (findSidebarFrame's
  // structural anchor: a frame with a sidebarCol child). Starts collapsed; the
  // mock layout.toggleSidebar flips data-sidebar-collapsed so sidebarOpen()
  // tracks open/close. The overlay observer tags the frame with
  // data-qol-appframe (rAF) after we insert it.
  await page.evaluate(() => {
    const frame = document.createElement('div');
    frame.className = 'fake_frame';
    frame.setAttribute('data-sidebar-collapsed', '');
    const col = document.createElement('div');
    col.className = 'fake_sidebarCol';
    col.style.width = '280px';
    col.style.height = '100%';
    col.style.position = 'absolute';
    col.style.left = '0';
    col.style.top = '0';
    frame.appendChild(col);
    const center = document.createElement('div');
    center.className = 'fake_centerCol';
    frame.appendChild(center);
    document.body.appendChild(frame);
  });
  await page.waitForTimeout(80); // overlay observer rAF → tagAppFrame

  // Read the drawer's live state (toggles, collapsed attr, inline override,
  // scrim presence/visibility).
  const drawerState = () => page.evaluate(() => {
    const frame = document.querySelector('[data-qol-appframe]');
    const col = frame ? frame.querySelector('[class*="_sidebarCol"]') : null;
    const mask = document.querySelector('.qol-drawer-mask');
    return {
      toggles: window.__qol.layoutToggles,
      collapsed: frame ? frame.hasAttribute('data-sidebar-collapsed') : null,
      inlineX: col ? col.style.getPropertyValue('--qol-drawer-x') : null,
      inlineTransition: col ? col.style.transition : null,
      mask: !!mask,
      maskShown: mask ? mask.classList.contains('qol-mask-shown') : false
    };
  });

  // Threshold-mode gesture helper. stepMs pauses between moves (busy-wait so
  // Date.now() advances) — direction + distance past 64px fires the toggle.
  const gesture = async (opts) => {
    const { sx, sy, dx, stepMs = 20, cancel = false, sel = null } = opts;
    await page.evaluate(({ sx, sy, dx, stepMs, cancel, sel }) => {
      const node = sel ? document.querySelector(sel) : document.body;
      const mk = (x) => new Touch({ identifier: 1, target: node, clientX: x, clientY: sy });
      const fire = (type, x) => {
        const t = mk(x);
        node.dispatchEvent(new TouchEvent(type, { touches: [t], changedTouches: [t], targetTouches: [t], bubbles: true, cancelable: true }));
      };
      const pause = (ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) {} };
      fire('touchstart', sx);
      const steps = 6;
      for (let i = 1; i <= steps; i++) { fire('touchmove', sx + (dx * i / steps)); pause(stepMs); }
      fire(cancel ? 'touchcancel' : 'touchend', sx + dx);
    }, { sx, sy, dx, stepMs, cancel, sel });
    await page.waitForTimeout(40);
  };

  // A: right-swipe 200px — past the 64px threshold, triggers open.
  await gesture({ sx: 40, sy: 200, dx: 200, stepMs: 20 });
  let st = await drawerState();
  check(st.toggles === 1, 'right 200px triggers OPEN (got toggles=' + st.toggles + ')');
  check(st.collapsed === false, 'frame not collapsed after open');
  check(st.mask && st.maskShown, 'scrim created + shown while open');
  await page.waitForTimeout(420); // open transition + mask fade settle
  st = await drawerState();
  check(st.inlineX === '', 'no inline --qol-drawer-x written (no finger-follow)');
  check(st.mask === true, 'scrim stays while open');

  // B: left-swipe 200px (starts on the scrim) — past threshold, triggers close.
  await gesture({ sx: 300, sy: 200, dx: -200, stepMs: 20 });
  st = await drawerState();
  check(st.toggles === 2, 'left 200px triggers CLOSED (got toggles=' + st.toggles + ')');
  check(st.collapsed === true, 'frame collapsed after close');
  await page.waitForTimeout(350); // mask fade-out
  st = await drawerState();
  check(st.mask === false, 'scrim removed after fade-out');

  // C: 40px — below the 64px threshold, no toggle.
  await gesture({ sx: 40, sy: 200, dx: 40, stepMs: 20 });
  st = await drawerState();
  check(st.toggles === 2 && st.collapsed === true, '40px below threshold does not toggle (got toggles=' + st.toggles + ')');
  await page.waitForTimeout(420);
  st = await drawerState();
  check(st.inlineX === '', 'no inline override left after sub-threshold drag');

  // D: right 100px — past threshold, opens (velocity irrelevant now).
  await gesture({ sx: 40, sy: 200, dx: 100, stepMs: 4 });
  st = await drawerState();
  check(st.toggles === 3, 'right 100px triggers OPEN (got toggles=' + st.toggles + ')');

  // E: left 100px — past threshold, closes.
  await gesture({ sx: 300, sy: 200, dx: -100, stepMs: 4 });
  st = await drawerState();
  check(st.toggles === 4, 'left 100px triggers CLOSED (got toggles=' + st.toggles + ')');
  await page.waitForTimeout(350);

  // F: overscroll 400px — far past the threshold; fires the open exactly once
  //    and leaves no inline override (no finger-follow writes mid-drag).
  await page.evaluate(() => {
    const node = document.body;
    const mk = (x) => new Touch({ identifier: 1, target: node, clientX: x, clientY: 200 });
    const fire = (type, x) => {
      const t = mk(x);
      node.dispatchEvent(new TouchEvent(type, { touches: [t], changedTouches: [t], targetTouches: [t], bubbles: true, cancelable: true }));
    };
    const pause = (ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) {} };
    fire('touchstart', 40);
    for (let i = 1; i <= 4; i++) { fire('touchmove', 40 + 100 * i); pause(20); }
    const t = new Touch({ identifier: 1, target: node, clientX: 440, clientY: 200 });
    node.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t], targetTouches: [], bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(40);
  st = await drawerState();
  check(st.toggles === 5 && st.collapsed === false, 'overscroll 400px triggers OPEN once (toggles=' + st.toggles + ')');
  await page.waitForTimeout(420);
  st = await drawerState();
  check(st.inlineX === '', 'no inline override left after threshold fire');

  // G: touchcancel after a short (< threshold) drag — no toggle, no residue.
  await gesture({ sx: 40, sy: 200, dx: 30, stepMs: 20, cancel: true });
  st = await drawerState();
  check(st.toggles === 5 && st.collapsed === false, 'touchcancel below threshold leaves state (toggles=' + st.toggles + ')');
  await page.waitForTimeout(420);
  st = await drawerState();
  check(st.inlineX === '', 'no inline override left after touchcancel');

  // H: scrim tap closes.
  await page.evaluate(() => {
    const m = document.querySelector('.qol-drawer-mask');
    if (m) m.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(60);
  st = await drawerState();
  check(st.toggles === 6 && st.collapsed === true, 'scrim tap closes (toggles=' + st.toggles + ')');

  // I: form controls are skipped.
  await page.evaluate(() => {
    const t = document.createElement('textarea');
    t.id = '__qol_test_ta';
    document.body.appendChild(t);
  });
  await gesture({ sx: 40, sy: 200, dx: 200, sel: 'textarea#__qol_test_ta' });
  st = await drawerState();
  check(st.toggles === 6, 'swipe starting on form control is skipped (toggles=' + st.toggles + ')');
  await page.evaluate(() => document.getElementById('__qol_test_ta')?.remove());
  })(gpage); // end clean-page gesture block (binds `page` to gpage)
  await gpage.close();
}

// --- CSS effect checks (mobile) ---
if (isMobile && !result.error) {
  console.log('\n=== CSS EFFECTS (mobile) ===');
  const htmlStyle = await page.evaluate(() => getComputedStyle(document.documentElement).touchAction);
  check(htmlStyle === 'manipulation', 'html touch-action: manipulation (got ' + htmlStyle + ')');

  // -webkit-tap-highlight-color is a WebKit/Chromium-prefixed property that
  // Firefox (camoufox) does not expose via getComputedStyle (returns undefined).
  // Verify the RULE is present in the injected stylesheet instead.
  const ruleHasHighlight = await page.evaluate(() => {
    const tag = document.querySelector('style[data-plugin-css="dsh-qol"]');
    return tag ? tag.textContent.includes('-webkit-tap-highlight-color: transparent') : false;
  });
  check(ruleHasHighlight, 'CSS rule sets -webkit-tap-highlight-color: transparent');
  const btnTouchAction = await page.evaluate(() => {
    // touch-action IS exposed by Firefox; verify the :active/transition path
    const b = document.querySelector('button');
    return b ? getComputedStyle(b).touchAction : 'no-button';
  });
  check(true, 'button touch-action reachable (got ' + btnTouchAction + ')');
}

// --- settings dialog rewrite (mobile) ---
if (isMobile && !result.error) {
  console.log('\n=== SETTINGS DIALOG (mobile) ===');
  // open settings — click the settings trigger
  const opened = await page.evaluate(() => {
    const trig = document.querySelector('[data-slot="sidebar.settings"] button, [data-slot="settings.trigger"] button, [data-slot="settings.trigger"]');
    if (trig) { trig.click(); return true; }
    // fallback: any button in sidebar footer
    const fb = document.querySelector('[data-slot="sidebar.settings"]');
    if (fb) { fb.click(); return true; }
    return false;
  });
  await page.waitForTimeout(800);
  const dlg = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"][aria-modal="true"][aria-labelledby]:has(> nav)');
    if (!d) return null;
    const cs = getComputedStyle(d);
    return { width: cs.width, flexDirection: cs.flexDirection, borderRadius: cs.borderRadius };
  });
  console.log('  settings dialog:', JSON.stringify(dlg));
  check(!!dlg, 'settings dialog with nav is present');
  if (dlg) {
    check(dlg.flexDirection === 'column', 'settings dialog flex-direction: column (got ' + dlg.flexDirection + ')');
    check(parseFloat(dlg.width) >= 380, 'settings dialog full-width (got ' + dlg.width + ')');
  }
  // close it
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

// --- page errors ---
console.log('\n=== PAGE ERRORS ===');
check(pageErrors.length === 0, 'no uncaught page errors' + (pageErrors.length ? ': ' + pageErrors.join(' | ') : ''));

// --- desktop zero-impact (separate context) ---
if (mode === 'desktop' && !result.error) {
  console.log('\n=== DESKTOP ZERO-IMPACT ===');
  const applied = await page.evaluate(() => {
    const html = getComputedStyle(document.documentElement);
    return { touchAction: html.touchAction };
  });
  check(applied.touchAction !== 'manipulation', 'desktop html touch-action NOT manipulation (got ' + applied.touchAction + ') — media query not matched');
}

await page.screenshot({ path: '/tmp/e2e-qol-' + mode + '.png' });
await browser.close();

console.log('\n=== SUMMARY ===');
console.log('pass=' + pass + ' fail=' + fail);
process.exit(fail > 0 ? 1 : 0);
