const { app, BrowserWindow, BrowserView, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const SIDEBAR_WIDTH = 68;
const catalog = require('./catalog.json');

const userDataPath = app.getPath('userData');
const statePath = path.join(userDataPath, 'state.json');

function seedDefaultState() {
  return {
    instances: catalog.map((appDef) => ({
      instanceId: `${appDef.appId}-1`,
      appId: appDef.appId,
      label: appDef.name,
      icon: appDef.icon,
      color: appDef.color,
      url: appDef.url,
    })),
    activeId: catalog.length ? `${catalog[0].appId}-1` : null,
  };
}

function loadState() {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  } catch (e) {
    // No file yet, or corrupted -> start fresh
    return seedDefaultState();
  }

  // Defensive normalization: if a future/older version saved a different
  // shape (or a field is missing/malformed), never crash — just fall back
  // to safe defaults for whatever is broken instead of the whole app.
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.instances)) {
    return seedDefaultState();
  }

  const validInstances = raw.instances.filter(
    (i) => i && typeof i.instanceId === 'string' && typeof i.appId === 'string' && typeof i.url === 'string'
  );

  if (validInstances.length === 0) {
    return seedDefaultState();
  }

  return {
    instances: validInstances,
    activeId: typeof raw.activeId === 'string' ? raw.activeId : validInstances[0].instanceId,
  };
}

function saveState() {
  try {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('Failed to save state', e);
  }
}

let state = loadState();
let mainWindow;
let addAccountWindow = null;
const views = {}; // instanceId -> BrowserView

function getContentBounds() {
  const [width, height] = mainWindow.getContentSize();
  return { x: SIDEBAR_WIDTH, y: 0, width: width - SIDEBAR_WIDTH, height };
}

function createViewForInstance(instance) {
  const view = new BrowserView({
    webPreferences: {
      partition: `persist:${instance.instanceId}`,
      contextIsolation: true,
      sandbox: true,
    },
  });

  view.webContents.loadURL(instance.url);

  const persistUrl = () => {
    instance.url = view.webContents.getURL();
    saveState();
  };
  view.webContents.on('did-navigate', persistUrl);
  view.webContents.on('did-navigate-in-page', persistUrl);

  views[instance.instanceId] = view;
  return view;
}

function switchTo(instanceId) {
  const view = views[instanceId];
  if (!view) return;
  mainWindow.setBrowserView(view);
  view.setBounds(getContentBounds());
  view.setAutoResize({ width: true, height: true });
  state.activeId = instanceId;
  saveState();
}

function sendInstancesToRenderer() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('instances-list', state.instances, state.activeId);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.webContents.on('did-finish-load', sendInstancesToRenderer);

  state.instances.forEach(createViewForInstance);

  mainWindow.on('resize', () => {
    const view = views[state.activeId];
    if (view) view.setBounds(getContentBounds());
  });

  mainWindow.once('ready-to-show', () => {
    if (state.activeId) switchTo(state.activeId);
  });
}

function openAddAccountWindow() {
  if (addAccountWindow) {
    addAccountWindow.focus();
    return;
  }
  addAccountWindow = new BrowserWindow({
    width: 380,
    height: 340,
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: mainWindow,
    modal: true,
    title: 'افزودن اکانت جدید',
    webPreferences: {
      preload: path.join(__dirname, 'renderer', 'add-account-preload.js'),
      contextIsolation: true,
    },
  });
  addAccountWindow.setMenuBarVisibility(false);
  addAccountWindow.loadFile(path.join(__dirname, 'renderer', 'add-account.html'));
  addAccountWindow.on('closed', () => {
    addAccountWindow = null;
  });
}

ipcMain.on('switch-instance', (event, instanceId) => {
  switchTo(instanceId);
});

ipcMain.on('open-add-account', () => {
  openAddAccountWindow();
});

ipcMain.handle('get-catalog', () => catalog);

ipcMain.on('add-instance', (event, { appId, label }) => {
  const appDef = catalog.find((a) => a.appId === appId);
  if (!appDef) return;

  // Generate a unique instanceId even if the user adds many of the same app
  let n = 1;
  let instanceId = `${appId}-${n}`;
  const existingIds = new Set(state.instances.map((i) => i.instanceId));
  while (existingIds.has(instanceId)) {
    n += 1;
    instanceId = `${appId}-${n}`;
  }

  const instance = {
    instanceId,
    appId,
    label: label && label.trim() ? label.trim() : `${appDef.name} ${n}`,
    icon: appDef.icon,
    color: appDef.color,
    url: appDef.url,
  };

  state.instances.push(instance);
  createViewForInstance(instance);
  saveState();
  sendInstancesToRenderer();
  switchTo(instanceId);

  if (addAccountWindow) {
    addAccountWindow.close();
  }
});

ipcMain.on('cancel-add-account', () => {
  if (addAccountWindow) addAccountWindow.close();
});

ipcMain.on('remove-instance', (event, instanceId) => {
  const view = views[instanceId];
  if (view) {
    if (mainWindow.getBrowserView() === view) {
      mainWindow.setBrowserView(null);
    }
    view.webContents.session.clearStorageData();
    delete views[instanceId];
  }
  state.instances = state.instances.filter((i) => i.instanceId !== instanceId);
  if (state.activeId === instanceId) {
    state.activeId = state.instances.length ? state.instances[0].instanceId : null;
  }
  saveState();
  sendInstancesToRenderer();
  if (state.activeId) switchTo(state.activeId);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
