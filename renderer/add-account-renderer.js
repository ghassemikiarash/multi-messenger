let selectedAppId = null;

async function init() {
  const catalog = await window.addAccountApi.getCatalog();
  const grid = document.getElementById('appGrid');

  catalog.forEach((appDef) => {
    const el = document.createElement('div');
    el.className = 'app-choice';
    el.innerHTML = `<div class="emoji">${appDef.icon}</div><div>${appDef.name}</div>`;
    el.addEventListener('click', () => {
      document.querySelectorAll('.app-choice').forEach((c) => c.classList.remove('selected'));
      el.classList.add('selected');
      selectedAppId = appDef.appId;
      document.getElementById('addBtn').disabled = false;
      const labelInput = document.getElementById('labelInput');
      if (!labelInput.value) labelInput.placeholder = `مثلاً: ${appDef.name} کاری`;
    });
    grid.appendChild(el);
  });
}

document.getElementById('addBtn').addEventListener('click', () => {
  if (!selectedAppId) return;
  const label = document.getElementById('labelInput').value;
  window.addAccountApi.addInstance(selectedAppId, label);
});

document.getElementById('cancelBtn').addEventListener('click', () => {
  window.addAccountApi.cancel();
});

init();
