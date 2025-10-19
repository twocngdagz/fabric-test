# Fabric Canvas API (Laravel + React)

This project exposes minimal JSON APIs to support Fabric.js canvas workflows.

Stack
- Laravel 12 (PHP 8.2+), SQLite (dev), Vite
- React + TypeScript frontend (Inertia). Fabric.js v6 for canvas
- TailwindCSS utilities for styling

API routes (prefix: `/api`)

- POST `/api/upload` (name: `api.upload`)
  - Throttle: `uploads` (10 req/min by IP)
  - Accepts multipart/form-data with field `image` (jpeg/png, ≤ 10MB)
  - Stores to `public/uploads/{uuid}.{ext}` and returns `{ "url": "..." }`
  - Validation: `image` is required, `mimes:jpeg,jpg,png`, `max:10240`

- POST `/api/export` (name: `api.export`)
  - Throttle: `exports` (20 req/min by IP)
  - Accepts JSON body: `{ dataUrl: string (data:image/png;base64,XXX), name?: string }`
  - Saves to `public/exports/{slug(name) or Ymd_His}.png` and returns `{ "url": "..." }`
  - Validation: `dataUrl` must match `^data:image/png;base64,` and be base64; `name` max 120 chars
  - Note (Fabric v6): `canvas.toDataURL({ format: 'png', multiplier: 1 })` requires `multiplier` in typings.

- CRUD `/api/templates` (name: `api.templates.*`)
  - `GET /api/templates` — list
  - `POST /api/templates` — create
  - `GET /api/templates/{id}` — show
  - `PUT/PATCH /api/templates/{id}` — update
  - `DELETE /api/templates/{id}` — delete
  - Model: `Template` with columns: `name` (string, 120), `canvas_width` (uint), `canvas_height` (uint), `elements` (json)
  - Validation:
    - Store: `name` required, `canvas_width` 1..8192, `canvas_height` 1..8192, `elements` array
    - Update: same fields optional

Quick start (dev)

```bash
# 1) Install PHP deps and generate app key
composer install
cp -n .env.example .env || true
php artisan key:generate

# 2) Prepare SQLite and run migrations (includes templates table)
php artisan migrate --force

# 3) Start dev server
php artisan serve --host=127.0.0.1 --port=8000
```

Verify routes

```bash
php artisan route:list | grep -E "api/(upload|export|templates)"
```

Smoke test

```bash
# Upload (1x1 png)
IMG=/tmp/pixel.png; echo iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII= | base64 -D > "$IMG"
curl -s -X POST -F "image=@$IMG;type=image/png" http://127.0.0.1:8000/api/upload

# Export (from dataUrl)
DATA=$(cat "$IMG" | base64)
curl -s -H "Content-Type: application/json" \
  -d "{\"dataUrl\":\"data:image/png;base64,$DATA\",\"name\":\"test-export\"}" \
  http://127.0.0.1:8000/api/export
```

Notes
- Throttling is defined in `App\Providers\AppServiceProvider` via named limiters `uploads` and `exports`.
- Files are saved under `public/uploads` and `public/exports` making the returned URLs directly accessible.
- React/Fabric integrations are in `resources/js/pages/canvas.tsx`. For SSR safety, Fabric v6 is dynamically imported in effects.

