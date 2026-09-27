const { app, BrowserWindow, Menu, Tray, session, desktopCapturer, ipcMain, dialog, protocol, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// ===== 自动更新源 =====
// 帽子云部署好后，把下面的 URL 填上（例如 'https://xxxx.maoziyun.com/'），
// 目录里放 electron-builder 生成的 latest.yml 和 YunMeet-Setup-x.y.z.exe 即可。
// 留空时走 GitHub Releases（package.json → build.publish 指定的仓库）。
// 调试时也可以用环境变量 YUNMEET_UPDATE_URL 临时覆盖。
const MAOZI_UPDATE_URL = '';

// ===== 网页版地址 =====
// 桌面版里"复制邀请链接"会把这个地址 + ?room=会议号 复制到剪贴板，
// 对方用浏览器打开即可入会；装了桌面版的人直接输 6 位会议号。
// 以后换了托管地址，改这一行重新打包即可。
const WEB_INVITE_BASE = 'https://nicercz007-cloud.github.io/yunmeet/yunmeet.html';

// 用 localhost 作为主机名，让页面自身的"安全上下文"检查通过（https/localhost 才开摄像头）
const PAGE_URL = 'app://localhost/yunmeet.html';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// 桌面壳给页面打的补丁（在协议层注入，不动 yunmeet.html 本体）：
// 1) 剪贴板里 app:// 死链改写为网页版链接  2) 投屏开始/结束通知主进程（最小化/恢复窗口）
// 3) 首页"最近会议"一键重进  4) 隐藏 localChip
const HEAD_INJECT = [
  '<style>',
  '#localChip{display:none!important}',
  '#yjRecentBox{display:none;gap:8px;flex-wrap:wrap;margin:8px 0 4px}',
  '.yj-chip{background:#F1F5FB;border:1px solid #E2E8F3;color:#4A5568;border-radius:999px;padding:4px 12px;font-size:13px;cursor:pointer;font-family:inherit}',
  '.yj-chip:hover{border-color:#5B8DEF;color:#26324E}',
  '</style>',
  '<script>(function(){',
  '  var d = window.yunmeetDesktop;',
  '  if (!d || !d.webBase) return;',
  '  try {',
  '    var c = navigator.clipboard;',
  '    if (c && c.writeText) {',
  '      var orig = c.writeText.bind(c);',
  '      c.writeText = function (text) {',
  '        try {',
  '          if (typeof text === "string" && text.indexOf("app://") === 0) {',
  '            var m = text.match(/[?&]room=([0-9]+)/);',
  '            text = d.webBase + (m ? "?room=" + m[1] : "");',
  '          }',
  '        } catch (e) {}',
  '        return orig(text);',
  '      };',
  '    }',
  '  } catch (e) {}',
  '  try {',
  '    var md = navigator.mediaDevices;',
  '    if (md && md.getDisplayMedia) {',
  '      var g = md.getDisplayMedia.bind(md);',
  '      md.getDisplayMedia = function () {',
  '        var p = g.apply(null, arguments);',
  '        p.then(function (s) {',
  '          try {',
  '            d.shareState(true);',
  '            var end = function () { d.shareState(false); };',
  '            s.getVideoTracks().forEach(function (t) { t.addEventListener("ended", end); });',
  '            s.addEventListener("inactive", end);',
  '          } catch (e) {}',
  '        }).catch(function () { d.shareState(false); });',
  '        return p;',
  '      };',
  '    }',
  '  } catch (e) {}',
  '  document.addEventListener("DOMContentLoaded", function () {',
  '    function digits(s) { return (s || "").replace(/\\D/g, ""); }',
  '    function save(r) {',
  '      r = digits(r);',
  '      if (r.length !== 6) return;',
  '      try {',
  '        var a = JSON.parse(localStorage.getItem("yjRecent") || "[]");',
  '        a = a.filter(function (x) { return x.r !== r; });',
  '        a.unshift({ r: r, t: Date.now() });',
  '        localStorage.setItem("yjRecent", JSON.stringify(a.slice(0, 6)));',
  '      } catch (e) {}',
  '    }',
  '    function render() {',
  '      var ri = document.getElementById("roomInput");',
  '      if (!ri) return;',
  '      var box = document.getElementById("yjRecentBox");',
  '      if (!box) {',
  '        box = document.createElement("div");',
  '        box.id = "yjRecentBox";',
  '        ri.insertAdjacentElement("afterend", box);',
  '      }',
  '      box.innerHTML = "";',
  '      var a = [];',
  '      try { a = JSON.parse(localStorage.getItem("yjRecent") || "[]"); } catch (e) {}',
  '      if (!a.length) { box.style.display = "none"; return; }',
  '  box.style.display = "flex";',
  '      var lbl = document.createElement("span");',
  '      lbl.textContent = "最近会议";',
  '      lbl.style.cssText = "font-size:12px;color:#8A93A8;align-self:center;flex:none";',
  '      box.appendChild(lbl);',
  '      a.forEach(function (x) {',
  '        var b = document.createElement("button");',
  '        b.type = "button";',
  '        b.className = "yj-chip";',
  '        b.textContent = x.r.slice(0, 3) + " " + x.r.slice(3);',
  '        b.addEventListener("click", function () {',
  '          ri.value = x.r;',
  '          ri.dispatchEvent(new Event("input", { bubbles: true }));',
  '          ri.focus();',
  '        });',
  '        box.appendChild(b);',
  '      });',
  '    }',
  '    try {',
  '      var j = document.getElementById("btnJoin");',
  '      if (j) j.addEventListener("click", function () { save(document.getElementById("roomInput").value); setTimeout(render, 500); });',
  '      var cr = document.getElementById("btnCreate");',
  '      if (cr) cr.addEventListener("click", function () { setTimeout(render, 800); });',
  '      var rc = document.getElementById("roomCodeTxt");',
  '      if (rc) new MutationObserver(function () { save(rc.textContent); }).observe(rc, { childList: true, subtree: true, characterData: true });',
  '      var ov = document.getElementById("ovBtn");',
  '      if (ov) ov.addEventListener("click", function () { setTimeout(render, 300); });',
  '    } catch (e) {}',
  '    render();',
  '  });',
  '})();</script>',
].join('\n');

let mainWindow = null;
let tray = null;
let upd = null;          // electron-updater 实例（打包后才有）
let manualCheck = false; // 区分"手动点检查更新"和启动时的静默检查

function log(...args) {
  console.log('[yunmeet]', ...args);
}

// ---------- 主窗口 ----------
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '云聚',
    backgroundColor: '#101418',
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: !process.env.YUNMEET_SMOKE, // 冒烟截图需要隐藏窗口也持续渲染
    },
  });

  // 固定标题为「云聚」，不让页面标题覆盖任务栏显示
  mainWindow.on('page-title-updated', (e) => e.preventDefault());
  // 共享时不把会议窗口带进共享画面（系统级内容保护）
  mainWindow.setContentProtection(true);

  mainWindow.once('ready-to-show', () => {
    if (!process.env.YUNMEET_SMOKE) mainWindow.show(); // 冒烟模式保持隐藏，不打扰用户
  });

  // 页面里的外链（如 PeerJS 链接）交给系统浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // 转发渲染进程报错，方便排查
  mainWindow.webContents.on('console-message', (...a) => {
    const ev = a[0] || {};
    const level = typeof ev === 'object' && 'level' in ev ? ev.level : a[1];
    const msg = typeof ev === 'object' && 'message' in ev ? ev.message : a[2];
    if (Number(level) >= 2) log('renderer:', msg);
  });

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log('did-fail-load:', code, desc, url);
  });
  mainWindow.webContents.on('did-finish-load', () => log('page loaded:', PAGE_URL));
  mainWindow.loadURL(PAGE_URL);
  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow;
}

