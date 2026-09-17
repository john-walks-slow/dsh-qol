// Verify composer-permission: hide the access-mode dropdown trigger on mobile.
// Real 4175 instance (plugin linked, source-change = refresh-live).
import pw from '/root/projects/camoufox-mcp/node_modules/playwright-core/index.js';
const { firefox } = pw;
const CHROMIUM = '/root/.cache/camoufox/camoufox-bin';
const TOKEN = process.env.DSH_E2E_TOKEN_4175;
if (!TOKEN) { console.error('missing DSH_E2E_TOKEN_4175 — set it to the live 4175 instance token (printed by `dsh web`)'); process.exit(1); }

let pass = 0, fail = 0;
function check(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } }

async function run(vp, ua, hasTouch) {
  const browser = await firefox.launch({ executablePath: CHROMIUM, headless: true, args: ['--no-remote'] });
  const ctx = await browser.newContext({ viewport: vp, hasTouch, userAgent: ua, deviceScaleFactor: hasTouch ? 3 : 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://127.0.0.1:4175/?token=${TOKEN}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(6000);
  // switch to a non-active tab (a real session with the full composer)
  await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.astb-tab')];
    const t = tabs.find(x => !x.className.includes('active')) || tabs[0];
    if (t) t.click();
  });
  // wait for the composer editor to render
  try { await page.waitForSelector('[data-composer-card] [contenteditable="true"]', { timeout: 8000 }); } catch (e) { /* probe reports state */ }
  await page.waitForTimeout(1000);

  const r = await page.evaluate(() => {
    const card = document.querySelector('[data-composer-card]');
    if (!card) return { error: 'no composer card', barText: ((document.querySelector('[data-slot="conversation.composer.bar"]') || {}).textContent || '').slice(0, 60) || null };
    const probe = (sel) => {
      const b = card.querySelector(sel);
      return b ? { found: true, display: getComputedStyle(b).display, aria: (b.getAttribute('aria-label') || '').slice(0, 40) } : { found: false };
    };
    return {
      attrs: [...document.documentElement.attributes].map(a => a.name).filter(n => n.startsWith('data-qol-')),
      cardClass: card.className.slice(0, 40),
      perm: probe('button[class$="_trigger"][aria-label^="Access mode"], button[class$="_trigger"][aria-label^="访问模式"]'),
      model: probe('button[aria-label^="Select model"], button[aria-label^="选择模型"]'),
      ctxMeter: probe('button[aria-label*="context used"], button[aria-label*="上下文"]'),
      editor: !!card.querySelector('[contenteditable="true"]')
    };
  });
  await browser.close();
  return { r, errs, w: vp.width };
}

const mobUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const deskUA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

console.log('=== MOBILE (390x844) ===');
let { r, errs, w } = await run({ width: 390, height: 844 }, mobUA, true);
console.log('  ' + JSON.stringify(r));
check(r.attrs && r.attrs.length === 11, '11 qol attrs (got ' + (r.attrs || []).length + ')');
check(r.attrs && r.attrs.includes('data-qol-composer-permission'), 'composer-permission attr on');
check(r.perm.found && r.perm.display === 'none', 'permission trigger hidden (display=' + (r.perm.display || 'n/a') + ')');
check(r.model.found && r.model.display !== 'none', 'model select still visible (' + (r.model.display || 'n/a') + ')');
check(r.ctxMeter.found && r.ctxMeter.display !== 'none', 'context meter still visible (' + (r.ctxMeter.display || 'n/a') + ')');
check(r.editor, 'composer editor present');
check(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join('|') : ''));

console.log('\n=== DESKTOP (1280x800) ===');
({ r, errs, w } = await run({ width: 1280, height: 800 }, deskUA, false));
console.log('  ' + JSON.stringify(r));
check(r.perm.found && r.perm.display !== 'none', 'desktop: permission trigger VISIBLE (got ' + (r.perm.display || 'n/a') + ')');
check(errs.length === 0, 'no page errors');

console.log('\n=== SUMMARY === pass=' + pass + ' fail=' + fail);
process.exit(fail > 0 ? 1 : 0);
