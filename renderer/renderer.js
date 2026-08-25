window.api.onInstancesList((instances, activeId) => {
  const sidebar = document.getElementById('sidebar');
  sidebar.innerHTML = '';

  instances.forEach((instance) => {
    const btn = document.createElement('div');
    btn.className = 'service-btn' + (instance.instanceId === activeId ? ' active' : '');
    btn.style.background = instance.color;
    btn.title = instance.label + ' (راست‌کلیک برای حذف)';
    btn.textContent = instance.icon;

    btn.addEventListener('click', () => {
      window.api.switchInstance(instance.instanceId);
    });

    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (confirm(`اکانت «${instance.label}» حذف بشه؟ (لاگین و پیام‌هاش پاک میشه)`)) {
        window.api.removeInstance(instance.instanceId);
      }
    });

    sidebar.appendChild(btn);
  });

  const addBtn = document.createElement('div');
  addBtn.className = 'service-btn add-btn';
  addBtn.title = 'افزودن اکانت جدید';
  addBtn.textContent = '+';
  addBtn.addEventListener('click', () => {
    window.api.openAddAccount();
  });
  sidebar.appendChild(addBtn);
});
