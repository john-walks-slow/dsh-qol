// jump-user-msg E2E (target: e2e instance 4188, see /dsh-e2e skill).
// Verifies the 260925 "上一条用户消息按钮" feature:
//   1. html[data-qol-jump-user-msg] attribute set on load
//   2. In a real conversation with ≥2 user messages: scrolling up with the
//      wheel makes the host "回到底部" button AND our injected
//      .dsh-qol-jump-user button appear, ours exactly 8px above the host one,
//      both a full 34x34 circle (not squished by the sticky slot)
//   3. One user message per click (user-defined semantics): only a TOP-ALIGNED
//      row counts as the current one — clicking then walks to the row BEFORE
//      it; if the current row is NOT aligned the click first scrolls to THIS
//      row's top (never skipping the close previous row)
//   4. At the very bottom (host button hidden) our button STAYS reachable and
//      clicking it still jumps to the previous user message
//   5. Toggling the feature off in Settings hides the injected button
// Usage: node e2e/jump-user-msg.mjs  (or dsh-e2e run e2e/jump-user-msg.mjs)
import { guard } from './lib/run-guard.mjs';
await guard(); // run-level mutex: this script sends messages / toggles settings on 4188
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  console.log('=== A. ENV / load ===');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(6000);
  const env = await page.evaluate(() => ({
    pluginLive: !!document.querySelector('style[data-plugin-css="dsh-qol"]'),
    jumpAttr: document.documentElement.getAttribute('data-qol-jump-user-msg'),
    composer: !!document.querySelector('[data-composer-input]')
  }));
  check(env.pluginLive, 'plugin style tag live');
  check(env.jumpAttr === 'on', 'data-qol-jump-user-msg="on" set on <html>');
  check(env.composer, 'composer present');

  console.log('=== B. Build a tall conversation (3 user messages) ===');
  const sendMessage = async (text) => {
    const c = await page.evaluate(() => {
      const el = document.querySelector('[data-composer-input]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!c) return false;
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(400);
    await page.keyboard.type(text, { delay: 5 });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const send = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').includes('Send'));
      if (send) send.click();
    });
    return true;
  };
  // The e2e agent streams replies; wait until the reply is done (the Send
  // button is replaced by Stop while running) before sending the next one.
  const waitForDone = async (minUsers) => {
    for (let i = 0; i < 75; i++) { // up to 150s per reply
      await page.waitForTimeout(2000);
      const st = await page.evaluate(() => {
        const conv = document.querySelector('[data-conversation-scroll]');
        return {
          users: conv ? conv.querySelectorAll('[data-chat-flow-kind="user"]').length : 0,
          stop: !!document.querySelector('button[aria-label="Stop generating"]'),
          scrollH: conv ? conv.scrollHeight : 0,
          clientH: conv ? conv.clientHeight : 0
        };
      });
      if (st.users >= minUsers && !st.stop) { console.log(`    reply ${minUsers} done + overflow (${(i + 1) * 2}s)`); return st; }
    }
    return null;
  };
  // Unique prefixes so the walking assertions can identify OUR messages even
  // when the e2e session is reused across runs.
  const stamp = Date.now().toString(36);
  const msg1 = '第一条-' + stamp;
  const msg2 = '第二条-' + stamp + '，内容稍长一些以便滚动';
  const msg3 = '第三条-' + stamp + '：请写一段五百字以上的内容介绍递归算法';
  const baseline = await page.evaluate(() => document.querySelectorAll('[data-chat-flow-kind="user"]').length);
  check(await sendMessage(msg1), '1st message typed & sent');
  const r1 = await waitForDone(baseline + 1);
  check(r1 !== null, '1st user message delivered, reply finished');
  check(await sendMessage(msg2), '2nd message typed & sent');
  const r2 = await waitForDone(baseline + 2);
  check(r2 !== null && r2.users >= baseline + 2, '2nd user message delivered, reply finished');
  check(await sendMessage(msg3), '3rd (long-answer) message typed & sent');
  const r3 = await waitForDone(baseline + 3);
  check(r3 !== null && r3.users >= baseline + 3, '3rd user message delivered, reply finished');
  check(r3 !== null && r3.scrollH - r3.clientH >= 800,
    `conversation tall enough for walking (floor ${r3 ? r3.scrollH - r3.clientH : '-'}px)`);

  console.log('=== C. Wheel up → buttons appear above the bottom-right ===');
  // real wheel scroll (direct scrollTop assignment is treated as programmatic
  // and the host keeps atBottom=true)
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(400);
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(1200);
  const btns = await page.evaluate(() => {
    const conv = document.querySelector('[data-conversation-scroll]');
    const toBottom = document.querySelector('button[class$="_toBottom"]');
    const jump = document.querySelector('.dsh-qol-jump-user');
    const rectOf = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width) }; };
    return {
      scrollTop: conv ? Math.round(conv.scrollTop) : null,
      floor: conv ? conv.scrollHeight - conv.clientHeight : null,
      toBottom: toBottom ? { ...rectOf(toBottom), aria: toBottom.getAttribute('aria-label') } : null,
      jump: jump ? rectOf(jump) : null,
      users: conv ? [...conv.querySelectorAll('[data-chat-flow-kind="user"]')].map(el => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), text: el.textContent.slice(0, 14) }; }) : []
    };
  });
  console.log('  ' + JSON.stringify(btns));
  check(!!btns.toBottom, 'host "回到底部" button visible after wheel-up');
  check(!!btns.jump, 'injected .dsh-qol-jump-user visible');
  check(btns.toBottom && btns.jump && btns.jump.bottom <= btns.toBottom.top,
    `jump button sits above host button (jump.bottom ${btns.jump?.bottom} ≤ host.top ${btns.toBottom?.top})`);
  check(btns.toBottom && btns.jump && Math.abs((btns.toBottom.top - btns.jump.bottom) - 8) <= 1,
    `~8px gap between buttons (got ${btns.toBottom ? btns.toBottom.top - btns.jump.bottom : '-'})`);
  check(btns.jump && Math.abs(btns.jump.height - 34) <= 2 && btns.toBottom && Math.abs(btns.toBottom.height - 34) <= 2,
    `both buttons keep full 34x34 circle (jump ${btns.jump?.height}px, host ${btns.toBottom?.height}px)`);
  const expectedRight = btns.jump ? btns.jump.right : null;
  check(btns.toBottom && btns.jump && Math.abs(btns.jump.right - btns.toBottom.right) <= 2,
    `jump right edge aligned with host button (jump.right ${btns.jump?.right}, host.right ${btns.toBottom?.right})`);

  console.log('=== D. One user message per click (top-aligned semantics) ===');
  const clickJump = async () => {
    await page.evaluate(() => { const j = document.querySelector('.dsh-qol-jump-user'); if (j) j.click(); });
    // smooth scroll can take seconds for long distances — wait until settled
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(250);
      const s1 = await readScroll();
      await page.waitForTimeout(250);
      const s2 = await readScroll();
      if (s1 === s2) return;
    }
  };
  const readScroll = () => page.evaluate(() => {
    const conv = document.querySelector('[data-conversation-scroll]');
    return conv ? Math.round(conv.scrollTop) : -1;
  });
  // The host consumes wheel events (≈515px per event); chunk until the bottom.
  const toBottom = async () => {
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(150);
      const st = await page.evaluate(() => {
        const conv = document.querySelector('[data-conversation-scroll]');
        return conv ? { st: conv.scrollTop, floor: conv.scrollHeight - conv.clientHeight } : { st: -1, floor: 0 };
      });
      if (st.floor - st.st <= 30) { await page.waitForTimeout(400); return st; }
    }
    return null;
  };

  // Start deterministic: wheel to the very bottom.
  await toBottom();

  // D1: click at the bottom → lands on the last (2nd) user message top-16.
  const beforeClick = await readScroll();
  await clickJump();
  const after1 = await readScroll();
  check(after1 < beforeClick, `click at bottom scrolls up (${beforeClick} → ${after1})`);
  const pos1 = await page.evaluate(() => {
    const conv = document.querySelector('[data-conversation-scroll]');
    const users = [...conv.querySelectorAll('[data-chat-flow-kind="user"]')];
    const target = users[users.length - 1]; // the latest user message
    const scRect = conv.getBoundingClientRect();
    const contentTop = target.getBoundingClientRect().top - scRect.top + conv.scrollTop;
    return { contentTop: Math.round(contentTop), scrollTop: Math.round(conv.scrollTop), targetText: target.textContent.slice(0, 10) };
  });
  check(Math.abs(pos1.scrollTop - Math.max(0, pos1.contentTop - 16)) <= 4 && pos1.targetText.includes('第三条'),
    `lands on latest user message top-16 (scrollTop ${pos1.scrollTop}, contentTop ${pos1.contentTop}, target "${pos1.targetText}")`);

  // D2: NOT aligned → the click scrolls to THIS row's top (aligns it) instead
  // of skipping to the previous row. Wheel down 80px so the row's top sits
  // ~96px below the viewport top.
  await page.mouse.wheel(0, 80);
  await page.waitForTimeout(600);
  const b2 = await readScroll();
  await clickJump();
  const a2 = await readScroll();
  check(a2 < b2 && b2 - a2 >= 50, `not-aligned click aligns this row (moved ${b2 - a2}px)`);
  const posA = await page.evaluate(() => {
    const conv = document.querySelector('[data-conversation-scroll]');
    const users = [...conv.querySelectorAll('[data-chat-flow-kind="user"]')];
    const target = users[users.length - 1];
    const scRect = conv.getBoundingClientRect();
    const contentTop = target.getBoundingClientRect().top - scRect.top + conv.scrollTop;
    return { contentTop: Math.round(contentTop), scrollTop: Math.round(conv.scrollTop), targetText: target.textContent.slice(0, 10) };
  });
  check(Math.abs(posA.scrollTop - Math.max(0, posA.contentTop - 16)) <= 4 && posA.targetText.includes('第三条'),
    `re-aligned on the SAME row, did NOT skip forward (scrollTop ${posA.scrollTop}, target "${posA.targetText}")`);

  // D3: top-aligned regression — wheel down 16px so the row's top is EXACTLY
  // at the viewport top, click → must walk to the PREVIOUS user message (old
  // logic re-selected the current row and only moved 0-16px = "no reaction").
  await page.mouse.wheel(0, 16);
  await page.waitForTimeout(600);
  const b3 = await readScroll();
  await clickJump();
  const a3 = await readScroll();
  check(b3 - a3 > 50, `top-aligned click walks to the previous row (moved ${b3 - a3}px, not 0-16)`);
  const pos3 = await page.evaluate(() => {
    const conv = document.querySelector('[data-conversation-scroll]');
    const users = [...conv.querySelectorAll('[data-chat-flow-kind="user"]')];
    const target = users[users.length - 2]; // the previous (1st) user message
    const scRect = conv.getBoundingClientRect();
    const contentTop = target.getBoundingClientRect().top - scRect.top + conv.scrollTop;
    return { contentTop: Math.round(contentTop), scrollTop: Math.round(conv.scrollTop), targetText: target.textContent.slice(0, 12) };
  });
  check(Math.abs(pos3.scrollTop - Math.max(0, pos3.contentTop - 16)) <= 4 && pos3.targetText.includes('第二条'),
    `top-aligned click reaches the PREVIOUS user message (scrollTop ${pos3.scrollTop}, target "${pos3.targetText}")`);

  // D4: keep walking — one more click reaches the first of OUR messages, and
  // a final click on the FIRST user row flips to the very top.
  await clickJump();
  const pos4 = await page.evaluate(() => {
    const conv = document.querySelector('[data-conversation-scroll]');
    const users = [...conv.querySelectorAll('[data-chat-flow-kind="user"]')];
    const target = users[users.length - 3]; // the first of our 3 messages
    const scRect = conv.getBoundingClientRect();
    const contentTop = target.getBoundingClientRect().top - scRect.top + conv.scrollTop;
    return { contentTop: Math.round(contentTop), scrollTop: Math.round(conv.scrollTop), targetText: target.textContent.slice(0, 12) };
  });
  check(Math.abs(pos4.scrollTop - Math.max(0, pos4.contentTop - 16)) <= 4 && pos4.targetText.includes('第一条'),
    `walking reaches the first user message (scrollTop ${pos4.scrollTop}, target "${pos4.targetText}")`);
  await clickJump();
  const pos5 = await readScroll();
  check(pos5 <= 1, `click on first user message flips to the very top (scrollTop ${pos5})`);

  console.log('=== D2. At the very bottom the jump button stays reachable ===');
  // wheel all the way down to the bottom (real scroll; the host hides its
  // toBottom button there, our anchor must remain)
  const bottomSt = await toBottom();
  const bottom = await page.evaluate(() => {
    const conv = document.querySelector('[data-conversation-scroll]');
    const toBottom = document.querySelector('button[class$="_toBottom"]');
    const jump = document.querySelector('.dsh-qol-jump-user');
    const r = jump ? jump.getBoundingClientRect() : null;
    return {
      scrollTop: conv ? Math.round(conv.scrollTop) : null,
      floor: conv ? conv.scrollHeight - conv.clientHeight : null,
      toBottom: !!toBottom,
      jump: r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), right: Math.round(r.right) } : null
    };
  });
  console.log('  ' + JSON.stringify(bottom));
  check(bottom.floor !== null && bottom.scrollTop >= bottom.floor - 30, 'scrolled to the bottom');
  check(!bottom.toBottom, 'host "回到底部" button hidden at the bottom');
  check(!!bottom.jump && Math.abs(bottom.jump.height - 34) <= 2,
    `our jump button STILL visible at the bottom (height ${bottom.jump?.height}px)`);
  check(bottom.jump && expectedRight !== null && Math.abs(bottom.jump.right - expectedRight) <= 2,
    `jump keeps the host-aligned X at the bottom (right ${bottom.jump?.right}, expected ${expectedRight})`);
  const beforeBottom = bottom.scrollTop;
  await clickJump();
  const afterBottom = await readScroll();
  check(afterBottom < beforeBottom, `clicking at the bottom jumps up (${beforeBottom} → ${afterBottom})`);
  const posB = await page.evaluate(() => {
    const conv = document.querySelector('[data-conversation-scroll]');
    const users = [...conv.querySelectorAll('[data-chat-flow-kind="user"]')];
    const target = users[users.length - 1]; // previous = the 2nd user message
    const scRect = conv.getBoundingClientRect();
    const contentTop = target.getBoundingClientRect().top - scRect.top + conv.scrollTop;
    return { contentTop: Math.round(contentTop), scrollTop: Math.round(conv.scrollTop), targetText: target.textContent.slice(0, 10) };
  });
  check(Math.abs(posB.scrollTop - Math.max(0, posB.contentTop - 16)) <= 4,
    `at-bottom click lands on the previous user message (scrollTop ${posB.scrollTop}, contentTop ${posB.contentTop}, target "${posB.targetText}")`);

  console.log('=== E. Toggle off hides the button ===');
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
  const jumpRow = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!dialog) return null;
    const label = [...dialog.querySelectorAll('.dsh-qol-row')].find(r => (r.textContent || '').includes('上一条用户消息按钮'));
    if (!label) return null;
    const sw = label.querySelector('[role="switch"]');
    return { found: true, checked: sw ? sw.getAttribute('aria-checked') : null };
  });
  check(jumpRow && jumpRow.found && jumpRow.checked === 'true', 'settings row present and ON');
  if (jumpRow && jumpRow.found) {
    await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
      const label = [...dialog.querySelectorAll('.dsh-qol-row')].find(r => (r.textContent || '').includes('上一条用户消息按钮'));
      label.querySelector('[role="switch"]').click();
    });
    await page.waitForTimeout(800);
    const hidden = await page.evaluate(() => ({
      attr: document.documentElement.getAttribute('data-qol-jump-user-msg'),
      jump: !!document.querySelector('.dsh-qol-jump-user')
    }));
    check(hidden.attr === null && !hidden.jump, 'toggle off: attribute removed + injected button removed');
  }

  console.log('=== F. Page errors ===');
  check(pageErrors.length === 0, 'no pageerrors' + (pageErrors.length ? ' (' + pageErrors.join('; ') + ')' : ''));
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
} finally {
  await browser.close();
}
