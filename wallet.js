const path = require('path');
const fs = require('fs');
const { safeStorage } = require('electron');
const { ethers } = require('ethers');

const BUILTIN_NETWORKS = [
  { chainId: 1, name: 'Ethereum', rpc: 'https://eth.llamarpc.com', symbol: 'ETH', testnet: false, explorer: 'https://etherscan.io' },
  { chainId: 56, name: 'BNB Smart Chain', rpc: 'https://bsc-dataseed.binance.org', symbol: 'BNB', testnet: false, explorer: 'https://bscscan.com' },
  { chainId: 137, name: 'Polygon', rpc: 'https://polygon-rpc.com', symbol: 'MATIC', testnet: false, explorer: 'https://polygonscan.com' },
  { chainId: 42161, name: 'Arbitrum One', rpc: 'https://arb1.arbitrum.io/rpc', symbol: 'ETH', testnet: false, explorer: 'https://arbiscan.io' },
  { chainId: 10, name: 'Optimism', rpc: 'https://mainnet.optimism.io', symbol: 'ETH', testnet: false, explorer: 'https://optimistic.etherscan.io' },
  { chainId: 8453, name: 'Base', rpc: 'https://mainnet.base.org', symbol: 'ETH', testnet: false, explorer: 'https://basescan.org' },
  { chainId: 11155111, name: 'Sepolia (تست‌نت)', rpc: 'https://rpc.sepolia.org', symbol: 'ETH', testnet: true, explorer: 'https://sepolia.etherscan.io' },
  { chainId: 97, name: 'BSC Testnet (تست‌نت)', rpc: 'https://data-seed-prebsc-1-s1.binance.org:8545', symbol: 'tBNB', testnet: true, explorer: 'https://testnet.bscscan.com' },
  { chainId: 80002, name: 'Polygon Amoy (تست‌نت)', rpc: 'https://rpc-amoy.polygon.technology', symbol: 'MATIC', testnet: true, explorer: 'https://amoy.polygonscan.com' },
];

function providerError(code, message) { const e = new Error(message); e.code = code; return e; }

const pendingConfirms = {};
function resolveConfirm(id, approved) {
  if (pendingConfirms[id]) { pendingConfirms[id](approved); delete pendingConfirms[id]; }
}

