# Fletes Driver PWA

PWA para gestion de fletes, pensada para uso en Buenos Aires (principalmente La Plata y alrededores). Funciona sin backend: todo se guarda en el navegador con Dexie (IndexedDB).

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
La entidad `Job` vive en IndexedDB y contiene:
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

