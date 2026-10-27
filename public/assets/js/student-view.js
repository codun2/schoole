/* سكوول — shared "what a student sees" renderers. Used by the student portal (self) and the parent portal (per child)
   so both show exactly the same assignments / timetable / attendance / report card. Pure HTML builders, no fetching. */
(function () {
  const { esc, ic } = S;
  const ATYPE = { homework: ['واجب', 'l-info'], quiz: ['اختبار قصير', 'l-warn'], exam: ['اختبار', 'l-bad'] };
  const ATT = { present: ['حاضر', 'l-ok'], absent: ['غائب', 'l-bad'], late: ['متأخر', 'l-warn'], excused: ['بعذر', 'l-info'] };
  const stat = (cls, i, val, k) => `<div class="stat ${cls}"><div class="ic">${ic(i)}</div><div><div class="v num">${val}</div><div class="k">${k}</div></div></div>`;
  const aStatus = (a) => a.mark != null ? `<span class="bdg l-ok">مصحّح</span>` : a.submitted ? '<span class="bdg l-info">سُلّم — بانتظار التصحيح</span>' : a.overdue ? '<span class="bdg l-bad">متأخر — لم يُسلَّم</span>' : a.status === 'closed' ? '<span class="bdg l-mut">مغلق</span>' : '<span class="bdg l-warn">بانتظار التسليم</span>';

  S.sv = {
    ATYPE, ATT, stat, aStatus,
    assignments(list, o = {}) {
      if (!list || !list.length) return S.emptyHtml(o.emptyTitle || 'لا توجد واجبات أو اختبارات', o.emptySub || '', 'book');
      return `<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>النوع</th><th class="s">العنوان</th><th>المادة / المعلّم</th><th>الموعد</th><th>الدرجة</th><th>الحالة</th></tr></thead><tbody>${list.map((a) => `<tr${a.overdue ? ' style="background:var(--bad-bg)"' : ''}><td>${S.badge(ATYPE, a.type)}</td><td class="s"><b>${esc(a.title)}</b>${a.description ? `<div class="muted xs" style="white-space:pre-line">${esc(a.description)}</div>` : ''}${a.attachment ? `<div><a class="acc-t xs" target="_blank" href="${esc(a.attachment)}">${ic('file')} فتح المرفق</a></div>` : ''}${a.note ? `<div class="xs mt8" style="color:var(--accent)">ملاحظة المعلّم: ${esc(a.note)}</div>` : ''}</td><td class="sm">${esc(a.subject || '—')}<div class="muted xs">${esc(a.teacher || '')}</div></td><td class="num">${esc(a.due_date || '—')}${a.due_time ? `<div class="muted xs">${esc(a.due_time)}${a.duration_minutes ? ` · ${a.duration_minutes} د` : ''}</div>` : ''}</td><td class="num b">${a.mark != null ? S.fmtN(a.mark, 1) : '—'} <span class="muted xs">/ ${S.fmtN(a.max_mark, 1)}</span></td><td>${aStatus(a)}</td></tr>`).join('')}</tbody></table></div></div>`;
    },
    timetable(d) {
      if (!(d && d.entries && d.entries.length)) return S.emptyHtml('لا يوجد جدول لهذه الشعبة بعد', '', 'calendar');
      const byKey = {}; d.entries.forEach((e) => (byKey[e.day + '-' + e.period] = e));
      const days = d.days || [], hot = (dy) => dy === d.today;
      const cell = (dy, p) => { const e = byKey[dy + '-' + p]; const bg = hot(dy) ? ' style="background:var(--accent-soft)"' : ''; if (!e) return `<td${bg} class="muted">·</td>`; return `<td${bg}><b class="sm">${esc(e.subject || '—')}</b>${e.teacher ? `<div class="muted xs">${esc(e.teacher)}</div>` : ''}${e.room ? `<div class="muted xs">${esc(e.room)}</div>` : ''}</td>`; };
      return `<div class="card"><div class="tbl-wrap"><table class="tbl" style="text-align:center"><thead><tr><th>الحصة</th>${days.map((dy) => `<th${hot(dy) ? ' style="background:var(--accent-soft);color:var(--accent)"' : ''}>${esc(d.day_names[dy])}${hot(dy) ? ' <span class="xs">(اليوم)</span>' : ''}</th>`).join('')}</tr></thead><tbody>${Array.from({ length: d.periods }, (_, i) => i + 1).map((p) => `<tr><td class="num b">${p}</td>${days.map((dy) => cell(dy, p)).join('')}</tr>`).join('')}</tbody></table></div></div>`;
    },
    attendance(a) {
      const t = (a && a.totals) || {};
      return `<div class="grid g4 mb16">${stat('c-green', 'check', S.num(t.present || 0), 'حضور')}${stat('c-red', 'x', S.num(t.absent || 0), 'غياب')}${stat('c-amber', 'clock', S.num(t.late || 0), 'تأخير')}${stat('c-blue', 'calCheck', t.rate != null ? S.fmtN(t.rate, 1) + '%' : '—', 'نسبة الحضور')}</div>
        ${(a && a.rows && a.rows.length) ? `<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>التاريخ</th><th>الحالة</th><th class="s">ملاحظة</th></tr></thead><tbody>${a.rows.map((r) => `<tr><td class="num">${S.d(r.date)}</td><td>${S.badge(ATT, r.status)}</td><td class="s muted sm">${esc(r.note || '—')}</td></tr>`).join('')}</tbody></table></div></div>` : S.emptyHtml('لا يوجد سجل حضور في هذه الفترة', '', 'calCheck')}`;
    },
    reportCard(r) {
      if (!r || !r.rows || !r.rows.some((x) => x.percent != null)) return S.emptyHtml('لا توجد درجات مرصودة بعد', '', 'book');
      const ov = r.overall || {}, res = r.result || {};
      return `<div class="card"><div class="hd"><h3>${ic('book')} النتيجة الأكاديمية${r.year ? ` <span class="muted sm">· ${esc(r.year.name)}</span>` : ''}</h3><span class="grow"></span>${ov.percent != null ? `<span class="bdg" style="background:${ov.grade.color}22;color:${ov.grade.color}">${S.fmtN(ov.percent, 1)}% — ${esc(ov.grade.remark)}</span>` : ''}${res.status && res.status !== '—' ? ` <span class="bdg ${res.pass ? 'l-ok' : 'l-bad'}">${esc(res.status)}</span>` : ''}</div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="s">المادة</th>${r.terms.map((t) => `<th>${esc(t.name)}</th>`).join('')}<th>النتيجة</th><th>التقدير</th></tr></thead><tbody>${r.rows.map((row) => `<tr><td class="s b">${esc(row.subject.name_ar)}</td>${r.terms.map((t) => `<td class="num">${row.term_marks[t.id] != null ? S.fmtN(row.term_marks[t.id], 1) : '—'}</td>`).join('')}<td class="num b">${row.percent != null ? S.fmtN(row.percent, 1) + '%' : '—'}</td><td><span class="bdg" style="background:${row.grade.color}22;color:${row.grade.color}">${row.grade.letter}</span></td></tr>`).join('')}</tbody></table></div>${r.rank && r.rank.position ? `<div class="bd muted sm">الترتيب على الشعبة: ${r.rank.position} من ${r.rank.of}</div>` : ''}</div>`;
    },
  };
})();
