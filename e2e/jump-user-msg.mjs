// jump-user-msg E2E (target: e2e instance 4188, see /dsh-e2e skill).
// Verifies the 260925 "上一条用户消息按钮" feature:
//   1. html[data-qol-jump-user-msg] attribute set on load
//   2. In a real conversation with ≥2 user messages: scrolling away from the
//      bottom makes the host "回到底部" button AND our injected
//      .dsh-qol-jump-user button appear, ours exactly above the host one
//   3. Clicking ours scrolls to the previous user message (nearest
//      [data-chat-flow-kind="user"] whose top scrolled past the viewport);
//      a second click goes to the first user message
//   4. Toggling the feature off in Settings hides the injected button
// Usage: node e2e/jump-user-msg.mjs
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

  console.log('=== B. Build a conversation with 2 user messages ===');
  const sendMessage = async (text) => {
    await page.evaluate(() => {
      const input = document.querySelector('[data-composer-input]');
      input.click();
      input.focus();
    });
    await page.waitForTimeout(400);
    await page.keyboard.type(text, { delay: 5 });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const send = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').includes('Send'));
      if (send) send.click();
    });
  };
  // The e2e agent streams replies slowly; the jump target (a user message)
  // is above the streaming tail, so we only need the user rows present and
  // some content below them for the viewport to overflow.
  const waitForUsers = async (expectedUsers) => {
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(2000);
      const st = await page.evaluate(() => {
        const conv = document.querySelector('[data-conversation-scroll]');
        return {
          users: conv ? conv.querySelectorAll('[data-chat-flow-kind="user"]').length : 0,
          scrollH: conv ? conv.scrollHeight : 0,
          clientH: conv ? conv.clientHeight : 0
        };
      });
      if (st.users >= expectedUsers && st.scrollH > st.clientH) { console.log(`    ${expectedUsers} user rows + overflow reached (${(i + 1) * 2}s)`); return st; }
    }
    return null;
  };

  await sendMessage('第一条用户消息');
  const r1 = await waitForUsers(1);
  check(r1 !== null, '1st user message delivered + conversation overflows');
  await sendMessage('第二条用户消息，内容稍长一些以便滚动');
  const r2 = await waitForUsers(2);
  check(r2 !== null && r2.users >= 2, '2nd user message delivered');
  check(r2 !== null && r2.scrollH > r2.clientH, 'conversation overflows one viewport (scrollable)');
  // let the streaming tail add a little more height so the top is far from bottom
  await page.waitForTimeout(5000);

  console.log('=== C. Buttons appear when scrolled off the bottom ===');
  await page.evaluate(() => {
    const conv = document.querySelector('[data-conversation-scroll]');
    if (conv) conv.scrollTop = 0;
  });
  await page.waitForTimeout(1500);
  const btns = await page.evaluate(() => {
    const conv = document.querySelector('[data-conversation-scroll]');
    const toBottom = document.querySelector('button[class$="_toBottom"]');
    const jump = document.querySelector('.dsh-qol-jump-user');
    const rectOf = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), x: Math.round(r.x), w: Math.round(r.width) }; };
    return {
      convTop: conv ? Math.round(conv.getBoundingClientRect().top) : null,
      scrollTop: conv ? Math.round(conv.scrollTop) : null,
      toBottom: toBottom ? { ...rectOf(toBottom), aria: toBottom.getAttribute('aria-label') } : null,
      jump: jump ? rectOf(jump) : null,
      users: conv ? [...conv.querySelectorAll('[data-chat-flow-kind="user"]')].map(el => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), text: el.textContent.slice(0, 16) }; }) : []
    };
  });
  console.log('  ' + JSON.stringify(btns));
  check(!!btns.toBottom, 'host "回到底部" button visible off-bottom');
  check(!!btns.jump, 'injected .dsh-qol-jump-user visible');
  check(btns.toBottom && btns.jump && btns.jump.bottom <= btns.toBottom.top,
    `jump button sits above host button (jump.bottom ${btns.jump?.bottom} ≤ host.top ${btns.toBottom?.top})`);
  check(btns.toBottom && btns.jump && (btns.toBottom.top - btns.jump.bottom) === 8,
    `8px gap between buttons (got ${btns.toBottom ? btns.toBottom.top - btns.jump.bottom : '-'})`);

  console.log('=== D. Click → jumps to previous user message ===');
  const clickJump = async () => {
    await page.evaluate(() => { const j = document.querySelector('.dsh-qol-jump-user'); if (j) j.click(); });
    await page.waitForTimeout(1400); // smooth scroll
  };
  const readScroll = () => page.evaluate(() => {
    const conv = document.querySelector('[data-conversation-scroll]');
    return conv ? Math.round(conv.scrollTop) : -1;
  });

  const beforeClick = await readScroll();
  await clickJump();
  const after1 = await readScroll();
  check(after1 < beforeClick, `scroll moved up after click (${beforeClick} → ${after1})`);
  const pos1 = await page.evaluate(() => {
    const conv = document.querySelector('[data-conversation-scroll]');
    const users = [...conv.querySelectorAll('[data-chat-flow-kind="user"]')];
    const target = users[users.length - 1]; // the previous (2nd) user message
    const scRect = conv.getBoundingClientRect();
    const contentTop = target.getBoundingClientRect().top - scRect.top + conv.scrollTop;
    return { contentTop: Math.round(contentTop), scrollTop: Math.round(conv.scrollTop) };
  });
  check(Math.abs(pos1.scrollTop - Math.max(0, pos1.contentTop - 16)) <= 3,
    `scrolled to 2nd user message top-16 (scrollTop ${pos1.scrollTop}, contentTop ${pos1.contentTop})`);

  await clickJump();
  const pos2 = await page.evaluate(() => {
    const conv = document.querySelector('[data-conversation-scroll]');
    const users = [...conv.querySelectorAll('[data-chat-flow-kind="user"]')];
    const target = users[0];
    const scRect = conv.getBoundingClientRect();
    const contentTop = target.getBoundingClientRect().top - scRect.top + conv.scrollTop;
    return { contentTop: Math.round(contentTop), scrollTop: Math.round(conv.scrollTop), targetText: target.textContent.slice(0, 12) };
  });
  check(Math.abs(pos2.scrollTop - Math.max(0, pos2.contentTop - 16)) <= 3 && pos2.targetText.includes('第一条'),
    `second click reaches the FIRST user message (scrollTop ${pos2.scrollTop}, target "${pos2.targetText}")`);

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
