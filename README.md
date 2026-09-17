# dsh-qol

dsh Web GUI 体验优化（QoL）插件：注入 CSS/JS 优化片段，**每个功能可在设置页独立开关**，即时生效、持久保存。以移动端为主，部分功能（Tab Bar、状态动画等）桌面端同样生效。

## 功能

| 功能 | 说明 | 默认 |
|---|---|---|
| 活跃会话 Tab Bar | 页面顶部横向展示活跃会话 Tab，未读/运行中状态置顶，一键直达，防误拉键盘；**中键或 × 关闭** | 开 |
| 侧栏滑动开合 | **全屏范围**右滑展开、左滑收起侧边栏（64px 阈值触发、不跟手；左缘 16px 让位系统返回手势；输入框/横向滚动区跳过；对话框打开时不响应；按钮上滑动安全——滑动不会误触 click） | 开 |
| 侧栏覆盖不挤宽 | 移动端侧栏以浮层展开覆盖内容，不挤压主区域宽度导致重排 | 开 |
| 侧栏折叠态最近会话 | 侧栏折叠时在搜索下方展示最近活跃会话首字圆形图标，带状态角标 | 开 |
| 切换会话收起侧栏 | 窄屏下在侧栏点选会话后自动收起侧栏，回到对话（仅 ≤768px） | 开 |
| 切换会话不拉键盘 | 切换会话后不自动聚焦输入框、避免输入法弹出；侧栏会话行、活跃 Tab、折叠态 rail 图标、归档跳转全覆盖；直接点输入框仍可手动聚焦 | 开 |
| 输入法/键盘适配 | viewport meta（`viewport-fit=cover` + `interactive-widget=resizes-content`）、`100dvh` 高度链、composer 安全区、iOS `visualViewport` CSS 变量兜底（**不改元素尺寸/字号**） | 开 |
| 按钮触摸反馈 | `touch-action: manipulation`（杀 300ms 延迟与双击缩放）、关闭系统点击灰闪、`:active` 按压反馈、iOS `:active` 修复、`prefers-reduced-motion` 尊重（**不改元素尺寸**） | 开 |
| 设置页全屏重写 | 设置对话框在 ≤768px 下全屏堆叠、标签横滚、修复标签塌宽 bug、safe-area 适配 | 开 |
| 设置页记忆页签 | 打开设置时自动恢复上次选中的页签，避免每次重置回 General | 开 |
| 代码块/表格内滚 | 长代码与表格在容器内横向滚动，正文 break-word 不溢出 | 开 |
| 隐藏权限选择下拉 | 隐藏输入框内的权限（Access mode）下拉触发器，省横向空间；模型选择与上下文用量不受影响 | 开 |
| 状态指示动画优化 | 将 SVG opacity 追逐点动画替换为 CSS transform 脉冲，走合成器线程，零主线程开销。rAF 实测 idle FPS 35→55 | 开 |

## 安装

```bash
npm i dsh-qol
```

然后在 dsh profile 的 `package.json` 中挂载：

```json
{
  "dependencies": { "dsh-qol": "^1.0.0" },
  "dsh": { "profile": { "bundles": ["dsh-qol"] } }
```

重启 dsh 后，设置页会出现 **QoL** 分区。

## 使用

1. 打开 dsh Web GUI（移动端体验最佳）。
2. 设置 → **QoL**：每个功能一行开关，点击即时生效。
3. 配置存于浏览器 `localStorage`（键 `dsh.qol.v1`），仅本浏览器生效。

## 架构

- **纯客户端插件**：host 侧 `apply` 为空；浏览器半通过 `window.__ModuleLoader__.load` factory 加载。
- **属性总闸**：每功能对应 `html[data-qol-<id>]` 属性；CSS 规则与 JS 事件处理都读它——开关 = 打/摘属性，无需重载。
- **桌面零影响**：移动专属规则全部锁在 `@media (max-width: 768px)`；跨端功能（Tab Bar、rail、状态动画）在两端统一体验。
- **结构锚**：CSS 用 `data-slot` / `:has(> nav)` 等结构选择器，零哈希类依赖（状态动画规则的哈希类匹配是**有意例外**，失配只是静默回退，见 client.js 内注释）。
- **形状防御**：所有服务取值 `ctx.get()` + try/catch，任何服务缺失只降级不阻断。

### 与 dsh-web-mobile-fix 的关系

两者**可共存**（当前部署即如此）：dsh-web-mobile-fix 提供紧凑移动布局（32px 会话头按钮、隐藏面包屑等）；本插件提供可开关的 QoL 层（手势 / IME / Tab Bar 等）。设置对话框规则有重叠但视觉等价，并集安全。若不需要 mobile-fix 的紧凑布局，也可单独移除它——本插件的 `settings-mobile` 覆盖其设置页 CSS。

## 开发

```bash
# E2E（需 camoufox + playwright-core，目标为运行中的 dsh 实例）
# token 从环境变量读取（dsh web 启动时打印），避免凭据入库：
export DSH_E2E_TOKEN_4175=<线上实例 token>
export DSH_E2E_TOKEN_4176=<临时实例 token>
node e2e/mobile.mjs mobile     # Phase-1：mock harness 对真实 DOM 的逻辑验证
node e2e/mobile.mjs desktop    # 桌面零影响验证
node e2e/integration.mjs       # Phase-2：4176 临时实例真插件集成验证
```

- 文档：`docs/features/`（research / plan / validation / summary）。
- 新增功能：在 `lib/client.js` 的 `FEATURES` 注册表加一条 + 对应 CSS 段/JS 钩子。

## License

MIT