// ---------- 会话权限 ----------
function setupSession() {
  const ses = session.defaultSession;
  const allowed = new Set([
    'media',
    'display-capture',
    'clipboard-read',
    'clipboard-sanitized-write',
    'notifications',
    'fullscreen',
    'pointerLock',
  ]);
  ses.setPermissionRequestHandler((wc, permission, callback) => callback(allowed.has(permission)));

  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const picked = await pickShareSource();
      if (picked) callback({ video: picked });
      else callback(null);
    } catch (e) {
      log('display media error:', e);
      callback(null);
    }
  });
}

// ---------- 投屏选择器 ----------
let pickerState = null;

async function pickShareSource() {
  // 新请求到来时，丢弃上一次还没选完的
  if (pickerState) {
    try { pickerState.win.destroy(); } catch (_) {}
    pickerState = null;
  }

  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true,
  });
  if (!sources.length) return null;

  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 640,
      height: 500,
      resizable: false,
      minimizable: false,
      maximizable: false,
      alwaysOnTop: true,
      show: false,
      autoHideMenuBar: true,
      title: '选择要共享的内容',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    const state = { win, done: false };
    pickerState = state;

    const finish = (val) => {
      if (state.done) return;
      state.done = true;
      pickerState = null;
      try { win.destroy(); } catch (_) {}
      resolve(val);
    };

    ipcMain.once('picker:pick', (e, id) => {
      if (e.sender !== win.webContents) return;
      finish(sources.find((s) => s.id === id) || null);
    });
    ipcMain.once('picker:cancel', (e) => {
      if (e.sender !== win.webContents) return;
      finish(null);
    });
    win.on('closed', () => finish(null));

    win.once('ready-to-show', () => win.show());
    win.webContents.on('did-finish-load', () => {
      win.webContents.send('picker:sources', sources.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.id.startsWith('screen') ? 'screen' : 'window',
        thumb: s.thumbnail ? s.thumbnail.toDataURL() : null,
        icon: s.appIcon ? s.appIcon.toDataURL() : null,
      })));
    });
    win.loadFile(path.join(__dirname, 'picker.html'));
  });
}

