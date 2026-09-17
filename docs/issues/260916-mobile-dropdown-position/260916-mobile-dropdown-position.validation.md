# mobile-dropdown-position 用户验证

## 验证说明

- 验证对象：移动端 dropdown 定位修复（Bug 1: portal 菜单首项被 URL bar 遮挡；Bug 2: 模型选择 dropdown 在 active 状态弹到屏幕中央）
- 环境/前置条件：手机 Chrome 访问 DSH Web GUI，`popover-recenter` 和 `ime-viewport` 功能均为开启状态（默认）

## 验证项

| 验证步骤 | 预期结果 | 实际结果 | 状态 | 备注/证据 |
|---|---|---|---|---|
| **Bug 2 — active 状态模型选择 dropdown**：进入一个已有对话（非新会话），点击底部输入框上方的模型选择触发器 | dropdown 弹到输入框上方（原生 absolute 定位），不再弹到屏幕中央 | | 待验证 | |
| **Bug 2 — hero 状态模型选择 dropdown**：新建会话（hero 状态），点击模型选择触发器 | dropdown 居中弹出（保持原有行为不变） | | 待验证 | |
| **Bug 1 — 工作区下拉框**：在顶部 header 区域点击工作区下拉触发器 | 下拉框第一项可见且可点，不被 Chrome URL bar 遮挡 | | 待验证 | |
| **Bug 1 — 下拉间距**：观察工作区下拉框顶部与 URL bar 底部的间距 | 有合理间距（≥4px），不过分靠下 | | 待验证 | |
| **回归 — header actions 菜单**：点击 session header 的 actions 菜单（如省略号按钮） | 菜单仍居中弹出，不受 Bug 2 修复影响 | | 待验证 | |
| **回归 — backdrop-filter**：在有毛玻璃效果的卡片内弹出 dropdown | dropdown 正常显示，无渲染异常 | | 待验证 | |

## 验证结论

待验证

## 待跟进

无
