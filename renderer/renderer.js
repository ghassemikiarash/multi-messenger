const $ = (id) => document.getElementById(id);
let ui = { instances: [], folders: [], order: [], catalog: [], version: '', activeId: null, settings: {}, lockEnabled: false };
let selectedAppId = null;

function hideView() { window.api.setOverlay(true); }
function showView() {
  const modalOpen = $('modal') && !$('modal').classList.contains('hidden');
  const drawerOpen = $('drawer') && !$('drawer').classList.contains('hidden');
  const lockOpen = $('lockScreen') && !$('lockScreen').classList.contains('hidden');
  if (!modalOpen && !drawerOpen && !lockOpen) window.api.setOverlay(false);
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
    else if (payload.type === 'item' && data.type === 'item') window.api.stackItems(data.id, payload.id);
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
window.api.onUi((data) => { ui = data; renderSidebar(); });
window.api.getUi().then((data) => { ui = data; renderSidebar(); });

if (window.api.onAskRename) {
  window.api.onAskRename((payload) => {
    if (payload.type === 'instance') askName('تغییر نام', payload.value, (n) => window.api.renameInstance(payload.id, n));
    else askName('نام پوشه', payload.value, (n) => window.api.renameFolder(payload.id, n));
  });
}
