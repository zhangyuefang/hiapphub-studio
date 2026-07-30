# HiAppHub Studio

HiAppHub 平台内置核心工具套件，以 `.hap` 格式发布，支持自举升级。

## 包含应用

| 应用 | 说明 |
|---|---|
| `shell/` | Shell 主界面（React 前端） |
| `devtools/` | 开发者工具（工程管理、项目调试） |
| `dev-runner/` | 开发调试运行器（真实 Bridge 运行时） |

## 开发

```bash
pnpm install
cd shell && pnpm dev       # 开发 Shell
cd devtools && pnpm dev    # 开发 DevTools
cd dev-runner && pnpm dev  # 开发 Dev Runner
```

## 打包

```bash
cd shell && pnpm build && pnpm run pack
cd devtools && pnpm build && pnpm run pack
cd dev-runner && pnpm build && pnpm run pack
```

## 许可证

MIT
