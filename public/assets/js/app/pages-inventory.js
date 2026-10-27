/* سكوول — inventory: assets & consumables, locations, stock movements (ledger), low-stock alerts, dashboard. */
(function () {
  'use strict';
  const { esc, ic } = S;
  const TYPE = { asset: ['أصل / عُهدة', 'l-info'], consumable: ['مستهلك', 'l-violet'] };
  const COND = { good: ['جيد', 'l-ok'], needs_repair: ['يحتاج صيانة', 'l-warn'], damaged: ['تالف', 'l-bad'] };
  const MOVE = { in: ['إدخال', 'l-ok'], out: ['صرف', 'l-bad'], transfer: ['نقل', 'l-info'], adjust: ['تسوية جرد', 'l-warn'], dispose: ['إتلاف', 'l-mut'] };
  const catOpts = (lk) => (lk.inv_categories || []).map((c) => [c.id, S.enName(c)]);
  const locOpts = (lk) => (lk.inv_locations || []).map((l) => [l.id, S.enName(l)]);
  const lowStock = (r) => r.type === 'consumable' && +r.min_quantity > 0 && +r.quantity <= +r.min_quantity;
  const offline = (e) => S.local && S.local.isOfflineError(e) && S.db;
  const OFF = { offline: true, status: 503 };
  const signed = (x) => (x.type === 'in' ? '+' : x.type === 'out' || x.type === 'dispose' ? '−' : x.type === 'adjust' && +x.quantity < 0 ? '−' : '') + S.fmtN(Math.abs(+x.quantity), 2);
  const qtyCls = (x) => (x.type === 'in' || (x.type === 'adjust' && +x.quantity > 0) ? 'ok-t' : x.type === 'transfer' ? '' : 'bad-t');

  // ---------------------------------------------------------------- movement dialog
  function moveDialog(item, done, lk, items) {
    const locs = locOpts(lk);
    const fields = [
      ...(item ? [] : [{ k: 'item_id', l: 'الصنف', t: 'select', req: true, opts: (items || []).map((i) => [i.id, `${i.name} (${S.fmtN(i.quantity, 2)} ${i.unit || ''})`]) }]),
      { k: 'type', l: 'نوع الحركة', t: 'select', req: true, opts: S.opts(MOVE), def: 'in' },
      { k: 'quantity', l: 'الكمية', t: 'number', step: 0.01, req: true, help: 'في «تسوية جرد» أدخل الفرق (موجباً أو سالباً)' },
      { k: 'to_location_id', l: 'إلى الموقع', t: 'select', opts: locs, blank: '— بدون —', show: (v) => v.type === 'in' || v.type === 'transfer' },
      { k: 'from_location_id', l: 'من الموقع', t: 'select', opts: locs, blank: '— الموقع الحالي —', show: (v) => v.type === 'out' || v.type === 'transfer' || v.type === 'dispose' },
      { k: 'date', l: 'التاريخ', t: 'date', def: S.today() },
      { k: 'reason', l: 'السبب / البيان', full: true, ph: 'مثال: صرف لفصل 1-أ، شراء من المورد…' },
    ];
    S.formModal({
      title: 'حركة مخزن' + (item ? ' — ' + item.name : ''), fields, values: { type: 'in', date: S.today(), from_location_id: item ? item.location_id || '' : '' }, saveText: 'تسجيل الحركة',
      onSave: async (v) => { const r = await S.post('/app/inventory-movements', { ...v, item_id: item ? item.id : v.item_id, quantity: +v.quantity }); if (!(r && r._queued)) S.toast('تم تسجيل الحركة', 'ok'); done && done(); },
    });
  }

  // ------------------------------------------------------------------ item view
  async function itemView(id, reload, lk) {
    const m = S.modal({ title: 'تفاصيل الصنف', size: 'xwide', body: S.spinner, foot: '<div id="cf" class="row wrap grow" style="justify-content:flex-end"></div>' });
    const refresh = async () => {
      let it, mv;
      try {
        if (navigator.onLine === false) throw OFF;
        it = await S.get('/app/inventory-items/' + id); mv = await S.get('/app/inventory-movements', { item_id: id, all: 1 });
        if ((it._fromCache || mv._fromCache) && S.db) throw OFF;
      } catch (e) {
        if (!offline(e)) { m.body.innerHTML = S.emptyHtml('تعذّر تحميل الصنف', e.message, 'alert'); return; }
        it = await S.db.get('inventory-items', id);
        mv = { data: (await S.db.all('inventory-movements')).filter((x) => String(x.item_id) === String(id)).sort((a, b) => String(b.date).localeCompare(String(a.date)) || (String(b.id) > String(a.id) ? 1 : -1)) };
      }
      if (!it) { m.body.innerHTML = S.emptyHtml('لا توجد نسخة محفوظة من هذا الصنف على الجهاز'); return; }
      m.$('h3').innerHTML = `${esc(it.name)} ${S.badge(TYPE, it.type)}${it._pending ? ' <span class="bdg l-warn">بانتظار الرفع</span>' : ''}`;
      m.body.innerHTML = `<div class="grid g4 mb16">${S.ui.stat('c-blue', 'layers', `${S.fmtN(it.quantity, 2)} <small>${esc(it.unit || '')}</small>`, 'الكمية الحالية')}${S.ui.stat('c-violet', 'coins', S.money(it.unit_cost, true), 'سعر الوحدة')}${S.ui.stat('c-green', 'chart', S.money(+it.quantity * +it.unit_cost, true), 'القيمة الإجمالية')}<div class="stat c-orange"><div class="grow"><div class="k mb8">الحالة</div>${S.badge(COND, it.condition)}${lowStock(it) ? ' <span class="bdg l-bad">نقص</span>' : ''}</div></div></div>
        ${S.kv([['الفئة', esc(it.category?.name || '—')], ['الموقع', esc(it.location?.name || '—')], ['الرقم التسلسلي', `<span class="num">${esc(it.serial_no || '—')}</span>`], ['تاريخ الشراء', it.purchase_date ? `<span class="num">${S.d(it.purchase_date)}</span>` : '—'], ['حدّ إعادة الطلب', `<span class="num">${S.fmtN(it.min_quantity, 2)}</span>`], ['ملاحظات', esc(it.notes || '—')]])}
        <div class="sec-t">${ic('swap')} سجل الحركات (${S.num(mv.data.length)})</div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>التاريخ</th><th>النوع</th><th>الكمية</th><th>من</th><th>إلى</th><th class="s">السبب</th><th>بواسطة</th><th></th></tr></thead><tbody>
        ${mv.data.map((x) => `<tr class="${x._pending ? 'pending' : ''}"><td class="num">${S.d(x.date)}</td><td>${S.badge(MOVE, x.type)}</td><td class="num b ${qtyCls(x)}">${signed(x)}</td><td>${esc(x.from_location?.name || '—')}</td><td>${esc(x.to_location?.name || '—')}</td><td class="s muted">${esc(x.reason || '—')}</td><td>${esc(x.creator?.name || '—')}</td><td>${x._pending ? '<span class="bdg l-warn">⏳</span>' : `<button class="ibtn d" data-undo="${x.id}" title="إلغاء الحركة">${ic('trash')}</button>`}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">لا توجد حركات</td></tr>'}
        </tbody></table></div>`;
      m.body.querySelectorAll('[data-undo]').forEach((b) => (b.onclick = async () => { if (!(await S.confirm('إلغاء هذه الحركة؟ ستُعاد الكمية كما كانت قبلها.', 'إلغاء الحركة'))) return; try { await S.del('/app/inventory-movements/' + b.dataset.undo); S.toast('تم إلغاء الحركة', 'ok'); refresh(); reload && reload(); } catch (e) { S.toast(e.message, 'bad'); } }));
      const f = m.$('#cf');
      f.innerHTML = `<button class="btn soft" data-a="move">${ic('swap')} حركة مخزن</button><a class="btn ghost" href="#/inventory-item-form/${it.id}">${ic('edit')} تعديل</a><button class="btn ghost" data-close>إغلاق</button>`;
      f.querySelector('[data-close]').onclick = m.close;
      f.querySelector('[data-a="move"]').onclick = () => moveDialog(it, () => { refresh(); reload && reload(); }, lk);
    };
    refresh();
  }

  // ---------------------------------------------------------------- items
  const itemFields = (lk, row) => [
    { t: 'sec', l: 'بيانات الصنف' },
    { k: 'name', l: 'اسم الصنف', req: true, full: true }, { k: 'name_en', l: 'اسم الصنف بالإنجليزية', dir: 'ltr', full: true },
    { k: 'type', l: 'النوع', t: 'select', req: true, opts: S.opts(TYPE), def: 'asset', help: 'أصل/عُهدة: أثاث وأجهزة تُتابَع بالعدد والحالة — مستهلك: قرطاسية ومواد تنقص بالصرف' },
    { k: 'category_id', l: 'الفئة', t: 'select', opts: catOpts(lk), blank: '— بدون فئة —' },
    { k: 'location_id', l: 'الموقع', t: 'select', opts: locOpts(lk), blank: '— غير محدد —' },
    { k: 'unit', l: 'الوحدة', ph: 'قطعة، علبة، كرتون…' },
    { k: 'condition', l: 'الحالة', t: 'select', opts: S.opts(COND), def: 'good' },
    { t: 'sec', l: 'الكمية والقيمة' },
    ...(row ? [] : [{ k: 'quantity', l: 'الكمية الافتتاحية', t: 'number', min: 0, step: 0.01, def: 0, help: 'تُسجَّل كحركة إدخال افتتاحية؛ بعد ذلك تتغيّر الكمية عبر حركات المخزن فقط' }]),
    { k: 'min_quantity', l: 'حدّ إعادة الطلب', t: 'number', min: 0, step: 0.01, def: 0, help: 'للمستهلكات: يظهر تنبيه نقص عند الوصول إليه' },
    { k: 'unit_cost', l: 'سعر الوحدة', t: 'number', min: 0, step: 0.001, def: 0 },
    { k: 'purchase_date', l: 'تاريخ الشراء', t: 'date' },
    { k: 'serial_no', l: 'الرقم التسلسلي', dir: 'ltr' },
    { k: 'notes', l: 'ملاحظات', t: 'textarea', full: true },
  ];
  S.page('inventory-items', S.crud({
    title: 'الأصناف', singular: 'صنف', api: '/app/inventory-items', perm: 'inventory', icon: 'box', lookups: ['inv_categories', 'inv_locations'], invalidate: [], editPage: 'inventory-item-form',
    search: 'بحث باسم الصنف أو الرقم التسلسلي…',
    chips: { k: 'type', items: [['asset', 'أصول'], ['consumable', 'مستهلكات']] },
    filters: [{ k: 'category_id', l: 'الفئة', all: 'كل الفئات', opts: catOpts }, { k: 'location_id', l: 'الموقع', all: 'كل المواقع', opts: locOpts }, { k: 'condition', l: 'الحالة', all: 'كل الحالات', opts: S.opts(COND) }, { k: 'low', l: 'النقص', all: 'الكل', opts: [['1', 'تحت حدّ إعادة الطلب']] }],
    columns: [
      { l: 'الصنف', s: true, v: (r) => `<a class="lk" href="#" data-open><b>${esc(r.name)}</b></a>${r.serial_no ? `<div class="muted xs num">${esc(r.serial_no)}</div>` : ''}` },
      { l: 'النوع', v: (r) => S.badge(TYPE, r.type) }, { l: 'الفئة', v: (r) => esc(r.category?.name || '—') }, { l: 'الموقع', v: (r) => esc(r.location?.name || '—') },
      { l: 'الكمية', v: (r) => `<b class="num ${lowStock(r) ? 'bad-t' : ''}">${S.fmtN(r.quantity, 2)}</b> <span class="muted xs">${esc(r.unit || '')}</span>${lowStock(r) ? ' <span class="bdg l-bad">نقص</span>' : ''}` },
      { l: 'سعر الوحدة', v: (r) => `<span class="num">${S.money(r.unit_cost)}</span>` }, { l: 'القيمة', v: (r) => `<b class="num">${S.money(+r.quantity * +r.unit_cost)}</b>` },
      { l: 'الحالة', v: (r) => S.badge(COND, r.condition) },
    ],
    rowActions: [{ ic: 'swap', cls: 'p', t: 'حركة مخزن', run: (r, ctx) => moveDialog(r, ctx.reload, ctx.lk) }],
    view: (r, ctx) => itemView(r.id, ctx.reload, ctx.lk),
    foot: (rows) => `<tr><td colspan="7" class="s">إجمالي الصفحة</td><td class="num">${S.money(rows.reduce((a, r) => a + +r.quantity * +r.unit_cost, 0))}</td><td colspan="2"></td></tr>`,
    exportCols: [{ l: 'الصنف', v: (r) => r.name }, { l: 'النوع', v: (r) => TYPE[r.type]?.[0] }, { l: 'الفئة', v: (r) => r.category?.name }, { l: 'الموقع', v: (r) => r.location?.name }, { l: 'الكمية', v: (r) => +r.quantity }, { l: 'الوحدة', v: (r) => r.unit }, { l: 'سعر الوحدة', v: (r) => +r.unit_cost }, { l: 'القيمة', v: (r) => +r.quantity * +r.unit_cost }, { l: 'الحالة', v: (r) => COND[r.condition]?.[0] }, { l: 'الرقم التسلسلي', v: (r) => r.serial_no }, { l: 'تاريخ الشراء', v: (r) => r.purchase_date ? S.d(r.purchase_date) : '' }],
  }));
  S.page('inventory-item-form', S.formPage({
    api: '/app/inventory-items', title: 'الأصناف', singular: 'صنف', perm: 'inventory', backTo: 'inventory-items', lookups: ['inv_categories', 'inv_locations'], invalidate: [], fields: itemFields,
    context: (row) => row
      ? `<div class="card pad"><div class="sec-t" style="margin-top:0">${ic('box')} ملخص الصنف</div>${S.kv([['الكمية الحالية', `<span class="num">${S.fmtN(row.quantity, 2)}</span> ${esc(row.unit || '')}`], ['القيمة', S.moneyT(+row.quantity * +row.unit_cost)], ['الحالة', S.badge(COND, row.condition)]])}<p class="muted sm mt8">الكمية تتغيّر عبر «حركة مخزن» من قائمة الأصناف حتى يبقى السجل دقيقاً.</p></div>`
      : `<div class="card pad"><p class="muted sm">${ic('box')} أدخل بيانات الصنف وكميته الافتتاحية. الأثاث والأجهزة = <b>أصل</b>، والقرطاسية ومواد التنظيف = <b>مستهلك</b> مع حدّ إعادة طلب لتنبيهك عند النقص.</p></div>`,
  }));

  // ------------------------------------------------------- categories / locations
  S.page('inventory-categories', S.crud({
    title: 'فئات المخزون', singular: 'فئة', api: '/app/inventory-categories', perm: 'inventory', icon: 'tag', invalidate: ['inv_categories'],
    search: 'بحث باسم الفئة…',
    fields: () => [{ k: 'name', l: 'اسم الفئة', req: true, full: true, ph: 'أثاث، أجهزة، قرطاسية، معدات مختبر…' }, { k: 'name_en', l: 'الاسم بالإنجليزية', dir: 'ltr', full: true }, { k: 'sort', l: 'الترتيب', t: 'number', min: 0 }],
    columns: [{ l: 'الفئة', s: true, v: (r) => `<b>${esc(r.name)}</b>` }, { l: 'عدد الأصناف', v: (r) => `<a href="#/inventory-items?category_id=${r.id}" class="num">${S.num(r.items_count ?? 0)}</a>` }, { l: 'الترتيب', v: (r) => `<span class="num">${esc(r.sort ?? 0)}</span>` }],
  }));
  S.page('inventory-locations', S.crud({
    title: 'المواقع والمخازن', singular: 'موقع', api: '/app/inventory-locations', perm: 'inventory', icon: 'layers', invalidate: ['inv_locations'],
    search: 'بحث باسم الموقع…',
    fields: () => [{ k: 'name', l: 'اسم الموقع', req: true, full: true, ph: 'المخزن الرئيسي، مختبر العلوم، الفصل 1-أ…' }, { k: 'name_en', l: 'الاسم بالإنجليزية', dir: 'ltr', full: true }, { k: 'notes', l: 'ملاحظات', t: 'textarea', full: true }],
    columns: [{ l: 'الموقع', s: true, v: (r) => `<b>${esc(S.enName(r))}</b>` }, { l: 'عدد الأصناف', v: (r) => `<a href="#/inventory-items?location_id=${r.id}" class="num">${S.num(r.items_count ?? 0)}</a>` }, { l: 'ملاحظات', v: (r) => `<span class="muted sm">${esc(r.notes || '—')}</span>` }],
  }));

  // ---------------------------------------------------------------- movements
  S.page('inventory-movements', {
    perm: 'inventory', title: 'حركات المخزن',
    async render(el, params) {
      const lk = await S.L(['inv_locations']);
      const st = { type: params.type || '', from: '', to: '' };
      el.innerHTML = `${S.head('inventory-movements')}<div class="toolbar"><button class="btn" id="add">${ic('plus')} حركة جديدة</button>
        <label class="fld" style="flex-direction:row;align-items:center;gap:8px"><span>النوع</span><select class="inp" id="tp" style="width:150px"><option value="">الكل</option>${Object.entries(MOVE).map(([k, v]) => `<option value="${k}" ${st.type === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></label>
        <label class="fld" style="flex-direction:row;align-items:center;gap:8px"><span>من</span><input class="inp" type="date" id="f" dir="ltr" style="width:150px"></label><label class="fld" style="flex-direction:row;align-items:center;gap:8px"><span>إلى</span><input class="inp" type="date" id="t" dir="ltr" style="width:150px"></label>
        <button class="btn ghost" id="go">${ic('search')} عرض</button><div class="sp"></div></div><div id="list">${S.spinner}</div>`;
      const $ = (s) => el.querySelector(s);
      const fetchItems = async () => {
        try { if (navigator.onLine === false) throw OFF; const r = await S.get('/app/inventory-items', { all: 1 }); if (r._fromCache && S.db) throw OFF; return r.data; }
        catch (e) { if (offline(e)) return await S.db.all('inventory-items'); throw e; }
      };
      const load = async () => {
        $('#list').innerHTML = S.spinner;
        let d;
        try { if (navigator.onLine === false) throw OFF; d = await S.get('/app/inventory-movements', { type: st.type, from: st.from, to: st.to, per_page: 100 }); if (d._fromCache && S.db) throw OFF; }
        catch (e) {
          if (!offline(e)) { $('#list').innerHTML = S.emptyHtml('تعذّر تحميل الحركات', e.message, 'alert'); return; }
          let rows = await S.db.all('inventory-movements');
          if (st.type) rows = rows.filter((x) => x.type === st.type);
          if (st.from) rows = rows.filter((x) => String(x.date).slice(0, 10) >= st.from);
          if (st.to) rows = rows.filter((x) => String(x.date).slice(0, 10) <= st.to);
          rows.sort((a, b) => String(b.date).localeCompare(String(a.date)) || (String(b.id) > String(a.id) ? 1 : -1));
          d = { data: rows.slice(0, 100) };
        }
        const rows = d.data || [];
        $('#list').innerHTML = rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>التاريخ</th><th class="s">الصنف</th><th>النوع</th><th>الكمية</th><th>من</th><th>إلى</th><th class="s">السبب</th><th>بواسطة</th><th>الإجراءات</th></tr></thead><tbody>
          ${rows.map((x, i) => `<tr class="${x._pending ? 'pending' : ''}"><td class="muted">${i + 1}</td><td class="num">${S.d(x.date)}</td><td class="s b">${esc(x.item?.name || '—')}</td><td>${S.badge(MOVE, x.type)}</td><td class="num b ${qtyCls(x)}">${signed(x)} <span class="muted xs">${esc(x.item?.unit || '')}</span></td><td>${esc(x.from_location?.name || '—')}</td><td>${esc(x.to_location?.name || '—')}</td><td class="s muted">${esc(x.reason || '—')}</td><td>${esc(x.creator?.name || '—')}</td><td>${x._pending ? '<span class="bdg l-warn">⏳ بانتظار الرفع</span>' : `<button class="ibtn d" data-undo="${x.id}" title="إلغاء الحركة">${ic('trash')}</button>`}</td></tr>`).join('')}
          </tbody></table></div>` : S.emptyHtml('لا توجد حركات', 'سجّل أول حركة من زر «حركة جديدة»', 'swap');
        $('#list').querySelectorAll('[data-undo]').forEach((b) => (b.onclick = async () => { if (!(await S.confirm('إلغاء هذه الحركة؟ ستُعاد الكمية كما كانت قبلها.', 'إلغاء الحركة'))) return; try { await S.del('/app/inventory-movements/' + b.dataset.undo); S.toast('تم إلغاء الحركة', 'ok'); load(); } catch (e) { S.toast(e.message, 'bad'); } }));
      };
      $('#add').onclick = async () => { let items; try { items = await fetchItems(); } catch (e) { return S.toast(e.message, 'bad'); } if (!items.length) return S.toast('أضف أصنافاً أولاً', 'bad'); moveDialog(null, load, lk, items); };
      $('#go').onclick = () => { st.type = $('#tp').value; st.from = $('#f').value; st.to = $('#t').value; load(); };
      $('#tp').onchange = $('#go').onclick;
      await load();
    },
  });

  // ---------------------------------------------------------------- dashboard
  S.page('inventory', {
    perm: 'inventory', title: 'لوحة المخزن',
    async render(el) {
      el.innerHTML = `${S.head('inventory')}<div id="b">${S.spinner}</div>`;
      let d;
      try { if (navigator.onLine === false) throw OFF; d = await S.get('/app/dashboard/inventory'); if (d._fromCache && S.db) throw OFF; }
      catch (e) {
        if (!offline(e)) { el.querySelector('#b').innerHTML = S.emptyHtml('تعذّر تحميل اللوحة', e.message, 'alert'); return; }
        const items = await S.db.all('inventory-items'); const val = (i) => +i.quantity * +i.unit_cost;
        const low = items.filter(lowStock); const byCat = {};
        items.forEach((i) => { const k = (i.category && i.category.name) || 'بدون فئة'; byCat[k] = byCat[k] || { label: k, count: 0, value: 0 }; byCat[k].count++; byCat[k].value += val(i); });
        d = { local: true, items: items.length, assets: items.filter((i) => i.type === 'asset').length, consumables: items.filter((i) => i.type === 'consumable').length, total_value: items.reduce((a, i) => a + val(i), 0), low_count: low.length, low: low.sort((a, b) => +a.quantity - +b.quantity).slice(0, 10), needs_repair: items.filter((i) => i.condition === 'needs_repair').length, damaged: items.filter((i) => i.condition === 'damaged').length, by_category: Object.values(byCat).sort((a, b) => b.value - a.value), recent: (await S.db.all('inventory-movements')).sort((a, b) => (String(b.id) > String(a.id) ? 1 : -1)).slice(0, 10) };
      }
      el.querySelector('#b').innerHTML = `${d.local ? `<div class="card pad mb16 row gap8" style="background:var(--warn-bg);border-color:transparent">${ic('alert')}<span class="sm"><b>بيانات محلية</b><span class="muted"> — تعرض النسخة المحفوظة على هذا الجهاز</span></span></div>` : ''}
        <div class="grid g4 mb16">${S.ui.stat('c-blue', 'box', S.num(d.items), 'عدد الأصناف')}${S.ui.stat('c-violet', 'layers', `${S.num(d.assets)} / ${S.num(d.consumables)}`, 'أصول / مستهلكات')}${S.ui.stat('c-green', 'coins', S.money(d.total_value, true), 'إجمالي القيمة')}${S.ui.stat(d.low_count ? 'c-red' : 'c-teal', 'alert', S.num(d.low_count), 'أصناف تحت الحد')}</div>
        <div class="grid g2">
          <div class="card"><div class="hd"><h3>${ic('alert')} أصناف تحتاج إعادة طلب</h3><div class="sp"></div><a class="btn ghost xs" href="#/inventory-items?type=consumable&low=1">عرض الكل</a></div><div class="bd">${d.low.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="s">الصنف</th><th>المتوفر</th><th>الحد</th></tr></thead><tbody>${d.low.map((i) => `<tr><td class="s b">${esc(i.name)}</td><td class="num bad-t b">${S.fmtN(i.quantity, 2)} ${esc(i.unit || '')}</td><td class="num muted">${S.fmtN(i.min_quantity, 2)}</td></tr>`).join('')}</tbody></table></div>` : S.emptyHtml('لا يوجد نقص', 'كل المستهلكات فوق حدّ إعادة الطلب', 'check')}</div></div>
          <div class="card"><div class="hd"><h3>${ic('chart')} القيمة حسب الفئة</h3></div><div class="bd" id="cats"></div></div>
        </div>
        <div class="card mt16"><div class="hd"><h3>${ic('swap')} آخر الحركات</h3><div class="sp"></div><span class="bdg l-warn">${S.num(d.needs_repair)} تحتاج صيانة</span><span class="bdg l-bad" style="margin-inline-start:6px">${S.num(d.damaged)} تالفة</span><a class="btn ghost xs" href="#/inventory-movements" style="margin-inline-start:8px">كل الحركات</a></div><div class="bd">${d.recent.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>التاريخ</th><th class="s">الصنف</th><th>النوع</th><th>الكمية</th><th class="s">السبب</th></tr></thead><tbody>${d.recent.map((x) => `<tr><td class="num">${S.d(x.date)}</td><td class="s b">${esc(x.item?.name || '—')}</td><td>${S.badge(MOVE, x.type)}</td><td class="num ${qtyCls(x)}">${signed(x)}</td><td class="s muted">${esc(x.reason || '—')}</td></tr>`).join('')}</tbody></table></div>` : S.emptyHtml('لا توجد حركات بعد', 'ابدأ بإضافة الأصناف ثم سجّل الحركات', 'swap')}</div></div>`;
      const cats = (d.by_category || []);
      if (cats.length) S.chart.hbars(el.querySelector('#cats'), cats.map((c, i) => ({ label: `${c.label} (${c.count})`, value: +c.value, color: S.PALETTE[i % S.PALETTE.length] })), (v) => S.money(v, true));
      else el.querySelector('#cats').innerHTML = S.emptyHtml('لا توجد أصناف بعد', 'أضف الأصناف لتظهر قيمتها حسب الفئة', 'box');
    },
  });
})();
