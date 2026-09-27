const { contextBridge, ipcRenderer } = require('electron');

const instArg = process.argv.find((a) => a.startsWith('--mm-instance-id='));
const instanceId = instArg ? instArg.slice('--mm-instance-id='.length) : null;

const listeners = { accountsChanged: [], chainChanged: [], connect: [], disconnect: [] };

ipcRenderer.on('wallet-event', (_e, { event, data }) => {
  (listeners[event] || []).forEach((fn) => { try { fn(data); } catch {} });
});

const provider = {
  isMetaMask: true,
  isStatus: false,
  _metamask: { isUnlocked: async () => true },
  request: async ({ method, params }) => {
    const res = await ipcRenderer.invoke('wallet-request', { instanceId, origin: location.origin, method, params });
    if (res && res.error) { const e = new Error(res.error.message); e.code = res.error.code; throw e; }
    return res ? res.result : undefined;
  },
  on: (event, handler) => { if (!listeners[event]) listeners[event] = []; listeners[event].push(handler); },
  removeListener: (event, handler) => { if (listeners[event]) listeners[event] = listeners[event].filter((h) => h !== handler); },
  isConnected: () => true,
};

try {
  contextBridge.exposeInMainWorld('ethereum', provider);
} catch { /* page already has its own window.ethereum shim; ignore */ }
