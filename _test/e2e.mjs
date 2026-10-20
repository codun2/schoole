// سكوول — end-to-end smoke test. Run inside the Playwright image:
//   docker run --rm --network host -v /opt/schoole:/s -v /opt/sufra/node_modules:/s/node_modules:ro \
//     mcr.microsoft.com/playwright:v1.47.0-jammy node /s/_test/e2e.mjs
import { chromium } from 'playwright';
import fs from 'fs';

const B = process.env.BASE || 'http://127.0.0.1:8013';
const SHOTS = '/s/_test/_shots';
fs.mkdirSync(SHOTS, { recursive: true });
const b = await chromium.launch();
const problems = [];
const RUN = String(Date.now()).slice(-6);
const GNAME = 'ولي أمر اختبار ' + RUN, GPHONE = '9689' + RUN + '1', SNAME = 'طالب اختبار ' + RUN;

async function session(login, viewport = { width: 1440, height: 900 }) {
  const ctx = await b.newContext({ viewport, locale: 'ar' });
  const p = await ctx.newPage();
  p._inflight = 0;
  p.on('request', (r) => { if (r.url().includes('/api/')) p._inflight++; });
  p.on('requestfinished', (r) => { if (r.url().includes('/api/')) p._inflight--; });
  p.on('requestfailed', (r) => { if (r.url().includes('/api/')) p._inflight--; });
  p.on('pageerror', (e) => problems.push(`[${login}] JS: ${e.message}`));
  p.on('console', (c) => { if (c.type() === 'error' && !c.text().includes('favicon')) problems.push(`[${login}] console: ${c.text()}`); });
  p.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400 && r.status() !== 422) problems.push(`[${login}] HTTP ${r.status()} ${r.request().method()} ${r.url().replace(B, '')}`); });
  await p.goto(B + '/login.html');
  await p.fill('input[name=login]', login);
  await p.fill('input[name=password]', 'password');
  await p.click('#go');
  await p.waitForURL(/\/(app|super|parent)\//, { timeout: 15000 });
  await p.waitForTimeout(1200);
  return p;
}
const settle = async (p) => {
  await p.waitForTimeout(150);
  for (let i = 0, quiet = 0; i < 150 && quiet < 3; i++) { await p.waitForTimeout(100); quiet = p._inflight > 0 ? 0 : quiet + 1; }
  await p.waitForTimeout(200);
};

// ------------------------------------------------------------ school admin: every route
const p = await session('admin@schoole.app');
const routes = await p.evaluate(() => S.NAV.flatMap((n) => (n[4] ? n[4].map((c) => c[0]) : ['home'])).concat(['profile']));
for (const r of routes) {
  await p.goto(`${B}/app/#/${r === 'home' ? '' : r}`);
  await settle(p);
  const txt = await p.$eval('#view', (v) => v.innerText).catch(() => '');
  if (txt.includes('تعذّر تحميل')) problems.push(`[admin] page "${r}" shows load error: ${txt.slice(0, 160)}`);
  if (['home', 'schools', 'students', 'contracts', 'installments', 'accounting', 'hr', 'admin', 'tasks', 'calendar', 'employees', 'reports', 'attendance', 'payrolls', 'subjects', 'exam-terms', 'marks', 'timetable', 'employee-contracts', 'evaluations', 'evaluation-criteria', 'evaluation-periods'].includes(r)) await p.screenshot({ path: `${SHOTS}/app-${r}.png`, fullPage: false });
}
console.log('visited', routes.length, 'routes');

// ------------------------------------------------------------ flow: add guardian → student → contract → pay
await p.goto(B + '/app/#/guardians'); await settle(p);
await p.click('#add'); await p.waitForSelector('.modal form');
await p.fill('.modal [name=name]', GNAME);
await p.fill('.modal [name=phone]', GPHONE);
await p.fill('.modal [name=password]', 'secret12');
await p.click('.modal [data-save]'); await settle(p);
console.log('after guardian save → toasts:', await p.$$eval('.toast', (t) => t.map((x) => x.innerText)), 'errors:', await p.$$eval('.ferr', (t) => t.map((x) => x.innerText)), 'modals:', (await p.$$('.modal')).length);
const gOk = await p.$eval('#tbl', (t, n) => t.innerText.includes(n), GNAME);
console.log('guardian created:', gOk); if (!gOk) problems.push('guardian not created');

await p.goto(B + '/app/#/students'); await settle(p);
await p.click('#add'); await p.waitForSelector('.modal form');
await p.fill('.modal [name=name]', SNAME);
await p.selectOption('.modal [name=guardian_id]', { label: GNAME + ' — ' + GPHONE });
const secVal = await p.$eval('.modal [name=section_id] option:nth-child(2)', (o) => o.value);
await p.selectOption('.modal [name=section_id]', secVal);
await p.click('.modal [data-save]'); await settle(p);
const sOk = await p.$eval('#tbl', (t, n) => t.innerText.includes(n), SNAME);
console.log('student created:', sOk); if (!sOk) problems.push('student not created');
await p.screenshot({ path: `${SHOTS}/flow-students.png` });

