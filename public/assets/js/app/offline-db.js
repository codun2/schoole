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
  const DB_VERSION = 2; // v2: + outbox store (offline writes)
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
        if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'id' });
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
    async get(table, id) { const s = await store('rows', 'readonly'); const v = await req(s.get(table + ':' + id)); return v ? v.r : undefined; },
    async wipe() { const d = await open(); const t = d.transaction(['rows', 'meta', 'outbox'], 'readwrite'); t.objectStore('rows').clear(); t.objectStore('meta').clear(); t.objectStore('outbox').clear(); await done(t); },
    // outbox (queued offline writes)
    async ops() { const s = await store('outbox', 'readonly'); return (await req(s.getAll())).sort((a, b) => a.ts - b.ts); },
    async putOp(op) { const s = await store('outbox', 'readwrite'); s.put(op); await done(s.transaction); },
    async delOp(id) { const s = await store('outbox', 'readwrite'); s.delete(id); await done(s.transaction); },
  });

  // ------------------------------------------------------------------ sync
  const sync = (S.sync = { state: { running: false, phase: 'idle', table: '', done: 0, total: 0, error: null } });
  const emit = () => document.dispatchEvent(new CustomEvent('syncstate', { detail: sync.state }));
  const isOfflineError = (e) => !e || e.status === 0 || e.status === 503 || !!(e.data && e.data.offline) || navigator.onLine === false;
  S.local = { isOfflineError };

  /** Stop background syncing for the rest of this page's life (used by logout before wiping caches). */
  sync.stop = () => { sync._stopped = true; };

  sync.run = async function (opts = {}) {
    if (sync._stopped || sync.state.running || !navigator.onLine) return;
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
      // warm the service-worker cache with the DEFAULT view of screens that are not plain lists
      // (dashboards, HR summaries, settings…) so they open offline too. Each call must build the
      // exact same URL the page itself requests — same params, same key order.
      sync.state.phase = 'warm'; emit();
      const cy = String(new Date().getFullYear());
      await Promise.allSettled([
        S.get('/app/dashboard/main', { period: sessionStorage.getItem('sch_period') || 'month' }),
        S.get('/app/dashboard/school', { year: S.yearId() }),
        S.get('/app/dashboard/accounting'), S.get('/app/dashboard/hr'), S.get('/app/dashboard/admin'),
        S.get('/app/leave-balances', { year: cy }),
        S.get('/app/payrolls'),
        S.get('/app/installments', { year: S.yearId(), state: 'unpaid', q: '', grade_id: '', from: '', to: '', page: 1, per_page: 25 }),
        S.get('/app/settings'), S.get('/app/school-announcements'),
        S.get('/app/timetable/config'), S.get('/app/timetable/load'),
      ]);
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

  // ---- app updates: the shell is network-first, but an open (installed) window keeps the code it
  // started with until it reloads — so watch one script's Last-Modified and offer a reload.
  let buildStamp = null;
  async function checkUpdate() {
    if (!navigator.onLine) return;
    try {
      const r = await fetch('/assets/js/app/crud.js', { method: 'HEAD', cache: 'no-store' });
      const v = r.headers.get('Last-Modified') || r.headers.get('ETag'); if (!v) return;
      if (buildStamp === null) { buildStamp = v; return; }
      if (v === buildStamp || document.getElementById('upd-toast')) return;
      let w = document.getElementById('toasts'); if (!w) { w = document.createElement('div'); w.id = 'toasts'; document.body.appendChild(w); }
      const t = document.createElement('div'); t.id = 'upd-toast'; t.className = 'toast'; t.style.pointerEvents = 'auto';
      t.innerHTML = `${ic('refresh')}<span>يتوفر تحديث جديد للنظام</span><button class="btn sm" style="margin-inline-start:8px">إعادة التحميل الآن</button>`;
      t.querySelector('button').onclick = () => location.reload();
      w.appendChild(t);
    } catch {}
  }
  sync.checkUpdate = checkUpdate;

  sync.schedule = function () {
    if (sync._scheduled) return; sync._scheduled = true;
    checkUpdate(); // records the stamp of the code this window is running
    const cycle = async () => { await checkUpdate(); if (S.outbox) await S.outbox.flush(); await sync.run(); }; // upload our changes first, then pull
    setTimeout(cycle, 1500);                                 // right after boot, off the critical path
    setInterval(cycle, 10 * 60 * 1000);
    window.addEventListener('online', () => setTimeout(cycle, 2000));
  };

  // ---------------------------------------------------------------- outbox
  // Offline writes. S.api hands any safe POST/PATCH/DELETE here when the network is gone: the change is
  // applied to the mirror at once (so screens show it, flagged _pending) and queued; flush() replays the
  // queue in order with an Idempotency-Key, mapping temporary ids of offline-created rows to real ones.
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); }));
  // ResourceController-backed tables whose create/update/delete are plain enough to replay later.
  // Money/numbering flows (contracts, invoices, vouchers, expenses, advances) stay online-only.
  const QUEUE_CRUD = ['academic-years', 'grades', 'sections', 'buses', 'fee-items', 'custom-fields', 'subjects', 'exam-terms', 'guardians', 'students', 'applications',
    'cash-accounts', 'customers', 'suppliers', 'expense-categories', 'branches', 'departments', 'job-titles', 'employees', 'leave-types', 'leave-requests', 'adjustments',
    'employee-contracts', 'evaluation-criteria', 'evaluation-periods', 'correspondence-categories', 'correspondences', 'licenses', 'tasks',
    'contracts']; // contracts: drafted/activated offline, numbered and scheduled by the server on upload; payments stay online
  const QUEUE_PATHS = [/^\/app\/attendance$/, /^\/app\/employee-attendance$/, /^\/app\/grades\/sheet$/, /^\/app\/timetable\/section$/, /^\/app\/timetable\/config$/, /^\/app\/contracts\/[^/]+\/activate$/, /^\/app\/students\/bulk$/, /^\/app\/school-announcements(\/\d+)?$/, /^\/app\/settings$/, /^\/app\/evaluations(\/\d+)?$/];
  // field → mirrored table, to rebuild the nested relation objects list screens expect (r.grade.name_ar …)
  const REL = { grade_id: 'grades', section_id: 'sections', guardian_id: 'guardians', bus_id: 'buses', student_id: 'students', employee_id: 'employees', teacher_id: 'employees', department_id: 'departments', branch_id: 'branches', job_title_id: 'job-titles', customer_id: 'customers', supplier_id: 'suppliers', cash_account_id: 'cash-accounts', leave_type_id: 'leave-types', subject_id: 'subjects', period_id: 'evaluation-periods', exam_term_id: 'exam-terms' };
  const parse = (path) => { const m = path.match(/^\/app\/([a-z-]+)(?:\/([^/?]+))?$/); return m ? { slug: m[1], rid: m[2] } : {}; };
  const isTmp = (v) => typeof v === 'string' && v.startsWith('tmp_');
  const emitOutbox = async () => { const ops = await DB.ops(); document.dispatchEvent(new CustomEvent('outboxchange', { detail: { pending: ops.filter((o) => o.status !== 'failed').length, failed: ops.filter((o) => o.status === 'failed').length } })); };
  async function decorate(slug, row) {
    for (const [f, t] of Object.entries(REL)) {
      if (row[f] === undefined || row[f] === null || row[f] === '') continue;
      const rel = f.replace(/_id$/, '');
      if (row[rel] && typeof row[rel] === 'object') continue;
      const r = await DB.get(t, row[f]); if (r) row[rel] = r;
    }
    return row;
  }
  const outbox = (S.outbox = {
    canQueue(method, path) {
      if (!['POST', 'PATCH', 'DELETE'].includes(method)) return false;
      if (QUEUE_PATHS.some((re) => re.test(path))) return true;
      const { slug, rid } = parse(path);
      if (!slug || !QUEUE_CRUD.includes(slug)) return false;
      return method === 'POST' ? !rid : !!rid;
    },
    async enqueue({ method, path, query, body }) {
      const now = new Date().toISOString();
      const op = { id: uuid(), ts: Date.now(), method, path, query: query || null, body: body || null, idem: uuid(), status: 'pending', tries: 0, error: null };
      const { slug, rid } = parse(path);
      let result = { message: 'حُفظ على الجهاز وسيُرفع تلقائياً عند عودة الاتصال', _queued: true };
      const crud = slug && QUEUE_CRUD.includes(slug) && !(body && Array.isArray(body.marks));
      if (crud && method === 'POST') {
        op.tmp = 'tmp_' + op.idem.slice(0, 8); op.table = slug;
        const row = await decorate(slug, { ...body, id: op.tmp, academic_year_id: body.academic_year_id || body.year || (S.yearId && S.yearId()) || undefined, created_at: now, updated_at: now, _pending: true });
        if (slug === 'contracts') Object.assign(row, { number: 'مؤقت', status: body.activate ? 'active' : 'draft', paid: 0, remaining: +row.total || 0, installments: [], payments: [], year: await DB.get('academic-years', row.academic_year_id) });
        await DB.putMany(slug, [row]); result = { ...row, _queued: true };
      } else if (crud && method === 'PATCH' && rid) {
        op.table = slug; op.rid = rid;
        if (isTmp(rid)) { // edit of a row created offline: fold it into the pending create
          const prev = (await DB.ops()).find((o) => o.tmp === rid && o.status !== 'failed');
          if (prev) { prev.body = { ...prev.body, ...body }; await DB.putOp(prev); const cur = (await DB.get(slug, rid)) || {}; const row = await decorate(slug, { ...cur, ...body, _pending: true }); await DB.putMany(slug, [row]); await emitOutbox(); S.toast(result.message, 'warn'); return { ...row, _queued: true }; }
        }
        const cur = (await DB.get(slug, rid)) || { id: isNaN(+rid) ? rid : +rid };
        const row = await decorate(slug, { ...cur, ...body, _pending: true, updated_at: now });
        await DB.putMany(slug, [row]); result = { ...row, _queued: true };
      } else if (crud && method === 'DELETE' && rid) {
        op.table = slug; op.rid = rid;
        await DB.del(slug, rid);
        if (isTmp(rid)) { // never reached the server: just drop its pending operations
          for (const o of await DB.ops()) if (o.tmp === rid || o.rid === rid) await DB.delOp(o.id);
          await emitOutbox(); return { message: 'تم الحذف', _queued: true };
        }
      } else if (path === '/app/attendance' && body && Array.isArray(body.marks)) {
        // mirror the sheet so it shows as saved offline; rows tagged with the op are replaced by real ones after upload
        op.att = true;
        const all = (await DB.all('student-attendance')).filter((r) => String(r.section_id) === String(body.section_id) && String(r.date || '').slice(0, 10) === body.date);
        const rows = body.marks.map((m) => { const ex = all.find((r) => String(r.student_id) === String(m.student_id)); return { ...(ex || { id: 'tmp_' + uuid().slice(0, 8), student_id: m.student_id, section_id: body.section_id, date: body.date }), status: m.status, note: m.note || null, _pending: true, _op: op.id }; });
        await DB.putMany('student-attendance', rows);
      } else if (/^\/app\/contracts\/[^/]+\/activate$/.test(path)) {
        const cid = path.split('/')[3]; const c = await DB.get('contracts', cid);
        if (c) await DB.putMany('contracts', [{ ...c, status: 'active', _pending: true }]);
        result = { message: 'سيُفعَّل العقد وتتولّد أقساطه عند الرفع', _queued: true };
      } else if (path === '/app/timetable/section' && body && Array.isArray(body.entries)) {
        // mirror the new grid: current rows of the section are hidden (restored if the upload is discarded),
        // the new cells are added as temporary rows tagged with the op
        op.tt = body.section_id;
        const sec = await DB.get('sections', body.section_id);
        const cur = (await DB.all('timetable-entries')).filter((r) => String(r.section_id) === String(body.section_id));
        await DB.putMany('timetable-entries', cur.map((r) => ({ ...r, _hidden: op.id })));
        await DB.putMany('timetable-entries', body.entries.filter((e) => e.subject_id || e.teacher_id).map((e) => ({ id: 'tmp_' + uuid().slice(0, 8), section_id: body.section_id, academic_year_id: sec ? sec.academic_year_id : undefined, day: e.day, period: e.period, subject_id: e.subject_id || null, teacher_id: e.teacher_id || null, room: e.room || null, _pending: true, _op: op.id })));
      }
      await DB.putOp(op); await emitOutbox();
      S.toast(result.message, 'warn');
      return result;
    },
    async flush() {
      if (outbox._flushing || navigator.onLine === false) return { sent: 0, failed: 0 };
      outbox._flushing = true;
      const idmap = (await DB.getMeta('idmap')) || {};
      let sent = 0, failed = 0;
      try {
        for (const op of (await DB.ops()).filter((o) => o.status !== 'failed')) {
          const path = op.path.replace(/tmp_[\w-]+/g, (t) => idmap[t] || t);
          if (/tmp_/.test(path)) { op.status = 'failed'; op.error = 'يعتمد على سجل لم يُرفع بعد'; await DB.putOp(op); failed++; continue; }
          const body = op.body == null ? undefined : JSON.parse(JSON.stringify(op.body), (k, v) => (isTmp(v) && idmap[v] ? idmap[v] : v));
          try {
            const res = await S.api(path, { method: op.method, body, query: op.query || undefined, replay: true, headers: { 'Idempotency-Key': op.idem } });
            if (op.tmp && res && res.id) { idmap[op.tmp] = res.id; await DB.setMeta('idmap', idmap); await DB.del(op.table, op.tmp); await DB.putMany(op.table, [res]); }
            else if (op.table && op.method === 'PATCH' && res && res.id) await DB.putMany(op.table, [res]);
            if (op.att) { for (const r of await DB.all('student-attendance')) if (r._op === op.id) await DB.del('student-attendance', r.id); }
            if (op.tt) { for (const r of await DB.all('timetable-entries')) if (r._op === op.id || r._hidden === op.id) await DB.del('timetable-entries', r.id); } // real rows arrive with the next delta sync
            await DB.delOp(op.id); sent++;
          } catch (e) {
            if (!e || !e.status || e.status >= 500 || e.offline) break;            // still offline / server down → try again later
            op.status = 'failed'; op.error = e.message; op.tries++; await DB.putOp(op); failed++; // 4xx → needs the user's attention
          }
        }
      } finally { outbox._flushing = false; await emitOutbox(); }
      if (sent) { S.L.clear(); S.toast(`تم رفع ${sent} ${sent === 1 ? 'تغيير' : 'تغييرات'} إلى الخادم`, 'ok'); document.dispatchEvent(new Event('outboxflushed')); }
      return { sent, failed };
    },
    async retry(id) { const op = (await DB.ops()).find((o) => o.id === id); if (op) { op.status = 'pending'; op.error = null; await DB.putOp(op); } return outbox.flush(); },
    async discard(id) {
      const op = (await DB.ops()).find((o) => o.id === id); if (!op) return;
      if (op.tmp) await DB.del(op.table, op.tmp);
      if (op.att) { for (const r of await DB.all('student-attendance')) if (r._op === op.id) await DB.del('student-attendance', r.id); }
      if (op.tt) { for (const r of await DB.all('timetable-entries')) { if (r._op === op.id) await DB.del('timetable-entries', r.id); else if (r._hidden === op.id) { const { _hidden, ...rest } = r; await DB.putMany('timetable-entries', [rest]); } } }
      await DB.delOp(op.id); await emitOutbox();
    },
    list: () => DB.ops(),
    async pending() { return (await DB.ops()).filter((o) => o.status !== 'failed').length; },
    /** After a write succeeded online, keep the mirror current without waiting for the next delta sync. */
    async afterOnlineWrite(method, path, data) {
      const { slug, rid } = parse(path); if (!slug || !QUEUE_CRUD.includes(slug) && !['contracts', 'service-invoices', 'vouchers', 'expenses', 'advances'].includes(slug)) return;
      if (method === 'DELETE' && rid) return DB.del(slug, rid);
      if (data && data.id && (method === 'POST' || method === 'PATCH') && !(data.message && !data.id)) return DB.putMany(slug, [data]);
    },
  });

  /** Offline timetable views built from the mirror (same shapes as the /app/timetable/* endpoints). */
  const ttKey = (e) => e.day + '-' + e.period;
  const ttEntries = async () => (await DB.all('timetable-entries')).filter((e) => !e._hidden);
  const byId = async (table) => { const m = {}; (await DB.all(table)).forEach((r) => (m[r.id] = r)); return m; };
  S.local.timetableSection = async function (sectionId, cfg) {
    const section = (await DB.get('sections', sectionId)) || { id: sectionId, name: '' };
    const subj = await byId('subjects'), emp = await byId('employees'), entries = {};
    (await ttEntries()).filter((e) => String(e.section_id) === String(sectionId)).forEach((e) => { entries[ttKey(e)] = { subject_id: e.subject_id, subject: subj[e.subject_id] ? subj[e.subject_id].name_ar : null, teacher_id: e.teacher_id, teacher: emp[e.teacher_id] ? emp[e.teacher_id].name : null, room: e.room || null }; });
    return { section, entries, days: cfg.days, periods: cfg.periods, local: true };
  };
  S.local.timetableTeacher = async function (teacherId, cfg) {
    const t = (await DB.get('employees', teacherId)) || { id: teacherId, name: '' };
    const subj = await byId('subjects'), secs = await byId('sections'), entries = {};
    const rows = (await ttEntries()).filter((e) => String(e.teacher_id) === String(teacherId));
    rows.forEach((e) => { const s = secs[e.section_id]; entries[ttKey(e)] = { subject: subj[e.subject_id] ? subj[e.subject_id].name_ar : null, section: s ? ((s.grade && s.grade.name_ar ? s.grade.name_ar + ' / ' : '') + s.name) : '', room: e.room || null }; });
    return { teacher: { id: t.id, name: t.name, number: t.number }, entries, load: rows.length, days: cfg.days, periods: cfg.periods, local: true };
  };
  S.local.timetableLoad = async function () {
    const counts = {}; (await ttEntries()).forEach((e) => { if (e.teacher_id) counts[e.teacher_id] = (counts[e.teacher_id] || 0) + 1; });
    return (await DB.all('employees')).filter((e) => e.is_teacher && e.status !== 'terminated').sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar')).map((t) => ({ id: t.id, name: t.name, number: t.number, lessons: counts[t.id] || 0 }));
  };

  /** Offline attendance sheet built from the mirror (same shape as GET /app/attendance/sheet). */
  S.local.attendanceSheet = async function (sectionId, date) {
    const students = (await DB.all('students')).filter((s) => String(s.section_id) === String(sectionId) && s.status === 'active').sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar'));
    const marks = {}; (await DB.all('student-attendance')).forEach((r) => { if (String(r.section_id) === String(sectionId) && String(r.date || '').slice(0, 10) === date) marks[r.student_id] = r; });
    return { section: await DB.get('sections', sectionId), date, saved: Object.keys(marks).length > 0, local: true,
      students: students.map((s) => ({ id: s.id, name: s.name, student_no: s.student_no, gender: s.gender, status: marks[s.id] ? marks[s.id].status : null, note: marks[s.id] ? marks[s.id].note : null })) };
  };

  sync.status = async () => ({ last: await DB.getMeta('last_sync_at'), tables: (await DB.getMeta('tables')) || [] });

  // ----------------------------------------------------------- local query
  // Mirrors ResourceController::index semantics closely enough for list screens: free text over all
  // string values (incl. one level of nested relations), exact-match filters, academic-year scope, sort, paging.
  const strVals = (r, depth, out) => { for (const k in r) { const v = r[k]; if (v == null) continue; if (typeof v === 'object') { if (depth < 1 && !Array.isArray(v)) strVals(v, depth + 1, out); } else out.push(String(v)); } return out; };
  S.local.query = async function (table, o = {}) {
    let rows = await DB.all(table);
    if (o.year && o.year !== 'all') rows = rows.filter((r) => r.academic_year_id == null || String(r.academic_year_id) === String(o.year));
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
        const ops = await DB.ops();
        const opLabel = (o) => { const { slug, rid } = parse(o.path); const verb = o.method === 'POST' ? (rid ? 'حفظ' : 'إضافة') : o.method === 'PATCH' ? 'تعديل' : 'حذف'; const what = o.att ? 'حضور الطلاب' : (LABEL[slug] || slug || o.path); const nm = o.body && (o.body.name_ar || o.body.name || o.body.title || o.body.number); return `${verb} — ${what}${nm ? ` «${esc(String(nm))}»` : ''}`; };
        const opsHtml = ops.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="s">العملية</th><th>الوقت</th><th>الحالة</th><th></th></tr></thead><tbody>${ops.map((o) => `<tr><td class="s">${opLabel(o)}</td><td class="num muted">${esc(S.ago(new Date(o.ts).toISOString()))}</td><td>${o.status === 'failed' ? `<span class="bdg l-bad" title="${esc(o.error || '')}">فشل الرفع</span><div class="muted xs" style="white-space:normal;max-width:260px">${esc(o.error || '')}</div>` : '<span class="bdg l-warn">بانتظار الرفع</span>'}</td><td><div class="acts">${o.status === 'failed' ? `<button class="btn ghost xs" data-retry="${o.id}">إعادة المحاولة</button>` : ''}<button class="btn ghost xs" data-discard="${o.id}" style="color:var(--bad)">تجاهل</button></div></td></tr>`).join('')}</tbody></table></div>` : S.emptyHtml('لا توجد تغييرات بانتظار الرفع', '', 'check');
        el.innerHTML = `<div class="page-h"><div><h2>النسخة المحلية</h2><p>نسخة كاملة من بيانات مدرستك على هذا الجهاز — تعمل عند انقطاع الإنترنت أو تعطّل الخادم</p></div></div>
          <div class="grid g-2-1">
            <div class="card"><div class="hd"><h3>${ic('shield')} حالة النسخة المحلية</h3></div><div class="bd">
              ${S.kv([['آخر مزامنة', st.last ? `${esc(S.ago(st.last))} <span class="muted sm num">${esc(S.d(st.last))}</span>` : '—'], ['الحالة', status], ['عدد الجداول', S.num(st.tables.length)], ['إجمالي السجلات', S.num(totalRows)]])}
              <div class="row wrap mt16 gap8"><button class="btn" id="now" ${s.running ? 'disabled' : ''}>${ic('refresh')} زامن الآن</button><button class="btn ghost" id="full" ${s.running ? 'disabled' : ''}>${ic('refresh')} إعادة مزامنة كاملة</button><button class="btn outline-ok" id="bk" ${totalRows ? '' : 'disabled'}>${ic('download')} تنزيل نسخة احتياطية كاملة</button></div>
              <p class="muted sm mt16">تُحفظ نسخة كاملة من بيانات مدرستك على هذا الجهاز وتُحدَّث تلقائياً عند الدخول وكل 10 دقائق وعند عودة الاتصال. عند انقطاع الإنترنت أو تعطّل الخادم تستطيع الاطّلاع على كل البيانات، وتنزيل نسخة احتياطية تحتفظ بها خارج النظام.</p>
            </div></div>
            <div class="card"><div class="hd"><h3>${ic('layers')} الجداول المحفوظة</h3></div><div class="bd">${counts.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>الجدول</th><th>السجلات</th></tr></thead><tbody>${counts.map(([t, c]) => `<tr><td>${esc(LABEL[t] || t)}</td><td class="num">${S.num(c)}</td></tr>`).join('')}</tbody></table></div>` : S.emptyHtml('لا توجد بيانات محلية بعد', 'اضغط «زامن الآن» لإنشاء النسخة المحلية', 'shield')}</div></div>
          </div>
          <div class="card mt16"><div class="hd"><h3>${ic('upload')} التغييرات المعلّقة</h3><div class="sp"></div>${ops.some((o) => o.status !== 'failed') ? `<button class="btn sm" id="flush" ${navigator.onLine ? '' : 'disabled'}>${ic('upload')} رفع الآن</button>` : ''}</div><div class="bd">${opsHtml}</div></div>`;
        const fl = el.querySelector('#flush'); if (fl) fl.onclick = () => outbox.flush();
        el.querySelectorAll('[data-retry]').forEach((b) => (b.onclick = () => outbox.retry(b.dataset.retry)));
        el.querySelectorAll('[data-discard]').forEach((b) => (b.onclick = async () => { if (await S.confirm('تجاهل هذا التغيير نهائياً؟ لن يُرفع إلى الخادم.', 'تجاهل')) await outbox.discard(b.dataset.discard); }));
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
      document.addEventListener('syncstate', onState); document.addEventListener('syncdone', onState); document.addEventListener('outboxchange', onState);
    },
  });
})();
