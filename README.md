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

## Template Save/Load

Minimal Template JSON (v1). Only essentials are stored. Background and images are intentionally not persisted.

```json
{
  "version": 1,
  "canvas": { "width": 1200, "height": 800 },
  "frames": [
    { "id": "f-abc", "x": 40, "y": 60, "w": 400, "h": 300, "fit": "cover", "name": "Hero" },
    { "id": "f-def", "x": 480, "y": 60, "w": 300, "h": 300, "fit": "contain", "name": "Thumb" }
  ]
}
```

Frontend (Editor UI at `/editor`):
- Save Template: serializes minimal JSON and POSTs to `/api/templates`. A toast shows the created ID.
- Load Template: prompts for an ID, GETs `/api/templates/{id}`, clears any images, resizes the canvas, and restores frames exactly. Images are not part of the template, by design.

API usage examples

```bash
# Save (create) a template
curl -s -H 'Content-Type: application/json' -d '{
  "version": 1,
  "canvas": { "width": 1200, "height": 800 },
  "frames": [ { "id": "f-abc", "x": 40, "y": 60, "w": 400, "h": 300, "fit": "cover", "name": "Hero" } ]
}' http://127.0.0.1:8000/api/templates

# Load (show) a template
curl -s http://127.0.0.1:8000/api/templates/1
```

Notes
- Throttling is defined in `App\Providers\AppServiceProvider` via named limiters `uploads` and `exports`.
- Files are saved under `public/uploads` and `public/exports` making the returned URLs directly accessible.
- React/Fabric integrations are in `resources/js/pages/editor.tsx` (advanced editor) and `resources/js/pages/canvas.tsx` (simple demo). Fabric v6 specifics are annotated inline.

## Development

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

# 4) Frontend
npm install
npm run dev
```

Quality checks

```bash
npm run types
npm run lint
```
