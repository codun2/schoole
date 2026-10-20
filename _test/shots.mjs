// Quick screenshot pass of selected routes: node shots.mjs route1 route2 ...
import { chromium } from 'playwright';
const B = 'http://127.0.0.1:8013', routes = process.argv.slice(2);
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
p.on('pageerror', (e) => console.log('JS', e.message));
await p.goto(B + '/login.html'); await p.fill('input[name=login]', process.env.LOGIN || 'admin@schoole.app'); await p.fill('input[name=password]', 'password'); await p.click('#go'); await p.waitForURL(/(app|super|parent)/); await p.waitForTimeout(800);
for (const r of routes) { const [path, ...acts] = r.split('|'); await p.goto(B + path); await p.waitForTimeout(1800); for (const a of acts) { await p.click(a).catch((e) => console.log('click fail', a)); await p.waitForTimeout(1400); } await p.screenshot({ path: '/s/_test/_shots/s-' + path.replace(/[^a-z0-9]+/gi, '_') + (acts.length ? '_act' : '') + '.png', fullPage: !!process.env.FULL }); }
await b.close();
