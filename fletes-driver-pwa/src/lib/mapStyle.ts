import type mapboxgl from 'mapbox-gl';

export const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? '';

// Streets removes the default traffic overlay and keeps road labels legible.
export const MAP_STYLE = 'mapbox://styles/mapbox/streets-v12';

const ONEWAY_FORWARD_LAYER_ID = 'fletes-ostrit-oneway-forward';
const ONEWAY_REVERSE_LAYER_ID = 'fletes-ostrit-oneway-reverse';
const ONEWAY_ARROW_LAYOUT = {
  'symbol-placement': 'line',
  'symbol-spacing': 160,
  'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'],
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

const getRoadLabelLayerId = (map: mapboxgl.Map) =>
  map
    .getStyle()
    ?.layers?.find((layer) => layer.type === 'symbol' && layer.id.toLowerCase().includes('road'))
    ?.id;

const addOneWayLayer = (map: mapboxgl.Map, layerId: string, textField: string, onewayValues: string[]) => {
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
    } as unknown as mapboxgl.AnyLayer,
    getRoadLabelLayerId(map)
  );
};

export const hasMapboxAccessToken = () => MAPBOX_ACCESS_TOKEN.trim().length > 0;

export const applyMapPalette = (map?: unknown) => {
  if (!map) return;
  const mapInstance = map as mapboxgl.Map;
  if (!mapInstance.isStyleLoaded()) return;

  addOneWayLayer(mapInstance, ONEWAY_FORWARD_LAYER_ID, '→', ['true', '1', 'yes']);
  addOneWayLayer(mapInstance, ONEWAY_REVERSE_LAYER_ID, '←', ['-1', 'reverse']);
};
