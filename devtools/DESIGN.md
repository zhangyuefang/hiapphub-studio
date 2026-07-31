# HAP DevTools 设计文档

## 架构概览

系统由两个独立应用组成：

```
┌──────────────────────────────────────────────────────────────┐
│  1. DevTools（开发工具面板）                                   │
│     独立 hiapphub-host 进程                                   │
│                                                              │
│  启动流程：环境检测 → 通过后 → 工程页（打开/创建工程）          │
│                                                              │
│  ┌────────────────────────────────────────────────┐          │
│  │  浏览器式项目 Tab 栏                              │          │
│  │  - 每 Tab 一个项目，含编辑（名称/图标/版本等）     │          │
│  │  - 标题栏：新建/打开/设置工程                      │          │
│  │  - 操作栏：新建项目 / 打开项目 / WS 服务状态       │          │
│  └────────────────────────────────────────────────┘          │
│                                                              │
│  WebSocket 服务 (:19832) ← vite 插件连入                      │
│  HTTP API (:19831) ← CLI 工具可选调用                         │
└──────────────┬───────────────────────────────────────────────┘
               │ Shell IPC
               ▼
┌──────────────────────────────────────────────────────────────┐
│  2. hap-dev-runner（开发运行器 — 项目运行 + 窗口设置）          │
│                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  │
│  │  项目窗口 A     │  │  项目窗口 B     │  │  ...          │  │
│  │  (hiapphub-host │  │  (hiapphub-host │  │              │  │
│  │   进程)         │  │   进程)         │  │              │  │
│  └───────┬────────┘  └───────┬────────┘  └──────────────┘  │
│          │                    │                              │
│          ▼                    ▼                              │
│  ┌────────────────┐  ┌────────────────┐                     │
│  │  窗口设置面板 A │  │  窗口设置面板 B │                     │
│  │  (浮动/可拖动)  │  │  (浮动/可拖动)  │                     │
│  │  WS→DevTools   │  │  WS→DevTools   │                     │
│  └────────────────┘  └────────────────┘                     │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  IDE (VSCode/Cursor)                                          │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │  HAP 项目源码          │  │  vite-plugin-hap-dev         │ │
│  │  (vite dev server)    │  │  - Bridge Mock (仅浏览器预览) │ │
│  │  :5173                │  │  - manifest 读写               │ │
│  └──────────────────────┘  │  - WS 客户端→DevTools:19832    │ │
│                            └──────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## 两个应用的职责

### DevTools（开发工具面板）

| 职责 | 说明 |
|------|------|
| 环境检测 | 启动时自动检测 Node.js/npm/pnpm，缺少时显示安装引导；Rust 仅 HPL 项目时检测 |
| 工程管理 | 打开工程/创建工程/设置工程名；浏览器式 Tab 管理多项目；项目级信息编辑（名称/图标/版本/作者等） |
| WebSocket 服务 | 接收 vite 插件和窗口设置面板的连接 |
| HTTP API | 为 CLI 工具提供可选接口 |
| 进程协调 | 通过 Shell IPC 启动/停止项目窗口和设置面板进程 |

### hap-dev-runner（开发运行器）

| 组件 | 说明 |
|------|------|
| 项目窗口 | 独立 hiapphub-host 进程，加载 vite dev server URL，拥有独立图标/托盘/HAL 模块 |
| 窗口设置面板 | 每个项目窗口对应一个浮动面板（无边框/always-on-top/可拖动），通过 WS 连接 DevTools |

**多窗口场景**：如果项目定义了多个窗口（main + settings + dialog...），每个窗口各自运行为独立 hiapphub-host 进程，每个都可以打开对应的窗口设置面板。

## 项目管理

### 概念层次

```
工程 (Workspace)          ← hap-workspace.json（可选，monorepo 场景）
 ├─ 项目 A (Project)     ← manifest.json（hapType: "app"）
 ├─ 项目 B (Project)     ← manifest.json（hapType: "hpl"）
 └─ 项目 C (Project)     ← manifest.json（hapType: "app"）
