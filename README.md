# Fletes Driver PWA

PWA para gestion de fletes, pensada para uso en Buenos Aires (principalmente La Plata y alrededores). Usa un backend REST con SQLite como fuente de verdad.

## Funcionalidad actual
- Admin: alta de fletes con cliente, fecha, horario, origen y destino (autocompletado acotado a Provincia de Buenos Aires).
- Driver: muestra el viaje activo o el proximo pendiente y permite iniciar solo 1 hora antes del horario programado.
- Flujo de trabajo: estados `PENDING -> TO_PICKUP -> LOADING -> TO_DROPOFF -> UNLOADING -> DONE` con timestamps automaticos.
- Mapa: ruta entre puntos con MapLibre + OSRM, y seguimiento por geolocalizacion cuando el viaje esta en curso.

## Reglas de turnos y horarios
- Cada flete guarda `scheduledDate`, `scheduledTime` y `scheduledAt` (timestamp en ms).
- En Home se elige el pendiente mas cercano en el futuro; si no hay futuros, se toma el mas cercano entre los pendientes existentes.
- El boton para iniciar solo se habilita 1 hora antes del horario programado (o cuando no hay horario).

## Datos principales
La entidad `Job` se almacena en SQLite en el backend y se expone por API:
- Cliente, origen, destino y estado.
- Flags de notificaciones y timestamps por etapa.
- Fecha/hora programadas y `scheduledAt` para ordenar sin errores de zona horaria.

## Mapa y ubicacion
- Estilo base: `https://basemaps.cartocdn.com/gl/positron-gl-style/style.json`.
- Ruteo: `https://router.project-osrm.org/route/v1/driving/...`.
- El mapa evita hacer zoom mundial si las coordenadas quedan fuera de Provincia de Buenos Aires y usa La Plata como fallback.
- Geolocalizacion activa con `watchPosition` (alta precision).

## Autocompletado de direcciones
- Usa Nominatim via proxy `/api/geocode`.
- Limitado a Argentina y acotado por `viewbox` a Provincia de Buenos Aires.
- Debounce de 350 ms y minimo 4 caracteres.

## Rutas de la app
- `/` Home del driver.
- `/job/:id` Flujo del flete.
- `/admin` Panel para crear fletes.

## Scripts
- `npm run dev`: desarrollo con Vite.
- `npm run build`: build de produccion.
- `npm run preview`: preview del build.

## Dependencias externas
- Nominatim (geocoding) y OSRM (ruteo). Para produccion se recomienda usar servicios propios o con API key respetando politicas de uso.

## Backend (API)
- API REST en `fletes-backend` con Node + Express y SQLite (usa `node:sqlite`, sin dependencias nativas).
- Endpoints base en `/api/v1`:
  - `GET /api/v1/jobs`
  - `GET /api/v1/jobs/:id`
  - `POST /api/v1/jobs`
  - `PATCH /api/v1/jobs/:id`
  - `DELETE /api/v1/jobs/:id`

## Estructura del repo
- `fletes-driver-pwa/`: frontend PWA (React + Vite).
- `fletes-backend/`: backend API (Express + SQLite).

## Configuracion local
Backend:
- `cd fletes-backend`
- `npm install`
- `npm run dev`
- Variables opcionales:
  - `PORT` (default 4000)
  - `DB_PATH` (default `fletes-backend/data/fletes.db`)
  - Requiere Node 22+ (por `node:sqlite`)

Frontend:
- `cd fletes-driver-pwa`
- `npm install`
- `npm run dev`
- Variables opcionales:
  - `VITE_API_BASE` (default `/api/v1`)

## Docker
Levantar todo con un solo comando:
- `docker compose up --build`

Puertos:
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

Seed demo:
- El backend crea viajes demo si `SEED_DEMO=1` (en `docker-compose.yml`).
- Si ya hay datos, no vuelve a sembrar. Para resembrar, borrar `fletes-backend/data`.

## Deploy en Vercel
Este repo incluye funciones serverless en `api/` para Vercel (usa Postgres).

Pasos:
1) Crear un proyecto en Vercel apuntando a la raiz del repo.
2) Agregar un Vercel Postgres (o un Postgres externo) y asegurarte de tener `POSTGRES_URL` en el proyecto.
3) Deploy.

Notas:
- En Vercel se usa Postgres (no SQLite) por limitaciones de persistencia.
- El frontend consume `/api/v1` en el mismo dominio (no hace falta cambiar `VITE_API_BASE`).
