// Probe v9: e2e 4188 — send a real message, wait for reply, then inspect the
// scroll-to-bottom button DOM and user-message DOM.
import pw from '/root/projects/camoufox-mcp/node_modules/playwright-core/index.js';
const { firefox } = pw;
const CHROMIUM = '/root/.cache/camoufox/camoufox-bin';

const browser = await firefox.launch({ executablePath: CHROMIUM, headless: true, args: ['--no-remote'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
await page.goto('http://127.0.0.1:4188/?token=e2etest', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(7000);

const composerInfo = await page.evaluate(() => {
  const inputs = [...document.querySelectorAll('[contenteditable="true"], textarea, [role="textbox"]')].map(el => ({
    tag: el.tagName, cls: el.className.slice(0, 80), attrs: [...el.attributes].map(a => a.name).filter(n => n.startsWith('data-')),
    rect: (() => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })()
  }));
  const send = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').includes('Send'));
  return { inputs, sendAria: send ? send.getAttribute('aria-label') : null, sendCls: send ? send.className : null };
});
console.log('COMPOSER:', JSON.stringify(composerInfo, null, 2));

// type into the composer and send
const typed = await page.evaluate(() => {
  const el = document.querySelector('[contenteditable="true"], [role="textbox"], textarea');
  if (!el) return 'no input';
  el.focus();
  // use beforeinput events like a real user for contenteditable
  el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: '回复我一句话就好', bubbles: true, composed: true }));
  el.textContent = '回复我一句话就好';
  el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: '回复我一句话就好', bubbles: true, composed: true }));
  return 'typed:' + el.textContent;
});
console.log('TYPED:', typed);
await page.waitForTimeout(800);

const clicked = await page.evaluate(() => {
  const send = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').includes('Send'));
  if (send) { send.click(); return 'clicked send'; }
  return 'no send btn';
});
console.log('SEND:', clicked);

// wait for user message to appear + assistant reply
let msgCount = 0;
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(3000);
  msgCount = await page.evaluate(() => {
    const conv = document.querySelector('[data-conversation-scroll]');
    return conv ? conv.querySelectorAll('[data-chat-flow-kind]').length : 0;
  });
  const running = await page.evaluate(() => !!document.querySelector('[data-qol-active-tabbar]') /* noop */);
  console.log(`t+${(i + 1) * 3}s msgs=${msgCount}`);
  if (msgCount >= 2) break;
}

const out = await page.evaluate(() => {
  const res = {};
  const conv = document.querySelector('[data-conversation-scroll]');
  if (!conv) { res.conv = null; return res; }
  const r = conv.getBoundingClientRect();
  res.conv = { rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, scrollTop: Math.round(conv.scrollTop), scrollHeight: conv.scrollHeight, clientH: conv.clientHeight };
  res.kinds = {};
  for (const el of conv.querySelectorAll('[data-chat-flow-kind]')) {
    const k = el.getAttribute('data-chat-flow-kind');
    res.kinds[k] = (res.kinds[k] || 0) + 1;
    const rr = el.getBoundingClientRect();
    res.kinds[k + ':rect'] = { y: Math.round(rr.y), h: Math.round(rr.height) };
  }
  // all small buttons in the lower-right quadrant of the conv
  const cands = [...conv.querySelectorAll('button')].filter(b => {
    const br = b.getBoundingClientRect();
    return br.width <= 48 && br.height <= 48 && br.right < window.innerWidth - 20 && br.bottom > window.innerHeight * 0.5;
  });
  res.btns = cands.map(b => {
    const br = b.getBoundingClientRect();
    return {
      cls: b.className, aria: b.getAttribute('aria-label'), title: b.getAttribute('title'),
      data: [...b.attributes].map(a => a.name).filter(n => n.startsWith('data-')),
      rect: { x: Math.round(br.x), y: Math.round(br.y), w: Math.round(br.width), h: Math.round(br.height), bottom: Math.round(br.bottom) },
      parentCls: b.parentElement?.className, parentData: [...(b.parentElement?.attributes || [])].map(a => a.name).filter(n => n.startsWith('data-')),
      inner: b.innerHTML.slice(0, 120)
    };
  });
  // user message marker: what identifies the user's message element?
  const userEl = [...conv.querySelectorAll('[data-chat-flow-kind]')].find(el => {
    const t = el.getAttribute('data-chat-flow-kind') || '';
    return t.includes('user') || t.includes('prompt');
  });
  if (userEl) {
    res.userMsg = {
      kind: userEl.getAttribute('data-chat-flow-kind'),
      cls: userEl.className.slice(0, 120),
      dataAttrs: [...userEl.attributes].map(a => a.name + '=' + (a.value || '').slice(0, 50)),
      text: userEl.textContent.slice(0, 40).replace(/\s+/g, ' ')
    };
  }
  return res;
});
console.log('FINAL:', JSON.stringify(out, null, 2));
console.log('PAGE ERRORS:', JSON.stringify(errs, null, 2));
await browser.close();