```

- **单项目**：直接打开含 manifest.json 的目录
- **工程（monorepo）**：根目录放 `hap-workspace.json`，DevTools 扫描匹配路径下的 manifest.json 自动发现所有项目

### hap-workspace.json 格式

```json
{
  "name": "我的工程",
  "projects": [
    { "id": "my-app", "type": "hap", "displayName": "My App" },
    { "id": "my-lib", "type": "hpl" }
  ],
  "created": "2026-07-19T12:00:00.000Z"
}
```

- `name`：工程显示名称
- `projects`：项目列表，每项含 `id`（英文 ID，目录名）、`type`（hap/hpl）、`displayName`（可选显示名）
- 可与 `pnpm-workspace.yaml` 并存（pnpm 管依赖，hap-workspace 管项目发现）

### manifest.json 项目标识

manifest.json 中通过 `hapType` 字段标识项目类型：

| hapType | 说明 |
|---------|------|
| `app` | HAP 应用 |
| `hpl` | HAP 支持库 |
| _(未来)_ | 控制台程序、小程序、手机 app、网络服务端等 |

### 环境检测

DevTools 启动后第一个界面为环境检测页：

| 必需工具 | 用途 | 安装引导 |
|----------|------|----------|
| Node.js | JavaScript 运行时 | 一键跳转 nodejs.org |
| npm | 包管理（Node 自带） | - |
| pnpm | 工程依赖管理 | `npm install -g pnpm` |

| 可选工具 | 用途 | 触发条件 |
|----------|------|----------|
| Rust / cargo | 编译支持库(HPL) | 创建或打开 HPL 项目时检测 |

全部必需工具通过后自动进入工程页面。

### 创建工程

1. 选择目录
2. 生成 pnpm-workspace 结构（内置脚手架/可从官网下载）：
   - `pnpm-workspace.yaml`
   - `hap-workspace.json`
   - `package.json`（根）
   - `apps/` 目录
   - `packages/` 目录
3. 进入工程后可继续创建项目

### 创建项目（工程内）

1. **选择项目类型**：应用(HAP) / 支持库(HPL)（后续扩展更多类型）
2. **选择创建方式**（后期实现模板系统）：
   - **空项目**：生成项目基本框架（含完整脚手架）
   - **使用模板**：从官方提供的各类应用框架模板创建（后期）
   - **从官方源码**：基于官方发布的开源应用源码创建（后期）
3. 自动执行 `pnpm install`

### 打开工程

- 选择工程根目录
- 通过 hap-workspace.json 识别工程
- 或通过 manifest.json 的 hapType 识别单项目
- 无标识文件则提示"不是有效的 HAP 工程"

## 设计原则

- **极简**：DevTools 以浏览器式 Tab 管理项目，标题栏显示工程信息
- **单开单工程**：一个 DevTools 实例对应一个工程，工程内可含多个项目
- **自动连接**：vite 插件作为 WS 客户端主动连接 DevTools
- **每窗口独立设置**：项目每个窗口都可有独立的设置浮动面板

## 通信架构

### WebSocket 服务（主通道，端口 19832）

DevTools 运行 WebSocket 服务，接受两类客户端：

| 客户端 | 注册消息 | 用途 |
|--------|---------|------|
| vite 插件 | `{ type:"register", role:"plugin", manifest, root, port }` | 项目信息/HMR 事件/manifest 读写 |
| 窗口设置面板 | `{ type:"register", role:"inspector", windowLabel }` | 获取/设置指定窗口属性 |

消息格式：`{ type: string, event?: string, data?: any }`

### HTTP API（可选，CLI 工具接口）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/health | 健康检查 |
| GET | /api/modules | HAL 模块列表 |
| GET | /api/modules/:id | 模块详情 |
| GET | /api/types.d.ts | 全部模块 TypeScript 类型 |
| GET | /api/connection | 当前连接状态 |
| POST | /api/call | 调用 HAL 函数 |
| POST | /api/manifest/validate | 验证 manifest.json |
| GET | /api/logs | 获取调用日志 |

### Shell IPC（进程管理）

- DevTools 通过 Shell IPC 请求启动/停止项目 hiapphub-host 进程
- DevTools 通过 Shell IPC 请求启动/停止窗口设置面板进程
- Shell 管理所有 hiapphub-host 进程的生命周期
- Bridge 调用日志由项目 hiapphub-host 记录，通过 Shell IPC 转发到 DevTools
- 窗口属性修改链路：设置面板 → DevTools WS → Shell IPC → 项目 hiapphub-host

## 核心流程

### 1. DevTools 启动流程

```
DevTools 启动
       │
       ▼
  环境检测页（Node/npm/pnpm）
       │
       ├─ 全部通过 → 工程页（打开/创建工程）
       │
       └─ 缺少工具 → 显示安装引导
