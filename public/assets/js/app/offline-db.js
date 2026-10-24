/*
 * سكوول — offline mirror (phase 2A).
 * Keeps a full copy of the school's data in IndexedDB on the admin's device, refreshed by delta
 * sync (GET /app/sync) on boot, every 10 minutes and whenever the connection comes back. When the
 * server is unreachable, S.crud lists and S.L lookups read from this copy, and the whole mirror can
 * be downloaded as a backup file. The server stays the source of truth; this is a resilient copy.
 */
(function () {
  'use strict';
  const { esc, ic } = S;

  // ------------------------------------------------------------- IndexedDB
  const DB_VERSION = 1;
  let dbP = null;
  const dbName = () => { const me = S.me(); return 'schoole_' + ((me && me.company && me.company.id) || 'x'); };
  function open() {
    if (dbP) return dbP;
    dbP = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('IndexedDB غير مدعوم في هذا المتصفح'));
      const r = indexedDB.open(dbName(), DB_VERSION);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('rows')) d.createObjectStore('rows', { keyPath: 'k' }).createIndex('t', 't');
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'k' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => { dbP = null; rej(r.error); };
    });
    return dbP;
  }
  const done = (t) => new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const store = async (name, mode) => (await open()).transaction(name, mode).objectStore(name);

  const DB = (S.db = {
    async putMany(table, rows) { if (!rows || !rows.length) return; const s = await store('rows', 'readwrite'); rows.forEach((r) => s.put({ k: table + ':' + r.id, t: table, id: r.id, r })); await done(s.transaction); },
    async del(table, id) { const s = await store('rows', 'readwrite'); s.delete(table + ':' + id); await done(s.transaction); },
    async all(table) { const s = await store('rows', 'readonly'); return (await req(s.index('t').getAll(IDBKeyRange.only(table)))).map((x) => x.r); },
    async count(table) { const s = await store('rows', 'readonly'); return req(s.index('t').count(IDBKeyRange.only(table))); },
    async getMeta(k) { const s = await store('meta', 'readonly'); const v = await req(s.get(k)); return v ? v.v : undefined; },
    async setMeta(k, v) { const s = await store('meta', 'readwrite'); s.put({ k, v }); await done(s.transaction); },
    async wipe() { const d = await open(); const t = d.transaction(['rows', 'meta'], 'readwrite'); t.objectStore('rows').clear(); t.objectStore('meta').clear(); await done(t); },
  });

  // ------------------------------------------------------------------ sync
  const sync = (S.sync = { state: { running: false, phase: 'idle', table: '', done: 0, total: 0, error: null } });
  const emit = () => document.dispatchEvent(new CustomEvent('syncstate', { detail: sync.state }));
  const isOfflineError = (e) => !e || e.status === 0 || e.status === 503 || !!(e.data && e.data.offline) || navigator.onLine === false;
  S.local = { isOfflineError };

  sync.run = async function (opts = {}) {
    if (sync.state.running || !navigator.onLine) return;
    Object.assign(sync.state, { running: true, phase: 'manifest', table: '', done: 0, total: 0, error: null }); emit();
    try {
      const since = opts.full ? null : (await DB.getMeta('last_sync')) || null;
      const man = await S.get('/app/sync', since ? { since } : {});
      const slugs = Object.keys(man.tables || {});
      sync.state.total = slugs.length;
      for (const slug of slugs) {
        sync.state.phase = 'rows'; sync.state.table = slug; emit();
        if (!man.tables[slug].count) { sync.state.done++; continue; } // nothing changed in this table
        let after = 0;
        while (after !== null) {
          const page = await S.get('/app/sync', { table: slug, since: since || undefined, after, limit: 1000 });
          await DB.putMany(slug, page.rows || []);
          after = page.next_after == null ? null : page.next_after;
        }
        sync.state.done++; emit();
      }
      // tombstones arrive as server table names → map back to slugs
      const slugByTable = {}; slugs.forEach((s) => (slugByTable[man.tables[s].table] = s));
      for (const d of man.deleted || []) { const s = slugByTable[d.table]; if (s) await DB.del(s, d.row_id); }
      // dropdown lookups for the current year, so forms and filters work offline too
      sync.state.phase = 'lookups'; emit();
      try { const y = S.yearId(); const lk = await S.get('/app/lookups', { year: y }); await DB.setMeta('lookups:' + (y || 'current'), lk); } catch {}
      // next delta starts a little before this server time — the overlap is harmless (upserts are idempotent)
      const t = new Date(man.server_time); t.setMinutes(t.getMinutes() - 2);
      await DB.setMeta('last_sync', t.toISOString());
      await DB.setMeta('last_sync_at', new Date().toISOString());
      const known = new Set([...((await DB.getMeta('tables')) || []), ...slugs]);
      await DB.setMeta('tables', [...known]);
      sync.state.phase = 'done';
      document.dispatchEvent(new Event('syncdone'));
    } catch (e) { sync.state.error = (e && e.message) || 'تعذّرت المزامنة'; sync.state.phase = 'error'; }
    sync.state.running = false; emit();
  };

  sync.schedule = function () {
    if (sync._scheduled) return; sync._scheduled = true;
    setTimeout(() => sync.run(), 1500);                      // right after boot, off the critical path
    setInterval(() => sync.run(), 10 * 60 * 1000);
    window.addEventListener('online', () => setTimeout(() => sync.run(), 2000));
  };

  sync.status = async () => ({ last: await DB.getMeta('last_sync_at'), tables: (await DB.getMeta('tables')) || [] });

  // ----------------------------------------------------------- local query
  // Mirrors ResourceController::index semantics closely enough for list screens: free text over all
  // string values (incl. one level of nested relations), exact-match filters, academic-year scope, sort, paging.
  const strVals = (r, depth, out) => { for (const k in r) { const v = r[k]; if (v == null) continue; if (typeof v === 'object') { if (depth < 1 && !Array.isArray(v)) strVals(v, depth + 1, out); } else out.push(String(v)); } return out; };
  S.local.query = async function (table, o = {}) {
    let rows = await DB.all(table);
    if (o.year && o.year !== 'all' && rows.length && 'academic_year_id' in rows[0]) rows = rows.filter((r) => String(r.academic_year_id) === String(o.year));
    for (const [k, v] of Object.entries(o.f || {})) {
      if (v === undefined || v === null || v === '' || k === 'from' || k === 'to') continue;
      rows = rows.filter((r) => !(k in r) || String(r[k]) === String(v));
    }
    const q = (o.q || '').trim().toLowerCase();
    if (q) rows = rows.filter((r) => strVals(r, 0, []).some((s) => s.toLowerCase().includes(q)));
    const [sk, sd] = o.sort || ['id', 'desc'];
    rows.sort((a, b) => { const x = a[sk], y = b[sk]; if (x == y) return 0; return (x > y ? 1 : -1) * (sd === 'asc' ? 1 : -1); });
    const per = o.perPage || 25, page = Math.max(1, +o.page || 1), total = rows.length;
    return { data: rows.slice((page - 1) * per, page * per), total, current_page: page, per_page: per, last_page: Math.max(1, Math.ceil(total / per)), local: true };
  };

  // ---------------------------------------------------------------- backup
  sync.exportBackup = async function () {
    const me = S.me() || {}; const tables = (await DB.getMeta('tables')) || [];
    const out = { format: 'schoole-backup/1', exported_at: new Date().toISOString(), last_sync_at: await DB.getMeta('last_sync_at'), company: me.company ? { id: me.company.id, name: me.company.name, slug: me.company.slug } : null, tables: {} };
    for (const t of tables) out.tables[t] = await DB.all(t);
    const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `schoole-backup-${(me.company && me.company.slug) || 'school'}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    return out;
  };

  // ------------------------------------------------------------------ page
  const LABEL = {
    'academic-years': 'السنوات الدراسية', grades: 'الصفوف', sections: 'الشعب', buses: 'الحافلات', 'fee-items': 'بنود الرسوم الدراسية', 'custom-fields': 'الحقول المخصصة',
    subjects: 'المواد الدراسية', 'exam-terms': 'الفصول والاختبارات', 'student-attendance': 'الحضور والغياب', 'grade-marks': 'الدرجات والتقييم', 'timetable-entries': 'الجدول الدراسي',
    guardians: 'أولياء الأمور', students: 'الطلاب', applications: 'استمارة التسجيل', contracts: 'العقود', installments: 'الأقساط',
    'cash-accounts': 'الصناديق والبنوك', customers: 'العملاء', suppliers: 'الموردون', 'expense-categories': 'فئات المصاريف', expenses: 'فواتير المصروفات', 'service-invoices': 'فواتير الخدمات', vouchers: 'السندات',
    branches: 'الفروع', departments: 'الأقسام', 'job-titles': 'المسميات الوظيفية', employees: 'الموظفون', 'employee-attendance': 'الحضور والانصراف', 'leave-types': 'أنواع الإجازات', 'leave-requests': 'طلبات الإجازات',
    advances: 'سلف الموظفين', adjustments: 'المكافآت والاستقطاعات', payrolls: 'الرواتب الشهرية', 'employee-contracts': 'عقود الموظفين', 'evaluation-criteria': 'معايير التقييم', 'evaluation-periods': 'فترات التقييم', evaluations: 'التقييمات',
    'correspondence-categories': 'فئات المراسلات', correspondences: 'المراسلات', licenses: 'التراخيص', tasks: 'المهام والمواعيد', documents: 'الأرشفة الإلكترونية',
  };
  S.page('local-data', {
    title: 'النسخة المحلية',
    async render(el) {
      let last = 0;
      const draw = async () => {
        last = Date.now();
        const st = await sync.status(); const s = sync.state;
        const counts = []; for (const t of st.tables) counts.push([t, await DB.count(t)]);
        const totalRows = counts.reduce((a, [, c]) => a + c, 0);
        const status = s.running ? `<span class="bdg l-info">جارٍ المزامنة… ${esc(LABEL[s.table] || s.table || '')} (${s.done}/${s.total})</span>` : s.error ? `<span class="bdg l-bad">${esc(s.error)}</span>` : st.last ? '<span class="bdg l-ok">محدّثة</span>' : '<span class="bdg l-warn">لم تتم بعد</span>';
        el.innerHTML = `<div class="page-h"><div><h2>النسخة المحلية</h2><p>نسخة كاملة من بيانات مدرستك على هذا الجهاز — تعمل عند انقطاع الإنترنت أو تعطّل الخادم</p></div></div>
          <div class="grid g-2-1">
            <div class="card"><div class="hd"><h3>${ic('shield')} حالة النسخة المحلية</h3></div><div class="bd">
              ${S.kv([['آخر مزامنة', st.last ? `${esc(S.ago(st.last))} <span class="muted sm num">${esc(S.d(st.last))}</span>` : '—'], ['الحالة', status], ['عدد الجداول', S.num(st.tables.length)], ['إجمالي السجلات', S.num(totalRows)]])}
              <div class="row wrap mt16 gap8"><button class="btn" id="now" ${s.running ? 'disabled' : ''}>${ic('refresh')} زامن الآن</button><button class="btn ghost" id="full" ${s.running ? 'disabled' : ''}>${ic('refresh')} إعادة مزامنة كاملة</button><button class="btn outline-ok" id="bk" ${totalRows ? '' : 'disabled'}>${ic('download')} تنزيل نسخة احتياطية كاملة</button></div>
              <p class="muted sm mt16">تُحفظ نسخة كاملة من بيانات مدرستك على هذا الجهاز وتُحدَّث تلقائياً عند الدخول وكل 10 دقائق وعند عودة الاتصال. عند انقطاع الإنترنت أو تعطّل الخادم تستطيع الاطّلاع على كل البيانات، وتنزيل نسخة احتياطية تحتفظ بها خارج النظام.</p>
            </div></div>
            <div class="card"><div class="hd"><h3>${ic('layers')} الجداول المحفوظة</h3></div><div class="bd">${counts.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>الجدول</th><th>السجلات</th></tr></thead><tbody>${counts.map(([t, c]) => `<tr><td>${esc(LABEL[t] || t)}</td><td class="num">${S.num(c)}</td></tr>`).join('')}</tbody></table></div>` : S.emptyHtml('لا توجد بيانات محلية بعد', 'اضغط «زامن الآن» لإنشاء النسخة المحلية', 'shield')}</div></div>
          </div>`;
        el.querySelector('#now').onclick = () => sync.run();
        el.querySelector('#full').onclick = () => sync.run({ full: true });
        el.querySelector('#bk').onclick = async (e) => { const b = e.currentTarget; S.btnBusy(b, true); try { await sync.exportBackup(); S.toast('تم تنزيل النسخة الاحتياطية', 'ok'); } catch (er) { S.toast(er.message, 'bad'); } S.btnBusy(b, false); };
      };
      await draw();
      let timer = null;
      const onState = () => {
        if (!document.body.contains(el)) { document.removeEventListener('syncstate', onState); document.removeEventListener('syncdone', onState); return; }
        clearTimeout(timer); timer = setTimeout(draw, Date.now() - last > 600 ? 0 : 600); // throttle redraws while tables stream in
      };
      document.addEventListener('syncstate', onState); document.addEventListener('syncdone', onState);
    },
  });
})();
