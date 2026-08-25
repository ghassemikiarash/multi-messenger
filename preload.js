const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onInstancesList: (callback) => {
    ipcRenderer.on('instances-list', (event, instances, activeId) => {
      callback(instances, activeId);
    });
  },
  switchInstance: (instanceId) => ipcRenderer.send('switch-instance', instanceId),
  openAddAccount: () => ipcRenderer.send('open-add-account'),
  removeInstance: (instanceId) => ipcRenderer.send('remove-instance', instanceId),
});
