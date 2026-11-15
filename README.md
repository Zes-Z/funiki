# funiki

一个「拥有丰富展示动画与高交互对象」的单页式 Astro 个人博客。

- **纯浅白底**（#ffffff），全站无衬线字体（Bricolage Grotesque + Instrument Sans + 中文无衬线回退）
- 首屏：上方大图 + 下方信息区、小头像骑在分界线上、键盘打字机座右铭、社交图标 + 下载简历同一行
- 首屏向下：头像柔和缩入左上角常驻，点击弹出社交 / 邮箱 / 简历菜单
- 第二幅：自动横向播放的项目跑马灯，悬停暂停并播放预览视频，拖拽/横向滚轮可手动浏览，点击用 clip-path 形变展开 Markdown 项目详情
- 第三幅：生活图片的「纵深场」——滚动穿越漂浮照片、指针磁吸；点击照片直接打开「查看原图」视图（保留左右切换、计数器与键盘/触摸导航）；减少动效时自动回退为 justified 图片墙 + 同一查看器
- 第四幅：3 种图片边幅（切割邮票边 / 手撕毛边 / 画廊白边）组成的**横向列表**，自动平移 + 鼠标拖拽，悬停暂停，首尾无缝，点击展开 Markdown
- 尾幅：04 个人扩展（Say hello 式居中标题）+ 兴趣字带 + Say hello 磁吸邮件 CTA、纸切头像与页脚

## 技术栈

Astro 5（静态输出）、GSAP 3 + ScrollTrigger、Lenis、Astro Content Collections、Astro Assets（sharp）、Fontsource 自托管字体。无 UI 框架，交互为原生 TS。

## 开始

```bash
pnpm install
pnpm dev        # http://localhost:4321
pnpm build      # 输出到 dist/
pnpm preview    # 预览构建产物
```

> 环境备注：本机 Playwright 浏览器下载被 CDN 屏蔽，测试脚本使用系统已安装的 Microsoft Edge（`channel: 'msedge'`）。

## 目录结构

```
siteconfig.ts                 ← 全站自定义中心：头像、座右铭、比例、链接、动效参数
src/
  pages/index.astro           ← 唯一页面，按 5 幅组装
  layouts/BaseLayout.astro    ← head / 字体 / 片头 / 噪点 / 光标
  components/
    Hero.astro                ← 第一幅
    ProjectsRail.astro        ← 第二幅（跑马灯 + 项目详情模板）
    LifeWall.astro            ← 第三幅（回退图片墙 + 灯箱；纵深场由 script 接管）
    ThoughtsWall.astro        ← 第四幅（6 种相框 + 随想详情模板）
    Tail.astro                ← 尾幅 + 页脚
    Dock.astro / Sheet.astro / Icon.astro
  scripts/                    ← motion / dock / rail / sheet / depthField / tail…
  styles/                     ← global / content / depth-field
  content/
    internship·project/<slug>/  ← 项目：cover.jpg + 内嵌图 + <slug>.md
    post/<slug>/                ← 随想：cover.jpg + index.md
    picture/photos/ + videos/   ← 生活图片与实况视频
    picture/photometa.json      ← 图片元信息（画幅、说明、拍摄地、实况视频）
  content.config.ts           ← 三个 collection 的 schema
public/
  avatar.webp  avatar.jpg(回退)  kim cv.pdf  og.jpg  media/*.mp4  favicon.svg
scripts/                      ← 资源生成与 QA 脚本（不参与构建）
```

## 自定义

几乎全部改动都在根目录 **`siteconfig.ts`**：

| 位置 | 作用 |
| --- | --- |
| `site` | 标题、描述、语言、主题色 |
| `identity` | 姓名、角色、简介、所在地、时区、头像、邮箱、简历路径、首屏漂浮标签 |
| `hero.imageAreaRatio` | **首屏上下比例**（上方图片区占首屏高度的比例，默认 0.56） |
| `hero.coverImage / coverAlt` | 首屏上半区的大图（放 public/ 下，换掉即生效） |
| `hero.avatarSize / avatarShape` | 头像尺寸/形状（头像位于上下两块之间的分界线上） |
| `hero.motto` | 座右铭列表与打字节奏（默认：打字 90ms/字、停留 3000ms、删除 38ms/字、间隔 1000ms） |
| `socials` | 社交账号（首屏图标、左上角菜单、页脚共用） |
| `dock` | 左上角常驻头像尺寸/偏移、菜单动效时长 |
| `sections` | 各幅编号、标题、导语、提示与尾幅文案 |
| `motion` | 是否平滑滚动、阻尼、缓动、显现时长、自定义光标（默认关闭，使用系统原生光标） |
| `thoughts` | 随想横向列表的相框宽度与高度 |

替换个人信息只需要：换掉 `public/avatar.jpg`（并用 `scripts/generate-assets.py` 或任意工具生成 `public/avatar.webp`）与 `public/kim cv.pdf`，再改 `siteconfig.ts`。

