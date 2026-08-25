const $ = (id) => document.getElementById(id);
let ui = { instances: [], folders: [], order: [], catalog: [], version: '', activeId: null };
let selectedAppId = null;

function closeCtx() { $('ctx').classList.add('hidden'); }
document.addEventListener('click', closeCtx);

function showCtx(x, y, buttons) {
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
  const w = 200, h = buttons.length * 36 + 16;
  el.style.left = Math.min(x, window.innerWidth - w) + 'px';
  el.style.top = Math.min(y, window.innerHeight - h) + 'px';
}

function openDrawer(title, html) {
  $('drawerTitle').textContent = title;
  $('drawerBody').innerHTML = html;
  $('drawer').classList.remove('hidden');
  window.api.setOverlay(true);
}

function closeDrawer() {
  $('drawer').classList.add('hidden');
  window.api.setOverlay(false);
}
$('drawerClose').onclick = closeDrawer;

function renderSidebar() {
  const list = $('navList');
  list.innerHTML = '';
  const byId = Object.fromEntries(ui.instances.map((i) => [i.instanceId, i]));
  const inFolder = new Set();
  ui.folders.forEach((f) => (f.itemIds || []).forEach((id) => inFolder.add(id)));

  const addBtn = (inst) => {
    const btn = document.createElement('button');
    btn.className = 'service-btn' + (inst.instanceId === ui.activeId ? ' active' : '');
    btn.style.background = inst.color || '#7c5cff';
    btn.title = inst.label;
    btn.innerHTML = iconSvg(inst.appId);
    btn.onclick = () => window.api.switchInstance(inst.instanceId);
    btn.oncontextmenu = (e) => {
      e.preventDefault();
      const folderBtns = ui.folders.map((f) => ({
        label: 'انتقال به ' + f.name,
        fn: () => window.api.moveToFolder(inst.instanceId, f.id),
      }));
      showCtx(e.clientX, e.clientY, [
        { label: 'تغییر نام', fn: () => {
          const n = prompt('نام جدید', inst.label);
          if (n) window.api.renameInstance(inst.instanceId, n);
        } },
        ...folderBtns,
        { label: 'خارج از پوشه', fn: () => window.api.moveToFolder(inst.instanceId, null) },
        { label: 'حذف اکانت', danger: true, fn: () => {
          if (confirm('حذف «' + inst.label + '»؟ نشست لاگین پاک می‌شود.')) {
            window.api.removeInstance(inst.instanceId);
          }
        } },
      ]);
    };
    list.appendChild(btn);
  };

  ui.folders.forEach((f) => {
    const wrap = document.createElement('div');
    const fb = document.createElement('button');
    fb.className = 'folder-btn';
    fb.textContent = f.open ? '▾' : '▸';
    fb.title = f.name;
    fb.onclick = () => window.api.toggleFolder(f.id);
    fb.oncontextmenu = (e) => {
      e.preventDefault();
      showCtx(e.clientX, e.clientY, [
        { label: 'تغییر نام پوشه', fn: () => {
          const n = prompt('نام پوشه', f.name);
          if (n) window.api.renameFolder(f.id, n);
        } },
        { label: 'حذف پوشه', danger: true, fn: () => window.api.deleteFolder(f.id) },
      ]);
    };
    wrap.appendChild(fb);
    if (f.open) {
      const inner = document.createElement('div');
      inner.className = 'folder-items';
      wrap.appendChild(inner);
      (f.itemIds || []).forEach((id) => {
        if (byId[id]) {
          const tempList = list;
          // render into inner
          const holder = document.createElement('div');
          list.appendChild(wrap);
        }
      });
    }
    list.appendChild(wrap);
    if (f.open) {
      (f.itemIds || []).forEach((id) => { if (byId[id]) addBtn(byId[id]); });
    }
  });

  const ordered = (ui.order.length ? ui.order : ui.instances.map((i) => i.instanceId));
  ordered.forEach((id) => {
    const inst = byId[id];
    if (inst && !inFolder.has(id)) addBtn(inst);
  });
  ui.instances.forEach((inst) => {
    if (!ordered.includes(inst.instanceId) && !inFolder.has(inst.instanceId)) addBtn(inst);
  });
}

