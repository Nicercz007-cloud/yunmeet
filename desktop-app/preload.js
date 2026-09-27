const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('yunmeetDesktop', {
  getVersion: () => ipcRenderer.invoke('app:version'),
  webBase: ipcRenderer.sendSync('app:webBase'), // 网页版地址，邀请链接用它拼
  shareState: (on) => ipcRenderer.send('share:state', !!on), // 投屏开始/结束通知
  picker: {
    onSources: (cb) => ipcRenderer.on('picker:sources', (_e, list) => cb(list)),
    pick: (id) => ipcRenderer.send('picker:pick', id),
    cancel: () => ipcRenderer.send('picker:cancel'),
  },
});
