# سكوول — Schoole

نظام سحابي متكامل لإدارة المدارس (SaaS متعدد المدارس): الشؤون المدرسية، العقود والأقساط والتحصيل،
المحاسبة، الموارد البشرية والرواتب، الشؤون الإدارية، بوابة ولي الأمر، ولوحة مالك المنصة.

## الواجهات
| المسار | لمن |
|---|---|
| `/` | الصفحة التعريفية |
| `/login.html` · `/register.html` | دخول موحّد لكل الأدوار · تسجيل مدرسة جديدة (تجربة ١٤ يوماً) |
| `/app/` | لوحة المدرسة (مدير + موظفين بصلاحيات) |
| `/parent/` | بوابة ولي الأمر |
| `/super/` | إدارة المنصة (المدارس، الباقات، الإعلانات) |
| `/apply.html?school=<slug>` | استمارة التسجيل الإلكتروني للطلاب الجدد |

## التشغيل
```bash
docker compose up -d --build      # db + api + web
# http://127.0.0.1:8013  (عام: :8099 عبر nginx المضيف)
docker exec schoole-api php artisan migrate:fresh --seed --force   # إعادة البيانات التجريبية
```

## حسابات تجريبية (كلمة المرور: `password`)
- مدير المدرسة: `admin@schoole.app` · محاسبة: `finance@schoole.app` · موارد بشرية: `hr@schoole.app`
- ولي أمر: `96891001001` · مالك المنصة: `super@schoole.app`

## البنية
- `api/` — Laravel 13 + Sanctum (PHP 8.4). عزل المدارس عبر `BelongsToCompany` + middleware `company`.
  - `app/Http/Controllers/Api/ResourceController.php` — CRUD تعريفي عام (بحث/فلاتر/ترقيم/تحقق/سجل نشاط).
  - `app/Support/Finance.php` — كل قواعد المال (العقود، الأقساط، السندات، الأرصدة).
- `public/` — واجهات ثابتة بدون build: `assets/css/app.css` (نظام التصميم)، `assets/js/core.js` (API + UI kit + رسوم بيانية + Excel + طباعة)،
  `assets/js/app/` (shell + محرك الموارد `crud.js` + صفحات الوحدات).
- `_test/e2e.mjs` — اختبار شامل في متصفح (Playwright): كل الصفحات + السيناريوهات الأساسية.

```bash
docker run --rm --network host -v /opt/schoole:/s -v /opt/sufra/node_modules:/s/node_modules:ro \
  mcr.microsoft.com/playwright:v1.47.0-jammy node /s/_test/e2e.mjs
```

## النشر
cron كل دقيقة يشغّل `deploy.sh`: عند تغيّر `origin/main` → `git reset --hard` → `docker compose up -d --build` → `migrate`.
التفاصيل والخطة الكاملة في `BUILD_PLAN.md`.
