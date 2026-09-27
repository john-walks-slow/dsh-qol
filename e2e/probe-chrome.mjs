// Probe: X alignment under CHROMIUM (classic scrollbar) — verifies the
// anchor-rect reference-frame fix. Desktop 1280 viewport.
import { guard } from './lib/run-guard.mjs';
await guard();
import pw from '/root/projects/camoufox-mcp/node_modules/playwright-core/index.js';
const { chromium } = pw;
const url = process.env.DSH_E2E_URL ||
  `http://127.0.0.1:${process.env.DSH_E2E_PORT || 4188}/?token=${process.env.DSH_E2E_TOKEN || 'e2etest'}`;

const browser = await chromium.launch({ channel: undefined, executablePath: '/usr/bin/google-chrome', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(6000);

  // one message with a long reply
  const c = await page.evaluate(() => {
    const el = document.querySelector('[data-composer-input]');
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(400);
  await page.keyboard.type('probe-chrome ' + Date.now().toString(36) + '：请写一篇八百字以上的文章介绍 B+ 树', { delay: 5 });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const send = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').includes('Send'));
    if (send) send.click();
  });
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(2000);
    const s = await page.evaluate(() => ({
      stop: !!document.querySelector('button[aria-label="Stop generating"]'),
      users: document.querySelectorAll('[data-chat-flow-kind="user"]').length
    }));
    if (!s.stop && s.users >= 1) break;
  }
  // wheel up so the host button mounts
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(400);
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(1200);

  const geo = await page.evaluate(() => {
    const conv = document.querySelector('[data-conversation-scroll]');
    const toBottom = document.querySelector('button[class$="_toBottom"]');
    const jump = document.querySelector('.dsh-qol-jump-user');
    const anchor = document.querySelector('.dsh-qol-jump-anchor');
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width) }; };
    return {
      scrollbarW: conv ? conv.offsetWidth - conv.clientWidth - (parseFloat(getComputedStyle(conv).borderLeftWidth) + parseFloat(getComputedStyle(conv).borderRightWidth)) : null,
      conv: r(conv),
      toBottom: r(toBottom),
      jump: r(jump),
      anchor: r(anchor),
      pad: anchor ? anchor.style.paddingRight : null
    };
  });
  console.log(JSON.stringify(geo, null, 1));
  const d = geo.toBottom && geo.jump ? geo.jump.right - geo.toBottom.right : null;
  console.log('jump.right - host.right =', d, d !== null && Math.abs(d) <= 2 ? '(ALIGNED ✓)' : '(MISALIGNED ✗)');
} finally {
  await browser.close();
}
