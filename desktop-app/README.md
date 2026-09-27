# 云聚 · 桌面版（Electron 壳）

把根目录的 `yunmeet.html` 包成 Windows 桌面软件：双击图标直接开会，不再需要 Python 和 bat；
内置自动更新（电子版的"物光口袋更新装置"，见 [更新部署指南.md](更新部署指南.md)）。

## 日常命令

```bash
npm install        # 首次/依赖变化时
npm start          # 开发模式运行
npm run dist       # 打包出 dist/YunMeet-Setup-x.y.z.exe
```

## 结构

```
desktop-app/
├── main.js        # 主进程：窗口、权限、投屏选择器、app:// 协议、托盘、自动更新
├── preload.js     # 桥：版本号/网页版地址/投屏状态/选择器回调
├── picker.html    # 投屏选择器（列出屏幕和窗口）
├── build/icon.ico # 应用图标（渐变+摄像机+金色镜头）
├── upd-kit/index.html  # 帽子云下载页模板
└── dist/          # 打包产物（YunMeet-Setup-*.exe + latest.yml + blockmap）
```

`yunmeet.html` **不复制进来**：打包时通过 `extraResources` 直接从仓库根目录取
（开发模式也走 `app://` 协议指向上级目录），永远只有一份源文件。

## 桌面壳功能清单

| 功能 | 说明 |
|---|---|
| 自动更新 | 启动静默检查 → 后台下载 → 弹窗重启安装；托盘"检查更新"手动触发 |
| 投屏选择器 | `getDisplayMedia` 触发时弹出应用内窗口（屏幕+窗口缩略图），Esc/取消关闭 |
| 投屏防套娃 | 开始共享自动最小化窗口 + 系统级内容保护，共享结束自动恢复 |
| 最近会议 | 首页"加入会议"下显示最近 6 个会议号，点一下自动填入 |
| 托盘 | 打开云聚 / 检查更新 / 退出；双击图标打开主窗口 |
| 邀请链接 | 复制的 `app://` 死链自动改写成网页版地址（`WEB_INVITE_BASE`） |
| 安全上下文 | 页面地址用 `app://localhost/`，页面自身检查自然通过，摄像头全开 |
| 单实例 | 重复双击图标聚焦已有窗口 |

## 关键配置（都在 main.js 顶部）

| 常量 | 作用 |
|---|---|
| `MAOZI_UPDATE_URL` | 帽子云更新源；留空则走 GitHub Releases |
| `WEB_INVITE_BASE` | 复制邀请链接用的网页版地址（当前是 GitHub Pages） |

## 冒烟测试（不用手点）

```bash
YUNMEET_SMOKE=1 npx electron .    # 加载→预置最近会议→刷新→截图 smoke-v2.png→退出
```

更新链路端到端验证（本地假更新源）：

```bash
# 1) 起一个目录放假 latest.yml + 假 exe：python -m http.server 8955
# 2) 跑打包版：
YUNMEET_UPDATE_URL=http://127.0.0.1:8955/ YUNMEET_UPDATE_TEST=标记文件路径 \
  dist/win-unpacked/云聚.exe
# 预期：标记文件写入 {"event":"update-downloaded","version":"1.0.1"}
```

注意：测试前先 `taskkill /F /IM 云聚.exe`，否则单实例锁会让测试进程静默退出。

## 发布

见 [更新部署指南.md](更新部署指南.md)。核心就三步：改版本号 → `npm run dist` → 传 `latest.yml` + exe。
