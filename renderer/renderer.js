const $ = (id) => document.getElementById(id);
let ui = { instances: [], folders: [], order: [], catalog: [], version: '', activeId: null, settings: {}, lockEnabled: false };
let selectedAppId = null;

function hideView() { window.api.setOverlay(true); }
function showView() {
  const modalOpen = $('modal') && !$('modal').classList.contains('hidden');
  const drawerOpen = $('drawer') && !$('drawer').classList.contains('hidden');
  const lockOpen = $('lockScreen') && !$('lockScreen').classList.contains('hidden');
  const popupOpen = $('walletPopup') && !$('walletPopup').classList.contains('hidden');
  if (!modalOpen && !drawerOpen && !lockOpen && !popupOpen) window.api.setOverlay(false);
}

function openModal(html) {
  hideView();
  $('modalBox').innerHTML = html;
  $('modal').classList.remove('hidden');
}
function closeModal() {
  $('modal').classList.add('hidden');
  showView();
}
if ($('modal')) $('modal').onclick = (e) => { if (e.target.id === 'modal') closeModal(); };

function openDrawer(title, html) {
  hideView();
  $('drawerTitle').textContent = title;
  $('drawerBody').innerHTML = html;
  $('drawer').classList.remove('hidden');
}
function closeDrawer() {
  $('drawer').classList.add('hidden');
  showView();
}
if ($('drawerClose')) $('drawerClose').onclick = closeDrawer;

function askName(title, value, onOk) {
  openModal('<h3>' + title + '</h3><input id="nameInp" /><button class="primary" id="nameOk">ذخیره</button><button class="ghost" id="nameNo">انصراف</button>');
  $('nameInp').value = value || '';
  $('nameOk').onclick = () => { const v = $('nameInp').value.trim(); closeModal(); if (v) onOk(v); };
  $('nameNo').onclick = closeModal;
  setTimeout(() => $('nameInp').focus(), 50);
}

function bindDrag(el, payload) {
  el.draggable = true;
  el.ondragstart = (e) => e.dataTransfer.setData('text/plain', JSON.stringify(payload));
  el.ondragover = (e) => { e.preventDefault(); el.classList.add('drop-target'); };
  el.ondragleave = () => el.classList.remove('drop-target');
  el.ondrop = (e) => {
    e.preventDefault();
    el.classList.remove('drop-target');
    let data; try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
    if (!data || data.id === payload.id) return;
    if (payload.type === 'folder' && data.type === 'item') window.api.moveToFolder(data.id, payload.id);
    else if (payload.type === 'item' && data.type === 'item') {
      if (e.altKey) window.api.stackItems(data.id, payload.id);
      else window.api.reorderItem(data.id, payload.id);
    }
  };
}

function renderSidebar() {
  const list = $('navList');
  if (!list) return;
  list.innerHTML = '';
  const byId = Object.fromEntries((ui.instances || []).map((i) => [i.instanceId, i]));
  const inFolder = new Set();
  (ui.folders || []).forEach((f) => (f.itemIds || []).forEach((id) => inFolder.add(id)));
  const addBtn = (inst) => {
    const btn = document.createElement('button');
    btn.className = 'service-btn' + (inst.instanceId === ui.activeId ? ' active' : '');
    btn.style.background = inst.color || '#7c5cff';
    btn.title = inst.label;
    btn.innerHTML = typeof iconSvg === 'function' ? iconSvg(inst.appId) : inst.label[0];
    if ((inst.tabs || []).some((t) => !t.muted && ui.audio && ui.audio[inst.instanceId + '::' + t.id])) {
      const dot = document.createElement('span'); dot.className = 'audio-dot'; dot.textContent = '\uD83D\uDD0A'; btn.appendChild(dot);
    }
    btn.onclick = () => window.api.switchInstance(inst.instanceId);
    btn.oncontextmenu = (e) => {
      e.preventDefault();
      window.api.accountMenu(inst.instanceId);
    };
    bindDrag(btn, { type: 'item', id: inst.instanceId });
    list.appendChild(btn);
  };
  (ui.folders || []).forEach((f) => {
    const wrap = document.createElement('div');
    const fb = document.createElement('button');
    fb.className = 'folder-btn';
    fb.textContent = f.open ? 'v' : '>';
    fb.title = f.name;
    fb.onclick = () => window.api.toggleFolder(f.id);
    fb.oncontextmenu = (e) => { e.preventDefault(); window.api.folderMenu(f.id); };
    bindDrag(fb, { type: 'folder', id: f.id });
    wrap.appendChild(fb);
    list.appendChild(wrap);
    if (f.open) (f.itemIds || []).forEach((id) => { if (byId[id]) addBtn(byId[id]); });
  });
  const ordered = (ui.order && ui.order.length) ? ui.order : (ui.instances || []).map((i) => i.instanceId);
  ordered.forEach((id) => { if (byId[id] && !inFolder.has(id)) addBtn(byId[id]); });
}

