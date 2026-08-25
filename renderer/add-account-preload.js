const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('addAccountApi', {
  getCatalog: () => ipcRenderer.invoke('get-catalog'),
  addInstance: (appId, label) => ipcRenderer.send('add-instance', { appId, label }),
  cancel: () => ipcRenderer.send('cancel-add-account'),
});
