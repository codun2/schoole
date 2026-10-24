/* سكوول — HR: employees, structure, attendance, leaves, advances, bonuses/deductions, payroll. */
(function () {
  'use strict';
  const { esc, ic, cell } = S;
  const empOpts = (lk) => (lk.employees || []).map((e) => [e.id, e.name + ' — ' + e.number]);
  const NATS = ['عماني', 'مصري', 'أردني', 'سوري', 'سوداني', 'هندي', 'باكستاني', 'فلبيني', 'تونسي', 'مغربي', 'أخرى'].map((n) => [n, n]);

  // ---------------------------------------------------------------- structure
  S.page('branches', S.crud({
    title: 'الفروع', singular: 'فرع', api: '/app/branches', perm: 'hr', icon: 'building', invalidate: ['branches'], search: false,
    columns: [{ l: 'الفرع', s: true, v: (r) => `<b>${esc(r.name)}</b> ${r.is_main ? '<span class="bdg l-info">رئيسي</span>' : ''}` }, { l: 'المدينة', v: (r) => esc(r.city || '—') }, { l: 'الهاتف', v: (r) => cell.phone(r.phone) }, { l: 'العنوان', v: (r) => esc(r.address || '—') }],
    fields: () => [{ k: 'name', l: 'اسم الفرع', req: true }, { k: 'city', l: 'المدينة' }, { k: 'phone', l: 'الهاتف', t: 'tel' }, { k: 'address', l: 'العنوان' }, { k: 'is_main', l: 'الفرع الرئيسي', t: 'check' }],
    canDelete: (r) => !r.is_main,
  }));
  S.page('departments', S.crud({
    title: 'الأقسام', singular: 'قسم', api: '/app/departments', perm: 'hr', icon: 'sitemap', lookups: ['employees'], invalidate: ['departments'],
    columns: [{ l: 'القسم', s: true, v: (r) => `<b>${esc(r.name)}</b>` }, { l: 'مدير القسم', v: (r) => esc(r.manager?.name || '—') }, { l: 'عدد الموظفين', v: (r) => `<a href="#/employees?department_id=${r.id}">${cell.cnt(r.employees_count)}</a>` }],
    fields: (lk) => [{ k: 'name', l: 'اسم القسم', req: true }, { k: 'manager_id', l: 'مدير القسم', t: 'select', opts: empOpts(lk) }],
  }));
  S.page('job-titles', S.crud({
    title: 'المسميات الوظيفية', singular: 'مسمى وظيفي', api: '/app/job-titles', perm: 'hr', icon: 'badge', lookups: ['departments'], invalidate: ['job_titles'],
    filters: [{ k: 'department_id', l: 'القسم', opts: (lk) => lk.departments.map((d) => [d.id, d.name]) }],
    columns: [{ l: 'المسمى', s: true, v: (r) => `<b>${esc(r.name)}</b>` }, { l: 'القسم', v: (r) => esc(r.department?.name || '—') }, { l: 'عدد الموظفين', v: (r) => cell.cnt(r.employees_count) }],
    fields: (lk) => [{ k: 'name', l: 'المسمى الوظيفي', req: true }, { k: 'department_id', l: 'القسم', t: 'select', opts: lk.departments.map((d) => [d.id, d.name]) }],
  }));

  // ---------------------------------------------------------------- employees
  async function employeeProfile(row, ctx) {
    const m = S.modal({ title: 'ملف الموظف', size: 'wide', body: S.spinner, foot: `<button class="btn ghost" data-close>إغلاق</button><button class="btn" id="ed">${ic('edit')} تعديل</button>` });
    const e = await S.get('/app/employees/' + row.id);
    m.$('#ed').onclick = () => { m.close(); ctx.openForm(e); };
    const a = e.attendance_month || {};
    m.body.innerHTML = `<div class="profile-h"><span class="avatar">${esc(S.initials(e.name))}</span><div class="grow"><h3>${esc(e.name)}</h3><div class="muted">${esc(e.job_title?.name || '')} · ${esc(e.department?.name || '')} · <span class="num">${esc(e.number)}</span></div></div>${S.badge(S.ST.emp, e.status)}</div>
      <div class="grid g4 mb16">${S.ui.stat('c-violet', 'wallet', S.money(e.total_salary, true), 'إجمالي الراتب')}${S.ui.stat('c-green', 'check', S.num(a.present || 0), 'حضور هذا الشهر')}${S.ui.stat('c-red', 'x', S.num(a.absent || 0), 'غياب هذا الشهر')}${S.ui.stat('c-amber', 'clock', S.num(a.late || 0), 'تأخير هذا الشهر')}</div>
      ${S.kv([['رقم الهوية', `<span class="num">${esc(e.national_id || '—')}</span>`], ['الجنسية', esc(e.nationality || '—')], ['الجوال', `<span class="num">${esc(e.phone || '—')}</span>`], ['البريد', esc(e.email || '—')], ['الفرع', esc(e.branch?.name || '—')], ['تاريخ التعيين', `<span class="num">${S.d(e.hire_date)}</span>`], ['الراتب الأساسي', S.money(e.basic_salary)], ['بدل السكن', S.money(e.housing_allowance)], ['بدل النقل', S.money(e.transport_allowance)], ['بدلات أخرى', S.money(e.other_allowance)], ['البنك', esc(e.bank_name || '—')], ['IBAN', `<span class="num xs">${esc(e.iban || '—')}</span>`], ['معلم', e.is_teacher ? 'نعم' : 'لا'], ['حساب الدخول', e.has_login ? `<span class="bdg l-ok">مفعّل</span> <span class="num xs">${esc(e.login_email || '')}</span>` : '<span class="muted">غير مفعّل</span>']])}
      <div class="sec-t">${ic('wallet')} آخر الرواتب</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>الشهر</th><th>الأساسي</th><th>البدلات</th><th>المكافآت</th><th>الاستقطاعات</th><th>السلف</th><th>الصافي</th><th>الحالة</th></tr></thead><tbody>${e.payslips.map((p) => `<tr><td>${S.monthLabel(p.month)}</td><td class="num">${S.fmtN(p.basic)}</td><td class="num">${S.fmtN(p.allowances)}</td><td class="num ok-t">${S.fmtN(p.bonuses)}</td><td class="num bad-t">${S.fmtN(p.deductions)}</td><td class="num">${S.fmtN(p.advance_deduction)}</td><td class="num b">${S.fmtN(p.net)}</td><td>${S.badge(S.ST.payroll, p.status)}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">لا توجد رواتب</td></tr>'}</tbody></table></div>
      <div class="grid g2 mt16"><div><div class="sec-t">${ic('plane')} الإجازات</div>${e.leaves.map((l) => `<div class="li"><span class="t"><b>${esc(l.leave_type?.name || '')} — ${l.days} يوم</b><small class="num">${S.d(l.from_date)} → ${S.d(l.to_date)}</small></span>${S.badge(S.ST.leave, l.status)}</div>`).join('') || '<div class="muted sm">لا يوجد</div>'}</div>
      <div><div class="sec-t">${ic('hand')} السلف</div>${e.advances.map((x) => `<div class="li"><span class="t"><b>${S.moneyT(x.amount)}</b><small class="num">${S.d(x.date)} · المتبقي ${S.fmtN(x.remaining)}</small></span><span class="bdg ${x.status === 'active' ? 'l-warn' : 'l-ok'}">${x.status === 'active' ? 'قائمة' : 'مسددة'}</span></div>`).join('') || '<div class="muted sm">لا يوجد</div>'}</div></div>
      ${(e.contracts || []).length ? `<div class="sec-t">${ic('contract')} العقود</div><div class="chips">${e.contracts.map((c) => `<span class="bdg ${c.status === 'terminated' ? 'l-mut' : c.state === 'expired' ? 'l-bad' : c.state === 'expiring' ? 'l-warn' : 'l-ok'}">${esc(c.number)} · ${({ permanent: 'دائم', fixed: 'محدد', part_time: 'جزئي' })[c.type]} · ${S.d(c.start_date)}${c.end_date ? ' ← ' + S.d(c.end_date) : ''}</span>`).join('')}</div>` : ''}
      ${(e.evaluations || []).length ? `<div class="sec-t">${ic('star')} التقييمات</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th class="s">الفترة</th><th>التاريخ</th><th>النتيجة</th><th>التقدير</th></tr></thead><tbody>${e.evaluations.map((v) => `<tr><td class="s">${esc(v.period?.name || '')}</td><td class="num">${S.d(v.date)}</td><td class="num b">${S.fmtN(v.total_score, 1)}%</td><td><span class="bdg l-info">${esc(v.grade || '—')}</span></td></tr>`).join('')}</tbody></table></div>` : ''}`;
  }
  S.page('employees', S.crud({
    title: 'الموظفون', singular: 'موظف', api: '/app/employees', perm: 'hr', icon: 'users', lookups: ['branches', 'departments', 'job_titles'], formSize: 'wide', invalidate: ['employees', 'teachers'],
    search: 'بحث بالاسم أو الرقم أو الهوية أو الجوال...', passParams: ['job_title_id'],
    filters: [{ k: 'department_id', l: 'القسم', all: 'كل الأقسام', opts: (lk) => lk.departments.map((d) => [d.id, d.name]) }, { k: 'status', l: 'الحالة', all: 'جميع الحالات', opts: S.opts(S.ST.emp) }, { k: 'branch_id', l: 'الفرع', all: 'كل الفروع', opts: (lk) => lk.branches.map((d) => [d.id, d.name]) }, { k: 'is_teacher', l: 'النوع', opts: [['1', 'معلمون'], ['0', 'إداريون وخدمات']] }],
    columns: [
      { l: 'الرقم', v: (r) => cell.num(r.number) }, { l: 'الاسم', s: true, v: (r) => `<a class="lk" href="#" data-open>${esc(r.name)}</a>` }, { l: 'الفرع', v: (r) => esc(r.branch?.name || '—') }, { l: 'القسم', v: (r) => esc(r.department?.name || '—') },
      { l: 'المسمى الوظيفي', v: (r) => esc(r.job_title?.name || '—') }, { l: 'الهاتف', v: (r) => cell.phone(r.phone) }, { l: 'تاريخ التعيين', v: (r) => cell.num(S.d(r.hire_date)) }, { l: 'الراتب', v: (r) => `<span class="num">${S.fmtN(r.total_salary)}</span>` }, { l: 'الحالة', v: (r) => S.badge(S.ST.emp, r.status) },
    ],
    fields: (lk) => [
      { t: 'sec', l: 'البيانات الشخصية' }, { k: 'name', l: 'الاسم الكامل', req: true, full: true }, { k: 'national_id', l: 'رقم الهوية / الإقامة', dir: 'ltr' }, { k: 'nationality', l: 'الجنسية', t: 'select', opts: NATS, def: 'عماني' }, { k: 'gender', l: 'الجنس', t: 'select', opts: S.opts(S.LBL.gender), def: 'male' }, { k: 'birth_date', l: 'تاريخ الميلاد', t: 'date' }, { k: 'phone', l: 'الجوال', t: 'tel' }, { k: 'email', l: 'البريد', t: 'email' }, { k: 'address', l: 'العنوان', full: true },
      { t: 'sec', l: 'الوظيفة' }, { k: 'branch_id', l: 'الفرع', t: 'select', opts: lk.branches.map((d) => [d.id, d.name]) }, { k: 'department_id', l: 'القسم', t: 'select', opts: lk.departments.map((d) => [d.id, d.name]) }, { k: 'job_title_id', l: 'المسمى الوظيفي', t: 'select', opts: lk.job_titles.map((d) => [d.id, d.name]) }, { k: 'hire_date', l: 'تاريخ التعيين', t: 'date', def: S.today() }, { k: 'status', l: 'الحالة', t: 'select', req: true, opts: S.opts(S.ST.emp), def: 'active' }, { k: 'is_teacher', l: 'عضو هيئة تدريسية', t: 'check' },
      { t: 'sec', l: 'الراتب والبنك' }, { k: 'basic_salary', l: 'الراتب الأساسي', t: 'money', req: true }, { k: 'housing_allowance', l: 'بدل السكن', t: 'money' }, { k: 'transport_allowance', l: 'بدل النقل', t: 'money' }, { k: 'other_allowance', l: 'بدلات أخرى', t: 'money' }, { k: 'bank_name', l: 'البنك' }, { k: 'iban', l: 'IBAN', dir: 'ltr' }, { k: 'notes', l: 'ملاحظات', t: 'textarea' },
      { t: 'sec', l: 'حساب دخول المعلم (اختياري)' }, { k: 'login_password', l: 'كلمة مرور الدخول', t: 'password', full: true, ph: 'للمعلمين فقط — يدخل بالبريد أو الجوال وكلمة المرور هذه' },
    ],
    view: employeeProfile, newDefaults: () => ({ status: 'active', hire_date: S.today() }),
    exportCols: [{ l: 'الرقم', v: (r) => r.number }, { l: 'الاسم', v: (r) => r.name }, { l: 'الهوية', v: (r) => r.national_id }, { l: 'الفرع', v: (r) => r.branch?.name }, { l: 'القسم', v: (r) => r.department?.name }, { l: 'المسمى', v: (r) => r.job_title?.name }, { l: 'الهاتف', v: (r) => r.phone }, { l: 'تاريخ التعيين', v: (r) => S.d(r.hire_date) }, { l: 'الراتب الأساسي', v: (r) => +r.basic_salary }, { l: 'إجمالي الراتب', v: (r) => +r.total_salary }, { l: 'الحالة', v: (r) => S.ST.emp[r.status][0] }],
  }));

  // ---------------------------------------------------------------- staff attendance
  S.page('emp-attendance', {
    perm: 'hr',
    async render(el, params) {
      let tab = params.tab || 'day';
      el.innerHTML = `${S.head('emp-attendance')}<div class="tabs"><button data-t="day">التسجيل اليومي</button><button data-t="month">الملخص الشهري</button></div><div id="b"></div>`;
      const b = el.querySelector('#b');
      const go = () => { el.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x.dataset.t === tab)); tab === 'day' ? day() : month(); };
      el.querySelector('.tabs').onclick = (e) => { const x = e.target.closest('button'); if (x) { tab = x.dataset.t; go(); } };
      function day() {
        b.innerHTML = `<div class="filters"><label class="fld"><span>التاريخ</span><input class="inp" type="date" id="dt" value="${S.today()}" max="${S.today()}" dir="ltr"></label></div><div id="sh"></div>`;
        const load = async () => {
          const sh = b.querySelector('#sh'); sh.innerHTML = S.spinner;
          const d = await S.get('/app/employee-attendance/sheet', { date: b.querySelector('#dt').value });
          const rows = d.employees.map((e) => ({ ...e, status: e.status || 'present', check_in: e.check_in || (e.status ? '' : '07:00'), check_out: e.check_out || (e.status ? '' : '14:00') }));
          const opts = ['present', 'late', 'absent', 'leave'];
          const draw = () => {
            sh.innerHTML = `<div class="toolbar"><span class="bdg l-ok">حاضر ${rows.filter((r) => r.status === 'present').length}</span><span class="bdg l-warn">متأخر ${rows.filter((r) => r.status === 'late').length}</span><span class="bdg l-bad">غائب ${rows.filter((r) => r.status === 'absent').length}</span><span class="bdg l-info">إجازة ${rows.filter((r) => r.status === 'leave').length}</span><div class="sp"></div><button class="btn success" id="sv">${ic('check')} حفظ</button></div>
              <div class="tbl-wrap"><div class="tbl-scroll"><table class="tbl"><thead><tr><th>#</th><th class="s">الموظف</th><th>القسم</th><th>الحالة</th><th>الحضور</th><th>الانصراف</th><th>ملاحظة</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td class="muted">${i + 1}</td><td class="s"><b>${esc(r.name)}</b><div class="muted xs num">${esc(r.number)} · ${esc(r.job_title || '')}</div></td><td>${esc(r.department || '—')}</td><td><div class="att-opts">${opts.map((o) => `<button data-i="${i}" data-s="${o}" class="${o} ${r.status === o ? 'on' : ''}">${S.ST.att[o][0]}</button>`).join('')}</div></td><td><input class="inp num" type="time" style="height:32px;width:110px" data-i="${i}" data-k="check_in" value="${esc(r.check_in || '')}" ${['absent', 'leave'].includes(r.status) ? 'disabled' : ''}></td><td><input class="inp num" type="time" style="height:32px;width:110px" data-i="${i}" data-k="check_out" value="${esc(r.check_out || '')}" ${['absent', 'leave'].includes(r.status) ? 'disabled' : ''}></td><td><input class="inp" style="height:32px" data-i="${i}" data-k="note" value="${esc(r.note || '')}"></td></tr>`).join('')}</tbody></table></div></div>`;
            sh.querySelectorAll('[data-s]').forEach((x) => (x.onclick = () => { rows[+x.dataset.i].status = x.dataset.s; draw(); }));
            sh.querySelectorAll('input[data-k]').forEach((x) => (x.onchange = () => (rows[+x.dataset.i][x.dataset.k] = x.value)));
            sh.querySelector('#sv').onclick = async (e) => { const _btn = e.currentTarget; S.btnBusy(_btn, true); try { await S.post('/app/employee-attendance', { date: b.querySelector('#dt').value, marks: rows.map((r) => ({ employee_id: r.id, status: r.status, check_in: ['absent', 'leave'].includes(r.status) ? null : r.check_in || null, check_out: ['absent', 'leave'].includes(r.status) ? null : r.check_out || null, note: r.note || null })) }); S.toast('تم الحفظ', 'ok'); } catch (er) { S.toast(er.message, 'bad'); } S.btnBusy(_btn, false); };
          };
          draw();
        };
        b.querySelector('#dt').onchange = load; load();
      }
      function month() {
        b.innerHTML = `<div class="filters"><label class="fld"><span>الشهر</span><input class="inp" type="month" id="m" value="${S.month()}" dir="ltr"></label><button class="btn outline-ok" id="x">${ic('download')} تصدير</button></div><div id="sh"></div>`;
        let rows = [];
        const load = async () => { rows = await S.get('/app/employee-attendance/summary', { month: b.querySelector('#m').value }); b.querySelector('#sh').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>الرقم</th><th class="s">الموظف</th><th>حضور</th><th>تأخير</th><th>غياب</th><th>إجازة</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td class="muted">${i + 1}</td><td class="num">${esc(r.number)}</td><td class="s b">${esc(r.name)}</td><td class="num ok-t">${r.present}</td><td class="num warn-t">${r.late}</td><td class="num bad-t b">${r.absent}</td><td class="num">${r.leave}</td></tr>`).join('')}</tbody></table></div>`; };
        b.querySelector('#m').onchange = load;
        b.querySelector('#x').onclick = () => S.exportXlsx('حضور-الموظفين-' + b.querySelector('#m').value, [{ l: 'الرقم', v: (r) => r.number }, { l: 'الموظف', v: (r) => r.name }, { l: 'حضور', v: (r) => r.present }, { l: 'تأخير', v: (r) => r.late }, { l: 'غياب', v: (r) => r.absent }, { l: 'إجازة', v: (r) => r.leave }], rows);
        load();
      }
      go();
    },
  });

  // ---------------------------------------------------------------- leaves
  S.page('leave-types', S.crud({
    title: 'أنواع الإجازات', singular: 'نوع إجازة', api: '/app/leave-types', perm: 'hr', icon: 'plane', invalidate: ['leave_types'], search: false,
    columns: [{ l: 'النوع', s: true, v: (r) => `<b>${esc(r.name)}</b>` }, { l: 'الأيام المستحقة سنوياً', v: (r) => cell.num(r.days_per_year || 'غير محدد') }, { l: 'مدفوعة', v: (r) => cell.yes(r.is_paid) }],
    fields: () => [{ k: 'name', l: 'اسم النوع', req: true }, { k: 'days_per_year', l: 'الأيام المستحقة سنوياً', t: 'number', min: 0 }, { k: 'is_paid', l: 'إجازة مدفوعة الأجر', t: 'check', def: true }],
  }));
  S.page('leave-requests', S.crud({
    title: 'طلبات الإجازات', singular: 'طلب إجازة', api: '/app/leave-requests', perm: 'hr', icon: 'plane', lookups: ['employees', 'leave_types'],
    chips: { k: 'status', items: S.opts(S.ST.leave) }, search: 'بحث باسم الموظف...',
    filters: [{ k: 'leave_type_id', l: 'النوع', opts: (lk) => lk.leave_types.map((t) => [t.id, t.name]) }, { k: 'from', l: 'من تاريخ', t: 'date' }, { k: 'to', l: 'إلى تاريخ', t: 'date' }],
    columns: [{ l: 'الموظف', s: true, v: (r) => cell.name(r.employee?.name, `<span class="num">${esc(r.employee?.number || '')}</span>`) }, { l: 'نوع الإجازة', v: (r) => esc(r.leave_type?.name || '—') }, { l: 'من', v: (r) => cell.num(S.d(r.from_date)) }, { l: 'إلى', v: (r) => cell.num(S.d(r.to_date)) }, { l: 'الأيام', v: (r) => cell.cnt(r.days) }, { l: 'السبب', v: (r) => `<span class="sm">${esc(r.reason || '—')}</span>` }, { l: 'الحالة', v: (r) => S.badge(S.ST.leave, r.status) }],
    fields: (lk) => [{ k: 'employee_id', l: 'الموظف', t: 'select', req: true, opts: empOpts(lk) }, { k: 'leave_type_id', l: 'نوع الإجازة', t: 'select', req: true, opts: lk.leave_types.map((t) => [t.id, t.name]) }, { k: 'from_date', l: 'من تاريخ', t: 'date', req: true }, { k: 'to_date', l: 'إلى تاريخ', t: 'date', req: true }, { k: 'reason', l: 'السبب', full: true }],
    canEdit: (r) => r.status === 'pending',
    rowActions: [
      { ic: 'check', cls: 'g', t: 'اعتماد', show: (r) => r.status === 'pending', run: async (r, ctx) => { try { const x = await S.post(`/app/leave-requests/${r.id}/decide`, { status: 'approved' }); S.toast(x.message, 'ok'); ctx.reload(); } catch (e) { S.toast(e.message, 'bad'); } } },
      { ic: 'x', cls: 'd', t: 'رفض', show: (r) => r.status === 'pending', run: async (r, ctx) => { try { const x = await S.post(`/app/leave-requests/${r.id}/decide`, { status: 'rejected' }); S.toast(x.message, 'ok'); ctx.reload(); } catch (e) { S.toast(e.message, 'bad'); } } },
    ],
  }));
  S.page('leave-balances', {
    perm: 'hr',
    async render(el) {
      const y = new Date().getFullYear();
      el.innerHTML = `${S.head('leave-balances')}<div class="filters"><label class="fld"><span>السنة</span><select class="inp" id="y">${[y, y - 1, y - 2].map((v) => `<option>${v}</option>`).join('')}</select></label></div><div id="b">${S.spinner}</div>`;
      const load = async () => {
        const d = await S.get('/app/leave-balances', { year: el.querySelector('#y').value });
        el.querySelector('#b').innerHTML = `<div class="tbl-wrap"><div class="tbl-scroll"><table class="tbl"><thead><tr><th>الرقم</th><th class="s">الموظف</th>${d.types.map((t) => `<th>${esc(t.name)}<div class="muted xs">المستخدم / المستحق</div></th>`).join('')}</tr></thead><tbody>${d.rows.map((r) => `<tr><td class="num">${esc(r.number)}</td><td class="s b">${esc(r.name)}</td>${r.types.map((t) => `<td><span class="num ${t.allowed && t.used >= t.allowed ? 'bad-t b' : ''}">${t.used} / ${t.allowed || '∞'}</span></td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
      };
      el.querySelector('#y').onchange = load; await load();
    },
  });

  // ---------------------------------------------------------------- advances / bonuses / deductions
  S.page('advances', S.crud({
    title: 'سلف الموظفين', singular: 'سلفة', api: '/app/advances', perm: 'hr', icon: 'hand', lookups: ['employees', 'cash_accounts'],
    chips: { k: 'status', items: [['active', 'قائمة'], ['settled', 'مسددة']] }, search: 'بحث باسم الموظف...',
    columns: [{ l: 'الموظف', s: true, v: (r) => cell.name(r.employee?.name, `<span class="num">${esc(r.employee?.number || '')}</span>`) }, { l: 'التاريخ', v: (r) => cell.num(S.d(r.date)) }, { l: 'مبلغ السلفة', v: (r) => S.money(r.amount) }, { l: 'القسط الشهري', v: (r) => `<span class="num">${S.fmtN(r.monthly_deduction)}</span>` }, { l: 'المتبقي', v: (r) => `<b class="num bad-t">${S.fmtN(r.remaining)}</b>` }, { l: 'نسبة السداد', v: (r) => S.prog(Math.round(((r.amount - r.remaining) * 100) / r.amount)) }, { l: 'الحالة', v: (r) => (r.status === 'active' ? '<span class="bdg warn">قائمة</span>' : '<span class="bdg ok">مسددة</span>') }],
    fields: (lk, row) => [{ k: 'employee_id', l: 'الموظف', t: 'select', req: true, opts: empOpts(lk) }, { k: 'date', l: 'تاريخ الصرف', t: 'date', req: true, def: S.today() }, { k: 'amount', l: 'مبلغ السلفة', t: 'money', req: true }, { k: 'monthly_deduction', l: 'الاستقطاع الشهري من الراتب', t: 'money', req: true }, ...(row ? [] : [{ k: 'cash_account_id', l: 'صُرفت من', t: 'select', opts: lk.cash_accounts.map((a) => [a.id, a.name]) }]), { k: 'notes', l: 'ملاحظات', full: true }],
    intro: '<p class="muted sm mb16">يُنشأ سند صرف تلقائياً عند تسجيل السلفة، وتُستقطع الأقساط عند اعتماد مسيّر الرواتب.</p>',
    canEdit: (r) => +r.remaining === +r.amount, canDelete: (r) => +r.remaining === +r.amount,
  }));
  const adjPage = (type) => S.crud({
    title: type === 'bonus' ? 'المكافآت' : 'الاستقطاعات', singular: type === 'bonus' ? 'مكافأة' : 'استقطاع', api: '/app/adjustments', perm: 'hr', icon: type === 'bonus' ? 'gift' : 'minusCircle', lookups: ['employees'],
    fixed: { type }, search: 'بحث باسم الموظف أو العنوان...',
    filters: [{ k: 'month', l: 'شهر الراتب', t: 'month' }],
    columns: [{ l: 'الموظف', s: true, v: (r) => cell.name(r.employee?.name, `<span class="num">${esc(r.employee?.number || '')}</span>`) }, { l: 'العنوان', v: (r) => esc(r.title) }, { l: 'المبلغ', v: (r) => `<b class="num ${type === 'bonus' ? 'ok-t' : 'bad-t'}">${S.fmtN(r.amount)}</b>` }, { l: 'شهر الراتب', v: (r) => S.monthLabel(r.month) }, { l: 'الحالة', v: (r) => (r.payroll_id ? '<span class="bdg l-ok">احتُسبت في الرواتب</span>' : '<span class="bdg l-warn">بانتظار المسيّر</span>') }, { l: 'ملاحظات', v: (r) => `<span class="sm">${esc(r.notes || '—')}</span>` }],
    fields: (lk) => [{ k: 'employee_id', l: 'الموظف', t: 'select', req: true, opts: empOpts(lk) }, { k: 'title', l: 'العنوان / السبب', req: true }, { k: 'amount', l: 'المبلغ', t: 'money', req: true }, { k: 'month', l: 'شهر الراتب', t: 'month', req: true, def: S.month() }, { k: 'notes', l: 'ملاحظات', full: true }],
    toPayload: (v) => ({ ...v, type }), newDefaults: () => ({ month: S.month() }),
    canEdit: (r) => !r.payroll_id, canDelete: (r) => !r.payroll_id,
  });
  S.page('bonuses', adjPage('bonus'));
  S.page('deductions', adjPage('deduction'));

  // ---------------------------------------------------------------- payroll
  S.page('payrolls', {
    perm: 'hr',
    async render(el) {
      el.innerHTML = `${S.head('payrolls')}<div class="toolbar"><label class="fld" style="flex-direction:row;align-items:center;gap:8px"><span>الشهر</span><input class="inp" type="month" id="m" value="${S.month()}" dir="ltr" style="width:170px"></label><button class="btn" id="gen">${ic('refresh')} توليد / تحديث المسيّر</button><div class="sp"></div></div><p class="muted sm mb16">يُحتسب الراتب = الأساسي + البدلات + المكافآت − الاستقطاعات − خصم الغياب (الأساسي ÷ 30 لكل يوم غياب) − قسط السلف.</p><div id="list">${S.spinner}</div>`;
      const load = async () => {
        const d = await S.get('/app/payrolls');
        el.querySelector('#list').innerHTML = d.data.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>الشهر</th><th>عدد الموظفين</th><th>الأساسي</th><th>البدلات</th><th>المكافآت</th><th>الاستقطاعات</th><th>الصافي</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>${d.data.map((p) => `<tr><td class="b">${S.monthLabel(p.month)}</td><td>${p.employees_count}</td><td class="num">${S.fmtN(p.total_basic)}</td><td class="num">${S.fmtN(p.total_allowances)}</td><td class="num ok-t">${S.fmtN(p.total_bonuses)}</td><td class="num bad-t">${S.fmtN(p.total_deductions)}</td><td class="num b acc-t">${S.fmtN(p.net_total)}</td><td>${S.badge(S.ST.payroll, p.status)}</td><td><div class="acts"><button class="ibtn v" data-v="${p.id}" title="عرض">${ic('eye')}</button>${p.status === 'draft' ? `<button class="ibtn d" data-d="${p.id}" title="حذف">${ic('trash')}</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>` : S.emptyHtml('لا توجد مسيّرات رواتب', 'اختر الشهر واضغط توليد المسيّر', 'wallet');
        el.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => view(+b.dataset.v)));
        el.querySelectorAll('[data-d]').forEach((b) => (b.onclick = async () => { if (await S.confirm('حذف المسيّر المسودة؟', 'حذف')) { await S.del('/app/payrolls/' + b.dataset.d); load(); } }));
      };
      el.querySelector('#gen').onclick = async (e) => { const _btn = e.currentTarget; S.btnBusy(_btn, true); try { const p = await S.post('/app/payrolls/generate', { month: el.querySelector('#m').value }); S.toast('تم توليد المسيّر', 'ok'); await load(); view(p.id); } catch (er) { S.toast(er.message, 'bad'); } S.btnBusy(_btn, false); };
      async function view(id) {
        const m = S.modal({ title: 'مسيّر الرواتب', size: 'xwide', body: S.spinner, foot: '<div id="pf" class="row wrap grow" style="justify-content:flex-end"></div>' });
        const refresh = async () => {
          const p = await S.get('/app/payrolls/' + id);
          m.$('h3').innerHTML = `مسيّر رواتب ${S.monthLabel(p.month)} ${S.badge(S.ST.payroll, p.status)}`;
          m.body.innerHTML = `<div class="grid g4 mb16">${S.ui.stat('c-blue', 'users', S.num(p.employees_count), 'موظف')}${S.ui.stat('c-violet', 'coins', S.money(+p.total_basic + +p.total_allowances, true), 'الأساسي + البدلات')}${S.ui.stat('c-red', 'minusCircle', S.money(p.total_deductions, true), 'إجمالي الاستقطاعات')}${S.ui.stat('c-green', 'wallet', S.money(p.net_total, true), 'صافي الرواتب')}</div>
            <div class="tbl-wrap"><div class="tbl-scroll"><table class="tbl"><thead><tr><th>#</th><th class="s">الموظف</th><th>القسم</th><th>الأساسي</th><th>البدلات</th><th>المكافآت</th><th>الاستقطاعات</th><th>السلف</th><th>الصافي</th><th>IBAN</th></tr></thead><tbody>${p.items.map((i, k) => `<tr><td class="muted">${k + 1}</td><td class="s"><b>${esc(i.employee?.name)}</b><div class="muted xs num">${esc(i.employee?.number)}</div></td><td>${esc(i.employee?.department?.name || '')}</td><td class="num">${S.fmtN(i.basic)}</td><td class="num">${S.fmtN(i.allowances)}</td><td class="num ok-t">${S.fmtN(i.bonuses)}</td><td class="num bad-t">${S.fmtN(i.deductions)}</td><td class="num">${S.fmtN(i.advance_deduction)}</td><td class="num b">${S.fmtN(i.net)}</td><td class="num xs muted">${esc(i.employee?.iban || '')}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="3">الإجمالي</td><td class="num">${S.fmtN(p.total_basic)}</td><td class="num">${S.fmtN(p.total_allowances)}</td><td class="num">${S.fmtN(p.total_bonuses)}</td><td colspan="2" class="num">${S.fmtN(p.total_deductions)}</td><td class="num">${S.fmtN(p.net_total)}</td><td></td></tr></tfoot></table></div></div>`;
          const f = m.$('#pf');
          f.innerHTML = `${p.status === 'draft' ? `<button class="btn success" data-a="approve">${ic('check')} اعتماد المسيّر</button>` : ''}${p.status === 'approved' ? `<button class="btn success" data-a="pay">${ic('bank')} صرف الرواتب</button>` : ''}<button class="btn ghost" data-a="export">${ic('download')} تصدير Excel</button><button class="btn ghost" data-a="print">${ic('printer')} طباعة</button><button class="btn ghost" data-a="close">إغلاق</button>`;
          const A = {
            approve: async () => { if (!(await S.confirm('اعتماد المسيّر؟ سيتم احتساب المكافآت والاستقطاعات وأقساط السلف نهائياً.', 'اعتماد', false))) return; await S.post(`/app/payrolls/${id}/approve`); S.toast('تم الاعتماد', 'ok'); refresh(); load(); },
            pay: async () => { const lk = await S.L(['cash_accounts']); S.formModal({ title: 'صرف رواتب ' + S.monthLabel(p.month), fields: [{ k: 'cash_account_id', l: 'من الحساب', t: 'select', req: true, opts: lk.cash_accounts.map((a) => [a.id, a.name]) }, { k: 'date', l: 'تاريخ الصرف', t: 'date', req: true, def: S.today() }], saveText: 'صرف', onSave: async (v) => { const r = await S.post(`/app/payrolls/${id}/pay`, v); S.toast(r.message, 'ok'); refresh(); load(); } }); },
            export: () => S.exportXlsx('رواتب-' + p.month, [{ l: 'الرقم', v: (i) => i.employee?.number }, { l: 'الموظف', v: (i) => i.employee?.name }, { l: 'الأساسي', v: (i) => +i.basic }, { l: 'البدلات', v: (i) => +i.allowances }, { l: 'المكافآت', v: (i) => +i.bonuses }, { l: 'الاستقطاعات', v: (i) => +i.deductions }, { l: 'السلف', v: (i) => +i.advance_deduction }, { l: 'الصافي', v: (i) => +i.net }, { l: 'البنك', v: (i) => i.employee?.bank_name }, { l: 'IBAN', v: (i) => i.employee?.iban }], p.items),
            print: () => S.print('مسيّر رواتب ' + p.month, `<h2>مسيّر رواتب شهر ${S.monthLabel(p.month)}</h2><table><thead><tr><th>#</th><th>الموظف</th><th>الأساسي</th><th>البدلات</th><th>المكافآت</th><th>الاستقطاعات</th><th>السلف</th><th>الصافي</th><th>التوقيع</th></tr></thead><tbody>${p.items.map((i, k) => `<tr><td>${k + 1}</td><td style="text-align:right">${esc(i.employee?.name)}</td><td>${S.fmtN(i.basic)}</td><td>${S.fmtN(i.allowances)}</td><td>${S.fmtN(i.bonuses)}</td><td>${S.fmtN(i.deductions)}</td><td>${S.fmtN(i.advance_deduction)}</td><td><b>${S.fmtN(i.net)}</b></td><td style="width:80px"></td></tr>`).join('')}<tr class="tot"><td colspan="7">الإجمالي</td><td>${S.moneyT(p.net_total)}</td><td></td></tr></tbody></table><div class="sig"><div>إعداد: الموارد البشرية</div><div>مراجعة: المالية</div><div>اعتماد: المدير</div></div>`),
            close: () => m.close(),
          };
          f.querySelectorAll('[data-a]').forEach((b) => (b.onclick = async () => { try { await A[b.dataset.a](); } catch (e) { S.toast(e.message, 'bad'); } }));
        };
        refresh();
      }
      await load();
    },
  });
})();