## 内容维护

**新增项目**：在 `src/content/internship·project/<slug>/` 放 `cover.jpg` 与内嵌图片，写 `<slug>.md`：

```yaml
---
title: 山坞
subtitle: 莫干山民宿品牌重塑     # 可选
year: "2024"
role: 品牌设计 / 视觉识别
summary: 一句话概述
cover: ./cover.jpg
coverAlt: 晨雾中的杉木林
video: /project-shanwu.mp4  # 可选，卡片悬停预览
tags: [品牌识别, 包装]
order: 1
---
Markdown 正文，支持图片 `![](./gallery-01.jpg)`、引用、列表。
```

**新增随想**：`src/content/post/<slug>/cover.jpg + index.md`，`frame` 三选一：`stamp（切割邮票边） | deckle（手撕毛边） | hairline（画廊白边）`。

**新增生活图片**：图片放进 `src/content/picture/photos/`（视频放 `videos/`），再在 `src/content/picture/photometa.json` 里追加一项：

```json
{
  "id": "life-15",
  "image": "photos/life-15.jpg",
  "video": "videos/live-04.mp4",
  "type": "live",
  "caption": "雨后的小巷",
  "alt": "湿漉漉的石板路",
  "taken": "2026.03 · 杭州",
  "order": 15,
  "width": 1200,
  "height": 1600,
  "ratio": 0.75
}
```

`type`：`photo | live | video`。`live/video` 会在悬停时原地播放、并在聚焦面板/灯箱中播放。

## 动画实现速览

| 参考 | 本项目实现 |
| --- | --- |
| justinschueler Projects rail | 卡片自动横向播放 + 拖拽惯性（`src/scripts/rail.ts`），尺寸/间距/邻居缩放参考其 rail |
| justinschueler sheet | 点击卡片从卡片矩形 `clip-path` 形变到全屏（700ms `cubic-bezier(.32,.72,0,1)`），关闭 560ms 形变 + 220ms 延迟淡出（`sheet.ts`） |
| justinschueler Play 纵深场 | 完整移植其 DOM 深度场算法（透视/景深/模糊分级/R2 散布/磁吸/原地聚焦），并按 14 张图缩短滚动手感（`depthField.ts`、`depth-field.css`） |
| justinschueler 页脚 | 纸切头像遮罩显现、签名错落入场；未采用整页反色以保持「纯浅白底」 |
| helloabdullah Recent Projects | 无缝循环跑马灯（测量 seam 而非 -50% 的 gap bug）、悬停暂停、图片轻微放大 |
| helloabdullah 底部 | 兴趣字带跑马灯、大字号 CTA、圆形社交按钮 |

## 动效与无障碍

- `prefers-reduced-motion`：关闭片头、平滑滚动、跑马灯与打字机，纵深场自动回退为图片墙 + 灯箱。
- 详情面板 / 灯箱打开时锁定 Lenis 与页面滚动、聚焦到内容、`main` 设置 `inert`，关闭后恢复焦点。
- 键盘可完成：项目/随想卡片打开、查看器 Esc 关闭 / ← → 切换、纵深场 Tab/Enter 直接打开查看器。

## 资源与脚本

- 占位照片来自 Unsplash（`scripts/asset-credits.md` 内列出来源），仅供模板演示，正式使用请替换为本人照片。
- `scripts/generate-assets.py`：重新生成占位图、头像、简历、OG 图与短视频（需要 Pillow / numpy / PyMuPDF / imageio-ffmpeg；当前环境请经本地代理访问 Unsplash）。
- `scripts/test-depth.mjs`：纵深场的 Playwright 回归检查（默认 http://localhost:4331）。
- 字体：Bricolage Grotesque / Instrument Sans（SIL OFL），通过 Fontsource 自托管，无外部请求。

## 排错

- **页面一直停在片头「Funiki / 独立设计师 & 前端开发者」**：这是客户端脚本没有成功加载时片头的保护状态。先强制刷新（⌘⇧R）。如果使用 `pnpm dev`，多为依赖被重新优化后 Vite 缓存过期（控制台可见 `504 Outdated Optimize Dep`），删除缓存并重启即可：
  ```bash
  rm -rf node_modules/.vite && pnpm dev
  ```
  现已内置兜底：禁用 JS、脚本加载失败或 6 秒内片头未结束时会自动隐藏片头并展示页面内容。
- **不要直接双击打开 `dist/index.html`**。构建产物使用绝对路径与 ES Module，必须通过 HTTP 服务访问：开发用 `pnpm dev`，预览构建用 `pnpm preview`，或部署到任意静态托管。

## 部署

`pnpm build` 生成纯静态 `dist/`，可直接部署到任意静态托管（Vercel / Netlify / Cloudflare Pages / GitHub Pages / Nginx）。

## 「博客之禅」

1. 化繁为简，简中现繁
2. 博采众长，融会贯通，化为己用
3. 随心所欲