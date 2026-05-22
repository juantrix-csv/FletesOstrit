import type maplibregl from 'maplibre-gl';
import type { AppTheme } from './theme';

const createOpenMapStyle = (theme: AppTheme): maplibregl.StyleSpecification => {
  const sourceId = theme === 'dark' ? 'carto-dark' : 'carto-light';
  const palette = theme === 'dark' ? 'dark_all' : 'light_all';

  return {
    version: 8,
    name: 'Fletes Ostrit Open Map',
    sources: {
      [sourceId]: {
        type: 'raster',
        tiles: [
          `https://a.basemaps.cartocdn.com/${palette}/{z}/{x}/{y}.png`,
          `https://b.basemaps.cartocdn.com/${palette}/{z}/{x}/{y}.png`,
          `https://c.basemaps.cartocdn.com/${palette}/{z}/{x}/{y}.png`,
          `https://d.basemaps.cartocdn.com/${palette}/{z}/{x}/{y}.png`,
        ],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      },
    },
    layers: [
      {
        id: sourceId,
        type: 'raster',
        source: sourceId,
        minzoom: 0,
        maxzoom: 20,
      },
    ],
  };
};

export const OPEN_MAP_STYLES: Record<AppTheme, maplibregl.StyleSpecification> = {
  dark: createOpenMapStyle('dark'),
  light: createOpenMapStyle('light'),
};

export const OPEN_MAP_STYLE = OPEN_MAP_STYLES.dark;

const ONEWAY_FORWARD_LAYER_ID = 'fletes-ostrit-oneway-forward';
const ONEWAY_REVERSE_LAYER_ID = 'fletes-ostrit-oneway-reverse';
const ONEWAY_ARROW_LAYOUT = {
  'symbol-placement': 'line',
  'symbol-spacing': 160,
  'text-size': ['interpolate', ['linear'], ['zoom'], 13, 9, 16, 14],
  'text-keep-upright': false,
  'text-rotation-alignment': 'map',
};
const ONEWAY_ARROW_PAINT = {
  'text-color': '#1F2937',
  'text-halo-color': 'rgba(255, 255, 255, 0.92)',
  'text-halo-width': 1.25,
  'text-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 13.7, 0.58, 15, 0.9],
};

const getRoadLabelLayerId = (map: maplibregl.Map) =>
  map
    .getStyle()
    ?.layers?.find((layer) => layer.type === 'symbol' && layer.id.toLowerCase().includes('road'))
    ?.id;

const addOneWayLayer = (map: maplibregl.Map, layerId: string, textField: string, onewayValues: string[]) => {
  if (!map.getSource('composite') || map.getLayer(layerId)) return;

  map.addLayer(
    {
      id: layerId,
      type: 'symbol',
      source: 'composite',
      'source-layer': 'road',
      filter: [
        'all',
        ['==', ['geometry-type'], 'LineString'],
        ['match', ['to-string', ['coalesce', ['get', 'oneway'], '']], onewayValues, true, false],
      ],
      layout: {
        ...ONEWAY_ARROW_LAYOUT,
        'text-field': textField,
      },
      paint: ONEWAY_ARROW_PAINT,
    } as any,
    getRoadLabelLayerId(map)
  );
};

export const applyMapPalette = (map?: unknown) => {
  if (!map) return;
  const mapInstance = map as maplibregl.Map;
  if (!mapInstance.isStyleLoaded()) return;

  addOneWayLayer(mapInstance, ONEWAY_FORWARD_LAYER_ID, '>', ['true', '1', 'yes']);
  addOneWayLayer(mapInstance, ONEWAY_REVERSE_LAYER_ID, '<', ['-1', 'reverse']);
};
