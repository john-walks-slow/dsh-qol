# 上一条用户消息按钮 — 总结

日期：2026-09-25 · 状态：实现完成，e2e 通过，待用户实机验证

## 需求（用户 2026-09-25 提出 + 后续反馈）

> 新功能：右下角 scrolltobottom 上面加一个跳转到上一条用户消息按钮。

后续反馈（均已采纳）：
- **变扁修复**：按钮被 0 高 sticky 插槽的 column flex 压扁 → 改独立 anchor。
- **底部也可点**：宿主 to-bottom 按钮在滚动到底部时整个插槽 unmount，跳转按钮必须常驻、滚到底也能点；且**再点一次就跳到更上一条**。
- **翻到最顶**：若视口上方已无用户消息（长对话顶部是长段助手开场），再点则翻到最顶上而非停在原地。
- **懒加载窗口（2026-09-25 追加）**：长 agent 会话的历史是懒加载的，当前 DOM 可能一条用户消息都没有——按钮曾被 `:not(:has(user))` CSS 误隐藏（用户实测消失）。显示条件改为**"内容可滚动即显示"**；DOM 无用户消息时点击 = 翻到最顶（向上滚动顺带触发宿主懒加载更早历史）。
- **中滚 clamp no-op（2026-09-25 二次复现）**：用户位于 B"顶对齐"（C 在视窗下半）点击无反应，手动微上滑后再点才到 A。根因：落点偏移把 B 的顶放在 `viewTop+16`——恰为对齐窗口上边界，亚像素漂移即出窗；此时 C 的顶在阅读中心之上 → 焦点选 C，"跳焦点前一条"=B，落点≈原地 → 向上守卫吃掉点击。修复：walk 分支落点会 clamp 时**继续往前再走一条**（与 D6 底部短尾巴同族，"点击永不 clamp 成 no-op"承诺补全到中滚）。
- **图标**：改用宿主同款实心 chevron（向上镜像，fill 实心 14px），替代人像图标。
- **顶对齐语义（最终定稿）**：只有顶对齐的消息才算"现在这一条"；没顶对齐时点击先把这一条滚到顶，顶对齐后再点才跳到上一条。同时修复：顶对齐点击无反应（旧逻辑把当前条当目标）与消息间距小+轻微滚动后连跳两条。

## 交付内容

全部改动在 `lib/client.js` + 新增 `e2e/jump-user-msg.mjs`：

1. **FEATURES 配置**：nav 组新增 `jump-user-msg`（label「上一条用户消息按钮」，default true，kind mixed）。
2. **布局（v2 anchor 方案）**：不再往宿主插槽注入。注入独立的 `div.dsh-qol-jump-anchor`（`position:sticky; bottom:calc(var(--dsh-composer-height,152px) + 58px); height:0; display:flex; justify-content:flex-end; pointer-events:none; z-index:8`），内部 `.dsh-qol-jump-user` 按钮 34×34 `flex:none` + `margin-top:-34px` + `pointer-events:auto`，叠在宿主按钮上方 8px（58 = 宿主 bottom 16 + 按钮 34 + 间距 8）。
   - **水平对齐（v3 修复）**：宿主按钮并不贴列右缘——`EvIC1a_scroll` 有 `padding:16px 32px`、插槽还有 `padding-right:max(0px, 50% - 340px)`（按钮右缘锚定在"列中心 + 340px"），宽窗口下距右缘上百像素；而 anchor 直挂 scroller（无 padding），`flex-end` 会把它顶到最右。`syncJumpX()` 实测 scroller 右缘与宿主按钮右缘的偏移，镜像为 anchor 的 `padding-right`（内联样式）；偏移缓存，宿主插槽在底部 unmount 后按钮保持同一 X；首次无实测值时按宿主公式兜底 `max(32, scrollerWidth/2 - 340)`。resize 与 body MutationObserver（rAF 去抖）都会重同步。
   - **底部常驻**：CSS `:has([class$="_toBottomSlot"])` 反向——宿主插槽存在时偏移 58px（按钮下方还有宿主按钮），宿主插槽因 atBottom unmount 时偏移降为 16px（占住宿主按钮自己的位置），保证**任何滚动位置都可见可点**。
   - **显示条件（v4 懒加载修复）**：不再用 CSS `:not(:has(user))` 隐藏（懒加载窗口误伤）。`syncJumpButton` 开头判定 `scroller.scrollHeight <= scroller.clientHeight` → 移除 anchor 并返回（hero/空白新会话不可滚，sticky 无吸附空间会漂在内容流末尾）；可滚动 → 注入。`jumpToPrevUserMsg` 的 `users.length === 0` 分支从 no-op 改为 `scrollTo({top:0})`（reduced-motion 判定同其余落点）。
