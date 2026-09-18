# 260918-mobile-longpress-freeze — 侧栏长按会话后整页失去响应

## 现象

移动端（Android Chrome）长按侧栏会话行后，整个页面失去响应——应用仍在运行（流式输出继续、UI 仍在刷新），但任何点击都无效果，只能刷新页面恢复。

## 根因

**DSH host 的会话行无条件 `draggable`（桌面拖拽排序功能）× Android Chrome 长按触发原生 DnD × Chromium 触摸拖拽会话未终止 → 触摸输入被卡死的拖拽控制器吞掉。**

证据链：

1. **Host 侧**：`@deepseek-ai/dsh-client-ui-workspace` 的 `SessionNodeItem`/`ProjectRowItem` 恒定传入 drag wiring，行元素始终带 `draggable: true`（源码 `draggable: drag !== void 0`，drag 对象无条件构造）。已在 e2e 实例（4188）实测：7 个 treeitem 全部 `draggable===true`。
2. **浏览器侧**：Chrome Android 100+ 为 `draggable` 元素启用「长按发起触摸拖拽」（blink-dev PSA: *Elements with a draggable attribute would start responding to touch-drag interaction*）。
3. **失败模式**（Chromium 已知问题族，crbug 363930156 相关报告 / mobile-drag-drop#114 / pragmatic-drag-and-drop#112）：
   - 长按不动 → dragstart 触发，但拖拽会话经常不能正常结束（dragend 间歇性不触发）；
   - DSH 特有放大器：拖拽进行中会话行的 React 重渲染（流式会话的标题/状态/dots 更新）会替换拖拽源 DOM 节点，进一步导致 dragend 丢失；
   - 拖拽控制器存活期间**所有触摸事件被路由给拖拽系统**，页面收不到 click/pointer —— 即「还在运行但什么都点不动」；
   - 会话行 CSS 有 `user-select:none`（无长按文本选择），所以长按唯一出口就是原生拖拽。

## 是否 dsh-qol 引入？

**否。** dsh-qol 的 `sidebar-gesture` touchmove preventDefault 只在手指移动 ≥3px 且水平意图时介入；静止长按（<3px）从不 preventDefault。而拖拽恰由「静止长按 500ms」发起，发生时页面触摸流已被拖拽控制器接管（touchmove 不再派发给页面）。该 bug 在 dsh-qol 安装前同样存在（draggable 是 host 行为）。实际上 qol 的 preventDefault 反而会取消"移动中的长按拖拽"，只在纯静止长按场景无能为力。

## 修复路径（dsh-qol 新增 feature：no-touch-drag）

窗口级 capture `dragstart` 监听：当触摸活跃（`event.touches.length > 0`，由 touchstart/touchend/touchcancel 维护）时 `preventDefault() + stopPropagation()`：

- `preventDefault` → 原生拖拽会话永不建立（规范行为，无卡死可能）；
- `stopPropagation` → React 的 `onDragStart`（drag.start → setDrag 状态 + document dragover/drop 监听）不会运行，避免应用层拖拽状态悬空。

已在 e2e 实例实测验证：capture 层 `preventDefault()+stopPropagation()` 后 `defaultPrevented===true` 且行的 bubble 处理器不再收到事件。

鼠标拖拽（桌面排序）不受影响：鼠标 dragstart 时 `touches.length===0`。默认开启，设置页可独立关闭。

## 置信度

诊断 ~90%；修复有效性 ~95%（机制已实测，真机长按路径待用户实机验证）。

## 验收标准

1. Android Chrome 长按（静止 1s+）侧栏任意会话行 → 松手 → 页面所有按钮/会话/Tab 仍可点击，无需刷新。
2. 长按后左右滑动手指 → 同样无卡死（拖拽未发起）。
3. 桌面端鼠标拖拽会话行排序功能不受影响。
4. e2e：触摸活跃时合成 dragstart 被阻止（defaultPrevented + 行处理器不触发）；无触摸时 dragstart 正常放行。
