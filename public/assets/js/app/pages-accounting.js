/* سكوول — accounting: service invoices, customers, expenses, categories, suppliers, vouchers, cash accounts, reports. */
(function () {
  'use strict';
  const { esc, ic, cell } = S;
  const caOpts = (lk) => (lk.cash_accounts || []).map((a) => [a.id, a.name]);

  // ---------------------------------------------------------------- customers
  S.page('customers', S.crud({
    title: 'العملاء', singular: 'عميل', api: '/app/customers', perm: 'accounting', icon: 'user', invalidate: ['customers'],
    search: 'بحث بالاسم أو الجوال أو الرقم الضريبي...',
    columns: [{ l: 'العميل', s: true, v: (r) => cell.name(r.name, esc(r.email || '')) }, { l: 'الجوال', v: (r) => cell.phone(r.phone) }, { l: 'الرقم الضريبي', v: (r) => cell.num(r.tax_number || '—') }, { l: 'الفواتير', v: (r) => cell.cnt(r.invoices_count) }, { l: 'الرصيد المستحق', v: (r) => `<span class="num ${+r.balance_due ? 'bad-t b' : ''}">${S.fmtN(r.balance_due)}</span>` }],
    fields: () => [{ k: 'name', l: 'اسم العميل / الجهة', req: true, full: true }, { k: 'phone', l: 'الجوال', t: 'tel' }, { k: 'email', l: 'البريد', t: 'email' }, { k: 'tax_number', l: 'الرقم الضريبي', dir: 'ltr' }, { k: 'address', l: 'العنوان' }, { k: 'notes', l: 'ملاحظات', t: 'textarea' }],
    rowActions: [{ ic: 'file', cls: 'v', t: 'الفواتير', run: (r) => (location.hash = '#/service-invoices?customer_id=' + r.id) }],
    exportCols: [{ l: 'العميل', v: (r) => r.name }, { l: 'الجوال', v: (r) => r.phone }, { l: 'البريد', v: (r) => r.email }, { l: 'الرقم الضريبي', v: (r) => r.tax_number }, { l: 'الرصيد المستحق', v: (r) => +r.balance_due }],
  }));

  // ---------------------------------------------------------------- suppliers
  S.page('suppliers', S.crud({
    title: 'الموردون', singular: 'مورد', api: '/app/suppliers', perm: 'accounting', icon: 'truck', invalidate: ['suppliers'],
    search: 'بحث بالاسم أو الجوال...',
    columns: [{ l: 'المورد', s: true, v: (r) => cell.name(r.name, esc(r.contact_person || '')) }, { l: 'الجوال', v: (r) => cell.phone(r.phone) }, { l: 'البريد', v: (r) => esc(r.email || '—') }, { l: 'الرقم الضريبي', v: (r) => cell.num(r.tax_number || '—') }, { l: 'الفواتير', v: (r) => cell.cnt(r.expenses_count) }, { l: 'المستحق له', v: (r) => `<span class="num ${+r.balance_due ? 'bad-t b' : ''}">${S.fmtN(r.balance_due)}</span>` }],
    fields: () => [{ k: 'name', l: 'اسم المورد', req: true, full: true }, { k: 'contact_person', l: 'الشخص المسؤول' }, { k: 'phone', l: 'الجوال', t: 'tel' }, { k: 'email', l: 'البريد', t: 'email' }, { k: 'tax_number', l: 'الرقم الضريبي', dir: 'ltr' }, { k: 'address', l: 'العنوان', full: true }, { k: 'notes', l: 'ملاحظات', t: 'textarea' }],
    rowActions: [{ ic: 'receipt', cls: 'v', t: 'فواتير المصروفات', run: (r) => (location.hash = '#/expenses?supplier_id=' + r.id) }],
  }));

  // ---------------------------------------------------------------- expense categories
  S.page('expense-categories', S.crud({
    title: 'فئات المصاريف', singular: 'فئة', api: '/app/expense-categories', perm: 'accounting', icon: 'tag', invalidate: ['expense_categories'],
    columns: [{ l: 'الفئة', s: true, v: (r) => `<span class="row"><i style="width:12px;height:12px;border-radius:4px;background:${esc(r.color)}"></i><b>${esc(r.name)}</b></span>` }, { l: 'عدد المصروفات', v: (r) => cell.cnt(r.expenses_count) }, { l: 'الإجمالي', v: (r) => S.money(r.expenses_total) }],
    fields: () => [{ k: 'name', l: 'اسم الفئة', req: true }, { k: 'color', l: 'اللون', t: 'select', opts: [['#4f46e5', 'نيلي'], ['#14a06b', 'أخضر'], ['#ea7a1e', 'برتقالي'], ['#e0384c', 'أحمر'], ['#0ea5e9', 'سماوي'], ['#7c5ce6', 'بنفسجي'], ['#d98a0b', 'ذهبي'], ['#db2777', 'وردي'], ['#64748b', 'رمادي']], def: '#4f46e5' }],
    search: 'بحث...',
  }));

  // ---------------------------------------------------------------- expenses
  S.page('expenses', S.crud({
    title: 'فواتير المصروفات', singular: 'مصروف', api: '/app/expenses', perm: 'accounting', icon: 'receipt', lookups: ['expense_categories', 'suppliers', 'cash_accounts', 'branches'],
    search: 'رقم الفاتورة أو الوصف أو المورد...',
    chips: { k: 'status', items: S.opts(S.ST.expense) },
    filters: [{ k: 'expense_category_id', l: 'الفئة', opts: (lk) => lk.expense_categories.map((c) => [c.id, c.name]) }, { k: 'supplier_id', l: 'المورد', opts: (lk) => lk.suppliers.map((c) => [c.id, c.name]) }, { k: 'from', l: 'من تاريخ', t: 'date' }, { k: 'to', l: 'إلى تاريخ', t: 'date' }],
    columns: [
      { l: 'الرقم', v: (r) => `<a class="lk num" href="#" data-open>${esc(r.number)}</a>` }, { l: 'التاريخ', v: (r) => cell.num(S.d(r.date)) }, { l: 'الوصف', s: true, v: (r) => esc(r.description) },
      { l: 'الفئة', v: (r) => (r.category ? `<span class="bdg" style="background:${esc(r.category.color)}22;color:${esc(r.category.color)}">${esc(r.category.name)}</span>` : '—') }, { l: 'المورد', v: (r) => esc(r.supplier?.name || '—') },
      { l: 'الإجمالي', v: (r) => `<b class="num">${S.fmtN(r.total)}</b>` }, { l: 'المدفوع', v: (r) => `<span class="num ok-t">${S.fmtN(r.paid)}</span>` }, { l: 'الحالة', v: (r) => S.badge(S.ST.expense, r.status) }, { l: 'مرفق', v: (r) => cell.file(r.attachment) },
    ],
    fields: (lk, row) => [
      { k: 'description', l: 'الوصف', req: true, full: true }, { k: 'date', l: 'التاريخ', t: 'date', req: true, def: S.today() }, { k: 'expense_category_id', l: 'الفئة', t: 'select', opts: lk.expense_categories.map((c) => [c.id, c.name]) },
      { k: 'supplier_id', l: 'المورد', t: 'select', opts: lk.suppliers.map((c) => [c.id, c.name]) }, { k: 'branch_id', l: 'الفرع', t: 'select', opts: lk.branches.map((c) => [c.id, c.name]) },
      { k: 'amount', l: 'المبلغ قبل الضريبة', t: 'money', req: true }, { k: 'tax', l: 'الضريبة', t: 'money', def: 0 }, { k: 'file', l: 'مرفق (فاتورة/إيصال)', t: 'file', full: true },
      ...(row ? [] : [{ t: 'sec', l: 'الدفع' }, { k: 'pay_now', l: 'تم الدفع الآن (إنشاء سند صرف)', t: 'check', def: true }, { k: 'cash_account_id', l: 'من الصندوق/الحساب', t: 'select', opts: caOpts(lk), show: (v) => v.pay_now }, { k: 'method', l: 'طريقة الدفع', t: 'select', opts: S.opts(S.LBL.method), def: 'cash', show: (v) => v.pay_now }]),
    ],
    newDefaults: () => ({ pay_now: true, date: S.today(), method: 'cash' }),
    rowActions: [{ ic: 'coins', cls: 'g', t: 'تسجيل دفع', show: (r) => r.status !== 'paid', run: (r, ctx) => S.payDialog({ title: 'دفع المصروف ' + r.number, max: +r.total - +r.paid, onPay: async (v) => { const res = await S.post(`/app/expenses/${r.id}/pay`, v); S.toast(res.message, 'ok'); ctx.reload(); } }) }],
    viewFields: (r) => [['الرقم', esc(r.number)], ['التاريخ', S.d(r.date)], ['الوصف', esc(r.description)], ['الفئة', esc(r.category?.name || '—')], ['المورد', esc(r.supplier?.name || '—')], ['المبلغ', S.money(r.amount)], ['الضريبة', S.money(r.tax)], ['الإجمالي', S.money(r.total)], ['المدفوع', S.money(r.paid)], ['الحالة', S.badge(S.ST.expense, r.status)], ['المرفق', r.attachment ? `<a class="lk" target="_blank" href="${esc(r.attachment)}">فتح</a>` : '—'], ['سندات الصرف', (r.payments || []).map((p) => `<span class="num">${esc(p.number)} (${S.fmtN(p.amount)})</span>`).join('، ') || '—']],
    foot: (rows) => `<tr><td colspan="6" class="s">إجمالي الصفحة</td><td class="num">${S.fmtN(rows.reduce((a, r) => a + +r.total, 0))}</td><td class="num ok-t">${S.fmtN(rows.reduce((a, r) => a + +r.paid, 0))}</td><td colspan="3"></td></tr>`,
    exportCols: [{ l: 'الرقم', v: (r) => r.number }, { l: 'التاريخ', v: (r) => S.d(r.date) }, { l: 'الوصف', v: (r) => r.description }, { l: 'الفئة', v: (r) => r.category?.name }, { l: 'المورد', v: (r) => r.supplier?.name }, { l: 'الإجمالي', v: (r) => +r.total }, { l: 'المدفوع', v: (r) => +r.paid }, { l: 'الحالة', v: (r) => S.ST.expense[r.status][0] }],
  }));

  // ---------------------------------------------------------------- service invoices
  async function invoiceForm(inv, ctx) {
    const lk = await S.L(['customers']);
    const me = S.me();
    const st = { customer_id: inv?.customer_id || '', customer_name: inv?.customer_name || '', date: S.d(inv?.date) !== '—' ? S.d(inv.date) : S.today(), due_date: inv?.due_date ? S.d(inv.due_date) : '', discount: +(inv?.discount || 0), tax_rate: inv ? +inv.tax_rate : +(me.company.tax_rate || 0), notes: inv?.notes || '', items: inv?.items?.map((i) => ({ description: i.description, qty: +i.qty, price: +i.price })) || [{ description: '', qty: 1, price: 0 }] };
    const m = S.modal({ title: inv ? 'تعديل فاتورة ' + inv.number : 'فاتورة خدمات جديدة', size: 'wide', sticky: true, body: '<div id="fb"></div>', foot: `<button class="btn ghost" data-close>إلغاء</button><button class="btn" id="sv">${ic('check')} حفظ الفاتورة</button>` });
    const draw = S.safeDraw(m.body, () => {
      const sub = st.items.reduce((a, i) => a + i.qty * i.price, 0), disc = Math.min(sub, st.discount), tax = ((sub - disc) * st.tax_rate) / 100;
      m.$('#fb').innerHTML = `<div class="fgrid mb16"><label class="fld"><span>العميل</span><select class="inp" id="cu"><option value="">— عميل نقدي —</option>${lk.customers.map((c) => `<option value="${c.id}" ${String(c.id) === String(st.customer_id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label><label class="fld"><span>اسم العميل (إن لم يكن مسجلاً)</span><input class="inp" id="cn" value="${esc(st.customer_name)}"></label><label class="fld"><span>تاريخ الفاتورة</span><input class="inp" type="date" id="d" value="${st.date}" dir="ltr"></label><label class="fld"><span>تاريخ الاستحقاق</span><input class="inp" type="date" id="dd" value="${st.due_date}" dir="ltr"></label></div>
        <div class="tbl-wrap mb8"><table class="tbl"><thead><tr><th class="s">الوصف</th><th style="width:90px">الكمية</th><th style="width:130px">السعر</th><th style="width:120px">الإجمالي</th><th style="width:44px"></th></tr></thead><tbody>${st.items.map((it, i) => `<tr><td><input class="inp" data-i="${i}" data-k="description" value="${esc(it.description)}" placeholder="وصف الخدمة"></td><td><input class="inp num" type="number" min="0" step="0.01" data-i="${i}" data-k="qty" value="${it.qty}" dir="ltr"></td><td><input class="inp num" type="number" min="0" step="0.001" data-i="${i}" data-k="price" value="${it.price}" dir="ltr"></td><td class="num b">${S.fmtN(it.qty * it.price)}</td><td><button class="ibtn d" data-rm="${i}">${ic('trash')}</button></td></tr>`).join('')}</tbody></table></div>
        <button class="btn ghost sm" id="add">${ic('plus')} بند جديد</button>
        <div class="grid g2 mt16"><div class="fgrid"><label class="fld"><span>الخصم</span><input class="inp" type="number" min="0" step="0.001" id="ds" value="${st.discount}" dir="ltr"></label><label class="fld"><span>الضريبة %</span><input class="inp" type="number" min="0" step="0.01" id="tx" value="${st.tax_rate}" dir="ltr"></label><label class="fld full"><span>ملاحظات</span><input class="inp" id="nt" value="${esc(st.notes)}"></label></div>
        <div class="sumbox"><div class="r"><span>الإجمالي الفرعي</span><b>${S.money(sub)}</b></div><div class="r"><span>الخصم</span><b>− ${S.money(disc)}</b></div><div class="r"><span>الضريبة</span><b>${S.money(tax)}</b></div><div class="r t"><span>الإجمالي</span><span>${S.money(sub - disc + tax)}</span></div></div></div>`;
      const $ = (s) => m.$(s);
      $('#cu').onchange = (e) => (st.customer_id = e.target.value); $('#cn').oninput = (e) => (st.customer_name = e.target.value); $('#d').onchange = (e) => (st.date = e.target.value); $('#dd').onchange = (e) => (st.due_date = e.target.value);
      $('#ds').onchange = (e) => { st.discount = +e.target.value || 0; draw(); }; $('#tx').onchange = (e) => { st.tax_rate = +e.target.value || 0; draw(); }; $('#nt').oninput = (e) => (st.notes = e.target.value);
      m.body.querySelectorAll('[data-i]').forEach((inp) => (inp.onchange = () => { const it = st.items[+inp.dataset.i]; it[inp.dataset.k] = inp.dataset.k === 'description' ? inp.value : +inp.value || 0; draw(); }));
      m.body.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { if (st.items.length > 1) { st.items.splice(+b.dataset.rm, 1); draw(); } }));
      $('#add').onclick = () => { st.items.push({ description: '', qty: 1, price: 0 }); draw(); };
    });
    draw();
    m.$('#sv').onclick = async (e) => {
      if (st.items.some((i) => !i.description.trim())) return S.toast('أدخل وصف كل البنود', 'bad');
      const _btn = e.currentTarget; S.btnBusy(_btn, true);
      try { inv ? await S.patch('/app/service-invoices/' + inv.id, st) : await S.post('/app/service-invoices', st); S.toast('تم حفظ الفاتورة', 'ok'); m.close(); ctx.reload(); }
      catch (er) { S.toast(er.message, 'bad'); S.btnBusy(_btn, false); }
    };
  }
  const printInvoice = async (r) => {
    const inv = await S.get('/app/service-invoices/' + r.id);
    S.print('فاتورة ' + inv.number, `<h2>فاتورة خدمات رقم ${esc(inv.number)}</h2><div class="kv"><div><span>العميل</span><b>${esc(inv.customer_name || inv.customer?.name || 'عميل نقدي')}</b></div><div><span>التاريخ</span><b>${S.d(inv.date)}</b></div><div><span>تاريخ الاستحقاق</span><b>${S.d(inv.due_date)}</b></div><div><span>الحالة</span><b>${S.ST.invoice[inv.status][0]}</b></div></div>
      <table><thead><tr><th>#</th><th>الوصف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${inv.items.map((i, k) => `<tr><td>${k + 1}</td><td style="text-align:right">${esc(i.description)}</td><td>${+i.qty}</td><td>${S.fmtN(i.price)}</td><td>${S.fmtN(i.total)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="4">الإجمالي الفرعي</td><td>${S.fmtN(inv.subtotal)}</td></tr>${+inv.discount ? `<tr><td colspan="4">الخصم</td><td>${S.fmtN(inv.discount)}</td></tr>` : ''}${+inv.tax ? `<tr><td colspan="4">الضريبة ${inv.tax_rate}%</td><td>${S.fmtN(inv.tax)}</td></tr>` : ''}<tr class="tot"><td colspan="4">الإجمالي</td><td>${S.moneyT(inv.total)}</td></tr><tr><td colspan="4">المدفوع</td><td>${S.fmtN(inv.paid)}</td></tr><tr class="tot"><td colspan="4">المتبقي</td><td>${S.moneyT(inv.total - inv.paid)}</td></tr></tbody></table>${inv.notes ? `<p>${esc(inv.notes)}</p>` : ''}<div class="sig"><div>المستلم</div><div>المحاسب</div><div>الختم</div></div>`);
  };
  S.page('service-invoices', S.crud({
    title: 'فواتير الخدمات', singular: 'فاتورة', api: '/app/service-invoices', perm: 'accounting', icon: 'fileText', lookups: ['customers'],
    search: 'رقم الفاتورة أو اسم العميل...',
    passParams: ['customer_id'],
    chips: { k: 'status', items: [['issued', 'مُصدرة'], ['partial', 'محصّلة جزئياً'], ['paid', 'محصّلة'], ['cancelled', 'ملغاة']] },
    filters: [{ k: 'customer_id', l: 'العميل', opts: (lk) => lk.customers.map((c) => [c.id, c.name]) }, { k: 'from', l: 'من تاريخ', t: 'date' }, { k: 'to', l: 'إلى تاريخ', t: 'date' }],
    columns: [{ l: 'رقم الفاتورة', v: (r) => `<b class="num">${esc(r.number)}</b>` }, { l: 'العميل', s: true, v: (r) => esc(r.customer_name || r.customer?.name || 'عميل نقدي') }, { l: 'التاريخ', v: (r) => cell.num(S.d(r.date)) }, { l: 'الاستحقاق', v: (r) => cell.num(S.d(r.due_date)) }, { l: 'الإجمالي', v: (r) => `<b class="num">${S.fmtN(r.total)}</b>` }, { l: 'المحصّل', v: (r) => `<span class="num ok-t">${S.fmtN(r.paid)}</span>` }, { l: 'المتبقي', v: (r) => `<span class="num bad-t">${S.fmtN(r.total - r.paid)}</span>` }, { l: 'الحالة', v: (r) => S.badge(S.ST.invoice, r.status) }],
    customForm: (row, ctx) => invoiceForm(row, ctx), loadForEdit: true, fields: () => [], canEdit: (r) => !+r.paid && r.status !== 'cancelled', canDelete: (r) => !+r.paid,
    rowActions: [
      { ic: 'coins', cls: 'g', t: 'تحصيل', show: (r) => ['issued', 'partial'].includes(r.status), run: (r, ctx) => S.payDialog({ title: 'تحصيل الفاتورة ' + r.number, max: +r.total - +r.paid, onPay: async (v) => { const res = await S.post(`/app/service-invoices/${r.id}/pay`, v); S.toast(res.message, 'ok'); ctx.reload(); } }) },
      { ic: 'printer', cls: 'p', t: 'طباعة', run: printInvoice },
      { ic: 'x', cls: 'd', t: 'إلغاء الفاتورة', show: (r) => r.status === 'issued', run: async (r, ctx) => { if (await S.confirm('إلغاء الفاتورة ' + r.number + '؟', 'إلغاء الفاتورة')) { try { await S.post(`/app/service-invoices/${r.id}/cancel`); S.toast('تم الإلغاء', 'ok'); ctx.reload(); } catch (e) { S.toast(e.message, 'bad'); } } } },
    ],
    exportCols: [{ l: 'رقم الفاتورة', v: (r) => r.number }, { l: 'العميل', v: (r) => r.customer_name }, { l: 'التاريخ', v: (r) => S.d(r.date) }, { l: 'الإجمالي', v: (r) => +r.total }, { l: 'المحصّل', v: (r) => +r.paid }, { l: 'الحالة', v: (r) => S.ST.invoice[r.status][0] }],
  }));

  // ---------------------------------------------------------------- vouchers (receipts / payments)
  const voucherPage = (type) => S.crud({
    title: type === 'receipt' ? 'سندات القبض' : 'سندات الصرف', singular: type === 'receipt' ? 'سند قبض' : 'سند صرف', api: '/app/vouchers', perm: 'accounting', icon: type === 'receipt' ? 'download' : 'upload', lookups: ['cash_accounts'],
    fixed: { type }, search: 'رقم السند أو الجهة أو الوصف...',
    filters: [{ k: 'category', l: 'التصنيف', opts: S.opts(S.LBL.vcat) }, { k: 'cash_account_id', l: 'الصندوق / الحساب', opts: caOpts }, { k: 'from', l: 'من تاريخ', t: 'date' }, { k: 'to', l: 'إلى تاريخ', t: 'date' }],
    summary: (res) => `<div class="grid g3 mb16">${S.ui.stat(type === 'receipt' ? 'c-green' : 'c-red', type === 'receipt' ? 'download' : 'upload', S.money(type === 'receipt' ? res.sums.receipts : res.sums.payments, true), 'الإجمالي حسب الفلتر')}${S.ui.stat('c-blue', 'receipt', S.num(res.total), 'عدد السندات')}</div>`,
    columns: [{ l: 'رقم السند', v: (r) => `<b class="num">${esc(r.number)}</b>` }, { l: 'التاريخ', v: (r) => cell.num(S.d(r.date)) }, { l: type === 'receipt' ? 'المستلم منه' : 'المصروف له', v: (r) => `<span class="clip" title="${esc(r.party_name || '')}">${esc(r.party_name || '—')}</span>` }, { l: 'التصنيف', v: (r) => `<span class="bdg l-info">${S.LBL.vcat[r.category] || r.category}</span>` }, { l: 'الوصف', s: true, v: (r) => `<span class="sm clip" title="${esc(r.description || '')}">${esc(r.description || '—')}</span>` }, { l: 'المبلغ', v: (r) => `<b class="num ${type === 'receipt' ? 'ok-t' : 'bad-t'}">${S.fmtN(r.amount)}</b>` }, { l: 'الطريقة', v: (r) => S.LBL.method[r.method] || r.method }, { l: 'الصندوق', v: (r) => esc(r.cash_account?.name || '—') }, { l: 'المصدر', v: (r) => (r.source_type ? '<span class="bdg l-violet">تلقائي</span>' : '<span class="bdg l-mut">يدوي</span>') }],
    fields: (lk) => [{ k: 'date', l: 'التاريخ', t: 'date', req: true, def: S.today() }, { k: 'amount', l: 'المبلغ', t: 'money', req: true }, { k: 'party_name', l: type === 'receipt' ? 'استلمنا من' : 'صُرف إلى', req: true }, { k: 'party_type', l: 'نوع الجهة', t: 'select', opts: S.opts(S.LBL.party), def: 'other' }, { k: 'category', l: 'التصنيف', t: 'select', req: true, opts: S.opts(S.LBL.vcat), def: 'other' }, { k: 'cash_account_id', l: 'الصندوق / الحساب', t: 'select', opts: caOpts(lk) }, { k: 'method', l: 'طريقة الدفع', t: 'select', opts: S.opts(S.LBL.method), def: 'cash' }, { k: 'reference', l: 'رقم المرجع', dir: 'ltr' }, { k: 'description', l: 'وذلك عن', full: true, req: true }],
    toPayload: (v) => ({ ...v, type }), newDefaults: () => ({ date: S.today(), method: 'cash', category: 'other' }),
    canEdit: (r) => !r.source_type, canDelete: (r) => !r.source_type,
    rowActions: [{ ic: 'printer', cls: 'p', t: 'طباعة', run: (r) => S.printReceipt(r) }],
    exportCols: [{ l: 'رقم السند', v: (r) => r.number }, { l: 'التاريخ', v: (r) => S.d(r.date) }, { l: 'الجهة', v: (r) => r.party_name }, { l: 'التصنيف', v: (r) => S.LBL.vcat[r.category] }, { l: 'الوصف', v: (r) => r.description }, { l: 'المبلغ', v: (r) => +r.amount }, { l: 'الطريقة', v: (r) => S.LBL.method[r.method] }],
  });
  S.page('receipts', voucherPage('receipt'));
  S.page('payments-out', voucherPage('payment'));

  // ---------------------------------------------------------------- cash accounts
  S.page('cash-accounts', S.crud({
    title: 'الصناديق والبنوك', singular: 'حساب', api: '/app/cash-accounts', perm: 'accounting', icon: 'bank', invalidate: ['cash_accounts'], search: false,
    summary: (res) => `<div class="grid g3 mb16">${S.ui.stat('c-green', 'wallet', S.money(res.data.reduce((a, r) => a + +r.balance, 0), true), 'إجمالي النقدية المتاحة')}${S.ui.stat('c-blue', 'download', S.money(res.data.reduce((a, r) => a + +r.total_in, 0), true), 'إجمالي الوارد')}${S.ui.stat('c-red', 'upload', S.money(res.data.reduce((a, r) => a + +r.total_out, 0), true), 'إجمالي الصادر')}</div>`,
    columns: [{ l: 'الحساب', s: true, v: (r) => `<div class="av-row"><span class="avatar">${ic(r.type === 'bank' ? 'bank' : 'wallet')}</span><div><b>${esc(r.name)}</b><div class="muted xs">${esc(r.bank_name || (r.type === 'cash' ? 'صندوق نقدي' : ''))}</div></div></div>` }, { l: 'النوع', v: (r) => (r.type === 'bank' ? 'بنك' : 'نقدي') }, { l: 'رقم الحساب / الآيبان', v: (r) => `<span class="num xs">${esc(r.iban || r.account_no || '—')}</span>` }, { l: 'الرصيد الافتتاحي', v: (r) => `<span class="num">${S.fmtN(r.opening_balance)}</span>` }, { l: 'الوارد', v: (r) => `<span class="num ok-t">${S.fmtN(r.total_in)}</span>` }, { l: 'الصادر', v: (r) => `<span class="num bad-t">${S.fmtN(r.total_out)}</span>` }, { l: 'الرصيد الحالي', v: (r) => `<b class="num ${+r.balance < 0 ? 'bad-t' : 'acc-t'}">${S.fmtN(r.balance)}</b>` }, { l: 'الحالة', v: (r) => (r.is_active ? '<span class="bdg ok">مفعّل</span>' : '<span class="bdg mut">معطّل</span>') }],
    fields: () => [{ k: 'name', l: 'اسم الحساب', req: true }, { k: 'type', l: 'النوع', t: 'select', req: true, opts: [['cash', 'صندوق نقدي'], ['bank', 'حساب بنكي']], def: 'cash' }, { k: 'bank_name', l: 'اسم البنك', show: (v) => v.type === 'bank' }, { k: 'account_no', l: 'رقم الحساب', dir: 'ltr', show: (v) => v.type === 'bank' }, { k: 'iban', l: 'IBAN', dir: 'ltr', show: (v) => v.type === 'bank' }, { k: 'opening_balance', l: 'الرصيد الافتتاحي', t: 'money' }, { k: 'is_active', l: 'مفعّل', t: 'check', def: true }],
    newDefaults: () => ({ is_active: true, type: 'cash' }),
    rowActions: [{ ic: 'activity', cls: 'v', t: 'كشف الحركات', run: (r) => (location.hash = '#/receipts?cash_account_id=' + r.id) }],
  }));

  // ---------------------------------------------------------------- reports
  S.page('reports', {
    perm: 'accounting', title: 'التقارير المالية',
    async render(el, params) {
      const y = new Date().getFullYear();
      let tab = params.tab || 'pl';
      el.innerHTML = `${S.head('reports')}<div class="filters"><label class="fld"><span>من تاريخ</span><input class="inp" type="date" id="f" value="${y}-01-01" dir="ltr"></label><label class="fld"><span>إلى تاريخ</span><input class="inp" type="date" id="t" value="${y}-12-31" dir="ltr"></label><button class="btn" id="go">${ic('search')} عرض</button><button class="btn ghost" onclick="window.print()">${ic('printer')} طباعة</button></div>
        <div class="tabs"><button data-t="pl">قائمة الدخل الشهرية</button><button data-t="cat">حسب التصنيف</button><button data-t="debts">مديونيات أولياء الأمور</button><button data-t="grades">التحصيل حسب الصف</button></div><div id="rb">${S.spinner}</div>`;
      let d;
      const VC = S.LBL.vcat;
      const draw = () => {
        el.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
        const rb = el.querySelector('#rb'), t = d.totals;
        const head = `<div class="grid g4 mb16">${S.ui.stat('c-blue', 'trendUp', S.money(t.revenue, true), 'الإيرادات')}${S.ui.stat('c-red', 'trendDown', S.money(t.expenses, true), 'المصروفات')}${S.ui.stat(t.profit < 0 ? 'c-red' : 'c-green', 'smile', S.money(t.profit, true), 'صافي الربح')}${S.ui.stat('c-teal', 'money', S.money(t.receipts, true), 'المقبوضات الفعلية')}</div>`;
        if (tab === 'pl') {
          rb.innerHTML = head + `<div class="card mb16"><div class="bd" id="plc"></div></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>الشهر</th><th>الإيرادات</th><th>المصروفات</th><th>صافي الربح</th><th>المقبوضات</th></tr></thead><tbody>${d.monthly.map((m) => `<tr><td class="b">${S.monthLabel(m.month)}</td><td class="num">${S.fmtN(m.revenue)}</td><td class="num">${S.fmtN(m.expenses)}</td><td class="num b ${m.profit < 0 ? 'bad-t' : 'ok-t'}">${S.fmtN(m.profit)}</td><td class="num">${S.fmtN(m.receipts)}</td></tr>`).join('')}</tbody><tfoot><tr><td>الإجمالي</td><td class="num">${S.fmtN(t.revenue)}</td><td class="num">${S.fmtN(t.expenses)}</td><td class="num">${S.fmtN(t.profit)}</td><td class="num">${S.fmtN(t.receipts)}</td></tr></tfoot></table></div>`;
          S.chart.bars(rb.querySelector('#plc'), { labels: d.monthly.map((m) => S.monthLabel(m.month, true)), series: [{ name: 'الإيرادات', color: '#14a06b', data: d.monthly.map((m) => m.revenue) }, { name: 'المصروفات', color: '#e0384c', data: d.monthly.map((m) => m.expenses) }], money: true });
        } else if (tab === 'cat') {
          const tbl = (rows, title) => `<div class="card"><div class="hd"><h3>${title}</h3></div><table class="tbl"><thead><tr><th class="s">التصنيف</th><th>عدد السندات</th><th>المبلغ</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="s b">${VC[r.category] || r.category}</td><td>${r.n}</td><td class="num">${S.fmtN(r.total)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">لا يوجد</td></tr>'}</tbody></table><div class="bd" id="${title === 'المقبوضات' ? 'dr' : 'dp'}"></div></div>`;
          rb.innerHTML = head + `<div class="grid g2">${tbl(d.receipts_by_category, 'المقبوضات')}${tbl(d.payments_by_category, 'المدفوعات')}</div>`;
          S.chart.donut(rb.querySelector('#dr'), { items: d.receipts_by_category.map((r, i) => ({ label: VC[r.category], value: +r.total, color: S.PALETTE[i], fmt: S.fmtN(r.total) })), center: S.fmtN(d.receipts_by_category.reduce((a, r) => a + +r.total, 0), 0) });
          S.chart.donut(rb.querySelector('#dp'), { items: d.payments_by_category.map((r, i) => ({ label: VC[r.category], value: +r.total, color: S.PALETTE[(i + 3) % 10], fmt: S.fmtN(r.total) })), center: S.fmtN(d.payments_by_category.reduce((a, r) => a + +r.total, 0), 0) });
        } else if (tab === 'debts') {
          rb.innerHTML = `<div class="toolbar"><span class="total-l">أولياء الأمور الذين عليهم مبالغ مستحقة (العقود النشطة)</span><div class="sp"></div><button class="btn outline-ok" id="xd">${ic('download')} تصدير</button></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th class="s">ولي الأمر</th><th>الجوال</th><th>العقود</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th></tr></thead><tbody>${d.debts.map((r, i) => `<tr><td class="muted">${i + 1}</td><td class="s b">${esc(r.guardian?.name || '—')}</td><td class="num">${esc(r.guardian?.phone || '')}</td><td>${r.contracts}</td><td class="num">${S.fmtN(r.total)}</td><td class="num ok-t">${S.fmtN(r.paid)}</td><td class="num bad-t b">${S.fmtN(r.remaining)}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="4">الإجمالي</td><td class="num">${S.fmtN(d.debts.reduce((a, r) => a + +r.total, 0))}</td><td class="num">${S.fmtN(d.debts.reduce((a, r) => a + +r.paid, 0))}</td><td class="num">${S.fmtN(d.debts.reduce((a, r) => a + +r.remaining, 0))}</td></tr></tfoot></table></div>`;
          rb.querySelector('#xd').onclick = () => S.exportXlsx('مديونيات-أولياء-الأمور', [{ l: 'ولي الأمر', v: (r) => r.guardian?.name }, { l: 'الجوال', v: (r) => r.guardian?.phone }, { l: 'العقود', v: (r) => r.contracts }, { l: 'الإجمالي', v: (r) => +r.total }, { l: 'المدفوع', v: (r) => +r.paid }, { l: 'المتبقي', v: (r) => +r.remaining }], d.debts);
        } else {
          rb.innerHTML = `<div class="grid g-1-2"><div class="card"><div class="hd"><h3>نسبة التحصيل حسب الصف</h3></div><div class="bd" id="gb"></div></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th class="s">الصف</th><th>العقود</th><th>الإجمالي</th><th>المحصّل</th><th>المتبقي</th><th>نسبة التحصيل</th></tr></thead><tbody>${d.by_grade.map((g) => `<tr><td class="s b">${esc(g.name)}</td><td>${g.contracts}</td><td class="num">${S.fmtN(g.total)}</td><td class="num ok-t">${S.fmtN(g.paid)}</td><td class="num bad-t">${S.fmtN(g.remaining)}</td><td>${S.prog(+g.total ? Math.round((g.paid * 100) / g.total) : 0)}</td></tr>`).join('')}</tbody></table></div></div>`;
          S.chart.hbars(rb.querySelector('#gb'), d.by_grade.map((g, i) => ({ label: g.name, value: +g.total ? Math.round((g.paid * 100) / g.total) : 0, color: S.PALETTE[i % 10] })), (v) => v + '%');
        }
      };
      const load = async () => { el.querySelector('#rb').innerHTML = S.spinner; d = await S.get('/app/reports/finance', { from: el.querySelector('#f').value, to: el.querySelector('#t').value }); draw(); };
      el.querySelector('#go').onclick = load;
      el.querySelector('.tabs').onclick = (e) => { const b = e.target.closest('button'); if (b && d) { tab = b.dataset.t; draw(); } };
      await load();
    },
  });
})();