3. **按钮样式** `.dsh-qol-jump-user`：34×34 圆形（`flex:none` 防压扁），宿主 design token（`--dsw-alias-button-floating-fill` 背景、`--dsw-alias-button-floating-hover` hover、`--dsw-elevation-panel` 阴影），实心向上 chevron（`<svg viewBox="0 0 14 14"><path fill="currentColor" d="M11.8486 8.5L11.4238 8.07617L8.69727 5.34863C…L11.8486 8.5Z"/></svg>`，镜像宿主 IconChevronDownOutline14），aria-label/title「上一条用户消息」。
4. **目标定位** `jumpToPrevUserMsg`（**顶对齐语义**，用户定义）：先找"阅读焦点" = 最后一条 top 在视口中心之上的用户消息。只有它**顶对齐**（top ∈ [viewTop, viewTop+16]，含落点呼吸带）才算"现在这一条"→ 目标为它**前一条**；**未顶对齐 → 先滚到这一条自身的顶**（对齐它，绝不跳过紧邻的上一条）；焦点不存在（视口已在首条用户消息之上）→ 翻到最顶，已在顶则无操作。walk 分支附加 **clamp 守卫**：候选行落点 ≥ viewTop（会 clamp 成 no-op）时继续向前回退一行，直到落点真正上移（首行也 clamp 则翻顶）。落点统一 `scrollTo({ top: max(0, targetTop - 16), behavior: reduced-motion ? 'auto' : 'smooth' })`。此语义同时修复了反馈 bug：①顶对齐时点击不再把"现在这一条"当目标（旧逻辑 0~16px 微滚 = 无反应）；②消息间距小 + 轻微下滚后不再跳过上一条（旧容差带锚定视口顶边，滚动后失效）；③中滚 clamp no-op（见上）。
5. **注入与联动**：`syncJumpButton` 每次会话切换重新注入 anchor（防重复）；`removeJumpButtons` 移除；onToggle off 移除按钮 + 监听；`apply()` 注册 disposer；CSS `html:not([data-qol-jump-user-msg="on"]) .dsh-qol-jump-anchor { display:none }` 属性闸兜底。
6. **宿主适配**：`findToBottomBtn` 用 `button[class$="_toBottom"]` + aria-label 含"底部"或 /bottom/i 兜底（CSS Modules hash 前缀可能随版本变，后缀是约定）；滚动容器 `chatScroller()` 优先 `[data-conversation-scroll]`（scrollHeight>clientHeight 时），找不到则从按钮向上找祖先，`return known || null`。

## 宿主事实（调研结论，写代码前核实）

- 宿主回到底部按钮：`[class$="_toBottomSlot"]`（height:0、sticky bottom:16px、flex row、justify-content:flex-end、z-index:8；`[data-conversation-scroll]` 下 bottom 抬升 composer 高）+ `button[class$="_toBottom"]`（34×34、aria-label=t("chat.toBottom")="回到底部"/"Back to bottom"、`margin-top:-34px` 自身定位、IconChevronDownOutline14）；渲染条件 `!atBottom`——**滚动到底时整个插槽 unmount**。CSS Modules hash 前缀（EvIC1a 等）随版本变化，代码一律用 `[class$=...]` 后缀匹配 + aria-label 稳定锚。
- 用户消息 DOM：`[data-chat-flow-kind="user"]`（ChatView flowItem 上）。
- 滚动容器：普通模式 `[data-conversation-scroll]`（wSkVaW_scrollBody，overflow-y:auto）；composer-overlay 布局为内部 `EvIC1a_scroll`。
- `--dsh-composer-height` 设置在滚动容器元素上，仅其子树可见——独立 anchor 必须挂在滚动容器内才能拿到正确 offset。

## E2E（e2e/jump-user-msg.mjs，目标 4188）

真实发 4 条消息（3 条构造长对话 + 1 条短尾巴回复；mouse.click composer → keyboard.type → 点 Send；等回复完成才发下一条，流式期间 Send 变 Stop generating 不可发）；`page.mouse.wheel` 真实滚动（直接赋 scrollTop 被宿主判定为程序滚动，atBottom 不变按钮不出现）。覆盖：A 属性/样式加载 + **静止不变式"anchor 存在 ⟺ 可滚动"**；B 双用户消息构造；C wheel 上滚后两按钮 34×34（**变扁回归**）+ 8px 间距 + **右缘水平对齐（v3 回归）**；D 两次点击到达第 2/第 1 条用户消息（scrollTop≈contentTop-16，≤4px 误差）+ 第三次点击翻到最顶；D2 wheel 回到底部：宿主按钮隐藏、跳转按钮**仍可见可点**且**X 保持对齐**、点击到达上一条；D6 短尾巴回复底部首点必动（防 clamp no-op）；**D7 懒加载窗口**：剥掉全部 `data-chat-flow-kind` 属性模拟"可滚动但无用户消息行"→ 按钮仍在、点击翻到 scrollTop=0、属性恢复；**D8 中滚 clamp**：按实测几何**动态挑选相邻 (B,C) 消息对并定做视口高度**（回复高度逐轮波动，不可硬编码），把 B 停在窗口外 36px、C 送进阅读焦点（用户复现的精确几何）→ 断言主目标确实 clamp（非空洞）且点击必然上移；E 设置 toggle 关闭后属性与按钮均移除；F 无 page errors。辅助加固：Send 按钮在流式期间被 Stop 替换时重试一次；msg3 提示词要求两千字长文保证 D1-D4 的"最新消息可顶对齐"前提。