function renderAddDrawer() {
  selectedAppId = null;
  const apps = (ui.catalog || []).map((a) => `
    <div class="app-choice" data-id="${a.appId}" style="background:${a.color}">
      ${iconSvg(a.appId)}
      ${a.name}
    </div>`).join('');
  openDrawer('افزودن سرویس', `
    <div class="app-grid">${apps}</div>
    <label>نام نمایشی</label>
    <input id="newLabel" placeholder="مثلاً تلگرام کاری" />
    <label>یا آدرس سفارشی (https)</label>
    <input id="customUrl" placeholder="https://www.tradingview.com/" dir="ltr" />
    <button class="primary" id="doAdd">افزودن</button>
    <button class="ghost" id="doFolder" style="width:100%;margin-top:8px">ساخت پوشه جدید</button>
  `);
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
  $('doFolder').onclick = () => {
    const n = prompt('نام پوشه', 'کاری');
    if (n) window.api.createFolder(n);
  };
}

function renderHelp() {
  openDrawer('درباره سازنده', `
    <div class="help">
      <p><b>کیارش قاسمی</b></p>
      <p class="muted">نسخه نصب‌شده: <b>${ui.version || ''}</b></p>
      <p><a href="#" id="linkX">توییتر / X</a></p>
      <p><a href="#" id="linkGh">گیت‌هاب</a></p>
      <p>حمایت با ارز دیجیتال:</p>
      <div class="donate" id="donate">0x2D95679d9354902018af1C51A60633394aAf094E</div>
      <button class="primary" id="copyDonate">کپی آدرس دونیت</button>
      <hr style="border-color:#2a2f3a;margin:18px 0" />
      <p>رمز عبور ورود</p>
      <input id="curPass" type="password" placeholder="رمز فعلی (اگر دارید)" />
      <input id="newPass" type="password" placeholder="رمز جدید" />
      <button class="primary" id="savePass">ذخیره رمز</button>
      <button class="ghost" id="offPass" style="width:100%;margin-top:8px">خاموش کردن قفل</button>
      <hr style="border-color:#2a2f3a;margin:18px 0" />
      <button class="primary" id="chkUp">بررسی بروزرسانی از گیت‌هاب</button>
      <p id="upMsg" class="muted"></p>
    </div>
  `);
  $('linkX').onclick = (e) => { e.preventDefault(); window.api.openExternal('https://x.com/GhassemiKiarash'); };
  $('linkGh').onclick = (e) => { e.preventDefault(); window.api.openExternal('https://github.com/ghassemikiarash'); };
  $('copyDonate').onclick = async () => {
    await navigator.clipboard.writeText($('donate').textContent.trim());
    $('copyDonate').textContent = 'کپی شد';
  };
  $('savePass').onclick = async () => {
    const r = await window.api.setPassword($('curPass').value, $('newPass').value);
    alert(r.ok ? 'رمز ذخیره شد' : r.error);
  };
  $('offPass').onclick = async () => {
    const cur = $('curPass').value;
    const r = await window.api.disablePassword(cur);
    alert(r.ok ? 'قفل خاموش شد' : r.error);
  };
  $('chkUp').onclick = async () => {
    $('upMsg').textContent = 'در حال بررسی...';
    const r = await window.api.checkUpdate();
    if (!r.ok) { $('upMsg').textContent = 'خطا: ' + (r.error || ''); return; }
    if (r.available) {
      $('upMsg').textContent = 'نسخه جدید ' + r.latest + ' — در حال دانلود';
      const d = await window.api.downloadUpdate();
      $('upMsg').textContent = d.ok ? 'دانلود شد. بعد از بستن برنامه نصب می‌شود.' : ('خطا: ' + d.error);
    } else {
      $('upMsg').textContent = 'نسخه فعلی به‌روز است (' + r.current + ')';
    }
  };
}

$('btnAdd').onclick = renderAddDrawer;
$('btnHelp').onclick = renderHelp;
$('btnLock').onclick = () => window.api.lockNow();

$('unlockBtn').onclick = async () => {
  const r = await window.api.unlock($('unlockInput').value);
  if (r.ok) $('lockScreen').classList.add('hidden');
  else $('unlockErr').textContent = 'رمز اشتباه است';
};

window.api.onBoot((data) => {
  ui.version = data.version;
  if (data.needsLock) $('lockScreen').classList.remove('hidden');
});
window.api.onNeedLock(() => $('lockScreen').classList.remove('hidden'));
window.api.onUi((data) => { ui = data; renderSidebar(); });
window.api.onUpdateDownloaded(() => alert('آپدیت دانلود شد. برنامه را ببندید تا نصب شود.'));
window.api.getUi().then((data) => { ui = data; renderSidebar(); });
