# dsh-mobile-qol 交付总结

日期：2026-09-15 · 状态：待上线部署（4176 验证全绿）

## 交付物

- `<插件项目目录>/` — 插件本体
  - `lib/client.js`（562 行）：6 功能 + 设置页开关 UI + 持久化
  - `lib/index.js`：host 半（空 apply）
  - `package.json` / `cordis.patch.yml`
  - `e2e/mobile.mjs`（Phase-1）+ `e2e/integration.mjs`（Phase-2）
  - `README.md`
- 文档：`docs/features/260915-mobile-qol/`（research 821 行 / plan / validation / 本 summary）

## 功能（6 项，均可独立开关，默认全开）

1. **侧栏滑动开合（全屏范围）**：PointerEvents 阈值触发（64px），**屏幕任意位置可触发**（按钮上滑动安全，不误触 click），左缘 16px 让位系统返回，跳过输入控件/横滚区/modal 打开时，方向锁，passive 不抢滚动
2. **设置页全屏重写**：`:has(> nav)` 结构锚 + 100dvh + 标签横滚 + 塌宽修复 + safe-area
3. **输入法/键盘适配**：viewport meta 扩展 + 100dvh 链 + 16px 输入字号 + 安全区 + iOS visualViewport 兜底（enable/disable 可完整还原）
4. **按钮触摸反馈**：touch-action + tap-highlight 关闭 + `:active` 反馈 + 44px 命中区 + iOS :active 修复 + reduced-motion 尊重
5. **代码块/表格内滚**（bonus）
6. **弹窗居中重锚**（bonus）

## 验证结论

- Phase-1（mock harness @ 4175 真实 DOM）：移动 19/19、桌面零影响 9/9
- Phase-2（4176 临时实例真插件）：14/14，含真实 layout 服务手势、开关 UI 点击翻转、localStorage 持久化（刷新保持）、断言截图 modlens 核验无 glitch
- dsh-web-mobile-fix 移除后重跑：14/14，无体验缺口（其为设置页 CSS 子集）

## 部署变更（线上 4175）

1. `~/.dsh/profiles/web/package.json`：
   - `dsh.profile.bundles` 新增 `"dsh-mobile-qol"`、移除 `"dsh-web-mobile-fix"`
   - `dependencies` 新增 `"dsh-mobile-qol": "link:<插件项目目录>"`（`dsh-web-mobile-fix: ^1.0.2` 依赖行**保留未动**，包仍在 node_modules）
2. `pnpm install` 已执行（symlink 就位）
3. 重启 4175 生效（setsid 延迟 detach 方式）

## 回退路径

**回退 dsh-mobile-qol（禁用插件）**：
- 浏览器内：设置 → 移动 QoL → 关闭任意功能（最细粒度）
- 移除插件：编辑 `~/.dsh/profiles/web/package.json`，从 `dsh.profile.bundles` 删掉 `"dsh-mobile-qol"` 行，然后 `supervisorctl restart dsh`（或 setsid 方式）

**恢复 dsh-web-mobile-fix**：编辑 `~/.dsh/profiles/web/package.json`，在 `dsh.profile.bundles` 数组中（原位置 `@xmanrui/dsh-im` 与 `dsh-shortcuts` 之间）重新加回一行 `"dsh-web-mobile-fix"`，重启 dsh。包未卸载（依赖行保留），无需重新安装。

**回退用户配置**：浏览器 localStorage 删 `dsh.mobile-qol.v1`（或逐项开关）。

## 遗留 / 建议

- 真机（iOS Safari / Android Chrome）实机验证触摸手感与 IME 行为——本环境以合成事件 + Firefox 引擎验证逻辑，真机感受需人工确认
- `popover-recenter` 针对 composer 菜单与 session header 动作菜单；其他弹窗如需重锚可扩展 CSS 段
- dsh 0.1.5 若改 `data-sidebar-collapsed` 属性名，`sidebarOpen()` 已做双识别（`data-rightbar-collapsed`）
