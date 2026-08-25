const { ipcMain, Menu } = require('electron');

module.exports = function attachNativeMenus(getCtx) {
  ipcMain.on('account-menu', (_e, instanceId) => {
    const { state, mainWindow } = getCtx();
    const inst = state.instances.find((i) => i.instanceId === instanceId);
    if (!inst || !mainWindow) return;
    const folderItems = (state.folders || []).map((f) => ({
      label: 'انتقال به ' + f.name,
      click: () => {
        state.folders.forEach((x) => { x.itemIds = (x.itemIds || []).filter((id) => id !== instanceId); });
        inst.folderId = f.id;
        if (!f.itemIds) f.itemIds = [];
        if (!f.itemIds.includes(instanceId)) f.itemIds.push(instanceId);
        getCtx().refresh();
      },
    }));
    Menu.buildFromTemplate([
      { label: inst.label, enabled: false },
      { type: 'separator' },
      { label: 'تغییر نام', click: () => mainWindow.webContents.send('ask-rename', { type: 'instance', id: instanceId, value: inst.label }) },
      ...folderItems,
      { label: 'خارج از پوشه', click: () => {
        state.folders.forEach((x) => { x.itemIds = (x.itemIds || []).filter((id) => id !== instanceId); });
        inst.folderId = null;
        getCtx().refresh();
      } },
      { type: 'separator' },
      { label: 'حذف اکانت', click: () => mainWindow.webContents.send('ask-delete', instanceId) },
    ]).popup({ window: mainWindow });
  });

  ipcMain.on('folder-menu', (_e, folderId) => {
    const { state, mainWindow } = getCtx();
    const f = (state.folders || []).find((x) => x.id === folderId);
    if (!f || !mainWindow) return;
    Menu.buildFromTemplate([
      { label: f.name, enabled: false },
      { label: 'تغییر نام پوشه', click: () => mainWindow.webContents.send('ask-rename', { type: 'folder', id: folderId, value: f.name }) },
      { label: 'حذف پوشه', click: () => {
        state.instances.forEach((i) => { if (i.folderId === folderId) i.folderId = null; });
        state.folders = state.folders.filter((x) => x.id !== folderId);
        getCtx().refresh();
      } },
    ]).popup({ window: mainWindow });
  });
};