function renderAddDrawer() {
  selectedAppId = null;
  const apps = (ui.catalog || []).map((a) => '<div class="app-choice" data-id="' + a.appId + '" style="background:' + a.color + '">' + (typeof iconSvg === 'function' ? iconSvg(a.appId) : '') + a.name + '</div>').join('');
  openDrawer('افزودن', '<div class="app-grid">' + apps + '</div><input id="newLabel" placeholder="نام نمایشی" /><input id="customUrl" placeholder="https://" dir="ltr" /><button class="primary" id="doAdd">افزودن</button><button class="ghost" id="doFolder" style="width:100%;margin-top:8px">پوشه جدید</button>');
  document.querySelectorAll('.app-choice').forEach((el) => {
    el.onclick = () => {
      document.querySelectorAll('.app-choice').forEach((x) => x.classList.remove('selected'));
      el.classList.add('selected');
      selectedAppId = el.dataset.id;
    };
  });
  $('doAdd').onclick = () => {
    const label = $('newLabel').value;
    const url = $('customUrl').value.trim();
    if (url) window.api.addInstance({ custom: true, url, label });
    else if (selectedAppId) window.api.addInstance({ appId: selectedAppId, label });
    closeDrawer();
  };
  $('doFolder').onclick = () => askName('نام پوشه', '', (n) => window.api.createFolder(n));
}

function renderSettings(tab) {
  tab = tab || 'gen';
  const s = ui.settings || {};
  const gen = '<p>نسخه نصب‌شده: <b>' + (ui.version || '') + '</b></p><label>زبان</label><select id="langSel"><option value="fa">فارسی</option><option value="en">English</option><option value="ar">العربیة</option><option value="tr">Türkçe</option><option value="zh">中文</option></select><label><input id="notif" type="checkbox"/> اعلان‌ها</label><button class="primary" id="chkUp">بررسی بروزرسانی</button><p id="upMsg" class="muted"></p>';
  const lock = '<h3>رمز و قفل</h3><input id="curPass" type="password" placeholder="رمز فعلی" /><input id="newPass" type="password" placeholder="رمز جدید" /><button class="primary" id="savePass">ذخیره رمز</button><button class="ghost" id="offPass" style="width:100%;margin-top:8px">خاموش کردن قفل</button><button class="primary" id="lockNow" style="margin-top:8px">قفل کردن صفحه</button><h3>قفل خودکار</h3><select id="autoLock"><option value="0">خاموش</option><option value="1">1 دقیقه</option><option value="10">10 دقیقه</option><option value="30">30 دقیقه</option><option value="60">1 ساعت</option><option value="360">6 ساعت</option></select>';
  const help = '<p><b>کیارش قاسمی</b></p><p><a href="#" id="linkX">X</a> · <a href="#" id="linkGh">GitHub</a></p><div class="donate" id="donate">0x2D95679d9354902018af1C51A60633394aAf094E</div><button class="primary" id="copyDonate">کپی آدرس دونیت</button>';
  const body = tab === 'lock' ? lock : tab === 'help' ? help : gen;
  openModal('<div class="tabs"><button data-tab="gen">تنظیمات</button><button data-tab="lock">قفل</button><button data-tab="help">راهنما</button></div><div>' + body + '</div><button class="ghost" id="closeSet">بستن</button>');
  document.querySelectorAll('.tabs button').forEach((b) => {
    if (b.dataset.tab === tab) b.classList.add('on');
    b.onclick = () => renderSettings(b.dataset.tab);
  });
  $('closeSet').onclick = closeModal;
  if (tab === 'gen') {
    $('langSel').value = (s.language || 'fa');
    $('notif').checked = s.notifications !== false;
    $('langSel').onchange = () => window.api.saveSettings({ ...s, language: $('langSel').value });
    $('notif').onchange = () => window.api.saveSettings({ ...s, notifications: $('notif').checked });
    $('chkUp').onclick = async () => {
      const r = await window.api.checkUpdate();
      $('upMsg').textContent = (!r.ok || !r.available) ? ('آخرین نسخه نصب است (' + ((r && r.current) || ui.version) + ')') : ('نسخه جدید ' + r.latest);
      if (r && r.available) await window.api.downloadUpdate(r.url);
    };
  }
  if (tab === 'lock') {
    $('autoLock').value = String(s.autoLockMinutes || 0);
    $('autoLock').onchange = () => window.api.saveSettings({ ...s, autoLockMinutes: Number($('autoLock').value) });
    $('savePass').onclick = async () => { const r = await window.api.setPassword($('curPass').value, $('newPass').value); alert(r.ok ? 'رمز ذخیره شد' : r.error); };
    $('offPass').onclick = async () => { const r = await window.api.disablePassword($('curPass').value); alert(r.ok ? 'قفل خاموش شد' : r.error); };
    $('lockNow').onclick = () => { closeModal(); window.api.lockNow(); };
  }
  if (tab === 'help') {
    $('linkX').onclick = (e) => { e.preventDefault(); window.api.openExternal('https://x.com/GhassemiKiarash'); };
    $('linkGh').onclick = (e) => { e.preventDefault(); window.api.openExternal('https://github.com/ghassemikiarash'); };
    $('copyDonate').onclick = async () => { await navigator.clipboard.writeText($('donate').textContent.trim()); $('copyDonate').textContent = 'کپی شد'; };
  }
}