```

### 2. 项目开发连接

```
开发者运行 pnpm dev
       │
       ▼
vite-plugin-hap-dev 启动
       │
       ▼
作为 WS 客户端连接 ws://localhost:19832
       │
       ├─ 连接成功 → 发送 { type:"register", role:"plugin", manifest, root, port:5173 }
       │              DevTools 自动显示项目数据
       │
       └─ 连接失败 → 3s 后重试（最多 10 次）
                      期间 dev server 正常运行不受影响
```

### 3. 项目窗口启动

- DevTools 通过 Shell IPC 启动项目的 hiapphub-host 进程，传入 manifest 路径 + vite dev server URL
- hiapphub-host 以 URL 模式加载 dev server 页面，而非 .hapk 包
- 项目有多个窗口定义时，Shell 为每个窗口启动独立 hiapphub-host 进程
- 项目自身的图标、托盘、窗口配置自然生效（与生产模式一致）
- Bridge 调用日志由 hiapphub-host 内部记录，通过 Shell IPC 转发到 DevTools（IDE 终端可查看）
- HMR 事件通过 vite 插件 WebSocket 转发

### 4. 窗口设置面板

- 用户在 DevTools 中对某个项目窗口点击「设置」按钮
- DevTools 通过 Shell IPC 启动一个浮动面板 hiapphub-host 进程
- 面板为无边框、always-on-top、小型可拖动窗口
- 面板作为 WS 客户端连接 DevTools（role: "inspector", windowLabel: "main"）
- 获取/修改目标窗口的属性（尺寸/位置/标题栏/装饰等）
- 每个项目窗口可独立打开/关闭自己的设置面板

## UI 布局

### DevTools 主窗口（工程已打开）

```
┌─────────────────────────────────────────────────────────────────┐
│ ● ● ●  HAP 开发工具 - 工程: 哈哈 (3)  [+🏗][📂][⚙] [🌐][☀] │ 标题栏
│                                          ↑新建  ↑打开 ↑设置    │
│                                          工程   工程  工程     │
├─────────────────────────────────────────────────────────────────┤
│  [➕ 新建项目] [📂 打开项目]        WS Server :19832 ● 运行中  │ 项目操作栏
├─────────────────────────────────────────────────────────────────┤
│  ┌─my-app─×─┐ ┌─my-lib─×─┐ ┌─my-tool─×─┐                     │ 项目 Tab 栏
│  └──────────┘ └──────────┘ └───────────┘                       │ (浏览器式)
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ 项目信息 ─────────────────────────────────────────────┐    │ 当前 Tab 内容
│  │  名称: [My Tool       ]   图标: [📎 选择]              │    │ (项目编辑)
│  │  版本: [1.0.0         ]   作者: [Developer  ]          │    │
│  │  描述: [一个工具应用   ]   版权: [MIT        ]          │    │
│  │  单实例: [✓]                                           │    │
│  │  HAL 依赖: websocket, fs, dialog                      │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**说明**：
- 标题栏右侧（语言/主题前）：新建工程、打开工程、设置工程信息（仅修改工程名称）
- 项目操作栏：[新建项目] [打开项目] + 右侧 WS 服务状态（服务运行/停止，非连接状态）
- 项目 Tab 栏（浏览器式）：每个 Tab 对应一个已打开项目，可关闭（×）
- Tab 内容区：当前选中项目的编辑界面
  - HAP 应用：名称/图标/版本/作者/描述/版权/单实例/HAL 依赖
  - HPL 支持库：名称/版本/作者/描述/版权
