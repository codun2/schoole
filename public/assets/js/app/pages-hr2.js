/* سكوول — HR extras: employee contracts, evaluation criteria/periods, and performance evaluations. */
(function () {
  'use strict';
  const { esc, ic, cell } = S;
  const empOpts = (lk) => (lk.employees || []).map((e) => [e.id, e.name + ' — ' + e.number]);
  const CTYPE = { permanent: 'دائم', fixed: 'محدد المدة', part_time: 'دوام جزئي' };
  const gBadge = (g) => `<span class="bdg" style="background:${g.color}22;color:${g.color}">${g.letter} — ${esc(g.remark)}</span>`;
  const SCALE = [[90, 'A', 'ممتاز', '#14a06b'], [80, 'B', 'جيد جداً', '#2f7ae5'], [65, 'C', 'جيد', '#0f9d9a'], [50, 'D', 'مقبول', '#d98a0b'], [0, 'F', 'ضعيف', '#e0384c']];
  const gradeOf = (p) => { if (p == null) return { letter: '—', remark: 'غير مقيّم', color: '#8a93a6' }; const r = SCALE.find(([m]) => p >= m) || SCALE[4]; return { letter: r[1], remark: r[2], color: r[3] }; };

  // ---------------------------------------------------------------- employee contracts
  S.page('employee-contracts', S.crud({
    title: 'عقود الموظفين', singular: 'عقد موظف', api: '/app/employee-contracts', perm: 'hr', icon: 'contract', lookups: ['employees'], formSize: 'wide',
    search: 'رقم العقد أو اسم الموظف...',
    chips: { k: 'state', items: [['', 'الكل'], ['expiring', 'قاربت على الانتهاء'], ['expired', 'منتهية']] },
    filters: [{ k: 'type', l: 'نوع العقد', opts: S.opts(CTYPE) }, { k: 'employee_id', l: 'الموظف', opts: empOpts }],
    columns: [
      { l: 'رقم العقد', v: (r) => `<a class="lk num" href="#" data-open>${esc(r.number)}</a>` }, { l: 'الموظف', s: true, v: (r) => cell.name(r.employee?.name, `<span class="num">${esc(r.employee?.number || '')}</span>`) },
      { l: 'النوع', v: (r) => `<span class="bdg l-info">${CTYPE[r.type] || r.type}</span>` }, { l: 'البداية', v: (r) => cell.num(S.d(r.start_date)) }, { l: 'النهاية', v: (r) => `<span class="num ${r.state === 'expired' || r.state === 'expiring' ? 'bad-t b' : ''}">${S.d(r.end_date) || 'غير محدد'}</span>` },
      { l: 'الراتب', v: (r) => S.money(+r.basic_salary + +r.allowances) }, { l: 'الحالة', v: (r) => (r.status === 'terminated' ? '<span class="bdg mut">منتهٍ</span>' : S.badge(S.ST.license, r.state)) }, { l: 'مرفق', v: (r) => cell.file(r.attachment) },
    ],
    rowClass: (r) => (r.status !== 'terminated' && (r.state === 'expired' || r.state === 'expiring') ? 'warn-row' : ''),
    fields: (lk) => [
      { k: 'employee_id', l: 'الموظف', t: 'select', req: true, opts: empOpts(lk) }, { k: 'type', l: 'نوع العقد', t: 'select', opts: S.opts(CTYPE), def: 'permanent' },
      { k: 'start_date', l: 'تاريخ البداية', t: 'date', req: true, def: S.today() }, { k: 'end_date', l: 'تاريخ النهاية', t: 'date', help: 'اتركه فارغاً للعقد الدائم' },
      { k: 'basic_salary', l: 'الراتب الأساسي', t: 'money' }, { k: 'allowances', l: 'إجمالي البدلات', t: 'money' }, { k: 'status', l: 'الحالة', t: 'select', opts: [['active', 'ساري'], ['terminated', 'منتهٍ/مفسوخ']], def: 'active' },
      { k: 'file', l: 'نسخة العقد (ملف)', t: 'file' }, { k: 'notes', l: 'ملاحظات', t: 'textarea' },
    ],
    newDefaults: () => ({ type: 'permanent', status: 'active', start_date: S.today() }),
    toForm: (r) => ({ ...r }),
    toPayload: (v) => { if (v instanceof FormData) return v; const f = new FormData(); Object.entries(v).forEach(([k, x]) => x != null && f.append(k, typeof x === 'boolean' ? (x ? 1 : 0) : x)); return f; },
    viewFields: (r) => [['رقم العقد', esc(r.number)], ['الموظف', esc(r.employee?.name)], ['النوع', CTYPE[r.type]], ['البداية', S.d(r.start_date)], ['النهاية', S.d(r.end_date) || 'غير محدد'], ['الراتب الأساسي', S.money(r.basic_salary)], ['البدلات', S.money(r.allowances)], ['الحالة', r.status === 'terminated' ? 'منتهٍ' : S.ST.license[r.state][0]], ['المرفق', r.attachment ? `<a class="lk" target="_blank" href="${esc(r.attachment)}">فتح</a>` : '—'], ['ملاحظات', esc(r.notes || '—')]],
    exportCols: [{ l: 'رقم العقد', v: (r) => r.number }, { l: 'الموظف', v: (r) => r.employee?.name }, { l: 'النوع', v: (r) => CTYPE[r.type] }, { l: 'البداية', v: (r) => S.d(r.start_date) }, { l: 'النهاية', v: (r) => S.d(r.end_date) }, { l: 'الراتب', v: (r) => +r.basic_salary + +r.allowances }, { l: 'الحالة', v: (r) => r.status }],
  }));

  // ---------------------------------------------------------------- evaluation criteria
  S.page('evaluation-criteria', S.crud({
    title: 'معايير التقييم', singular: 'معيار', api: '/app/evaluation-criteria', perm: 'hr', icon: 'sliders', invalidate: ['eval_criteria'], search: false,
    intro: '<p class="t2 mb16">معايير تقييم أداء الموظفين. «الوزن» نسبة مساهمة المعيار في الدرجة النهائية (يُفضّل أن يساوي المجموع 100%).</p>',
    columns: [{ l: 'المعيار', s: true, v: (r) => `<b>${esc(r.name)}</b>` }, { l: 'الوزن', v: (r) => `<span class="num">${S.fmtN(r.weight, 0)}%</span>` }, { l: 'الدرجة العظمى', v: (r) => cell.num(S.fmtN(r.max_score, 0)) }, { l: 'الترتيب', v: (r) => cell.num(r.sort) }],
    fields: () => [{ k: 'name', l: 'اسم المعيار', req: true, full: true }, { k: 'weight', l: 'الوزن %', t: 'number', min: 0, max: 100, def: 20 }, { k: 'max_score', l: 'الدرجة العظمى', t: 'number', min: 1, def: 100 }, { k: 'sort', l: 'الترتيب', t: 'number', min: 0 }],
    foot: (rows) => `<tr><td class="s">مجموع الأوزان</td><td class="num ${Math.round(rows.reduce((a, r) => a + +r.weight, 0)) === 100 ? 'ok-t' : 'warn-t'} b">${S.fmtN(rows.reduce((a, r) => a + +r.weight, 0), 0)}%</td><td colspan="2"></td></tr>`,
  }));

  // ---------------------------------------------------------------- evaluation periods
  S.page('evaluation-periods', S.crud({
    title: 'فترات التقييم', singular: 'فترة تقييم', api: '/app/evaluation-periods', perm: 'hr', icon: 'calendar', invalidate: ['eval_periods'], search: 'بحث...',
    columns: [{ l: 'الفترة', s: true, v: (r) => `<b>${esc(r.name)}</b>` }, { l: 'من', v: (r) => cell.num(S.d(r.from_date)) }, { l: 'إلى', v: (r) => cell.num(S.d(r.to_date)) }, { l: 'التقييمات', v: (r) => cell.cnt(r.evaluations_count) }, { l: 'الحالة', v: (r) => (r.status === 'open' ? '<span class="bdg ok">مفتوحة</span>' : '<span class="bdg mut">مغلقة</span>') }],
    fields: () => [{ k: 'name', l: 'اسم الفترة', req: true, full: true }, { k: 'from_date', l: 'من تاريخ', t: 'date' }, { k: 'to_date', l: 'إلى تاريخ', t: 'date' }, { k: 'status', l: 'الحالة', t: 'select', opts: [['open', 'مفتوحة'], ['closed', 'مغلقة']], def: 'open' }],
    newDefaults: () => ({ status: 'open' }),
  }));

  // ---------------------------------------------------------------- evaluations
  async function evalForm(lk, employeeId, periodId, done) {
    const form = await S.get('/app/evaluations/form', { employee_id: employeeId, period_id: periodId });
    if (!form.criteria.length) { S.toast('عرّف معايير التقييم أولاً', 'bad'); return; }
    const emp = lk.employees.find((e) => String(e.id) === String(employeeId));
    const state = {}; form.criteria.forEach((c) => (state[c.id] = { score: form.scores[c.id]?.score ?? '', note: form.scores[c.id]?.note ?? '' }));
    const wsum = form.criteria.reduce((a, c) => a + +c.weight, 0) || 100;
    const m = S.modal({ title: 'تقييم — ' + (emp?.name || ''), size: 'wide', sticky: true, body: '<div id="eb"></div>', foot: `<button class="btn ghost" data-close>إلغاء</button><button class="btn success" id="sv">${ic('check')} حفظ التقييم</button>` });
    const recompute = () => {
      let weighted = 0, any = false;
      form.criteria.forEach((c) => { const sc = state[c.id].score; if (sc !== '' && sc != null) { any = true; weighted += (Math.min(+sc, +c.max_score) / +c.max_score) * 100 * (+c.weight / wsum); } });
      const total = any ? Math.round(weighted * 100) / 100 : null, g = gradeOf(total);
      const tt = m.$('#eb-total'); if (tt) tt.innerHTML = `<td class="s">النتيجة النهائية (مرجّحة)</td><td colspan="2" class="num b" style="color:${g.color};font-size:16px">${total != null ? S.fmtN(total, 1) + '%' : '—'}</td><td>${gBadge(g)}</td>`;
    };
    // Build once; inputs only recompute the footer total (no table rebuild → no focus loss).
    m.$('#eb').innerHTML = `<div class="tbl-wrap mb16"><table class="tbl"><thead><tr><th class="s">المعيار</th><th>الوزن</th><th style="width:130px">الدرجة (من)</th><th>ملاحظة</th></tr></thead><tbody>
      ${form.criteria.map((c) => `<tr><td class="s b">${esc(c.name)}</td><td class="num">${S.fmtN(c.weight, 0)}%</td><td><div class="row gap4"><input class="inp num" type="number" min="0" max="${+c.max_score}" step="0.5" data-s="${c.id}" value="${state[c.id].score}" dir="ltr" style="height:34px;text-align:center"><span class="muted sm" style="line-height:34px">/${S.fmtN(c.max_score, 0)}</span></div></td><td><input class="inp" data-n="${c.id}" value="${esc(state[c.id].note)}" placeholder="—" style="height:34px"></td></tr>`).join('')}
      </tbody><tfoot><tr id="eb-total"></tr></tfoot></table></div>
      <label class="fld"><span>ملاحظات عامة</span><textarea class="inp" id="notes">${esc(form.evaluation?.notes || '')}</textarea></label>`;
    m.$('#eb').querySelectorAll('[data-s]').forEach((i) => (i.oninput = () => { state[i.dataset.s].score = i.value; recompute(); }));
    m.$('#eb').querySelectorAll('[data-n]').forEach((i) => (i.oninput = () => (state[i.dataset.n].note = i.value)));
    recompute();
    m.$('#sv').onclick = async (e) => {
      const scores = form.criteria.filter((c) => state[c.id].score !== '' && state[c.id].score != null).map((c) => ({ criterion_id: c.id, score: +state[c.id].score, note: state[c.id].note || null }));
      if (!scores.length) return S.toast('أدخل درجة واحدة على الأقل', 'bad');
      S.btnBusy(e.currentTarget, true);
      const payload = { employee_id: employeeId, period_id: periodId, notes: m.$('#notes').value, scores };
      try { form.evaluation ? await S.patch('/app/evaluations/' + form.evaluation.id, payload) : await S.post('/app/evaluations', payload); S.toast('تم حفظ التقييم', 'ok'); m.close(); done && done(); }
      catch (er) { S.toast(er.message, 'bad'); S.btnBusy(e.currentTarget, false); }
    };
  }

  S.page('evaluations', {
    perm: 'hr', title: 'التقييمات',
    async render(el, params) {
      const lk = await S.L(['employees', 'eval_periods', 'eval_criteria']);
      const defPeriod = lk.eval_periods.find((p) => p.status === 'open') || lk.eval_periods[0] || {};
      const st = { period_id: params.period_id || defPeriod.id || '', q: '', page: 1 };
      el.innerHTML = `${S.head('evaluations')}
        ${!lk.eval_criteria.length ? `<div class="card pad mb16 row wrap" style="background:var(--warn-bg)">${ic('alert')}<div class="grow"><b>لا توجد معايير تقييم</b><div class="sm t2">عرّف <a class="acc-t" href="#/evaluation-criteria">معايير التقييم</a> و<a class="acc-t" href="#/evaluation-periods">فتراته</a> أولاً.</div></div></div>` : ''}
        <div class="toolbar"><button class="btn danger" id="add">${ic('plus')} تقييم موظف</button><label class="fld" style="flex-direction:row;align-items:center;gap:8px"><span>الفترة</span><select class="inp" id="per" style="width:240px">${lk.eval_periods.map((p) => `<option value="${p.id}" ${String(p.id) === String(st.period_id) ? 'selected' : ''}>${esc(p.name)}${p.status === 'closed' ? ' (مغلقة)' : ''}</option>`).join('')}</select></label><div class="search" style="min-width:220px">${ic('search')}<input class="inp" id="q" placeholder="بحث باسم الموظف..."></div><div class="sp"></div><button class="btn outline-ok" id="ex">${ic('download')} تصدير</button></div>
        <div id="list">${S.spinner}</div>`;
      const $ = (s) => el.querySelector(s);
      let rows = [];
      const load = async () => {
        $('#list').innerHTML = S.spinner;
        const d = await S.get('/app/evaluations', { period_id: st.period_id, q: st.q, per_page: 100 });
        rows = d.data;
        $('#list').innerHTML = rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th class="s">الموظف</th><th>الفترة</th><th>التاريخ</th><th>النتيجة</th><th>التقدير</th><th>المقيّم</th><th>الإجراءات</th></tr></thead><tbody>
          ${rows.map((r, i) => { const g = gradeOf(+r.total_score); return `<tr><td class="muted">${i + 1}</td><td class="s b">${esc(r.employee?.name)}<div class="muted xs num">${esc(r.employee?.number || '')}</div></td><td>${esc(r.period?.name || '')}</td><td class="num">${S.d(r.date)}</td><td class="num b" style="color:${g.color}">${S.fmtN(r.total_score, 1)}%</td><td>${gBadge(g)}</td><td>${esc(r.evaluator?.name || '—')}</td><td><div class="acts"><button class="ibtn v" data-v="${i}" title="عرض">${ic('eye')}</button><button class="ibtn e" data-e="${i}" title="تعديل">${ic('edit')}</button><button class="ibtn d" data-d="${r.id}" title="حذف">${ic('trash')}</button></div></td></tr>`; }).join('')}
          </tbody></table></div>` : S.emptyHtml('لا توجد تقييمات في هذه الفترة', 'اضغط «تقييم موظف» للبدء', 'star');
        $('#list').querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => viewEval(rows[+b.dataset.v].id)));
        $('#list').querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => { const r = rows[+b.dataset.e]; evalForm(lk, r.employee_id, r.period_id, load); }));
        $('#list').querySelectorAll('[data-d]').forEach((b) => (b.onclick = async () => { if (await S.confirm('حذف هذا التقييم؟', 'حذف')) { await S.del('/app/evaluations/' + b.dataset.d); load(); } }));
      };
      async function viewEval(id) {
        const m = S.modal({ title: 'تفاصيل التقييم', size: 'wide', body: S.spinner });
        const e = await S.get('/app/evaluations/' + id);
        const scByC = {}; e.scores.forEach((s) => (scByC[s.criterion_id] = s));
        m.body.innerHTML = `<div class="profile-h"><span class="avatar">${esc(S.initials(e.employee?.name))}</span><div class="grow"><h3>${esc(e.employee?.name)}</h3><div class="muted">${esc(e.period?.name || '')} · ${S.d(e.date)}</div></div><div style="text-align:center"><div class="v" style="font-family:var(--head);font-size:24px;font-weight:700;color:${e.grade_info.color}">${S.fmtN(e.total_score, 1)}%</div>${gBadge(e.grade_info)}</div></div>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="s">المعيار</th><th>الوزن</th><th>الدرجة</th><th>النسبة</th><th class="s">ملاحظة</th></tr></thead><tbody>
          ${e.criteria.map((c) => { const sc = scByC[c.id]; const pct = sc ? (sc.score / c.max_score) * 100 : null; return `<tr><td class="s b">${esc(c.name)}</td><td class="num">${S.fmtN(c.weight, 0)}%</td><td class="num">${sc ? S.fmtN(sc.score, 1) + ' / ' + S.fmtN(c.max_score, 0) : '—'}</td><td class="num">${pct != null ? S.fmtN(pct, 0) + '%' : '—'}</td><td class="s muted">${esc(sc?.note || '')}</td></tr>`; }).join('')}
          </tbody></table></div>${e.notes ? `<p class="t2 mt16"><b>ملاحظات:</b> ${esc(e.notes)}</p>` : ''}`;
      }
      $('#add').onclick = () => {
        if (!lk.eval_criteria.length) return S.toast('عرّف معايير التقييم أولاً', 'bad');
        S.formModal({ title: 'تقييم موظف', fields: [{ k: 'employee_id', l: 'الموظف', t: 'select', req: true, opts: empOpts(lk) }, { k: 'period_id', l: 'فترة التقييم', t: 'select', req: true, opts: lk.eval_periods.filter((p) => p.status === 'open').map((p) => [p.id, p.name]) }], saveText: 'متابعة', onSave: async (v) => { evalForm(lk, v.employee_id, v.period_id, load); } });
      };
      $('#per').onchange = (e) => { st.period_id = e.target.value; load(); };
      $('#q').oninput = S.debounce((e) => { st.q = e.target.value; load(); }, 350);
      $('#ex').onclick = () => S.exportXlsx('التقييمات', [{ l: 'الموظف', v: (r) => r.employee?.name }, { l: 'الفترة', v: (r) => r.period?.name }, { l: 'التاريخ', v: (r) => S.d(r.date) }, { l: 'النتيجة', v: (r) => +r.total_score }, { l: 'التقدير', v: (r) => r.grade }], rows);
      await load();
    },
  });
})();
