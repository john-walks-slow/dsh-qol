# dsh-mobile-qol 验证记录

日期：2026-09-15 · 环境：camoufox headless（Firefox 引擎）390×844 视口 / hasTouch / iPhone UA

## Phase-1 — mock harness 对真实 DOM 逻辑验证（目标：4175 线上实例，不装插件）

以 mock `__ModuleLoader__` + mock ctx 在真实页面 eval 插件源码，验证插件逻辑：

- 移动视口 **19/19 通过**：
  - 加载零报错；`inject: ['slots']`；CSS 标签注入；6 个 `data-qol-*` 属性全部设置
  - viewport meta 扩展（`interactive-widget=resizes-content` + `viewport-fit=cover`）+ `data-qol-viewport-extended` 标记
  - `--app-height` CSS 变量（iOS visualViewport 兜底）
  - 手势：右滑 80px → toggle 调用 1 次；左滑 −80px → 2 次；40px（低于阈值）→ 0；表单控件起点 → 0
  - `html` touch-action: manipulation；`-webkit-tap-highlight-color: transparent` 规则存在（Firefox 不暴露该计算值，改为验证规则文本）
  - 设置对话框（真实打开）：flex-direction: column、宽 390px 全宽、border-radius 0
- 桌面视口（1280×800）**9/9 通过**：属性仍在但 `@media (max-width:768px)` 不命中（html touch-action 保持 auto）——桌面零影响

## Phase-2 — 4176 临时实例真插件集成验证

插件以 link 方式装入 profile，真实 `require("react")`、真实 ctx.slots、真实 layout 服务：

- **14/14 通过**：
  - 真插件加载（style 标签 + 6 属性 + meta 扩展 + app-height）
  - 设置对话框全屏重写（column / 390px / radius 0）
  - 设置页出现「移动 QoL」标签页；面板渲染 6 行开关（label + hint + switch）
  - 点击开关 → `data-qol-sidebar-gesture` 属性即时翻转 + localStorage 写入
  - **手势对真实 layout 服务**：右滑 → `data-sidebar-collapsed` 移除（开）；左滑 → 恢复（关）
  - 全程无未捕获页面错误
- **持久化**：关闭 ime-viewport → 刷新 → 仍关（属性缺失、meta 还原为原始内容）、其余 5 项不受影响、storage 保留
- **断言截图**（modlens 视觉核验）：
  - `final-1-default.png`：56px 图标 rail + 主内容可读（原生 narrow 布局）
  - `final-2-qol-panel.png`：全屏设置页、横滚标签、6 行开关全部渲染、标签无塌陷、无视觉 glitch
  - `final-3-sidebar-open.png`：手势展开侧栏，会话列表完整可读

## dsh-web-mobile-fix 移除验证

- 4176 实例在移除 dsh-web-mobile-fix 后重启：boot manifest 60 条目（mobile-fix 缺席、mobile-qol 在列）
- 全部 Phase-2 用例重跑 **14/14 通过**——原生 narrow 布局（56px rail 折叠 / 展开挤压）与 mobile-fix 在位时一致，无体验缺口
- mobile-fix 全部功能为设置对话框 CSS（75 条 `!important`，≤700px），本插件 `settings-mobile` 为其严格超集（≤768px + safe-area + aria-current + 标签塌宽修复）

## 已知限制

- 手势以合成 PointerEvent 验证（逻辑层）；真机触摸的跟手感受需实机确认（本插件不做跟手，阈值触发）。
- `-webkit-tap-highlight-color` 效果需 WebKit/Chromium 真机确认（Firefox 不支持该属性，规则存在即可，无副作用）。
- `:has()` 选择器需浏览器支持（Firefox 121+、Chrome 105+、Safari 15.4+；camoufox 支持）；不支持时设置页/弹窗重锚规则整段不命中，回退原生样式。

## 追加 — 全屏范围手势（2026-09-15 用户反馈后，线上 4175 实测）

用户反馈"侧栏滑动开合改成全屏范围的"→ 移除 `gestureShouldSkip` 中的 `button` 跳过（滑动不会误触 click），hint 改为"全屏范围右滑展开"。源码即改即生效（rev 内容哈希，刷新加载，无需重启 dsh）。

线上 4175 实测 **13/13 通过**：
- x=60 / x=195 / x=340（左/中/右）右滑均展开
- 从 composer 按钮上起滑可展开（button 不再跳过）
- 侧栏展开时在 New Session 按钮上左滑可关闭（侧栏内也全屏响应）
- textarea 起滑仍被跳过（输入保护）
- 设置页 hint 显示"全屏范围"
- 无页面错误

## 追加 — tabbar/rail 切换也防拉键盘（2026-09-16）

用户反馈"sidebar 或 tabbar 切换时防止输入法弹出"。原 `switch-nofocus` 只覆盖侧栏会话行点击，tabbar tab / 折叠态 rail 图标点击绕过了抑制窗口。改动：

1. **抑制状态提为模块级共享**（`_suppressUntil` / `_armSuppress` / `_isSuppressed` / `_clearSuppress`），并集中宽度门（`matchMedia(max-width:768px)`）与 `switch-nofocus` 属性门。
2. overlay 的 `handleOpen`（tabbar tab / rail 图标）与 `handleClose`（归档后宿主跳转）在调用宿主服务前先 `_armSuppress()`。
3. 直接点 composer 的 pointerdown 仍会清窗（`_clearSuppress`），手动聚焦不受影响。

线上 4175 实测（`e2e/verify-real.mjs`）**14/14 通过**：
- 插件实时生效（link 包内容哈希刷新加载）；tabbar 24 个 tab、rail 图标、composer（contenteditable）均渲染
- baseline：宿主加载即自动聚焦 composer（正是要抑制的行为）
- **点击 tabbar tab 切换会话 → composer 未聚焦**（输入法不弹）✓
- **点击侧栏会话行切换 → composer 未聚焦** ✓
- 直接聚焦 composer 仍成功（抑制窗被 pointerdown 清除，手动输入不受影响）✓
- 全程无页面错误

Phase-1 回归（`e2e/mobile.mjs mobile/desktop`）：mobile 17/19（2 个失败为手势测试用 PointerEvent 合成而实现已改 TouchEvent 的历史测试漂移，与本次改动无关）、desktop 9/9。

已知测试基建问题：`e2e/mobile.mjs` 手势用例仍 dispatch PointerEvent，需后续统一为 TouchEvent（独立任务）。
