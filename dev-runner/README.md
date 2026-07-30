# Dev Runner

HAP 应用开发时的预览运行器。由 DevTools 启动 Vite 项目时自动拉起。

## 功能

- 主窗口直接加载 Vite dev server URL 作为预览
- 子窗口 Settings Panel 提供实时窗口属性调节
- 属性变更双向同步：Panel ↔ 预览窗口 ↔ manifest.json

## 支持的窗口属性

| 分组 | 属性 |
|------|------|
| 基础 | 标题、图标、尺寸、最小/最大尺寸、坐标 |
| 外观 | 标题栏样式(standard/custom/none)、隐藏标题、透明、阴影、背景色、透明度 |
| 行为 | 可调整大小、可最大化/最小化/关闭、置顶、跳过任务栏、宽高比 |
| 启动 | 启动位置(居中/自定义)、启动状态(normal/minimized/maximized/fullscreen) |
| macOS | 毛玻璃(vibrancy)、红绿灯位置 |

## 平台预览

Settings Panel 顶部提供平台切换（macOS/Windows/Linux），可查看不同平台下可用的属性组。

## 构建

```bash
pnpm build
# 打包为 .hap
cd ../../packages/hap-cli && node dist/index.js pack ../../apps/dev-runner
```
