# dsh-qol 发布准备 — 总结

日期：2026-09-17 · 状态：检视问题全部修复 + e2e 复验全绿，待用户实机验证与发布指令

## 交付内容

四项任务（用户 2026-09-17 14:58 提出）：

1. **删除弹窗居中重锚（popover-recenter）**：用户判定无用。移除 FEATURES 注册表条目、CSS 四组规则（hero 重锚、active 态宽度/z-index、backdrop-filter 消解、portal safe-area）、相关注释与 README 行。`docs/issues/260916-mobile-dropdown-position/` 历史记录保留不动。
2. **Tab Bar 鼠标中键关闭**：`.astb-tab` 增加 `onMouseDown`（button===1 preventDefault，抑制浏览器自动滚动光标）+ `onAuxClick`（button===1 → 既有 handleClose）。auxclick 不产生 click 事件，不会误触切换。hint 文案更新。
3. **项目改名 dsh-mobile-qol → dsh-qol**（搜索替换）：
   - 目录 `/root/projects/dsh-mobile-qol` → `/root/projects/dsh-qol`（旧路径留兼容软链至本会话结束）
   - `package.json` name、`cordis.patch.yml`（id: qol / name: 'dsh-qol'，遵循 wait-subagent/whip 的 id 约定）
   - client.js：模块 id、localStorage 三键（dsh.qol.v1 / .opentabs / .settings-tab）、style 标记、日志前缀、设置分区 id/label（"移动 QoL"→"QoL"）
   - e2e 全部引用、README
   - profile：bundles/dependencies + pnpm install；workspace.json 注册项路径与标题
   - **docs/ 历史文档有意不改**（历史记录保留当时的名字）
4. **发布准备**：version 1.0.0、MIT LICENSE（John Walks Slow）、repository/bugs/homepage（github.com/john-walks-slow/dsh-qol）、exports 补 ./cordis.patch.yml、files 补 README+LICENSE、.gitignore、README 重写（13 功能表 + 安装说明 + 状态动画等补齐条目）。

## 验证

- `node --check lib/client.js` 通过。
- Phase-1 mobile **19/19**、desktop **9/9**（4175 真实页面 mock eval；desktop 断言 touch-action 非 manipulation，媒体查询不命中）。
- Phase-2 integration **18/18**（4176 临时实例 `dsh web --patch /tmp/enable-qol.yml`，含中键关闭端到端用例）。
- 顺手修复：e2e 手势用例派发 PointerEvent 但插件监听 Touch Events（历史失效），改为 TouchEvent 派发后对真实 layout 服务验证通过。
- 检视后复验：三套 e2e 重新全绿（19/19 + 9/9 + 18/18）。

## 检视与修复（reviewer 报告：260917-qol-release.review.md）

首轮结论**不准入**（BLK-01 阻塞），逐项修复后复验通过：

- **BLK-01（阻塞）** e2e 硬编码 4175/4176 实例真实 token（4175 经 Cloudflare 命名隧道映射公网 `<dsh-host>`，发布即凭据泄漏）→ 全部改为环境变量 `DSH_E2E_TOKEN_4175` / `DSH_E2E_TOKEN_4176`（缺失即报错退出），README 开发节补说明；提交前全仓扫描确认无 token 残留。**发布前建议轮转线上 token（随重启自然轮转）**。
- **REC-01** handleClose 关当前 tab 引发切换时缺 `_armSuppress()` → 已补（中键/× 关当前 tab 后不再误拉输入法）。
- **REC-02** 历史命名残留 `dsh-mq-*` 类名与 `_mq-state-pulse` 关键帧 → 统一 `dsh-qol-*` / `_qol-state-pulse`，e2e 选择器同步。
- **REC-03** README 与 client.js 注释对 dsh-web-mobile-fix 共存策略表述冲突 → 统一为"可共存、互补、并集安全"（与实际部署一致；用户 09-15 曾刻意恢复 mobile-fix）。
- **NBL-02** 弱断言 `>= 11` → `=== 13`；过期注释清理。
- **NBL-01**（localStorage 旧键迁移）不修：1.0.0 首发无存量用户，遵循"上线前不做兼容"原则。

