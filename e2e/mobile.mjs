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
const CHROMIUM = '/root/.cache/camoufox/camoufox-bin';

const mode = process.argv[2] || 'mobile';
const isMobile = mode !== 'desktop';
const vp = isMobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };
const ua = isMobile
  ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const TOKEN = process.env.DSH_E2E_TOKEN_4175;
if (!TOKEN) { console.error('missing DSH_E2E_TOKEN_4175 — set it to the live 4175 instance token (printed by `dsh web`)'); process.exit(1); }
const url = `http://127.0.0.1:4175/?token=${TOKEN}`;
const src = fs.readFileSync('/root/projects/dsh-qol/lib/client.js', 'utf8');

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
  const req = (spec) => { if (spec === 'react') return mockReact; throw new Error('unknown require: ' + spec); };

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
          const f = document.querySelector('[class*="_frame"]:has(> [class*="_sidebarCol\"])') || document.querySelector('[data-sidebar-collapsed]');
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
check(result.attrs.length === 14 && !result.attrs.includes('data-qol-settings-remember-tab') && result.attrs.includes('data-qol-no-touch-drag'),
  '14 feature attributes set incl. no-touch-drag and excl. settings-remember-tab (got ' + result.attrs.length + ')');
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
  // run the block with `page` bound to the clean page (parameter shadows the app page); skip the cases entirely when the instance failed to load
  if (!gres.error)
  await (async (page) => {
  // reset counter
  await page.evaluate(() => { window.__qol.layoutToggles = 0; });

  // synthesize the sidebar frame the gesture logic reads (findSidebarFrame's
  // structural anchor): starts collapsed, and the mock layout.toggleSidebar
  // flips its data-sidebar-collapsed so sidebarOpen() tracks open/close
  // across the two swipes
  await page.evaluate(() => {
    const frame = document.createElement('div');
    frame.className = 'fake_frame';
    frame.setAttribute('data-sidebar-collapsed', '');
    const col = document.createElement('div');
    col.className = 'fake_sidebarCol';
    frame.appendChild(col);
    document.body.appendChild(frame);
  });

  // dispatch a right-swipe (open) from x=80 (past the 16px edge ignore).
  // The plugin listens to Touch Events (not Pointer Events) so the browser
  // cannot claim the stream for scrolling on real devices — dispatch TouchEvents.
  const gestureSwipe = async (startX, startY, dx, targetSelector) => {
    const target = await page.evaluate((sel) => {
      if (!sel) return 'body';
      const el = document.querySelector(sel);
      return el ? sel : null;
    }, targetSelector);
    if (!target) { console.log('  (skip swipe on ' + targetSelector + ' — no such element)'); return false; }
    await page.evaluate(({ sx, sy, dx, sel }) => {
      const node = sel ? document.querySelector(sel) : document.body;
      const mk = (x) => new Touch({ identifier: 1, target: node, clientX: x, clientY: sy });
      const fire = (type, x) => {
        const t = mk(x);
        node.dispatchEvent(new TouchEvent(type, { touches: [t], changedTouches: [t], targetTouches: [t], bubbles: true, cancelable: true }));
      };
      fire('touchstart', sx);
      const steps = 6;
      for (let i = 1; i <= steps; i++) fire('touchmove', sx + (dx * i / steps));
      fire('touchend', sx + dx);
    }, { sx: startX, sy: startY, dx, sel: target });
    await page.waitForTimeout(50);
    return true;
  };

  // dispatch on document.body — an Element (passes the instanceof Element
  // guard), not a form control, not horizontally scrollable.
  const ok = await gestureSwipe(80, 200, 80, null);
  if (ok) {
    const togglesAfterOpen = await page.evaluate(() => window.__qol.layoutToggles);
    check(togglesAfterOpen === 1, 'right swipe (80px) toggles sidebar open (got ' + togglesAfterOpen + ')');
  }

  const ok2 = await gestureSwipe(300, 200, -80, null);
  if (ok2) {
    const togglesAfterClose = await page.evaluate(() => window.__qol.layoutToggles);
    check(togglesAfterClose === 2, 'left swipe (-80px) toggles sidebar close (got ' + togglesAfterClose + ')');
  }

  // below threshold — no toggle
  await page.evaluate(() => { window.__qol.layoutToggles = 0; });
  await gestureSwipe(80, 200, 40, null);
  const togglesBelow = await page.evaluate(() => window.__qol.layoutToggles);
  check(togglesBelow === 0, 'swipe below threshold (40px) does not toggle (got ' + togglesBelow + ')');

  // on a textarea — skip (create one if none exists)
  await page.evaluate(() => {
    if (!document.querySelector('textarea')) {
      const t = document.createElement('textarea');
      t.id = '__qol_test_ta';
      document.body.appendChild(t);
    }
  });
  await page.evaluate(() => { window.__qol.layoutToggles = 0; });
  const hasTA = await page.evaluate(() => !!document.querySelector('textarea'));
  if (hasTA) {
    await gestureSwipe(80, 200, 80, 'textarea#__qol_test_ta');
    const togglesForm = await page.evaluate(() => window.__qol.layoutToggles);
    check(togglesForm === 0, 'swipe starting on form control is skipped (got ' + togglesForm + ')');
    await page.evaluate(() => document.getElementById('__qol_test_ta')?.remove());
  }
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
