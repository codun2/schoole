/* سكوول — administrative affairs (correspondence, licenses, tasks, calendar, archive) + settings, users, announcements, activity, profile. */
(function () {
  'use strict';
  const { esc, ic, cell } = S;
  const userOpts = (lk) => (lk.users || []).map((u) => [u.id, u.name]);

  // ---------------------------------------------------------------- correspondence
  const corrPage = (direction, title) => S.crud({
    title, singular: 'مراسلة', api: '/app/correspondences', perm: 'admin_affairs', icon: direction === 'incoming' ? 'inbox' : direction === 'outgoing' ? 'send' : 'mail', lookups: ['correspondence_categories', 'users'],
    fixed: { direction }, search: 'رقم المراسلة أو الموضوع أو الجهة...',
    chips: { k: 'status', items: S.opts(S.ST.corr) },
    filters: [{ k: 'category_id', l: 'الفئة', opts: (lk) => lk.correspondence_categories.map((c) => [c.id, c.name]) }, { k: 'priority', l: 'الأولوية', opts: S.opts(S.ST.prio) }, { k: 'from', l: 'من تاريخ', t: 'date' }, { k: 'to', l: 'إلى تاريخ', t: 'date' }],
    columns: [{ l: 'الرقم', v: (r) => `<a class="lk num" href="#" data-open>${esc(r.number)}</a>` }, { l: 'التاريخ', v: (r) => cell.num(S.d(r.date)) }, { l: 'الموضوع', s: true, v: (r) => `<b>${esc(r.subject)}</b>` }, { l: direction === 'outgoing' ? 'الجهة المرسل إليها' : 'الجهة', v: (r) => esc(r.party || '—') }, { l: 'الفئة', v: (r) => esc(r.category?.name || '—') }, { l: 'الأولوية', v: (r) => S.badge(S.ST.prio, r.priority) }, { l: 'الحالة', v: (r) => S.badge(S.ST.corr, r.status) }, { l: 'المسؤول', v: (r) => esc(r.assignee?.name || '—') }, { l: 'مرفق', v: (r) => cell.file(r.attachment) }],
    fields: (lk) => [{ k: 'subject', l: 'الموضوع', req: true, full: true }, { k: 'date', l: 'التاريخ', t: 'date', req: true, def: S.today() }, { k: 'party', l: direction === 'incoming' ? 'الجهة المرسلة' : direction === 'outgoing' ? 'الجهة المرسل إليها' : 'القسم / الجهة' }, { k: 'category_id', l: 'الفئة', t: 'select', opts: lk.correspondence_categories.map((c) => [c.id, c.name]) }, { k: 'priority', l: 'الأولوية', t: 'select', opts: S.opts(S.ST.prio), def: 'normal' }, { k: 'status', l: 'الحالة', t: 'select', opts: S.opts(S.ST.corr), def: 'new' }, { k: 'assigned_to', l: 'المسؤول عن المتابعة', t: 'select', opts: userOpts(lk) }, { k: 'body', l: 'نص المراسلة / ملخص', t: 'textarea' }, { k: 'file', l: 'مرفق', t: 'file', full: true }],
    toPayload: (v) => { if (v instanceof FormData) { v.append('direction', direction); return v; } return { ...v, direction }; },
    newDefaults: () => ({ date: S.today(), priority: 'normal', status: 'new' }),
    viewFields: (r) => [['الرقم', `<span class="num">${esc(r.number)}</span>`], ['النوع', S.badge(S.ST.dir, r.direction)], ['التاريخ', S.d(r.date)], ['الموضوع', esc(r.subject)], ['الجهة', esc(r.party || '—')], ['الفئة', esc(r.category?.name || '—')], ['الأولوية', S.badge(S.ST.prio, r.priority)], ['الحالة', S.badge(S.ST.corr, r.status)], ['المسؤول', esc(r.assignee?.name || '—')], ['المرفق', r.attachment ? `<a class="lk" target="_blank" href="${esc(r.attachment)}">فتح المرفق</a>` : '—'], ['النص', `<span style="white-space:pre-line">${esc(r.body || '—')}</span>`]],
  });
  S.page('corr-in', corrPage('incoming', 'المراسلات الواردة'));
  S.page('corr-out', corrPage('outgoing', 'المراسلات الصادرة'));
  S.page('corr-internal', corrPage('internal', 'المراسلات الداخلية'));
  S.page('corr-categories', S.crud({
    title: 'فئات المراسلات', singular: 'فئة', api: '/app/correspondence-categories', perm: 'admin_affairs', icon: 'tag', invalidate: ['correspondence_categories'], search: false,
    columns: [{ l: 'الفئة', s: true, v: (r) => `<b>${esc(r.name)}</b>` }], fields: () => [{ k: 'name', l: 'اسم الفئة', req: true }],
  }));

  // ---------------------------------------------------------------- licenses
  S.page('licenses', S.crud({
    title: 'التراخيص', singular: 'ترخيص', api: '/app/licenses', perm: 'admin_affairs', icon: 'shield',
    search: 'اسم الترخيص أو رقمه أو الجهة...',
    filters: [{ k: 'state', l: 'الحالة', opts: S.opts(S.ST.license) }],
    columns: [{ l: 'الترخيص', s: true, v: (r) => `<b>${esc(r.name)}</b>` }, { l: 'الرقم', v: (r) => cell.num(r.number || '—') }, { l: 'جهة الإصدار', v: (r) => esc(r.issuer || '—') }, { l: 'تاريخ الإصدار', v: (r) => cell.num(S.d(r.issue_date)) }, { l: 'تاريخ الانتهاء', v: (r) => `<span class="num ${r.state !== 'valid' ? 'bad-t b' : ''}">${S.d(r.expiry_date)}</span>` }, { l: 'التكلفة', v: (r) => `<span class="num">${S.fmtN(r.cost)}</span>` }, { l: 'الحالة', v: (r) => S.badge(S.ST.license, r.state) }, { l: 'مرفق', v: (r) => cell.file(r.attachment) }],
    rowClass: (r) => (r.state === 'expired' ? 'warn-row' : ''),
    fields: () => [{ k: 'name', l: 'اسم الترخيص', req: true, full: true }, { k: 'name_en', l: 'اسم الترخيص بالإنجليزية', dir: 'ltr', full: true }, { k: 'number', l: 'رقم الترخيص', dir: 'ltr' }, { k: 'issuer', l: 'جهة الإصدار' }, { k: 'issuer_en', l: 'جهة الإصدار بالإنجليزية', dir: 'ltr' }, { k: 'issue_date', l: 'تاريخ الإصدار', t: 'date' }, { k: 'expiry_date', l: 'تاريخ الانتهاء', t: 'date' }, { k: 'cost', l: 'تكلفة التجديد', t: 'money' }, { k: 'file', l: 'صورة الترخيص', t: 'file' }, { k: 'notes', l: 'ملاحظات', t: 'textarea' }],
  }));

  // ---------------------------------------------------------------- tasks
  S.page('tasks', S.crud({
    title: 'المهام والمواعيد', singular: 'مهمة', api: '/app/tasks', perm: 'admin_affairs', icon: 'tasks', lookups: ['branches', 'users'],
    search: 'العنوان، الجهة...',
    toolbar: [{ l: 'عرض تقويمي', ic: 'calendar', cls: 'soft', run: () => (location.hash = '#/calendar') }],
    filters: [{ k: 'status', l: 'الحالة', all: 'كل الحالات', opts: S.opts(S.ST.taskStatus) }, { k: 'priority', l: 'الأولوية', all: 'جميع الأولويات', opts: S.opts(S.ST.prio) }, { k: 'assigned_to', l: 'المسؤول', all: 'جميع المستخدمين', opts: userOpts }, { k: 'branch_id', l: 'الفرع', all: 'كل الفروع', opts: (lk) => lk.branches.map((b) => [b.id, b.name]) }],
    columns: [
      { l: 'عنوان المهمة', s: true, v: (r) => `<a class="lk" href="#" data-open>${esc(r.title)}</a>` }, { l: 'الفرع', v: (r) => esc(r.branch?.name || '—') }, { l: 'الأولوية', v: (r) => S.badge(S.ST.prio, r.priority) }, { l: 'حالة المهمة', v: (r) => `<span class="bdg mut">${S.ST.taskStatus[r.status][0]}</span>` },
      { l: 'تاريخ البداية', v: (r) => cell.num(S.d(r.start_date)) }, { l: 'تاريخ الانتهاء', v: (r) => `<span class="num ${r.end_date && r.end_date < S.today() && !['done', 'cancelled'].includes(r.status) ? 'bad-t b' : ''}">${S.d(r.end_date)}</span>` }, { l: 'التقدم', v: (r) => S.prog(r.progress) }, { l: 'المسؤول', v: (r) => esc(r.assignee?.name || '') }, { l: 'المرفقات', v: (r) => cell.file(r.attachment) },
    ],
    rowClass: (r) => (['new', 'in_progress'].includes(r.status) && r.priority !== 'normal' ? 'warn-row' : ''),
    fields: (lk) => [{ k: 'title', l: 'عنوان المهمة', req: true, full: true }, { k: 'title_en', l: 'عنوان المهمة بالإنجليزية', dir: 'ltr', full: true }, { k: 'priority', l: 'الأولوية', t: 'select', opts: S.opts(S.ST.prio), def: 'normal' }, { k: 'status', l: 'الحالة', t: 'select', opts: S.opts(S.ST.taskStatus), def: 'new' }, { k: 'start_date', l: 'تاريخ البداية', t: 'date', def: S.today() }, { k: 'end_date', l: 'تاريخ الانتهاء', t: 'date' }, { k: 'assigned_to', l: 'المسؤول', t: 'select', opts: userOpts(lk) }, { k: 'branch_id', l: 'الفرع', t: 'select', opts: lk.branches.map((b) => [b.id, b.name]) }, { k: 'progress', l: 'نسبة الإنجاز %', t: 'number', min: 0, max: 100, def: 0 }, { k: 'file', l: 'مرفق', t: 'file' }, { k: 'description', l: 'التفاصيل', t: 'textarea' }],
    newDefaults: () => ({ start_date: S.today(), priority: 'normal', status: 'new', progress: 0 }),
    viewFields: (r) => [['عنوان المهمة', esc(r.title)], ['الأولوية', S.badge(S.ST.prio, r.priority)], ['الحالة', S.badge(S.ST.taskStatus, r.status)], ['التقدم', S.prog(r.progress)], ['البداية', S.d(r.start_date)], ['الانتهاء', S.d(r.end_date)], ['المسؤول', esc(r.assignee?.name || '—')], ['الفرع', esc(r.branch?.name || '—')], ['المرفق', r.attachment ? `<a class="lk" href="${esc(r.attachment)}" target="_blank">فتح</a>` : '—'], ['التفاصيل', `<span style="white-space:pre-line">${esc(r.description || '—')}</span>`]],
    passParams: ['overdue', 'mine'],
  }));

  // ---------------------------------------------------------------- calendar
  S.page('calendar', {
    perm: 'admin_affairs',
    async render(el) {
      let cur = new Date(); cur.setDate(1);
      el.innerHTML = `${S.head('calendar')}<div class="toolbar"><button class="btn ghost icon" id="nx">${ic('chevR')}</button><h3 id="ttl" style="min-width:150px;text-align:center"></h3><button class="btn ghost icon" id="pv">${ic('chevL')}</button><button class="btn ghost sm" id="td">اليوم</button><div class="sp"></div><a class="btn" href="#/tasks?new=1">${ic('plus')} إضافة مهمة</a><a class="btn ghost" href="#/tasks">${ic('tasks')} عرض القائمة</a></div><div id="cal"></div>`;
      const COL = { urgent: '#e0384c', important: '#d98a0b', normal: '#2f7ae5' };
      const draw = async () => {
        const y = cur.getFullYear(), mo = cur.getMonth();
        el.querySelector('#ttl').textContent = S.monthName(mo) + ' ' + y;
        const first = new Date(y, mo, 1), start = new Date(first); start.setDate(1 - ((first.getDay() + 1) % 7)); // week starts Saturday
        const days = []; for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); days.push(d); }
        const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const from = iso(days[0]), to = iso(days[41]);
        let tasks;
        try {
          if (navigator.onLine === false) throw { status: 0 };
          tasks = await S.get('/app/tasks-calendar', { from, to });
          if (tasks && tasks._fromCache && S.db) throw { status: 0 };
        } catch (e) {
          if (!(S.local && S.local.isOfflineError(e) && S.db)) { el.querySelector('#cal').innerHTML = S.emptyHtml('تعذّر تحميل التقويم', e.message, 'alert'); return; }
          const nd = (d) => (d ? String(d).slice(0, 10) : null); // build the month from the local mirror (tasks are synced)
          tasks = (await S.db.all('tasks')).map((t) => ({ ...t, start_date: nd(t.start_date), end_date: nd(t.end_date) }))
            .filter((t) => (t.start_date && t.start_date >= from && t.start_date <= to) || (t.end_date && t.end_date >= from && t.end_date <= to) || (t.start_date && t.end_date && t.start_date < from && t.end_date > to));
        }
        el.querySelector('#cal').innerHTML = `<div class="cal">${['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'].map((d) => `<div class="dh">${d}</div>`).join('')}${days.map((d) => { const ds = iso(d); const evs = tasks.filter((t) => t.end_date === ds || (t.start_date === ds && t.start_date !== t.end_date)); return `<div class="d ${d.getMonth() !== mo ? 'out' : ''} ${ds === S.today() ? 'today' : ''}"><span class="n">${d.getDate()}</span>${evs.slice(0, 3).map((t) => { const due = t.end_date === ds; return `<a class="ev ${due ? '' : 'start'}" href="#/tasks/${t.id}" style="background:${t.status === 'done' ? '#14a06b' : COL[t.priority]}" title="${due ? (S.isEn() ? 'Due' : 'موعد التسليم') : (S.isEn() ? 'Start' : 'بداية')}: ${esc(S.enT(t.title, t.title_en))}">${due ? '⏰ ' : '▶ '}${esc(S.enT(t.title, t.title_en))}</a>`; }).join('')}${evs.length > 3 ? `<span class="muted xs">+${evs.length - 3} أخرى</span>` : ''}</div>`; }).join('')}</div>
          <div class="legend mt16"><span><i style="background:#e0384c"></i>عاجل</span><span><i style="background:#d98a0b"></i>مهم</span><span><i style="background:#2f7ae5"></i>عادي</span><span><i style="background:#14a06b"></i>منتهية</span><span>⏰ موعد التسليم</span><span>▶ بداية المهمة</span></div>`;
      };
      el.querySelector('#pv').onclick = () => { cur.setMonth(cur.getMonth() + 1); draw(); };
      el.querySelector('#nx').onclick = () => { cur.setMonth(cur.getMonth() - 1); draw(); };
      el.querySelector('#td').onclick = () => { cur = new Date(); cur.setDate(1); draw(); };
      await draw();
    },
  });

  // ---------------------------------------------------------------- documents
  const fsize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
  S.page('documents', S.crud({
    title: 'الأرشفة الإلكترونية', singular: 'مستند', api: '/app/documents', perm: 'admin_affairs', icon: 'archive', addIcon: 'upload',
    search: 'بحث بالعنوان أو التصنيف...',
    columns: [{ l: 'المستند', s: true, v: (r) => `<div class="av-row"><span class="avatar">${ic(String(r.mime || '').includes('image') ? 'eye' : 'file')}</span><div><b>${esc(r.title)}</b><div class="muted xs">${esc(r.notes || '')}</div></div></div>` }, { l: 'التصنيف', v: (r) => (r.category ? `<span class="bdg l-info">${esc(r.category)}</span>` : '—') }, { l: 'الحجم', v: (r) => `<span class="num">${fsize(r.size)}</span>` }, { l: 'رفع بواسطة', v: (r) => esc(r.uploader?.name || '—') }, { l: 'التاريخ', v: (r) => cell.num(S.d(r.created_at)) }, { l: 'فتح', v: (r) => `<a class="btn ghost xs" target="_blank" href="${esc(r.file)}">${ic('download')} تحميل</a>` }],
    fields: (lk, row) => [{ k: 'title', l: 'عنوان المستند', req: true, full: true }, { k: 'category', l: 'التصنيف', ph: 'عقود، شهادات، تعاميم...' }, { k: 'file', l: row ? 'استبدال الملف (اختياري)' : 'الملف', t: 'file', req: !row }, { k: 'notes', l: 'ملاحظات', t: 'textarea' }],
    toPayload: (v) => { if (v instanceof FormData) return v; const f = new FormData(); Object.entries(v).forEach(([k, x]) => x != null && f.append(k, x)); return f; },
  }));

  // ================================================================ SETTINGS
  S.page('settings', {
    perm: 'settings', title: 'إعدادات المدرسة',
    async render(el) {
      const c = await S.get('/app/settings');
      const fields = [
        { t: 'sec', l: 'بيانات المدرسة' }, { k: 'name', l: 'اسم المدرسة', req: true }, { k: 'name_en', l: 'الاسم بالإنجليزية', dir: 'ltr' }, { k: 'principal_name', l: 'اسم المدير/ة' }, { k: 'principal_name_en', l: 'اسم المدير بالإنجليزية', dir: 'ltr' }, { k: 'phone', l: 'الهاتف', t: 'tel' }, { k: 'email', l: 'البريد', t: 'email' }, { k: 'city', l: 'المدينة' }, { k: 'city_en', l: 'المدينة بالإنجليزية', dir: 'ltr' }, { k: 'address', l: 'العنوان', full: true }, { k: 'address_en', l: 'عنوان المدرسة بالإنجليزية', dir: 'ltr', full: true },
        { t: 'sec', l: 'البيانات الرسمية' }, { k: 'cr_number', l: 'السجل التجاري', dir: 'ltr' }, { k: 'license_number', l: 'رقم ترخيص الوزارة', dir: 'ltr' }, { k: 'tax_number', l: 'الرقم الضريبي', dir: 'ltr' },
        { t: 'sec', l: 'الإعدادات المالية' }, { k: 'currency', l: 'العملة', t: 'select', req: true, def: 'SAR', opts: [['SAR', 'ريال سعودي (ر.س)'], ['OMR', 'ريال عماني (ر.ع)'], ['AED', 'درهم إماراتي'], ['KWD', 'دينار كويتي'], ['QAR', 'ريال قطري'], ['BHD', 'دينار بحريني'], ['JOD', 'دينار أردني'], ['EGP', 'جنيه مصري'], ['USD', 'دولار أمريكي']] }, { k: 'tax_rate', l: 'نسبة الضريبة الافتراضية %', t: 'number', step: 0.01 }, { k: 'contract_prefix', l: 'بادئة أرقام العقود', dir: 'ltr' }, { k: 'receipt_prefix', l: 'بادئة سندات القبض', dir: 'ltr' },
      ];
      const THEMES = [['indigo', '#4f46e5', 'نيلي'], ['emerald', '#059669', 'زمردي'], ['rose', '#e11d48', 'وردي'], ['amber', '#d97706', 'كهرماني'], ['sky', '#0284c7', 'سماوي'], ['slate', '#334155', 'رمادي']];
      const PV = [['grades', 'الدرجات والنتائج', 'كشف درجات الطالب والتقدير والترتيب.'], ['attendance', 'الحضور والغياب', 'سجل حضور الطالب ونسبته وأيام غيابه.'], ['assignments', 'الواجبات والاختبارات', 'واجبات الطالب واختباراته ودرجاتها.'], ['timetable', 'الجدول الدراسي', 'جدول حصص الطالب الأسبوعي وحصص اليوم.'], ['behavior', 'الملاحظات السلوكية', 'ملاحظات المعلّمين السلوكية عن الطالب (إيجابية/سلبية).'], ['finance', 'الرسوم والمدفوعات', 'العقود والأقساط وسندات القبض.']];
      el.innerHTML = `${S.head('settings')}<div class="grid g-2-1"><div class="card"><div class="hd"><h3>${ic('building')} الملف التعريفي للمدرسة</h3></div><div class="bd" id="f">${S.formHtml(fields, c)}<div class="row mt16" style="justify-content:flex-end"><button class="btn" id="sv">${ic('check')} حفظ الإعدادات</button></div></div></div>
        <div class="col gap16"><div class="card"><div class="hd"><h3>${ic('star')} الشعار</h3></div><div class="bd" style="text-align:center"><div style="width:110px;height:110px;border-radius:22px;margin:0 auto 12px;background:var(--soft);display:grid;place-items:center;overflow:hidden;border:1px solid var(--line)" id="lg">${c.logo ? `<img src="${esc(c.logo)}" style="width:100%;height:100%;object-fit:cover">` : `<span class="muted">${ic('building')}</span>`}</div><label class="btn ghost sm">${ic('upload')} رفع شعار<input type="file" accept="image/*" id="lf" hidden></label></div></div>
        <div class="card"><div class="hd"><h3>${ic('sun')} لون الواجهة</h3></div><div class="bd"><div class="chips">${THEMES.map(([k, col, n]) => `<button class="chip ${c.theme === k ? 'on' : ''}" data-th="${k}"><i style="width:12px;height:12px;border-radius:50%;background:${col}"></i>${n}</button>`).join('')}</div></div></div>
        <div class="card"><div class="hd"><h3>${ic('layers')} الوحدات الاختيارية</h3></div><div class="bd"><label class="row gap8" style="cursor:pointer;align-items:flex-start"><input type="checkbox" id="mod-corr" ${c.settings?.modules?.correspondence ? 'checked' : ''} style="margin-top:3px"><span><b>المراسلات</b><div class="muted sm">إظهار المراسلات الواردة والصادرة والداخلية وفئاتها في القائمة. أوقفها إذا كانت مدرستك لا تستخدم أرشفة المراسلات الرسمية.</div></span></label></div></div>
        <div class="card"><div class="hd"><h3>${ic('parents')} ما يظهر لولي الأمر والطالب في بوابتهما</h3></div><div class="bd"><p class="muted sm mb8">تحكّم بما يراه ولي الأمر عن ابنه في بوابته. المالية (الرسوم) تخص ولي الأمر فقط.</p>${PV.map(([k, t, dsc]) => `<label class="row gap8 mb8" style="cursor:pointer;align-items:flex-start"><input type="checkbox" class="pv" data-k="${k}" ${(c.settings?.parent_view?.[k] ?? true) ? 'checked' : ''} style="margin-top:3px"><span><b>${t}</b><div class="muted sm">${dsc}</div></span></label>`).join('')}</div></div>
        <div class="card"><div class="hd"><h3>${ic('book')} الترجمة الإنجليزية للمصطلحات</h3></div><div class="bd"><p class="muted sm mb8">أضف ترجمة إنجليزية لأي مصطلح يظهر عربياً في الوضع الإنجليزي (أسماء الشعب، الغرف، أي مسمّى). تُطبَّق فوراً في كل الواجهات والبوابات. للمواد والصفوف استخدم حقل «الاسم بالإنجليزية» في نماذجها.</p><div id="trz"></div><button class="btn ghost sm mt8" id="trAdd">${ic('plus')} إضافة مصطلح</button><div class="row mt8" style="justify-content:flex-end"><button class="btn" id="trSave">${ic('check')} حفظ الترجمات</button></div></div></div>
        <div class="card"><div class="hd"><h3>${ic('shield')} الاشتراك</h3></div><div class="bd">${S.kv([['الباقة', esc(c.plan?.name || '—')], ['الحالة', S.badge(S.ST.school, c.status)], ['التجربة تنتهي', c.trial_ends_at ? S.d(c.trial_ends_at) : '—'], ['الاشتراك ينتهي', c.subscription_ends_at ? S.d(c.subscription_ends_at) : '—'], ['رابط التسجيل', `<span class="ltr xs">/apply.html?school=${esc(c.slug)}</span>`]]).replace('class="kv"', 'class="kv" style="grid-template-columns:1fr"')}</div></div></div></div>`;
      el.querySelector('#sv').onclick = async (e) => {
        const f = el.querySelector('#f form'); if (!S.validate(f, fields)) return;
        const _btn = e.currentTarget; S.btnBusy(_btn, true);
        try { const r = await S.patch('/app/settings', S.readForm(f, fields)); const me = S.me(); Object.assign(me.company, { name: r.name, currency: r.currency, tax_rate: r.tax_rate }); S.setSession(null, me); S.toast('تم حفظ الإعدادات', 'ok'); }
        catch (er) { S.toast(er.message, 'bad'); S.showErrors(f, er); }
        S.btnBusy(_btn, false);
      };
      el.querySelector('#lf').onchange = async (e) => { const fd = new FormData(); fd.append('logo', e.target.files[0]); try { const r = await S.api('/app/settings/logo', { method: 'POST', body: fd }); el.querySelector('#lg').innerHTML = `<img src="${esc(r.logo)}" style="width:100%;height:100%;object-fit:cover">`; const me = S.me(); me.company.logo = r.logo; S.setSession(null, me); S.toast('تم رفع الشعار', 'ok'); } catch (er) { S.toast(er.message, 'bad'); } };
      el.querySelectorAll('[data-th]').forEach((b) => (b.onclick = async () => { await S.patch('/app/settings', { theme: b.dataset.th }); localStorage.removeItem('sch_accent'); const me = S.me(); me.company.theme = b.dataset.th; S.setSession(null, me); S.applyTheme(); el.querySelectorAll('[data-th]').forEach((x) => x.classList.toggle('on', x === b)); }));
      el.querySelector('#mod-corr').onchange = async (e) => {
        const on = e.target.checked;
        try { await S.patch('/app/settings', { settings: { modules: { correspondence: on } } }); const me = S.me(); me.company.modules = { ...(me.company.modules || {}), correspondence: on }; S.setSession(null, me); S.toast('تم الحفظ — سيظهر التغيير في القائمة بعد التحديث', 'ok'); setTimeout(() => location.reload(), 700); }
        catch (er) { S.toast(er.message, 'bad'); e.target.checked = !on; }
      };
      // custom term translations (Arabic → English), merged into the dictionary via /auth/me
      const trRow = (ar = '', en = '') => `<div class="row gap8 mb8 trrow"><input class="inp tr-ar" placeholder="المصطلح بالعربية" value="${esc(ar)}" style="flex:1"><span class="muted">→</span><input class="inp tr-en ltr" placeholder="English" value="${esc(en)}" dir="ltr" style="flex:1"><button class="ibtn d tr-del" title="حذف">${ic('trash')}</button></div>`;
      const bindTrDel = () => el.querySelectorAll('#trz .tr-del').forEach((b) => (b.onclick = () => b.closest('.trrow').remove()));
      const trEntries = Object.entries(c.settings?.translations || {});
      el.querySelector('#trz').innerHTML = (trEntries.length ? trEntries : [['', '']]).map(([a, e]) => trRow(a, e)).join(''); bindTrDel();
      el.querySelector('#trAdd').onclick = () => { el.querySelector('#trz').insertAdjacentHTML('beforeend', trRow()); bindTrDel(); };
      el.querySelector('#trSave').onclick = async (e) => {
        const map = {}; el.querySelectorAll('#trz .trrow').forEach((r) => { const a = r.querySelector('.tr-ar').value.trim(), en = r.querySelector('.tr-en').value.trim(); if (a && en) map[a] = en; });
        const _b = e.currentTarget; S.btnBusy(_b, true);
        try { await S.patch('/app/settings', { settings: { translations: map } }); if (S.i18nMerge) S.i18nMerge(map); S.toast('تم حفظ الترجمات — تظهر في الوضع الإنجليزي', 'ok'); }
        catch (er) { S.toast(er.message, 'bad'); }
        S.btnBusy(_b, false);
      };
      el.querySelectorAll('.pv').forEach((cb) => (cb.onchange = async () => {
        const parent_view = {}; el.querySelectorAll('.pv').forEach((x) => (parent_view[x.dataset.k] = x.checked)); // send the whole object (settings merge is shallow)
        try { await S.patch('/app/settings', { settings: { parent_view } }); S.toast('تم حفظ ما يظهر لولي الأمر', 'ok'); }
        catch (er) { S.toast(er.message, 'bad'); cb.checked = !cb.checked; }
      }));
    },
  });

  const PERMS = [['school', 'الهيكل المدرسي والحضور'], ['students', 'الطلاب وأولياء الأمور'], ['finance', 'العقود والأقساط والتحصيل'], ['accounting', 'المحاسبة'], ['hr', 'الموارد البشرية'], ['admin_affairs', 'الشؤون الإدارية'], ['inventory', 'المخزن والأصول'], ['settings', 'الإعدادات'], ['users', 'المستخدمون والصلاحيات']];
  S.page('users', S.crud({
    title: 'المستخدمون والصلاحيات', singular: 'مستخدم', api: '/app/users', perm: 'users', icon: 'users', invalidate: ['users'], formSize: 'wide',
    search: 'بحث بالاسم أو البريد...',
    columns: [{ l: 'المستخدم', s: true, v: (r) => cell.name(r.name, esc(r.email)) }, { l: 'المسمى', v: (r) => esc(r.title || '—') }, { l: 'الدور', v: (r) => (r.role === 'admin' ? '<span class="bdg violet">مدير — كل الصلاحيات</span>' : '<span class="bdg l-info">موظف</span>') }, { l: 'الصلاحيات', v: (r) => (r.role === 'admin' ? '<span class="muted">الكل</span>' : `<div class="chips" style="justify-content:center">${(r.permissions || []).map((p) => `<span class="bdg l-mut">${(PERMS.find((x) => x[0] === p) || [, p])[1]}</span>`).join('') || '—'}</div>`) }, { l: 'الحالة', v: (r) => (r.status === 'active' ? '<span class="bdg ok">مفعّل</span>' : '<span class="bdg bad">موقوف</span>') }],
    fields: (lk, row) => [{ k: 'name', l: 'الاسم', req: true }, { k: 'name_en', l: 'الاسم بالإنجليزية', dir: 'ltr' }, { k: 'title', l: 'المسمى الوظيفي' }, { k: 'title_en', l: 'المسمى بالإنجليزية', dir: 'ltr' }, { k: 'email', l: 'البريد (اسم الدخول)', t: 'email', req: true }, { k: 'phone', l: 'الجوال', t: 'tel' }, { k: 'role', l: 'الدور', t: 'select', req: true, opts: [['staff', 'موظف بصلاحيات محددة'], ['admin', 'مدير (كل الصلاحيات)']], def: 'staff' }, { k: 'status', l: 'الحالة', t: 'select', opts: [['active', 'مفعّل'], ['suspended', 'موقوف']], def: 'active' }, { k: 'password', l: row ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور', t: 'password', req: !row }, { k: 'permissions', l: 'الصلاحيات', t: 'perms', opts: PERMS, show: (v) => v.role !== 'admin' }],
    newDefaults: () => ({ role: 'staff', status: 'active', permissions: [] }),
  }));

  S.page('announcements', {
    perm: 'settings', title: 'الإعلانات والتعاميم',
    async render(el) {
      el.innerHTML = `${S.head('announcements')}<div class="toolbar"><button class="btn" id="add">${ic('plus')} إعلان جديد</button><span class="muted sm">تظهر الإعلانات للموظفين في الشريط العلوي، ولأولياء الأمور في بوابتهم حسب الجمهور المحدد.</span></div><div id="l"></div>`;
      const fields = [{ k: 'title', l: 'عنوان الإعلان', req: true, full: true }, { k: 'title_en', l: 'عنوان الإعلان بالإنجليزية', dir: 'ltr', full: true }, { k: 'audience', l: 'الجمهور', t: 'select', req: true, opts: [['all', 'الجميع'], ['staff', 'الموظفون'], ['guardians', 'أولياء الأمور']], def: 'all' }, { k: 'is_active', l: 'منشور', t: 'check', def: true }, { k: 'body', l: 'النص', t: 'textarea' }, { k: 'body_en', l: 'النص بالإنجليزية', t: 'textarea', dir: 'ltr' }];
      const AUD = { all: 'الجميع', staff: 'الموظفون', guardians: 'أولياء الأمور' };
      const load = async () => {
        const d = await S.get('/app/school-announcements');
        el.querySelector('#l').innerHTML = d.data.length ? `<div class="grid g2">${d.data.map((a) => `<div class="card pad"><div class="row between mb8"><b style="font-size:15px">${esc(a.title)}</b><span>${a.is_active ? '<span class="bdg ok">منشور</span>' : '<span class="bdg mut">مخفي</span>'} <span class="bdg l-info">${AUD[a.audience]}</span></span></div><p class="t2" style="white-space:pre-line">${esc(a.body || '')}</p><div class="row between mt16"><span class="muted xs">${S.ago(a.created_at)}</span><div class="acts"><button class="ibtn e" data-e="${a.id}">${ic('edit')}</button><button class="ibtn d" data-d="${a.id}">${ic('trash')}</button></div></div></div>`).join('')}</div>` : S.emptyHtml('لا توجد إعلانات', '', 'megaphone');
        el.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => { const a = d.data.find((x) => x.id === +b.dataset.e); S.formModal({ title: 'تعديل الإعلان', fields, values: a, onSave: async (v) => { await S.patch('/app/school-announcements/' + a.id, v); S.toast('تم الحفظ', 'ok'); load(); } }); }));
        el.querySelectorAll('[data-d]').forEach((b) => (b.onclick = async () => { if (await S.confirm('حذف الإعلان؟', 'حذف')) { await S.del('/app/school-announcements/' + b.dataset.d); load(); } }));
      };
      el.querySelector('#add').onclick = () => S.formModal({ title: 'إعلان جديد', fields, values: { audience: 'all', is_active: true }, onSave: async (v) => { await S.post('/app/school-announcements', v); S.toast('تم النشر', 'ok'); load(); } });
      await load();
    },
  });

  const ACT = { create: ['إضافة', 'l-ok'], update: ['تعديل', 'l-info'], delete: ['حذف', 'l-bad'], payment: ['دفعة', 'l-violet'], activate: ['تفعيل', 'l-ok'], cancel: ['إلغاء', 'l-bad'], accept: ['قبول', 'l-ok'], reject: ['رفض', 'l-bad'], approve: ['اعتماد', 'l-ok'], approved: ['اعتماد', 'l-ok'], rejected: ['رفض', 'l-bad'], attendance: ['حضور', 'l-info'], generate: ['توليد', 'l-info'], pay: ['صرف', 'l-violet'] };
  S.page('activity', S.crud({
    title: 'سجل النشاطات', api: '/app/activity', perm: 'settings', icon: 'activity', canAdd: false, canDelete: false, noActions: true, search: 'بحث في الوصف...',
    columns: [{ l: 'الوقت', v: (r) => `<span class="num sm">${S.d(r.created_at)} ${String(r.created_at).slice(11, 16)}</span>` }, { l: 'المستخدم', v: (r) => esc(r.user?.name || 'النظام') }, { l: 'العملية', v: (r) => S.badge(ACT, r.action) }, { l: 'الوصف', s: true, v: (r) => esc(r.description) }],
  }));

  S.page('profile', {
    title: 'الملف الشخصي',
    async render(el) {
      const me = S.me();
      const f1 = [{ k: 'name', l: 'الاسم', req: true }, { k: 'phone', l: 'الجوال', t: 'tel' }];
      const f2 = [{ k: 'current_password', l: 'كلمة المرور الحالية', t: 'password', req: true }, { k: 'password', l: 'كلمة المرور الجديدة', t: 'password', req: true }, { k: 'password_confirmation', l: 'تأكيد كلمة المرور', t: 'password', req: true }];
      el.innerHTML = `<div class="crumbs"><b>الحساب</b>${ic('chevL')}<span>الملف الشخصي</span></div><div class="grid g2"><div class="card"><div class="hd"><h3>${ic('user')} بياناتي</h3></div><div class="bd" id="a"><div class="profile-h"><span class="avatar">${esc(S.initials(me.user.name))}</span><div><h3>${esc(me.user.name)}</h3><div class="muted">${esc(me.user.email)}</div></div></div>${S.formHtml(f1, me.user)}<button class="btn mt16" id="s1">حفظ</button></div></div><div class="card"><div class="hd"><h3>${ic('key')} تغيير كلمة المرور</h3></div><div class="bd" id="b">${S.formHtml(f2, {})}<button class="btn mt16" id="s2">تغيير كلمة المرور</button></div></div></div>`;
      el.querySelector('#s1').onclick = async () => { const f = el.querySelector('#a form'); if (!S.validate(f, f1)) return; try { const r = await S.patch('/auth/profile', S.readForm(f, f1)); S.setSession(null, r); S.toast('تم الحفظ', 'ok'); } catch (e) { S.toast(e.message, 'bad'); } };
      el.querySelector('#s2').onclick = async () => { const f = el.querySelector('#b form'); if (!S.validate(f, f2)) return; try { await S.patch('/auth/profile', S.readForm(f, f2)); S.toast('تم تغيير كلمة المرور', 'ok'); f.reset(); } catch (e) { S.toast(e.message, 'bad'); S.showErrors(f, e); } };
    },
  });
})();
