# DevTools & Dev-Runner 实施文档

## 当前完成状态

### DevTools（开发工具面板）

| 功能 | 状态 | 说明 |
|------|------|------|
| 环境检测页 | ✅ 完成 | Node.js/npm/pnpm 检测，动画欢迎页，4s 后自动跳转 |
| 欢迎页 | ✅ 完成 | 打开工程/创建工程入口 |
| 创建工程 | ✅ 完成 | 选择目录→工程名→生成 hap-workspace.json（无 pnpm-workspace/package.json 脚手架） |
| 添加项目 | ✅ 完成 | 选类型(HAP/HPL)→输入英文 ID→生成项目骨架（HAP: manifest/package/vite/index/src; HPL: manifest/Cargo/src） |
| 标题栏 | ✅ 完成 | macOS 红绿灯+创建/打开/设置工程按钮+语言下拉+主题下拉+Win 控制按钮 |
| WS 服务器 | ✅ 完成 | server.ts 端口 19832，通过 HAL websocket 模块，接收 plugin/inspector/runner |
| HTTP API | ✅ 完成 | server.ts 端口 19831，健康检查/模块列表/manifest 验证/call/logs 等 |
| 项目 Tab 栏 | ✅ 完成 | 浏览器式 Tab，含图标+名称+关闭按钮 |
| 项目操作栏 | ✅ 完成 | [新建项目]+[打开项目]+右侧 WS 状态 |
| 项目信息编辑 | ⚠️ 不完善 | 仅 name/version/author/desc/license/icon 的 `defaultValue` input，**未绑定 manifest.json 读写** |
| 打开项目 | ✅ 完成 | 子窗口对话框(OpenProjectDialog)，列出未打开的项目，点击后 postMessage 到主窗口 |
| 打开工程 | ✅ 完成 | 选目录→读 hap-workspace.json，不存在则提示 |
| 工程名编辑 | ✅ 完成 | 标题栏⚙按钮→内联 input→保存到 hap-workspace.json |
| useConnection hook | ⚠️ 旧架构遗留 | DevTools 作为 WS **客户端**连接 Vite HMR，与新架构（DevTools 为 WS 服务器）冲突 |
| 旧 panels 目录 | ⚠️ 废弃代码 | 8 个面板组件未被引用：Bridge/Connect/Console/HMR/Logs/Modules/Project/State/Window |
| 启动 Vite | ❌ 未做 | 需从 DevTools 调用 hap.process.exec 启动 pnpm dev |
| 启动 dev-runner | ❌ 未做 | 需启动 hiapphub-host --url 进程 |
| i18n 广播 | ✅ 完成 | wsBroadcast({ type: 'locale', locale }) |
| 托盘 | ✅ 完成 | tray.ts 基础托盘图标 |
| i18n | ✅ 完成 | 12 语言，i18n.ts + i18n-locales.ts + i18n-locales-2.ts |

### hap-dev-runner（开发运行器）

| 功能 | 状态 | 说明 |
|------|------|------|
| 主窗口 UI | ✅ 完成 | 标题栏、预览区、状态栏 |
| 设置面板 | ✅ 完成 | 分组属性、悬浮球、置顶、自定义拖拽 |
| WS 连接 DevTools | ✅ 完成 | 自动连接/重连，角色 runner |
| i18n 同步 | ✅ 完成 | 通过 WS 接收 locale，postMessage 通知子窗口 |
| HMR 日志 | ✅ 完成 | 接收 HMR 事件显示文件名+时间 |
| WS Inspector | ✅ 完成 | 设置面板内嵌消息日志 |
| 属性修改生效 | ⚠️ 基础 | postMessage 到主窗口，部分属性已对接 |
| URL 预览 | ❌ 未做 | 目前仅显示 URL 文本，不加载实际内容 |

### vite-plugin-hap-dev

