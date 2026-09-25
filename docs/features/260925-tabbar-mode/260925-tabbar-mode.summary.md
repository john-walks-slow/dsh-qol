# 标签栏加号固定右侧 + 显示模式配置 — 总结

日期：2026-09-25 · 状态：13:04 修订三轮检视准入 + e2e 53/53 全绿，待用户实机验证

## 需求（用户 2026-09-25 提出）

1. 标签栏的加号固定在右边，而不是放在内容滚动容器最后。
2. 标签栏支持配置显示内容：**标准**（现有行为）或**最近活跃**（去掉关闭功能，始终按状态与最近活跃时间排序）。

用户确认的设计决策（ask_user_question）：

- **排序语义**：两区分区。彩色状态（黄待处理/绿完成未读/蓝运行中，三色不分色混排）整体在前、灰色空闲在后；**区内方向相反**（2026-09-25 12:37 用户二次确认调整）：彩色区**最旧最左**（挂起最久的 FIFO 处理队列），灰色区**最新最左**（最近用的好够到）。初版两区同为最新在前，用户提出"彩色区最左等于最旧"后调整。
- **显示范围 = 所有主会话**：不依赖手动打开过；所有非归档、非 subagent、非 blank 主会话自动上榜，上限 12，超限保当前会话可见。

## 交付内容

全部改动在 `lib/client.js`（约 +230/-60）+ 新增 `e2e/tabbar-mode.mjs`：

1. **加号固定右侧**：`.astb-controls`（+按钮）从 `.astb-tabs-container` 滚动容器内部移出，改为 `.astb-bar` 直接子元素（滚动容器之后）；标签溢出时在容器内滚动，+ 始终可见。
2. **显示模式配置**：`config["active-tabbar-mode"]`（`"standard"` | `"recent"`，默认 standard）存于同一 localStorage blob（`dsh.qol.v1`）；`defaults()` 显式声明默认值，`loadConfig` 布尔循环排除该键防污染 + 白名单校验。
3. **最近活跃模式**：
   - 候选 = 全部非归档主会话（isReal 过滤 blank 未使用）；
   - 排序 = rankOf（彩色任一 → 0 / idle → 1）；彩色区 updatedAt **升序**（最旧最左），灰色区 updatedAt **降序**（最新最左）；截断 MAX_TABS=12 且保 current；
   - 无 × 关闭按钮、onAuxClick 关闭屏蔽（onMouseDown 中键 preventDefault 恒开，防 autoscroll 光标）；
   - 黄色状态指示点 `.astb-indicator-slot.warning`（宿主 `--dsw-alias-state-warn-primary`），来自 `useSessionPendingInteraction` slot prop（null-safe 降级）；title 加 `[待处理]`。
4. **设置 UI**：QoL 面板 active-tabbar 行下新增 ModeRow 分段选择器（仅开关开启时显示），样式提炼为 `.dsh-qol-moderow` / `.dsh-qol-mode-btn` CSS 类。
5. **既有隐患修复**（本次顺手）：
   - ActiveSessionsOverlay 早期 return 在 hooks 之前——运行时切换 feature 会触发 React hook 数量不匹配崩溃；现所有 hooks 无条件执行后再 return null。
   - 设置面板改配置不触发 tab bar 重渲染（要等下一次 store 变化）；新增 `_configListeners` + `notifyConfigChange()` 订阅机制即时重渲染。
   - feature 关闭后空宿主条残留（border 背景仍在）；新增 `html:not([data-qol-active-tabbar="on"]) .qol-tabbar-host { display:none }` 属性闸即时隐藏。
   - 死代码清理：getFirstChar、runningCount、unreadCount。

## 宿主事实（调研结论，写代码前核实）

- 会话状态色（宿主 StateDot / sessionStatuses）：`pendingInteraction`（approval/plan-review/question）→ 黄；`completed` → 绿（用户查看后宿主自动清除）；`running` → 蓝；其余 → 灰。
- `shell.overlay` slot 组件自动注入 standardProps：`useSessions` / `useWorkspaces` / `useSessionPendingInteraction`。
- `updatedAt` 为数字时间戳（宿主 byRecency 用减法比较）；pendingInteraction snapshot 为 Map-like（`.get(id)`）。

## 验证

- `node --check` 通过（无构建步骤）。
- E2E `e2e/tabbar-mode.mjs`（4188 e2e 实例，camoufox headless，移动 viewport）**32/32 全绿**：
  - + 结构断言（不在滚动容器内、bar 直接子元素、右缘 0px）；
  - 模式行 UI（标准/最近活跃按钮、提示文案随模式变化）；
  - recent：12 tab 全量上榜、0 关闭按钮、排序与侧栏 recency 前缀一致、reload 持久化；
  - standard：点开 tab 后恢复关闭按钮；
  - toggle off/on：属性闸即时隐藏、无 React hook pageerror；
  - 指示点类名白名单。

## 检视与修复（reviewer 报告：260925-tabbar-mode.review.md）

首轮**不准入**（BLK-01），修复后二轮**准入**：

