/* سكوول — school app shell: navigation, hash router, top bar, academic-year context, lookups cache. */
(function () {
  'use strict';
  const { esc, ic } = S;

  // [key, label, icon, perm, children:[ [route, label, perm] ]]
  const NAV = [
    ['home', 'الرئيسية', 'home', null, null, '#/'],
    ['g-settings', 'الإعدادات العامة', 'gear', null, [
      ['settings', 'إعدادات المدرسة', 'settings'], ['users', 'المستخدمون والصلاحيات', 'users'], ['branches', 'الفروع', 'hr'],
      ['announcements', 'الإعلانات والتعاميم', 'settings'], ['activity', 'سجل النشاطات', 'settings'],
    ]],
    ['g-acc', 'المحاسبة', 'calc', 'accounting', [
      ['accounting', 'لوحة التحكم'], ['service-invoices', 'فواتير الخدمات'], ['customers', 'العملاء'],
      ['expenses', 'فواتير المصروفات'], ['expense-categories', 'فئات المصاريف'], ['suppliers', 'الموردون'],
      ['receipts', 'سندات القبض'], ['payments-out', 'سندات الصرف'], ['cash-accounts', 'الصناديق والبنوك'], ['reports', 'التقارير المالية'],
    ]],
    ['g-hr', 'الموارد البشرية', 'users', 'hr', [
      ['hr', 'لوحة التحكم'], ['employees', 'الموظفون'], ['departments', 'الأقسام'], ['job-titles', 'المسميات الوظيفية'],
      ['emp-attendance', 'الحضور والانصراف'], ['leave-requests', 'طلبات الإجازات'], ['leave-types', 'أنواع الإجازات'], ['leave-balances', 'أرصدة الإجازات'],
      ['employee-contracts', 'عقود الموظفين'], ['payrolls', 'الرواتب الشهرية'], ['advances', 'سلف الموظفين'], ['bonuses', 'المكافآت'], ['deductions', 'الاستقطاعات'], ['evaluations', 'التقييمات'], ['evaluation-criteria', 'معايير التقييم'], ['evaluation-periods', 'فترات التقييم'],
    ]],
    ['g-admin', 'الشؤون الإدارية', 'briefcase', 'admin_affairs', [
      ['admin', 'لوحة التحكم'], ['corr-in', 'المراسلات الواردة'], ['corr-out', 'المراسلات الصادرة'], ['corr-internal', 'المراسلات الداخلية'],
      ['corr-categories', 'فئات المراسلات'], ['licenses', 'التراخيص'], ['tasks', 'المهام والمواعيد'], ['calendar', 'تقويم المهام'], ['documents', 'الأرشفة الإلكترونية'],
    ]],
    ['g-school', 'المدارس', 'cap', null, [
      ['schools', 'لوحة تحكم المدارس', 'school'], ['years', 'السنوات الدراسية', 'school'], ['grades', 'الصفوف', 'school'], ['sections', 'الشعب', 'school'],
      ['buses', 'الحافلات', 'school'], ['guardians', 'أولياء الأمور', 'students'], ['students', 'الطلاب', 'students'], ['applications', 'استمارة التسجيل', 'students'],
      ['attendance', 'الحضور والغياب', 'school'], ['subjects', 'المواد الدراسية', 'school'], ['exam-terms', 'الفصول والاختبارات', 'school'], ['marks', 'الدرجات والتقييم', 'school'], ['timetable', 'الجدول الدراسي', 'school'], ['custom-fields', 'الحقول المخصصة', 'school'], ['fee-items', 'بنود الرسوم الدراسية', 'school'],
      ['contracts', 'العقود', 'finance'], ['installments', 'الأقساط', 'finance'], ['tuition-payments', 'مدفوعات الأقساط', 'finance'],
    ]],
  ];
  S.NAV = NAV;
  const routeGroup = {}; const routeLabel = {};
  NAV.forEach(([k, l, , gperm, kids]) => (kids || []).forEach(([r, rl, p]) => { routeGroup[r] = k; routeLabel[r] = rl; }));
  S.routeLabel = routeLabel;

  // ------------------------------------------------------------ year context
  S.yearId = () => localStorage.getItem('sch_year') || (S.me() && S.me().company && S.me().company.current_year_id) || '';
  S.setYear = (id) => { localStorage.setItem('sch_year', id); S.L.clear(); };
  // ------------------------------------------------------------ lookups cache
  const cache = {};
  S.L = async function (keys) {
    const need = keys.filter((k) => !(k in cache));
    if (need.length) { const d = await S.get('/app/lookups', { only: need.join(','), year: S.yearId() }); need.forEach((k) => (cache[k] = d[k] || [])); }
    const out = {}; keys.forEach((k) => (out[k] = cache[k])); return out;
  };
  S.L.clear = (...keys) => { (keys.length ? keys : Object.keys(cache)).forEach((k) => delete cache[k]); };
  S.L.peek = (k) => cache[k] || [];

  // ------------------------------------------------------------------ pages
  const PAGES = {};
  S.page = (key, def) => (PAGES[key] = def);

  // ------------------------------------------------------------------- shell
  S.boot = async function () {
    if (!S.token()) { location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.hash); return; }
    let me = S.me();
    try { me = await S.get('/auth/me'); S.setSession(null, me); } catch (e) { if (e.status === 0) S.toast(e.message, 'bad'); }
    if (!me || !me.user) return;
    if (me.user.role === 'super') { location.href = '/super/'; return; }
    if (me.user.role === 'guardian') { location.href = '/parent/'; return; }
    S.applyTheme();
    if (!localStorage.getItem('sch_year') && me.company) localStorage.setItem('sch_year', me.company.current_year_id || '');
    renderShell(me);
    window.addEventListener('hashchange', route);
    route();
    refreshBadges(); setInterval(refreshBadges, 60000);
  };

  function navHtml(filter) {
    const f = (filter || '').trim();
    const hl = (t) => (f ? esc(t).replace(new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), (m) => `<mark>${m}</mark>`) : esc(t));
    return NAV.map(([k, label, icon, perm, kids, href]) => {
      if (!kids) return !f || label.includes(f) ? `<a class="it" data-r="home" href="${href}">${ic(icon, 'ic')}<span>${hl(label)}</span></a>` : '';
      const visible = kids.filter(([r, l, p]) => S.can(p || perm) && (!f || l.includes(f) || label.includes(f)));
      if (!visible.length) return '';
      return `<div class="grp ${f ? 'open' : ''}" data-g="${k}"><div class="it">${ic(icon, 'ic')}<span>${hl(label)}</span>${ic('chevL', 'chev')}</div><div class="sub">${visible.map(([r, l]) => `<a href="#/${r}" data-r="${r}">${hl(l)}${r === 'applications' ? '<span class="pill hide" id="pill-app"></span>' : ''}</a>`).join('')}</div></div>`;
    }).join('') || '<div class="empty xs">لا نتائج</div>';
  }

  function renderShell(me) {
    const co = me.company || {}, u = me.user;
    document.body.innerHTML = `
      <div class="backdrop" id="bd"></div>
      <aside class="side" id="side">
        <div class="brand"><div class="logo">${co.logo ? `<img src="${esc(co.logo)}" alt="">` : S.LOGO}</div><div><b>${esc(co.name || 'سكوول')}</b><small>نظام سكوول لإدارة المدارس</small></div></div>
        <div class="msearch">${ic('search')}<input id="msearch" placeholder="بحث في القائمة..." autocomplete="off"></div>
        <nav class="nav" id="nav">${navHtml()}</nav>
        <div class="foot">${ic('shield')} <span>اشتراك ${co.trial_ends_at && new Date(co.trial_ends_at) > new Date() ? 'تجريبي' : 'فعّال'}</span></div>
      </aside>
      <div class="main">
        <div class="top"><div class="topbar">
          <button class="burger" id="burger" title="القائمة">${ic('menu')}</button>
          <h1 id="ptitle">لوحة التحكم</h1>
          <div class="sp"></div>
          <div class="clock"><b id="clk-t" class="num"></b><span id="clk-d" class="num"></span></div>
          <button class="tbtn" id="t-settings" title="الإعدادات">${ic('gear')}</button>
          <button class="tbtn" id="t-mode" title="الوضع الليلي">${ic('moon')}</button>
          <button class="tbtn" id="t-help" title="المساعدة">${ic('help')}</button>
          <button class="tbtn" id="t-ann" title="الإعلانات">${ic('megaphone')}<span class="dot hide" id="ann-dot"></span></button>
          <button class="tbtn" id="t-bell" title="الإشعارات">${ic('bell')}<span class="dot hide" id="bell-dot"></span></button>
          <div class="umenu" id="umenu"><span class="av">${esc(S.initials(u.name))}</span><span class="nm">${esc(u.name)}<small>${esc(u.title || (u.role === 'admin' ? 'مدير' : 'موظف'))}</small></span>${ic('chevD')}
            <div class="dropdown" id="udrop">
              <a href="#/profile">${ic('user')} الملف الشخصي</a>
              <a href="#/profile">${ic('key')} تغيير كلمة المرور</a>
              ${S.can('settings') ? `<a href="#/settings">${ic('gear')} إعدادات المدرسة</a>` : ''}
              <hr><button id="logout" style="color:var(--bad)">${ic('logout')} تسجيل الخروج</button>
            </div></div>
        </div></div>
        <main class="content" id="view"></main>
        <footer class="footer"><span>برمجة وتطوير <a href="/" target="_blank">سكوول — منصة إدارة المدارس</a></span><a href="https://wa.me/96891001000" target="_blank" class="row gap4">${ic('whatsapp')} تواصل معنا</a></footer>
      </div>`;
    document.querySelectorAll('.footer svg').forEach((s) => (s.style.cssText = 'width:15px;height:15px'));

    const nav = document.getElementById('nav');
    nav.addEventListener('click', (e) => {
      const head = e.target.closest('.grp>.it');
      if (head) { const g = head.parentElement, open = !g.classList.contains('open'); if (!document.getElementById('msearch').value) nav.querySelectorAll('.grp.open').forEach((x) => x.classList.remove('open')); g.classList.toggle('open', open); return; }
      if (e.target.closest('a') && innerWidth <= 1024) closeSide();
    });
    document.getElementById('msearch').oninput = (e) => { nav.innerHTML = navHtml(e.target.value); markActive(); };
    const closeSide = () => document.body.classList.remove('side-open');
    document.getElementById('burger').onclick = () => { if (innerWidth <= 1024) document.body.classList.toggle('side-open'); else { document.body.classList.toggle('collapsed'); localStorage.setItem('sch_collapsed', document.body.classList.contains('collapsed') ? 1 : ''); } };
    if (localStorage.getItem('sch_collapsed') && innerWidth > 1024) document.body.classList.add('collapsed');
    document.getElementById('bd').onclick = closeSide;
    document.getElementById('t-mode').onclick = () => { S.toggleMode(); modeIcon(); };
    const modeIcon = () => (document.getElementById('t-mode').innerHTML = ic(document.documentElement.getAttribute('data-theme') === 'dark' ? 'sun' : 'moon'));
    modeIcon();
    document.getElementById('t-settings').onclick = () => (location.hash = S.can('settings') ? '#/settings' : '#/profile');
    document.getElementById('t-help').onclick = openHelp;
    document.getElementById('t-bell').onclick = openNotifications;
    document.getElementById('t-ann').onclick = openAnnouncements;
    const um = document.getElementById('umenu'), ud = document.getElementById('udrop');
    um.onclick = (e) => { e.stopPropagation(); ud.classList.toggle('show'); };
    document.addEventListener('click', () => ud.classList.remove('show'));
    document.getElementById('logout').onclick = async () => { try { await S.post('/auth/logout'); } catch {} S.clearSession(); localStorage.removeItem('sch_year'); location.href = '/login.html'; };
    const tick = () => { const d = new Date(); document.getElementById('clk-t').textContent = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); document.getElementById('clk-d').textContent = S.today(); };
    tick(); setInterval(tick, 1000);
  }

  function markActive() {
    const key = currentKey();
    document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.r === key));
    const g = routeGroup[key];
    if (g && !document.getElementById('msearch').value) document.querySelectorAll('.grp').forEach((el) => el.classList.toggle('open', el.dataset.g === g));
  }
  const currentKey = () => (location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] || 'home');

  async function route() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    const parts = path.split('/').filter(Boolean);
    const key = parts[0] || 'home';
    const params = Object.fromEntries(new URLSearchParams(qs || ''));
    if (parts[1]) params.id = parts[1];
    const page = PAGES[key];
    const view = document.getElementById('view');
    markActive();
    window.scrollTo(0, 0);
    if (!page) { view.innerHTML = S.emptyHtml('الصفحة غير موجودة', 'تحقق من الرابط أو اختر من القائمة', 'alert'); return; }
    if (page.perm && !S.can(page.perm)) { view.innerHTML = S.emptyHtml('لا تملك صلاحية لهذا القسم', 'تواصل مع مدير النظام لمنحك الصلاحية', 'lock'); return; }
    const title = page.title || routeLabel[key] || '';
    document.getElementById('ptitle').textContent = title;
    document.title = title + ' — سكوول';
    const token = (S._routeToken = Math.random());
    const el = document.createElement('div');
    el.innerHTML = S.spinner;
    view.innerHTML = ''; view.appendChild(el);
    try {
      await page.render(el, params, { key, title });
    } catch (e) {
      if (token !== S._routeToken) return;
      console.error(e);
      view.innerHTML = S.emptyHtml('تعذّر تحميل الصفحة', e.message, 'alert');
    }
  }
  S.reroute = route;

  /** Breadcrumbs + optional academic year bar. */
  S.head = function (key, opts = {}) {
    const g = NAV.find((n) => n[0] === routeGroup[key]);
    const crumbs = `<div class="crumbs"><b>${esc(g ? g[1] : 'الرئيسية')}</b>${ic('chevL')}<span>${esc(opts.title || routeLabel[key] || '')}</span></div>`;
    if (!opts.year) return crumbs;
    const years = S.L.peek('years');
    return crumbs + `<div class="yearbar">${ic('calendar')}<span>السنة الدراسية:</span><select id="yearsel">${years.map((y) => `<option value="${y.id}" ${String(y.id) === String(S.yearId()) ? 'selected' : ''}>${esc(y.name)}${y.is_current ? ' (الحالية)' : ''}</option>`).join('')}</select></div>`;
  };
  S.bindYear = (el) => { const s = el.querySelector('#yearsel'); if (s) s.onchange = () => { S.setYear(s.value); route(); }; };

  async function refreshBadges() {
    try {
      const b = await S.get('/app/badges');
      const set = (id, n) => { const d = document.getElementById(id); if (d) { d.textContent = n > 9 ? '9+' : n; d.classList.toggle('hide', !n); } };
      set('bell-dot', b.notifications); set('ann-dot', b.announcements);
      if (S.can('students')) { const a = await S.get('/app/applications', { status: 'new', per_page: 1 }); set('pill-app', a.total); }
    } catch {}
  }
  S.refreshBadges = refreshBadges;

  const NTYPE = { application: 'userPlus', installment: 'coins', license: 'shield', task: 'tasks', attendance: 'calCheck', info: 'info' };
  async function openNotifications() {
    const m = S.modal({ title: 'الإشعارات', head: '<button class="btn ghost sm" id="readall">تحديد الكل كمقروء</button>', body: S.spinner, foot: false });
    const load = async () => {
      const d = await S.get('/app/notifications');
      m.body.innerHTML = d.data.length ? d.data.map((n) => `<a class="li" href="${esc(n.link || '#/')}" style="${n.read_at ? 'opacity:.6' : ''}"><span class="ic">${ic(NTYPE[n.type] || 'bell')}</span><span class="t"><b>${esc(n.title)}</b><small>${esc(n.body || '')} · ${S.ago(n.created_at)}</small></span>${n.read_at ? '' : '<span class="cnt r" style="min-width:8px;height:8px;padding:0"></span>'}</a>`).join('') : S.emptyHtml('لا توجد إشعارات', '', 'bell');
      m.body.querySelectorAll('a').forEach((a) => (a.onclick = () => m.close()));
    };
    m.$('#readall').onclick = async () => { await S.post('/app/notifications/read-all'); load(); refreshBadges(); };
    load();
  }
  async function openAnnouncements() {
    const m = S.modal({ title: 'الإعلانات والتعاميم', body: S.spinner, foot: S.can('settings') ? '<a class="btn soft" href="#/announcements">إدارة الإعلانات</a><button class="btn ghost" data-close>إغلاق</button>' : undefined });
    m.$('.mf a') && (m.$('.mf a').onclick = () => m.close());
    const d = await S.get('/app/announcements');
    m.body.innerHTML = d.data.length ? d.data.map((a) => `<div class="li" style="align-items:flex-start"><span class="ic">${ic('megaphone')}</span><span class="t"><b style="white-space:normal">${esc(a.title)}</b><small style="display:block;white-space:pre-line">${esc(a.body || '')}</small><small>${a.company_id ? 'إعلان المدرسة' : 'من إدارة المنصة'} · ${S.ago(a.created_at)}</small></span></div>`).join('') : S.emptyHtml('لا توجد إعلانات', '', 'megaphone');
  }
  function openHelp() {
    const me = S.me();
    S.modal({ title: 'المساعدة السريعة', size: 'wide', body: `
      <div class="grid g2">
        <div class="card pad"><h3 class="mb8">${ic('play', '')} البدء السريع</h3><ol style="padding-inline-start:18px;line-height:2" class="t2">
          <li>أنشئ <a class="acc-t" href="#/years">السنة الدراسية</a> ثم <a class="acc-t" href="#/grades">الصفوف</a> و<a class="acc-t" href="#/sections">الشعب</a>.</li>
          <li>حدّد <a class="acc-t" href="#/fee-items">بنود الرسوم</a> لكل صف.</li>
          <li>أضف <a class="acc-t" href="#/guardians">أولياء الأمور</a> و<a class="acc-t" href="#/students">الطلاب</a> (أو استوردهم من Excel).</li>
          <li>أنشئ <a class="acc-t" href="#/contracts">العقود</a> وفعّلها لتوليد الأقساط تلقائياً.</li>
          <li>سجّل الدفعات من شاشة العقد أو <a class="acc-t" href="#/installments">الأقساط</a>.</li><li>عرّف <a class="acc-t" href="#/subjects">المواد</a> و<a class="acc-t" href="#/exam-terms">الفصول</a> ثم ارصد <a class="acc-t" href="#/marks">الدرجات</a>.</li></ol></div>
        <div class="card pad"><h3 class="mb8">رابط التسجيل الإلكتروني</h3><p class="t2 sm mb8">شارك هذا الرابط مع أولياء الأمور لتقديم طلبات التسجيل مباشرة:</p>
          <div class="row"><input class="inp ltr" readonly value="${location.origin}/apply.html?school=${esc(me.company.slug)}"><button class="btn ghost icon" id="cpy">${ic('copy')}</button></div>
          <h3 class="mb8 mt16">بوابة ولي الأمر</h3><p class="t2 sm">من شاشة أولياء الأمور عيّن كلمة مرور لولي الأمر ليدخل من <span class="ltr">${location.origin}/login.html</span> برقم جواله.</p></div>
      </div>` }).querySelector('#cpy').onclick = () => S.copy(`${location.origin}/apply.html?school=${me.company.slug}`);
  }
})();