function activeInstance() { return (ui.instances || []).find((i) => i.instanceId === ui.activeId); }
function activeTabOf(inst) { if (!inst || !inst.tabs || !inst.tabs.length) return null; return inst.tabs.find((t) => t.id === inst.activeTabId) || inst.tabs[0]; }

function renderTabStrip() {
  const strip = $('tabStrip');
  if (!strip) return;
  strip.innerHTML = '';
  const inst = activeInstance();
  if (!inst) return;
  (inst.tabs || []).forEach((t) => {
    const chip = document.createElement('div');
    chip.className = 'tab-chip' + (t.id === inst.activeTabId ? ' active' : '');
    const titleEl = document.createElement('span');
    titleEl.className = 't-title';
    titleEl.textContent = t.title || t.url || 'برگه';
    const audible = !!(ui.audio && ui.audio[inst.instanceId + '::' + t.id]);
    if (t.muted || audible) {
      const au = document.createElement('span');
      au.className = 't-audio' + (t.muted ? ' muted' : '');
      au.textContent = t.muted ? '\uD83D\uDD07' : '\uD83D\uDD0A';
      au.title = t.muted ? 'فعال‌سازی صدای این برگه' : 'بی‌صدا کردن این برگه';
      au.onclick = (e) => { e.stopPropagation(); window.api.toggleMute(inst.instanceId, t.id); };
      chip.appendChild(au);
    }
    chip.appendChild(titleEl);
    if (inst.tabs.length > 1) {
      const closeEl = document.createElement('span');
      closeEl.className = 't-close';
      closeEl.innerHTML = '&times;';
      closeEl.onclick = (e) => { e.stopPropagation(); window.api.closeTab(inst.instanceId, t.id); };
      chip.appendChild(closeEl);
    }
    chip.onclick = () => window.api.switchTab(inst.instanceId, t.id);
    strip.appendChild(chip);
  });
  const addBtn = document.createElement('button');
  addBtn.className = 'tab-new';
  addBtn.textContent = '+';
  addBtn.title = 'برگه جدید';
  addBtn.onclick = () => window.api.newTab(inst.instanceId);
  strip.appendChild(addBtn);
}

function renderToolbar() {
  renderTabStrip();
  renderBookmarksBar();
  const inst = activeInstance();
  const tab = activeTabOf(inst);
  if (inst && inst.instanceId !== actBtnFor) { actBtnFor = inst.instanceId; refreshActivityButton(); }
  updateStar();
  if (walletPopupInstanceId && (!inst || inst.instanceId !== walletPopupInstanceId)) closeWalletPopup();
  if (!$('addressBar')) return;
  if (!inst || !tab) { $('addressBar').value = ''; $('navBack').disabled = true; $('navForward').disabled = true; return; }
  if (document.activeElement !== $('addressBar')) $('addressBar').value = tab.url || '';
}

if ($('navBack')) $('navBack').onclick = () => { const inst = activeInstance(); const tab = activeTabOf(inst); if (inst && tab) window.api.navBack(inst.instanceId, tab.id); };
if ($('navForward')) $('navForward').onclick = () => { const inst = activeInstance(); const tab = activeTabOf(inst); if (inst && tab) window.api.navForward(inst.instanceId, tab.id); };
if ($('navReload')) $('navReload').onclick = () => { const inst = activeInstance(); const tab = activeTabOf(inst); if (inst && tab) window.api.navReload(inst.instanceId, tab.id); };
if ($('addressBar')) $('addressBar').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const inst = activeInstance(); const tab = activeTabOf(inst);
  if (inst && tab) window.api.navigate(inst.instanceId, tab.id, $('addressBar').value);
  $('addressBar').blur();
});