| 功能 | 状态 | 说明 |
|------|------|------|
| Bridge Mock | ✅ 完成 | 注入 hap.* API mock（浏览器预览用），`if (!window.hap)` 保护避免覆盖真实 bridge |
| WS 连接 DevTools | ✅ 完成 | 注册 role:plugin，转发消息 |
| HMR 事件转发 | ✅ 完成 | handleHotUpdate → DevTools WS |
| manifest 监控 | ✅ 完成 | fsWatch → WS 通知变更 |
| locale 转发 | ✅ 完成 | DevTools WS → Vite HMR 客户端 |

### hiapphub-host

| 功能 | 状态 | 说明 |
|------|------|------|
| --url 模式 | ✅ 完成 | 直接加载 HTTP URL |
| --hap-path 模式 | ✅ 完成 | 加载 .hapk 包 |
| 子窗口 | ✅ 完成 | hash 路由、postMessage 通信 |
| 统一事件转发 | ✅ 完成 | window_event 聚合事件 |
| 自定义拖拽 | ✅ 完成 | setPosition/getPosition API |
| DevTools 面板 | ✅ 完成 | with_devtools(true) |
| JS alert 支持 | ❌ 未做 | WKWebView 默认不显示 alert |

---

## 实施阶段

### 阶段 1：DevTools 工程页 UI 完善

**目标**：用户能完整管理工程和项目

#### 1.1 项目信息编辑区（Tab 内容）

当前只有名称，需补全：

```
┌─ 项目信息 ──────────────────────────────────┐
│  ID:       my-app (只读)                     │
│  类型:     HAP 应用 (只读)                    │
│  名称:     [My App              ]            │
│  版本:     [1.0.0               ]            │
│  作者:     [                    ]            │
│  描述:     [                    ]            │
│  版权:     [MIT        ▼]                    │
│  图标:     [📎 icon.png  ] [选择]             │
│  入口:     index.html (只读)                  │
│  单实例:   [✓]                                │
│                                              │
│  ─── HAL 模块依赖 ───                        │
│  [+添加] websocket ×  fs ×  dialog ×         │
│                                              │
│  ─── 窗口定义 ───                             │
│  main: 900×640 overlay                       │
│  [+添加窗口]                                  │
│                                              │
│  ─── 操作 ───                                 │
│  [▶ 启动开发] [📦 打包] [🔍 验证 manifest]    │
└──────────────────────────────────────────────┘
```

**数据源**：读取项目目录下的 `manifest.json`（通过 `hap.fs.readTextFile`）
**修改方式**：表单编辑 → debounce 写回 `manifest.json`（通过 `hap.fs.writeTextFile`）
**当前问题**：
- 编辑区使用 `defaultValue` 而非受控组件，修改不会持久化
- 缺少从 manifest.json 读取实际数据的逻辑
- 缺少 HAL 依赖、窗口定义等高级编辑
**依赖文件**：
- `apps/devtools/src/App.tsx` — 主组件（需拆分）
- `apps/devtools/src/components/ProjectEditor.tsx` — 新建，项目编辑组件
- `apps/devtools/src/components/TabBar.tsx` — 新建，Tab 栏组件
- `apps/devtools/src/components/TitleBar.tsx` — 新建，标题栏组件
- `apps/devtools/src/scaffold.ts` — 扩展，增加 readManifest/writeManifest 函数

#### 1.2 标题栏（已完成，无需修改）

当前已实现：
- ✅ [创建工程] [打开工程] [设置工程] 三个按钮（仅 project 视图显示）
- ✅ 标题显示格式：`HAP DevTools - 工程: {名称} ({项目数})`
- ✅ 语言/主题 DropdownMenu
- ✅ Windows 控制按钮（最小化/最大化/关闭）

#### 1.3 项目操作栏（已完成，无需修改）

当前已实现：
- ✅ [新建项目] → 进入 add-project 流程
- ✅ [打开项目] → 子窗口选择未打开的项目
- ✅ 右侧 WS Server :19832 ● 状态
- ⚠️ WS 状态目前硬编码为 `connected`，未绑定实际服务器状态

#### 1.4 代码拆分与清理

