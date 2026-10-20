# سكوول — Schoole

نظام إدارة المدارس الذكي (School Management SaaS).

## الحالة
المرحلة ۰: صفحة الواجهة الرئيسية (landing page) — جاهزة.

## التشغيل محلياً
```bash
docker compose up -d --build
# ثم افتح http://localhost:8008
```

## البنية
- `public/` — الموقع الثابت (الواجهة الرئيسية).
- `Dockerfile` + `nginx.conf` — حاوية nginx تخدم الموقع الثابت.
- `docker-compose.yml` — يربط الحاوية على `127.0.0.1:8008`.

## النشر
السيرفر: Contabo VPS، `/opt/schoole`، منفذ داخلي `127.0.0.1:8008`، خلف nginx.