if (window.api.onTabNavUpdate) window.api.onTabNavUpdate((data) => {
  liveNav[data.instanceId + '::' + data.tabId] = { url: data.url, title: data.title };
  updateStar();
  const inst = activeInstance();
  if (!inst || inst.instanceId !== data.instanceId) return;
  if (inst.activeTabId === data.tabId) {
    $('navBack').disabled = !data.canGoBack;
    $('navForward').disabled = !data.canGoForward;
    if (document.activeElement !== $('addressBar')) $('addressBar').value = data.url || '';
  }
  renderTabStrip();
});

let walletPopupInstanceId = null;
function closeWalletPopup() { const el = $('walletPopup'); if (el) { el.classList.add('hidden'); el.innerHTML = ''; } walletPopupInstanceId = null; showView(); }

function renderWalletPopupBody(inst, st) {
  const popup = $('walletPopup');
  let body;
  if (!st.address) {
    body = '<h4>ولت این پروفایل</h4><p class="muted" style="font-size:11px;margin-top:0">' + (inst.label || '') + '</p><label>کلید خصوصی</label><input id="wpPk" type="password" placeholder="0x..." /><button class="primary" id="wpImport">وارد کردن کلید</button><p id="wpErr" class="error"></p><p class="muted" style="font-size:11px">⚠️ کلید فقط برای همین پروفایل، رمزنگاری‌شده روی همین سیستم ذخیره می‌شود و با پروفایل‌های دیگر مشترک نیست.</p>';
  } else {
    const netRows = st.networks.map((n) => {
      const on = !!st.autoSign[n.chainId];
      return '<div class="wnet-row"><span>' + n.name + (n.testnet ? ' <i>(تست)</i>' : '') + '</span><label class="switch"><input type="checkbox" data-chain="' + n.chainId + '" class="wpAutoSign" ' + (on ? 'checked' : '') + ' /><span class="slider"></span></label></div>';
    }).join('');
    body = '<h4>ولت این پروفایل</h4><p class="muted" style="font-size:11px;margin-top:0">' + (inst.label || '') + '</p><code class="addr" style="display:block;margin-bottom:10px">' + st.address + '</code><label>سقف قیمت گس (gwei)</label><input id="wpGasCap" type="number" min="0" placeholder="بدون سقف" value="' + (st.gasCapGwei || '') + '" /><p class="muted" style="font-size:11px;margin:8px 0 0">امضای خودکار به تفکیک شبکه:</p><div id="wpNets" style="margin:4px 0 10px">' + netRows + '</div><button class="ghost" id="wpReveal">نمایش کلید خصوصی</button><button class="ghost danger" id="wpRemove">حذف ولت این پروفایل</button>';
  }
  popup.innerHTML = body;
  if (!st.address) {
    $('wpImport').onclick = async () => {
      const r = await window.api.walletImportKey(inst.instanceId, $('wpPk').value);
      if (r.ok) { const st2 = await window.api.walletGetState(inst.instanceId); renderWalletPopupBody(inst, st2); }
      else $('wpErr').textContent = r.error;
    };
  } else {
    $('wpGasCap').onchange = () => window.api.walletSetGasCap(inst.instanceId, $('wpGasCap').value ? Number($('wpGasCap').value) : null);
    popup.querySelectorAll('.wpAutoSign').forEach((chk) => {
      chk.onchange = async () => {
        const chainId = Number(chk.dataset.chain);
        if (chk.checked) {
          const isTestnet = await window.api.walletIsTestnet(inst.instanceId, chainId);
          if (!isTestnet) {
            const ok = confirm('این شبکه mainnet واقعیه — با روشن کردن امضای خودکار، دیگه هیچ تاییدیه‌ای قبل از تراکنش‌های این پروفایل روی این شبکه نمی‌بینی. مطمئنی؟');
            if (!ok) { chk.checked = false; return; }
          }
        }
        await window.api.walletSetAutoSign(inst.instanceId, chainId, chk.checked);
        refreshActivityButton();
      };
    });
    $('wpReveal').onclick = async () => {
      const r = await window.api.walletRevealKey(inst.instanceId);
      if (r.key) alert('کلید خصوصی این پروفایل:\n' + r.key + '\n\nهرگز این را با کسی به اشتراک نگذارید.');
    };
    $('wpRemove').onclick = async () => {
      if (confirm('ولت این پروفایل حذف بشه؟ اگر جای دیگری از کلید بکاپ نگرفته باشید، دیگر قابل بازیابی نیست.')) {
        await window.api.walletRemove(inst.instanceId);
        const st2 = await window.api.walletGetState(inst.instanceId);
        renderWalletPopupBody(inst, st2);
      }
    };
  }
}

