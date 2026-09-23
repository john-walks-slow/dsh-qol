import pw from '/root/projects/camoufox-mcp/node_modules/playwright-core/index.js';
const { firefox } = pw;
const CHROMIUM = '/root/.cache/camoufox/camoufox-bin';
const TOKEN = process.env.DSH_E2E_TOKEN_4175;
if (!TOKEN) { console.error('missing DSH_E2E_TOKEN_4175 — set it to the live 4175 instance token (printed by `dsh web`)'); process.exit(1); }
const url = `http://127.0.0.1:4175/?token=${TOKEN}`;

let pass = 0, fail = 0;
function check(cond, msg) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + msg);
  } else {
    fail++;
    console.error('  ✗ ' + msg);
  }
}

console.log('=== Starting E2E Settings Features Test ===');
const browser = await firefox.launch({
  executablePath: CHROMIUM,
  headless: true,
  args: ['--no-remote']
});

try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    deviceScaleFactor: 3,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });

  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  console.log('Navigating to', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  // 1. 验证插件已加载并包含新 feature
  const pluginInfo = await page.evaluate(() => {
    const style = document.querySelector('style[data-plugin-css="dsh-qol"]');
    const attrs = [...document.documentElement.attributes].map(a => a.name).filter(n => n.startsWith('data-qol-'));
    return {
      styleLive: !!style,
      hasRememberTab: attrs.includes('data-qol-settings-remember-tab'),
      hasSettingsMobile: attrs.includes('data-qol-settings-mobile'),
      attrs
    };
  });
  console.log('Plugin Info:', JSON.stringify(pluginInfo));
  check(pluginInfo.styleLive, 'dsh-qol style element injected');
  check(!pluginInfo.hasRememberTab, 'data-qol-settings-remember-tab attribute absent by default on <html>');
  check(pluginInfo.hasSettingsMobile, 'data-qol-settings-mobile attribute present on <html>');

  // 2. 打开 Settings 对话框
  console.log('Opening Settings dialog...');
  const opened = await page.evaluate(() => {
    // 优先点击折叠态的 Settings rail 图标，或者先展开侧栏再点 Settings
    const railSettings = document.querySelector('button.VOzbGW_rail, button[class*="VOzbGW_rail"]');
    if (railSettings) {
      railSettings.click();
      return true;
    }
    const openSidebar = document.querySelector('button[aria-label="Open sidebar"]');
    if (openSidebar) openSidebar.click();
    return false;
  });

  if (!opened) {
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const settingsBtn = btns.find(b => b.textContent.trim() === 'Settings' || b.className.includes('VOzbGW_trigger'));
      if (settingsBtn) settingsBtn.click();
    });
  }

  await page.waitForTimeout(1500);

  // 3. 验证 Settings 对话框及右上角 Header
  const dialogInfo = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]:has(> nav)');
    if (!dialog) return { found: false };
    const dRect = dialog.getBoundingClientRect();
    const nav = dialog.querySelector('nav');
    const titleEl = nav ? nav.querySelector('div:first-child') : null;
    const headerEl = dialog.querySelector('nav + div > div:first-child');
    const headerBtns = headerEl ? [...headerEl.querySelectorAll('button')].map(b => ({
      ariaLabel: b.getAttribute('aria-label'),
      title: b.getAttribute('title'),
      text: b.textContent.trim()
    })) : [];

    const hRect = headerEl ? headerEl.getBoundingClientRect() : null;
    const tRect = titleEl ? titleEl.getBoundingClientRect() : null;

    return {
      found: true,
      dialogRect: { width: dRect.width, height: dRect.height, top: dRect.top, left: dRect.left },
      headerRect: hRect ? { width: hRect.width, height: hRect.height, top: hRect.top, right: hRect.right, left: hRect.left } : null,
      titleRect: tRect ? { width: tRect.width, height: tRect.height, top: tRect.top, right: tRect.right } : null,
      headerButtons: headerBtns,
      headerComputedStyle: headerEl ? {
        position: window.getComputedStyle(headerEl).position,
        top: window.getComputedStyle(headerEl).top,
        right: window.getComputedStyle(headerEl).right,
        zIndex: window.getComputedStyle(headerEl).zIndex
      } : null
    };
  });

  console.log('Dialog Info:', JSON.stringify(dialogInfo, null, 2));
  check(dialogInfo.found, 'Settings dialog opened and found in DOM');
  check(dialogInfo.headerComputedStyle?.position === 'absolute', 'Header is position: absolute');
  check(dialogInfo.headerButtons?.length >= 2, 'Header contains both action/config button and close button');
  // 确认在右上角：headerRect.top 处于顶部（例如 < 30px），且 headerRect.right 靠右（距离屏幕右边缘 <= 20px）
  if (dialogInfo.headerRect) {
    const isTopRight = dialogInfo.headerRect.top <= 30 && (dialogInfo.dialogRect.width - dialogInfo.headerRect.right) <= 25;
    check(isTopRight, `Header is placed in the top-right corner (top: ${dialogInfo.headerRect.top}px, right offset: ${dialogInfo.dialogRect.width - dialogInfo.headerRect.right}px)`);
  }

  // 4. 验证在 QoL 分区中「设置页记忆页签」默认关，并开启后测试页签切换与持久化
  console.log('Testing settings-remember-tab toggle in QoL section and tab persistence...');
  const tabNames = await page.evaluate(() => {
    const nav = document.querySelector('[role="dialog"]:has(> nav) > nav');
    return [...nav.querySelectorAll('button')].map(b => b.textContent.trim());
  });
  console.log('Available tabs:', tabNames);

  const qolIdx = tabNames.findIndex(t => t.trim() === 'QoL' || t.includes('QoL'));
  const qolOk = await page.evaluate((idx) => {
    const nav = document.querySelector('[role="dialog"]:has(> nav) > nav');
    const btns = nav.querySelectorAll('button');
    if (!btns[idx]) return false;
    btns[idx].click();
    return true;
  }, qolIdx === -1 ? 2 : qolIdx);
  await page.waitForTimeout(800);

  if (qolOk) {
    const rememberRow = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.dsh-qol-row')];
      const row = rows.find(r => r.textContent.includes('设置页记忆页签'));
      if (!row) return { found: false };
      return { found: true, checked: row.getAttribute('data-checked') };
    });
    check(rememberRow.found, 'settings-remember-tab row found in QoL section');
    check(rememberRow.checked === 'false', 'settings-remember-tab is OFF by default');

    // 开启「设置页记忆页签」
    await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.dsh-qol-row')];
      const row = rows.find(r => r.textContent.includes('设置页记忆页签'));
      if (row && row.getAttribute('data-checked') === 'false') {
        const sw = row.querySelector('.dsh-qol-switch');
        if (sw) sw.click();
      }
    });
    await page.waitForTimeout(400);
  }

  // 选一个目标页签：优先选择 General 或第一个非 QoL 页签
  const targetIndex = tabNames.findIndex(t => !t.includes('QoL'));
  const selectIndex = targetIndex !== -1 ? targetIndex : 0;
  const selectTabName = tabNames[selectIndex];
  console.log(`Selecting tab [${selectIndex}]: "${selectTabName}"`);

  await page.evaluate((idx) => {
    const nav = document.querySelector('[role="dialog"]:has(> nav) > nav');
    const btns = nav.querySelectorAll('button');
    btns[idx].click();
  }, selectIndex);
  await page.waitForTimeout(800);

  // 检查 localStorage 是否保存
  const storedTab = await page.evaluate(() => {
    try {
      return JSON.parse(window.localStorage.getItem('dsh.qol.settings-tab'));
    } catch (e) {
      return null;
    }
  });
  console.log('Stored tab after click:', storedTab);
  check(storedTab && (storedTab.label === selectTabName || storedTab.index === selectIndex), `Tab "${selectTabName}" recorded into localStorage`);

  // 5. 点击右上角关闭按钮关闭设置弹窗
  console.log('Closing settings dialog via top-right close button...');
  const closed = await page.evaluate(() => {
    const header = document.querySelector('[role="dialog"]:has(> nav) > nav + div > div:first-child');
    if (!header) return false;
    const btns = header.querySelectorAll('button');
    // 关闭按钮通常是最后一个按钮或含有 aria-label="Close" / 包含 X svg
    const closeBtn = btns[btns.length - 1];
    if (closeBtn) {
      closeBtn.click();
      return true;
    }
    return false;
  });
  check(closed, 'Clicked close button in header');
  await page.waitForTimeout(1000);

  const dialogAfterClose = await page.evaluate(() => !!document.querySelector('[role="dialog"][aria-modal="true"]:has(> nav)'));
  check(!dialogAfterClose, 'Settings dialog successfully closed');

  // 6. 重新打开设置弹窗，验证是否自动恢复为上次选中的页签
  console.log('Reopening settings dialog to verify tab restoration...');
  await page.evaluate(() => {
    const railSettings = document.querySelector('button.VOzbGW_rail, button[class*="VOzbGW_rail"]');
    if (railSettings) {
      railSettings.click();
    } else {
      const btns = [...document.querySelectorAll('button')];
      const settingsBtn = btns.find(b => b.textContent.trim() === 'Settings' || b.className.includes('VOzbGW_trigger'));
      if (settingsBtn) settingsBtn.click();
    }
  });
  await page.waitForTimeout(1500);

  const restoredInfo = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]:has(> nav)');
    if (!dialog) return { opened: false };
    const nav = dialog.querySelector('nav');
    const activeBtn = nav ? nav.querySelector('button[aria-current="true"]') : null;
    return {
      opened: true,
      activeTabLabel: activeBtn ? activeBtn.textContent.trim() : null
    };
  });
  console.log('Restored Info:', JSON.stringify(restoredInfo));
  check(restoredInfo.opened, 'Settings dialog reopened');
  check(restoredInfo.activeTabLabel === selectTabName, `Restored tab matches saved tab ("${restoredInfo.activeTabLabel}" === "${selectTabName}")`);

  // 截屏留存
  await page.screenshot({ path: 'e2e/settings-test.png' });
  console.log('Screenshot saved to e2e/settings-test.png');

} catch (err) {
  console.error('Test error:', err);
  fail++;
} finally {
  await browser.close();
}

console.log(`=== Test Finished: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
