# Fletes Driver PWA

PWA para gestion de fletes, pensada para uso en Buenos Aires (principalmente La Plata y alrededores).
Incluye frontend para driver/admin y dos opciones de backend:
- Local: API REST con Express + SQLite (node:sqlite).
- Vercel: funciones serverless en `/api` con Postgres.

## Funcionalidad principal
- Admin: alta de fletes con cliente, descripcion, ayudantes, fecha/hora y direcciones con autocompletado acotado a Provincia de Buenos Aires.
- Driver: muestra el viaje activo o el proximo pendiente; solo permite iniciar 1h antes del horario.
- Flujo de estados con confirmacion por slider: `PENDING -> TO_PICKUP -> LOADING -> TO_DROPOFF -> UNLOADING -> DONE`.
- Mapa: Mapbox como proveedor principal, con respaldo automatico a estilo OpenStreetMap/CARTO y ruteo OSRM si Mapbox queda sin cuota o sin token.
- Tiempos: registra timestamps por etapa y calcula duraciones en el panel admin.
- Analiticas: historial de fletes completados, totales del mes, y graficos diarios/mensuales.
- Precios: precio por hora de flete y de ayudante con persistencia en DB.
- Filtros: listado de fletes por asignacion, pendiente, fecha y conductor.
- Export: descarga de historicos en CSV compatible con Excel.

## Reglas de horarios
- Cada job guarda `scheduledDate`, `scheduledTime` y `scheduledAt` (ms).
- En Home se prioriza el viaje activo; si no hay, se elige el pendiente mas cercano.
- El boton de inicio se habilita 1h antes del horario programado (o siempre si no hay horario).

## Reglas de cobro
- El cobro es por hora y redondea hacia arriba (ej: 1:25 => 2h).
- Si hay ayudantes, se suma el costo por hora del ayudante por cantidad de ayudantes.

## Mapa y ubicacion
- Estilo principal: `mapbox://styles/mapbox/streets-v12`.
- Respaldo visual: `https://basemaps.cartocdn.com/gl/positron-gl-style/style.json`.
- Ruteo principal: Mapbox Directions.
- Respaldo de ruteo: `https://router.project-osrm.org/route/v1/driving/...`.
- Geolocalizacion con `watchPosition` (alta precision) y calculo de distancia/ETA.
- Limites: se acota el viewbox a Provincia de Buenos Aires y se evita el zoom mundial; fallback La Plata.

## Autocompletado de direcciones
- Proveedor principal: Mapbox Geocoding.
- Respaldo: Nominatim por `/api/geocode` y `/api/reverse-geocode` (soporta `NOMINATIM_EMAIL` y `NOMINATIM_USER_AGENT`).

## API (REST)
- Base: `/api/v1`
  - `GET /api/v1/health`
  - `GET /api/v1/jobs`
  - `GET /api/v1/jobs/:id`
  - `POST /api/v1/jobs`
  - `PATCH /api/v1/jobs/:id`
  - `DELETE /api/v1/jobs/:id`
  - `GET /api/v1/drivers`
  - `POST /api/v1/drivers`
  - `PATCH /api/v1/drivers/:id`
  - `DELETE /api/v1/drivers/:id`
  - `GET /api/v1/driver-locations`
  - `POST /api/v1/driver-locations`
  - `GET /api/v1/settings/hourly-rate`
  - `PUT /api/v1/settings/hourly-rate`
  - `GET /api/v1/settings/helper-hourly-rate`
  - `PUT /api/v1/settings/helper-hourly-rate`
  - `GET /api/v1/finance/snapshot`
  - `GET /api/v1/finance/summary`
  - `GET /api/v1/finance/jobs`
  - `GET /api/v1/finance/drivers`
  - `GET /api/v1/finance/vehicles`
  - `GET /api/v1/finance/leads`
  - `GET /api/v1/finance/settings`
  - `GET /api/v1/jobs/history/export` (CSV)
  - `GET /api/v1/jobs/history/seed?months=12&perMonth=6&append=1`