// contract builder
await p.goto(B + '/app/#/contracts?new=1'); await settle(p);
await p.waitForSelector('#st');
const stVal = await p.$$eval('#st option', (os, n) => (os.find((o) => o.textContent.includes(n)) || {}).value, SNAME);
await p.selectOption('#st', stVal); await p.waitForTimeout(400);
await p.fill('#ic', '4'); await p.dispatchEvent('#ic', 'change'); await p.waitForTimeout(300);
await p.screenshot({ path: `${SHOTS}/flow-contract-builder.png` });
await p.click('#sv-a'); await settle(p); await p.waitForTimeout(800);
const cOk = await p.$eval('.modal h3', (h) => h.innerText).catch(() => '');
console.log('contract view after save:', cOk.slice(0, 60));
await p.screenshot({ path: `${SHOTS}/flow-contract-view.png` });
// pay first installment
const payBtn = await p.$('.modal [data-a=pay]');
if (payBtn) {
  await payBtn.click(); await p.waitForSelector('.modal:last-of-type [name=amount]');
  await p.fill('.modal:last-of-type [name=amount]', '100');
  await p.click('.modal:last-of-type [data-save]'); await p.waitForTimeout(900);
  const conf = await p.$('.modal:last-of-type [data-close]'); if (conf) await conf.click(); // skip print prompt
  await settle(p);
  const paid = await p.$eval('.modal', (m) => m.innerText.includes('100.000')).catch(() => false);
  console.log('payment recorded:', paid); if (!paid) problems.push('payment not visible in contract');
} else problems.push('pay button missing on new contract');
await p.keyboard.press('Escape');

// attendance save
await p.goto(B + '/app/#/attendance'); await settle(p);
await p.click('#allp').catch(() => {});
await p.click('#save').catch(() => problems.push('attendance save button missing'));
await settle(p);

// academic: subjects, terms, grade entry, results, report card
await p.goto(B + '/app/#/subjects'); await settle(p);
if (!(await p.$eval('#tbl', (t) => t.innerText.includes('الرياضيات')).catch(() => false))) problems.push('subjects not listed');
await p.goto(B + '/app/#/exam-terms'); await settle(p);
await p.goto(B + '/app/#/marks'); await settle(p);
await p.click('#ld'); await settle(p);
const sheetOk = await p.$eval('#sheet', (x) => !!x.querySelector('input[data-i]')).catch(() => false);
console.log('grade entry sheet rendered:', sheetOk); if (!sheetOk) problems.push('grade entry sheet missing inputs');
// fill first mark and save
await p.$$eval('#sheet input[data-i]', (ins) => { if (ins[0]) { ins[0].value = '88'; ins[0].dispatchEvent(new Event('input', { bubbles: true })); } });
await p.click('#sheet #save').catch(() => {});
await settle(p);
// results tab
await p.click('.tabs button[data-t=results]'); await settle(p);
await p.click('#ld'); await settle(p);
const resOk = await p.$eval('#res', (x) => x.innerText.includes('متوسط الفصل')).catch(() => false);
console.log('class results rendered:', resOk); if (!resOk) problems.push('class results not rendered');
await p.screenshot({ path: `${SHOTS}/app-marks-results.png` });
// open a report card
const rcBtn = await p.$('#res [data-c]');
if (rcBtn) { await rcBtn.click(); await settle(p); const rcOk = await p.$eval('.modal', (x) => x.innerText.includes('المعدل العام')).catch(() => false); console.log('report card opened:', rcOk); if (!rcOk) problems.push('report card modal missing'); await p.screenshot({ path: `${SHOTS}/app-report-card.png` }); await p.keyboard.press('Escape'); } else problems.push('no report card button in results');
// cards tab
await p.click('.tabs button[data-t=cards]'); await settle(p);

// timetable: grid, edit a cell, save; teacher schedule; load; settings
await p.goto(B + '/app/#/timetable'); await settle(p);
await p.click('#ld'); await settle(p);
const ttOk = await p.$eval('#grid', (x) => !!x.querySelector('.ttcell')).catch(() => false);
console.log('timetable grid rendered:', ttOk); if (!ttOk) problems.push('timetable grid missing cells');
await p.screenshot({ path: `${SHOTS}/app-timetable.png` });
// edit an empty cell
const emptyCell = await p.$('#grid .ttcell');
if (emptyCell) { await emptyCell.click(); await settle(p); await p.selectOption('.modal [name=subject_id]', { index: 1 }).catch(() => {}); await p.selectOption('.modal [name=teacher_id]', { index: 1 }).catch(() => {}); await p.click('.modal [data-save]'); await settle(p); await p.click('#grid #save'); await settle(p); }
await p.click('.tabs button[data-t=teacher]'); await settle(p);
await p.waitForTimeout(600);
const tsOk = await p.$eval('#body', (x) => x.innerText.includes('نصاب أسبوعي')).catch(() => false);
console.log('teacher schedule:', tsOk); if (!tsOk) problems.push('teacher schedule not rendered');
await p.screenshot({ path: `${SHOTS}/app-timetable-teacher.png` });
await p.click('.tabs button[data-t=load]'); await settle(p);
await p.click('.tabs button[data-t=settings]'); await settle(p);

