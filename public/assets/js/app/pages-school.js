/* سكوول — schools module: years, grades, sections, buses, guardians, students, applications, custom fields, attendance, fee items. */
(function () {
  'use strict';
  const { esc, ic, cell } = S;
  const gradeOpts = (lk) => (lk.grades || []).map((g) => [g.id, g.name_ar]);
  const sectionOpts = (lk) => (lk.sections || []).map((s) => [s.id, (s.grade ? S.enName(s.grade) + ' / ' : '') + S.enName(s)]);
  const NATS = ['عماني', 'إماراتي', 'سعودي', 'كويتي', 'بحريني', 'قطري', 'يمني', 'مصري', 'أردني', 'سوري', 'سوداني', 'هندي', 'باكستاني', 'أخرى'];
  const natOpts = NATS.map((n) => [n, n]);

  // ---------------------------------------------------------------- years
  S.page('years', S.crud({
    title: 'السنوات الدراسية', singular: 'سنة دراسية', api: '/app/academic-years', perm: 'school', icon: 'calendar', invalidate: ['years'],
    columns: [
      { l: 'السنة الدراسية', v: (r) => `<b>${esc(r.name)}</b> ${r.is_current ? '<span class="bdg ok">الحالية</span>' : ''}` },
      { l: 'تاريخ البداية', v: (r) => cell.num(S.d(r.start_date)) }, { l: 'تاريخ النهاية', v: (r) => cell.num(S.d(r.end_date)) },
      { l: 'الصفوف', v: (r) => cell.cnt(r.grades_count) }, { l: 'الطلاب', v: (r) => cell.cnt(r.students_count, 'r') },
    ],
    fields: () => [{ k: 'name', l: 'اسم السنة', req: true, ph: 'مثال: 2026/2027' }, { k: 'is_current', l: 'تعيينها كسنة حالية', t: 'check' }, { k: 'start_date', l: 'تاريخ البداية', t: 'date' }, { k: 'end_date', l: 'تاريخ النهاية', t: 'date' }],
    rowActions: [
      { ic: 'check', cls: 'g', t: 'تعيين كسنة حالية', show: (r) => !r.is_current, run: async (r, ctx) => { await S.post(`/app/academic-years/${r.id}/current`); S.setYear(r.id); S.toast('تم التعيين', 'ok'); ctx.reload(); } },
      { ic: 'copy', cls: 'p', t: 'نسخ الهيكل من سنة أخرى', show: (r) => !r.grades_count, run: (r, ctx) => S.formModal({ title: 'نسخ الصفوف والشعب والرسوم والحافلات إلى ' + r.name, fields: [{ k: 'from_year_id', l: 'نسخ من السنة', t: 'select', req: true, opts: ctx.rows.filter((y) => y.id !== r.id).map((y) => [y.id, y.name]) }], saveText: 'نسخ', onSave: async (v) => { const res = await S.post(`/app/academic-years/${r.id}/clone`, v); S.toast(res.message, 'ok'); ctx.reload(); } }) },
    ],
    search: 'بحث باسم السنة...',
  }));

  // ---------------------------------------------------------------- grades
  S.page('grades', S.crud({
    title: 'الصفوف', singular: 'صف', api: '/app/grades', perm: 'school', year: true, icon: 'layers', invalidate: ['grades', 'sections'],
    columns: [
      { l: 'السنة الدراسية', v: () => esc((S.L.peek('years').find((y) => String(y.id) === String(S.yearId())) || {}).name || '') },
      { l: 'الاسم بالعربية', v: (r) => `<b>${esc(r.name_ar)}</b>` }, { l: 'الاسم بالإنجليزية', v: (r) => esc(r.name_en || '—') }, { l: 'الترتيب', v: (r) => cell.num(r.sort) },
      { l: 'الشعب', v: (r) => `<a href="#/sections?grade_id=${r.id}">${cell.cnt(r.sections_count)}</a>` }, { l: 'الطلاب', v: (r) => `<a href="#/students?grade_id=${r.id}">${cell.cnt(r.students_count, 'r')}</a>` },
    ],
    fields: () => [{ k: 'name_ar', l: 'الاسم بالعربية', req: true, ph: 'الصف الأول' }, { k: 'name_en', l: 'الاسم بالإنجليزية', ph: 'Grade 1', dir: 'ltr' }, { k: 'sort', l: 'الترتيب', t: 'number', min: 0 }],
    rowActions: [{ ic: 'columns', cls: 'v', t: 'الشعب', run: (r) => (location.hash = '#/sections?grade_id=' + r.id) }],
    search: 'بحث...',
  }));

  // ---------------------------------------------------------------- sections
  S.page('sections', S.crud({
    title: 'الشعب', singular: 'شعبة', api: '/app/sections', perm: 'school', year: true, icon: 'columns', lookups: ['grades', 'teachers'], invalidate: ['sections'],
    filters: [{ k: 'grade_id', l: 'الصف', opts: gradeOpts }],
    columns: [
      { l: 'الصف', v: (r) => esc(r.grade?.name_ar) }, { l: 'الشعبة', v: (r) => `<b>${esc(r.name)}</b>` }, { l: 'القاعة', v: (r) => esc(r.room || '—') },
      { l: 'رائد الفصل', v: (r) => esc(r.teacher?.name || '—') },
      { l: 'الطلاب / السعة', v: (r) => `<span class="num">${r.students_count} / ${r.capacity}</span>` },
      { l: 'الإشغال', v: (r) => S.prog(r.capacity ? Math.round((r.students_count * 100) / r.capacity) : 0) },
    ],
    fields: (lk) => [{ k: 'grade_id', l: 'الصف', t: 'select', req: true, opts: gradeOpts(lk) }, { k: 'name', l: 'اسم الشعبة', req: true, ph: 'شعبة أ' }, { k: 'name_en', l: 'الاسم بالإنجليزية', dir: 'ltr' }, { k: 'capacity', l: 'السعة', t: 'number', min: 0, def: 30 }, { k: 'room', l: 'القاعة' }, { k: 'teacher_id', l: 'رائد الفصل', t: 'select', opts: (lk.teachers || []).map((t) => [t.id, t.name]) }],
    rowActions: [{ ic: 'calCheck', cls: 'g', t: 'تسجيل الحضور', run: (r) => (location.hash = '#/attendance?section_id=' + r.id) }, { ic: 'users', cls: 'v', t: 'الطلاب', run: (r) => (location.hash = '#/students?section_id=' + r.id) }],
    newDefaults: (st) => ({ grade_id: st.f.grade_id, capacity: 30 }),
  }));

  // ---------------------------------------------------------------- buses
  const printBus = async (r) => {
    const d = await S.get(`/app/buses/${r.id}/students`);
    S.print('كشف ركاب الحافلة ' + r.number, `<h2>كشف ركاب الحافلة رقم ${esc(r.number)}</h2>
      <div class="kv"><div><span>نوع الحافلة</span><b>${esc(r.type || '—')}</b></div><div><span>السائق</span><b>${esc(r.driver_name || '—')} — ${esc(r.driver_phone || '')}</b></div><div><span>المشرف</span><b>${esc(r.supervisor_name || '—')}</b></div><div><span>خط السير</span><b>${esc(r.route || '—')}</b></div><div><span>عدد الركاب</span><b>${d.students.length} / ${r.capacity}</b></div></div>
      <table><thead><tr><th>#</th><th>اسم الطالب</th><th>الصف / الشعبة</th><th>ولي الأمر</th><th>الجوال</th><th>توقيع</th></tr></thead><tbody>${d.students.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(S.enName(s))}</td><td>${esc(S.gs(s, ''))}</td><td>${esc(S.enName(s.guardian))}</td><td>${esc(s.guardian?.phone || '')}</td><td style="width:90px"></td></tr>`).join('')}</tbody></table>`);
  };
  const busFields = (lk, row) => [
    { t: 'sec', l: 'بيانات الحافلة' },
    { k: 'number', l: 'رقم الحافلة / رقم اللوحة', req: true, dir: 'ltr' }, { k: 'type', l: 'نوع الحافلة', ph: 'باص 26 راكب' }, { k: 'capacity', l: 'عدد الركاب (السعة)', t: 'number', min: 0 }, { k: 'route', l: 'خط السير / المسار', full: true },
    { t: 'sec', l: 'السائق والمشرف' },
    { k: 'driver_name', l: 'اسم السائق' }, { k: 'driver_phone', l: 'هاتف السائق', t: 'tel' }, { k: 'supervisor_name', l: 'المشرف/ة' },
    { t: 'sec', l: 'الرسوم' },
    { k: 'price', l: 'السعر السنوي المتفق عليه', t: 'money' },
    { t: 'sec', l: 'صورة الحافلة (اختياري)' },
    { k: 'photo', l: row && row.photo ? 'استبدال الصورة' : 'إرفاق صورة', t: 'file', accept: 'image/*', full: true, help: 'صورة للحافلة — اختيارية (JPG أو PNG، حتى 5 ميجابايت). ترفع عند توفّر الاتصال.' },
    ...(row && row.photo ? [{ k: 'remove_photo', l: 'حذف الصورة الحالية عند الحفظ', t: 'check' }] : []),
  ];
  S.page('buses', S.crud({
    title: 'الحافلات', singular: 'حافلة', api: '/app/buses', perm: 'school', year: true, icon: 'bus', invalidate: ['buses'], editPage: 'bus-form',
    columns: [
      { l: 'رقم الحافلة', v: (r) => `<b class="num">${esc(r.number)}</b>` }, { l: 'نوع الحافلة', v: (r) => esc(r.type || '—') }, { l: 'السائق', v: (r) => esc(r.driver_name || '—') },
      { l: 'هاتف السائق', v: (r) => cell.phone(r.driver_phone) }, { l: 'خط السير', v: (r) => `<span class="sm t2">${esc(r.route || '—')}</span>` }, { l: 'عدد الركاب', v: (r) => cell.num(r.capacity) },
      { l: 'الطلاب', v: (r) => `<a href="#/students?bus_id=${r.id}">${cell.cnt(r.students_count, 'r')}</a>` }, { l: 'السعر المتفق عليه', v: (r) => S.money(r.price) },
    ],
    rowActions: [{ ic: 'printer', cls: 'p', t: 'طباعة كشف الركاب', run: printBus }],
    search: 'بحث برقم الحافلة أو السائق...',
  }));
  S.page('bus-form', S.formPage({
    api: '/app/buses', title: 'الحافلات', singular: 'حافلة', perm: 'school', year: true, backTo: 'buses', invalidate: ['buses'], fields: busFields,
    context: (row) => row ? `<div class="card pad"><div class="sec-t" style="margin-top:0">${ic('bus')} ملخص الحافلة</div>
      ${row.photo ? `<img src="${esc(row.photo)}" alt="" style="width:100%;max-height:200px;object-fit:cover;border-radius:10px;border:1px solid var(--line);margin-bottom:12px">` : ''}
      ${S.kv([['السعة', `<span class="num">${esc(row.capacity || '—')}</span> راكب`], ['عدد الركاب الحاليين', `<span class="num">${esc(row.students_count ?? '—')}</span>`], ['السعر السنوي', S.moneyT(row.price || 0)]])}
      <a class="btn ghost sm mt8" href="#/students?bus_id=${row.id}&year=all">${ic('users')} عرض قائمة الركاب</a></div>
      <div class="card pad" style="margin-top:14px"><div class="sec-t" style="margin-top:0">${ic('printer')} الطباعة</div><p class="muted sm">بعد الحفظ يمكنك طباعة كشف ركاب الحافلة من قائمة الحافلات.</p></div>` : `<div class="card pad"><p class="muted sm">${ic('bus')} أدخل بيانات الحافلة والسائق وخط السير. بعد الحفظ يمكنك إسناد الطلاب إليها من شاشة الطلاب.</p></div>`,
  }));

  // ---------------------------------------------------------------- guardians
  const guardianFields = (lk, row) => [
    { k: 'name', l: 'الاسم الكامل', req: true, full: true }, { k: 'name_en', l: 'الاسم بالإنجليزية', dir: 'ltr' }, { k: 'national_id', l: 'رقم الهوية المدنية', dir: 'ltr' }, { k: 'nationality', l: 'الجنسية', t: 'select', opts: natOpts, def: 'عماني' },
    { k: 'phone', l: 'الجوال', t: 'tel', req: true }, { k: 'phone2', l: 'جوال إضافي', t: 'tel' }, { k: 'email', l: 'البريد الإلكتروني', t: 'email' }, { k: 'relation', l: 'صلة القرابة', t: 'select', opts: [['أب', 'أب'], ['أم', 'أم'], ['أخ', 'أخ'], ['جد', 'جد'], ['عم', 'عم'], ['خال', 'خال'], ['أخرى', 'أخرى']], def: 'أب' },
    { k: 'job', l: 'المهنة' }, { k: 'workplace', l: 'جهة العمل' }, { k: 'address', l: 'العنوان', full: true },
    ...customFieldSpecs(lk, 'guardian'),
    { k: 'notes', l: 'ملاحظات', t: 'textarea' },
    { t: 'sec', l: '🔑 دخول ولي الأمر للبوابة (اختياري)' },
    { k: 'password', l: row && row.has_login ? 'كلمة مرور جديدة (اتركها فارغة للإبقاء)' : 'كلمة المرور', t: 'password', help: 'يدخل ولي الأمر برقم جواله أو بريده وكلمة المرور هذه.' },
  ];
  function customFieldSpecs(lk, entity) { return (lk.custom_fields || []).filter((f) => f.entity === entity).map((f) => ({ k: 'cf_' + f.key, l: f.label, req: f.required, t: f.type === 'select' ? 'select' : f.type, opts: (f.options || []).map((o) => [o, o]), virtualCustom: f.key })); }
  const packCustom = (vals, lk, entity) => {
    const specs = (lk.custom_fields || []).filter((f) => f.entity === entity);
    if (vals instanceof FormData) { // a photo was attached → repackage cf_* into custom[key] form fields
      specs.forEach((f) => { const v = vals.get('cf_' + f.key); vals.delete('cf_' + f.key); if (v !== null && v !== undefined && v !== '') vals.append('custom[' + f.key + ']', v); });
      return vals;
    }
    const custom = {}; specs.forEach((f) => { custom[f.key] = vals['cf_' + f.key]; delete vals['cf_' + f.key]; }); vals.custom = custom; return vals;
  };
  const unpackCustom = (row) => { const v = { ...row }; Object.entries(row.custom || {}).forEach(([k, x]) => (v['cf_' + k] = x)); return v; };
  S.customFieldSpecs = customFieldSpecs;

  S.page('guardians', S.crud({
    title: 'أولياء الأمور', singular: 'ولي أمر', api: '/app/guardians', perm: 'students', icon: 'parents', lookups: ['custom_fields'], invalidate: ['guardians'], editPage: 'guardian-form',
    search: 'بحث بالاسم أو رقم الهوية أو الجوال...',
    columns: [
      { l: 'الاسم', s: true, v: (r) => `<a class="lk" href="#" data-open>${esc(S.enName(r))}</a> ${r.has_login ? `<span title="لديه دخول للبوابة">🔑</span>` : ''}` },
      { l: 'رقم الهوية المدنية', v: (r) => cell.num(r.national_id || '—') }, { l: 'الجنسية', v: (r) => esc(r.nationality || '—') },
      { l: 'الجوال', v: (r) => cell.phone(r.phone) }, { l: 'الطلاب', v: (r) => `<a href="#/students?guardian_id=${r.id}&year=all">${cell.cnt(r.students_count)}</a>` },
    ],
    view: async (row, ctx) => {
      const m = S.modal({ title: 'ملف ولي الأمر', size: 'wide', body: S.spinner, foot: `<button class="btn ghost" data-close>إغلاق</button><button class="btn" id="ed">${ic('edit')} تعديل</button>` });
      const g = await S.get('/app/guardians/' + row.id);
      m.$('#ed').onclick = () => { m.close(); ctx.openForm(g); };
      const cfs = (ctx.lk.custom_fields || []).filter((f) => f.entity === 'guardian');
      m.body.innerHTML = `<div class="profile-h"><span class="avatar">${esc(S.initials(S.enName(g)))}</span><div><h3>${esc(S.enName(g))}</h3><div class="muted">${esc(g.relation || '')} ${g.has_login ? '· <span class="ok-t">لديه دخول للبوابة</span>' : ''}</div></div></div>
        ${S.kv([['رقم الهوية', `<span class="num">${esc(g.national_id || '—')}</span>`], ['الجنسية', esc(g.nationality || '—')], ['الجوال', `<span class="num">${esc(g.phone || '—')}</span>`], ['جوال إضافي', `<span class="num">${esc(g.phone2 || '—')}</span>`], ['البريد', esc(g.email || '—')], ['المهنة', esc(g.job || '—')], ['جهة العمل', esc(g.workplace || '—')], ['العنوان', esc(g.address || '—')], ...cfs.map((f) => [f.label, esc((g.custom || {})[f.key] || '—')])])}
        <div class="sec-t">${ic('users')} الأبناء</div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="s">الطالب</th><th>الصف / الشعبة</th><th>الحالة</th></tr></thead><tbody>${g.students.map((s) => `<tr><td class="s"><a class="lk" href="#/students/${s.id}">${esc(S.enName(s))}</a></td><td>${esc(S.gs(s, ''))}</td><td>${S.badge(S.ST.student, s.status)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">لا يوجد أبناء</td></tr>'}</tbody></table></div>
        <div class="sec-t">${ic('contract')} العقود</div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>رقم العقد</th><th>التاريخ</th><th>الإجمالي</th><th>المدفوع</th><th>الباقي</th><th>الحالة</th></tr></thead><tbody>${g.contracts.map((c) => `<tr><td><a class="lk num" href="#/contracts/${c.id}">${esc(c.number)}</a></td><td class="num">${S.d(c.date)}</td><td class="num">${S.fmtN(c.total)}</td><td class="num ok-t">${S.fmtN(c.paid)}</td><td class="num bad-t">${S.fmtN(c.remaining)}</td><td>${S.badge(S.ST.contract, c.status)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">لا توجد عقود</td></tr>'}</tbody></table></div>`;
    },
    exportCols: [{ l: 'الاسم', v: (r) => r.name }, { l: 'رقم الهوية', v: (r) => r.national_id }, { l: 'الجنسية', v: (r) => r.nationality }, { l: 'الجوال', v: (r) => r.phone }, { l: 'البريد', v: (r) => r.email }, { l: 'عدد الطلاب', v: (r) => r.students_count }],
    importer: { endpoint: '/app/guardians/import', file: 'نموذج-أولياء-الأمور', headers: ['الاسم', 'رقم الهوية', 'الجنسية', 'الجوال', 'البريد', 'صلة القرابة', 'المهنة', 'العنوان'], sample: [['خالد بن سعيد الهنائي', '12345678', 'عماني', '96891234567', '', 'أب', 'مهندس', 'مسقط']], map: { name: ['الاسم', 'name'], national_id: ['رقم الهوية', 'national_id'], nationality: ['الجنسية', 'nationality'], phone: ['الجوال', 'phone'], email: ['البريد', 'email'], relation: ['صلة القرابة', 'relation'], job: ['المهنة', 'job'], address: ['العنوان', 'address'] } },
  }));

  S.page('guardian-form', S.formPage({
    api: '/app/guardians', title: 'أولياء الأمور', singular: 'ولي أمر', perm: 'students', backTo: 'guardians',
    lookups: ['custom_fields'], invalidate: ['guardians'],
    fields: guardianFields, toForm: unpackCustom, toPayload: (v) => packCustom(v, S._lkG || {}, 'guardian'),
    afterRender: (el, c) => (S._lkG = c.lk),
    context: (g) => {
      if (!g) return `<div class="card pad"><p class="muted sm">${ic('parents')} سجّل بيانات ولي الأمر. يمكنك لاحقاً ربط أبنائه به من شاشة الطلاب، وتفعيل دخوله لبوابة ولي الأمر من هذا النموذج.</p></div>`;
      return `<div class="card pad"><div class="profile-h" style="margin:0 0 12px"><span class="avatar">${esc(S.initials(g.name))}</span><div class="grow"><b>${esc(g.name)}</b><div class="muted sm">${esc(g.relation || '')}</div></div>${g.has_login ? '<span class="bdg l-ok">دخول مفعّل</span>' : '<span class="bdg l-mut">بلا دخول</span>'}</div>
        <div class="sec-t" style="margin-top:0">${ic('users')} الأبناء (${(g.students || []).length})</div>
        <div class="chips">${(g.students || []).map((s) => `<a class="bdg l-info" href="#/students/${s.id}">${esc(S.enName(s))}</a>`).join('') || '<span class="muted sm">لا يوجد</span>'}</div>
        ${(g.contracts || []).length ? `<div class="sec-t">${ic('contract')} العقود</div><div class="chips">${g.contracts.map((c) => `<a class="bdg l-mut num" href="#/contracts/${c.id}">${esc(c.number)} · ${S.fmtN(c.remaining)}</a>`).join('')}</div>` : ''}</div>`;
    },
  }));

  // ---------------------------------------------------------------- students
  const studentFields = (lk, row) => [
    { t: 'sec', l: 'البيانات الأساسية' },
    { k: 'name', l: 'اسم الطالب الكامل', req: true, full: true }, { k: 'name_en', l: 'الاسم بالإنجليزية', dir: 'ltr' }, { k: 'national_id', l: 'رقم الهوية المدنية', dir: 'ltr' },
    { k: 'gender', l: 'الجنس', t: 'select', req: true, opts: S.opts(S.LBL.gender), def: 'male' }, { k: 'birth_date', l: 'تاريخ الميلاد', t: 'date' }, { k: 'nationality', l: 'الجنسية', t: 'select', opts: natOpts, def: 'عماني' }, { k: 'blood_type', l: 'فصيلة الدم', t: 'select', opts: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => [b, b]) },
    { t: 'sec', l: 'التسجيل' },
    { k: 'guardian_id', l: 'ولي الأمر', t: 'select', opts: (lk.guardians || []).map((g) => [g.id, S.enName(g) + (g.phone ? ' — ' + g.phone : '')]), help: 'غير موجود؟ أضفه من شاشة أولياء الأمور أولاً' },
    { k: 'section_id', l: 'الصف / الشعبة', t: 'select', opts: sectionOpts(lk) }, { k: 'bus_id', l: 'الحافلة', t: 'select', blank: 'بدون حافلة', opts: (lk.buses || []).map((b) => [b.id, b.number + (b.type ? ' — ' + b.type : '')]) },
    { k: 'status', l: 'الحالة', t: 'select', req: true, opts: S.opts(S.ST.student), def: 'active' }, { k: 'registered_at', l: 'تاريخ التسجيل', t: 'date', def: S.today() }, { k: 'student_no', l: 'الرقم المدرسي', dir: 'ltr', ph: 'يُولّد تلقائياً' },
    ...(customFieldSpecs(lk, 'student').length ? [{ t: 'sec', l: 'حقول مخصّصة' }, ...customFieldSpecs(lk, 'student')] : []),
    { t: 'sec', l: 'صورة الطالب (اختياري)' },
    { k: 'photo', l: row && row.photo ? 'استبدال الصورة' : 'إرفاق صورة', t: 'file', accept: 'image/*', full: true, help: 'صورة شخصية واضحة للطالب — اختيارية (JPG أو PNG، حتى 5 ميجابايت). ترفع عند توفّر الاتصال.' },
    ...(row && row.photo ? [{ k: 'remove_photo', l: 'حذف الصورة الحالية عند الحفظ', t: 'check' }] : []),
    { t: 'sec', l: '🔑 دخول الطالب للبوابة (اختياري)' },
    { k: 'login_password', l: row && row.has_login ? 'كلمة مرور جديدة (اتركها فارغة للإبقاء)' : 'كلمة مرور الدخول', t: 'password', help: 'يدخل الطالب بوابته من صفحة الدخول برقمه المدرسي' + (row && row.student_no ? ' «' + row.student_no + '»' : '') + ' وكلمة المرور هذه.' },
    { t: 'sec', l: 'معلومات إضافية' },
    { k: 'address', l: 'العنوان', full: true }, { k: 'medical_notes', l: 'ملاحظات صحية', t: 'textarea' }, { k: 'notes', l: 'ملاحظات', t: 'textarea' },
  ];
  async function studentProfile(row, ctx) {
    const m = S.modal({ title: 'ملف الطالب', size: 'wide', body: S.spinner, foot: `<button class="btn ghost" data-close>إغلاق</button><button class="btn soft" id="rc">${ic('fileText')} كشف الدرجات</button><a class="btn soft" id="nc">${ic('contract')} عقد جديد</a><button class="btn" id="ed">${ic('edit')} تعديل</button>` });
    const s = await S.get('/app/students/' + row.id);
    m.$('#ed').onclick = () => { m.close(); ctx.openForm(s); };
    m.$('#nc').onclick = () => { m.close(); S.contractBuilder(null, { student_id: s.id }); };
    m.$('#rc').onclick = () => { m.close(); S.reportCard(s.id); };
    const a = s.attendance_summary, tot = a.present + a.absent + a.late + a.excused;
    const cfs = (ctx.lk.custom_fields || []).filter((f) => f.entity === 'student');
    m.body.innerHTML = `<div class="profile-h">${S.avatarHtml(s.photo, S.enName(s))}<div class="grow"><h3>${esc(S.enName(s))}</h3><div class="muted">${esc(s.name_en || '')} · <span class="num">${esc(s.student_no || '')}</span></div></div>${S.badge(S.ST.student, s.status)}</div>
      <div class="grid g4 mb16">
        ${S.ui.stat('c-green', 'check', tot ? Math.round(((a.present + a.late) * 100) / tot) + '%' : '—', 'نسبة الحضور')}
        ${S.ui.stat('c-red', 'x', S.num(a.absent), 'أيام الغياب')}
        ${S.ui.stat('c-amber', 'clock', S.num(a.late), 'مرات التأخير')}
        ${S.ui.stat('c-violet', 'coins', S.money(s.contracts.reduce((x, c) => x + (c.status === 'cancelled' ? 0 : +c.remaining), 0), true), 'المتبقي من الرسوم')}
      </div>
      ${S.kv([['الصف / الشعبة', esc(S.gs(s))], ['ولي الأمر', s.guardian ? `<a class="lk" href="#/guardians/${s.guardian.id}">${esc(S.enName(s.guardian))}</a>` : '—'], ['جوال ولي الأمر', `<span class="num">${esc(s.guardian?.phone || '—')}</span>`], ['رقم الهوية', `<span class="num">${esc(s.national_id || '—')}</span>`], ['الجنس', S.LBL.gender[s.gender]], ['تاريخ الميلاد', `<span class="num">${S.d(s.birth_date)}</span>`], ['الجنسية', esc(s.nationality || '—')], ['فصيلة الدم', esc(s.blood_type || '—')], ['الحافلة', esc(s.bus?.number || 'بدون')], ['تاريخ التسجيل', `<span class="num">${S.d(s.registered_at)}</span>`], ['دخول البوابة', s.has_login ? `<span class="bdg l-ok">مفعّل</span> <span class="muted xs num">${esc(s.student_no || '')}</span>` : '<span class="muted">غير مفعّل</span>'], ...cfs.map((f) => [f.label, esc((s.custom || {})[f.key] || '—')]), ['العنوان', esc(s.address || '—')], ['ملاحظات صحية', esc(s.medical_notes || '—')]])}
      <div class="sec-t">${ic('contract')} العقود</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>رقم العقد</th><th>التاريخ</th><th>الإجمالي</th><th>المدفوع</th><th>الباقي</th><th>الحالة</th></tr></thead><tbody>${s.contracts.map((c) => `<tr><td><a class="lk num" href="#/contracts/${c.id}">${esc(c.number)}</a></td><td class="num">${S.d(c.date)}</td><td class="num">${S.fmtN(c.total)}</td><td class="num ok-t">${S.fmtN(c.paid)}</td><td class="num bad-t">${S.fmtN(c.remaining)}</td><td>${S.badge(S.ST.contract, c.status)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">لا توجد عقود بعد</td></tr>'}</tbody></table></div>
      ${s.recent_absences.length ? `<div class="sec-t">${ic('calendar')} آخر حالات الغياب والتأخير</div><div class="chips">${s.recent_absences.map((x) => `<span class="bdg ${x.status === 'absent' ? 'l-bad' : 'l-warn'} num">${S.d(x.date)} — ${S.ST.att[x.status][0]}</span>`).join('')}</div>` : ''}`;
  }
  S.page('students', S.crud({
    title: 'الطلاب', singular: 'طالب', api: '/app/students', perm: 'students', year: true, icon: 'users', lookups: ['grades', 'sections', 'buses', 'guardians', 'custom_fields'], editPage: 'student-form',
    search: 'بحث باسم الطالب أو رقم هويته أو ولي الأمر أو الجوال...',
    passParams: ['guardian_id', 'bus_id'],
    filters: [{ k: 'status', l: 'الحالة', all: 'جميع الحالات', opts: S.opts(S.ST.student) }, { k: 'grade_id', l: 'الصف', all: 'كل الصفوف', opts: gradeOpts }, { k: 'section_id', l: 'الشعبة', all: 'كل الشعب', opts: sectionOpts }],
    columns: [
      { l: 'اسم الطالب', s: true, v: (r) => `<a class="lk" href="#" data-open>${esc(S.enName(r))}</a>` }, { l: 'رقم الهوية المدنية', v: (r) => cell.num(r.national_id || '—') },
      { l: 'الصف / الشعبة', v: (r) => esc(S.gs(r)) }, { l: 'ولي الأمر', v: (r) => esc(S.enName(r.guardian) || '—') },
      { l: 'جوال ولي الأمر', v: (r) => cell.phone(r.guardian?.phone) }, { l: 'الحالة', v: (r) => S.badge(S.ST.student, r.status) }, { l: 'الجنسية', v: (r) => esc(r.nationality || '—') }, { l: 'تاريخ التسجيل', v: (r) => cell.num(S.d(r.registered_at)) },
    ],
    view: studentProfile, invalidate: [],
    exportCols: [{ l: 'الرقم المدرسي', v: (r) => r.student_no }, { l: 'اسم الطالب', v: (r) => r.name }, { l: 'رقم الهوية', v: (r) => r.national_id }, { l: 'الجنس', v: (r) => S.LBL.gender[r.gender] }, { l: 'الصف', v: (r) => r.grade?.name_ar }, { l: 'الشعبة', v: (r) => r.section?.name }, { l: 'ولي الأمر', v: (r) => r.guardian?.name }, { l: 'جوال ولي الأمر', v: (r) => r.guardian?.phone }, { l: 'الحالة', v: (r) => S.ST.student[r.status]?.[0] }, { l: 'الجنسية', v: (r) => r.nationality }, { l: 'تاريخ التسجيل', v: (r) => r.registered_at }],
    importer: { endpoint: '/app/students/import', year: true, file: 'نموذج-الطلاب', headers: ['اسم الطالب', 'رقم الهوية', 'الجنس', 'تاريخ الميلاد', 'الجنسية', 'الصف', 'الشعبة', 'اسم ولي الأمر', 'جوال ولي الأمر', 'هوية ولي الأمر'], sample: [['سالم بن خالد البلوشي', '20160022', 'ذكر', '2019-03-15', 'عماني', 'الصف الأول', 'شعبة أ', 'خالد بن عبدالله البلوشي', '96891001002', '87654321']], map: { name: ['اسم الطالب', 'name'], national_id: ['رقم الهوية', 'national_id'], gender: ['الجنس', 'gender'], birth_date: ['تاريخ الميلاد', 'birth_date'], nationality: ['الجنسية', 'nationality'], grade: ['الصف', 'grade'], section: ['الشعبة', 'section'], guardian_name: ['اسم ولي الأمر', 'guardian_name'], guardian_phone: ['جوال ولي الأمر', 'guardian_phone'], guardian_national_id: ['هوية ولي الأمر', 'guardian_national_id'] } },
    rowActions: [{ ic: 'contract', cls: 'p', t: 'إنشاء عقد', show: (r) => r.status === 'active', run: (r) => S.contractBuilder(null, { student_id: r.id }) }],
    toolbar: [{ l: 'نقل جماعي', ic: 'swap', cls: 'ghost', run: (ctx) => bulkMove(ctx) }],
  }));
  S.page('student-form', S.formPage({
    api: '/app/students', title: 'الطلاب', singular: 'طالب', perm: 'students', year: true, backTo: 'students',
    lookups: ['grades', 'sections', 'buses', 'guardians', 'custom_fields'], invalidate: [],
    fields: studentFields, toForm: unpackCustom, toPayload: (v) => packCustom(v, S._lkS || {}, 'student'),
    afterRender: (el, c) => (S._lkS = c.lk),
    context: (s) => {
      if (!s) return `<div class="card pad"><p class="muted sm">${ic('userPlus')} عبّئ بيانات الطالب وسجّله في الشعبة المناسبة. بعد الحفظ يمكنك إنشاء عقد له من ملفّه أو من قائمة الطلاب.</p></div>`;
      const a = s.attendance_summary || { present: 0, absent: 0, late: 0, excused: 0 }, tot = a.present + a.absent + a.late + a.excused;
      const rem = (s.contracts || []).reduce((x, c) => x + (c.status === 'cancelled' ? 0 : +c.remaining), 0);
      return `<div class="card pad"><div class="profile-h" style="margin:0 0 12px">${S.avatarHtml(s.photo, S.enName(s))}<div class="grow"><b>${esc(S.enName(s))}</b><div class="muted sm num">${esc(s.student_no || '')}</div></div>${S.badge(S.ST.student, s.status)}</div>
        ${s.photo ? `<img src="${esc(s.photo)}" alt="" style="width:100%;max-height:220px;object-fit:cover;border-radius:10px;border:1px solid var(--line);margin-bottom:12px">` : ''}
        <div class="grid g2 mb8">${S.ui.stat('c-green', 'check', tot ? Math.round(((a.present + a.late) * 100) / tot) + '%' : '—', 'الحضور')}${S.ui.stat('c-red', 'x', S.num(a.absent), 'الغياب')}</div>
        ${S.kv([['ولي الأمر', s.guardian ? `<a class="lk" href="#/guardians/${s.guardian.id}">${esc(S.enName(s.guardian))}</a>` : '—'], ['المتبقي من الرسوم', S.moneyT(rem)]])}
        <div class="row wrap mt8"><button class="btn ghost sm" onclick="S.reportCard(${s.id})">${ic('fileText')} كشف الدرجات</button><button class="btn ghost sm" onclick="S.contractBuilder(null,{student_id:${s.id}})">${ic('contract')} عقد جديد</button></div></div>`;
    },
  }));
  function bulkMove(ctx) {
    if (!ctx.rows || !ctx.rows.length) return S.toast('لا يوجد طلاب في القائمة الحالية', 'bad');
    const m = S.modal({ title: 'نقل/تحديث جماعي للطلاب', size: 'wide', body: `<div class="fgrid mb16"><label class="fld"><span>نقل إلى الشعبة</span><select class="inp" id="bs"><option value="">— بدون تغيير —</option>${sectionOpts(ctx.lk).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label><label class="fld"><span>تغيير الحالة</span><select class="inp" id="bst"><option value="">— بدون تغيير —</option>${S.opts(S.ST.student).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label></div>
      <label class="check mb8"><input type="checkbox" id="all"> تحديد الكل (${ctx.rows.length})</label><div class="tbl-wrap" style="max-height:340px;overflow:auto"><table class="tbl"><tbody>${ctx.rows.map((r) => `<tr><td class="chk"><input type="checkbox" value="${r.id}" class="bk"></td><td class="s">${esc(S.enName(r))}</td><td>${esc(S.gs(r, ''))}</td></tr>`).join('')}</tbody></table></div>`, foot: '<button class="btn ghost" data-close>إلغاء</button><button class="btn" id="go">تطبيق</button>' });
    m.$('#all').onchange = (e) => m.body.querySelectorAll('.bk').forEach((c) => (c.checked = e.target.checked));
    m.$('#go').onclick = async () => {
      const ids = [...m.body.querySelectorAll('.bk:checked')].map((c) => +c.value);
      if (!ids.length) return S.toast('اختر طالباً واحداً على الأقل', 'bad');
      try { const r = await S.post('/app/students/bulk', { ids, section_id: m.$('#bs').value || null, status: m.$('#bst').value || null }); S.toast(r.message, 'ok'); m.close(); ctx.reload(); } catch (e) { S.toast(e.message, 'bad'); }
    };
  }

  // ---------------------------------------------------------------- applications
  const appFields = (lk) => [
    { t: 'sec', l: 'بيانات الطالب' },
    { k: 'student_name', l: 'اسم الطالب', req: true, full: true }, { k: 'student_name_en', l: 'اسم الطالب بالإنجليزية', dir: 'ltr', full: true }, { k: 'gender', l: 'الجنس', t: 'select', req: true, opts: S.opts(S.LBL.gender), def: 'male' }, { k: 'birth_date', l: 'تاريخ الميلاد', t: 'date' }, { k: 'national_id', l: 'رقم الهوية', dir: 'ltr' }, { k: 'nationality', l: 'الجنسية', t: 'select', opts: natOpts, def: 'عماني' }, { k: 'grade_id', l: 'الصف المطلوب', t: 'select', opts: gradeOpts(lk) }, { k: 'previous_school', l: 'المدرسة السابقة', full: true },
    { t: 'sec', l: 'بيانات ولي الأمر' },
    { k: 'guardian_name', l: 'اسم ولي الأمر', req: true }, { k: 'guardian_name_en', l: 'اسم ولي الأمر بالإنجليزية', dir: 'ltr' }, { k: 'guardian_phone', l: 'الجوال', t: 'tel', req: true }, { k: 'guardian_national_id', l: 'رقم هوية ولي الأمر', dir: 'ltr' }, { k: 'guardian_email', l: 'البريد', t: 'email' }, { k: 'guardian_relation', l: 'صلة القرابة', def: 'أب' },
    { t: 'sec', l: 'ملاحظات' },
    { k: 'notes', l: 'ملاحظات إضافية', t: 'textarea', full: true },
  ];
  const appViewRows = (r) => [['اسم الطالب', esc(S.enT(r.student_name, r.student_name_en))], ['الجنس', S.LBL.gender[r.gender]], ['تاريخ الميلاد', `<span class="num">${S.d(r.birth_date)}</span>`], ['الجنسية', esc(r.nationality || '—')], ['رقم الهوية', `<span class="num">${esc(r.national_id || '—')}</span>`], ['الصف المطلوب', esc(S.enName(r.grade) || '—')], ['المدرسة السابقة', esc(r.previous_school || '—')], ['ولي الأمر', esc(S.enT(r.guardian_name, r.guardian_name_en))], ['الجوال', `<span class="num">${esc(r.guardian_phone)}</span>`], ['هوية ولي الأمر', `<span class="num">${esc(r.guardian_national_id || '—')}</span>`], ['البريد', `<span class="num">${esc(r.guardian_email || '—')}</span>`], ['الحالة', S.badge(S.ST.app, r.status)], ['المصدر', r.source === 'online' ? '<span class="bdg l-info">إلكتروني</span>' : '<span class="bdg l-mut">المكتب</span>'], ['تاريخ الطلب', `<span class="num">${S.d(r.created_at)}</span>`], ['ملاحظات', esc(r.notes || '—')]];
  const acceptApp = (r, lk, onDone) => {
    const gradeName = (lk.grades.find((g) => String(g.id) === String(r.grade_id)) || {}).name_ar;
    const matching = sectionOpts(lk).filter(([id]) => (lk.sections.find((s) => s.id === id) || {}).grade_id === r.grade_id);
    const noMatchForGrade = r.grade_id && !matching.length;
    // show the requested grade's sections; if it has none, fall back to all sections (labelled with their grade)
    const opts = (r.grade_id && matching.length ? matching : sectionOpts(lk));
    const help = !lk.sections.length
      ? 'لا توجد شعب بعد — أنشئ شعبة من شاشة «الشعب»، أو اقبل بدون تسكين وعيّنها لاحقاً.'
      : noMatchForGrade
        ? `لا توجد شعبة للصف المطلوب${gradeName ? ' «' + gradeName + '»' : ''}. اقبل «بدون تسكين» وعيّن الشعبة لاحقاً، أو أنشئ شعبة لهذا الصف، أو اختر شعبة من صف آخر (سيُحدَّث صف الطالب تبعاً لها).`
        : 'اتركها «بدون تسكين» إن أردت تعيين الشعبة لاحقاً.';
    S.formModal({
      title: 'قبول طلب ' + r.student_name,
      fields: [{ k: 'section_id', l: 'التسكين في الشعبة', t: 'select', blank: 'بدون تسكين (عيّنها لاحقاً)', opts, help }],
      extra: '<p class="muted sm mt8">سيتم إنشاء ملف الطالب وربطه بولي الأمر (أو إنشاء ولي أمر جديد إن لم يكن مسجلاً).</p>',
      saveText: 'قبول',
      onSave: async (v) => { const res = await S.post(`/app/applications/${r.id}/accept`, v); S.toast(res.message, 'ok'); S.L.clear('guardians'); S.refreshBadges(); onDone && onDone(); },
    });
  };
  const rejectApp = (r, onDone) => S.formModal({ title: 'رفض طلب ' + r.student_name, fields: [{ k: 'reason', l: 'سبب الرفض', t: 'textarea' }], saveText: 'رفض الطلب', onSave: async (v) => { await S.post(`/app/applications/${r.id}/reject`, v); S.toast('تم رفض الطلب', 'ok'); S.refreshBadges(); onDone && onDone(); } });

  S.page('application-view', {
    perm: 'students', title: 'استمارة التسجيل',
    async render(el, params) {
      const lk = await S.L(['grades', 'sections']);
      el.innerHTML = S.spinner;
      let r;
      try { r = await S.get('/app/applications/' + params.id); }
      catch (e) { if (!(S.local && S.local.isOfflineError(e))) { el.innerHTML = S.emptyHtml('تعذّر تحميل الطلب', e.message, 'alert'); return; } }
      if (!r && S.db) r = await S.db.get('applications', params.id);
      if (!r) { el.innerHTML = S.emptyHtml('تعذّر تحميل الطلب', 'لا توجد نسخة محفوظة من هذا الطلب على الجهاز', 'alert'); return; }
      el.innerHTML = `<div class="crumbs"><a class="acc-t" href="#/applications">استمارة التسجيل</a> ${ic('chevL')} <b>تفاصيل الطلب</b></div>
        <div class="page-h"><div><h2>${esc(S.enT(r.student_name, r.student_name_en))} ${S.badge(S.ST.app, r.status)}</h2><p>${r.source === 'online' ? 'طلب إلكتروني' : 'طلب من المكتب'} · <span class="num">${S.d(r.created_at)}</span></p></div>
          <div class="row wrap">${r.status === 'new' ? `<button class="btn success" id="acc">${ic('check')} قبول وتسجيل</button><button class="btn danger" id="rej">${ic('x')} رفض</button><a class="btn ghost" href="#/application-form/${r.id}">${ic('edit')} تعديل</a>` : ''}<a class="btn ghost" href="#/applications">${ic('chevR')} رجوع للقائمة</a></div></div>
        <div class="card pad">${S.kv(appViewRows(r))}</div>`;
      const back = () => (location.hash = '#/applications');
      el.querySelector('#acc') && (el.querySelector('#acc').onclick = () => acceptApp(r, lk, back));
      el.querySelector('#rej') && (el.querySelector('#rej').onclick = () => rejectApp(r, back));
    },
  });

  S.page('applications', S.crud({
    title: 'استمارة التسجيل', singular: 'طلب تسجيل', api: '/app/applications', perm: 'students', year: true, icon: 'userPlus', lookups: ['grades', 'sections'], editPage: 'application-form',
    intro: `<div class="card pad mb16 row wrap" style="background:var(--accent-soft);border-color:transparent"><span class="acc-t">${S.ic('link')}</span><div class="grow"><b>رابط التسجيل الإلكتروني لأولياء الأمور</b><div class="sm t2">يصل كل طلب جديد إلى هذه الشاشة لمراجعته وقبوله.</div></div><button class="btn sm" id="cplink">${S.ic('copy')} نسخ الرابط</button><a class="btn ghost sm" target="_blank" id="oplink">فتح الاستمارة</a></div>`,
    afterRender: (ctx) => { const url = location.origin + '/apply.html?school=' + S.me().company.slug; ctx.el.querySelector('#cplink').onclick = () => S.copy(url); ctx.el.querySelector('#oplink').href = url; },
    chips: { k: 'status', items: S.opts(S.ST.app) }, defaults: { status: 'new' },
    filters: [{ k: 'grade_id', l: 'الصف المطلوب', opts: gradeOpts }, { k: 'source', l: 'المصدر', opts: [['online', 'إلكتروني'], ['office', 'المكتب']] }],
    search: 'بحث باسم الطالب أو ولي الأمر أو الجوال...',
    columns: [
      { l: 'اسم الطالب', s: true, v: (r) => `<a class="lk" href="#" data-open>${esc(S.enT(r.student_name, r.student_name_en))}</a>` }, { l: 'الصف المطلوب', v: (r) => esc(S.enName(r.grade) || '—') }, { l: 'الجنس', v: (r) => S.LBL.gender[r.gender] },
      { l: 'ولي الأمر', v: (r) => esc(S.enT(r.guardian_name, r.guardian_name_en)) }, { l: 'الجوال', v: (r) => cell.phone(r.guardian_phone) }, { l: 'المصدر', v: (r) => (r.source === 'online' ? '<span class="bdg l-info">إلكتروني</span>' : '<span class="bdg l-mut">المكتب</span>') },
      { l: 'تاريخ الطلب', v: (r) => cell.num(S.d(r.created_at)) }, { l: 'الحالة', v: (r) => S.badge(S.ST.app, r.status) },
    ],
    canEdit: (r) => r.status === 'new',
    rowActions: [
      { ic: 'check', cls: 'g', t: 'قبول وتسجيل الطالب', show: (r) => r.status === 'new', run: (r, ctx) => acceptApp(r, ctx.lk, ctx.reload) },
      { ic: 'x', cls: 'd', t: 'رفض', show: (r) => r.status === 'new', run: (r, ctx) => rejectApp(r, ctx.reload) },
    ],
    view: (r) => (location.hash = '#/application-view/' + r.id),
  }));

  S.page('application-form', S.formPage({
    api: '/app/applications', title: 'استمارة التسجيل', singular: 'طلب تسجيل', perm: 'students', year: true, backTo: 'applications',
    lookups: ['grades', 'sections'], fields: appFields,
    subtitle: 'سجّل طلب تسجيل جديد لطالب — يمكنك قبوله لاحقاً وتحويله إلى ملف طالب من قائمة الطلبات.',
    newDefaults: () => ({ status: 'new', source: 'office', gender: 'male', nationality: 'عماني', guardian_relation: 'أب' }),
    context: (r) => r ? `<div class="card pad"><div class="sec-t" style="margin-top:0">${ic('userPlus')} حالة الطلب</div>${S.kv([['الحالة', S.badge(S.ST.app, r.status)], ['المصدر', r.source === 'online' ? 'إلكتروني' : 'المكتب'], ['تاريخ الطلب', `<span class="num">${S.d(r.created_at)}</span>`]])}${r.status === 'new' ? '<p class="muted sm mt8">لقبول الطلب وتحويله لطالب، استخدم زر «قبول» من قائمة الطلبات.</p>' : ''}</div>`
      : `<div class="card pad"><p class="muted sm">${ic('userPlus')} أدخل بيانات الطالب وولي الأمر. تصل الطلبات الإلكترونية من أولياء الأمور إلى نفس القائمة لمراجعتها.</p></div>`,
  }));

  // ---------------------------------------------------------------- custom fields
  S.page('custom-fields', S.crud({
    title: 'الحقول المخصصة', singular: 'حقل', api: '/app/custom-fields', perm: 'school', icon: 'sliders', invalidate: ['custom_fields'],
    intro: '<p class="t2 mb16">أضف حقولاً إضافية تظهر في نموذج الطالب أو ولي الأمر (مثل: الحساسية الغذائية، مقاس الزي، رقم الملف الصحي).</p>',
    chips: { k: 'entity', items: [['student', 'حقول الطالب'], ['guardian', 'حقول ولي الأمر']] },
    columns: [{ l: 'اسم الحقل', v: (r) => `<b>${esc(r.label)}</b>` }, { l: 'يظهر في', v: (r) => (r.entity === 'student' ? 'ملف الطالب' : 'ملف ولي الأمر') }, { l: 'النوع', v: (r) => ({ text: 'نص', number: 'رقم', date: 'تاريخ', select: 'قائمة اختيار' })[r.type] }, { l: 'الخيارات', v: (r) => esc((r.options || []).join('، ') || '—') }, { l: 'إلزامي', v: (r) => cell.yes(r.required) }, { l: 'الترتيب', v: (r) => cell.num(r.sort) }],
    fields: () => [{ k: 'label', l: 'اسم الحقل', req: true }, { k: 'label_en', l: 'الاسم بالإنجليزية', dir: 'ltr', help: 'يظهر في الوضع الإنجليزي (اختياري)' }, { k: 'entity', l: 'يظهر في', t: 'select', req: true, opts: [['student', 'ملف الطالب'], ['guardian', 'ملف ولي الأمر']], def: 'student' }, { k: 'type', l: 'نوع الحقل', t: 'select', req: true, opts: [['text', 'نص'], ['number', 'رقم'], ['date', 'تاريخ'], ['select', 'قائمة اختيار']], def: 'text' }, { k: 'sort', l: 'الترتيب', t: 'number' }, { k: 'options_txt', l: 'خيارات القائمة (افصل بينها بفاصلة)', full: true, show: (v) => v.type === 'select' }, { k: 'required', l: 'حقل إلزامي', t: 'check' }],
    toForm: (r) => ({ ...r, options_txt: (r.options || []).join('، ') }),
    toPayload: (v) => { const o = { ...v, options: (v.options_txt || '').split(/[,،]/).map((x) => x.trim()).filter(Boolean) }; delete o.options_txt; return o; },
    search: false,
  }));

  // ---------------------------------------------------------------- fee items
  S.page('fee-items', S.crud({
    title: 'بنود الرسوم الدراسية', singular: 'بند رسوم', api: '/app/fee-items', perm: 'school', year: true, icon: 'coins', lookups: ['grades'], invalidate: ['fee_items'],
    filters: [{ k: 'grade_id', l: 'الصف', opts: gradeOpts }, { k: 'type', l: 'النوع', opts: S.opts(S.LBL.feeType) }],
    columns: [{ l: 'البند', s: true, v: (r) => `<b>${esc(r.name)}</b>` }, { l: 'النوع', v: (r) => `<span class="bdg l-info">${S.LBL.feeType[r.type] || r.type}</span>` }, { l: 'الصف', v: (r) => esc(r.grade?.name_ar || 'جميع الصفوف') }, { l: 'المبلغ', v: (r) => S.money(r.amount) }, { l: 'إلزامي', v: (r) => cell.yes(r.is_mandatory) }, { l: 'خاضع للضريبة', v: (r) => cell.yes(r.taxable) }],
    fields: (lk) => [{ k: 'name', l: 'اسم البند', req: true, full: true }, { k: 'name_en', l: 'الاسم بالإنجليزية', dir: 'ltr', full: true }, { k: 'type', l: 'النوع', t: 'select', req: true, opts: S.opts(S.LBL.feeType), def: 'tuition' }, { k: 'grade_id', l: 'الصف', t: 'select', blank: 'جميع الصفوف', opts: gradeOpts(lk) }, { k: 'amount', l: 'المبلغ', t: 'money', req: true }, { k: 'is_mandatory', l: 'بند إلزامي (يُضاف تلقائياً للعقد)', t: 'check', def: true }, { k: 'taxable', l: 'خاضع للضريبة', t: 'check' }],
    newDefaults: () => ({ is_mandatory: true }),
    search: 'بحث باسم البند...',
  }));

  // ---------------------------------------------------------------- attendance
  S.page('attendance', {
    perm: 'school',
    async render(el, params) {
      const lk = await S.L(['years', 'sections', 'grades']);
      let tab = params.tab || 'take';
      el.innerHTML = `${S.head('attendance', { year: true })}<div class="tabs"><button data-t="take">تسجيل الحضور اليومي</button><button data-t="report">تقرير الحضور</button></div><div id="body"></div>`;
      S.bindYear(el);
      const body = el.querySelector('#body');
      const tabs = () => { el.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab)); tab === 'take' ? take() : report(); };
      el.querySelector('.tabs').onclick = (e) => { const b = e.target.closest('button'); if (b) { tab = b.dataset.t; tabs(); } };

      function take() {
        body.innerHTML = `<div class="filters"><label class="fld"><span>الشعبة</span><select class="inp" id="sec">${sectionOpts(lk).map(([v, l]) => `<option value="${v}" ${String(v) === String(params.section_id) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label><label class="fld"><span>التاريخ</span><input class="inp" type="date" id="dt" value="${S.today()}" max="${S.today()}" dir="ltr"></label><button class="btn" id="ld">${ic('search')} عرض</button></div><div id="sheet"></div>`;
        if (!lk.sections.length) { body.querySelector('#sheet').innerHTML = S.emptyHtml('لا توجد شعب', 'أنشئ الصفوف والشعب أولاً', 'columns'); return; }
        const load = async () => {
          const sh = body.querySelector('#sheet'); sh.innerHTML = S.spinner;
          let d;
          try { d = await S.get('/app/attendance/sheet', { section_id: body.querySelector('#sec').value, date: body.querySelector('#dt').value }); }
          catch (e) { // offline: build the sheet from the local mirror (students of the section + saved marks)
            if (!(S.local && S.local.attendanceSheet && S.local.isOfflineError(e))) throw e;
            d = await S.local.attendanceSheet(body.querySelector('#sec').value, body.querySelector('#dt').value);
          }
          if (!d.students.length) { sh.innerHTML = S.emptyHtml('لا يوجد طلاب نشطون في هذه الشعبة'); return; }
          const st = d.students.map((s) => ({ ...s, status: s.status || 'present' }));
          const opts = ['present', 'absent', 'late', 'excused'];
          const draw = () => {
            const c = (k) => st.filter((s) => s.status === k).length;
            sh.innerHTML = `<div class="toolbar"><span class="bdg ${d.saved ? 'l-ok' : 'l-warn'}">${d.saved ? 'تم تسجيل الحضور مسبقاً — يمكنك التعديل' : 'لم يُسجّل بعد'}</span><span class="bdg l-ok">حاضر ${c('present')}</span><span class="bdg l-bad">غائب ${c('absent')}</span><span class="bdg l-warn">متأخر ${c('late')}</span><span class="bdg l-info">بعذر ${c('excused')}</span><div class="sp"></div><button class="btn ghost sm" id="allp">${ic('check')} الكل حاضر</button><button class="btn success" id="save">${ic('check')} حفظ الحضور</button></div>
              <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th class="s">الطالب</th><th>الرقم المدرسي</th><th>الحالة</th><th>ملاحظة</th></tr></thead><tbody>${st.map((s, i) => `<tr><td class="muted">${i + 1}</td><td class="s b">${esc(S.enName(s))}</td><td class="num muted">${esc(s.student_no || '')}</td><td><div class="att-opts">${opts.map((o) => `<button data-i="${i}" data-s="${o}" class="${o} ${s.status === o ? 'on' : ''}">${S.ST.att[o][0]}</button>`).join('')}</div></td><td><input class="inp" style="height:32px;min-width:160px" data-n="${i}" value="${esc(s.note || '')}" placeholder="—"></td></tr>`).join('')}</tbody></table></div>`;
            sh.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { st[+b.dataset.i].status = b.dataset.s; draw(); }));
            sh.querySelectorAll('[data-n]').forEach((inp) => (inp.oninput = () => (st[+inp.dataset.n].note = inp.value)));
            sh.querySelector('#allp').onclick = () => { st.forEach((s) => (s.status = 'present')); draw(); };
            sh.querySelector('#save').onclick = async (e) => { const _btn = e.currentTarget; S.btnBusy(_btn, true); try { await S.post('/app/attendance', { section_id: body.querySelector('#sec').value, date: body.querySelector('#dt').value, marks: st.map((s) => ({ student_id: s.id, status: s.status, note: s.note })) }); S.toast('تم حفظ الحضور', 'ok'); d.saved = true; draw(); } catch (er) { S.toast(er.message, 'bad'); S.btnBusy(_btn, false); } };
          };
          draw();
        };
        body.querySelector('#ld').onclick = load; body.querySelector('#sec').onchange = load; body.querySelector('#dt').onchange = load;
        load();
      }
      function report() {
        body.innerHTML = `<div class="filters"><label class="fld"><span>من تاريخ</span><input class="inp" type="date" id="f" value="${S.addDays(S.today(), -30)}" dir="ltr"></label><label class="fld"><span>إلى تاريخ</span><input class="inp" type="date" id="t" value="${S.today()}" dir="ltr"></label><label class="fld"><span>الصف</span><select class="inp" id="g"><option value="">الكل</option>${gradeOpts(lk).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label><label class="fld"><span>الشعبة</span><select class="inp" id="s"><option value="">الكل</option>${sectionOpts(lk).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label><button class="btn" id="go">${ic('search')} عرض</button><button class="btn outline-ok" id="ex">${ic('download')} تصدير</button></div><div id="rep"></div>`;
        let last;
        const load = async () => {
          const r = body.querySelector('#rep'); r.innerHTML = S.spinner;
          last = await S.get('/app/attendance/report', { from: body.querySelector('#f').value, to: body.querySelector('#t').value, grade_id: body.querySelector('#g').value, section_id: body.querySelector('#s').value });
          r.innerHTML = `<div class="card mb16"><div class="hd"><h3>${ic('activity')} نسبة الحضور اليومية</h3></div><div class="bd" id="trend"></div></div>
            <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th class="s">الطالب</th><th>الصف / الشعبة</th><th>حاضر</th><th>غائب</th><th>متأخر</th><th>بعذر</th><th>نسبة الحضور</th></tr></thead><tbody>${last.students.map((s, i) => `<tr><td class="muted">${i + 1}</td><td class="s b">${esc(S.enName(s))}</td><td>${esc(s.class)}</td><td class="num ok-t">${s.present}</td><td class="num bad-t b">${s.absent}</td><td class="num warn-t">${s.late}</td><td class="num">${s.excused}</td><td>${S.prog(Math.round(s.rate))}</td></tr>`).join('') || `<tr><td colspan="8">${S.emptyHtml('لا توجد سجلات حضور في هذه الفترة')}</td></tr>`}</tbody></table></div>`;
          if (last.daily.length) S.chart.area(r.querySelector('#trend'), { labels: last.daily.map((x) => x.date.slice(5)), series: [{ name: 'نسبة الحضور %', color: '#14a06b', data: last.daily.map((x) => x.rate) }], height: 200 });
          else r.querySelector('#trend').innerHTML = S.emptyHtml();
        };
        body.querySelector('#go').onclick = load;
        body.querySelector('#ex').onclick = () => last && S.exportXlsx('تقرير-الحضور', [{ l: 'الطالب', v: (r) => r.name }, { l: 'الصف/الشعبة', v: (r) => r.class }, { l: 'حاضر', v: (r) => r.present }, { l: 'غائب', v: (r) => r.absent }, { l: 'متأخر', v: (r) => r.late }, { l: 'بعذر', v: (r) => r.excused }, { l: 'نسبة الحضور', v: (r) => r.rate + '%' }], last.students);
        load();
      }
      tabs();
    },
  });
})();
