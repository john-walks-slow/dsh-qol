# 检视报告

## 概要

本次为活跃会话 Tab Bar 模式扩展（`active-tabbar-mode`）及“+”新建按钮固定右侧需求的第二轮检视，范围覆盖 `lib/client.js` 与新增 E2E 测试 `e2e/tabbar-mode.mjs`。
重点复核了第一轮检视提出的阻塞问题 BLK-01（排序语义偏离）以及 SUG-01、SUG-02、NON-01、NON-02 的修复质量。
整体评价：修复准确彻底，排序语义严格对齐用户确认决策，状态持久化与组件即时响应链路清晰健壮，E2E 测试覆盖完整（32/32 通过），未引入次生风险与架构债务。

## 需求对齐

1. **加号固定在右侧**：满足需求。`astb-controls` 作为 `.astb-bar` 的直接子节点位于右侧，独立于 `.astb-tabs-container` 滚动容器，横向溢出时加号始终固定可见。
2. **显示模式配置与持久化**：满足需求。新增 `active-tabbar-mode` 配置键（`standard` / `recent`），`defaults()` 显式赋默认值，`loadConfig` 白名单反序列化隔离类型污染，设置面板提供分段选择器且支持运行时联动。
3. **recent 模式排序语义（BLK-01 复核）**：**完全满足需求**。
   - `rankOf` 将彩色状态（`pendingOf(s)` 黄色待处理、`s.completed` 绿色未读、`s.running` 蓝色运行中）统一映射为等级 0，灰色（idle）映射为等级 1。
   - 排序时先按 `ra - rb` 分级，同级内统一按 `(b.updatedAt || 0) - (a.updatedAt || 0)` 降序混排。
   - 完全消除了上一轮严格分级的偏差，切实实现了“黄/绿/蓝三种状态不分色混排在前、灰色在后”的用户确认要求；且保留了超限 12 个时保 `current` 可见的兜底机制。
4. **交互与用户体验细节（NON-01、NON-02 复核）**：满足需求。
   - recent 模式下隐去关闭按钮并取消 `onAuxClick` 关闭绑定；`onMouseDown` 恒定保留 `e.button === 1` 的 `preventDefault()`，有效防止中键点击误唤起浏览器滚动光标。
   - `ModeRow` 控件样式已从内联提取至 CSS 类（`.dsh-qol-moderow`、`.dsh-qol-mode-btn` 等），并使用宿主 design token 保持视觉一致。
5. **E2E 测试覆盖（SUG-01 复核）**：满足需求。
   - `e2e/tabbar-mode.mjs` 补充了 recent 模式 tab 顺序与侧边栏（宿主 `byRecency` 最新在前）前缀一致性校验，以及指示点状态类名白名单断言。
   - 32 项自动化断言全数通过（含加号定位、分段切换、持久化、切回标准模式、开关热重载等）。

## 阻塞问题

无。

## 建议修改

无。

## 非阻塞问题

无。

## 准入结论

**结论**：`准入`

**说明**：第一轮检视发现的核心排序缺陷（BLK-01）及所有建议修改项已全部精准修复，需求对齐度 100%，E2E 测试全绿，架构清晰且无次生隐患，准予合并交付。

---

# 第三轮检视（2026-09-25 13:04 修订：两模式收敛）

## 概要

检视对象：13:04 用户反馈驱动的第三轮修订（未提交工作区改动，基线 9e02c42；README 中英文功能表 cell 改写已随并发 agent 的提交 678ec51 意外入库，一并复核）。范围：`lib/client.js` tabbar 相关 hunk（~±50 行）、`e2e/tabbar-mode.mjs` 整文件重写、docs summary/validation 更新。工作区中 jump-user-msg / workspace-pin 相关未提交改动按任务声明排除在外。

整体评价：三项修订契约全部达成，实现方式是"删代码"而非"加分支"（recent 模式的自动上榜 + 截断保 current 整块删除，统一走 openTabs 过滤），无残留旧逻辑、无旧文案残留（grep 复核零命中）。e2e 重写后断言 48 项，reviewer 本人在 4188 实例独立复跑 **48/48 全绿**（非转述声明），无 pageerror。

## 需求对齐