// HR extras: contracts list + create an evaluation end-to-end
await p.goto(B + '/app/#/employee-contracts'); await settle(p);
if (!(await p.$eval('#tbl', (t) => t.innerText.includes('EC-')).catch(() => false))) problems.push('employee contracts not listed');
await p.goto(B + '/app/#/evaluations'); await settle(p);
await p.click('#add'); await p.waitForSelector('.modal [name=employee_id]');
await p.selectOption('.modal:last-of-type [name=employee_id]', { index: 3 });
const openPeriod = await p.$$eval('.modal:last-of-type [name=period_id] option', (os) => (os.find((o) => o.value) || {}).value);
if (openPeriod) await p.selectOption('.modal:last-of-type [name=period_id]', openPeriod);
await p.click('.modal:last-of-type [data-save]'); await settle(p);
const evalFormOk = await p.$eval('.modal #eb', (x) => !!x.querySelector('input[data-s]')).catch(() => false);
console.log('evaluation scoring form:', evalFormOk); if (!evalFormOk) problems.push('evaluation scoring form missing');
if (evalFormOk) { for (const h of await p.$$('.modal:last-of-type #eb input[data-s]')) { await h.fill('85'); } await p.waitForTimeout(300); await p.click('.modal:last-of-type #sv'); await settle(p); console.log('evaluation saved, rows now:', await p.$eval('#list', (x) => x.innerText.includes('%')).catch(() => false)); await p.screenshot({ path: `${SHOTS}/app-evaluations.png` }); }

// payroll generate (current month)
await p.goto(B + '/app/#/payrolls'); await settle(p);
await p.click('#gen'); await settle(p); await p.waitForTimeout(800);
await p.screenshot({ path: `${SHOTS}/flow-payroll.png` });
await p.keyboard.press('Escape');

// dark mode + mobile
await p.goto(B + '/app/#/'); await settle(p);
await p.click('#t-mode'); await p.waitForTimeout(400);
await p.screenshot({ path: `${SHOTS}/app-home-dark.png` });
await p.click('#t-mode');

const m = await session('admin@schoole.app', { width: 390, height: 844 });
await m.goto(B + '/app/#/schools'); await settle(m);
await m.screenshot({ path: `${SHOTS}/mobile-schools.png` });
await m.click('#burger'); await m.waitForTimeout(400);
await m.screenshot({ path: `${SHOTS}/mobile-menu.png` });

// ------------------------------------------------------------ staff with limited permissions
const f = await session('finance@schoole.app');
await f.goto(B + '/app/#/employees'); await settle(f);
const denied = await f.$eval('#view', (v) => v.innerText.includes('لا تملك صلاحية'));
console.log('finance blocked from HR:', denied); if (!denied) problems.push('permission gate failed for finance user on HR');
await f.goto(B + '/app/#/contracts'); await settle(f);

// ------------------------------------------------------------ guardian portal
const g = await session('96891001001', { width: 400, height: 860 });
await settle(g);
await g.screenshot({ path: `${SHOTS}/parent-home.png`, fullPage: true });
const kid = await g.$('.kid'); if (kid) { await kid.click(); await settle(g); await g.screenshot({ path: `${SHOTS}/parent-child.png`, fullPage: true }); } else problems.push('guardian sees no children');
await g.goto(B + '/parent/#/payments'); await settle(g);

// ------------------------------------------------------------ super admin
const s = await session('super@schoole.app');
for (const r of ['dash', 'schools', 'plans', 'ann']) { await s.goto(`${B}/super/#/${r}`); await settle(s); await s.screenshot({ path: `${SHOTS}/super-${r}.png` }); }

// ------------------------------------------------------------ public pages
const pub = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
pub._inflight = 0; pub.on('request', (r) => { if (r.url().includes('/api/')) pub._inflight++; }); pub.on('requestfinished', (r) => { if (r.url().includes('/api/')) pub._inflight--; }); pub.on('requestfailed', (r) => { if (r.url().includes('/api/')) pub._inflight--; });
pub.on('pageerror', (e) => problems.push('[public] JS: ' + e.message));
for (const [u, n] of [['/', 'landing'], ['/login.html', 'login'], ['/register.html', 'register'], ['/apply.html?school=almustaqbal', 'apply']]) { await pub.goto(B + u); await settle(pub); await pub.screenshot({ path: `${SHOTS}/public-${n}.png` }); }
// submit the online admission form
await pub.fill('[name=student_name]', 'طالب من الاستمارة الإلكترونية');
await pub.selectOption('[name=grade_id]', { index: 1 });
await pub.fill('[name=guardian_name]', 'ولي أمر إلكتروني');
await pub.fill('[name=guardian_phone]', '96899988877');
await pub.click('#go'); await settle(pub);
const applied = await pub.$eval('#box', (x) => x.innerText.includes('تم استلام'));
console.log('online application submitted:', applied); if (!applied) problems.push('online application failed');

await b.close();
console.log('\nPROBLEMS:', problems.length);
problems.forEach((x) => console.log(' -', x));
process.exit(problems.length ? 1 : 0);
