/* سكوول — resource engine: one config → list page with filters, table, pager, add/edit/view/delete, Excel export/import. */
(function () {
  'use strict';
  const { esc, ic } = S;

  /**
   * cfg:
   *  key, api ('/app/students'), title, singular, year (bool), perm, lookups:[...]
   *  columns: [{l, v(row, ctx) → html, s: start-aligned, w}]  (index # is automatic)
   *  search: placeholder | false, filters: [{k, l, opts: [[v,l]] | (lk)=>[[v,l]], t:'select'|'date'|'month'}]
   *  chips: {k, items:[[v,l]]} quick filter buttons
   *  fixed: {param:value} always sent
   *  fields: (lk, row) => [fieldSpec], formSize, formCols, toPayload(values, row) → body
   *  view: (row, ctx) → Promise|void  (custom detail) | viewFields: (row)=>[[k,v]]
   *  rowActions: [{ic, cls, t, show(row), run(row, ctx)}]
   *  canAdd / canEdit(row) / canDelete(row)  (default true)
   *  toolbar: [{l, ic, cls, run(ctx)}], exportCols: [{l, v}], importer: {map, template, endpoint}
   *  summary: (res) → html (above the table), rowClass(row)
   */
  S.crud = function (cfg) {
    return {
      title: cfg.title, perm: cfg.perm,
      async render(el, params, rc) {
        const keys = [...new Set([...(cfg.year ? ['years'] : []), ...(cfg.lookups || [])])];
        const lk = keys.length ? await S.L(keys) : {};
        const state = { page: 1, q: params.q || '', f: { ...(cfg.defaults || {}) }, sort: null };
        (cfg.filters || []).forEach((f) => { if (params[f.k]) state.f[f.k] = params[f.k]; });
        if (cfg.chips && params[cfg.chips.k] !== undefined) state.f[cfg.chips.k] = params[cfg.chips.k];
        (cfg.passParams || []).forEach((k) => { if (params[k]) state.f[k] = params[k]; });
        const ctx = { el, lk, state, cfg, reload: () => load(), params };

        const filtersHtml = (cfg.search !== false || (cfg.filters || []).length) ? `<div class="filters">
          ${cfg.search !== false ? `<label class="fld q"><span>بحث</span><div class="search">${ic('search')}<input class="inp" id="q" placeholder="${esc(cfg.search || 'بحث...')}" value="${esc(state.q)}"></div></label>` : ''}
          ${(cfg.filters || []).map((f) => {
            if (f.t === 'date' || f.t === 'month') return `<label class="fld"><span>${esc(f.l)}</span><input class="inp" type="${f.t}" data-filter="${f.k}" value="${esc(state.f[f.k] || '')}" dir="ltr"></label>`;
            const opts = typeof f.opts === 'function' ? f.opts(lk) : f.opts;
            return `<label class="fld"><span>${esc(f.l)}</span><select class="inp" data-filter="${f.k}"><option value="">${esc(f.all || 'الكل')}</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(state.f[f.k] ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
          }).join('')}
          <button class="btn" id="go">${ic('search')} بحث</button>
          ${cfg.exportCols ? `<button class="btn outline-ok" id="exp">${ic('download')} تصدير إكسل</button>` : ''}
        </div>` : '';

        el.innerHTML = `${S.head(rc.key, { year: cfg.year, title: cfg.title })}
          ${cfg.intro || ''}
          <div class="toolbar">
            ${cfg.canAdd === false ? '' : `<button class="btn" id="add">${ic(cfg.addIcon || 'plus')} إضافة ${esc(cfg.singular || '')}</button>`}
            ${cfg.importer ? `<button class="btn outline-ok" id="imp">${ic('upload')} استيراد من Excel</button>` : ''}
            ${(cfg.toolbar || []).map((b, i) => `<button class="btn ${b.cls || 'ghost'}" data-tb="${i}">${ic(b.ic || 'plus')} ${esc(b.l)}</button>`).join('')}
            ${cfg.chips ? `<div class="chips">${[['', 'الكل'], ...cfg.chips.items].map(([v, l]) => `<button class="chip ${String(state.f[cfg.chips.k] || '') === String(v) ? 'on' : ''}" data-chip="${esc(v)}">${esc(l)}</button>`).join('')}</div>` : ''}
            <div class="sp"></div><span class="total-l" id="total"></span>
          </div>
          ${filtersHtml}
          <div id="summary"></div>
          <div class="tbl-wrap"><div class="tbl-scroll" id="tbl">${S.spinner}</div><div class="pager hide" id="pager"></div></div>`;
        S.bindYear(el);

        const $ = (s) => el.querySelector(s);
        const query = (extra) => {
          const q = { page: state.page, q: state.q, year: cfg.year ? S.yearId() : undefined, ...(cfg.fixed || {}), ...state.f, ...(extra || {}) };
          if (state.sort) { q.sort = state.sort[0]; q.dir = state.sort[1]; }
          return q;
        };
        async function load() {
          $('#tbl').innerHTML = S.spinner;
          try {
            const res = await S.get(cfg.api, query());
            const rows = res.data || [];
            ctx.rows = rows; ctx.res = res;
            $('#total').textContent = 'الإجمالي: ' + S.num(res.total ?? rows.length);
            $('#summary').innerHTML = cfg.summary ? cfg.summary(res, ctx) : '';
            renderTable(rows, res);
            renderPager(res);
          } catch (e) {
            // server unreachable → serve the list from the offline mirror when this table is mirrored
            if (S.local && S.local.isOfflineError(e)) {
              try {
                const slug = cfg.api.replace(/^\/app\//, '');
                const tables = (await S.db.getMeta('tables')) || [];
                if (!tables.includes(slug)) throw e;
                const res = await S.local.query(slug, { q: state.q, f: { ...(cfg.fixed || {}), ...state.f }, year: cfg.year ? S.yearId() : undefined, page: state.page, sort: state.sort });
                const rows = res.data; ctx.rows = rows; ctx.res = res;
                $('#total').textContent = 'الإجمالي: ' + S.num(res.total);
                const lastSync = await S.db.getMeta('last_sync_at');
                $('#summary').innerHTML = `<div class="card pad mb16 row gap8" style="background:var(--warn-bg);border-color:transparent">${ic('alert')}<span class="sm"><b>بيانات محلية</b><span class="muted"> — تعرض النسخة المحفوظة على هذا الجهاز${lastSync ? ` (آخر مزامنة ${esc(S.ago(lastSync))})` : ''}</span></span></div>`;
                renderTable(rows, res); renderPager(res);
                return;
              } catch {}
            }
            $('#tbl').innerHTML = S.emptyHtml('تعذّر تحميل البيانات', e.message, 'alert');
          }
        }
        function renderTable(rows, res) {
          if (!rows.length) { $('#tbl').innerHTML = S.emptyHtml(cfg.emptyTitle || 'لا توجد بيانات', state.q ? 'لا نتائج مطابقة لبحثك' : cfg.emptySub || '', cfg.icon); return; }
          const off = ((res.current_page || 1) - 1) * (res.per_page || rows.length);
          const acts = (r) => {
            let h = '';
            if (cfg.view || cfg.viewFields) h += `<button class="ibtn v" data-act="view" title="عرض">${ic('eye')}</button>`;
            (cfg.rowActions || []).forEach((a, i) => { if (!a.show || a.show(r)) h += `<button class="ibtn ${a.cls || 'p'}" data-ra="${i}" title="${esc(a.t)}">${ic(a.ic)}</button>`; });
            if ((cfg.fields || cfg.editPage) && cfg.canEdit !== false && (!cfg.canEdit || cfg.canEdit(r))) h += `<button class="ibtn e" data-act="edit" title="تعديل">${ic('edit')}</button>`;
            if (cfg.canDelete !== false && (!cfg.canDelete || cfg.canDelete(r))) h += `<button class="ibtn d" data-act="del" title="حذف">${ic('trash')}</button>`;
            return h;
          };
          $('#tbl').innerHTML = `<table class="tbl"><thead><tr><th style="width:44px">#</th>${cfg.columns.map((c) => `<th class="${c.s ? 's' : ''}" ${c.w ? `style="width:${c.w}"` : ''}>${esc(c.l)}</th>`).join('')}${cfg.noActions ? '' : '<th>الإجراءات</th>'}</tr></thead>
            <tbody>${rows.map((r, i) => `<tr data-i="${i}" class="${cfg.rowClass ? cfg.rowClass(r) : ''}"><td class="muted">${off + i + 1}</td>${cfg.columns.map((c) => `<td class="${c.s ? 's' : ''}">${c.v(r, ctx) ?? '—'}</td>`).join('')}${cfg.noActions ? '' : `<td><div class="acts">${acts(r)}</div></td>`}</tr>`).join('')}</tbody>
            ${cfg.foot ? `<tfoot>${cfg.foot(rows, res, ctx)}</tfoot>` : ''}</table>`;
          $('#tbl').querySelectorAll('tbody tr').forEach((tr) => {
            const r = rows[+tr.dataset.i];
            tr.querySelectorAll('[data-act]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); ({ view: () => openView(r), edit: () => openForm(r), del: () => del(r) })[b.dataset.act](); }));
            tr.querySelectorAll('[data-ra]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); cfg.rowActions[+b.dataset.ra].run(r, ctx); }));
            tr.querySelectorAll('[data-open]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); openView(r); }));
          });
        }
        function renderPager(res) {
          const p = $('#pager');
          if (!res.last_page || res.last_page <= 1) { p.classList.add('hide'); return; }
          p.classList.remove('hide');
          const cur = res.current_page, last = res.last_page;
          const pages = [...new Set([1, cur - 2, cur - 1, cur, cur + 1, cur + 2, last])].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b);
          p.innerHTML = `<span>عرض ${S.num(res.from)}–${S.num(res.to)} من ${S.num(res.total)}</span><div class="pg"><button data-p="${cur - 1}" ${cur <= 1 ? 'disabled' : ''}>${ic('chevR')}</button>${pages.map((n, i) => (i && n - pages[i - 1] > 1 ? '<span class="muted">…</span>' : '') + `<button data-p="${n}" class="${n === cur ? 'on' : ''}">${n}</button>`).join('')}<button data-p="${cur + 1}" ${cur >= last ? 'disabled' : ''}>${ic('chevL')}</button></div>`;
          p.querySelectorAll('svg').forEach((s) => (s.style.cssText = 'width:14px;height:14px'));
          p.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { state.page = +b.dataset.p; load(); }));
        }
        async function openForm(row) {
          if (cfg.editPage) { location.hash = '#/' + cfg.editPage + (row && row.id ? '/' + row.id : ''); return; }
          let full = row;
          if (row && cfg.loadForEdit) { try { full = await S.get(cfg.api + '/' + row.id); } catch (e) { return S.toast(e.message, 'bad'); } }
          if (cfg.customForm) return cfg.customForm(full, ctx);
          const fields = cfg.fields(lk, full || null, ctx);
          S.formModal({
            title: (row ? 'تعديل ' : 'إضافة ') + (cfg.singular || ''), fields, values: full ? (cfg.toForm ? cfg.toForm(full) : full) : { ...(cfg.newDefaults ? cfg.newDefaults(state, lk) : {}) }, size: cfg.formSize, cols: cfg.formCols,
            onSave: async (vals) => {
              const body = cfg.toPayload ? cfg.toPayload(vals, row) : vals;
              if (row) await S.api(cfg.api + '/' + row.id, { method: body instanceof FormData ? 'POST' : 'PATCH', body });
              else await S.api(cfg.api, { method: 'POST', body: body instanceof FormData ? body : { ...body, ...(cfg.year && !(body instanceof FormData) ? { year: S.yearId() } : {}) }, query: cfg.year ? { year: S.yearId() } : undefined });
              S.toast(row ? 'تم حفظ التعديلات' : 'تمت الإضافة بنجاح', 'ok');
              (cfg.invalidate || []).forEach((k) => S.L.clear(k));
              load();
            },
          });
        }
        async function openView(row) {
          if (cfg.view) return cfg.view(row, ctx);
          const m = S.modal({ title: 'تفاصيل ' + (cfg.singular || ''), size: 'wide', body: S.spinner });
          try { const full = await S.get(cfg.api + '/' + row.id); m.body.innerHTML = S.kv(cfg.viewFields(full, ctx)); } catch (e) { m.body.innerHTML = S.emptyHtml(e.message); }
        }
        async function del(row) {
          if (!(await S.confirm(`حذف ${cfg.singular || 'السجل'} «${row.name || row.title || row.number || row.name_ar || '#' + row.id}»؟ لا يمكن التراجع.`, 'حذف'))) return;
          try { await S.del(cfg.api + '/' + row.id); S.toast('تم الحذف', 'ok'); (cfg.invalidate || []).forEach((k) => S.L.clear(k)); load(); } catch (e) { S.toast(e.message, 'bad'); }
        }
        ctx.openForm = openForm; ctx.openView = openView; ctx.del = del;

        // events
        const apply = () => { state.page = 1; state.q = $('#q') ? $('#q').value.trim() : ''; el.querySelectorAll('[data-filter]').forEach((s) => (state.f[s.dataset.filter] = s.value)); load(); };
        $('#go') && ($('#go').onclick = apply);
        $('#q') && ($('#q').oninput = S.debounce(apply, 350));
        el.querySelectorAll('[data-filter]').forEach((s) => (s.onchange = apply));
        el.querySelectorAll('[data-chip]').forEach((b) => (b.onclick = () => { el.querySelectorAll('[data-chip]').forEach((x) => x.classList.remove('on')); b.classList.add('on'); state.f[cfg.chips.k] = b.dataset.chip; state.page = 1; load(); }));
        $('#add') && ($('#add').onclick = () => openForm(null));
        el.querySelectorAll('[data-tb]').forEach((b) => (b.onclick = () => cfg.toolbar[+b.dataset.tb].run(ctx)));
        $('#exp') && ($('#exp').onclick = async () => {
          const b = $('#exp'); S.btnBusy(b, true);
          try { const res = await S.get(cfg.api, query({ all: 1, page: undefined })); await S.exportXlsx(cfg.exportName || cfg.title, cfg.exportCols, res.data); } catch (e) { S.toast(e.message, 'bad'); }
          S.btnBusy(b, false);
        });
        $('#imp') && ($('#imp').onclick = () => S.importDialog(cfg.importer, load));
        if (cfg.afterRender) cfg.afterRender(ctx);
        if (params.new) openForm(null);
        if (params.id) openView({ id: params.id });
        await load();
      },
    };
  };

  /**
   * Full-PAGE add/edit form (instead of a modal). Pairs with a list built via
   * S.crud({ ..., editPage: '<formRouteKey>' }).
   * cfg: { api, title, singular, perm, year, lookups:[], loadForEdit,
   *        backTo:'<listRouteKey>', fields:(lk,row,ctx)=>[...], formCols,
   *        newDefaults(params,lk), toForm(row), toPayload(vals,row),
   *        context(row,lk,ctx)=>html (optional read-only side cards),
   *        subtitle }
   */
  S.formPage = function (cfg) {
    return {
      title: cfg.title, perm: cfg.perm,
      async render(el, params, rc) {
        const keys = [...new Set([...(cfg.year ? ['years'] : []), ...(cfg.lookups || [])])];
        const lk = keys.length ? await S.L(keys) : {};
        const id = params.id;
        let row = null;
        if (id) {
          el.innerHTML = S.spinner;
          try { row = await S.get(cfg.api + '/' + id); } catch (e) { el.innerHTML = S.emptyHtml('تعذّر تحميل السجل', e.message, 'alert'); return; }
        }
        const ctx = { lk, params, row };
        const fields = cfg.fields(lk, row, ctx);
        const values = row ? (cfg.toForm ? cfg.toForm(row) : row) : (cfg.newDefaults ? cfg.newDefaults(params, lk) : {});
        const titleTxt = (id ? 'تعديل ' : 'إضافة ') + (cfg.singular || cfg.title || '');
        const ctxHtml = cfg.context ? (cfg.context(row, lk, ctx) || '') : '';

        el.innerHTML = `<div class="crumbs"><a class="acc-t" href="#/${cfg.backTo}">${esc(cfg.title || '')}</a> ${ic('chevL')} <b>${id ? 'تعديل' : 'إضافة'}</b></div>
          <div class="page-h"><div><h2>${esc(titleTxt)}</h2>${cfg.subtitle ? `<p>${esc(cfg.subtitle)}</p>` : ''}</div><a class="btn ghost" href="#/${cfg.backTo}">${ic('chevR')} رجوع للقائمة</a></div>
          <div class="grid ${ctxHtml ? 'g-2-1' : ''}" style="align-items:start">
            <div class="card"><div class="bd pad" id="fwrap">${S.formHtml(fields, values, cfg.formCols)}</div>
              <div class="mf" style="display:flex;gap:10px;padding:14px 18px;border-top:1px solid var(--line)"><button class="btn" id="sv">${ic('check')} حفظ</button><a class="btn ghost" href="#/${cfg.backTo}">إلغاء</a></div></div>
            ${ctxHtml ? `<div id="ctx">${ctxHtml}</div>` : ''}
          </div>`;

        const form = el.querySelector('#fwrap form');
        // live conditional visibility (same behaviour as S.formModal)
        const refresh = () => { const cur = S.readForm(form, fields.filter((f) => f.t !== 'file')); fields.forEach((f) => { if (f.show) { const w = form.querySelector(`[data-f="${f.k}"]`); if (w) w.style.display = f.show(cur) ? '' : 'none'; } }); };
        form.addEventListener('change', refresh); refresh();
        if (cfg.afterRender) cfg.afterRender(el, { form, lk, row, params });

        el.querySelector('#sv').onclick = async (ev) => {
          if (!S.validate(form, fields)) return S.toast('راجع الحقول المطلوبة', 'bad');
          const vals = S.readForm(form, fields);
          const body = cfg.toPayload ? cfg.toPayload(vals, row) : vals;
          S.btnBusy(ev.currentTarget, true);
          try {
            if (id) await S.api(cfg.api + '/' + id, { method: body instanceof FormData ? 'POST' : 'PATCH', body });
            else await S.api(cfg.api, { method: 'POST', body: body instanceof FormData ? body : { ...body, ...(cfg.year ? { year: S.yearId() } : {}) }, query: cfg.year ? { year: S.yearId() } : undefined });
            (cfg.invalidate || []).forEach((k) => S.L.clear(k));
            S.toast(id ? 'تم حفظ التعديلات' : 'تمت الإضافة بنجاح', 'ok');
            location.hash = '#/' + cfg.backTo;
          } catch (er) { S.showErrors(form, er); S.btnBusy(ev.currentTarget, false); S.toast(er.message || 'تعذّر الحفظ', 'bad'); }
        };
      },
    };
  };

  /** Import dialog: download template, pick file, preview, send to endpoint. */
  S.importDialog = function (imp, done) {
    const m = S.modal({ title: imp.title || 'استيراد من Excel', size: 'wide', body: `
      <div class="t2 mb16">جهّز ملف Excel بالأعمدة التالية (السطر الأول عناوين):</div>
      <div class="chips mb16">${imp.headers.map((h) => `<span class="chip">${esc(h)}</span>`).join('')}</div>
      <div class="row wrap"><button class="btn ghost" id="tpl">${ic('download')} تحميل نموذج فارغ</button><button class="btn" id="pick">${ic('upload')} اختيار الملف</button></div>
      <div id="prev" class="mt16"></div>`, foot: '<button class="btn ghost" data-close>إلغاء</button><button class="btn success hide" id="send">استيراد البيانات</button>' });
    let rows = [];
    m.$('#tpl').onclick = () => S.templateXlsx(imp.file || 'template', imp.headers, imp.sample);
    m.$('#pick').onclick = async () => {
      try {
        rows = await S.importXlsx(imp.map);
        if (!rows.length) return S.toast('لم يتم العثور على صفوف مطابقة للأعمدة', 'bad');
        const keys = Object.keys(imp.map);
        m.$('#prev').innerHTML = `<div class="b mb8">معاينة (${S.num(rows.length)} صف):</div><div class="tbl-wrap"><div class="tbl-scroll" style="max-height:300px"><table class="tbl"><thead><tr>${keys.map((k) => `<th>${esc(imp.map[k][0])}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, 50).map((r) => `<tr>${keys.map((k) => `<td>${esc(r[k] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
        m.$('#send').classList.remove('hide');
      } catch (e) { S.toast(e.message, 'bad'); }
    };
    m.$('#send').onclick = async () => {
      const b = m.$('#send'); S.btnBusy(b, true);
      try {
        const r = await S.post(imp.endpoint + (imp.year ? '?year=' + S.yearId() : ''), { rows });
        m.$('#prev').innerHTML = `<div class="card pad"><div class="b ok-t mb8">تم استيراد ${S.num(r.created)} سجل بنجاح.</div>${r.skipped.length ? `<div class="warn-t b">تم تخطي ${r.skipped.length} صف:</div><ul style="padding-inline-start:18px" class="sm t2">${r.skipped.slice(0, 30).map((s) => `<li>الصف ${s.row}: ${esc(s.reason)}</li>`).join('')}</ul>` : ''}</div>`;
        b.classList.add('hide'); done && done();
      } catch (e) { S.toast(e.message, 'bad'); S.btnBusy(b, false); }
    };
  };

  // ---------- small shared renderers
  S.cell = {
    name: (n, sub) => `<div class="av-row"><span class="avatar">${esc(S.initials(n))}</span><div><div class="b">${esc(n)}</div>${sub ? `<div class="muted xs">${sub}</div>` : ''}</div></div>`,
    link: (t) => `<a class="lk" href="#" data-open>${esc(t)}</a>`,
    num: (v) => `<span class="num">${esc(v ?? '—')}</span>`,
    phone: (v) => (v ? `<span class="num">${esc(v)}</span>` : '—'),
    cnt: (n, c) => `<span class="cnt ${c || ''}">${S.num(n)}</span>`,
    yes: (b) => (b ? `<span class="bdg l-ok">نعم</span>` : `<span class="bdg l-mut">لا</span>`),
    file: (p) => (p ? `<a class="ibtn v" href="${esc(p)}" target="_blank" title="فتح المرفق">${ic('file')}</a>` : '<span class="muted">—</span>'),
  };
})();