**App.tsx 拆分**（当前 536 行，加新功能会超 1000 行）：
- `App.tsx` — 主路由和状态管理（<200行）
- `components/TitleBar.tsx` — 标题栏（语言/主题/工程操作按钮）
- `components/EnvCheck.tsx` — 环境检测页
- `components/WelcomePage.tsx` — 欢迎页
- `components/ProjectView.tsx` — 工程视图（Tab 栏 + 操作栏 + 项目编辑）
- `components/ProjectEditor.tsx` — 单个项目的编辑表单（绑定 manifest.json 读写）
- `components/CreateWorkspace.tsx` — 创建工程流程
- `components/AddProject.tsx` — 添加项目流程

**清理废弃代码**：
- 删除 `panels/` 目录（8 个未引用组件）：BridgePanel、ConnectPanel、ConsolePanel、HmrPanel、LogsPanel、ModulesPanel、ProjectPanel、StatePanel、WindowPanel
- 重构或移除 `hooks/useConnection.ts`（旧 WS 客户端逻辑与新架构冲突）
- 评估 `hooks/useManifestWatch.ts` 是否仍需要

**现有文件清单**（保留）：
| 文件 | 行数 | 用途 |
|------|------|------|
| App.tsx | 536 | 主组件（需拆分） |
| server.ts | 488 | HTTP + WS 服务器 |
| i18n.ts | 324 | i18n 框架 |
| scaffold.ts | 192 | 工程/项目脚手架 |
| tray.ts | 98 | 托盘图标 |
| theme.ts | 26 | 主题管理 |
| main.tsx | 23 | 入口路由（hash 分流 open-project / App） |
| dialogs/OpenProjectDialog.tsx | 79 | 打开项目子窗口对话框 |
| hooks/useConnection.ts | 156 | ⚠️ 旧 WS 客户端（与新架构冲突） |
| hooks/useManifestWatch.ts | 75 | manifest 监控 |
| i18n-locales.ts | 608 | 翻译（上半：zh-CN/en-US/zh-TW/ja/ko/fr） |
| i18n-locales-2.ts | 608 | 翻译（下半：de/es/pt-BR/ru/ar/hi） |
| hap.d.ts | ~10 | 类型声明 |

---

### 阶段 2：DevTools 启动 Vite + dev-runner

**目标**：从 DevTools 一键启动项目开发环境

#### 2.1 启动 Vite Dev Server

```
用户在项目 Tab 中点击 [▶ 启动开发]
      │
      ▼
DevTools 调用 hap.process.exec({
  command: 'pnpm dev',
  cwd: projectDir,
  background: true
})
      │
      ▼
等待 Vite 启动（轮询 /api/health 或监听 stdout 中的 "ready in"）
      │
      ▼
获取 Vite dev server URL (http://localhost:xxxx)
      │
      ▼
更新 UI 状态：开发中 ● http://localhost:5173
```

**关键点**：
- 需要 `hap.process.exec` 支持后台进程和输出流
- 需要解析 Vite 输出获取端口号
- 需要进程管理（停止开发时 kill 进程）

#### 2.2 启动项目预览窗口

```
Vite 启动成功，获得 URL（如 http://localhost:5173）
      │
      ▼
DevTools 通过 hap.process.spawn 启动 hiapphub-host:
  ~/.hiapphub/bin/hiapphub-host --url http://localhost:5173 --standalone
      │
      ▼
项目预览窗口打开，加载 Vite 页面（原生 HMR 支持）
Vite 插件 WS 自动连接 DevTools:19832
      │
      ▼
DevTools 显示连接状态：已连接
```

**注意**：项目预览窗口是直接加载 Vite URL 的 hiapphub-host 进程，**不是** dev-runner。
dev-runner 是独立的开发控制台应用（显示 WS 状态和 HMR 日志），当前设计中由 Shell 启动而非 DevTools。