async function toggleWalletPopup() {
  const popup = $('walletPopup');
  if (!popup) return;
  if (!popup.classList.contains('hidden')) { closeWalletPopup(); return; }
  const inst = activeInstance();
  if (!inst) return;
  const st = await window.api.walletGetState(inst.instanceId);
  renderWalletPopupBody(inst, st);
  walletPopupInstanceId = inst.instanceId;
  hideView();
  popup.classList.remove('hidden');
}

document.addEventListener('click', (e) => {
  const popup = $('walletPopup');
  if (!popup || popup.classList.contains('hidden')) return;
  if (popup.contains(e.target) || e.target.id === 'btnWalletProfile') return;
  closeWalletPopup();
});

if ($('btnWalletProfile')) $('btnWalletProfile').onclick = (e) => { e.stopPropagation(); toggleWalletPopup(); };

if (window.api.onWalletConfirmRequest) window.api.onWalletConfirmRequest((req) => {
  const tag = '<p class="muted" style="font-size:11px;margin-top:0">پروفایل: ' + (req.profileLabel || '') + '</p>';
  let body;
  if (req.kind === 'connect') {
    body = '<h3>درخواست اتصال ولت</h3>' + tag + '<p>سایت <b>' + req.origin + '</b> می‌خواهد به آدرس ولت این پروفایل دسترسی داشته باشد.</p>';
  } else if (req.kind === 'tx') {
    let valueEth = '0';
    try { valueEth = (Number(BigInt(req.valueWei || '0x0')) / 1e18).toString(); } catch {}
    body = '<h3>تایید تراکنش</h3>' + tag + '<p>از سایت: <b>' + req.origin + '</b></p><p>شبکه: ' + req.netName + '</p><p>به آدرس: <code class="addr">' + req.to + '</code></p><p>مقدار: ' + valueEth + ' ' + (req.symbol || '') + '</p><p>قیمت گس فعلی: ' + req.gasPriceGwei + ' gwei' + (req.overCap ? ' <b style="color:#ff6b6b">(بالاتر از سقفی که تعیین کرده‌اید)</b>' : '') + '</p>';
  } else if (req.kind === 'sign') {
    body = '<h3>تایید امضای پیام</h3>' + tag + '<p>از سایت: <b>' + req.origin + '</b></p><p style="word-break:break-all">' + String(req.message || '') + '</p>';
  } else {
    body = '<h3>تایید امضا</h3>' + tag + '<p>سایت <b>' + req.origin + '</b> درخواست امضای داده ساخت‌یافته (Typed Data) دارد.</p>';
  }
  openModal(body + '<button class="primary" id="waApprove">تایید</button><button class="ghost" id="waReject">رد</button>');
  $('waApprove').onclick = () => { window.api.walletConfirmResponse(req.id, true); closeModal(); };
  $('waReject').onclick = () => { window.api.walletConfirmResponse(req.id, false); closeModal(); };
});

if ($('btnAdd')) $('btnAdd').onclick = renderAddDrawer;
if ($('btnLock')) $('btnLock').onclick = () => {
  if (ui.lockEnabled) window.api.lockNow();
  else renderSettings('lock');
};
if ($('btnSettings')) $('btnSettings').onclick = () => renderSettings('gen');

if ($('unlockBtn')) $('unlockBtn').onclick = async () => {
  const r = await window.api.unlock($('unlockInput').value);
  if (r.ok) { $('lockScreen').classList.add('hidden'); showView(); }
  else $('unlockErr').textContent = 'رمز اشتباه است';
};

window.api.onBoot((data) => {
  ui.version = data.version;
  if (data.needsLock) { hideView(); $('lockScreen').classList.remove('hidden'); }
});
window.api.onNeedLock(() => { hideView(); $('lockScreen').classList.remove('hidden'); });
if (window.api.onOpenSettings) window.api.onOpenSettings((tab) => renderSettings(tab || 'lock'));
window.api.onUi((data) => { ui = data; renderSidebar(); renderToolbar(); });
window.api.getUi().then((data) => { ui = data; renderSidebar(); renderToolbar(); });

