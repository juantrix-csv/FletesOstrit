# Fletes Driver PWA

PWA para gestion de fletes, pensada para uso en Buenos Aires (principalmente La Plata y alrededores).
Incluye frontend para driver/admin y dos opciones de backend:
- Local: API REST con Express + SQLite (node:sqlite).
- Vercel: funciones serverless en `/api` con Postgres.

## Funcionalidad principal
- Admin: alta de fletes con cliente, fecha/hora y direcciones con autocompletado acotado a Provincia de Buenos Aires.
- Driver: muestra el viaje activo o el proximo pendiente; solo permite iniciar 1h antes del horario.
- Flujo de estados con confirmacion por slider: `PENDING -> TO_PICKUP -> LOADING -> TO_DROPOFF -> UNLOADING -> DONE`.
- Mapa: ruta con MapLibre + OSRM, seguimiento por geolocalizacion y modo follow.
- Tiempos: registra timestamps por etapa y calcula duraciones en el panel admin.

## Reglas de horarios
- Cada job guarda `scheduledDate`, `scheduledTime` y `scheduledAt` (ms).
- En Home se prioriza el viaje activo; si no hay, se elige el pendiente mas cercano.
- El boton de inicio se habilita 1h antes del horario programado (o siempre si no hay horario).

## Mapa y ubicacion
- Estilo base: `https://basemaps.cartocdn.com/gl/positron-gl-style/style.json`.
- Ruteo: `https://router.project-osrm.org/route/v1/driving/...`.
- Geolocalizacion con `watchPosition` (alta precision) y calculo de distancia/ETA.
- Limites: se acota el viewbox a Provincia de Buenos Aires y se evita el zoom mundial; fallback La Plata.

## Autocompletado de direcciones
- En dev: proxy de Vite hacia Nominatim con `/api/geocode`.
- En Vercel: funcion serverless `/api/geocode` (soporta `NOMINATIM_EMAIL`).

## API (REST)
- Base: `/api/v1`
  - `GET /api/v1/health`
  - `GET /api/v1/jobs`
  - `GET /api/v1/jobs/:id`
  - `POST /api/v1/jobs`
  - `PATCH /api/v1/jobs/:id`
  - `DELETE /api/v1/jobs/:id`

## Estructura del repo
- `fletes-driver-pwa/`: frontend PWA (React + Vite + Tailwind + PWA).
- `fletes-backend/`: backend local (Express + SQLite).
- `api/`: funciones serverless para Vercel (Postgres) + proxy de geocoding.

## Configuracion local
Backend:
- `cd fletes-backend`
- `npm install`
- `npm run dev`
- Variables:
  - `PORT` (default 4000)
  - `DB_PATH` (default `fletes-backend/data/fletes.db`)
  - `SEED_DEMO=1` para datos demo
  - Requiere Node 22+ (node:sqlite)

Frontend:
- `cd fletes-driver-pwa`
- `npm install`
- `npm run dev`
- Vite proxy por default a `http://localhost:4000`
- Variables opcionales:
  - `VITE_PROXY_TARGET` (solo dev, cambia el target del proxy `/api/v1`)
  - `VITE_API_BASE` (build/preview, default `/api/v1`)

## Docker
- `docker compose up --build`
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`
- Seed demo: definido en `docker-compose.yml` (`SEED_DEMO=1`)

## Deploy en Vercel
- El frontend se builda desde `fletes-driver-pwa/dist` (ver `vercel.json`).
- Funciones en `/api` usan `@vercel/postgres` (requiere `POSTGRES_URL`).
- El frontend consume `/api/v1` en el mismo dominio.

## Servicios externos
- Nominatim (geocoding) y OSRM (ruteo). Para produccion, usar servicios propios o con API key y respetar politicas de uso.