function createWallet({ instanceId, getLabel, userDataPath, getMainWindow, broadcastToPages }) {
  const settingsPath = path.join(userDataPath, 'wallet-settings.json');
  const keyPath = path.join(userDataPath, 'wallet-key.enc');
  let signer = null;
  let settings = { chainId: 1, networks: [], autoSign: {}, gasCapGwei: null, approvedOrigins: [] };
  const providersCache = {};

  function loadSettings() {
    try {
      const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      settings = {
        chainId: raw.chainId || 1,
        networks: Array.isArray(raw.networks) ? raw.networks : [],
        autoSign: raw.autoSign && typeof raw.autoSign === 'object' ? raw.autoSign : {},
        gasCapGwei: typeof raw.gasCapGwei === 'number' ? raw.gasCapGwei : null,
        approvedOrigins: Array.isArray(raw.approvedOrigins) ? raw.approvedOrigins : [],
      };
    } catch { /* keep defaults */ }
  }
  function saveSettings() { try { fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2)); } catch {} }

  function loadKey() {
    try {
      if (!fs.existsSync(keyPath) || !safeStorage.isEncryptionAvailable()) return null;
      const enc = fs.readFileSync(keyPath);
      const pk = safeStorage.decryptString(enc);
      signer = new ethers.Wallet(pk);
      return signer.address;
    } catch { return null; }
  }

  function allNetworks() { return BUILTIN_NETWORKS.concat(settings.networks); }
  function getNetwork(chainId) { return allNetworks().find((n) => n.chainId === chainId); }
  function getProvider(chainId) {
    if (providersCache[chainId]) return providersCache[chainId];
    const net = getNetwork(chainId);
    if (!net) throw providerError(4902, 'شبکه ناشناخته');
    const p = new ethers.JsonRpcProvider(net.rpc, chainId);
    providersCache[chainId] = p;
    return p;
  }

  function importPrivateKey(pk) {
    const clean = String(pk || '').trim();
    const w = new ethers.Wallet(clean); // throws on invalid key
    if (!safeStorage.isEncryptionAvailable()) throw new Error('رمزنگاری امن سیستم در دسترس نیست، نمی‌توان کلید را ذخیره کرد');
    const enc = safeStorage.encryptString(clean);
    fs.writeFileSync(keyPath, enc);
    signer = w;
    broadcastToPages('accountsChanged', [w.address]);
    return w.address;
  }
  function removeWallet() {
    try { fs.unlinkSync(keyPath); } catch {}
    signer = null;
    settings.approvedOrigins = [];
    saveSettings();
    broadcastToPages('accountsChanged', []);
  }
  function revealPrivateKey() {
    if (!fs.existsSync(keyPath) || !safeStorage.isEncryptionAvailable()) return null;
    try { return safeStorage.decryptString(fs.readFileSync(keyPath)); } catch { return null; }
  }

  function openConfirm(payload) {
    return new Promise((resolve) => {
      const id = 'req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      pendingConfirms[id] = resolve;
      const mw = getMainWindow();
      if (mw && !mw.isDestroyed()) mw.webContents.send('wallet-confirm-request', { id, instanceId, profileLabel: getLabel ? getLabel() : instanceId, ...payload });
      else resolve(false);
    });
  }

  async function handleRequest({ origin, method, params }) {
    params = params || [];
    switch (method) {
      case 'eth_chainId': return '0x' + settings.chainId.toString(16);
      case 'net_version': return String(settings.chainId);
      case 'eth_accounts': return signer && settings.approvedOrigins.includes(origin) ? [signer.address] : [];
      case 'eth_requestAccounts': {
        if (!signer) throw providerError(4100, 'هیچ ولتی وصل نیست — از تنظیمات، کلید خصوصی وارد کنید');
        if (!settings.approvedOrigins.includes(origin)) {
          const ok = await openConfirm({ kind: 'connect', origin });
          if (!ok) throw providerError(4001, 'کاربر درخواست اتصال را رد کرد');
          settings.approvedOrigins.push(origin); saveSettings();
        }
        return [signer.address];
      }
      case 'wallet_switchEthereumChain': {
        const chainId = parseInt(params[0].chainId, 16);
        if (!getNetwork(chainId)) throw providerError(4902, 'این شبکه هنوز اضافه نشده');
        settings.chainId = chainId; saveSettings();
        broadcastToPages('chainChanged', '0x' + chainId.toString(16));
        return null;
      }
      case 'wallet_addEthereumChain': {
        const p = params[0];
        const chainId = parseInt(p.chainId, 16);
        if (!getNetwork(chainId)) {
          settings.networks.push({ chainId, name: p.chainName || ('Chain ' + chainId), rpc: (p.rpcUrls || [])[0], symbol: (p.nativeCurrency && p.nativeCurrency.symbol) || 'ETH', testnet: false, explorer: (p.blockExplorerUrls || [])[0] || '' });
          saveSettings();
        }
        settings.chainId = chainId; saveSettings();
        broadcastToPages('chainChanged', '0x' + chainId.toString(16));
        return null;
      }
      case 'eth_sendTransaction': {
        if (!signer) throw providerError(4100, 'هیچ ولتی وصل نیست');
        const tx = params[0];
        const chainId = settings.chainId;
        const net = getNetwork(chainId);
        const provider = getProvider(chainId);
        const connected = signer.connect(provider);
        const feeData = await provider.getFeeData();
        const gasPriceWei = feeData.maxFeePerGas || feeData.gasPrice || 0n;
        const gasPriceGwei = Number(ethers.formatUnits(gasPriceWei, 'gwei'));
        const cap = settings.gasCapGwei;
        const overCap = !!cap && gasPriceGwei > cap;
        const auto = !!settings.autoSign[chainId];
        if (auto && overCap) throw providerError(-32000, 'قیمت گس فعلی (' + gasPriceGwei.toFixed(1) + ' gwei) بالاتر از سقفی است که تعیین کرده‌اید — تراکنش ارسال نشد');
        if (!auto) {
          const approved = await openConfirm({ kind: 'tx', origin, chainId, netName: net ? net.name : chainId, symbol: net ? net.symbol : '', to: tx.to, valueWei: tx.value || '0x0', data: tx.data || '0x', gasPriceGwei: gasPriceGwei.toFixed(2), overCap });
          if (!approved) throw providerError(4001, 'کاربر تراکنش را رد کرد');
        }
        const sent = await connected.sendTransaction({ to: tx.to, value: tx.value ? BigInt(tx.value) : 0n, data: tx.data || '0x', gasLimit: tx.gas ? BigInt(tx.gas) : undefined });
        return sent.hash;
      }
      case 'personal_sign': {
        if (!signer) throw providerError(4100, 'هیچ ولتی وصل نیست');
        const auto = !!settings.autoSign[settings.chainId];
        if (!auto) { const ok = await openConfirm({ kind: 'sign', origin, message: params[0] }); if (!ok) throw providerError(4001, 'رد شد'); }
        return await signer.signMessage(ethers.isBytesLike(params[0]) ? ethers.getBytes(params[0]) : params[0]);
      }
      case 'eth_signTypedData_v4': {
        if (!signer) throw providerError(4100, 'هیچ ولتی وصل نیست');
        const auto = !!settings.autoSign[settings.chainId];
        if (!auto) { const ok = await openConfirm({ kind: 'sign-typed', origin }); if (!ok) throw providerError(4001, 'رد شد'); }
        const typed = JSON.parse(params[1]);
        const types = { ...typed.types };
        delete types.EIP712Domain;
        return await signer.signTypedData(typed.domain, types, typed.message);
      }
      default: {
        const provider = getProvider(settings.chainId);
        return await provider.send(method, params);
      }
    }
  }

  loadSettings();
  loadKey();

  return {
    handleRequest,
    importPrivateKey,
    removeWallet,
    revealPrivateKey,
    getAddress: () => (signer ? signer.address : null),
    getPublicState: () => ({
      address: signer ? signer.address : null,
      chainId: settings.chainId,
      networks: allNetworks(),
      autoSign: settings.autoSign,
      gasCapGwei: settings.gasCapGwei,
    }),
    setChain: (chainId) => { if (getNetwork(chainId)) { settings.chainId = chainId; saveSettings(); broadcastToPages('chainChanged', '0x' + chainId.toString(16)); } },
    setAutoSign: (chainId, value) => { settings.autoSign[chainId] = !!value; saveSettings(); },
    setGasCap: (gwei) => { settings.gasCapGwei = (gwei === null || gwei === '' ? null : Number(gwei)); saveSettings(); },
    isTestnet: (chainId) => { const n = getNetwork(chainId); return !!(n && n.testnet); },
  };
}

module.exports = { createWallet, resolveConfirm, BUILTIN_NETWORKS };