// ---------- 自动更新 ----------
function setupUpdater() {
  if (!app.isPackaged) return; // 开发模式不检查更新
  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) {
    log('electron-updater 加载失败：', e.message);
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const urlOverride = process.env.YUNMEET_UPDATE_URL || MAOZI_UPDATE_URL;
  if (urlOverride) {
    log('update feed (generic):', urlOverride);
    autoUpdater.setFeedURL({ provider: 'generic', url: urlOverride });
  } else {
    log('update feed: GitHub Releases (Nicercz007-cloud/yunmeet)');
  }

  autoUpdater.on('checking-for-update', () => log('updater: checking…'));
  autoUpdater.on('update-available', (i) => {
    log('updater: update available', i && i.version);
    if (manualCheck) {
      manualCheck = false;
      dialog.showMessageBox(mainWindow, {
        type: 'info', title: '云聚', noLink: true,
        message: `发现新版本 v${i ? i.version : ''}`,
        detail: '正在后台下载，完成后会提示你重启安装。',
      });
    }
  });
  autoUpdater.on('update-not-available', (i) => {
    log('updater: up to date (', i && i.version, ')');
    if (manualCheck) {
      manualCheck = false;
      dialog.showMessageBox(mainWindow, {
        type: 'info', title: '云聚', noLink: true,
        message: `你已经是最新版本（v${i ? i.version : app.getVersion()}）`,
      });
    }
  });
  autoUpdater.on('download-progress', (p) => {
    if (Math.round(p.percent) % 25 === 0) log(`updater: ${Math.round(p.percent)}%`);
  });
  autoUpdater.on('error', (e) => {
    log('updater error:', e && (e.stack || e.message || e));
    if (manualCheck) {
      manualCheck = false;
      dialog.showMessageBox(mainWindow, {
        type: 'warning', title: '云聚', noLink: true,
        message: '检查更新失败',
        detail: '网络不通或更新服务器暂时无法访问，请稍后再试。',
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    log('updater: update downloaded', info && info.version);
    manualCheck = false;

    // 端到端测试模式：写标记文件后退出，不弹窗
    const marker = process.env.YUNMEET_UPDATE_TEST;
    if (marker) {
      try {
        fs.writeFileSync(marker, JSON.stringify({ event: 'update-downloaded', version: info && info.version }));
      } catch (e) { log('marker write failed:', e.message); }
      app.exit(0);
      return;
    }

    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '云聚会议',
      message: `发现新版本 v${info ? info.version : ''}`,
      detail: '新版本已下载完成，重启应用后生效。现在就重启吗？',
      buttons: ['立即重启', '稍后'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    }).then((r) => {
      if (r.response === 0) autoUpdater.quitAndInstall(false, true);
    });
  });

  // 测试模式下出错要快速失败
  if (process.env.YUNMEET_UPDATE_TEST) {
    autoUpdater.on('error', (e) => {
      try {
        fs.writeFileSync(process.env.YUNMEET_UPDATE_TEST, JSON.stringify({ event: 'error', message: String(e && (e.message || e)) }));
      } catch (_) {}
      app.exit(1);
    });
  }

  upd = autoUpdater;
  autoUpdater.checkForUpdates().catch((e) => log('updater check failed:', e && e.message));
}

// ---------- 托盘 ----------
function showMain() {
  if (!mainWindow) return createMainWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function checkUpdates(manual) {
  if (!app.isPackaged) {
    if (manual) {
      dialog.showMessageBox({ type: 'info', title: '云聚', noLink: true, message: '开发模式下不支持检查更新' });
    }
    return;
  }
  if (!upd) return;
  manualCheck = manual;
  upd.checkForUpdates().catch(() => {});
}

function createTray() {
  try {
    tray = new Tray(path.join(__dirname, 'build', 'icon.ico'));
  } catch (e) {
    log('tray create failed:', e.message);
    return;
  }
  tray.setToolTip('云聚');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开云聚', click: () => showMain() },
    { label: '检查更新', click: () => checkUpdates(true) },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]));
  tray.on('double-click', () => showMain());
}