if (window.api.onAskRename) {
  window.api.onAskRename((payload) => {
    if (payload.type === 'bookmark') askName('تغییر نام بوکمارک', payload.value, (n) => window.api.renameBookmark(payload.id, n));
    else if (payload.type === 'instance') askName('تغییر نام', payload.value, (n) => window.api.renameInstance(payload.id, n));
    else askName('نام پوشه', payload.value, (n) => window.api.renameFolder(payload.id, n));
  });
}

if (window.api.onAskDelete) {
  window.api.onAskDelete((instanceId) => {
    const inst = (ui.instances || []).find((i) => i.instanceId === instanceId);
    const name = inst ? inst.label : 'این اکانت';
    if (confirm('«' + name + '» حذف بشه؟ لاگین و اطلاعاتش برای همیشه پاک میشه.')) {
      window.api.removeInstance(instanceId);
    }
  });
}

function showUpdateToast(data) {
  const bar = document.createElement('div');
  bar.className = 'update-toast';
  bar.innerHTML = '<span>نسخه جدید ' + data.latest + ' آماده است</span><button class="primary" id="updNow">بروزرسانی</button><button class="ghost" id="updLater">بعداً</button>';
  document.body.appendChild(bar);
  $('updLater').onclick = () => bar.remove();
  $('updNow').onclick = async () => {
    bar.innerHTML = '<span>در حال دانلود و نصب…</span>';
    const r = await window.api.applyUpdate();
    if (!r.ok) { bar.innerHTML = '<span>' + (r.error || 'بروزرسانی ناموفق بود') + '</span><button class="ghost" id="updClose">بستن</button>'; $('updClose').onclick = () => bar.remove(); }
  };
}
if (window.api.onUpdateAvailable) window.api.onUpdateAvailable(showUpdateToast);

['mousemove', 'keydown', 'click'].forEach((ev) => {
  let last = 0;
  document.addEventListener(ev, () => {
    const now = Date.now();
    if (now - last > 10000) { last = now; window.api.ping(); }
  });
});


/* ======================= Bookmarks ======================= */
const liveNav = {};
let actBtnFor = null;

function currentPage() {
  const inst = activeInstance(); const tab = activeTabOf(inst);
  if (!inst || !tab) return null;
  const l = liveNav[inst.instanceId + '::' + tab.id];
  return { url: (l && l.url) || tab.url, title: (l && l.title) || tab.title };
}
function updateStar() {
  const btn = $('btnBookmark'); if (!btn) return;
  const pg = currentPage();
  const marked = !!(pg && (ui.bookmarks || []).some((b) => b.url === pg.url));
  btn.innerHTML = marked ? '&#9733;' : '&#9734;';
  btn.classList.toggle('starred', marked);
  btn.title = marked ? 'حذف بوکمارک (Ctrl+D)' : 'افزودن بوکمارک (Ctrl+D)';
}
function toggleCurrentBookmark() {
  const pg = currentPage();
  if (pg && /^https?:\/\//i.test(pg.url || '')) window.api.toggleBookmark(pg.title, pg.url);
}
function bmColor(str) {
  let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return 'hsl(' + h + ',55%,48%)';
}
function renderBookmarksBar() {
  const bar = $('bookmarksBar'); if (!bar) return;
  const show = !(ui.settings && ui.settings.showBookmarksBar === false);
  document.documentElement.style.setProperty('--toolbar-h', (show ? 112 : 78) + 'px');
  bar.classList.toggle('hidden', !show);
  if (!show) return;
  bar.innerHTML = '';
  const list = ui.bookmarks || [];
  if (!list.length) {
    const h = document.createElement('span'); h.className = 'bm-hint';
    h.textContent = 'برای افزودن بوکمارک روی ☆ کنار نوار آدرس بزن (Ctrl+D)';
    bar.appendChild(h);
  }
  list.forEach((b) => {
    const chip = document.createElement('button'); chip.className = 'bm-chip'; chip.title = b.title + '\n' + b.url;
    let host = b.url; try { host = new URL(b.url).hostname.replace(/^www\./, ''); } catch {}
    const dot = document.createElement('span'); dot.className = 'bm-dot'; dot.style.background = bmColor(host);
    dot.textContent = (b.title || host).trim().charAt(0).toUpperCase();
    const name = document.createElement('span'); name.className = 'bm-name'; name.textContent = b.title;
    chip.append(dot, name);
    chip.onclick = (e) => window.api.openBookmark(b.url, e.ctrlKey || e.metaKey);
    chip.onauxclick = (e) => { if (e.button === 1) { e.preventDefault(); window.api.openBookmark(b.url, true); } };
    chip.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); window.api.bookmarkMenu(b.id); };
    bar.appendChild(chip);
  });
  bar.oncontextmenu = (e) => { e.preventDefault(); window.api.bookmarksBarMenu(); };
}
if ($('btnBookmark')) $('btnBookmark').onclick = toggleCurrentBookmark;
if (window.api.onShortcut) window.api.onShortcut((name) => {
  if (name === 'bookmark') toggleCurrentBookmark();
  else if (name === 'bookmarks-bar') window.api.toggleBookmarksBar();
});
document.addEventListener('keydown', (e) => {
  if (!e.ctrlKey) return;
  const k = e.key.toLowerCase();
  if (k === 'd' && !e.shiftKey) { e.preventDefault(); toggleCurrentBookmark(); }
  else if (k === 'b' && e.shiftKey) { e.preventDefault(); window.api.toggleBookmarksBar(); }
});

