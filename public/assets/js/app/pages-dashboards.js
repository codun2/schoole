/* سكوول — dashboards: main (finance overview), schools, accounting, HR, administrative affairs. */
(function () {
  'use strict';
  const { esc, ic, money } = S;

  const chg = (c, invert) => {
    if (c === null || c === undefined) return '<span class="chg flat">جديد</span>';
    const up = c >= 0, good = invert ? !up : up;
    return `<span class="chg ${c === 0 ? 'flat' : good ? 'up' : 'down'}">${c === 0 ? '' : up ? '↑' : '↓'} ${Math.abs(c)}%</span>`;
  };
  const kpi = (cls, icon, k, v, d, extra) => `<div class="kpi ${cls}"><div class="ic">${ic(icon)}</div><div class="grow"><div class="k">${k}</div><div class="v">${v}${extra || ''}</div><div class="d">${d}</div></div></div>`;
  const stat = (cls, icon, v, k, href) => `<${href ? `a href="${href}"` : 'div'} class="stat ${cls}"><div class="ic">${ic(icon)}</div><div><div class="v num">${v}</div><div class="k">${k}</div></div></${href ? 'a' : 'div'}>`;
  S.ui = { kpi, stat, chg };

  // ======================================================== main dashboard
  S.page('home', {
    title: 'لوحة التحكم',
    async render(el) {
      const me = S.me();
      let period = sessionStorage.getItem('sch_period') || 'month';
      const tiles = [
        ['#/students', 'users', 'الطلاب', 'students'], ['#/contracts', 'contract', 'العقود', 'finance'], ['#/installments', 'coins', 'الأقساط', 'finance'],
        ['#/attendance', 'calCheck', 'الحضور والغياب', 'school'], ['#/accounting', 'calc', 'المحاسبة', 'accounting'], ['#/employees', 'badge', 'الموارد البشرية', 'hr'],
        ['#/tasks', 'tasks', 'المهام', 'admin_affairs'], ['#/schools', 'cap', 'المدارس', 'school'], ['#/settings', 'gear', 'الإعدادات العامة', 'settings'],
      ].filter((t) => S.can(t[3]));
      el.innerHTML = `
        <div class="greet"><h2>أهلاً <span class="acc-t">${esc(me.user.name)}</span>، مرحباً بعودتك 👋</h2><span>${S.longDate()}</span></div>
        <div class="row between wrap mb16"><div class="seg" id="per"><button data-p="month">هذا الشهر</button><button data-p="year">هذا العام</button></div>
          <div class="row wrap gap4"><a class="btn ghost sm" href="#/students?new=1">${ic('userPlus')} طالب جديد</a><a class="btn ghost sm" href="#/contracts?new=1">${ic('contract')} عقد جديد</a><a class="btn sm" href="#/installments?state=overdue">${ic('coins')} تحصيل الأقساط</a></div></div>
        <div class="grid g5" id="kpis">${'<div class="kpi skel" style="height:110px"></div>'.repeat(5)}</div>
        <div class="grid g-1-2 mt16">
          <div class="card"><div class="hd"><h3>${ic('star')} الوصول السريع</h3></div><div class="bd"><div class="tiles">${tiles.map(([h, i, l]) => `<a class="tile" href="${h}">${ic(i)}<span>${l}</span></a>`).join('')}</div></div></div>
          <div class="card"><div class="hd"><h3>${ic('chart')} الإيرادات والمصاريف — آخر ٦ أشهر</h3></div><div class="bd"><div id="ch" style="min-height:270px"></div></div></div>
        </div>
        <div class="grid g4 mt16" id="counts"></div>`;
      const seg = el.querySelector('#per');
      const load = async () => {
        seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.p === period));
        let d;
        try { d = await S.get('/app/dashboard/main', { period }); } catch (e) { el.querySelector('#kpis').innerHTML = S.emptyHtml('لا تملك صلاحية عرض الملخص المالي', e.message, 'lock'); return; }
        const lbl = period === 'year' ? 'هذا العام' : 'هذا الشهر';
        el.querySelector('#kpis').innerHTML =
          kpi('c-blue', 'trendUp', `الإيرادات (${lbl})`, money(d.revenue.value), 'من العقود والفواتير المعتمدة، وليس المبلغ المحصّل فعلياً', chg(d.revenue.change)) +
          kpi('c-red', 'trendDown', `المصاريف (${lbl})`, money(d.expenses.value), 'المصروفات والرواتب المعتمدة', chg(d.expenses.change, true)) +
          kpi('c-green', 'smile', `صافي الربح (${lbl})`, `<span class="${d.profit.value < 0 ? 'bad-t' : 'ok-t'}">${money(d.profit.value)}</span>`, 'الإيرادات ناقص المصروفات', chg(d.profit.change)) +
          kpi('c-orange', 'wallet', 'المستحقات غير المحصّلة', money(d.outstanding), 'رصيد مستحق متراكم وليس خاصاً بهذا الشهر فقط') +
          kpi('c-teal', 'money', `المقبوضات الفعلية (${lbl})`, money(d.receipts.value), 'المبالغ التي دخلت فعلاً بتاريخ سند القبض', chg(d.receipts.change));
        const chEl = el.querySelector('#ch') || el.querySelector('#mainch');
        const draw = () => S.chart.area(chEl, { labels: d.chart.map((c) => S.monthLabel(c.month, true)), series: [{ name: 'الإيرادات', color: '#14a06b', data: d.chart.map((c) => c.revenue) }, { name: 'المصاريف', color: '#e0384c', data: d.chart.map((c) => c.expenses) }, { name: 'المقبوضات', color: '#2f7ae5', data: d.chart.map((c) => c.receipts) }], money: true });
        chEl.id = 'mainch'; draw(); S.onResize(draw);
        el.querySelector('#counts').innerHTML = stat('c-blue', 'users', S.num(d.counts.students), 'طالب نشط', '#/students') + stat('c-violet', 'badge', S.num(d.counts.employees), 'موظف', '#/employees') + stat('c-red', 'alert', S.num(d.counts.overdue_installments), 'قسط متأخر', '#/installments?state=overdue') + stat('c-amber', 'tasks', S.num(d.counts.tasks_open), 'مهمة مفتوحة', '#/tasks');
      };
      seg.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; period = b.dataset.p; sessionStorage.setItem('sch_period', period); load(); };
      await load();
    },
  });

  // resize helper for charts
  let rs = [];
  S.onResize = (fn) => { rs.push(fn); };
  window.addEventListener('hashchange', () => (rs = []));
  window.addEventListener('resize', S.debounce(() => rs.forEach((f) => { try { f(); } catch {} }), 200));
  document.addEventListener('themechange', () => rs.forEach((f) => { try { f(); } catch {} }));

  // ======================================================== schools dashboard
  S.page('schools', {
    perm: 'school',
    async render(el) {
      await S.L(['years']);
      const d = await S.get('/app/dashboard/school', { year: S.yearId() });
      const short = [
        ['settings', 'gear', 'إعدادات المدرسة'], ['years', 'calendar', 'السنوات الدراسية'], ['grades', 'layers', 'الصفوف'], ['sections', 'columns', 'الشعب'], ['buses', 'bus', 'الحافلات'], ['guardians', 'parents', 'أولياء الأمور'],
        ['students', 'users', 'الطلاب'], ['applications', 'userPlus', 'استمارة التسجيل'], ['custom-fields', 'sliders', 'الحقول المخصصة'], ['attendance', 'calCheck', 'الحضور والغياب'], ['subjects', 'book', 'المواد الدراسية'], ['exam-terms', 'clipboard', 'الفصول والاختبارات'], ['marks', 'edit', 'الدرجات والتقييم'], ['timetable', 'calendar', 'الجدول الدراسي'], ['fee-items', 'coins', 'بنود الرسوم الدراسية'], ['contracts', 'contract', 'العقود'],
        ['installments', 'calendar', 'الأقساط'], ['tuition-payments', 'receipt', 'مدفوعات الأقساط'],
      ];
      const att = d.attendance_today;
      el.innerHTML = `${S.head('schools', { year: true })}
        <div class="filters" style="justify-content:center"><div class="search" style="width:min(500px,100%)">${ic('search')}<input class="inp" id="qs" placeholder="بحث سريع عن طالب بالاسم أو الهوية أو جوال ولي الأمر..."></div></div>
        <div class="shortcuts mb16">${short.map(([r, i, l]) => `<a class="shortcut" href="#/${r}">${ic(i)} ${l}</a>`).join('')}</div>
        <div class="grid g4">
          ${stat('c-green', 'user', S.num(d.students_active), 'الطلاب النشطون', '#/students?status=active')}
          ${stat('c-amber', 'clock', S.num(d.students_pending), 'الطلاب المعلّقون', '#/students?status=pending')}
          ${stat('c-blue', 'calCheck', `${S.num(att.present)} / ${S.num(att.total)}`, 'حضور اليوم (حاضر/مسجّل)', '#/attendance')}
          ${stat('c-red', 'contract', S.num(d.contracts_active), 'العقود النشطة', '#/contracts?status=active')}
          ${stat('c-violet', 'coins', S.money(d.contracts_total, true), 'إجمالي العقود', '#/contracts')}
          ${stat('c-green', 'wallet', S.money(d.collected, true), 'إجمالي المحصّل', '#/tuition-payments')}
          ${stat('c-red', 'timer', S.money(d.remaining, true), 'إجمالي المتبقي', '#/installments?state=unpaid')}
          ${stat('c-orange', 'alert', S.money(d.overdue, true), 'أقساط متأخرة', '#/installments?state=overdue')}
        </div>
        <div class="grid g-2-1 mt16">
          <div class="card"><div class="hd"><h3>${ic('contract')} أحدث العقود</h3><span class="sp grow"></span><a class="btn ghost xs" href="#/contracts">عرض الكل</a></div>
            <div class="tbl-scroll"><table class="tbl"><thead><tr><th>رقم العقد</th><th>الطالب</th><th>الشعبة</th><th>الإجمالي</th><th>الباقي</th><th>الحالة</th></tr></thead><tbody>
            ${d.recent_contracts.map((c) => `<tr><td><a class="lk num" href="#/contracts/${c.id}">${esc(c.number)}</a></td><td>${esc(S.enName(c.student))}</td><td>${esc(S.gs(c, ''))}</td><td class="num">${S.fmtN(c.total)}</td><td class="num bad-t">${S.fmtN(c.remaining)}</td><td>${S.badge(S.ST.contract, c.status)}</td></tr>`).join('') || `<tr><td colspan="6">${S.emptyHtml('لا توجد عقود')}</td></tr>`}
            </tbody></table></div></div>
          <div class="card"><div class="hd"><h3>${ic('clock')} الطلاب المعلّقون</h3><span class="grow"></span><a class="btn ghost xs" href="#/students?status=pending">عرض الكل</a></div><div class="bd">
            ${d.pending_students.map((s) => `<a class="li" href="#/students/${s.id}"><span class="avatar">${esc(S.initials(S.enName(s)))}</span><span class="t"><b>${esc(S.enName(s))}</b><small>${esc(S.enName(s.grade))} · ${esc(S.enName(s.guardian))}</small></span></a>`).join('') || '<div class="empty" style="padding:24px">لا يوجد طلاب</div>'}
            ${d.applications_new ? `<a class="btn soft sm mt8" style="width:100%" href="#/applications?status=new">${ic('userPlus')} ${S.num(d.applications_new)} طلب تسجيل جديد بانتظار المراجعة</a>` : ''}
          </div></div>
        </div>
        <div class="grid g3 mt16">
          <div class="card"><div class="hd"><h3>${ic('layers')} الطلاب حسب الصف</h3></div><div class="bd" id="bygrade"></div></div>
          <div class="card"><div class="hd"><h3>${ic('pie')} توزيع الطلاب</h3></div><div class="bd" id="gender"></div></div>
          <div class="card"><div class="hd"><h3>${ic('calendar')} أقرب الأقساط المستحقة</h3></div><div class="bd">
            ${d.upcoming_installments.map((i) => `<div class="li"><span class="ic" style="${i.is_overdue ? 'background:var(--bad-bg);color:var(--bad)' : ''}">${ic('coins')}</span><span class="t"><b>${esc(S.enName(i.student))}</b><small class="num">${S.d(i.due_date)} · ${esc(i.contract?.number)}</small></span><b class="num ${i.is_overdue ? 'bad-t' : ''}">${S.fmtN(i.remaining)}</b></div>`).join('') || '<div class="empty" style="padding:24px">لا أقساط مستحقة</div>'}
          </div></div>
        </div>`;
      S.bindYear(el);
      S.chart.hbars(el.querySelector('#bygrade'), d.by_grade.map((g, i) => ({ label: g.name, value: g.c, color: S.PALETTE[i % S.PALETTE.length] })));
      S.chart.donut(el.querySelector('#gender'), { items: [{ label: S.tr('ذكور'), value: d.gender.male || 0, color: '#2f7ae5' }, { label: S.tr('إناث'), value: d.gender.female || 0, color: '#db2777' }] });
      el.querySelector('#qs').onkeydown = (e) => { if (e.key === 'Enter') location.hash = '#/students?q=' + encodeURIComponent(e.target.value.trim()); };
    },
  });

  // ======================================================== accounting dashboard
  S.page('accounting', {
    perm: 'accounting', title: 'المحاسبة',
    async render(el) {
      const d = await S.get('/app/dashboard/accounting');
      const groups = [
        ['فواتير الخدمات والإيرادات', 'fileText', [['service-invoices?new=1', 'plus', 'إضافة فاتورة خدمات', 1], ['service-invoices', 'file', 'فواتير الخدمات'], ['customers', 'user', 'العملاء'], ['tuition-payments', 'receipt', 'مدفوعات الأقساط'], ['installments', 'calendar', 'الأقساط']]],
        ['المصروفات والمدفوعات', 'money', [['expenses?new=1', 'plus', 'إضافة مصروف', 1], ['expenses', 'receipt', 'فواتير المصروفات'], ['receipts', 'download', 'سندات القبض'], ['payments-out', 'upload', 'سندات الصرف'], ['expense-categories', 'tag', 'فئات المصاريف'], ['suppliers', 'truck', 'الموردون']]],
        ['المحاسبة والتقارير', 'chart', [['cash-accounts', 'bank', 'الصناديق والبنوك'], ['reports', 'chart', 'التقارير المالية'], ['reports?tab=debts', 'clock', 'مديونيات أولياء الأمور'], ['payrolls', 'wallet', 'الرواتب']]],
      ];
      el.innerHTML = `${S.head('accounting', { title: 'لوحة التحكم' })}
        ${groups.map(([t, i, items]) => `<div class="sec-t">${ic(i)} ${t}</div><div class="shortcuts">${items.map(([h, ii, l, p]) => `<a class="shortcut ${p ? 'primary' : ''}" href="#/${h}">${ic(ii)} ${l}</a>`).join('')}</div>`).join('')}
        <div class="sec-t">${ic('pie')} الإحصائيات والملخص المالي</div>
        <div class="grid g4">
          ${stat('c-green', 'download', S.money(d.month_receipts, true), 'مقبوضات هذا الشهر', '#/receipts')}
          ${stat('c-red', 'upload', S.money(d.month_payments, true), 'مدفوعات هذا الشهر', '#/payments-out')}
          ${stat('c-orange', 'timer', S.money(d.tuition_due, true), 'رسوم دراسية مستحقة', '#/installments?state=unpaid')}
          ${stat('c-violet', 'receipt', S.money(+d.unpaid_expenses + 0, true), 'مصروفات غير مسددة', '#/expenses?status=unpaid')}
        </div>
        <div class="grid g3 mt16">
          <div class="card"><div class="hd"><h3>${ic('bank')} أرصدة الصناديق والبنوك</h3></div><div class="bd">${d.balances.map((a) => `<div class="li"><span class="ic">${ic(a.type === 'bank' ? 'bank' : 'wallet')}</span><span class="t"><b>${esc(a.name)}</b><small>وارد ${S.fmtN(a.total_in)} · صادر ${S.fmtN(a.total_out)}</small></span><b class="${a.balance < 0 ? 'bad-t' : ''}">${money(a.balance)}</b></div>`).join('')}</div></div>
          <div class="card"><div class="hd"><h3>${ic('pie')} المصروفات حسب الفئة (هذا العام)</h3></div><div class="bd" id="cats"></div></div>
          <div class="card"><div class="hd"><h3>${ic('activity')} آخر الحركات</h3></div><div class="bd">${d.recent_vouchers.map((v) => `<div class="li"><span class="ic" style="background:${v.type === 'receipt' ? 'var(--ok-bg)' : 'var(--bad-bg)'};color:${v.type === 'receipt' ? 'var(--ok)' : 'var(--bad)'}">${ic(v.type === 'receipt' ? 'download' : 'upload')}</span><span class="t"><b>${esc(v.description || v.party_name || v.number)}</b><small class="num">${esc(v.number)} · ${S.d(v.date)}</small></span><b class="num ${v.type === 'receipt' ? 'ok-t' : 'bad-t'}">${v.type === 'receipt' ? '+' : '−'}${S.fmtN(v.amount)}</b></div>`).join('') || S.emptyHtml()}</div></div>
        </div>`;
      S.chart.donut(el.querySelector('#cats'), { items: d.by_category.map((c) => ({ label: c.name, value: +c.total, color: c.color, fmt: S.fmtN(c.total) })), center: S.fmtN(d.by_category.reduce((a, c) => a + +c.total, 0), 0) });
    },
  });

  // ======================================================== HR dashboard
  S.page('hr', {
    perm: 'hr', title: 'الموارد البشرية',
    async render(el) {
      const d = await S.get('/app/dashboard/hr');
      const a = d.attendance_today || {};
      el.innerHTML = `${S.head('hr', { title: 'لوحة التحكم' })}
        <div class="grid g4">
          ${stat('c-blue', 'users', S.num(d.employees_active), 'موظف نشط', '#/employees')}
          ${stat('c-violet', 'cap', S.num(d.teachers), 'معلم ومعلمة', '#/employees?is_teacher=1')}
          ${stat('c-amber', 'plane', S.num(d.on_leave_today), 'في إجازة اليوم', '#/leave-requests?status=approved')}
          ${stat('c-red', 'clock', S.num(d.pending_leaves), 'طلب إجازة معلّق', '#/leave-requests?status=pending')}
        </div>
        <div class="grid g3 mt16">
          <div class="card"><div class="hd"><h3>${ic('calCheck')} حضور اليوم</h3><span class="grow"></span><a class="btn ghost xs" href="#/emp-attendance">تسجيل</a></div><div class="bd" id="att"></div></div>
          <div class="card"><div class="hd"><h3>${ic('sitemap')} الموظفون حسب القسم</h3></div><div class="bd" id="deps"></div></div>
          <div class="card"><div class="hd"><h3>${ic('wallet')} الرواتب</h3></div><div class="bd">
            <div class="kv" style="grid-template-columns:1fr"><div><span>إجمالي الرواتب الشهرية</span><b>${money(d.salaries_total)}</b></div>
            ${d.last_payroll ? `<div><span>آخر مسيّر</span><b>${S.monthLabel(d.last_payroll.month)} ${S.badge(S.ST.payroll, d.last_payroll.status)}</b></div><div><span>صافي آخر مسيّر</span><b>${money(d.last_payroll.net_total)}</b></div>` : ''}</div>
            <a class="btn soft mt16" style="width:100%" href="#/payrolls">${ic('wallet')} إدارة الرواتب</a></div></div>
        </div>
        <div class="grid g2 mt16">
          <div class="card"><div class="hd"><h3>${ic('plane')} طلبات إجازات بانتظار القرار</h3></div><div class="bd">${d.leave_requests.map((l) => `<div class="li"><span class="avatar">${esc(S.initials(l.employee?.name))}</span><span class="t"><b>${esc(l.employee?.name)}</b><small class="num">${esc(l.leave_type?.name || '')} · ${S.d(l.from_date)} → ${S.d(l.to_date)} (${l.days} يوم)</small></span><a class="btn soft xs" href="#/leave-requests?status=pending">مراجعة</a></div>`).join('') || '<div class="empty" style="padding:24px">لا توجد طلبات معلّقة</div>'}</div></div>
          <div class="card"><div class="hd"><h3>${ic('userPlus')} أحدث التعيينات</h3></div><div class="bd">${d.new_hires.map((e) => `<a class="li" href="#/employees/${e.id}"><span class="avatar">${esc(S.initials(e.name))}</span><span class="t"><b>${esc(e.name)}</b><small>${esc(e.job_title?.name || '')} · <span class="num">${S.d(e.hire_date)}</span></small></span><span class="muted num xs">${esc(e.number)}</span></a>`).join('')}</div></div>
        </div>
        <div class="grid g2 mt16">
          <div class="card"><div class="hd"><h3>${ic('contract')} عقود قاربت على الانتهاء</h3><span class="grow"></span><a class="btn ghost xs" href="#/employee-contracts?state=expiring">عرض الكل</a></div><div class="bd">${(d.contracts_expiring || []).map((c) => `<div class="li"><span class="ic" style="background:${c.state === 'expired' ? 'var(--bad-bg)' : 'var(--warn-bg)'};color:${c.state === 'expired' ? 'var(--bad)' : 'var(--warn)'}">${ic('contract')}</span><span class="t"><b>${esc(c.employee?.name || '')}</b><small class="num">${esc(c.number)} · ينتهي ${S.d(c.end_date)}</small></span>${S.badge(S.ST.license, c.state)}</div>`).join('') || '<div class="empty" style="padding:24px">لا عقود قريبة الانتهاء</div>'}</div></div>
          <div class="card"><div class="hd"><h3>${ic('star')} أحدث التقييمات</h3><span class="grow"></span><a class="btn ghost xs" href="#/evaluations">عرض الكل</a></div><div class="bd">${(d.recent_evaluations || []).map((v) => `<div class="li"><span class="avatar">${esc(S.initials(v.employee?.name))}</span><span class="t"><b>${esc(v.employee?.name || '')}</b><small>${esc(v.period?.name || '')}</small></span><b class="num">${S.fmtN(v.total_score, 0)}% <span class="bdg l-info">${esc(v.grade || '')}</span></b></div>`).join('') || '<div class="empty" style="padding:24px">لا توجد تقييمات بعد</div>'}</div></div>
        </div>`;
      S.chart.donut(el.querySelector('#att'), { items: [['present', 'حاضر', '#14a06b'], ['late', 'متأخر', '#d98a0b'], ['absent', 'غائب', '#e0384c'], ['leave', 'إجازة', '#2f7ae5']].map(([k, l, c]) => ({ label: S.tr(l), value: a[k] || 0, color: c })) });
      S.chart.hbars(el.querySelector('#deps'), d.by_department.map((x, i) => ({ label: x.name, value: x.c, color: S.PALETTE[i % 10] })));
    },
  });

  // ======================================================== admin affairs dashboard
  S.page('admin', {
    perm: 'admin_affairs', title: 'الشؤون الإدارية',
    async render(el) {
      const d = await S.get('/app/dashboard/admin');
      const t = d.tasks || {}, c = d.correspondence || {};
      el.innerHTML = `${S.head('admin', { title: 'لوحة التحكم' })}
        <div class="shortcuts mb16">${[['corr-in', 'inbox', 'المراسلات الواردة'], ['corr-out', 'send', 'المراسلات الصادرة'], ['corr-internal', 'mail', 'المراسلات الداخلية'], ['licenses', 'shield', 'التراخيص'], ['tasks', 'tasks', 'المهام والمواعيد'], ['calendar', 'calendar', 'تقويم المهام'], ['documents', 'archive', 'الأرشفة الإلكترونية']].map(([r, i, l]) => `<a class="shortcut" href="#/${r}">${ic(i)} ${l}</a>`).join('')}</div>
        <div class="grid g4">
          ${stat('c-blue', 'tasks', S.num((t.new || 0) + (t.in_progress || 0)), 'مهمة مفتوحة', '#/tasks')}
          ${stat('c-red', 'alert', S.num(d.tasks_overdue), 'مهمة متأخرة', '#/tasks?overdue=1')}
          ${stat('c-violet', 'mail', S.num(d.correspondence_open), 'مراسلة قيد المعالجة', '#/corr-in')}
          ${stat('c-amber', 'shield', S.num(d.licenses_expiring.length), 'ترخيص يحتاج تجديد', '#/licenses')}
        </div>
        <div class="grid g3 mt16">
          <div class="card"><div class="hd"><h3>${ic('pie')} حالة المهام</h3></div><div class="bd" id="tk"></div></div>
          <div class="card"><div class="hd"><h3>${ic('mail')} المراسلات</h3></div><div class="bd" id="cr"></div></div>
          <div class="card"><div class="hd"><h3>${ic('shield')} تراخيص تنتهي قريباً</h3></div><div class="bd">${d.licenses_expiring.map((l) => `<div class="li"><span class="ic" style="background:${l.state === 'expired' ? 'var(--bad-bg)' : 'var(--warn-bg)'};color:${l.state === 'expired' ? 'var(--bad)' : 'var(--warn)'}">${ic('shield')}</span><span class="t"><b>${esc(l.name)}</b><small class="num">${S.d(l.expiry_date)}</small></span>${S.badge(S.ST.license, l.state)}</div>`).join('') || '<div class="empty" style="padding:24px">كل التراخيص سارية</div>'}</div></div>
        </div>
        <div class="card mt16"><div class="hd"><h3>${ic('calendar')} المهام القادمة</h3><span class="grow"></span><a class="btn ghost xs" href="#/tasks">عرض الكل</a></div><div class="tbl-scroll"><table class="tbl"><thead><tr><th class="s">المهمة</th><th>الأولوية</th><th>الحالة</th><th>التقدم</th><th>تاريخ الانتهاء</th><th>المسؤول</th></tr></thead><tbody>
          ${d.upcoming_tasks.map((x) => `<tr><td class="s"><a class="lk" href="#/tasks/${x.id}">${esc(x.title)}</a></td><td>${S.badge(S.ST.prio, x.priority)}</td><td>${S.badge(S.ST.taskStatus, x.status)}</td><td>${S.prog(x.progress)}</td><td class="num ${x.end_date && x.end_date < S.today() ? 'bad-t b' : ''}">${S.d(x.end_date)}</td><td>${esc(S.enName(x.assignee) || '—')}</td></tr>`).join('')}
        </tbody></table></div></div>`;
      S.chart.donut(el.querySelector('#tk'), { items: [['new', 'جديدة', '#64748b'], ['in_progress', 'قيد التنفيذ', '#2f7ae5'], ['done', 'منتهية', '#14a06b'], ['cancelled', 'ملغاة', '#e0384c']].map(([k, l, col]) => ({ label: S.tr(l), value: t[k] || 0, color: col })) });
      S.chart.donut(el.querySelector('#cr'), { items: [['incoming', 'واردة', '#2f7ae5'], ['outgoing', 'صادرة', '#7c5ce6'], ['internal', 'داخلية', '#0f9d9a']].map(([k, l, col]) => ({ label: S.tr(l), value: c[k] || 0, color: col })) });
    },
  });
})();