## 关键发现与过程记录

- **loader entry 语义**：combo URL 与 `__ModuleLoader__.load` 的 id = 包名（`/plugins/<pkg>/client.js`），cordis.patch.yml 的 `id` 是 loader 行 id、`name` 必须等于包名。
- **e2e 中键用例的三次修正**：① `[role=treeitem]` 混含 `_projectRow`（项目组行）与 `_sessionRow`，需按类名过滤；② 空白 "New Session" 会话在导航离开后被宿主销毁，造双 tab 需两次切换到真实会话；③ 项目组展开状态 `aria-expanded` 不可靠（当前组默认展开也显示 false），用"已尝试名单"跳过点过的组。
- **并发写入方**：profile `package.json` 由 dshmarket/GUI 活跃管理（本次观察到 15:19 的外部改写与 15:23 的外部触发重启）。改 profile 需原子写并复查。
- **15:19 另一会话在用户层禁用了本插件**（`~/.dsh/profiles/web/cordis.patch.yml`: `- id: qol, disabled: true`，注释"2026-09-17: 禁用 dsh-mobile-qol"）。当前线上 4175 实例：新包名已生效但处于禁用态（无 tab bar/移动优化）。线上重新启用需用户决定 + 重启。
- **临时实例启用法**：`dsh web --patch <overlay.yml> --port 4176 --no-open`（--patch 须在 --port 之前；overlay 写 `disabled: false` 覆盖用户层）。
- 4176 临时实例与 4175 共享 ~/.dsh 存储（会话数据互通），e2e 切换会话对线上无副作用；空白会话导航后自动销毁是宿主行为。

## 遗留事项

- ~~线上是否重新启用 dsh-qol~~ **已处理（16:50 用户指示：移除禁用、不重启）**：用户层 disable 补丁已从 `~/.dsh/profiles/web/cordis.patch.yml` 移除，dump-config 确认组合树中 dsh-qol 无 disabled 标记。当前运行中的 4175 实例不受影响（未重启），**下次自然重启时插件自动恢复**。恢复后 localStorage 用新键 `dsh.qol.v1`（开关回默认全开）。
- npm publish / GitHub 建仓推送：用户指示暂不发布；本地 git 仓库已就绪（3 commits，工作树干净），随时可执行。
- 用户实机验证清单：`260917-qol-release.validation.md`（中键关闭需桌面真实鼠标；弹窗移除效果需手机验证）。

## 追加 — Tab Bar 第二轮调整（18:31 需求，20:4x 交付）

1. **＋按钮 Chrome 式跟随**：`.astb-controls`（＋）从 bar 末尾移入 `.astb-tabs-container` 内、tabs 之后——未满时紧跟最后 tab，溢出时随滚动容器移动。
2. **新会话标题**：新增 `sessionTitle()`——`sess.blank` 时显示「新会话」（宿主 displayTitle 会回退成工作区名）；tab 与 rail 两处统一。
3. **末位 tab 不可关**（README 17:32 规格，另一会话按用户意图写入）：`handleClose` 剩余可见 tab 为 0 时直接 no-op；仅剩一个 tab 时不渲染 ×。避免关最后一个 tab 只会空转出一个新空白会话。
4. **handleNew 补 `_armSuppress()`**：点 ＋ 新建会话同样不拉输入法。

**验证方式调整**：用户指示跳过 e2e。已做线上只读探针（插件加载 ✓、＋在容器内 348px 处而非右缘 1274px ✓、无页面错误 ✓）；其余行为进 validation.md 第 4 节实机清单。e2e 中键用例的未提交扩展已回退（依赖共享 home 真实会话）。

**e2e 遗留技术债**：dev-dsh-plugin 新规范要求 e2e 临时实例用独立 `DSH_HOME`（共享 /root/.dsh 会 seq 对撞损坏会话日志，09-15~17 已损坏 6 份）。`e2e/integration.mjs` 现行版本（切换真实会话造 tab）与隔离 home 不兼容，需改造：隔离实例 + 会话准备策略（发消息造非 blank 会话）。本日 3 轮共享 home Phase-2 已扫描线上日志，无 `corrupt session log / refusing append` 记录，未触损伤。