/* ======================= Per-tab audio ======================= */
if (window.api.onTabAudio) window.api.onTabAudio(({ instanceId, tabId, audible }) => {
  ui.audio = ui.audio || {};
  ui.audio[instanceId + '::' + tabId] = audible;
  renderSidebar();
  const inst = activeInstance();
  if (inst && inst.instanceId === instanceId) renderTabStrip();
});

/* ======================= Wallet activity side panel ======================= */
let actOpen = false;
let actList = [];
const ACT_DEFAULT_PCT = 0.2;
const KIND_LABEL = { tx: 'تراکنش', sign: 'امضای پیام', 'sign-typed': 'امضای داده (Typed)', connect: 'اتصال سایت', 'switch-chain': 'تغییر شبکه', 'add-chain': 'افزودن شبکه', rpc: 'درخواست RPC' };
const STATUS_ICON = { ok: '\u2705', error: '\u274C', blocked: '\u26D4', rejected: '\u270B' };

function actPct() { const p = ui.settings && ui.settings.activityPanelPct; return (typeof p === 'number' && p > 0.08 && p < 0.6) ? p : ACT_DEFAULT_PCT; }
function applyActWidth(px) {
  px = Math.max(220, Math.min(px, Math.round(window.innerWidth * 0.6)));
  document.documentElement.style.setProperty('--act-w', px + 'px');
  return px;
}
const shortStr = (a, h, t) => (a && a.length > h + t + 1) ? a.slice(0, h) + '…' + a.slice(-t) : (a || '');
const hostOf = (o) => { try { return new URL(o).host; } catch { return o || ''; } };

