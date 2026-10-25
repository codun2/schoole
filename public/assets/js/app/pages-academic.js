/* سكوول — academics: subjects, exam terms, and the grades page (mark entry + class results + report cards). */
(function () {
  'use strict';
  const { esc, ic, cell } = S;
  const gradeOpts = (lk) => (lk.grades || []).map((g) => [g.id, g.name_ar]);
  const sectionOpts = (lk) => (lk.sections || []).map((s) => [s.id, (s.grade ? s.grade.name_ar + ' / ' : '') + s.name]);
  const gBadge = (g) => `<span class="bdg" style="background:${g.color}22;color:${g.color}">${g.letter} — ${esc(g.remark)}</span>`;

  // ---------------------------------------------------------------- subjects
  const subjectFields = (lk) => [
    { t: 'sec', l: 'بيانات المادة' },
    { k: 'name_ar', l: 'اسم المادة بالعربية', req: true, full: true }, { k: 'name_en', l: 'الاسم بالإنجليزية', dir: 'ltr' }, { k: 'code', l: 'رمز المادة', dir: 'ltr', ph: 'ARA, MATH...' },
    { k: 'grade_id', l: 'الصف المطبّق عليه', t: 'select', blank: 'جميع الصفوف', opts: gradeOpts(lk), help: 'اتركه «جميع الصفوف» إن كانت المادة عامة لكل الصفوف' },
    { t: 'sec', l: 'الدرجات والترتيب' },
    { k: 'max_mark', l: 'الدرجة العظمى', t: 'number', min: 1, def: 100 }, { k: 'pass_mark', l: 'درجة النجاح', t: 'number', min: 0, def: 50 }, { k: 'sort', l: 'ترتيب العرض', t: 'number', min: 0 },
  ];
  S.page('subjects', S.crud({
    title: 'المواد الدراسية', singular: 'مادة', api: '/app/subjects', perm: 'school', year: true, icon: 'book', lookups: ['grades'], invalidate: ['subjects'], editPage: 'subject-form',
    search: 'بحث باسم المادة أو الرمز...',
    filters: [{ k: 'grade_id', l: 'الصف', opts: gradeOpts }],
    columns: [
      { l: 'المادة', s: true, v: (r) => `<b>${esc(r.name_ar)}</b>${r.name_en ? ` <span class="muted en">${esc(r.name_en)}</span>` : ''}` },
      { l: 'الرمز', v: (r) => cell.num(r.code || '—') }, { l: 'الصف', v: (r) => esc(r.grade?.name_ar || 'جميع الصفوف') },
      { l: 'الدرجة العظمى', v: (r) => cell.num(S.fmtN(r.max_mark, 0)) }, { l: 'درجة النجاح', v: (r) => cell.num(S.fmtN(r.pass_mark, 0)) },
    ],
  }));
  S.page('subject-form', S.formPage({
    api: '/app/subjects', title: 'المواد الدراسية', singular: 'مادة', perm: 'school', year: true, backTo: 'subjects', lookups: ['grades'], invalidate: ['subjects'],
    fields: subjectFields, newDefaults: () => ({ max_mark: 100, pass_mark: 50 }),
    context: () => `<div class="card pad"><p class="muted sm">${ic('book')} عرّف المادة ودرجتها العظمى ودرجة النجاح. تُستخدم هذه المادة في رصد الدرجات وبطاقات النتائج. يمكنك تخصيصها لصفّ معيّن أو جعلها عامة لكل الصفوف.</p></div>`,
  }));

  // ---------------------------------------------------------------- exam terms
  S.page('exam-terms', S.crud({
    title: 'الفصول والاختبارات', singular: 'فصل دراسي', api: '/app/exam-terms', perm: 'school', year: true, icon: 'clipboard', invalidate: ['exam_terms'], search: false,
    intro: '<p class="t2 mb16">الفصول/الفترات التي تُرصد فيها الدرجات. «الوزن» هو نسبة مساهمة الفصل في النتيجة النهائية (مجموع الأوزان يُفضّل أن يساوي 100%).</p>',
    columns: [{ l: 'الفصل', s: true, v: (r) => `<b>${esc(r.name)}</b>` }, { l: 'الوزن في النتيجة', v: (r) => `<span class="num">${S.fmtN(r.weight, 0)}%</span>` }, { l: 'الترتيب', v: (r) => cell.num(r.sort) }, { l: 'الحالة', v: (r) => (r.is_locked ? '<span class="bdg l-mut">مقفل</span>' : '<span class="bdg l-ok">مفتوح للرصد</span>') }],
    fields: () => [{ k: 'name', l: 'اسم الفصل/الفترة', req: true, ph: 'الفصل الدراسي الأول' }, { k: 'weight', l: 'الوزن في النتيجة النهائية %', t: 'number', min: 0, max: 100, def: 40 }, { k: 'sort', l: 'الترتيب', t: 'number', min: 0 }, { k: 'is_locked', l: 'إقفال الرصد (منع التعديل)', t: 'check' }],
    foot: (rows) => `<tr><td class="s">مجموع الأوزان</td><td class="num ${Math.round(rows.reduce((a, r) => a + +r.weight, 0)) === 100 ? 'ok-t' : 'warn-t'} b">${S.fmtN(rows.reduce((a, r) => a + +r.weight, 0), 0)}%</td><td colspan="2"></td></tr>`,
  }));

  // ---------------------------------------------------------------- report card (shared)
  S.reportCard = async function (studentId) {
    const m = S.modal({ title: 'كشف الدرجات', size: 'xwide', body: S.spinner, foot: '<button class="btn ghost" data-close>إغلاق</button><button class="btn" id="pr">' + ic('printer') + ' طباعة الكشف</button>' });
    let d;
    try { d = await S.get('/app/grades/report-card/' + studentId); } catch (e) { m.body.innerHTML = S.emptyHtml(e.message); return; }
    const s = d.student, ov = d.overall;
    const termTotal = d.terms.reduce((a, t) => a + +t.weight, 0) || 100;
    m.$('h3').innerHTML = `كشف درجات — ${esc(s.name)}`;
    const body = `
      <div class="profile-h"><span class="avatar">${esc(S.initials(s.name))}</span><div class="grow"><h3>${esc(s.name)}</h3><div class="muted">${esc((s.grade?.name_ar || '') + ' / ' + (s.section?.name || ''))} · <span class="num">${esc(s.student_no || '')}</span></div></div>
        <div style="text-align:center"><div class="v" style="font-family:var(--head);font-size:26px;font-weight:700;color:${ov.grade.color}">${ov.percent != null ? S.fmtN(ov.percent, 1) + '%' : '—'}</div>${gBadge(ov.grade)}${d.rank && d.rank.position ? `<div class="muted sm mt8">الترتيب ${d.rank.position} من ${d.rank.of}</div>` : ''}</div></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="s">المادة</th>${d.terms.map((t) => `<th>${esc(t.name)}<div class="muted xs">وزن ${S.fmtN(t.weight, 0)}%</div></th>`).join('')}<th>النتيجة %</th><th>التقدير</th></tr></thead><tbody>
        ${d.rows.map((r) => `<tr><td class="s b">${esc(r.subject.name_ar)}<div class="muted xs">من ${S.fmtN(r.subject.max_mark, 0)}</div></td>${d.terms.map((t) => { const mk = r.term_marks[t.id]; return `<td class="num ${mk != null && mk < +r.subject.max_mark * 0.5 ? 'bad-t' : ''}">${mk != null ? S.fmtN(mk, 1) : '—'}</td>`; }).join('')}<td class="num b">${r.percent != null ? S.fmtN(r.percent, 1) : '—'}</td><td>${gBadge(r.grade)}</td></tr>`).join('')}
      </tbody><tfoot><tr><td class="s">المعدل العام</td><td colspan="${d.terms.length}"></td><td class="num b" style="color:${ov.grade.color}">${ov.percent != null ? S.fmtN(ov.percent, 1) + '%' : '—'}</td><td>${ov.grade.letter}</td></tr></tfoot></table></div>
      <p class="muted sm mt8">* النتيجة لكل مادة محسوبة بوزن كل فصل، على الفصول المرصودة فقط.</p>`;
    m.body.innerHTML = body;
    m.$('#pr').onclick = () => S.printReportCard(d);
  };

  // ---------------------------------------------------------------- marks page
  S.page('marks', {
    perm: 'school',
    async render(el, params) {
      const lk = await S.L(['years', 'sections', 'grades', 'subjects', 'exam_terms']);
      let tab = params.tab || 'entry';
      el.innerHTML = `${S.head('marks', { year: true })}
        ${!lk.subjects.length || !lk.exam_terms.length ? `<div class="card pad mb16 row wrap" style="background:var(--warn-bg)">${ic('alert')}<div class="grow"><b>لم تكتمل الإعدادات الأكاديمية</b><div class="sm t2">عرّف <a class="acc-t" href="#/subjects">المواد</a> و<a class="acc-t" href="#/exam-terms">الفصول</a> أولاً.</div></div></div>` : ''}
        <div class="tabs"><button data-t="entry">رصد الدرجات</button><button data-t="results">نتائج الفصل</button><button data-t="cards">كشوف الدرجات</button></div><div id="body"></div>`;
      S.bindYear(el);
      const body = el.querySelector('#body');
      const go = () => { el.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab)); ({ entry, results, cards })[tab](); };
      el.querySelector('.tabs').onclick = (e) => { const b = e.target.closest('button'); if (b) { tab = b.dataset.t; go(); } };

      function subjectsForSection(secId) {
        const sec = lk.sections.find((s) => String(s.id) === String(secId));
        const gid = sec && sec.grade_id;
        return lk.subjects.filter((su) => !su.grade_id || su.grade_id === gid);
      }

      // ---- entry
      function entry() {
        body.innerHTML = `<div class="filters">
          <label class="fld"><span>الشعبة</span><select class="inp" id="sec">${sectionOpts(lk).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label>
          <label class="fld"><span>المادة</span><select class="inp" id="subj"></select></label>
          <label class="fld"><span>الفصل الدراسي</span><select class="inp" id="term">${lk.exam_terms.map((t) => `<option value="${t.id}" ${t.is_locked ? 'disabled' : ''}>${esc(t.name)}${t.is_locked ? ' (مقفل)' : ''}</option>`).join('')}</select></label>
          <button class="btn" id="ld">${ic('search')} عرض</button></div><div id="sheet"></div>`;
        if (!lk.sections.length || !lk.subjects.length || !lk.exam_terms.length) { body.querySelector('#sheet').innerHTML = S.emptyHtml('أكمل إعداد الشعب والمواد والفصول أولاً'); return; }
        const fillSubjects = () => { const subs = subjectsForSection(body.querySelector('#sec').value); body.querySelector('#subj').innerHTML = subs.map((s) => `<option value="${s.id}">${esc(s.name_ar)}</option>`).join('') || '<option value="">لا مواد لهذا الصف</option>'; };
        fillSubjects();
        const load = async () => {
          const sh = body.querySelector('#sheet'); const subjId = body.querySelector('#subj').value; if (!subjId) { sh.innerHTML = S.emptyHtml('لا توجد مواد لهذا الصف'); return; }
          sh.innerHTML = S.spinner;
          let d;
          try { d = await S.get('/app/grades/sheet', { section_id: body.querySelector('#sec').value, subject_id: subjId, exam_term_id: body.querySelector('#term').value }); } catch (e) { sh.innerHTML = S.emptyHtml(e.message); return; }
          if (!d.students.length) { sh.innerHTML = S.emptyHtml('لا يوجد طلاب نشطون في هذه الشعبة'); return; }
          const max = +d.subject.max_mark, pass = +d.subject.pass_mark, st = d.students.map((x) => ({ ...x }));
          const locked = d.term.is_locked;
          const draw = () => {
            const done = st.filter((x) => x.mark != null).length;
            sh.innerHTML = `<div class="toolbar"><span class="bdg ${d.saved ? 'l-ok' : 'l-warn'}">${d.saved ? 'مرصود — يمكن التعديل' : 'لم يُرصد بعد'}</span><span class="bdg l-info">${esc(d.subject.name_ar)} · من ${S.fmtN(max, 0)} · نجاح ${S.fmtN(pass, 0)}</span><span class="total-l">${done}/${st.length} مرصود</span><div class="sp"></div>${locked ? '<span class="bdg mut">الفصل مقفل</span>' : `<button class="btn success" id="save">${ic('check')} حفظ الدرجات</button>`}</div>
              <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th class="s">الطالب</th><th>الرقم</th><th style="width:140px">الدرجة (من ${S.fmtN(max, 0)})</th><th>التقدير</th><th>ملاحظة</th></tr></thead><tbody>
              ${st.map((x, i) => { const pct = x.mark != null ? (x.mark / max) * 100 : null; return `<tr><td class="muted">${i + 1}</td><td class="s b">${esc(x.name)}</td><td class="num muted">${esc(x.student_no || '')}</td><td><input class="inp num" type="number" min="0" max="${max}" step="0.5" data-i="${i}" value="${x.mark != null ? x.mark : ''}" dir="ltr" ${locked ? 'disabled' : ''} style="height:34px;text-align:center"></td><td data-g="${i}">${pct != null ? gBadge(gradeOf(pct)) : '—'}</td><td><input class="inp" data-n="${i}" value="${esc(x.note || '')}" placeholder="—" ${locked ? 'disabled' : ''} style="height:34px"></td></tr>`; }).join('')}
              </tbody></table></div>`;
            sh.querySelectorAll('input[data-i]').forEach((inp) => (inp.oninput = () => { const i = +inp.dataset.i; let v = inp.value === '' ? null : Math.min(max, Math.max(0, +inp.value)); st[i].mark = v; sh.querySelector(`[data-g="${i}"]`).innerHTML = v != null ? gBadge(gradeOf((v / max) * 100)) : '—'; }));
            sh.querySelectorAll('input[data-n]').forEach((inp) => (inp.oninput = () => (st[+inp.dataset.n].note = inp.value)));
            const sv = sh.querySelector('#save'); if (sv) sv.onclick = async (e) => { const _btn = e.currentTarget; S.btnBusy(_btn, true); try { await S.post('/app/grades/sheet', { section_id: body.querySelector('#sec').value, subject_id: subjId, exam_term_id: body.querySelector('#term').value, marks: st.map((x) => ({ student_id: x.id, mark: x.mark, note: x.note })) }); S.toast('تم حفظ الدرجات', 'ok'); d.saved = true; draw(); } catch (er) { S.toast(er.message, 'bad'); S.btnBusy(_btn, false); } };
          };
          draw();
        };
        body.querySelector('#sec').onchange = () => { fillSubjects(); load(); };
        body.querySelector('#subj').onchange = load;
        body.querySelector('#term').onchange = load;
        body.querySelector('#ld').onclick = load;
        load();
      }
      const SCALE = [[90, 'A', 'ممتاز', '#14a06b'], [80, 'B', 'جيد جداً', '#2f7ae5'], [65, 'C', 'جيد', '#0f9d9a'], [50, 'D', 'مقبول', '#d98a0b'], [0, 'F', 'راسب', '#e0384c']];
      function gradeOf(pct) { const r = SCALE.find(([m]) => pct >= m) || SCALE[SCALE.length - 1]; return { letter: r[1], remark: r[2], color: r[3] }; }

      // ---- results
      function results() {
        body.innerHTML = `<div class="filters"><label class="fld"><span>الشعبة</span><select class="inp" id="sec">${sectionOpts(lk).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label><button class="btn" id="ld">${ic('search')} عرض النتائج</button><button class="btn outline-ok" id="ex">${ic('download')} تصدير</button></div><div id="res"></div>`;
        let last;
        const load = async () => {
          const r = body.querySelector('#res'); r.innerHTML = S.spinner;
          last = await S.get('/app/grades/class-results', { section_id: body.querySelector('#sec').value });
          const su = last.summary;
          r.innerHTML = `<div class="grid g5 mb16">${S.ui.stat('c-blue', 'users', S.num(su.count), 'عدد المرصودين')}${S.ui.stat('c-violet', 'chart', su.average != null ? S.fmtN(su.average, 1) + '%' : '—', 'متوسط الفصل')}${S.ui.stat('c-green', 'trendUp', su.highest != null ? S.fmtN(su.highest, 1) + '%' : '—', 'أعلى معدل')}${S.ui.stat('c-amber', 'trendDown', su.lowest != null ? S.fmtN(su.lowest, 1) + '%' : '—', 'أدنى معدل')}${S.ui.stat(su.failed ? 'c-red' : 'c-green', 'smile', su.passed + ' / ' + (su.passed + su.failed), 'ناجح / الكل')}</div>
            <div class="tbl-wrap"><table class="tbl"><thead><tr><th>الترتيب</th><th class="s">الطالب</th><th>الرقم</th><th>المواد المرصودة</th><th>مواد الرسوب</th><th>المعدل</th><th>التقدير</th><th></th></tr></thead><tbody>
            ${last.rows.map((x) => `<tr><td class="b">${x.rank ? (x.rank <= 3 ? ['🥇', '🥈', '🥉'][x.rank - 1] + ' ' : '') + x.rank : '—'}</td><td class="s b">${esc(x.name)}</td><td class="num muted">${esc(x.student_no || '')}</td><td>${x.subjects_counted}</td><td class="num ${x.failed ? 'bad-t b' : ''}">${x.failed || '—'}</td><td class="num b">${x.percent != null ? S.fmtN(x.percent, 1) + '%' : '—'}</td><td>${gBadge(x.grade)}</td><td><button class="ibtn v" data-c="${x.student_id}" title="كشف الدرجات">${ic('fileText')}</button></td></tr>`).join('')}
            </tbody></table></div>`;
          r.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => S.reportCard(+b.dataset.c)));
        };
        body.querySelector('#ld').onclick = load; body.querySelector('#sec').onchange = load;
        body.querySelector('#ex').onclick = () => last && S.exportXlsx('نتائج-الفصل', [{ l: 'الترتيب', v: (r) => r.rank }, { l: 'الطالب', v: (r) => r.name }, { l: 'الرقم', v: (r) => r.student_no }, { l: 'المواد المرصودة', v: (r) => r.subjects_counted }, { l: 'مواد الرسوب', v: (r) => r.failed }, { l: 'المعدل', v: (r) => r.percent }, { l: 'التقدير', v: (r) => r.grade.letter }], last.rows);
        load();
      }

      // ---- report cards
      function cards() {
        body.innerHTML = `<div class="filters"><label class="fld"><span>الصف</span><select class="inp" id="g"><option value="">الكل</option>${gradeOpts(lk).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label><label class="fld"><span>الشعبة</span><select class="inp" id="sec"><option value="">الكل</option>${sectionOpts(lk).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label><label class="fld q"><span>بحث عن طالب</span><div class="search">${ic('search')}<input class="inp" id="q" placeholder="اسم الطالب..."></div></label></div><div id="list">${S.spinner}</div>`;
        const load = async () => {
          const d = await S.get('/app/students', { year: S.yearId(), status: 'active', grade_id: body.querySelector('#g').value, section_id: body.querySelector('#sec').value, q: body.querySelector('#q').value, per_page: 60 });
          body.querySelector('#list').innerHTML = d.data.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th class="s">الطالب</th><th>الصف / الشعبة</th><th>الرقم</th><th>كشف الدرجات</th></tr></thead><tbody>${d.data.map((s, i) => `<tr><td class="muted">${i + 1}</td><td class="s b">${esc(s.name)}</td><td>${esc((s.grade?.name_ar || '') + ' / ' + (s.section?.name || ''))}</td><td class="num muted">${esc(s.student_no || '')}</td><td><button class="btn soft xs" data-c="${s.id}">${ic('fileText')} عرض الكشف</button></td></tr>`).join('')}</tbody></table></div>` : S.emptyHtml('لا يوجد طلاب');
          body.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => S.reportCard(+b.dataset.c)));
        };
        body.querySelector('#g').onchange = load; body.querySelector('#sec').onchange = load;
        body.querySelector('#q').oninput = S.debounce(load, 350);
        load();
      }
      go();
    },
  });
})();