- **BLK-01（阻塞）** 首版排序实现为严格分级（黄>绿>蓝>灰），偏离用户确认的"不分色混排" → rankOf 改为彩色统一 0 / idle 1，同级 updatedAt 降序混排。
- **SUG-01** e2e 补排序方向断言（recent tab 序 vs 侧栏 recency 序前缀一致，种子会话全 idle 时混排退化为纯时间降序）。
- **SUG-02** defaults() 显式 `o[MODE_KEY]="standard"` + loadConfig 布尔循环排除 MODE_KEY。
- **NON-01** recent 模式保留 onMouseDown 中键 preventDefault（防 autoscroll 光标），仅屏蔽 onAuxClick 关闭。
- **NON-02** ModeRow 内联样式提炼为 CSS 类（data-active / data-mode 属性选择器）。

## 已知边界

- 排序的彩色区分支（方向升序）无法在 e2e 中伪造（需真实运行/待审批会话），由代码检视保证；idle-only 退化路径已由 e2e 覆盖灰色区降序方向。
- `_sessionRow` class（switch-collapse 的行识别）在当前宿主前端已不存在——既有问题，与本次改动无关，留待后续单独处理。

## 追加调整（2026-09-25 12:37 用户反馈）

用户提出"彩色区最左等于最旧，灰色区最左等于最新"：彩色区改为 updatedAt 升序（挂起最久的 FIFO 队列感），灰色区保持降序。comparator 分区取反方向，README/设置提示/验证文档同步更新，e2e 复跑 32/32 全绿（改动 <20 行、风险极可控，按工作流跳过二次检视）。

## 追加调整（2026-09-25 13:04 用户反馈：两模式收敛）

用户原话："这两个模式不要再区别这么大了……（最近活跃）也仍然遵循那个页签的打开关闭状态，也而且也可以关闭 tab，区别仅仅在于排序一个是按照打开的顺序一个是按照活跃"。

修订（仅 lib/client.js 约 ±50 行）：

1. **页签集合同源**：两种模式共用同一套 `openTabs`（打开/关闭状态、MAX_TABS 窗口）。recent 模式删除"全部主会话自动上榜 + 截断保 current"逻辑，回归标准模式的 `openTabs ∩ validSessions ∩ isReal` 过滤。
2. **关闭恢复全模式可用**：× 按钮与 onAuxClick 中键关闭不再按模式屏蔽；顺手把误导性 tooltip "归档/关闭会话" 修正为 "关闭页签"（行为本来就只关页签、不归档，v1.0.0 遗留文案）。
3. **关闭当前页签的落点**：标准 = 剩余中最后打开的（最右）；recent = 剩余中 updatedAt 最大（最近活跃）的——与该模式自身的排序语义一致。
4. **排序保持 12:37 确认语义不变**：彩色区（黄/绿/蓝混排）升序最旧最左，空闲区降序最新最左。
5. ModeRow 提示文案与 README（中/英）同步改写为"同一组可开可关的页签，仅排序不同"。
6. e2e 重写为侧栏自适应播种（跳过新会话 blank 行、抗 byRecency 重排、按标题多重集差分检测新 tab），**53/53 全绿**：断言标准序 = 出现顺序、recent 序 = 侧栏位置严格递增（种 4 个 tab）、recent 内关闭当前页签的落点 = 剩余最近活跃（与标准落点规则可区分）、关闭非当前页签持久化、切模式集合不变、reload 持久化、openTabs id 包含性（session- 前缀归一化）、toggle 无 pageerror。

### e2e 实例并发事故记录（教训）

13:10 左右 e2e run 2 出现"reload 后旧代码复活"（12 tab 无关闭按钮 = 修订前行为）+ 播种异常（3 次点击只种出 2 个 openTabs）。排查结论：

- 宿主 bundle 服务为**内存 rev 图**（`bundleResource` 只从 `responses`/`previousBatchResponses` 按 rev URL 服务），文件变更唯一入口是 client-hmr 插件的 500ms stat-poll 调 `rebuilt()`——关 HMR 不能解决问题，只会让实例冻结在启动快照、改码必须重启。
- 真因是并发 agent（jump-user-msg 开发）同一时间在共享 4188 实例上跑它自己的 e2e（会话状态互踩 + 侧栏 byRecency 重排导致播种错位），且 13:13:29 有外部写盘 lib/client.js（疑似 stash 类瞬时回退工作树窗口，我的改动当时未提交，reload 撞上吃到无修订版本）。
- 对策：**run 级互斥已结构性落地**（13:52 用户确认后实施，不再依赖模型自觉记得套 flock）：`dsh-e2e run` 子命令（持锁排队 + owner sidecar `/tmp/dsh-e2e-run.owner.json`）+ `e2e/lib/run-guard.mjs` 脚本自 guard（裸跑 self-reexec under flock，tabbar-mode.mjs 已接入并 53/53 复验）+ dsh-e2e skill 并发协议第 5 条 + e2e/AGENTS.md 模块指引；锁 `/tmp/dsh-e2e-run.lock` 与实例锁 `/tmp/dsh-e2e.lock` 两层勿混用。**改动过完 e2e 后尽快提交进 HEAD**，让对方 stash/checkout 瞬时回退只会回到含我代码的 HEAD。
