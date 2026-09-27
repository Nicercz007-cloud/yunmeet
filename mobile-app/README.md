# 云聚 · 手机版（Android APK）

把 `yunmeet.html` 包成安卓 App：点图标直接进会议软件，和桌面版/网页版**会议号互通**。
用 Capacitor 6 做壳：WebView 直接加载线上页面，**页面更新不需要发新 APK**。

## 设计要点

- **壳是薄的，页面是活的**：App 加载 `capacitor.config.json → server.url` 指向的页面
  （当前是 GitHub Pages）。以后页面加了新功能，手机端打开就是最新的，不用发版。
- **摄像头/麦克风**：AndroidManifest 已声明 `CAMERA`/`RECORD_AUDIO`/`MODIFY_AUDIO_SETTINGS`。
  **首次打开 App 会立刻弹系统授权框，两个都必须点"允许"**，否则无法视频开会
  （安卓 WebView 只认"已授予的权限"，自己不会弹窗申请——申请动作由 MainActivity 启动时完成；
  如果之前点过"不再询问"，App 会自动跳到系统设置页让你手动打开）。
- **投屏限制**：安卓 WebView 不支持"发送"屏幕共享（腾讯会议是原生实现才能做到），
  手机端可以正常**观看**电脑端投屏、开视频、聊天、当主持人。
- **国内加载慢的备选**：GitHub Pages 在部分手机网络下偏慢。把
  `capacitor.config.json → server.url` 换成帽子云域名（同一个 yunmeet-upd 仓库里也放一份
  `yunmeet.html` 即可），重新打包 APK。

## 构建环境（本机已装好）

- JDK 17：`C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot`（winget 安装）
- Android SDK：`%LOCALAPPDATA%\Android\Sdk`（platform-tools / android-34 / build-tools 35.0.0）
- Gradle 走腾讯镜像、Maven 走阿里云镜像（已写进配置）

## 日常命令（Git Bash）

```bash
export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-17.0.20.101-hotspot"
export PATH="$JAVA_HOME/bin:$PATH"
cd mobile-app/android
./gradlew assembleDebug      # 测试包 app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease    # 正式签名包（yunmeet.keystore）
```

## 签名（重要！）

- 正式包用 `mobile-app/android/yunmeet.keystore`，密码 `yunmeet2026`，别名 `yunmeet`，
  有效期 10000 天。
- **务必备份这个 keystore 文件**——安卓更新包必须用同一把签名，丢了就只能卸载重装。
- 换图标/换名字：改 `android/app/src/main/res/mipmap-*`（本项目用
  `desktop-app/build/icon.png` 生成了全套）和 `strings.xml` 的 app_name。

## 更新装置（和物光口袋同款思路）

- 页面级更新：自动（壳加载的就是线上页）。
- 壳级更新（极少发生，比如要加新权限）：出新 APK 后传到帽子云/GitHub，替换下载页里的
  链接即可；以后可以像物光口袋一样给 App 装 `android.json` 更新装置。

## 已知边界

- 手机发送投屏：WebView 做不到，属平台限制。
- 微信内置浏览器打不开 WebRTC：请让参会者用系统浏览器打开邀请链接，或直接装本 APK。
