const { app, BrowserWindow, BrowserView, ipcMain, Menu, clipboard, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const SIDEBAR_WIDTH = 78;
const catalog = require('./catalog.json');
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
let userDataPath, statePath, lockPath, state, mainWindow;
let views = {};
let overlayOpen = false;
let saveTimer = null;
function seedState() {
  return {
    folders: [],
    instances: catalog.slice(0, 4).map((def) => ({ instanceId: def.appId + '-1', appId: def.appId, label: def.name, color: def.color, url: def.url, folderId: null })),
    activeId: catalog[0] ? catalog[0].appId + '-1' : null,
    order: catalog.slice(0, 4).map((d) => d.appId + '-1'),
  };
}
function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    if (!raw || !Array.isArray(raw.instances)) return seedState();
    const instances = raw.instances.filter((i) => i && i.instanceId && i.url);
    if (!instances.length) return seedState();
    return { folders: raw.folders || [], instances, activeId: raw.activeId || instances[0].instanceId, order: raw.order || instances.map((i) => i.instanceId) };
  } catch { return seedState(); }
}
function saveStateSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { fs.writeFileSync(statePath, JSON.stringify(state, null, 2)); } catch (e) {} }, 800);
}
function loadLock() { try { return JSON.parse(fs.readFileSync(lockPath, 'utf-8')); } catch { return { enabled: false, salt: null, hash: null }; } }
function saveLock(lock) { fs.writeFileSync(lockPath, JSON.stringify(lock)); }
function hashPassword(password, salt) { return crypto.scryptSync(String(password), salt, 32).toString('hex'); }
function isSafeHttpUrl(url) { try { const u = new URL(url); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; } }
function getContentBounds() {
  if (!mainWindow) return { x: SIDEBAR_WIDTH, y: 0, width: 800, height: 600 };
  const [width, height] = mainWindow.getContentSize();
  return { x: SIDEBAR_WIDTH, y: 0, width: Math.max(200, width - SIDEBAR_WIDTH), height: Math.max(200, height) };
}
function relayout() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const view = state.activeId ? views[state.activeId] : null;
  if (!view || overlayOpen) return;
  view.setBounds(getContentBounds());
  view.setAutoResize({ width: true, height: true });
}
function hideActiveView() { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setBrowserView(null); }
function showActiveView() {
  if (overlayOpen) return;
  const view = state.activeId ? views[state.activeId] : null;
  if (view && mainWindow && !mainWindow.isDestroyed()) { mainWindow.setBrowserView(view); relayout(); }
}
function createViewForInstance(instance) {
  if (views[instance.instanceId]) return views[instance.instanceId];
  const view = new BrowserView({ webPreferences: { partition: 'persist:' + instance.instanceId, contextIsolation: true, sandbox: true, nodeIntegration: false } });
  const wc = view.webContents;
  wc.setUserAgent(CHROME_UA);
  wc.setWindowOpenHandler(({ url }) => { if (isSafeHttpUrl(url)) wc.loadURL(url); return { action: 'deny' }; });
  const persistUrl = () => { try { instance.url = wc.getURL(); saveStateSoon(); } catch {} };
  wc.on('did-navigate', persistUrl);
  wc.on('did-navigate-in-page', persistUrl);
  wc.on('context-menu', (_e, params) => {
    Menu.buildFromTemplate([
      { role: 'copy', enabled: !!(params.selectionText && params.editFlags.canCopy) },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { label: 'کپی لینک', visible: !!params.linkURL, click: () => clipboard.writeText(params.linkURL) },
      { label: 'کپی آدرس', click: () => clipboard.writeText(wc.getURL()) }
    ]).popup({ window: mainWindow });
  });
  if (isSafeHttpUrl(instance.url)) wc.loadURL(instance.url);
  views[instance.instanceId] = view;
  return view;
}
function switchTo(instanceId) {
  if (!instanceId || overlayOpen) { state.activeId = instanceId || state.activeId; saveStateSoon(); sendUi(); return; }
  const inst = state.instances.find((i) => i.instanceId === instanceId);
  if (!inst) return;
  const view = createViewForInstance(inst);
  mainWindow.setBrowserView(view);
  state.activeId = instanceId;
  saveStateSoon();
  relayout(); setTimeout(relayout, 80); setTimeout(relayout, 250);
  sendUi();
}
function sendUi() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('ui-state', { instances: state.instances, folders: state.folders, order: state.order, activeId: state.activeId, catalog, version: app.getVersion(), overlayOpen });
}
function uniqueId(appId) {
  const ids = new Set(state.instances.map((i) => i.instanceId));
  let n = 1; while (ids.has(appId + '-' + n)) n += 1; return appId + '-' + n;
}
function createWindow() {
  mainWindow = new BrowserWindow({ width: 1280, height: 840, minWidth: 900, minHeight: 600, backgroundColor: '#0f1115', show: false, autoHideMenuBar: true, icon: path.join(__dirname, 'icons', 'icon.png'), webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  ['resize', 'maximize', 'unmaximize', 'restore', 'show'].forEach((ev) => mainWindow.on(ev, () => { relayout(); setTimeout(relayout, 80); }));
  mainWindow.webContents.on('did-finish-load', () => {
    const lock = loadLock();
    mainWindow.webContents.send('boot', { needsLock: !!(lock.enabled && lock.hash), version: app.getVersion() });
    sendUi();
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    const lock = loadLock();
    if (lock.enabled && lock.hash) { overlayOpen = true; hideActiveView(); }
    else if (state.activeId) switchTo(state.activeId);
  });
}
function setupIpc() {
  ipcMain.handle('get-ui', () => ({ instances: state.instances, folders: state.folders, order: state.order, activeId: state.activeId, catalog, version: app.getVersion() }));
  ipcMain.on('switch-instance', (_e, id) => { if (typeof id === 'string') switchTo(id); });
  ipcMain.on('set-overlay', (_e, open) => { overlayOpen = !!open; if (overlayOpen) hideActiveView(); else showActiveView(); });
  ipcMain.on('add-instance', (_e, payload) => {
    if (!payload) return;
    const appDef = catalog.find((a) => a.appId === payload.appId);
    let url = payload.url, appId = payload.appId, color = (appDef && appDef.color) || '#7c5cff', name = (appDef && appDef.name) || 'Custom';
    if (payload.custom) { if (!isSafeHttpUrl(payload.url)) return; appId = 'custom'; url = payload.url; name = payload.label || new URL(payload.url).hostname; }
    else if (!appDef) return; else url = appDef.url;
    const instanceId = uniqueId(appId);
    const instance = { instanceId, appId, label: (payload.label && String(payload.label).trim()) || name, color, url, folderId: null };
    state.instances.push(instance); state.order.push(instanceId); saveStateSoon(); overlayOpen = false; switchTo(instanceId);
  });
  ipcMain.on('remove-instance', async (_e, instanceId) => {
    const view = views[instanceId];
    if (view) { try { await view.webContents.session.clearStorageData(); } catch {} try { view.webContents.close(); } catch {} delete views[instanceId]; }
    state.instances = state.instances.filter((i) => i.instanceId !== instanceId);
    state.order = state.order.filter((id) => id !== instanceId);
    state.folders.forEach((f) => { f.itemIds = (f.itemIds || []).filter((id) => id !== instanceId); });
    if (state.activeId === instanceId) state.activeId = state.instances[0] ? state.instances[0].instanceId : null;
    saveStateSoon(); if (state.activeId) switchTo(state.activeId); else { hideActiveView(); sendUi(); }
  });
  ipcMain.on('rename-instance', (_e, { instanceId, label }) => { const inst = state.instances.find((i) => i.instanceId === instanceId); if (!inst || !label) return; inst.label = String(label).slice(0, 40); saveStateSoon(); sendUi(); });
  ipcMain.on('create-folder', (_e, name) => { state.folders.push({ id: 'folder-' + Date.now(), name: (name && String(name).slice(0, 40)) || 'پوشه', itemIds: [], open: true }); saveStateSoon(); sendUi(); });
  ipcMain.on('rename-folder', (_e, { folderId, name }) => { const f = state.folders.find((x) => x.id === folderId); if (!f || !name) return; f.name = String(name).slice(0, 40); saveStateSoon(); sendUi(); });
  ipcMain.on('toggle-folder', (_e, folderId) => { const f = state.folders.find((x) => x.id === folderId); if (!f) return; f.open = !f.open; saveStateSoon(); sendUi(); });
  ipcMain.on('move-to-folder', (_e, { instanceId, folderId }) => {
    const inst = state.instances.find((i) => i.instanceId === instanceId); if (!inst) return;
    state.folders.forEach((f) => { f.itemIds = (f.itemIds || []).filter((id) => id !== instanceId); });
    inst.folderId = folderId || null;
    if (folderId) { const f = state.folders.find((x) => x.id === folderId); if (f && !f.itemIds.includes(instanceId)) f.itemIds.push(instanceId); }
    saveStateSoon(); sendUi();
  });
  ipcMain.on('stack-items', (_e, { a, b }) => {
    if (!a || !b || a === b) return;
    const ia = state.instances.find((i) => i.instanceId === a);
    const ib = state.instances.find((i) => i.instanceId === b);
    if (!ia || !ib) return;
    let folder = state.folders.find((f) => f.id === ib.folderId);
    if (!folder) { folder = { id: 'folder-' + Date.now(), name: 'پوشه', itemIds: [b], open: true }; state.folders.push(folder); ib.folderId = folder.id; }
    state.folders.forEach((f) => { f.itemIds = (f.itemIds || []).filter((id) => id !== a); });
    ia.folderId = folder.id; if (!folder.itemIds.includes(a)) folder.itemIds.push(a);
    saveStateSoon(); sendUi();
  });
  ipcMain.on('delete-folder', (_e, folderId) => {
    state.instances.forEach((i) => { if (i.folderId === folderId) i.folderId = null; });
    state.folders = state.folders.filter((x) => x.id !== folderId); saveStateSoon(); sendUi();
  });
  ipcMain.handle('set-password', (_e, { current, next }) => {
    const lock = loadLock();
    if (lock.enabled && lock.hash && hashPassword(current || '', lock.salt) !== lock.hash) return { ok: false, error: 'رمز فعلی درست نیست' };
    if (!next || String(next).length < 4) return { ok: false, error: 'رمز کوتاه' };
    const salt = crypto.randomBytes(16).toString('hex');
    saveLock({ enabled: true, salt, hash: hashPassword(next, salt) }); return { ok: true };
  });
  ipcMain.handle('disable-password', (_e, current) => {
    const lock = loadLock(); if (!lock.enabled) return { ok: true };
    if (hashPassword(current || '', lock.salt) !== lock.hash) return { ok: false, error: 'رمز اشتباه' };
    saveLock({ enabled: false, salt: null, hash: null }); return { ok: true };
  });
  ipcMain.handle('unlock', (_e, password) => {
    const lock = loadLock(); if (!lock.enabled) return { ok: true };
    if (hashPassword(password || '', lock.salt) !== lock.hash) return { ok: false };
    overlayOpen = false; if (state.activeId) switchTo(state.activeId); else sendUi(); return { ok: true };
  });
  ipcMain.on('lock-now', () => { const lock = loadLock(); if (!lock.enabled) return; overlayOpen = true; hideActiveView(); mainWindow.webContents.send('need-lock'); });
  ipcMain.handle('check-update', async () => {
    try {
      const res = await fetch('https://api.github.com/repos/ghassemikiarash/multi-messenger/releases/latest', { headers: { 'User-Agent': 'multi-messenger' } });
      if (!res.ok) return { ok: true, current: app.getVersion(), available: false };
      const data = await res.json();
      const latest = String(data.tag_name || '').replace(/^v/, '');
      const current = app.getVersion();
      return { ok: true, current, latest: latest || current, available: !!(latest && latest !== current), url: data.html_url };
    } catch { return { ok: true, current: app.getVersion(), available: false }; }
  });
  ipcMain.handle('download-update', async (_e, url) => { await shell.openExternal(url || 'https://github.com/ghassemikiarash/multi-messenger/releases/latest'); return { ok: true }; });
  ipcMain.on('open-external', (_e, url) => { if (isSafeHttpUrl(url)) shell.openExternal(url); });
}
app.whenReady().then(() => {
  userDataPath = app.getPath('userData');
  statePath = path.join(userDataPath, 'state.json');
  lockPath = path.join(userDataPath, 'lock.json');
  state = loadState();
  setupIpc();
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