1. **契约 1 — 共用页签集**：达成。`displaySessions` 统一为 `validSessions ∩ openTabs ∩ isReal`，两模式同源；× 关闭与 `onAuxClick` 中键关闭恒可用（不再按 `isRecent` 屏蔽），`onMouseDown` 中键 preventDefault 防滚动光标恒开；MAX_TABS=12 窗口统一由 openTabs useEffect 的 `slice(-MAX_TABS)` 管理。e2e D/E/F/G 段实测：切模式集合不变、recent 内关闭跨模式持久、reload 持久。
2. **契约 2 — 唯一差异是排序**：达成。recent 分支 comparator 与 f32712b（12:37 用户确认语义）逐字一致——`rankOf`（pending 黄 / completed 绿 / running 蓝 → 0）整体排前、彩色区 `updatedAt` 升序（最旧最左），空闲区降序（最新最左），本轮未偷改；standard = `openTabs.indexOf` 升序。e2e 彩色分支（zone directions verified by code review）由本次人工核对完成：代码方向正确。
3. **契约 3 — 关闭当前页签落点**：达成。standard = `remaining[remaining.length-1]`（openTabs 序最右 = 最后打开）；recent = 遍历取 `updatedAt` 最大（最近活跃）。语义自洽。
4. **MAX_TABS 窗口语义变化**（契约推论，确认符合预期）：旧 recent 窗口按"排序后前 12 + 保 current"；新语义按"最近打开的 12 个 openTabs"。超窗时挂起最久的会话若不在 openTabs 窗口内则不显示——这是"共用同一套打开/关闭状态"的直接结果，符合用户原话。
5. **文案**：tooltip "归档/关闭会话"→"关闭页签"（v1.0.0 遗留误导文案，行为本就只关页签，该修）；ModeRow 两模式提示与 README 中英文 cell 均改为"同一组可开可关的页签，仅排序不同"，中英一致、语义准确；validation.md 新增"最近活跃内关闭/落点/跨模式持久"验证项，覆盖面与实现匹配。
6. **e2e 重写质量**：自适应播种（自愈 byRecency 重排 / 重名 / blank 行），多重集差分检测新 tab；标准序=出现顺序、recent 序=侧栏位置严格递增（全 idle 退化场景）、openTabs 包含性（session- 前缀归一化）断言设计合理且有区分度自检（`ordersDiffer`）。

## 阻塞问题

无。

## 建议修改

1. **SUG-03 e2e run 锁协议自相矛盾且未共享，事故对策实际失效**：`tabbar-mode.mjs:13` 注释用 `/tmp/dsh-e2e-run.lock`，summary 事故记录写 `/tmp/dsh-e2e.lock`，而 dsh-e2e skill 只定义了实例级锁（`dsh-e2e` 包装脚本 + owner.json），无 run 级锁协议；且仓库内其余 e2e 脚本（jump-user-msg.mjs、workspace-pin.mjs、mobile.mjs 等）均无 flock。结论：13:10 并发互踩事故的对策（"e2e 互斥锁协议"）只对 tabbar-mode.mjs 自己生效，其他 agent 看不见这把锁，同样事故必然重演。建议：统一 run 锁名（写 PID+owner+时间），在 dsh-e2e skill 或 e2e 目录 AGENTS/README 中立约，全部 e2e 脚本同步 flock。
2. **SUG-04 关闭当前页签的落点分支无 e2e 覆盖**：本轮唯一新增行为分支（契约 3 的模式分野落点）在 e2e 中零覆盖——F 段刻意选非 active tab 关闭以规避落点。建议补一段：recent 模式下关 active tab，断言落到剩余中 `updatedAt` 最大者（侧栏位置最靠前者），与 standard 落点（最后打开）各一断言。目前仅靠 validation.md 用户实机验证兜底。

## 非阻塞问题

1. **NON-03 ModeRow 提示文案丢失关闭方式说明**：旧 standard 文案含"中键/×关闭"，新两模式文案均未提。README 功能表已有覆盖，信息未丢，但设置面板内自解释性略降，可选补"（×/中键关闭）"。
2. **NON-04 tabbar 文案改动已被 678ec51 意外入库**：README.md / README.en.md 的 tabbar cell 改写随并发 agent 的 workspace-pin 提交（678ec51）一起提交，工作区已无未提交 README 改动。本轮提交时提交面为 lib/client.js + e2e + docs；文案本身检视通过，仅提示提交者知悉，避免后续重复提交困惑。
3. **NON-05 关闭按钮为 `span onClick`**：非 button 元素、无 role/tabindex/aria-label，键盘与屏幕阅读器不可达。v1 既有模式非本轮引入，本轮仅改其 title；顺手项，可留待无障碍专项。

## 准入结论

**结论**：`准入`

**说明**：三项修订契约全部达成，实现为净删除收敛（无新旧双轨残留），旧文案零残留，e2e 48 项断言独立复跑全绿且断言有区分度。SUG-03/04 为流程与测试覆盖债，不影响功能正确性，不阻塞；建议随本轮或下轮顺手修复。