**关键点**：
- DevTools 作为 standalone 运行时通过 `hap.process.spawn` 或 HAL process 模块启动 hiapphub-host
- 需要保存 PID 以便后续终止进程
- 需要解析 hiapphub-host 的 stdout 确认启动成功

#### 2.3 进程状态管理

在 DevTools 中维护进程状态：
```typescript
interface ProjectRuntime {
  projectId: string;
  vitePid?: number;       // Vite 进程 PID
  viteUrl?: string;       // Vite dev server URL
  hostPid?: number;       // hiapphub-host 进程 PID
  wsConnected: boolean;   // WS 连接状态
  status: 'stopped' | 'starting' | 'running' | 'error';
}
```

---

### 阶段 3：dev-runner 完善

**目标**：明确 dev-runner 角色并验证设置面板功能

#### 3.1 dev-runner 角色明确

**架构澄清**：
- dev-runner 是"开发控制台"，不是"项目预览窗口"
- 项目预览通过独立 `hiapphub-host --url` 进程实现
- dev-runner 显示：WS 连接状态、HMR 日志

**当前 dev-runner 文件**：
| 文件 | 行数 | 说明 |
|------|------|------|
| App.tsx | 160 | 主窗口 UI（标题栏+预览区+HMR日志+状态栏） |
| SettingsPanel.tsx | 344 | 设置面板（属性编辑+悬浮球+WS Inspector） |
| ws-client.ts | 101 | WS 客户端（支持角色参数） |
| style.css | 271 | 样式 |
| i18n.ts + i18n-locales*.ts | ~800 | 12 语言翻译 |
| theme.ts | ~30 | 主题管理 |

**架构差异说明**：
- DESIGN.md 设计：设置面板是独立 hiapphub-host 进程，通过 WS→DevTools→IPC→项目host 间接修改属性
- 当前实现：设置面板是 dev-runner 的**子窗口**，通过 postMessage 直接修改主窗口属性
- 当前实现更简洁，避免了间接通信开销

#### 3.2 设置面板属性验证

需验证所有属性修改是否正确生效：
- 尺寸/位置/标题 — ✅ 通过 postMessage 到主窗口
- 可缩放/装饰/最小化/最大化/关闭 — ✅ 对接 bridge API
- 最小尺寸/最大尺寸 — ✅ 对接 bridge API
- 居中 — ✅ 对接 bridge API
- 置顶 — ✅ 对接 bridge API + 图标变色
- 悬浮球 — ✅ 透明窗口 + 位置记忆
- 透明/背景色/阴影 — ❌ 仅 UI toggle，未对接实际 API（需 host 支持）
- 标题栏样式/隐藏标题 — ❌ 仅 UI toggle，运行时不可更改（创建时属性）

---

### 阶段 4：集成测试和 Bug 修复

#### 4.1 完整流程测试

```
1. 启动 DevTools（通过 Shell）
2. 环境检测通过
3. 创建工程
4. 添加项目（HAP 应用）
5. 打开项目 Tab
6. 编辑项目信息
7. 点击"启动开发"
8. Vite 启动，预览窗口打开
9. 修改源码，观察 HMR
10. 打开设置面板，修改窗口属性
11. 停止开发
12. 打包项目
```

#### 4.2 已知待修复

| 问题 | 优先级 | 说明 |
|------|--------|------|
| JS alert 不显示 | P2 | WKWebView 需要 setRunJavaScriptAlertPanel |
| DevTools .hapk 包加载问题 | P1 | hap:// 协议加载后 WS/HTTP 服务器未启动，需调查前端 JS 错误 |
| useConnection 与新架构冲突 | P1 | App.tsx 中 useConnection 作为 WS 客户端连接 Vite，与 DevTools 作为 WS 服务器的新架构矛盾 |
| 废弃 panels 代码 | P3 | 8 个未引用面板组件占磁盘空间 |
| bridge_inject.rs 审查 | P2 | 安全性和完整性检查 |
| hiapphub-host 进程稳定性 | P1 | 终端后台进程意外退出 |
| 脚手架缺少 pnpm-workspace | P2 | createWorkspace 只生成 hap-workspace.json，缺少 pnpm-workspace.yaml 和根 package.json |
| 项目编辑未绑定 manifest | P1 | 编辑区 input 用 defaultValue 不持久化 |
| WS 状态硬编码 | P2 | App.tsx 第466行 ws-dot 始终显示 connected，未绑定实际服务器状态 |
| setWsHandlers 未被调用 | P2 | server.ts 导出 setWsHandlers 但 App.tsx 未调用，plugin 消息无处理 |
| 路由结构未文档化 | P3 | DevTools main.tsx 用 hash 路由分流 open-project；dev-runner main.tsx 分流 settings |
| Shell 加载旧 .hapk 缓存 | P2 | WKWebView 可能缓存旧版本 hap:// 协议资源，导致新代码不生效 |

