# EyeBeat

像素风封面墙网页音乐播放器。六边形封面浏览、强调色随曲目变化、详情页 / 歌词 / 评论、待机 CRT 关机屏，以及可切换的多音乐源。

> 仓库包名仍为 `himusic`；产品展示名为 **EyeBeat**（顶栏 `EYE/BEAT`）。

## 预览

<p align="center">
  <img src="docs/eye.png" alt="待机屏 · EyeBeat" width="32%" />
  <img src="docs/wall.png" alt="封面墙" width="32%" />
  <img src="docs/detail.png" alt="详情页" width="32%" />
</p>

<p align="center">
  <sub>待机 · 封面墙 · 详情页</sub>
</p>

## 功能

- **封面墙**：无限 / 分区浏览，准星切歌，封面主色驱动主题
- **播放**：进度与音量条、循环 / 单曲 / 随机、频谱与简易 FX
- **详情页**：封面与黑胶、歌词、评论、队列与遥测；桌面可折叠栏；手机手势（上滑歌词、右滑评论）
- **待机**：关机屏七段时钟 + 互动机器人，长按充能开机（快捷键 `P`）
- **音乐源**（顶栏 `SRC::` 循环切换）
  - [Audius](https://audius.co) — 默认可用
  - 网易云 — 需本地 / 自建 API 代理
  - [Jamendo](https://www.jamendo.com) — CC 曲库，需 `client_id`

## 技术栈

- Vue 3 + TypeScript + Pinia + Vite
- PWA（`vite-plugin-pwa`）
- 可选：`@neteasecloudmusicapienhanced/api`（开发时由 Vite 插件拉起并代理到 `/ncm`）

## 快速开始

```bash
# 需要 Node.js 20+ 与 pnpm
pnpm install
pnpm dev
```

浏览器打开终端提示的本地地址（默认 Vite 端口）。

```bash
pnpm build    # 类型检查 + 生产构建
pnpm preview  # 预览构建产物
```

## 环境变量

复制 [`.env.example`](.env.example) 为 `.env.local`（或沿用仓库内 `.env.development`）后按需修改，**改完需重启** `pnpm dev`。

| 变量 | 说明 |
| --- | --- |
| `VITE_MUSIC_PROVIDER` | 默认音源：`audius` \| `netease` \| `jamendo` |
| `VITE_NETEASE_API_BASE` | 网易云 API。以 `/` 开头时由开发服代理并自动起本地服务，例如 `/ncm` |
| `NETEASE_API_PORT` | 本地网易云 API 端口，默认 `3000` |
| `VITE_JAMENDO_CLIENT_ID` | [Jamendo Dev Portal](https://devportal.jamendo.com/) 申请；未配置则不出现在切换列表 |

开发环境示例（已写在 `.env.development`）：

```env
VITE_MUSIC_PROVIDER=netease
VITE_NETEASE_API_BASE=/ncm
```

## 常用快捷键

| 按键 | 作用 |
| --- | --- |
| `Space` | 播放 / 暂停 |
| `←` / `→` | 上一首 / 下一首 |
| `B` | 折叠 / 展开播放栏 |
| `P` | 关机 / 开机（输入框内忽略） |
| `Ctrl+K` | 命令面板 |

具体以应用内命令面板为准。

## 目录结构（简）

```
src/
  api/           # 音乐源适配器、歌词源
  components/    # 界面组件
  stores/        # Pinia
  audio/         # Web Audio / FX
  styles/        # 全局样式与主题变量
public/          # 静态资源、像素字体、图标
```

新增音源：实现 `src/api/types.ts` 中的 `MusicProvider`，并在 `src/api/index.ts` 注册。

## 说明与免责

- 本项目仅供学习与个人使用。请遵守各音乐平台与 API 的服务条款与版权规定。
- 网易云等第三方非官方接口可能不稳定，且存在合规风险；请自行评估使用方式。
- 本地存储键仍使用 `himusic.*` 前缀，升级后一般无需清理。

## License

未指定开源许可证前，保留所有权利。若你 fork 后公开发布，请自行补充 `LICENSE`，并去除或替换可能引起混淆的品牌资源。
