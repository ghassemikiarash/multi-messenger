const { contextBridge, ipcRenderer, webFrame } = require('electron');

const instArg = process.argv.find((a) => a.startsWith('--mm-instance-id='));
const instanceId = instArg ? instArg.slice('--mm-instance-id='.length) : null;

// Bridge (isolated world -> page world). instanceId and origin are added HERE,
// so the page can never spoof which profile's wallet it talks to.
contextBridge.exposeInMainWorld('__mmWalletBridge', {
  request: (method, params) => ipcRenderer.invoke('wallet-request', { instanceId, origin: location.origin, method, params }),
  onEvent: (cb) => { ipcRenderer.on('wallet-event', (_e, { event, data }) => { try { cb(event, data); } catch {} }); },
});

// This function is serialized and executed inside the PAGE's own JS world so that
// window.ethereum and EIP-6963 announcements are real page-world objects
// (functions can't cross a context-isolation boundary inside CustomEvent.detail).
function mainWorldProvider() {
  const bridge = window.__mmWalletBridge;
  if (!bridge || window.__mmWalletInstalled) return;
  window.__mmWalletInstalled = true;

  const listeners = {};
  const provider = {
    isMetaMask: true,
    isMultiMessenger: true,
    chainId: null,
    networkVersion: null,
    selectedAddress: null,
    _metamask: { isUnlocked: async () => true },
    isConnected: () => true,
    request: async (args) => {
      if (!args || typeof args.method !== 'string') throw new Error('Invalid request');
      const res = await bridge.request(args.method, args.params || []);
      if (res && res.error) { const e = new Error(res.error.message); e.code = res.error.code; throw e; }
      return res ? res.result : undefined;
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); return provider; },
    addListener(event, fn) { return provider.on(event, fn); },
    once(event, fn) { const w = (d) => { provider.removeListener(event, w); fn(d); }; return provider.on(event, w); },
    removeListener(event, fn) { listeners[event] = (listeners[event] || []).filter((f) => f !== fn); return provider; },
    off(event, fn) { return provider.removeListener(event, fn); },
    removeAllListeners(event) { if (event) delete listeners[event]; else Object.keys(listeners).forEach((k) => delete listeners[k]); return provider; },
    enable() { return provider.request({ method: 'eth_requestAccounts' }); },
    send(a, b) {
      if (typeof a === 'string') return provider.request({ method: a, params: b });
      return provider.request({ method: a.method, params: a.params }).then((result) => ({ id: a.id, jsonrpc: '2.0', result }));
    },
    sendAsync(payload, cb) {
      provider.request({ method: payload.method, params: payload.params })
        .then((result) => cb(null, { id: payload.id, jsonrpc: '2.0', result }))
        .catch((err) => cb(err));
    },
  };

  const emit = (event, data) => (listeners[event] || []).slice().forEach((fn) => { try { fn(data); } catch (e) {} });

  bridge.onEvent((event, data) => {
    if (event === 'chainChanged') { provider.chainId = data; provider.networkVersion = String(parseInt(data, 16)); }
    if (event === 'accountsChanged') provider.selectedAddress = (data && data[0]) || null;
    emit(event, data);
  });

  // Prime synchronous properties some dApps read directly
  provider.request({ method: 'eth_chainId' }).then((id) => {
    provider.chainId = id; provider.networkVersion = String(parseInt(id, 16));
    emit('connect', { chainId: id });
  }).catch(() => {});
  provider.request({ method: 'eth_accounts' }).then((a) => { provider.selectedAddress = (a && a[0]) || null; }).catch(() => {});

  try { Object.defineProperty(window, 'ethereum', { value: provider, writable: true, configurable: true }); }
  catch (e) { try { window.ethereum = provider; } catch (e2) {} }

  // EIP-6963: Multi Injected Provider Discovery (what modern dApps like Uniswap use)
  const uuid = (window.crypto && window.crypto.randomUUID)
    ? window.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#7c5cff"/><path d="M16 22h32a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V26a4 4 0 0 1 4-4zm0-6h28v6H16z" fill="#fff"/><circle cx="42" cy="35" r="3.5" fill="#7c5cff"/></svg>';
  const info = Object.freeze({ uuid, name: 'Multi Messenger Wallet', icon: 'data:image/svg+xml;base64,' + btoa(svg), rdns: 'com.multimessenger.wallet' });
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider }) }));
  window.addEventListener('eip6963:requestProvider', announce);
  announce();
}

try {
  webFrame.executeJavaScript('(' + mainWorldProvider.toString() + ')();');
} catch { /* injection failed; page simply won't see the wallet */ }
