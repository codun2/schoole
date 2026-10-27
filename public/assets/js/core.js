/* سكوول — shared frontend core: API client, session, formatting, icons, UI kit, forms, charts, Excel, print. */
(function () {
  'use strict';
  const S = (window.S = {});
  const TK = 'sch_token', ME = 'sch_me';

  // ------------------------------------------------------------------ session
  S.token = () => localStorage.getItem(TK);
  S.me = () => { try { return JSON.parse(localStorage.getItem(ME) || 'null'); } catch { return null; } };
  S.setSession = (token, me) => { if (token) localStorage.setItem(TK, token); localStorage.setItem(ME, JSON.stringify(me)); };
  S.clearSession = () => { localStorage.removeItem(TK); localStorage.removeItem(ME); };
  S.can = (perm) => { const me = S.me(); if (!perm) return true; return !!(me && me.user && (me.user.role === 'admin' || (me.user.permissions || []).includes(perm))); };

  // ---------------------------------------------------------------------- api
  S.api = async function (path, opts = {}) {
    const headers = { Accept: 'application/json', ...(opts.headers || {}) };
    const t = S.token(); if (t) headers.Authorization = 'Bearer ' + t;
    const method = (opts.method || 'GET').toUpperCase();
    const rawBody = opts.body;
    let body = rawBody;
    if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
    let url = '/api' + path;
    if (opts.query) {
      const q = Object.entries(opts.query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
      if (q) url += (url.includes('?') ? '&' : '?') + q;
    }
    // Offline-first writes: when the network is gone, safe writes go to the local outbox (S.outbox,
    // offline-db.js) and are replayed automatically later. Replays themselves (opts.replay) never re-queue.
    const rawIsFD = rawBody instanceof FormData;
    const canQ = method !== 'GET' && !opts.replay && S.outbox && S.outbox.canQueue(method, path);
    const queueable = canQ && !rawIsFD;
    // a form with a file becomes FormData; offline we still queue its text fields and defer only the attachment
    const queueFD = () => { const { obj, dropped } = S.fdToObj(rawBody); return S.outbox.enqueue({ method, path, query: opts.query, body: obj, fileDeferred: dropped.length > 0 }); };
    if (navigator.onLine === false) { if (queueable) return S.outbox.enqueue({ method, path, query: opts.query, body: rawBody }); if (canQ && rawIsFD) return queueFD(); }
    // going online: swap tmp ids of offline-created rows for their real ids; block if a referenced row isn't uploaded yet
    if (method !== 'GET' && !opts.replay && rawBody && !rawIsFD && S.outbox && S.outbox.resolveTmp) {
      const rt = await S.outbox.resolveTmp(rawBody);
      if (rt.unresolved.length) { const e = new Error('تعذّر الحفظ: أحد الحقول يشير إلى عنصر أُضيف بدون اتصال ولم يُرفع بعد — انتظر اكتمال المزامنة أو راجع «التغييرات المعلّقة».'); e.status = 422; e.data = {}; throw e; }
      body = JSON.stringify(rt.body);
    }
    let res;
    try { res = await fetch(url, { method, headers, body }); }
    catch {
      if (queueable) return S.outbox.enqueue({ method, path, query: opts.query, body: rawBody });
      if (canQ && rawIsFD) return queueFD();
      const off = typeof navigator !== 'undefined' && navigator.onLine === false; const e = new Error(off ? 'أنت غير متصل بالإنترنت — هذه العملية تحتاج اتصالاً، أعد المحاولة عند عودة الشبكة.' : 'تعذّر الاتصال بالخادم، تحقق من الإنترنت.'); e.status = 0; throw e;
    }
    if (res.status === 401 && !opts.noRedirect) { S.clearSession(); location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.hash); throw new Error('unauth'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      let msg = data.message || 'حدث خطأ غير متوقع';
      if (res.status === 403) msg = 'ليس لديك صلاحية للوصول لهذا القسم.';
      if (res.status === 422 && data.errors) msg = Object.values(data.errors)[0][0];
      if (res.status >= 500) msg = 'خطأ في الخادم، حاول مرة أخرى.';
      if (data.offline) msg = data.message || 'أنت غير متصل بالإنترنت.'; // 503 synthesized by the service worker, not a server fault
      const e = new Error(msg); e.status = res.status; e.data = data; e.offline = !!data.offline; throw e;
    }
    // keep the offline mirror in step with writes that succeeded online
    if (method !== 'GET' && !opts.replay && S.outbox && S.outbox.afterOnlineWrite) S.outbox.afterOnlineWrite(method, path, data).catch(() => {});
    // served by the service worker from its cache (network down): callers may prefer the local mirror
    if (data && typeof data === 'object' && res.headers.get('X-Sch-Cache') === 'fallback') Object.defineProperty(data, '_fromCache', { value: true, enumerable: false });
    return data;
  };
  S.get = (p, query) => S.api(p, { query });
  S.post = (p, body) => S.api(p, { method: 'POST', body });
  S.patch = (p, body) => S.api(p, { method: 'PATCH', body });
  S.del = (p) => S.api(p, { method: 'DELETE' });

  // ---------------------------------------------------------------- formatting
  const esc = (S.esc = (s) => (s == null ? '' : String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]))));
  const CUR = { OMR: ['ر.ع', 3], SAR: ['ر.س', 2], AED: ['د.إ', 2], KWD: ['د.ك', 3], QAR: ['ر.ق', 2], BHD: ['د.ب', 3], JOD: ['د.أ', 3], EGP: ['ج.م', 2], USD: ['$', 2] };
  S.currency = () => { const me = S.me(); return (me && me.company && me.company.currency) || S._currency || 'SAR'; };
  S.dec = () => (CUR[S.currency()] || ['', 2])[1];
  S.fmtN = (n, d) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d ?? S.dec(), maximumFractionDigits: d ?? S.dec() });
  S.money = (n, plain) => { const [sym, d] = CUR[S.currency()] || [S.currency(), 2]; const v = S.fmtN(n, d); return plain ? v : `<span class="mny"><span class="num">${v}</span> <small class="muted">${sym}</small></span>`; };
  S.moneyT = (n) => { const [sym, d] = CUR[S.currency()] || [S.currency(), 2]; return S.fmtN(n, d) + ' ' + sym; };
  S.curSym = () => (CUR[S.currency()] || [S.currency()])[0];
  S.num = (n) => Number(n || 0).toLocaleString('en-US');
  S.d = (s) => (s ? String(s).slice(0, 10) : '—');
  S.today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  S.month = () => S.today().slice(0, 7);
  S.addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  S.MONTHS = MONTHS;
  const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  S.MONTHS_EN = MONTHS_EN;
  S.monthName = (i) => (S.isEn && S.isEn() ? MONTHS_EN : MONTHS)[i];
  S.monthLabel = (ym, short) => { if (!ym) return '—'; const [y, m] = ym.split('-'); return S.monthName(+m - 1) + ' ' + (short ? y.slice(2) : y); };
  S.longDate = (iso) => { const d = iso ? new Date(iso) : new Date(); return d.toLocaleDateString(S.isEn && S.isEn() ? 'en-GB' : 'ar-OM-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); };
  S.ago = (s) => { if (!s) return ''; const diff = (Date.now() - new Date(s).getTime()) / 1000; if (diff < 60) return 'الآن'; if (diff < 3600) return 'قبل ' + Math.floor(diff / 60) + ' دقيقة'; if (diff < 86400) return 'قبل ' + Math.floor(diff / 3600) + ' ساعة'; if (diff < 86400 * 7) return 'قبل ' + Math.floor(diff / 86400) + ' يوم'; return S.d(s); };
  S.initials = (n) => (n || '؟').trim().charAt(0);
  // FormData → plain object for the offline outbox; File/Blob values are dropped (attachments need a connection)
  S.fdToObj = (fd) => { const obj = {}, dropped = []; for (const [k, v] of fd.entries()) { if (v instanceof Blob) { dropped.push(k); continue; } if (k.endsWith('[]')) { const kk = k.slice(0, -2); (obj[kk] = obj[kk] || []).push(v); } else obj[k] = v; } return { obj, dropped }; };
  // avatar/photo: a real image when a photo path exists, otherwise the initials circle (same .avatar box)
  S.avatarHtml = (photo, name, extra) => photo
    ? `<img class="avatar${extra ? ' ' + extra : ''}" src="${esc(photo)}" alt="${esc(name || '')}" style="object-fit:cover" onerror="this.outerHTML='<span class=\\'avatar${extra ? ' ' + extra : ''}\\'>'+${JSON.stringify(esc(S.initials(name)))}+'</span>'">`
    : `<span class="avatar${extra ? ' ' + extra : ''}">${esc(S.initials(name))}</span>`;
  S.debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  S.qs = (o) => Object.entries(o).filter(([, v]) => v !== '' && v != null).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');

  // ---------------------------------------------------------------------- icons
  const P = {
    home: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    calc: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 14 0v1"/>',
    userPlus: '<path d="M15 21v-1a6 6 0 0 0-12 0v1"/><circle cx="9" cy="8" r="4"/><path d="M19 8v6M22 11h-6"/>',
    briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16M2 13h20"/>',
    cap: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2.5 9 2.5 12 0v-5M22 10v6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    menu: '<path d="M4 6h16M4 12h10M4 18h16"/>',
    chevL: '<path d="m15 18-6-6 6-6"/>', chevR: '<path d="m9 18 6-6-6-6"/>', chevD: '<path d="m6 9 6 6 6-6"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>', check: '<path d="M20 6 9 17l-5-5"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    printer: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
    fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    calCheck: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7l10-5z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
    columns: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/>',
    bus: '<path d="M8 6v6M16 6v6M2 12h20M7 18h10"/><rect x="3" y="3" width="18" height="15" rx="3"/><circle cx="7" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/>',
    parents: '<circle cx="8" cy="7" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2 21v-1a6 6 0 0 1 12 0v1M14 21v-.5a4 4 0 0 1 8 0v.5"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 12h6M9 16h6"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18M7 6h1v4M16.71 13.88l.7.71-2.82 2.82"/>',
    contract: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
    wallet: '<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
    trendUp: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>', trendDown: '<path d="m22 17-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/>',
    smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
    money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>', timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M10 2h4"/>',
    play: '<circle cx="12" cy="12" r="10"/><path d="m10 8 6 4-6 4z"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
    sitemap: '<rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v4M5 17v-3h14v3"/>',
    badge: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="11" r="2.5"/><path d="M15 9h3M15 13h3M5.5 17a3.5 3.5 0 0 1 7 0"/>',
    plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    minusCircle: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>', inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>', shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    tasks: '<rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4M13 6h8M13 12h8M13 18h8"/>', archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
    tag: '<path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><path d="M7 7h.01"/>',
    truck: '<path d="M10 17h4V5H2v12h3M14 9h4l4 4v4h-3"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/><path d="M20 17v5H6.5a2.5 2.5 0 0 1 0-5"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 16v-5M12 16V8M17 16v-9"/>', pie: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
    bank: '<path d="M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M12 3l9 5H3z"/>', logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>', refresh: '<path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/>',
    filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54z"/>', more: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
    whatsapp: '<path d="M21 11.5a8.4 8.4 0 0 1-12.6 7.3L3 21l2.3-5.3A8.4 8.4 0 1 1 21 11.5z"/>', phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    alert: '<path d="m10.29 3.86-8.47 14.14A2 2 0 0 0 3.53 21h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/>', info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    swap: '<path d="M16 3l4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16"/>', lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
  };
  S.ic = (name, cls) => `<svg class="${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[name] || P.file}</svg>`;
  S.LOGO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2.5 9 2.5 12 0v-5"/></svg>';

  // ----------------------------------------------------------------- theme
  S.applyTheme = () => {
    const me = S.me();
    document.documentElement.setAttribute('data-theme', localStorage.getItem('sch_mode') || 'light');
    const acc = localStorage.getItem('sch_accent') || (me && me.company && me.company.theme) || 'indigo';
    if (acc && acc !== 'indigo') document.documentElement.setAttribute('data-accent', acc); else document.documentElement.removeAttribute('data-accent');
  };
  S.toggleMode = () => { const dark = document.documentElement.getAttribute('data-theme') === 'dark'; localStorage.setItem('sch_mode', dark ? 'light' : 'dark'); S.applyTheme(); document.dispatchEvent(new Event('themechange')); };
  S.applyTheme();

  // ---------------------------------------------------------------- UI kit
  S.toast = function (msg, type) {
    let w = document.getElementById('toasts'); if (!w) { w = document.createElement('div'); w.id = 'toasts'; document.body.appendChild(w); }
    const t = document.createElement('div'); t.className = 'toast ' + (type || '');
    t.innerHTML = (type === 'ok' ? S.ic('check') : type === 'bad' ? S.ic('alert') : '') + '<span>' + esc(msg) + '</span>';
    t.querySelector('svg') && (t.querySelector('svg').style.cssText = 'width:18px;height:18px');
    w.appendChild(t);
    setTimeout(() => { t.style.transition = '.3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
  };
  S.modal = function (opts) {
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div class="box ${opts.size || ''}"><div class="mh"><h3>${opts.title || ''}</h3>${opts.head || ''}<button class="x" data-close>&times;</button></div><div class="mb">${opts.body || ''}</div>${opts.foot !== false ? `<div class="mf">${opts.foot || '<button class="btn ghost" data-close>إغلاق</button>'}</div>` : ''}</div>`;
    m.addEventListener('mousedown', (e) => { if (e.target === m && !opts.sticky) close(); });
    const close = () => { m.remove(); document.removeEventListener('keydown', onKey); opts.onClose && opts.onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    m.querySelectorAll('[data-close]').forEach((b) => (b.onclick = close));
    m.close = close; m.body = m.querySelector('.mb'); m.$ = (s) => m.querySelector(s);
    document.body.appendChild(m);
    const f = m.querySelector('.mb input:not([type=hidden]):not([readonly]),.mb select,.mb textarea'); if (f && !opts.noFocus) setTimeout(() => f.focus(), 60);
    return m;
  };
  S.confirm = (msg, ok = 'تأكيد', danger = true) => new Promise((resolve) => {
    const m = S.modal({ title: 'تأكيد', size: 'narrow', body: `<div style="text-align:center;padding:6px 0"><div style="width:54px;height:54px;border-radius:50%;margin:0 auto 12px;display:grid;place-items:center;background:${danger ? 'var(--bad-bg)' : 'var(--accent-soft)'};color:${danger ? 'var(--bad)' : 'var(--accent)'}">${S.ic(danger ? 'alert' : 'help')}</div><div class="b" style="font-size:15px">${esc(msg)}</div></div>`, foot: `<button class="btn ghost" data-close>إلغاء</button><button class="btn ${danger ? 'danger' : ''}" data-yes>${esc(ok)}</button>`, onClose: () => resolve(false) });
    m.querySelector('svg').style.cssText = 'width:26px;height:26px';
    m.$('[data-yes]').onclick = () => { m.remove(); resolve(true); };
  });
  S.spinner = '<div class="spin"></div>';
  S.emptyHtml = (title, sub, icon, action) => `<div class="empty">${S.ic(icon || 'inbox')}<b>${esc(title || 'لا توجد بيانات')}</b>${sub ? `<div>${esc(sub)}</div>` : ''}${action || ''}</div>`;
  S.badge = (map, key) => { const v = map[key]; return v ? `<span class="bdg ${v[1]}">${v[0]}</span>` : `<span class="bdg l-mut">${esc(key || '—')}</span>`; };
  /**
   * Searchable single-select combobox — a modern replacement for a long <select>.
   * opts: { items:[[value,label,sub?]|{v,l,sub}], value, placeholder, searchPlaceholder, emptyText, full, disabled, onChange(value) }
   * Returns a DOM element exposing getValue()/setValue(v)/setItems(list).
   */
  S.combo = function (opts) {
    const norm = (list) => (list || []).map((it) => (Array.isArray(it) ? { v: String(it[0]), l: String(it[1] ?? ''), sub: it[2] } : { v: String(it.v), l: String(it.l ?? ''), sub: it.sub }));
    let items = norm(opts.items);
    let value = opts.value != null && opts.value !== '' ? String(opts.value) : '';
    let hi = -1, filtered = items;
    const box = document.createElement('div');
    box.className = 'combo' + (opts.full ? ' full' : '') + (opts.disabled ? ' is-disabled' : '');
    const sel = () => items.find((x) => x.v === value);
    const lbl = () => { const s = sel(); return s ? `<span class="combo-lbl">${esc(s.l)}${s.sub ? ` <span class="combo-sub">${esc(s.sub)}</span>` : ''}</span>` : `<span class="combo-ph">${esc(opts.placeholder || '— اختر —')}</span>`; };
    box.innerHTML = `<button type="button" class="combo-trigger" ${opts.disabled ? 'disabled' : ''}>${lbl()}${S.ic('chevL')}</button>
      <div class="combo-panel" hidden><div class="combo-search">${S.ic('search')}<input type="text" placeholder="${esc(opts.searchPlaceholder || 'بحث بالاسم...')}" autocomplete="off" dir="auto"></div><div class="combo-list" role="listbox"></div></div>`;
    const trigger = box.querySelector('.combo-trigger'), panel = box.querySelector('.combo-panel'), search = box.querySelector('input'), list = box.querySelector('.combo-list');
    const renderList = (q) => {
      q = (q || '').trim().toLowerCase();
      filtered = q ? items.filter((x) => (x.l + ' ' + (x.sub || '')).toLowerCase().includes(q)) : items;
      if (hi >= filtered.length) hi = filtered.length - 1;
      list.innerHTML = filtered.length
        ? filtered.map((x, i) => `<div class="combo-opt${x.v === value ? ' sel' : ''}${i === hi ? ' hi' : ''}" data-v="${esc(x.v)}" role="option">${x.v === value ? S.ic('check') : '<i class="combo-dot"></i>'}<span>${esc(x.l)}${x.sub ? ` <span class="combo-sub">${esc(x.sub)}</span>` : ''}</span></div>`).join('')
        : `<div class="combo-empty">${esc(opts.emptyText || 'لا نتائج مطابقة')}</div>`;
      list.querySelectorAll('[data-v]').forEach((el) => (el.onmousedown = (e) => { e.preventDefault(); choose(el.dataset.v); }));
      const cur = list.querySelector('.combo-opt.hi'); if (cur) cur.scrollIntoView({ block: 'nearest' });
    };
    const outside = (e) => { if (!box.contains(e.target)) close(); };
    const open = () => { if (!panel.hidden || opts.disabled) return; panel.hidden = false; box.classList.add('open'); hi = Math.max(0, filtered.findIndex((x) => x.v === value)); search.value = ''; renderList(''); setTimeout(() => search.focus(), 10); document.addEventListener('mousedown', outside, true); };
    const close = () => { if (panel.hidden) return; panel.hidden = true; box.classList.remove('open'); document.removeEventListener('mousedown', outside, true); };
    const choose = (v) => { value = String(v); trigger.innerHTML = lbl() + S.ic('chevL'); close(); opts.onChange && opts.onChange(value); };
    trigger.onclick = () => (panel.hidden ? open() : close());
    search.oninput = () => { hi = 0; renderList(search.value); };
    search.onkeydown = (e) => {
      if (e.key === 'ArrowDown') { hi = Math.min(filtered.length - 1, hi + 1); renderList(search.value); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { hi = Math.max(0, hi - 1); renderList(search.value); e.preventDefault(); }
      else if (e.key === 'Enter') { if (filtered[hi]) choose(filtered[hi].v); e.preventDefault(); }
      else if (e.key === 'Escape') { close(); trigger.focus(); }
    };
    box.getValue = () => value;
    box.setValue = (v) => { value = v != null && v !== '' ? String(v) : ''; trigger.innerHTML = lbl() + S.ic('chevL'); };
    box.setItems = (list2) => { items = norm(list2); renderList(''); };
    renderList('');
    return box;
  };
  S.prog = (p) => { p = Math.max(0, Math.min(100, +p || 0)); const c = p >= 100 ? 'var(--ok)' : p >= 60 ? 'var(--info)' : p >= 30 ? '#f2b33d' : p > 0 ? 'var(--orange)' : 'transparent'; return `<div class="prog"><i style="width:${Math.max(p, p ? 18 : 0)}%;background:${c}">${p ? p + '%' : ''}</i></div>`; };
  S.btnBusy = (b, on) => { if (!b) return; if (on) { b.dataset.html = b.innerHTML; b.disabled = true; b.innerHTML = '<span class="spin sm" style="border-top-color:#fff"></span>'; } else { b.disabled = false; if (b.dataset.html) b.innerHTML = b.dataset.html; } };

  // ------------------------------------------------------------ status maps
  S.ST = {
    student: { active: ['مفعّل', 'ok'], pending: ['معلّق', 'warn'], suspended: ['موقوف', 'bad'], withdrawn: ['منسحب', 'mut'], graduated: ['متخرّج', 'info'] },
    contract: { draft: ['مسودة', 'mut'], active: ['مفعّل', 'ok'], completed: ['مكتمل السداد', 'info'], cancelled: ['ملغي', 'bad'] },
    inst: { pending: ['غير مدفوع', 'l-mut'], partial: ['مدفوع جزئياً', 'l-warn'], paid: ['مدفوع', 'l-ok'], overdue: ['متأخر', 'l-bad'] },
    app: { new: ['جديد', 'info'], accepted: ['مقبول', 'ok'], rejected: ['مرفوض', 'bad'] },
    att: { present: ['حاضر', 'l-ok'], absent: ['غائب', 'l-bad'], late: ['متأخر', 'l-warn'], excused: ['بعذر', 'l-info'], leave: ['إجازة', 'l-info'] },
    emp: { active: ['مفعّل', 'ok'], on_leave: ['في إجازة', 'warn'], terminated: ['منتهي الخدمة', 'mut'] },
    leave: { pending: ['قيد المراجعة', 'warn'], approved: ['معتمدة', 'ok'], rejected: ['مرفوضة', 'bad'] },
    payroll: { draft: ['مسودة', 'mut'], approved: ['معتمد', 'info'], paid: ['مصروف', 'ok'] },
    expense: { unpaid: ['غير مدفوع', 'bad'], partial: ['مدفوع جزئياً', 'warn'], paid: ['مدفوع', 'ok'] },
    invoice: { draft: ['مسودة', 'mut'], issued: ['مُصدرة', 'info'], partial: ['محصّلة جزئياً', 'warn'], paid: ['محصّلة', 'ok'], cancelled: ['ملغاة', 'bad'] },
    task: { new: ['جديدة', 'mut'], in_progress: ['قيد التنفيذ', 'mut'], done: ['منتهية', 'mut'], cancelled: ['ملغاة', 'bad'] },
    taskStatus: { new: ['جديدة', 'l-mut'], in_progress: ['قيد التنفيذ', 'l-info'], done: ['منتهية', 'l-ok'], cancelled: ['ملغاة', 'l-bad'] },
    prio: { normal: ['عادي', 'info'], important: ['مهم', 'warn'], urgent: ['عاجل', 'bad'] },
    corr: { new: ['جديدة', 'info'], in_progress: ['قيد المعالجة', 'warn'], closed: ['مغلقة', 'mut'] },
    dir: { incoming: ['واردة', 'l-info'], outgoing: ['صادرة', 'l-violet'], internal: ['داخلية', 'l-mut'] },
    license: { valid: ['ساري', 'ok'], expiring: ['قارب على الانتهاء', 'warn'], expired: ['منتهي', 'bad'] },
    school: { active: ['مفعّلة', 'ok'], pending: ['بانتظار التفعيل', 'warn'], suspended: ['موقوفة', 'bad'] },
    vtype: { receipt: ['قبض', 'l-ok'], payment: ['صرف', 'l-bad'] },
  };
  S.LBL = {
    method: { cash: 'نقداً', bank: 'تحويل بنكي', card: 'بطاقة', cheque: 'شيك' },
    gender: { male: 'ذكر', female: 'أنثى' },
    feeType: { tuition: 'رسوم دراسية', registration: 'تسجيل', books: 'كتب', uniform: 'زي مدرسي', bus: 'نقل', activity: 'أنشطة', other: 'أخرى' },
    vcat: { tuition: 'رسوم دراسية', service: 'خدمات', expense: 'مصروفات', salary: 'رواتب', advance: 'سلف', purchase: 'مشتريات', other: 'أخرى' },
    party: { guardian: 'ولي أمر', customer: 'عميل', supplier: 'مورد', employee: 'موظف', other: 'أخرى' },
  };
  S.opts = (map) => Object.entries(map).map(([v, l]) => [v, Array.isArray(l) ? l[0] : l]);

  // ------------------------------------------------------------------ forms
  /**
   * Field spec: {k, l, t: text|number|money|date|month|time|email|tel|select|textarea|check|file|password|perms|sec,
   *              req, opts: [[v,l]] | fn(values) , ph, full, dir, min, max, step, help, show: fn(values)}
   */
  S.field = function (f, v) {
    if (f.t === 'sec') return `<div class="fsec">${esc(f.l)}</div>`;
    const val = v == null ? (f.def ?? '') : v;
    const req = f.req ? ' <i>*</i>' : '';
    const cls = 'fld' + (f.full || f.t === 'textarea' || f.t === 'perms' || f.t === 'checks' ? ' full' : '');
    const attrs = `name="${f.k}" ${f.req ? 'data-req="1"' : ''} ${f.ro ? 'readonly' : ''} ${f.ph ? `placeholder="${esc(f.ph)}"` : ''} ${f.dir ? `dir="${f.dir}"` : ''}`;
    let inner;
    if (f.t === 'select') {
      const opts = typeof f.opts === 'function' ? f.opts() : f.opts || [];
      inner = `<select class="inp" ${attrs}>${f.req && !f.blank ? '' : `<option value="">${esc(f.blank || '— اختر —')}</option>`}${opts.map(([ov, ol]) => `<option value="${esc(ov)}" ${String(ov) === String(val) ? 'selected' : ''}>${esc(ol)}</option>`).join('')}</select>`;
    } else if (f.t === 'textarea') inner = `<textarea class="inp" ${attrs}>${esc(val)}</textarea>`;
    else if (f.t === 'check') return `<label class="check ${f.full ? 'full' : ''}" style="align-self:end;min-height:38px"><input type="checkbox" name="${f.k}" ${val === true || val === 1 || val === '1' ? 'checked' : ''}> ${esc(f.l)}</label>`;
    else if (f.t === 'perms') {
      const cur = Array.isArray(val) ? val : [];
      inner = `<div class="permgrid">${(f.opts || []).map(([pv, pl]) => `<label class="check"><input type="checkbox" data-perm="${f.k}" value="${pv}" ${cur.includes(pv) ? 'checked' : ''}> ${esc(pl)}</label>`).join('')}</div>`;
    } else if (f.t === 'checks') {
      const cur = (Array.isArray(val) ? val : []).map(String);
      const opts = typeof f.opts === 'function' ? f.opts() : f.opts || [];
      inner = `<div class="permgrid">${opts.map(([ov, ol]) => `<label class="check"><input type="checkbox" data-check="${f.k}" value="${esc(ov)}" ${cur.includes(String(ov)) ? 'checked' : ''}> ${esc(ol)}</label>`).join('')}</div>`;
    } else if (f.t === 'file') inner = `<input class="inp" type="file" name="${f.k}" ${f.accept ? `accept="${f.accept}"` : ''} style="padding-top:6px">`;
    else {
      const type = { money: 'number', number: 'number', date: 'date', month: 'month', time: 'time', email: 'email', tel: 'tel', password: 'password' }[f.t] || 'text';
      const step = f.t === 'money' ? `step="${f.step || 0.001}" min="0"` : f.t === 'number' ? `step="${f.step || 1}" ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''}` : '';
      const d = ['money', 'number', 'date', 'month', 'time', 'email', 'tel', 'password'].includes(f.t) ? 'dir="ltr" style="text-align:right"' : '';
      inner = `<input class="inp" type="${type}" ${attrs} ${step} ${d} value="${esc(type === 'date' ? S.d(val).replace('—', '') : val)}" ${f.t === 'password' ? 'autocomplete="new-password"' : ''}>`;
    }
    return `<label class="${cls}" data-f="${f.k}" ${f.show && !f.show(S._fv || {}) ? 'style="display:none"' : ''}><span>${esc(f.l)}${req}</span>${inner}${f.help ? `<small class="muted xs">${esc(f.help)}</small>` : ''}</label>`;
  };
  S.formHtml = (fields, values, cols) => { S._fv = values || {}; return `<form class="fgrid ${cols === 3 ? 'c3' : ''}" onsubmit="return false" novalidate>${fields.map((f) => S.field(f, (values || {})[f.k])).join('')}</form>`; };
  S.readForm = function (root, fields) {
    const out = {}; let fd = null;
    for (const f of fields) {
      if (f.t === 'sec' || f.virtual) continue;
      const wrap = root.querySelector(`[data-f="${f.k}"]`);
      if (wrap && wrap.style.display === 'none') continue;
      if (f.t === 'perms') { out[f.k] = [...root.querySelectorAll(`[data-perm="${f.k}"]:checked`)].map((c) => c.value); continue; }
      if (f.t === 'checks') { out[f.k] = [...root.querySelectorAll(`[data-check="${f.k}"]:checked`)].map((c) => c.value); continue; }
      const el = root.querySelector(`[name="${f.k}"]`); if (!el) continue;
      if (f.t === 'check') { out[f.k] = el.checked; continue; }
      if (f.t === 'file') { if (el.files[0]) { fd = fd || true; out[f.k] = el.files[0]; } continue; }
      let v = el.value.trim();
      if ((f.t === 'number' || f.t === 'money') && v !== '') v = Number(v);
      if (v === '' && !f.keepEmpty) v = null;
      out[f.k] = v;
    }
    if (fd) { const form = new FormData(); Object.entries(out).forEach(([k, v]) => { if (v === null) return; if (typeof v === 'boolean') form.append(k, v ? 1 : 0); else if (Array.isArray(v)) v.forEach((x) => form.append(k + '[]', x)); else form.append(k, v); }); return form; }
    return out;
  };
  S.validate = function (root, fields) {
    let ok = true; root.querySelectorAll('.ferr').forEach((e) => e.remove()); root.querySelectorAll('.inp.err').forEach((e) => e.classList.remove('err'));
    for (const f of fields) {
      if (!f.req) continue;
      const wrap = root.querySelector(`[data-f="${f.k}"]`); if (!wrap || wrap.style.display === 'none') continue;
      const el = root.querySelector(`[name="${f.k}"]`);
      if (el && !el.value.trim()) { ok = false; el.classList.add('err'); el.insertAdjacentHTML('afterend', '<small class="ferr">هذا الحقل مطلوب</small>'); }
    }
    return ok;
  };
  S.showErrors = function (root, err) {
    const errs = (err && err.data && err.data.errors) || {};
    Object.entries(errs).forEach(([k, msgs]) => { const el = root.querySelector(`[name="${k.split('.')[0]}"]`); if (el) { el.classList.add('err'); el.insertAdjacentHTML('afterend', `<small class="ferr">${esc(msgs[0])}</small>`); } });
  };
  /** Open a form modal; onSave(values) must return a promise. */
  S.formModal = function ({ title, fields, values, onSave, size, cols, saveText, extra, afterRender }) {
    const m = S.modal({ title, size: size || (fields.length > 8 ? 'wide' : ''), body: S.formHtml(fields, values, cols) + (extra || ''), foot: `<button class="btn ghost" data-close>إلغاء</button><button class="btn" data-save>${S.ic('check')} ${esc(saveText || 'حفظ')}</button>` });
    const form = m.$('form');
    const refresh = () => { const cur = S.readForm(form, fields.filter((f) => f.t !== 'file')); fields.forEach((f) => { if (f.show) { const w = form.querySelector(`[data-f="${f.k}"]`); if (w) w.style.display = f.show(cur) ? '' : 'none'; } }); };
    form.addEventListener('change', refresh);
    afterRender && afterRender(m, form);
    const save = async () => {
      if (!S.validate(form, fields)) return;
      const btn = m.$('[data-save]'); S.btnBusy(btn, true);
      try { await onSave(S.readForm(form, fields), m); m.close(); }
      catch (e) { S.toast(e.message, 'bad'); S.showErrors(form, e); S.btnBusy(btn, false); }
    };
    m.$('[data-save]').onclick = save;
    form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); save(); } });
    return m;
  };
  S.kv = (pairs) => `<div class="kv">${pairs.filter((p) => p && p[1] !== undefined).map(([k, v]) => `<div><span>${esc(k)}</span><b>${v === null || v === '' ? '—' : v}</b></div>`).join('')}</div>`;

  // ------------------------------------------------------------------ charts
  S.chart = {};
  // Catmull-Rom → cubic Bézier; control points are clamped to [minY, maxY] so the curve never dips below the axis.
  const smoothPath = (pts, minY = -Infinity, maxY = Infinity) => {
    if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : '';
    const cl = (v) => Math.max(minY, Math.min(maxY, v));
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i - 1] || pts[i], [x1, y1] = pts[i], [x2, y2] = pts[i + 1], [x3, y3] = pts[i + 2] || pts[i + 1];
      const t = 0.18;
      d += ` C${x1 + (x2 - x0) * t},${cl(y1 + (y2 - y0) * t)} ${x2 - (x3 - x1) * t},${cl(y2 - (y3 - y1) * t)} ${x2},${y2}`;
    }
    return d;
  };
  const niceMax = (v) => { if (v <= 0) return 10; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; };
  const shortN = (v) => (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e3 ? S.num(Math.round(v)) : S.num(Math.round(v * 10) / 10));
  /** Smooth area/line chart. series: [{name,color,data:[]}] */
  S.chart.area = function (el, { labels, series, height = 260, money }) {
    const W = Math.max(el.clientWidth || 600, 280), H = height, pl = 56, pr = 16, pt = 14, pb = 30;
    const max = niceMax(Math.max(1, ...series.flatMap((s) => s.data)));
    const x = (i) => (labels.length < 2 ? (W - pl - pr) / 2 + pl : pr + (i * (W - pl - pr)) / (labels.length - 1));
    const xr = (i) => W - x(i); // RTL: first label at the right
    const y = (v) => pt + (H - pt - pb) * (1 - v / max);
    let svg = `<svg viewBox="0 0 ${W} ${H}" height="${H}"><defs>${series.map((s, i) => `<linearGradient id="g${i}${el.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".22"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient>`).join('')}</defs>`;
    for (let k = 0; k <= 4; k++) { const v = (max * k) / 4, yy = y(v); svg += `<line class="grid-l" x1="${pr}" x2="${W - pl + 8}" y1="${yy}" y2="${yy}"/><text x="${W - 4}" y="${yy + 4}" text-anchor="end">${shortN(v)}</text>`; }
    labels.forEach((l, i) => { svg += `<text x="${xr(i)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`; });
    series.forEach((s, si) => {
      const pts = s.data.map((v, i) => [xr(i), y(v)]);
      const line = smoothPath(pts, pt, y(0));
      if (pts.length) svg += `<path d="${line} L${pts[pts.length - 1][0]},${y(0)} L${pts[0][0]},${y(0)} Z" fill="url(#g${si}${el.id})"/>`;
      svg += `<path d="${line}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linecap="round"/>`;
      pts.forEach(([px, py]) => { svg += `<circle cx="${px}" cy="${py}" r="3" fill="var(--card)" stroke="${s.color}" stroke-width="2"/>`; });
    });
    labels.forEach((_, i) => { svg += `<rect data-i="${i}" x="${xr(i) - (W - pl - pr) / Math.max(1, labels.length - 1) / 2}" y="0" width="${(W - pl - pr) / Math.max(1, labels.length - 1)}" height="${H - pb}" fill="transparent"/>`; });
    svg += '</svg>';
    el.innerHTML = `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div><div class="chart">${svg}<div class="ctip"></div></div>`;
    const tip = el.querySelector('.ctip'), box = el.querySelector('.chart');
    el.querySelectorAll('rect[data-i]').forEach((r) => {
      r.onmouseenter = () => { const i = +r.dataset.i; tip.innerHTML = `<b>${esc(labels[i])}</b><br>` + series.map((s) => `<span style="color:${s.color}">●</span> ${esc(s.name)}: ${money ? S.moneyT(s.data[i]) : S.num(s.data[i])}`).join('<br>'); const bb = box.getBoundingClientRect(), rb = r.getBoundingClientRect(); tip.style.left = rb.left - bb.left + rb.width / 2 - tip.offsetWidth + 'px'; tip.style.top = Math.min(...series.map((s) => y(s.data[i]))) + 'px'; tip.style.opacity = 1; };
      r.onmouseleave = () => (tip.style.opacity = 0);
    });
  };
  /** Vertical grouped bars. */
  S.chart.bars = function (el, { labels, series, height = 240, money }) {
    const W = Math.max(el.clientWidth || 600, 280), H = height, pl = 56, pr = 10, pt = 10, pb = 30;
    const max = niceMax(Math.max(1, ...series.flatMap((s) => s.data)));
    const y = (v) => pt + (H - pt - pb) * (1 - v / max);
    const gw = (W - pl - pr) / Math.max(1, labels.length), bw = Math.min(26, (gw * 0.7) / series.length);
    let svg = `<svg viewBox="0 0 ${W} ${H}" height="${H}">`;
    for (let k = 0; k <= 4; k++) { const v = (max * k) / 4, yy = y(v); svg += `<line class="grid-l" x1="${pr}" x2="${W - pl + 8}" y1="${yy}" y2="${yy}"/><text x="${W - 4}" y="${yy + 4}" text-anchor="end">${shortN(v)}</text>`; }
    labels.forEach((l, i) => {
      const cx = W - pl - gw * i - gw / 2;
      svg += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`;
      series.forEach((s, si) => { const v = s.data[i] || 0, bx = cx - (series.length * bw) / 2 + si * bw + 1; svg += `<rect x="${bx}" y="${y(v)}" width="${bw - 2}" height="${Math.max(0, y(0) - y(v))}" rx="4" fill="${s.color}"><title>${esc(s.name)}: ${money ? S.moneyT(v) : S.num(v)}</title></rect>`; });
    });
    el.innerHTML = (series.length > 1 ? `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : '') + `<div class="chart">${svg}</svg></div>`;
  };
  S.chart.donut = function (el, { items, size = 150, center }) {
    const total = items.reduce((a, b) => a + (+b.value || 0), 0) || 1, r = size / 2 - 12, c = 2 * Math.PI * r;
    let off = 0, arcs = '';
    items.forEach((it) => { const len = ((+it.value || 0) / total) * c; arcs += `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${it.color}" stroke-width="18" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${size / 2} ${size / 2})"><title>${esc(it.label)}: ${S.num(it.value)}</title></circle>`; off += len; });
    el.innerHTML = `<div class="donut-wrap"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--soft-2)" stroke-width="18"/>${arcs}<text x="50%" y="48%" text-anchor="middle" style="font-family:var(--head);font-weight:700;font-size:20px;fill:var(--text)">${esc(center ?? S.num(total))}</text><text x="50%" y="63%" text-anchor="middle" style="font-size:11px;fill:var(--muted)">الإجمالي</text></svg><div class="donut-leg">${items.map((it) => `<span><i style="background:${it.color}"></i>${esc(it.label)} — <b>${it.fmt || S.num(it.value)}</b></span>`).join('')}</div></div>`;
  };
  S.chart.hbars = (el, items, fmt) => { const max = Math.max(1, ...items.map((i) => +i.value || 0)); el.innerHTML = `<div class="bars-h">${items.map((i) => `<div class="r"><span class="l" title="${esc(i.label)}">${esc(i.label)}</span><span class="t"><i style="width:${((+i.value || 0) / max) * 100}%;background:${i.color || 'var(--accent)'}"></i></span><span class="n num">${fmt ? fmt(i.value) : S.num(i.value)}</span></div>`).join('') || S.emptyHtml()}</div>`; };
  S.PALETTE = ['#4f46e5', '#14a06b', '#ea7a1e', '#e0384c', '#0f9d9a', '#7c5ce6', '#d98a0b', '#2f7ae5', '#db2777', '#64748b'];

  // -------------------------------------------------------------- Excel/CSV
  let xlsxP;
  S.xlsx = () => (xlsxP = xlsxP || new Promise((res, rej) => { if (window.XLSX) return res(window.XLSX); const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = () => res(window.XLSX); s.onerror = () => { xlsxP = null; rej(new Error('تعذّر تحميل مكتبة Excel')); }; document.head.appendChild(s); }));
  /** cols: [{l, v: row => value}] */
  S.exportXlsx = async function (filename, cols, rows) {
    try {
      const X = await S.xlsx();
      const data = [cols.map((c) => c.l), ...rows.map((r) => cols.map((c) => { const v = c.v(r); return v == null ? '' : v; }))];
      const ws = X.utils.aoa_to_sheet(data); ws['!cols'] = cols.map(() => ({ wch: 20 })); ws['!views'] = [{ RTL: true }];
      const wb = X.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] }; X.utils.book_append_sheet(wb, ws, 'Sheet1');
      X.writeFile(wb, filename + '.xlsx');
    } catch (e) { S.toast(e.message, 'bad'); }
  };
  /** Ask for a file, parse first sheet, map Arabic/English headers → keys. map: {key: ['header ar', 'header en']} */
  S.importXlsx = (map) => new Promise((resolve, reject) => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx,.xls,.csv';
    inp.onchange = async () => {
      try {
        const X = await S.xlsx(); const f = inp.files[0]; if (!f) return;
        const wb = X.read(await f.arrayBuffer(), { cellDates: true }); const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = X.utils.sheet_to_json(ws, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
        const norm = (s) => String(s).trim().toLowerCase();
        resolve(raw.map((r) => { const o = {}; Object.entries(r).forEach(([h, v]) => { const key = Object.keys(map).find((k) => map[k].map(norm).includes(norm(h))); if (key) o[key] = typeof v === 'string' ? v.trim() : v; }); return o; }).filter((o) => Object.keys(o).length));
      } catch (e) { reject(e); }
    };
    inp.click();
  });
  S.templateXlsx = async (filename, headers, sample) => { const X = await S.xlsx(); const ws = X.utils.aoa_to_sheet([headers, ...(sample || [])]); ws['!cols'] = headers.map(() => ({ wch: 22 })); const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Sheet1'); X.writeFile(wb, filename + '.xlsx'); };

  // ------------------------------------------------------------------- print
  /** Official grade report / certificate — shared by the admin app and the teacher portal. */
  S.printReportCard = function (d) {
    const s = d.student, ov = d.overall || {}, terms = d.terms || [], res = d.result || {}, scale = d.scale || [];
    const g = (x) => (x ? (x.letter || '') + (x.remark ? ' — ' + x.remark : '') : '—');
    const html = `
      <h2>كشف درجات${d.year ? ' — العام الدراسي ' + esc(d.year.name) : ''}</h2>
      <div class="kv">
        <div><span>الطالب</span><b>${esc(s.name)}</b></div>
        <div><span>الرقم المدرسي</span><b>${esc(s.student_no || '—')}</b></div>
        <div><span>رقم الهوية</span><b>${esc(s.national_id || '—')}</b></div>
        <div><span>الصف / الشعبة</span><b>${esc(S.gs(s, ''))}</b></div>
        <div><span>ولي الأمر</span><b>${esc(s.guardian && s.guardian.name || '—')}</b></div>
        <div><span>تاريخ الإصدار</span><b>${S.d(d.issued_at || S.today())}</b></div>
      </div>
      <table><thead><tr><th>المادة</th>${terms.map((t) => `<th>${esc(t.name)} (${S.fmtN(t.weight, 0)}%)</th>`).join('')}<th>النتيجة</th><th>التقدير</th></tr></thead><tbody>
      ${d.rows.map((r) => `<tr><td style="text-align:right">${esc(r.subject.name_ar)} <small style="color:#777">(من ${S.fmtN(r.subject.max_mark, 0)})</small></td>${terms.map((t) => `<td>${r.term_marks[t.id] != null ? S.fmtN(r.term_marks[t.id], 1) : '—'}</td>`).join('')}<td>${r.percent != null ? S.fmtN(r.percent, 1) + '%' : '—'}</td><td>${g(r.grade)}</td></tr>`).join('')}
      <tr class="tot"><td>المعدل العام</td><td colspan="${terms.length}"></td><td>${ov.percent != null ? S.fmtN(ov.percent, 1) + '%' : '—'}</td><td>${g(ov.grade)}</td></tr>
      </tbody></table>
      <div class="big" style="color:${res.pass ? '#14a06b' : '#e0384c'}">النتيجة النهائية: ${esc(res.status || '—')}${res.failed ? ' (راسب في ' + S.num(res.failed) + ' مادة)' : ''}${d.rank && d.rank.position ? ' · الترتيب ' + S.num(d.rank.position) + ' من ' + S.num(d.rank.of) : ''}</div>
      ${scale.length ? `<div style="margin-top:10px;font-size:12px"><b>مفتاح التقديرات:</b> ${scale.map((x) => `${x.letter} (${esc(x.remark)}) ${S.fmtN(x.min, 0)}% فأكثر`).join(' &nbsp;·&nbsp; ')}</div>` : ''}
      <div class="sig"><div>معلم الفصل</div><div>مدير المدرسة</div><div>ولي الأمر</div></div>`;
    S.print('كشف درجات — ' + s.name, html);
  };

  S.print = function (title, html, opts = {}) {
    const me = S.me() || {}; const co = me.company || opts.company || {};
    const w = window.open('', '_blank', 'width=900,height=1000'); if (!w) { S.toast('اسمح بالنوافذ المنبثقة للطباعة', 'bad'); return; }
    w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet">
    <style>*{box-sizing:border-box}body{font-family:'IBM Plex Sans Arabic',sans-serif;color:#111;margin:0;padding:28px;font-size:13px}
    .ph{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #222;padding-bottom:12px;margin-bottom:18px}
    .ph h1{margin:0;font-size:19px}.ph .m{color:#555;font-size:12px;line-height:1.7}.ph img{height:60px}
    h2{font-size:17px;text-align:center;margin:6px 0 16px;padding:8px;background:#f1f3f7;border-radius:8px}
    table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #bbb;padding:7px 8px;text-align:center}th{background:#f1f3f7}
    .kv{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin:8px 0}.kv div{display:flex;justify-content:space-between;border-bottom:1px dashed #ccc;padding:5px 0}.kv span{color:#555}
    .tot{font-weight:700;background:#f7f7f7}.sig{display:flex;justify-content:space-between;margin-top:60px}.sig div{text-align:center;width:30%;border-top:1px solid #333;padding-top:6px}
    .big{font-size:22px;font-weight:700;text-align:center;border:2px dashed #333;padding:12px;border-radius:10px;margin:14px 0}
    .foot{margin-top:30px;color:#777;font-size:11px;text-align:center}@media print{body{padding:10px}}</style></head><body>
    <div class="ph"><div><h1>${esc(co.name || 'سكوول')}</h1><div class="m">${co.name_en ? esc(co.name_en) + '<br>' : ''}${co.license_number ? 'ترخيص الوزارة: ' + esc(co.license_number) : ''}${co.license_number && co.cr_number ? ' · ' : ''}${co.cr_number ? 'س.ت: ' + esc(co.cr_number) : ''}${co.license_number || co.cr_number ? '<br>' : ''}${co.phone ? esc(co.phone) + (co.city ? ' · ' + esc(co.city) : '') + '<br>' : ''}${new Date().toLocaleString('ar-OM-u-nu-latn')}</div></div>${co.logo ? `<img src="${esc(co.logo)}">` : ''}</div>
    ${html}<div class="foot">طُبع من نظام سكوول لإدارة المدارس</div><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
    w.document.close();
  };

  // ------------------------------------------------------------- misc helpers
  /**
   * Wrap a render function that rewrites a container's innerHTML from inside its
   * own input 'change' handlers: blurs the focused field first (so its change
   * fires before the DOM is replaced) and ignores re-entrant calls.
   */
  S.safeDraw = (root, fn) => {
    let busy = false;
    return function draw() {
      if (busy) return;
      busy = true;
      try { const a = document.activeElement; if (a && root.contains(a) && a.blur) a.blur(); fn(); } finally { busy = false; }
    };
  };
  S.copy = (t) => navigator.clipboard && navigator.clipboard.writeText(t).then(() => S.toast('تم النسخ', 'ok'));
})();
