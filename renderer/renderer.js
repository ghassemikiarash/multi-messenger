const $ = (id) => document.getElementById(id);
let ui = { instances: [], folders: [], order: [], catalog: [], version: '', activeId: null, settings: {} };
let selectedAppId = null;
function T(k) { return (typeof t === 'function') ? t(k) : k; }
function hideView() { window.api.setOverlay(true); }
function showView() {
  if ($('drawer').classList.contains('hidden') && (!$('modal') || $('modal').classList.contains('hidden')) && $('lockScreen').classList.contains('hidden')) {
    window.api.setOverlay(false);
  }
}
function closeCtx() { $('ctx').classList.add('hidden'); }
document.addEventListener('click', closeCtx);
function showCtx(x, y, buttons) {
  hideView();
  const el = $('ctx');
  el.innerHTML = '';
  buttons.forEach((b) => {
    const btn = document.createElement('button');
    btn.textContent = b.label;
    if (b.danger) btn.className = 'danger';
    btn.onclick = (e) => { e.stopPropagation(); closeCtx(); b.fn(); };
    el.appendChild(btn);
  });
  el.classList.remove('hidden');
  el.style.left = Math.min(x, innerWidth - 210) + 'px';
  el.style.top = Math.min(y, innerHeight - 200) + 'px';
}
function askName(title, value, onOk) {
  hideView();
  const name = window.prompt(title, value || '');
  if ($('drawer').classList.contains('hidden') && $('lockScreen').classList.contains('hidden')) showView();
  if (name) onOk(name);
}
function openDrawer(title, html) {
  hideView();
  $('drawerTitle').textContent = title;
  $('drawerBody').innerHTML = html;
  $('drawer').classList.remove('hidden');
}
function closeDrawer() { $('drawer').classList.add('hidden'); showView(); }
if ($('drawerClose')) $('drawerClose').onclick = closeDrawer;
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
    else if (payload.type === 'item' && data.type === 'item' && window.api.stackItems) window.api.stackItems(data.id, payload.id);
  };
}
function renderSidebar() {
  const list = $('navList');
  list.innerHTML = '';
  const byId = Object.fromEntries(ui.instances.map((i) => [i.instanceId, i]));
  const inFolder = new Set();
  (ui.folders || []).forEach((f) => (f.itemIds || []).forEach((id) => inFolder.add(id)));
  const addBtn = (inst) => {
    const btn = document.createElement('button');
    btn.className = 'service-btn' + (inst.instanceId === ui.activeId ? ' active' : '');
    btn.style.background = inst.color || '#7c5cff';
    btn.title = inst.label;
    btn.innerHTML = iconSvg(inst.appId);
    btn.onclick = () => window.api.switchInstance(inst.instanceId);
    btn.oncontextmenu = (e) => {
      e.preventDefault();
      showCtx(e.clientX, e.clientY, [
        { label: T('rename') || 'تغییر نام', fn: () => askName('نام جدید', inst.label, (n) => window.api.renameInstance(inst.instanceId, n)) },
        ...(ui.folders || []).map((f) => ({ label: f.name, fn: () => window.api.moveToFolder(inst.instanceId, f.id) })),
        { label: 'خارج از پوشه', fn: () => window.api.moveToFolder(inst.instanceId, null) },
        { label: 'حذف', danger: true, fn: () => { if (confirm('حذف؟')) window.api.removeInstance(inst.instanceId); showView(); } }
      ]);
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
    fb.oncontextmenu = (e) => {
      e.preventDefault();
      showCtx(e.clientX, e.clientY, [
        { label: 'تغییر نام پوشه', fn: () => askName('پوشه', f.name, (n) => window.api.renameFolder(f.id, n)) },
        { label: 'حذف پوشه', danger: true, fn: () => window.api.deleteFolder(f.id) }
      ]);
    };
    bindDrag(fb, { type: 'folder', id: f.id });
    wrap.appendChild(fb);
    list.appendChild(wrap);
    if (f.open) (f.itemIds || []).forEach((id) => { if (byId[id]) addBtn(byId[id]); });
  });
  const ordered = ui.order.length ? ui.order : ui.instances.map((i) => i.instanceId);
  ordered.forEach((id) => { if (byId[id] && !inFolder.has(id)) addBtn(byId[id]); });
}
function renderAddDrawer() {
  selectedAppId = null;
  const apps = (ui.catalog || []).map((a) => '<div class="app-choice" data-id="' + a.appId + '" style="background:' + a.color + '">' + iconSvg(a.appId) + a.name + '</div>').join('');
  openDrawer('افزودن', '<div class="app-grid">' + apps + '</div><input id="newLabel" placeholder="نام" /><input id="customUrl" placeholder="https://" dir="ltr" /><button class="primary" id="doAdd">افزودن</button><button class="ghost" id="doFolder" style="width:100%;margin-top:8px">پوشه جدید</button>');
  document.querySelectorAll('.app-choice').forEach((el) => {
    el.onclick = () => { document.querySelectorAll('.app-choice').forEach((x) => x.classList.remove('selected')); el.classList.add('selected'); selectedAppId = el.dataset.id; };
  });
  $('doAdd').onclick = () => {
    const label = $('newLabel').value;
    const url = $('customUrl').value.trim();
    if (url) window.api.addInstance({ custom: true, url, label });
    else if (selectedAppId) window.api.addInstance({ appId: selectedAppId, label });
    closeDrawer();
  };
  $('doFolder').onclick = () => askName('پوشه', '', (n) => window.api.createFolder(n));
}
if ($('btnAdd')) $('btnAdd').onclick = renderAddDrawer;
if ($('btnLock')) $('btnLock').onclick = () => window.api.lockNow();
if ($('btnSettings')) $('btnSettings').onclick = () => {
  hideView();
  openDrawer('تنظیمات', '<p>نسخه: <b>' + (ui.version || '') + '</b></p><button class="primary" id="chkUp">بررسی بروزرسانی</button><p id="upMsg" class="muted"></p>');
  $('chkUp').onclick = async () => {
    const r = await window.api.checkUpdate();
    $('upMsg').textContent = (!r.ok || !r.available) ? ('آخرین نسخه نصب است (' + ((r && r.current) || ui.version) + ')') : ('نسخه جدید ' + r.latest);
    if (r.available) await window.api.downloadUpdate(r.url);
  };
};
if ($('unlockBtn')) $('unlockBtn').onclick = async () => {
  const r = await window.api.unlock($('unlockInput').value);
  if (r.ok) { $('lockScreen').classList.add('hidden'); showView(); }
  else $('unlockErr').textContent = 'رمز اشتباه است';
};
window.api.onBoot((data) => { ui.version = data.version; if (data.needsLock) { hideView(); $('lockScreen').classList.remove('hidden'); } });
window.api.onNeedLock(() => { hideView(); $('lockScreen').classList.remove('hidden'); });
window.api.onUi((data) => { ui = data; renderSidebar(); });
window.api.getUi().then((data) => { ui = data; renderSidebar(); });