- 无项目打开时显示空白欢迎提示
- WS 连接状态是项目级别的，在 Tab 内容中展示（非全局）
- 工程信息仅含显示名称

**环境检测页（启动第一屏）**：

```
┌──────────────────────────────────────────────────┐
│  ● ● ●   HAP DevTools                    [🌐][⚙] │
├──────────────────────────────────────────────────┤
│                                                  │
│               环境检测                            │
│                                                  │
│  ✓ Node.js   v20.11.0                            │
│  ✓ npm       v10.2.4                             │
│  ✓ pnpm      v9.1.0                             │
│                                                  │
└──────────────────────────────────────────────────┘
```

**工程页（环境通过后 / 无项目时）**：

```
┌──────────────────────────────────────────────────┐
│  ● ● ●   HAP DevTools                    [🌐][⚙] │
├──────────────────────────────────────────────────┤
│                                                  │
│               欢迎使用 HAP DevTools               │
│                                                  │
│       [📁 打开工程]    [✨ 创建工程]                │
│                                                  │
│  最近工程：                                       │
│    📦 my-workspace     ~/projects/my-workspace   │
│    📦 my-app           ~/projects/my-app         │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 窗口设置浮动面板（每个项目窗口各一个）

```
┌──────────────────────┐
│  窗口: main    [×]   │
├──────────────────────┤
│  尺寸: 800 × 600     │
│  位置: (100, 200)    │
│  标题: My App        │
│  标题栏: overlay     │
│  可缩放: ✓           │
│  装饰: ✓             │
│  [居中] [最小化]     │
└──────────────────────┘
```

## i18n 联动

### 语言同步链路

```
DevTools 切换语言
      │
      ├─① 保存到 KV（hap.db.set('locale', 'ja')）
      │
      ├─② WebSocket 广播 → 所有已连接客户端
      │     { type: "locale", locale: "ja" }
      │
      │     ├─ vite 插件（收到但不处理）
      │     │
      │     └─ 窗口设置面板（收到后立即切换语言）
      │
      └─③ Shell IPC 广播 → 所有 dev-runner 进程
            { event: "locale-changed", locale: "ja" }
            │
            └─ dev-runner 主窗口更新 i18n
                  │
                  └─ postMessage → settings-panel 子窗口
                        子窗口更新 i18n
```

### 各阶段语言获取方式

| 阶段 | 方式 | 说明 |
|---|---|---|
| DevTools 启动 | KV 读取 `locale` → 无则取系统语言 | 持久化存储 |
| dev-runner 启动 | 启动参数 `--locale ja` | DevTools 通过 Shell IPC 传入 |
| dev-runner 独立运行 | 默认英语 / 系统语言 | 无 DevTools 连接时的回退 |
| settings-panel 创建 | URL 参数 `?lang=ja` | dev-runner 创建子窗口时传入 |
| 运行时切换 | WS 广播 → IPC → postMessage | 实时同步，无需重启 |

### 独立运行场景

`hap-dev-runner` 可脱离 DevTools 独立运行（调试/测试用途）：
- 无 `--locale` 参数时使用英语作为默认语言
- 无 WebSocket 连接 → 不接收语言变更通知
- 用户可在 settings-panel 中手动切换语言（仅影响当前实例）

## 安全

- WebSocket 服务和 HTTP API 仅绑定 `127.0.0.1`
- 无认证机制（本地开发工具）

## 技术栈

- **前端**: React + TypeScript + Tailwind CSS + Radix UI + Lucide Icons
- **运行时**: hiapphub-host（wry/tao WebView）
- **通信**: WebSocket 服务（vite 插件/设置面板连入）+ HTTP API（CLI 可选）+ IPC（Shell）
- **HAL 模块**: webserver（HTTP API）、websocket（WS 服务）、system