---

## 文件变更预估

### 阶段 1

| 文件 | 操作 | 预估行数 |
|------|------|----------|
| `devtools/src/App.tsx` | 重构拆分 | ~200行（从536缩减） |
| `devtools/src/components/TitleBar.tsx` | 新建 | ~80行 |
| `devtools/src/components/EnvCheck.tsx` | 新建 | ~100行 |
| `devtools/src/components/WelcomePage.tsx` | 新建 | ~60行 |
| `devtools/src/components/ProjectView.tsx` | 新建 | ~150行 |
| `devtools/src/components/ProjectEditor.tsx` | 新建 | ~300行（含 manifest 读写、HAL 依赖编辑） |
| `devtools/src/components/CreateWorkspace.tsx` | 新建 | ~120行 |
| `devtools/src/components/AddProject.tsx` | 新建 | ~100行 |
| `devtools/src/scaffold.ts` | 修改 | +50行（readManifest/writeManifest/pnpm-workspace 生成） |
| `devtools/src/panels/` | **删除** | -1171行（废弃代码） |
| `devtools/src/hooks/useConnection.ts` | 评估 | 可能移除或重构 |

### 阶段 2

| 文件 | 操作 | 预估行数 |
|------|------|----------|
| `devtools/src/runtime.ts` | 新建 | ~200行（Vite+host 进程管理） |
| `devtools/src/components/ProjectEditor.tsx` | 修改 | +80行（启动/停止按钮、状态显示） |

### 阶段 3

| 文件 | 操作 | 说明 |
|------|------|------|
| `dev-runner/src/App.tsx` | 小幅修改 | 角色明确，清理无用 URL 输入 |
| `dev-runner/src/SettingsPanel.tsx` | 修改 | 标记不可运行时修改的属性为只读 |

---

## 实施顺序建议

```
1.4(拆分+清理) → 1.1(项目编辑) → 1.2(标题栏) → 1.3(操作栏) → 2.1(启动Vite) → 2.2(启动预览) → 2.3(进程管理) → 3.1(角色) → 3.2(属性) → 4(测试)
```

先拆分 App.tsx + 清理废弃代码，避免后续编辑困难。

## 架构注意事项

### useConnection 的处理

当前 `useConnection` 是 DevTools 作为 WS **客户端**主动连接 Vite dev server 的旧逻辑。在新架构中：
- DevTools 是 WS **服务器**（server.ts 端口 19832）
- Vite 插件主动连接 DevTools
- 连接数据（manifest、logs）通过 server.ts 的 `setWsHandlers` 回调获取

**建议**：移除 useConnection，将其数据消费逻辑迁移到监听 server.ts 的 WS 消息回调。

### .hapk 包加载失败原因

DevTools 通过 `hiapphub-host --hap-path` 加载时，WS/HTTP 服务器未启动。可能原因：
1. `server.ts` 中 `hal('listen', ...)` 调用 `window.hap.hal()` 成功但返回值不是预期格式
2. `halWs('server_listen', ...)` 调用 `__TAURI_INTERNALS__.invoke()` 失败
3. WKWebView 缓存旧版本前端代码

需要在 DevTools 前端添加更多错误日志来定位。