### API de lectura financiera
- Base: `/api/v1/finance/:resource`.
- Recursos: `snapshot`, `summary`, `jobs`, `drivers`, `vehicles`, `leads`, `settings`.
- Auth: enviar `Authorization: Bearer <token>` o `x-api-key: <token>`.
- Token esperado: `FINANCE_READ_API_KEY`; si no existe, usa `MAIN_API_KEY`. Si ninguna esta configurada, la API responde `503`.
- En VPS, `scripts/deploy-vps.sh` genera `FINANCE_READ_API_KEY` en `/etc/fletes-ostrit.env` si falta.
- Para leerlo en el servidor: `sudo grep '^FINANCE_READ_API_KEY=' /etc/fletes-ostrit.env`.
- Filtros opcionales:
  - `from=YYYY-MM-DD`
  - `to=YYYY-MM-DD`
  - `status=DONE` o `status=DONE,PENDING`
  - `driverId=<id>`
- Incluye importes cobrados, efectivo/transferencia, reparto chofer/empresa, costos por hora/km, choferes, vehiculos, configuracion de precios/costos y ventas perdidas.

## Estructura del repo
- `fletes-driver-pwa/`: frontend PWA (React + Vite + Tailwind + PWA).
- `fletes-backend/`: backend local (Express + SQLite).
- `fletes-ia/`: modulo IA (WhatsApp con whatsmeow + OpenAI).
- `lib/ai/`: planner, writer, state y tools client para la secretaria virtual.
- `lib/ai/handler.js`: entrada interna para procesar mensajes (sin API publica).
- `api/`: funciones serverless para Vercel (Postgres) + proxy de geocoding.
- `tests/`: tests de funciones serverless (node --test).

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

## VPS / Auto Deploy
- El VPS corre el frontend compilado con Nginx y la API con `node server/index.js`.
- En VPS con Postgres local, usa `POSTGRES_USE_PG_POOL=1`.
- El script versionado de deploy es `scripts/deploy-vps.sh`.
- El script de migracion entre Postgres es `scripts/migrate-postgres-data.js`.
- Para auto deploy por polling se usan las unidades:
  - `deploy/systemd/fletes-ostrit-autodeploy.service`
  - `deploy/systemd/fletes-ostrit-autodeploy.timer`
- El timer revisa `origin/main`, hace `fetch + reset --hard`, reinstala dependencias, rebuild y reinicia `fletes-ostrit-api`.
- Si el deploy nuevo falla en build, restart o healthcheck, el script vuelve automaticamente al commit anterior y reintenta el arranque.

## Deploy en Vercel
- El frontend se builda desde `fletes-driver-pwa/dist` (ver `vercel.json`).
- Funciones en `/api` usan `@vercel/postgres` (requiere `POSTGRES_URL`).
- El frontend consume `/api/v1` en el mismo dominio.
- Seed de historicos: `/api/v1/jobs/history/seed?append=1&months=12&perMonth=6`.

## Servicios externos
- Nominatim (geocoding) y OSRM (ruteo). Para produccion, usar servicios propios o con API key y respetar politicas de uso.

## IA (Sofia)
Modulo interno (sin endpoint publico).

Uso interno (ejemplo):
```js
import { handleIncomingMessage } from './lib/ai/handler.js';

const { reply_text, actions } = await handleIncomingMessage({
  contact_id: 'wa:+5492211234567',
  message: 'Hola, necesito mover un sillon',
});
```

Env vars:
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default `gpt-4o-mini`)
- `OPENAI_BASE_URL` (default `https://api.openai.com/v1`)
- `OPENAI_TIMEOUT_SECONDS` (default `30`)
- `MAIN_API_BASE_URL`
- `MAIN_API_KEY` (opcional)
- `FINANCE_READ_API_KEY` (opcional; si falta se usa `MAIN_API_KEY` para `/api/v1/finance/*`)
- `AVAILABILITY_PATH`
- `SCHEDULE_JOB_PATH`
- `ESTIMATE_PATH` (opcional)
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (opcional)
- `STATE_TTL_SECONDS` (opcional)
- `AI_PLANNER_MODE` (opcional, `openai` o `rules`)
- `AI_WRITER_MODE` (opcional, `openai` o `templates`)

## Tests
- `npm run test:api`