// ---------- 冒烟测试模式 ----------
function setupSmoke(win) {
  if (!process.env.YUNMEET_SMOKE) return;
  // 可用 YUNMEET_SMOKE_SIZE=390x844 模拟手机视口
  const sm = (process.env.YUNMEET_SMOKE_SIZE || '').split('x').map(Number);
  if (sm.length === 2 && sm[0] > 100 && sm[1] > 100) {
    win.setMinimumSize(0, 0);
    win.setSize(sm[0], sm[1]);
  }
  // 兜底：20 秒还没截到图就带错误码退出，避免挂死
  setTimeout(() => {
    log('smoke timeout');
    app.exit(1);
  }, 20000);
  win.webContents.on('did-finish-load', async () => {
    try {
      // 第一次加载：预置一条最近会议记录并刷新，验证"最近会议"条渲染
      if (!process.env.YUNMEET_SMOKE_SEEDED) {
        process.env.YUNMEET_SMOKE_SEEDED = '1';
        await win.webContents.executeJavaScript(
          "try{localStorage.setItem('yjRecent', JSON.stringify([{r:'685744',t:Date.now()},{r:'123456',t:Date.now()-86400000}]))}catch(e){}; 'ok'"
        );
        win.webContents.reload();
        return;
      }
      await new Promise((r) => setTimeout(r, 2500));
      // 摄像头/麦克风权限自检：NotAllowedError=权限被拒（壳有问题），
      // NotFoundError=本机没有设备（权限正常），OK=拿流成功
      const gum = await win.webContents.executeJavaScript(
        "navigator.mediaDevices.getUserMedia({video:true,audio:true})" +
        ".then(t=>'GUM-OK tracks='+t.getTracks().length)" +
        ".catch(e=>'GUM-ERR '+e.name)"
      ).catch((e) => 'GUM-ERR eval ' + e.message);
      log(gum);
      // 假会议模式：不真入会，摆一个 16:9 共享画面 + 一个关摄像头成员，验证会议页布局
      if (process.env.YUNMEET_SMOKE_MEET) {
        await win.webContents.executeJavaScript(
          "(function(){" +
          "document.getElementById('home').classList.remove('active');" +
          "document.getElementById('meet').classList.add('active');" +
          "document.body.classList.add('sharing');" +
          "var c=document.createElement('canvas');c.width=1280;c.height=720;" +
          "var x=c.getContext('2d');" +
          "var g=x.createLinearGradient(0,0,1280,720);g.addColorStop(0,'#2c6bed');g.addColorStop(1,'#7fd0ff');" +
          "x.fillStyle=g;x.fillRect(0,0,1280,720);" +
          "x.fillStyle='#fff';x.font='bold 90px sans-serif';x.fillText('共享画面 16:9',330,380);" +
          "var v=document.createElement('video');v.muted=true;v.autoplay=true;v.playsInline=true;" +
          "v.srcObject=c.captureStream(15);v.play();" +
          "var f=document.createElement('div');f.className='tile focus';" +
          "f.appendChild(v);" +
          "f.insertAdjacentHTML('beforeend','<div class=\"nametag\"><span class=\"nm\">1 (你)</span></div>');" +
          "document.getElementById('tiles').appendChild(f);" +
          "var t2=document.createElement('div');t2.className='tile camoff';" +
          "t2.innerHTML='<div class=\"avatar\">王</div><div class=\"nametag\"><span class=\"nm\">王老师</span></div>';" +
          "document.getElementById('tiles').appendChild(t2);" +
          "})()"
        ).catch((e) => log('fake meet error:', e.message));
      }
      // 页面状态诊断
      const state = await win.webContents.executeJavaScript(
        "JSON.stringify({home:document.getElementById('home').classList.contains('active')," +
        "meet:document.getElementById('meet').classList.contains('active')," +
        "ov:document.getElementById('overlay').classList.contains('show')," +
        "ovTitle:(document.getElementById('ovTitle')||{}).textContent||''," +
        "name:(document.getElementById('nameCreate')||{}).value})"
      ).catch((e) => 'state eval failed ' + e.message);
      log('page state:', state);
      // 隐藏窗口拿不到新帧：截图前短暂显示窗口（闪现 <1s）
      if (!win.isVisible()) win.show();
      win.webContents.invalidate();
      await new Promise((r) => setTimeout(r, 900));
      const img = await win.webContents.capturePage();const out = process.env.YUNMEET_SMOKE_OUT || path.join(__dirname, 'smoke-main.png');
      fs.writeFileSync(out, img.toPNG());
      log('smoke screenshot saved:', out);
    } catch (e) {
      log('smoke error:', e);
    }
    app.exit(0);
  });
}

