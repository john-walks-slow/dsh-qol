# 到顶自动加载更早 — 总结

日期：2026-09-25 · 状态：实现完成，待用户实机验证

## 需求（用户 2026-09-25 提出）

> 加一个新功能：如果说滚到顶部那种情况，自动触发加载更早。

背景：长会话历史是懒加载的（260925-jump-user-msg 的懒加载窗口问题即源于此）。宿主在 `hasMore`（更早历史未加载）时于消息列表顶部渲染「加载更早」药丸按钮，需手动点击。

## 宿主机制（dsh-client-ui-chat 调研结论）

- 按钮：`hasMore && <div class="…_older"><button disabled={loadingOlder} onClick={loadOlderAnchored}>`，位于消息列表最前。
- `loadOlderAnchored()`：锚定当前首个可见行（`pagingAnchor` + `anchorRef`）→ `loadOlder()` 拉取更早窗口 → 前插（`prepend(entries, hasMore)`，见 dsh-client-ui-conversation 窗口模型）→ 锚行还原回原视口位置，视口不跳。
- `disabled: loadingOlder` 天然防并发重复点击。

## 实现（lib/client.js，零 CSS）

`installAutoLoadEarlier`：document **捕获阶段** scroll 监听（scroll 不冒泡但 capture 全可见，普通/`composer-overlay` 两种布局的聊天 scroller 都覆盖，零元素跟踪）：

1. `scrollTop > 1` → 重新就绪（armed=true），清掉未决定时器。
2. 停到顶（≤1px）且已就绪 → 150ms settle 定时器（平滑滚动中途事件不打断即判定未停稳），仍 在顶 → `querySelector('div[class$="_older"] > button')`，存在且未 disabled → **自动 click**，armed=false。
3. 单发语义：每次"到顶"只触发一次，滚动离开顶部后重新就绪——不会连环自动加载整个会话历史；加载完成锚定还原后 scrollTop 必然 >1，自然重新就绪。

非聊天 scroller（代码块横向滚等）不含该按钮，querySelector 自排除。与上一条用户消息按钮的"翻到最顶"联动：点击跳转按钮 → scrollTo(0) → 本功能自动接力加载更早 → 用户消息行出现 → 后续点击正常逐条回溯。

- FEATURES：`auto-load-earlier`「到顶自动加载更早」，nav 组，default true，kind js。
- onToggle：on → install（addEventListener 同引用去重）；off → removeEventListener（定时器回调内另有 isOn 兜底）。
- apply() 注册 disposer。

## 验证

- 语法检查通过；无 e2e（按交付纪律，等用户需要再说）。
- 用户实机验证项见 260925-auto-load-earlier.validation.md。
