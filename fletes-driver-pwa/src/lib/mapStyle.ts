import type maplibregl from 'maplibre-gl';

export const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const ROAD_MATCH = /(road|street|motorway|highway|trunk|bridge|tunnel)/i;
const WATER_MATCH = /(water|river|lake|canal|stream)/i;
const LAND_MATCH = /(land|park|background|earth)/i;
const BUILDING_MATCH = /(building)/i;

export const applyHighContrastMap = (map: maplibregl.Map) => {
  const style = map.getStyle();
  if (!style?.layers) return;

  style.layers.forEach((layer) => {
    const id = layer.id.toLowerCase();
    if (layer.type === 'background') {
      map.setPaintProperty(layer.id, 'background-color', '#070707');
    }
    if (layer.type === 'fill' && LAND_MATCH.test(id)) {
      map.setPaintProperty(layer.id, 'fill-color', '#0b0b0b');
    }
    if (layer.type === 'fill' && WATER_MATCH.test(id)) {
      map.setPaintProperty(layer.id, 'fill-color', '#121212');
    }
    if (layer.type === 'fill' && BUILDING_MATCH.test(id)) {
      map.setPaintProperty(layer.id, 'fill-color', '#1a1a1a');
    }
    if (layer.type === 'line' && ROAD_MATCH.test(id)) {
      const isMajor = /(motorway|trunk|primary)/i.test(id);
      map.setPaintProperty(layer.id, 'line-color', isMajor ? '#f5f5f5' : '#c8c8c8');
    }
  });
};
