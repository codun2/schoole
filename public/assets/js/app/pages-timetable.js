/* سكوول — class timetable: per-section grid editor, teacher weekly schedule, teaching load, print. */
(function () {
  'use strict';
  const { esc, ic } = S;
  const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const sectionOpts = (lk) => (lk.sections || []).map((s) => [s.id, (s.grade ? S.enName(s.grade) + ' / ' : '') + S.enName(s)]);

  S.page('timetable', {
    perm: 'school',
    async render(el, params) {
      const lk = await S.L(['years', 'sections', 'grades', 'subjects', 'teachers']);
      let cfg;
      try { cfg = await S.get('/app/timetable/config'); }
      catch (e) { if (!(S.local && S.local.isOfflineError(e))) throw e; cfg = { days: [0, 1, 2, 3, 4], periods: 7 }; } // offline without a cached config: sensible default
      let tab = params.tab || 'section';
      el.innerHTML = `${S.head('timetable', { year: true })}
        <div class="tabs"><button data-t="section">جدول الشعب</button><button data-t="teacher">جدول المعلم</button><button data-t="load">نصاب المعلمين</button><button data-t="settings">إعدادات الجدول</button></div><div id="body"></div>`;
      S.bindYear(el);
      const body = el.querySelector('#body');
      const go = () => { el.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab)); ({ section: secTab, teacher: teacherTab, load: loadTab, settings: settingsTab })[tab](); };
      el.querySelector('.tabs').onclick = (e) => { const b = e.target.closest('button'); if (b) { tab = b.dataset.t; go(); } };
      const subjColor = (id) => S.PALETTE[(id || 0) % S.PALETTE.length];

      // ---- section grid editor
      function secTab() {
        if (!lk.sections.length) { body.innerHTML = S.emptyHtml('لا توجد شعب', 'أنشئ الصفوف والشعب أولاً', 'columns', `<a class="btn mt16" href="#/sections?new=1">${S.ic('plus')} إنشاء شعبة</a>`); return; }
        body.innerHTML = `<div class="filters"><label class="fld"><span>الشعبة</span><select class="inp" id="sec">${sectionOpts(lk).map(([v, l]) => `<option value="${v}" ${String(v) === String(params.section_id) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label><button class="btn" id="ld">${ic('search')} عرض الجدول</button></div><div id="grid"></div>`;
        const load = async () => {
          const wrap = body.querySelector('#grid'); wrap.innerHTML = S.spinner;
          const secId = body.querySelector('#sec').value;
          let d;
          try {
            if (navigator.onLine === false && S.local && S.local.timetableSection) d = await S.local.timetableSection(secId, cfg);
            else { d = await S.get('/app/timetable/section', { section_id: secId }); if (d._fromCache && S.local && S.local.timetableSection) d = await S.local.timetableSection(secId, cfg); }
          } catch (e) {
            if (!(S.local && S.local.timetableSection && S.local.isOfflineError(e))) { wrap.innerHTML = S.emptyHtml('تعذّر تحميل الجدول', e.message, 'alert'); return; }
            d = await S.local.timetableSection(secId, cfg);
          }
          const grid = { ...d.entries };
          const subjOpts = lk.subjects.filter((su) => !(su.grade_ids || []).length || su.grade_ids.map(Number).includes(Number(d.section.grade_id)));
          const draw = () => {
            wrap.innerHTML = `<div class="toolbar"><div class="total-l">${esc([S.enName(d.section.grade), S.enName(d.section)].filter(Boolean).join(' / '))}</div><div class="sp"></div><button class="btn ghost" id="print">${ic('printer')} طباعة</button><button class="btn success" id="save">${ic('check')} حفظ الجدول</button></div>
              <div class="tbl-wrap"><div class="tbl-scroll"><table class="tbl tt"><thead><tr><th>اليوم \\ الحصة</th>${Array.from({ length: d.periods }, (_, i) => `<th>${S.isEn() ? 'Period' : 'الحصة'} ${i + 1}</th>`).join('')}</tr></thead><tbody>
              ${d.days.map((day) => `<tr><td class="s b" style="background:var(--soft)">${DAYS[day]}</td>${Array.from({ length: d.periods }, (_, pi) => { const key = day + '-' + (pi + 1); const c = grid[key] || {}; return `<td class="ttcell" data-k="${key}" style="${c.subject_id ? `background:${subjColor(c.subject_id)}14` : ''}">${c.subject_id || c.teacher_id ? `<div class="b sm" style="color:${subjColor(c.subject_id)}">${esc(c.subject || '—')}</div><div class="muted xs">${esc(S.enT(c.teacher, c.teacher_en) || '')}</div>` : `<span class="muted xs">+</span>`}</td>`; }).join('')}</tr>`).join('')}
              </tbody></table></div></div><p class="muted sm mt8">اضغط أي خلية لإسناد مادة ومعلم. يتحقق النظام من تعارض المعلمين عند الحفظ.</p>`;
            wrap.querySelectorAll('.ttcell').forEach((td) => (td.onclick = () => editCell(td.dataset.k)));
            wrap.querySelector('#save').onclick = save;
            wrap.querySelector('#print').onclick = () => printSection(d, grid);
          };
          const editCell = (key) => {
            const c = grid[key] || {};
            const [day, period] = key.split('-');
            S.formModal({ title: `${DAYS[day]} — الحصة ${period}`, size: 'narrow',
              fields: [
                { k: 'subject_id', l: 'المادة', t: 'select', opts: subjOpts.map((s) => [s.id, s.name_ar]) },
                { k: 'teacher_id', l: 'المعلم', t: 'select', opts: lk.teachers.map((t) => [t.id, S.enName(t)]) },
                { k: 'room', l: 'القاعة' },
              ], values: c, saveText: 'تعيين',
              foot: `<button class="btn ghost" data-close>إلغاء</button>${c.subject_id || c.teacher_id ? '<button class="btn danger" id="clr">تفريغ الخلية</button>' : ''}<button class="btn" data-save>تعيين</button>`,
              afterRender: (m) => { const clr = m.$('#clr'); if (clr) clr.onclick = () => { delete grid[key]; m.close(); draw(); }; },
              onSave: async (v) => { if (!v.subject_id && !v.teacher_id) { delete grid[key]; } else { grid[key] = { subject_id: v.subject_id, subject: (subjOpts.find((s) => String(s.id) === String(v.subject_id)) || {}).name_ar, teacher_id: v.teacher_id, teacher: lk.teachers.find((t) => String(t.id) === String(v.teacher_id))?.name, teacher_en: lk.teachers.find((t) => String(t.id) === String(v.teacher_id))?.name_en, room: v.room }; } draw(); },
            });
          };
          const save = async (e) => {
            const _btn = e.currentTarget; S.btnBusy(_btn, true);
            const entries = Object.entries(grid).map(([k, c]) => { const [day, period] = k.split('-'); return { day: +day, period: +period, subject_id: c.subject_id || null, teacher_id: c.teacher_id || null, room: c.room || null }; });
            try { const r = await S.post('/app/timetable/section', { section_id: body.querySelector('#sec').value, entries }); if (!(r && r._queued)) S.toast('تم حفظ الجدول', 'ok'); }
            catch (er) { S.toast(er.message, 'bad'); if (er.data && er.data.clashes) S.modal({ title: 'تعذّر الحفظ — تعارض', size: 'narrow', body: `<div class="bad-t b mb8">${esc(er.message)}</div><ul style="padding-inline-start:18px;line-height:2">${er.data.clashes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` }); }
            S.btnBusy(_btn, false);
          };
          draw();
        };
        body.querySelector('#ld').onclick = load; body.querySelector('#sec').onchange = load;
        load();
      }

      // ---- teacher schedule
      function teacherTab() {
        if (!lk.teachers.length) { body.innerHTML = S.emptyHtml('لا يوجد معلمون', 'أضف موظفين كأعضاء هيئة تدريسية', 'cap'); return; }
        body.innerHTML = `<div class="filters"><label class="fld"><span>المعلم</span><select class="inp" id="t">${lk.teachers.map((t) => `<option value="${t.id}">${esc(S.enName(t))}</option>`).join('')}</select></label></div><div id="g"></div>`;
        const load = async () => {
          const wrap = body.querySelector('#g'); wrap.innerHTML = S.spinner;
          const tid = body.querySelector('#t').value;
          let d;
          try {
            if (navigator.onLine === false && S.local && S.local.timetableTeacher) d = await S.local.timetableTeacher(tid, cfg);
            else { d = await S.get('/app/timetable/teacher/' + tid); if (d._fromCache && S.local && S.local.timetableTeacher) d = await S.local.timetableTeacher(tid, cfg); }
          } catch (e) {
            if (!(S.local && S.local.timetableTeacher && S.local.isOfflineError(e))) { wrap.innerHTML = S.emptyHtml('تعذّر تحميل الجدول', e.message, 'alert'); return; }
            d = await S.local.timetableTeacher(tid, cfg);
          }
          wrap.innerHTML = `<div class="toolbar"><span class="bdg l-info">${S.isEn() ? 'Weekly load: ' + d.load + ' lessons' : 'نصاب أسبوعي: ' + d.load + ' حصة'}</span><div class="sp"></div><button class="btn ghost" id="pr">${ic('printer')} طباعة</button></div>
            <div class="tbl-wrap"><div class="tbl-scroll"><table class="tbl tt"><thead><tr><th>اليوم \\ الحصة</th>${Array.from({ length: d.periods }, (_, i) => `<th>${S.isEn() ? 'Period' : 'الحصة'} ${i + 1}</th>`).join('')}</tr></thead><tbody>
            ${d.days.map((day) => `<tr><td class="s b" style="background:var(--soft)">${DAYS[day]}</td>${Array.from({ length: d.periods }, (_, pi) => { const c = d.entries[day + '-' + (pi + 1)]; return `<td>${c ? `<div class="b sm acc-t">${esc(c.subject || '')}</div><div class="muted xs">${esc(S.enT(c.section, c.section_en) || '')}${c.room ? ' · ' + esc(c.room) : ''}</div>` : '<span class="muted xs">—</span>'}</td>`; }).join('')}</tr>`).join('')}
            </tbody></table></div></div>`;
          wrap.querySelector('#pr').onclick = () => printTeacher(d);
        };
        body.querySelector('#t').onchange = load; load();
      }

      // ---- teaching load
      async function loadTab() {
        body.innerHTML = S.spinner;
        let d;
        try {
          if (navigator.onLine === false && S.local && S.local.timetableLoad) d = await S.local.timetableLoad();
          else { d = await S.get('/app/timetable/load'); if (d._fromCache && S.local && S.local.timetableLoad) d = await S.local.timetableLoad(); }
        } catch (e) {
          if (!(S.local && S.local.timetableLoad && S.local.isOfflineError(e))) { body.innerHTML = S.emptyHtml('تعذّر تحميل البيانات', e.message, 'alert'); return; }
          d = await S.local.timetableLoad();
        }
        body.innerHTML = `<div class="card"><div class="hd"><h3>${ic('chart')} نصاب المعلمين الأسبوعي</h3></div><div class="bd" id="bars"></div></div>`;
        S.chart.hbars(el.querySelector('#bars'), d.filter((t) => t.lessons).map((t, i) => ({ label: t.name, value: t.lessons, color: S.PALETTE[i % 10] })), (v) => v + ' حصة');
        if (!d.some((t) => t.lessons)) body.querySelector('#bars').innerHTML = S.emptyHtml('لم تُسنَد حصص للمعلمين بعد');
      }

      // ---- settings
      function settingsTab() {
        body.innerHTML = `<div class="card pad" style="max-width:560px"><h3 class="mb16">إعدادات الجدول الدراسي</h3>
          <div class="fld mb16"><span class="b mb8">أيام الدوام</span><div class="chips" id="days">${DAYS.map((d, i) => `<button class="chip ${cfg.days.includes(i) ? 'on' : ''}" data-d="${i}">${d}</button>`).join('')}</div></div>
          <label class="fld" style="max-width:200px"><span>عدد الحصص في اليوم</span><input class="inp" type="number" id="per" min="1" max="12" value="${cfg.periods}" dir="ltr"></label>
          <button class="btn mt16" id="sv">${ic('check')} حفظ الإعدادات</button></div>`;
        const sel = new Set(cfg.days);
        body.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => { const i = +b.dataset.d; sel.has(i) ? sel.delete(i) : sel.add(i); b.classList.toggle('on'); }));
        body.querySelector('#sv').onclick = async (e) => {
          if (!sel.size) return S.toast('اختر يوم دوام واحداً على الأقل', 'bad');
          const _btn = e.currentTarget; S.btnBusy(_btn, true);
          try { const r = await S.patch('/app/timetable/config', { days: [...sel].sort(), periods: +body.querySelector('#per').value }); cfg = r && r._queued ? { ...cfg, days: [...sel].sort(), periods: +body.querySelector('#per').value } : r; if (!(r && r._queued)) S.toast('تم الحفظ', 'ok'); } catch (er) { S.toast(er.message, 'bad'); }
          S.btnBusy(_btn, false);
        };
      }

      function printSection(d, grid) {
        S.print('جدول ' + d.section.name, `<h2>الجدول الأسبوعي — ${esc([S.enName(d.section.grade), S.enName(d.section)].filter(Boolean).join(' / '))}</h2>
          <table><thead><tr><th>اليوم \\ الحصة</th>${Array.from({ length: d.periods }, (_, i) => `<th>${i + 1}</th>`).join('')}</tr></thead><tbody>
          ${d.days.map((day) => `<tr><td><b>${DAYS[day]}</b></td>${Array.from({ length: d.periods }, (_, pi) => { const c = grid[day + '-' + (pi + 1)] || {}; return `<td>${c.subject ? esc(c.subject) + '<br><small>' + esc(c.teacher || '') + '</small>' : '—'}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`);
      }
      function printTeacher(d) {
        S.print('جدول المعلم ' + d.teacher.name, `<h2>الجدول الأسبوعي — ${esc(d.teacher.name)} (${d.load} حصة)</h2>
          <table><thead><tr><th>اليوم \\ الحصة</th>${Array.from({ length: d.periods }, (_, i) => `<th>${i + 1}</th>`).join('')}</tr></thead><tbody>
          ${d.days.map((day) => `<tr><td><b>${DAYS[day]}</b></td>${Array.from({ length: d.periods }, (_, pi) => { const c = d.entries[day + '-' + (pi + 1)]; return `<td>${c ? esc(c.subject || '') + '<br><small>' + esc(c.section || '') + '</small>' : '—'}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`);
      }
      go();
    },
  });
})();
