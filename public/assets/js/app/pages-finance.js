/* سكوول — fees & collection: contracts (builder, view, print, payments), installments, tuition payments, receipts. */
(function () {
  'use strict';
  const { esc, ic, cell } = S;

  // ============================================================ receipt print
  S.printReceipt = function (v, extra = {}) {
    S.print('سند قبض ' + v.number, `<h2>${v.type === 'payment' ? 'سند صرف' : 'سند قبض'}</h2>
      <div class="kv"><div><span>رقم السند</span><b>${esc(v.number)}</b></div><div><span>التاريخ</span><b>${S.d(v.date)}</b></div>
      <div><span>${v.type === 'payment' ? 'صُرف إلى' : 'استلمنا من'}</span><b>${esc(S.enT(v.party_name, v.party_name_en) || '—')}</b></div><div><span>طريقة الدفع</span><b>${S.LBL.method[v.method] || v.method}${v.reference ? ' — ' + esc(v.reference) : ''}</b></div>
      ${extra.student ? `<div><span>الطالب</span><b>${esc(extra.student)}</b></div>` : ''}${extra.contract ? `<div><span>رقم العقد</span><b>${esc(extra.contract)}</b></div>` : ''}</div>
      <div class="big">${S.moneyT(v.amount)}</div>
      <p style="text-align:center">وذلك عن: ${esc(v.description || '')}</p>
      ${extra.remaining != null ? `<p style="text-align:center;color:#555">المتبقي على العقد بعد هذه الدفعة: <b>${S.moneyT(extra.remaining)}</b></p>` : ''}
      <div class="sig"><div>المستلم</div><div>المحاسب</div><div>الختم</div></div>`);
  };

  // ============================================================ payment dialog
  S.payDialog = async function ({ title, max, onPay, defaults }) {
    const lk = await S.L(['cash_accounts']);
    return S.formModal({
      title, saveText: 'تسجيل الدفعة', values: { amount: max, date: S.today(), method: 'cash', ...(defaults || {}) },
      fields: [
        { k: 'amount', l: `المبلغ (المتبقي ${S.moneyT(max)})`, t: 'money', req: true }, { k: 'date', l: 'تاريخ الدفع', t: 'date', req: true },
        { k: 'method', l: 'طريقة الدفع', t: 'select', req: true, opts: S.opts(S.LBL.method) }, { k: 'cash_account_id', l: 'الصندوق / الحساب', t: 'select', opts: lk.cash_accounts.map((a) => [a.id, a.name]) },
        { k: 'reference', l: 'رقم المرجع (شيك / تحويل)', full: true, show: (v) => v.method && v.method !== 'cash' },
      ],
      onSave: async (v) => { if (+v.amount > +max + 0.0005) throw new Error('المبلغ أكبر من المتبقي'); await onPay(v); },
    });
  };

  // ============================================================ contract builder (full page)
  /** Navigate to the full-page contract form. Kept as the public entry point used across the app. */
  S.contractBuilder = function (existing, preset = {}) {
    if (existing && existing.id) location.hash = '#/contract-form/' + existing.id;
    else if (preset && preset.student_id) location.hash = '#/contract-form?student=' + preset.student_id;
    else location.hash = '#/contract-form';
  };

  S.page('contract-form', {
    perm: 'finance', title: 'العقود',
    async render(el, params) {
      let existing = null;
      if (params.id) {
        el.innerHTML = S.spinner;
        try { existing = String(params.id).startsWith('tmp_') ? null : await S.get('/app/contracts/' + params.id); }
        catch (e) { if (!(S.local && S.local.isOfflineError(e))) { el.innerHTML = S.emptyHtml('تعذّر تحميل العقد', e.message, 'alert'); return; } }
        if (!existing && S.db) existing = await S.db.get('contracts', params.id); // offline / drafted offline: the mirrored copy
        if (!existing) { el.innerHTML = S.emptyHtml('تعذّر تحميل العقد', 'لا توجد نسخة محفوظة من هذا العقد على الجهاز', 'alert'); return; }
      }
      await mountContractForm(el, existing, params.student ? { student_id: params.student } : {});
    },
  });

  async function mountContractForm(el, existing, preset = {}) {
    const lk = await S.L(['fee_items', 'buses', 'sections']);
    const me = S.me();
    let studentsRes;
    try { studentsRes = await S.get('/app/students', { all: 1, year: S.yearId(), status: 'active' }); if (studentsRes._fromCache && S.local) throw Object.assign(new Error('cache'), { status: 503, offline: true }); }
    catch (e) { if (!(S.local && S.local.isOfflineError(e))) throw e; studentsRes = await S.local.query('students', { f: { status: 'active' }, year: S.yearId(), perPage: 5000, sort: ['name', 'asc'] }); } // offline: active students from the mirror
    // one contract per student per academic year: hide students who already have a (non-cancelled) contract
    let taken = new Set();
    try {
      let cr;
      try { cr = await S.get('/app/contracts', { all: 1, year: S.yearId() }); if (cr._fromCache && S.local) throw Object.assign(new Error('cache'), { status: 503, offline: true }); }
      catch (e) { if (!(S.local && S.local.isOfflineError(e))) throw e; cr = await S.local.query('contracts', { year: S.yearId(), perPage: 5000 }); }
      taken = new Set((cr.data || []).filter((c) => c.status !== 'cancelled' && !(existing && String(c.id) === String(existing.id))).map((c) => String(c.student_id)));
    } catch {}
    const students = studentsRes.data.filter((x) => !taken.has(String(x.id)) || (existing && String(x.id) === String(existing.student_id)));
    const c = existing || {};
    const state = {
      student_id: c.student_id || preset.student_id || '',
      date: S.d(c.date) !== '—' ? S.d(c.date) : S.today(),
      items: (c.items || []).map((i) => ({ fee_item_id: i.fee_item_id, name: i.name, amount: +i.amount })),
      bus_id: c.bus_id || '', discount_type: c.discount_type || 'fixed', discount_value: +c.discount_value || 0, discount_reason: c.discount_reason || '',
      tax_rate: c.tax_rate != null ? +c.tax_rate : +(me.company.tax_rate || 0), installments_count: c.installments_count || 3, first_due_date: S.d(c.first_due_date) !== '—' ? S.d(c.first_due_date) : S.today(), notes: c.notes || '',
      // null = even monthly split from first_due_date; an array = dates/amounts the user edited (kept in sync with the total)
      schedule: (c.schedule && c.schedule.length) ? c.schedule.map((x) => ({ due_date: S.d(x.due_date), amount: +x.amount })) : (c.installments && c.installments.length ? c.installments.map((x) => ({ due_date: S.d(x.due_date), amount: +x.amount })) : null),
    };
    const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; // local date, never shifted by the timezone
    const r3 = (n) => Math.round((+n || 0) * 1000) / 1000;
    const autoSchedule = (total) => { const n = Math.min(24, Math.max(1, +state.installments_count || 1)); const per = r3(total / n); return Array.from({ length: n }, (_, i) => { const d = new Date(state.first_due_date + 'T00:00:00'); d.setMonth(d.getMonth() + i); return { due_date: ymd(d), amount: i === n - 1 ? r3(total - per * (n - 1)) : per }; }); };
    // current rows: custom ones re-balanced so they always add up to the contract total (last row absorbs the difference)
    const schedule = (total) => { if (!state.schedule) return autoSchedule(total); const rows = state.schedule.map((x) => ({ ...x })); const sumBut = rows.slice(0, -1).reduce((a, x) => a + r3(x.amount), 0); rows[rows.length - 1].amount = r3(total - sumBut); return rows; };
    el.innerHTML = `<div class="crumbs"><a class="acc-t" href="#/contracts">العقود</a> ${ic('chevL')} <b>${existing ? 'تعديل' : 'عقد جديد'}</b></div>
      <div class="page-h"><div><h2>${existing ? 'تعديل العقد ' + esc(c.number) : 'عقد تسجيل جديد'}</h2><p>اختر الطالب وبنود الرسوم والخصم وجدولة الأقساط.</p></div>
        <div class="row"><a class="btn ghost" href="#/contracts">${ic('chevR')} رجوع للقائمة</a></div></div>
      <div id="cb"></div>
      <div class="card pad mt16" style="display:flex;gap:10px;flex-wrap:wrap;position:sticky;bottom:12px;z-index:5"><button class="btn ghost" id="sv-d">${ic('file')} حفظ كمسودة</button><button class="btn success" id="sv-a">${ic('check')} حفظ وتفعيل</button><a class="btn ghost" href="#/contracts">إلغاء</a></div>`;
    const root = el.querySelector('#cb');
    const student = () => students.find((s) => String(s.id) === String(state.student_id));
    const feeFor = (s) => lk.fee_items.filter((f) => !f.grade_id || (s && f.grade_id === s.grade_id));
    const pickDefaults = () => { const s = student(); if (!s) return; state.items = feeFor(s).filter((f) => f.is_mandatory).map((f) => ({ fee_item_id: f.id, name: f.name, amount: +f.amount })); state.bus_id = s.bus_id || ''; };
    if (!existing && state.student_id) pickDefaults();
    const calc = () => {
      const bus = lk.buses.find((b) => String(b.id) === String(state.bus_id));
      const busLine = bus && !state.items.some((i) => i.name.includes('حافلة')) ? +bus.price : 0;
      const sub = state.items.reduce((a, i) => a + (+i.amount || 0), 0) + busLine;
      const disc = state.discount_type === 'percent' ? (sub * Math.min(100, state.discount_value)) / 100 : Math.min(sub, state.discount_value);
      const tax = ((sub - disc) * state.tax_rate) / 100, total = sub - disc + tax, n = Math.max(1, +state.installments_count || 1);
      return { sub, disc, tax, total, per: total / n, busLine, bus };
    };
    const draw = S.safeDraw(root, () => {
      const s = student(), k = calc(), fees = feeFor(s);
      root.innerHTML = `<div class="grid g-2-1"><div>
        <div class="fgrid mb16"><label class="fld full"><span>الطالب <i>*</i></span><div id="st"></div>${students.length ? '' : `<div class="muted xs mt8">${studentsRes.data.length ? `يظهر هنا فقط الطلاب الذين ليس لهم عقد (غير ملغي) في السنة الدراسية الحالية — ${S.num(studentsRes.data.length)} طالب لديهم عقود بالفعل. لتعديل عقد قائم افتحه من <a class="acc-t" href="#/contracts">قائمة العقود</a>.` : `أضف الطلاب أولاً من <a class="acc-t" href="#/students">شاشة الطلاب</a>.`}</div>`}</label>
          <label class="fld"><span>تاريخ العقد</span><input class="inp" type="date" id="dt" value="${state.date}" dir="ltr"></label>
          <label class="fld"><span>الحافلة</span><select class="inp" id="bus"><option value="">بدون حافلة</option>${lk.buses.map((b) => `<option value="${b.id}" ${String(b.id) === String(state.bus_id) ? 'selected' : ''}>${esc(b.number)} — ${S.moneyT(b.price)}</option>`).join('')}</select></label></div>
        ${s ? `<div class="sec-t">${ic('coins')} بنود الرسوم ${s.grade ? '— ' + esc(s.grade.name_ar) : ''}</div>
          <div class="chips mb8">${fees.map((f) => { const on = state.items.some((i) => i.fee_item_id === f.id); return `<button class="chip ${on ? 'on' : ''}" data-fee="${f.id}">${on ? '✓ ' : '+ '}${esc(f.name)} <span class="n num">${S.fmtN(f.amount)}</span></button>`; }).join('') || '<span class="muted sm">لا توجد بنود رسوم لهذا الصف — أضفها من شاشة بنود الرسوم أو أضف بنداً يدوياً.</span>'}</div>
          <div class="lines">${state.items.map((it, i) => `<div class="ln"><input class="inp" data-ln="${i}" data-k="name" value="${esc(it.name)}"><input class="inp num" data-ln="${i}" data-k="amount" type="number" step="0.001" min="0" value="${it.amount}" dir="ltr"><button class="ibtn d" data-rm="${i}">${ic('trash')}</button></div>`).join('')}
          ${k.busLine ? `<div class="ln"><input class="inp" readonly value="رسوم الحافلة (${esc(k.bus.number)})"><input class="inp num" readonly value="${k.busLine}" dir="ltr"><span></span></div>` : ''}</div>
          <button class="btn ghost sm" id="addl">${ic('plus')} بند يدوي</button>` : `<div class="empty">${ic('user')}<b>اختر الطالب أولاً</b><div>ستظهر بنود الرسوم الخاصة بصفّه تلقائياً</div></div>`}
        <div class="fgrid mt16"><label class="fld"><span>نوع الخصم</span><select class="inp" id="dtp"><option value="fixed" ${state.discount_type === 'fixed' ? 'selected' : ''}>مبلغ ثابت</option><option value="percent" ${state.discount_type === 'percent' ? 'selected' : ''}>نسبة %</option></select></label>
          <label class="fld"><span>قيمة الخصم</span><input class="inp" id="dv" type="number" step="0.001" min="0" value="${state.discount_value}" dir="ltr"></label>
          <label class="fld"><span>سبب الخصم</span><input class="inp" id="dr" value="${esc(state.discount_reason)}" placeholder="خصم إخوة، موظفين..."></label>
          <label class="fld"><span>نسبة الضريبة %</span><input class="inp" id="tx" type="number" step="0.01" min="0" value="${state.tax_rate}" dir="ltr"></label>
          <label class="fld full"><span>ملاحظات</span><input class="inp" id="nt" value="${esc(state.notes)}"></label></div>
      </div><div>
        <div class="sumbox"><div class="b mb8">ملخص العقد</div>
          <div class="r"><span>الإجمالي الفرعي</span><b>${S.money(k.sub)}</b></div><div class="r"><span>الخصم</span><b class="bad-t">− ${S.money(k.disc)}</b></div><div class="r"><span>الضريبة</span><b>${S.money(k.tax)}</b></div><div class="r t"><span>الإجمالي</span><span>${S.money(k.total)}</span></div></div>
        <div class="sec-t">${ic('calendar')} جدولة الأقساط</div>
        <div class="fgrid"><label class="fld"><span>عدد الأقساط</span><input class="inp" id="ic" type="number" min="1" max="24" value="${state.installments_count}" dir="ltr"></label><label class="fld"><span>تاريخ أول قسط</span><input class="inp" id="fd" type="date" value="${state.first_due_date}" dir="ltr"></label></div>
        <div class="mt8">${schedule(k.total).map((x, i, arr) => `<div class="li" style="padding:4px 0;gap:8px"><span class="cnt m">${i + 1}</span><input class="inp num" type="date" data-sd="${i}" value="${x.due_date}" dir="ltr" style="height:32px;flex:1"><input class="inp num" type="number" step="0.001" min="0" data-sa="${i}" value="${x.amount}" dir="ltr" style="height:32px;width:110px" ${i === arr.length - 1 ? 'readonly title="آخر قسط يُضبط تلقائياً ليكتمل الإجمالي"' : ''}>${x.amount < 0 ? '<span class="bad-t xs">المبالغ تتجاوز الإجمالي</span>' : ''}</div>`).join('')}
          ${state.schedule ? `<button class="btn ghost xs mt8" id="sreset">${ic('refresh')} إعادة التوزيع بالتساوي</button>` : '<p class="muted xs mt8">يمكنك تعديل تاريخ أو مبلغ أي قسط؛ الأخير يُضبط تلقائياً.</p>'}</div>
      </div></div>`;
      const $ = (s) => root.querySelector(s);
      $('#st').replaceWith(S.combo({
        full: true, value: state.student_id, disabled: !students.length,
        placeholder: students.length ? '— اختر الطالب —' : (studentsRes.data.length ? '— كل الطلاب النشطين لديهم عقود —' : '— لا يوجد طلاب نشطون —'),
        searchPlaceholder: 'ابحث باسم الطالب أو الصف...',
        items: students.map((x) => [x.id, S.enName(x), [x.grade?.name_ar, x.section?.name].filter(Boolean).join(' ')]),
        onChange: (v) => { state.student_id = v; pickDefaults(); draw(); },
      }));
      $('#dt').onchange = (e) => (state.date = e.target.value);
      $('#bus').onchange = (e) => { state.bus_id = e.target.value; draw(); };
      $('#dtp').onchange = (e) => { state.discount_type = e.target.value; draw(); };
      $('#dv').onchange = (e) => { state.discount_value = +e.target.value || 0; draw(); };
      $('#dr').oninput = (e) => (state.discount_reason = e.target.value);
      $('#tx').onchange = (e) => { state.tax_rate = +e.target.value || 0; draw(); };
      $('#nt').oninput = (e) => (state.notes = e.target.value);
      $('#ic').onchange = (e) => { state.installments_count = Math.max(1, Math.min(24, +e.target.value || 1)); state.schedule = null; draw(); };
      $('#fd').onchange = (e) => { state.first_due_date = e.target.value; state.schedule = null; draw(); };
      const customize = () => { if (!state.schedule) state.schedule = schedule(calc().total); };
      root.querySelectorAll('[data-sd]').forEach((inp) => (inp.onchange = () => { customize(); state.schedule[+inp.dataset.sd].due_date = inp.value; draw(); }));
      root.querySelectorAll('[data-sa]').forEach((inp) => (inp.onchange = () => { customize(); state.schedule[+inp.dataset.sa].amount = r3(inp.value); draw(); }));
      $('#sreset') && ($('#sreset').onclick = () => { state.schedule = null; draw(); });
      root.querySelectorAll('[data-fee]').forEach((b) => (b.onclick = () => { const f = lk.fee_items.find((x) => x.id === +b.dataset.fee); const i = state.items.findIndex((x) => x.fee_item_id === f.id); if (i >= 0) state.items.splice(i, 1); else state.items.push({ fee_item_id: f.id, name: f.name, amount: +f.amount }); draw(); }));
      root.querySelectorAll('[data-ln]').forEach((inp) => (inp.onchange = () => { const it = state.items[+inp.dataset.ln]; it[inp.dataset.k] = inp.dataset.k === 'amount' ? +inp.value || 0 : inp.value; draw(); }));
      root.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { state.items.splice(+b.dataset.rm, 1); draw(); }));
      $('#addl') && ($('#addl').onclick = () => { state.items.push({ fee_item_id: null, name: 'بند إضافي', amount: 0 }); draw(); });
    });
    draw();
    const save = async (activate, btn) => {
      if (!state.student_id) return S.toast('اختر الطالب', 'bad');
      // items are optional (a contract may be bus-only); just make sure a zero-total contract is intentional
      if (calc().total <= 0 && !(await S.confirm('إجمالي هذا العقد صفر — لا بنود ولا حافلة. هل تريد حفظه على أي حال؟', 'حفظ', false))) return;
      S.btnBusy(btn, true);
      try {
        const k = calc(), sched = schedule(k.total);
        if (sched.some((x) => x.amount < 0)) { S.btnBusy(btn, false); return S.toast('مبالغ الأقساط تتجاوز إجمالي العقد — راجع الجدول', 'bad'); }
        const body = { ...state, items: state.items.filter((i) => i.name), activate, subtotal: k.sub, discount: k.disc, tax: k.tax, total: k.total, installments_count: sched.length, schedule: sched }; // totals are recomputed by the server; they also feed the offline copy
        const r = existing ? await S.patch('/app/contracts/' + existing.id, body) : await S.post('/app/contracts', body);
        if (r && r._queued) { location.hash = '#/contracts'; return; } // saved offline: back to the list where it shows as pending
        S.toast(activate ? 'تم حفظ العقد وتفعيله وتوليد الأقساط' : 'تم حفظ العقد كمسودة', 'ok');
        const target = '#/contracts/' + r.id;
        if (location.hash === target) S.reroute(); else location.hash = target;
      } catch (e) { S.toast(e.message, 'bad'); S.btnBusy(btn, false); }
    };
    el.querySelector('#sv-d').onclick = (e) => save(false, e.currentTarget);
    el.querySelector('#sv-a').onclick = (e) => save(true, e.currentTarget);
  }

  // ============================================================ contract view
  S.contractView = async function (id, reload) {
    const m = S.modal({ title: 'تفاصيل العقد', size: 'xwide', body: S.spinner, foot: '<div id="cf" class="row wrap grow" style="justify-content:flex-end"></div>' });
    const refresh = async () => {
      let c;
      try { c = String(id).startsWith('tmp_') ? null : await S.get('/app/contracts/' + id); if (c && c._fromCache && S.db) c = null; }
      catch (e) { if (!(S.local && S.local.isOfflineError(e))) throw e; }
      if (!c && S.db) { c = await S.db.get('contracts', id); if (c) c = { ...c, items: c.items || [], installments: (c.installments && c.installments.length) ? c.installments : (c.schedule || []).map((x, i) => ({ seq: i + 1, due_date: x.due_date, amount: x.amount, paid: 0, remaining: x.amount, status: 'pending' })), payments: c.payments || [] }; }
      if (!c) throw new Error('لا توجد نسخة محفوظة من هذا العقد على الجهاز');
      m.$('h3').innerHTML = `العقد <span class="num">${esc(c.number)}</span> ${S.badge(S.ST.contract, c.status)}`;
      const pct = +c.total ? Math.round((+c.paid * 100) / +c.total) : 0;
      m.body.innerHTML = `${c._pending ? `<div class="card pad mb16 row gap8" style="background:var(--warn-bg);border-color:transparent">${ic('alert')}<span class="sm"><b>عقد محفوظ على الجهاز</b><span class="muted"> — سيأخذ رقمه الرسمي وتتولّد أقساطه عند الرفع إلى الخادم</span></span></div>` : ''}<div class="grid g4 mb16">${S.ui.stat('c-violet', 'coins', S.money(c.total, true), 'إجمالي العقد')}${S.ui.stat('c-green', 'check', S.money(c.paid, true), 'المدفوع')}${S.ui.stat('c-red', 'timer', S.money(c.remaining, true), 'المتبقي')}<div class="stat c-blue"><div class="grow"><div class="k mb8">نسبة السداد</div>${S.prog(pct)}</div></div></div>
        <div class="grid g2"><div>${S.kv([['الطالب', `<a class="lk" href="#/students/${c.student_id}">${esc(S.enName(c.student))}</a>`], ['ولي الأمر', esc(S.enName(c.guardian) || '—')], ['الجوال', `<span class="num">${esc(c.guardian?.phone || '—')}</span>`], ['الصف / الشعبة', esc(S.gs(c, ''))], ['السنة الدراسية', esc(c.year?.name || '')], ['تاريخ العقد', `<span class="num">${S.d(c.date)}</span>`]]).replace('class="kv"', 'class="kv" style="grid-template-columns:1fr"')}</div>
          <div><table class="tbl" style="border:1px solid var(--line);border-radius:10px"><thead><tr><th class="s">البند</th><th>المبلغ</th></tr></thead><tbody>${c.items.map((i) => `<tr><td class="s">${esc(i.name)}</td><td class="num">${S.fmtN(i.amount)}</td></tr>`).join('')}</tbody><tfoot><tr><td class="s">الإجمالي الفرعي</td><td class="num">${S.fmtN(c.subtotal)}</td></tr>${+c.discount ? `<tr><td class="s">الخصم ${c.discount_reason ? '(' + esc(c.discount_reason) + ')' : ''}</td><td class="num bad-t">− ${S.fmtN(c.discount)}</td></tr>` : ''}${+c.tax ? `<tr><td class="s">الضريبة ${c.tax_rate}%</td><td class="num">${S.fmtN(c.tax)}</td></tr>` : ''}<tr><td class="s">الإجمالي</td><td class="num acc-t">${S.fmtN(c.total)}</td></tr></tfoot></table></div></div>
        <div class="sec-t">${ic('calendar')} الأقساط (${c.installments.length})</div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>تاريخ الاستحقاق</th><th>المبلغ</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th></tr></thead><tbody>${c.installments.map((i) => `<tr class="${i.is_overdue ? 'warn-row' : ''}"><td>${i.seq}</td><td class="num">${S.d(i.due_date)}</td><td class="num">${S.fmtN(i.amount)}</td><td class="num ok-t">${S.fmtN(i.paid)}</td><td class="num ${+i.remaining ? 'bad-t' : ''}">${S.fmtN(i.remaining)}</td><td>${S.badge(S.ST.inst, i.is_overdue ? 'overdue' : i.status)}</td></tr>`).join('')}</tbody></table></div>
        <div class="sec-t">${ic('receipt')} الدفعات (${c.payments.length})</div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>رقم السند</th><th>التاريخ</th><th>المبلغ</th><th>الطريقة</th><th>المرجع</th><th>الإجراءات</th></tr></thead><tbody>${c.payments.map((p) => `<tr><td class="num b">${esc(p.number)}</td><td class="num">${S.d(p.date)}</td><td class="num ok-t b">${S.fmtN(p.amount)}</td><td>${S.LBL.method[p.method] || p.method}</td><td class="num">${esc(p.reference || '—')}</td><td><div class="acts"><button class="ibtn p" data-pr="${p.id}" title="طباعة السند">${ic('printer')}</button><button class="ibtn d" data-pd="${p.id}" title="حذف">${ic('trash')}</button></div></td></tr>`).join('') || '<tr><td colspan="6" class="muted">لا توجد دفعات بعد</td></tr>'}</tbody></table></div>
        ${c.notes ? `<p class="muted mt16">ملاحظات: ${esc(c.notes)}</p>` : ''}`;
      const f = m.$('#cf');
      f.innerHTML = `${c.status === 'draft' ? `<button class="btn danger" data-a="del">${ic('trash')} حذف</button><button class="btn ghost" data-a="edit">${ic('edit')} تعديل</button><button class="btn success" data-a="act">${ic('check')} تفعيل العقد</button>` : ''}
        ${c.status === 'active' ? `<button class="btn ghost" data-a="cancel" style="color:var(--bad)">${ic('x')} إلغاء العقد</button><button class="btn success" data-a="pay">${ic('coins')} تسجيل دفعة</button>` : ''}
        <button class="btn ghost" data-a="print">${ic('printer')} طباعة العقد</button><button class="btn ghost" data-close>إغلاق</button>`;
      f.querySelector('[data-close]').onclick = m.close;
      const A = {
        act: async () => { const r = await S.post(`/app/contracts/${id}/activate`); if (!(r && r._queued)) S.toast('تم تفعيل العقد', 'ok'); refresh(); reload && reload(); },
        edit: () => { m.close(); S.contractBuilder(c); },
        del: async () => { if (await S.confirm('حذف العقد المسودة؟', 'حذف')) { const r = await S.del('/app/contracts/' + id); if (!(r && r._queued)) S.toast('تم الحذف', 'ok'); m.close(); reload && reload(); } },
        cancel: async () => { if (await S.confirm('إلغاء العقد؟ ستُلغى الأقساط غير المدفوعة.', 'إلغاء العقد')) { await S.post(`/app/contracts/${id}/cancel`); S.toast('تم إلغاء العقد', 'ok'); refresh(); reload && reload(); } },
        pay: () => S.payDialog({ title: 'تسجيل دفعة — ' + S.enName(c.student), max: +c.remaining, onPay: async (v) => { const r = await S.post(`/app/contracts/${id}/payments`, v); S.toast(r.message, 'ok'); refresh(); reload && reload(); if (await S.confirm('طباعة سند القبض؟', 'طباعة', false)) S.printReceipt(r.voucher, { student: S.enName(c.student), contract: c.number, remaining: +c.remaining - +r.voucher.amount }); } }),
        print: () => printContract(c),
      };
      f.querySelectorAll('[data-a]').forEach((b) => (b.onclick = async () => { try { await A[b.dataset.a](); } catch (e) { S.toast(e.message, 'bad'); } }));
      m.body.querySelectorAll('[data-pr]').forEach((b) => (b.onclick = () => S.printReceipt(c.payments.find((p) => p.id === +b.dataset.pr), { student: S.enName(c.student), contract: c.number })));
      m.body.querySelectorAll('[data-pd]').forEach((b) => (b.onclick = async () => { if (!(await S.confirm('حذف هذه الدفعة؟ سيُعاد احتساب الأقساط.', 'حذف'))) return; try { await S.del(`/app/contracts/${id}/payments/${b.dataset.pd}`); S.toast('تم حذف الدفعة', 'ok'); refresh(); reload && reload(); } catch (e) { S.toast(e.message, 'bad'); } }));
    };
    refresh().catch((e) => (m.body.innerHTML = S.emptyHtml(e.message)));
  };
  function printContract(c) {
    S.print('عقد ' + c.number, `<h2>عقد تسجيل طالب — رقم ${esc(c.number)}</h2>
      <div class="kv"><div><span>اسم الطالب</span><b>${esc(S.enName(c.student))}</b></div><div><span>رقم الهوية</span><b>${esc(c.student?.national_id || '—')}</b></div><div><span>ولي الأمر</span><b>${esc(S.enName(c.guardian) || '—')}</b></div><div><span>الجوال</span><b>${esc(c.guardian?.phone || '—')}</b></div><div><span>الصف / الشعبة</span><b>${esc(S.gs(c, ''))}</b></div><div><span>السنة الدراسية</span><b>${esc(c.year?.name || '')}</b></div><div><span>تاريخ العقد</span><b>${S.d(c.date)}</b></div><div><span>الحالة</span><b>${S.ST.contract[c.status][0]}</b></div></div>
      <table><thead><tr><th>#</th><th>البند</th><th>المبلغ</th></tr></thead><tbody>${c.items.map((i, k) => `<tr><td>${k + 1}</td><td style="text-align:right">${esc(i.name)}</td><td>${S.fmtN(i.amount)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="2">الإجمالي الفرعي</td><td>${S.fmtN(c.subtotal)}</td></tr>${+c.discount ? `<tr><td colspan="2">الخصم ${esc(c.discount_reason || '')}</td><td>− ${S.fmtN(c.discount)}</td></tr>` : ''}${+c.tax ? `<tr><td colspan="2">الضريبة ${c.tax_rate}%</td><td>${S.fmtN(c.tax)}</td></tr>` : ''}<tr class="tot"><td colspan="2">الإجمالي المستحق</td><td>${S.moneyT(c.total)}</td></tr></tbody></table>
      <h3>جدول الأقساط</h3><table><thead><tr><th>القسط</th><th>تاريخ الاستحقاق</th><th>المبلغ</th><th>المدفوع</th><th>الحالة</th></tr></thead><tbody>${c.installments.map((i) => `<tr><td>${i.seq}</td><td>${S.d(i.due_date)}</td><td>${S.fmtN(i.amount)}</td><td>${S.fmtN(i.paid)}</td><td>${S.ST.inst[i.status][0]}</td></tr>`).join('')}</tbody></table>
      <p style="font-size:12px;color:#444;line-height:1.9">يتعهد ولي الأمر بسداد الأقساط في مواعيدها المحددة أعلاه، وفي حال التأخر يحق للمدرسة اتخاذ الإجراءات المنصوص عليها في لائحة المدرسة. الرسوم المدفوعة غير قابلة للاسترداد بعد بدء العام الدراسي إلا وفق سياسة الاسترداد المعتمدة.</p>
      <div class="sig"><div>ولي الأمر</div><div>إدارة المدرسة</div><div>الختم</div></div>`);
  }

  // ============================================================ contracts list
  S.page('contracts', S.crud({
    title: 'العقود', singular: 'عقد', api: '/app/contracts', perm: 'finance', year: true, icon: 'contract', lookups: ['grades', 'sections'],
    chips: { k: 'status', items: [['draft', 'مسودة'], ['active', 'مفعّل'], ['completed', 'مكتمل'], ['cancelled', 'ملغي']] },
    search: 'اسم الطالب أو رقم العقد أو جوال ولي الأمر...',
    filters: [{ k: 'grade_id', l: 'الصف', opts: (lk) => lk.grades.map((g) => [g.id, S.enName(g)]) }, { k: 'section_id', l: 'الشعبة', opts: (lk) => lk.sections.map((s) => [s.id, (s.grade ? S.enName(s.grade) + ' / ' : '') + S.enName(s)]) }, { k: 'from', l: 'من تاريخ', t: 'date' }, { k: 'to', l: 'إلى تاريخ', t: 'date' }],
    columns: [
      { l: 'رقم العقد', v: (r) => `<a class="lk num" href="#" data-open>${esc(r.number)}</a>` }, { l: 'الطالب', v: (r) => esc(S.enName(r.student)) }, { l: 'جوال ولي الأمر', v: (r) => `<a class="lk num" href="tel:${esc(r.guardian?.phone || '')}">${esc(r.guardian?.phone || '—')}</a>` },
      { l: 'الصف / الشعبة', v: (r) => esc(S.gs(r, '')) },
      { l: 'الإجمالي الفرعي', v: (r) => `<span class="num">${S.fmtN(r.subtotal)}</span>` }, { l: 'الخصم', v: (r) => `<span class="num">${S.fmtN(r.discount)}</span>` }, { l: 'الضريبة', v: (r) => `<span class="num">${S.fmtN(r.tax)}</span>` },
      { l: 'الإجمالي', v: (r) => `<b class="num">${S.fmtN(r.total)}</b>` }, { l: 'المبلغ المدفوع', v: (r) => `<span class="num ok-t">${S.fmtN(r.paid)}</span>` }, { l: 'الباقي', v: (r) => `<span class="num ${+r.remaining ? 'bad-t b' : ''}">${S.fmtN(r.remaining)}</span>` }, { l: 'الحالة', v: (r) => S.badge(S.ST.contract, r.status) },
    ],
    view: (r, ctx) => S.contractView(r.id, ctx.reload),
    customForm: (row) => S.contractBuilder(row),
    loadForEdit: true, fields: () => [], canEdit: (r) => r.status === 'draft', canDelete: (r) => r.status === 'draft' || r.status === 'cancelled',
    rowActions: [{ ic: 'coins', cls: 'g', t: 'تسجيل دفعة', show: (r) => r.status === 'active', run: (r, ctx) => S.payDialog({ title: 'تسجيل دفعة — ' + S.enName(r.student), max: +r.remaining, onPay: async (v) => { const res = await S.post(`/app/contracts/${r.id}/payments`, v); S.toast(res.message, 'ok'); ctx.reload(); } }) }],
    foot: (rows) => `<tr><td colspan="5" class="s">إجمالي الصفحة</td><td class="num">${S.fmtN(rows.reduce((a, r) => a + +r.subtotal, 0))}</td><td class="num">${S.fmtN(rows.reduce((a, r) => a + +r.discount, 0))}</td><td class="num">${S.fmtN(rows.reduce((a, r) => a + +r.tax, 0))}</td><td class="num">${S.fmtN(rows.reduce((a, r) => a + +r.total, 0))}</td><td class="num ok-t">${S.fmtN(rows.reduce((a, r) => a + +r.paid, 0))}</td><td class="num bad-t">${S.fmtN(rows.reduce((a, r) => a + +r.remaining, 0))}</td><td colspan="2"></td></tr>`,
    exportCols: [{ l: 'رقم العقد', v: (r) => r.number }, { l: 'الطالب', v: (r) => r.student?.name }, { l: 'ولي الأمر', v: (r) => r.guardian?.name }, { l: 'الجوال', v: (r) => r.guardian?.phone }, { l: 'الصف', v: (r) => r.grade?.name_ar }, { l: 'الشعبة', v: (r) => r.section?.name }, { l: 'التاريخ', v: (r) => S.d(r.date) }, { l: 'الإجمالي الفرعي', v: (r) => +r.subtotal }, { l: 'الخصم', v: (r) => +r.discount }, { l: 'الضريبة', v: (r) => +r.tax }, { l: 'الإجمالي', v: (r) => +r.total }, { l: 'المدفوع', v: (r) => +r.paid }, { l: 'الباقي', v: (r) => +r.remaining }, { l: 'الحالة', v: (r) => S.ST.contract[r.status][0] }],
  }));

  // ============================================================ installments
  S.page('installments', {
    perm: 'finance',
    async render(el, params) {
      const lk = await S.L(['years', 'grades']);
      const st = { state: params.state || 'unpaid', q: '', page: 1, grade_id: '', from: '', to: '' };
      el.innerHTML = `${S.head('installments', { year: true })}
        <div class="toolbar"><div class="chips">${[['unpaid', 'غير المسددة'], ['overdue', 'المتأخرة'], ['due', 'تستحق خلال 30 يوماً'], ['paid', 'المسددة'], ['', 'الكل']].map(([v, l]) => `<button class="chip ${st.state === v ? 'on' : ''}" data-s="${v}">${l}</button>`).join('')}</div><div class="sp"></div><button class="btn outline-ok" id="exp">${ic('download')} تصدير</button></div>
        <div class="filters"><label class="fld q"><span>بحث</span><div class="search">${ic('search')}<input class="inp" id="q" placeholder="اسم الطالب أو رقم العقد..."></div></label><label class="fld"><span>الصف</span><select class="inp" id="g"><option value="">الكل</option>${lk.grades.map((g) => `<option value="${g.id}">${esc(g.name_ar)}</option>`).join('')}</select></label><label class="fld"><span>استحقاق من</span><input class="inp" type="date" id="f" dir="ltr"></label><label class="fld"><span>إلى</span><input class="inp" type="date" id="t" dir="ltr"></label></div>
        <div class="grid g3 mb16" id="tot"></div>
        <div class="tbl-wrap"><div class="tbl-scroll" id="tbl"></div><div class="pager hide" id="pg"></div></div>`;
      S.bindYear(el);
      const $ = (s) => el.querySelector(s);
      let last;
      const load = async (all) => {
        if (!all) $('#tbl').innerHTML = S.spinner;
        const res = await S.get('/app/installments', { year: S.yearId(), state: st.state, q: st.q, grade_id: st.grade_id, from: st.from, to: st.to, page: all ? 1 : st.page, per_page: all ? 500 : 25 });
        if (all) return res.data;
        last = res;
        $('#tot').innerHTML = S.ui.stat('c-violet', 'coins', S.money(res.totals.amount, true), 'إجمالي الأقساط') + S.ui.stat('c-green', 'check', S.money(res.totals.paid, true), 'المحصّل') + S.ui.stat('c-red', 'timer', S.money(res.totals.remaining, true), 'المتبقي');
        $('#tbl').innerHTML = res.data.length ? `<table class="tbl"><thead><tr><th>#</th><th class="s">الطالب</th><th>الصف</th><th>رقم العقد</th><th>ولي الأمر</th><th>القسط</th><th>تاريخ الاستحقاق</th><th>المبلغ</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>${res.data.map((i, k) => `<tr class="${i.is_overdue ? 'warn-row' : ''}"><td class="muted">${res.from + k}</td><td class="s b">${esc(S.enName(i.student))}</td><td>${esc(S.enName(i.student?.grade))}</td><td><a class="lk num" href="#" data-c="${i.contract_id}">${esc(i.contract?.number)}</a></td><td>${esc(S.enName(i.contract?.guardian))}<div class="muted xs num">${esc(i.contract?.guardian?.phone || '')}</div></td><td>${i.seq}</td><td class="num ${i.is_overdue ? 'bad-t b' : ''}">${S.d(i.due_date)}</td><td class="num">${S.fmtN(i.amount)}</td><td class="num ok-t">${S.fmtN(i.paid)}</td><td class="num b">${S.fmtN(i.remaining)}</td><td>${S.badge(S.ST.inst, i.is_overdue ? 'overdue' : i.status)}</td><td><div class="acts">${i.status !== 'paid' ? `<button class="ibtn g" data-pay="${k}" title="تحصيل">${ic('coins')}</button>` : ''}${i.contract?.guardian?.phone ? `<a class="ibtn v" target="_blank" title="تذكير واتساب" href="https://wa.me/${esc(i.contract.guardian.phone.replace(/\D/g, ''))}?text=${encodeURIComponent(`السلام عليكم، نود تذكيركم بموعد استحقاق القسط رقم ${i.seq} للطالب ${S.enName(i.student)} بتاريخ ${S.d(i.due_date)} بمبلغ ${S.moneyT(i.remaining)}. شكراً لتعاونكم — ${S.me().company.name}`)}">${ic('whatsapp')}</a>` : ''}</div></td></tr>`).join('')}</tbody></table>` : S.emptyHtml('لا توجد أقساط', '', 'calendar');
        $('#tbl').querySelectorAll('[data-c]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); S.contractView(+a.dataset.c, () => load()); }));
        $('#tbl').querySelectorAll('[data-pay]').forEach((b) => (b.onclick = () => { const i = res.data[+b.dataset.pay]; S.payDialog({ title: `تحصيل القسط ${i.seq} — ${S.enName(i.student)}`, max: +i.remaining, onPay: async (v) => { const r = await S.post(`/app/contracts/${i.contract_id}/payments`, v); S.toast(r.message, 'ok'); load(); } }); }));
        const p = $('#pg');
        if (res.last_page > 1) { p.classList.remove('hide'); p.innerHTML = `<span>صفحة ${res.current_page} من ${res.last_page}</span><div class="pg"><button ${res.current_page <= 1 ? 'disabled' : ''} data-p="-1">السابق</button><button ${res.current_page >= res.last_page ? 'disabled' : ''} data-p="1">التالي</button></div>`; p.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { st.page += +b.dataset.p; load(); })); } else p.classList.add('hide');
      };
      el.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { el.querySelectorAll('[data-s]').forEach((x) => x.classList.remove('on')); b.classList.add('on'); st.state = b.dataset.s; st.page = 1; load(); }));
      $('#q').oninput = S.debounce((e) => { st.q = e.target.value.trim(); st.page = 1; load(); }, 350);
      $('#g').onchange = (e) => { st.grade_id = e.target.value; st.page = 1; load(); };
      $('#f').onchange = (e) => { st.from = e.target.value; load(); };
      $('#t').onchange = (e) => { st.to = e.target.value; load(); };
      S.enhanceSelects(el);
      $('#exp').onclick = async () => { const rows = await load(true); S.exportXlsx('الأقساط', [{ l: 'الطالب', v: (i) => i.student?.name }, { l: 'رقم العقد', v: (i) => i.contract?.number }, { l: 'ولي الأمر', v: (i) => i.contract?.guardian?.name }, { l: 'الجوال', v: (i) => i.contract?.guardian?.phone }, { l: 'القسط', v: (i) => i.seq }, { l: 'تاريخ الاستحقاق', v: (i) => S.d(i.due_date) }, { l: 'المبلغ', v: (i) => +i.amount }, { l: 'المدفوع', v: (i) => +i.paid }, { l: 'المتبقي', v: (i) => +i.remaining }, { l: 'الحالة', v: (i) => (i.is_overdue ? 'متأخر' : S.ST.inst[i.status][0]) }], rows); };
      await load();
    },
  });

  // ============================================================ tuition payments
  S.page('tuition-payments', S.crud({
    title: 'مدفوعات الأقساط', singular: 'دفعة', api: '/app/tuition-payments', perm: 'finance', icon: 'receipt', canAdd: false, canDelete: false, canEdit: false,
    search: 'رقم السند أو اسم ولي الأمر...',
    filters: [{ k: 'method', l: 'طريقة الدفع', opts: S.opts(S.LBL.method) }, { k: 'from', l: 'من تاريخ', t: 'date' }, { k: 'to', l: 'إلى تاريخ', t: 'date' }],
    summary: (res) => `<div class="grid g3 mb16">${S.ui.stat('c-green', 'download', S.money(res.sum, true), 'إجمالي المحصّل (حسب الفلتر)')}${S.ui.stat('c-blue', 'receipt', S.num(res.total), 'عدد السندات')}</div>`,
    columns: [
      { l: 'رقم السند', v: (r) => `<b class="num">${esc(r.number)}</b>` }, { l: 'التاريخ', v: (r) => cell.num(S.d(r.date)) }, { l: 'الطالب', v: (r) => esc(S.enT(r.student_name, r.student_name_en) || '—') }, { l: 'ولي الأمر', v: (r) => esc(S.enT(r.party_name, r.party_name_en) || '—') },
      { l: 'رقم العقد', v: (r) => `<a class="lk num" href="#" data-c="${r.source_id}">${esc(r.contract_number || '')}</a>` }, { l: 'المبلغ', v: (r) => `<b class="num ok-t">${S.fmtN(r.amount)}</b>` }, { l: 'الطريقة', v: (r) => S.LBL.method[r.method] || r.method }, { l: 'الصندوق', v: (r) => esc(S.enName(r.cash_account) || '—') }, { l: 'بواسطة', v: (r) => esc(S.enName(r.creator) || '—') },
    ],
    rowActions: [{ ic: 'printer', cls: 'p', t: 'طباعة السند', run: (r) => S.printReceipt(r, { student: r.student_name, contract: r.contract_number }) }],
    afterRender: (ctx) => ctx.el.addEventListener('click', (e) => { const a = e.target.closest('[data-c]'); if (a) { e.preventDefault(); S.contractView(+a.dataset.c, ctx.reload); } }),
    exportCols: [{ l: 'رقم السند', v: (r) => r.number }, { l: 'التاريخ', v: (r) => S.d(r.date) }, { l: 'الطالب', v: (r) => r.student_name }, { l: 'ولي الأمر', v: (r) => r.party_name }, { l: 'رقم العقد', v: (r) => r.contract_number }, { l: 'المبلغ', v: (r) => +r.amount }, { l: 'الطريقة', v: (r) => S.LBL.method[r.method] }],
  }));
})();