// ---------- 单实例 ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  log('another instance is running, quitting');
  app.quit();
} else {
  app.on('second-instance', () => {
    showMain();
  });

  app.whenReady().then(() => {
    // app:// 协议 → 本地文件（打包后指向 resources 目录，开发时指向仓库根目录）
    protocol.handle('app', async (request) => {
      const u = new URL(request.url);
      let rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      if (!rel) rel = 'yunmeet.html';
      const base = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
      const fp = path.join(base, rel);
      if (!path.normalize(fp).startsWith(path.normalize(base))) {
        return new Response('forbidden', { status: 403 });
      }
      if (rel === 'yunmeet.html') {
        const buf = await fs.promises.readFile(fp);
        const html = buf.toString('utf8').replace('<head>', '<head>\n' + HEAD_INJECT);
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
      return net.fetch(pathToFileURL(fp).toString());
    });

    setupSession();
    Menu.setApplicationMenu(null);

    ipcMain.handle('app:version', () => app.getVersion());
    ipcMain.on('app:webBase', (e) => { e.returnValue = WEB_INVITE_BASE; });
    // 投屏开始(true) / 结束(false)：开始就最小化窗口（避免共享画面里出现会议窗口自己），
    // 结束后恢复显示并聚焦
    ipcMain.on('share:state', (e, on) => {
      if (!mainWindow || e.sender !== mainWindow.webContents) return;
      if (on) {
        mainWindow.minimize();
      } else {
        showMain();
      }
    });

    const win = createMainWindow();
    setupSmoke(win);
    createTray();
    setupUpdater();
  });

  app.on('before-quit', () => {
    if (tray) {
      try { tray.destroy(); } catch (_) {}
      tray = null;
    }
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