function actItemEl(e) {
  const d = document.createElement('div'); d.className = 'act-item ' + (e.status || '');
  const row = document.createElement('div'); row.className = 'act-row';
  const kind = document.createElement('span'); kind.className = 'act-kind';
  kind.textContent = (STATUS_ICON[e.status] || '•') + ' ' + (KIND_LABEL[e.kind] || e.kind);
  if (e.auto) { const b = document.createElement('span'); b.className = 'act-badge'; b.textContent = 'خودکار'; kind.appendChild(b); }
  const time = document.createElement('span'); time.className = 'act-time'; time.textContent = new Date(e.ts).toLocaleTimeString('en-GB');
  row.append(kind, time); d.appendChild(row);
  const meta = [];
  if (e.netName) meta.push(e.netName);
  if (e.value) meta.push(e.value);
  if (e.to) meta.push('به ' + shortStr(e.to, 6, 4));
  if (e.gasGwei) meta.push('گس ' + e.gasGwei + ' gwei');
  if (e.kind === 'rpc' && e.method) meta.push(e.method);
  if (e.origin) meta.push(hostOf(e.origin));
  if (meta.length) { const m = document.createElement('div'); m.className = 'act-meta'; m.textContent = meta.join(' · '); d.appendChild(m); }
  if (e.message) { const m = document.createElement('div'); m.className = 'act-msg'; m.textContent = e.message; d.appendChild(m); }
  if (e.hash) {
    const h = document.createElement('div'); h.className = 'act-hash'; h.textContent = shortStr(e.hash, 12, 8); h.title = 'کلیک: کپی هش تراکنش\n' + e.hash;
    h.onclick = () => { try { navigator.clipboard.writeText(e.hash); h.textContent = 'کپی شد ✓'; setTimeout(() => { h.textContent = shortStr(e.hash, 12, 8); }, 1200); } catch {} };
    d.appendChild(h);
  }
  return d;
}
function renderActivityList() {
  const list = $('actList'); if (!list) return;
  const f = $('actFilter').value;
  let items = actList.slice().reverse();
  if (f === 'bad') items = items.filter((x) => x.status === 'error' || x.status === 'blocked');
  list.innerHTML = '';
  if (!items.length) {
    const em = document.createElement('div'); em.className = 'act-empty';
    em.textContent = f === 'bad' ? 'هیچ خطایی ثبت نشده 👌' : 'هنوز فعالیتی ثبت نشده.\nوقتی سایتی تراکنش یا امضا بخواد، اینجا زنده می‌بینی.';
    list.appendChild(em); return;
  }
  items.forEach((e) => list.appendChild(actItemEl(e)));
}
async function loadActivityForActive() {
  const inst = activeInstance(); if (!inst) return;
  $('actProfile').textContent = inst.label || '';
  actList = (await window.api.walletGetActivity(inst.instanceId)) || [];
  renderActivityList();
}
async function openActivityPanel() {
  if (!activeInstance()) return;
  actOpen = true;
  $('activityPanel').classList.remove('hidden');
  $('btnWalletActivity').classList.add('open'); $('btnWalletActivity').classList.remove('has-alert');
  window.api.setRightPanel(applyActWidth(Math.round(window.innerWidth * actPct())));
  await loadActivityForActive();
}
function closeActivityPanel() {
  if (!actOpen) return;
  actOpen = false;
  $('activityPanel').classList.add('hidden');
  $('btnWalletActivity').classList.remove('open');
  window.api.setRightPanel(0);
}
async function refreshActivityButton() {
  const btn = $('btnWalletActivity'); if (!btn) return;
  const inst = activeInstance();
  if (!inst) { btn.classList.add('hidden'); closeActivityPanel(); return; }
  const st = await window.api.walletGetState(inst.instanceId);
  const cur = activeInstance();
  if (!cur || cur.instanceId !== inst.instanceId) return;           // profile changed meanwhile
  const any = !!st.address && Object.values(st.autoSign || {}).some(Boolean);
  btn.classList.toggle('hidden', !any);
  if (!any) { btn.classList.remove('has-alert'); closeActivityPanel(); }
  else if (actOpen) loadActivityForActive();
}
if ($('btnWalletActivity')) $('btnWalletActivity').onclick = () => (actOpen ? closeActivityPanel() : openActivityPanel());
if ($('actClose')) $('actClose').onclick = closeActivityPanel;
if ($('actFilter')) $('actFilter').onchange = renderActivityList;
if ($('actClear')) $('actClear').onclick = async () => {
  const inst = activeInstance(); if (!inst) return;
  if (confirm('لاگ اکتیویتی این پروفایل پاک بشه؟')) { await window.api.walletClearActivity(inst.instanceId); actList = []; renderActivityList(); }
};
if (window.api.onWalletActivity) window.api.onWalletActivity(({ instanceId, entry }) => {
  const inst = activeInstance();
  if (!inst || inst.instanceId !== instanceId) return;
  if (actOpen) { actList.push(entry); if (actList.length > 200) actList.shift(); renderActivityList(); }
  else if (entry.status === 'error' || entry.status === 'blocked') { const b = $('btnWalletActivity'); if (b) b.classList.add('has-alert'); }
});
window.addEventListener('resize', () => { if (actOpen) window.api.setRightPanel(applyActWidth(Math.round(window.innerWidth * actPct()))); });

// Drag the left edge to resize. The page view is hidden while dragging so mouse events reach this document.
if ($('actResizer')) {
  const rz = $('actResizer');
  rz.addEventListener('mousedown', (e) => {
    e.preventDefault(); rz.classList.add('drag'); hideView();
    const move = (ev) => applyActWidth(window.innerWidth - ev.clientX);
    const up = () => {
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      rz.classList.remove('drag');
      const px = parseInt(getComputedStyle($('activityPanel')).width, 10) || Math.round(window.innerWidth * ACT_DEFAULT_PCT);
      window.api.setRightPanel(px);
      window.api.saveSettings({ activityPanelPct: px / window.innerWidth });
      showView();
    };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  });
  rz.addEventListener('dblclick', () => {
    window.api.saveSettings({ activityPanelPct: ACT_DEFAULT_PCT });
    window.api.setRightPanel(applyActWidth(Math.round(window.innerWidth * ACT_DEFAULT_PCT)));
  });
}
