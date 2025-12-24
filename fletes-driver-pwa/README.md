# Fletes Driver PWA

PWA para gestion de fletes, pensada para uso en Buenos Aires (principalmente La Plata y alrededores).

## Funcionalidad actual
- Admin: alta de fletes con cliente, fecha, horario, origen y destino.
- Driver: muestra el viaje activo o el proximo pendiente y permite iniciar solo 1 hora antes del horario programado.
- Flujo de trabajo: estados `PENDING -> TO_PICKUP -> LOADING -> TO_DROPOFF -> UNLOADING -> DONE`.
- Mapa: ruta entre puntos con MapLibre + OSRM y seguimiento por geolocalizacion.

## Backend requerido
- La PWA consume la API REST en `/api/v1`.
- Vite proxy apunta a `http://localhost:4000`.
- Para otro host, definir `VITE_API_BASE`.

## Docker
- `docker compose up --build`
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

## Vercel
- El frontend se deploya junto con las funciones en `api/`.
- Asegurar `POSTGRES_URL` en Vercel (Vercel Postgres recomendado).
- La app usa `/api/v1` en el mismo dominio.

## Scripts
- `npm run dev`: desarrollo con Vite.
- `npm run build`: build de produccion.
- `npm run preview`: preview del build.
