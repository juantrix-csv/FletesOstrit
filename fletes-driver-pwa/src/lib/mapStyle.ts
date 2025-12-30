import type maplibregl from 'maplibre-gl';

export const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

const palette = {
  background: '#f5f5f5',
  land: '#f7f7f7',
  park: '#cfe6bf',
  water: '#bfdbee',
  building: '#efefef',
  roadPrimary: '#8f8f8f',
  roadSecondary: '#a9a9a9',
  roadTertiary: '#bcbcbc',
  roadMinor: '#d2d2d2',
  roadCasing: '#7f7f7f',
  rail: '#b3b3b3',
  boundary: '#d0d0d0',
  label: '#555555',
  labelHalo: '#f7f7f7',
};

const isLayerIdMatch = (layerId: string, matcher: RegExp) => matcher.test(layerId);

const ROAD_MAJOR_MATCH = /(motorway|trunk|primary)/i;
const ROAD_SECONDARY_MATCH = /(secondary|tertiary)/i;
const ROAD_MINOR_MATCH = /(residential|service|street|road|path|track|footway|pedestrian|living|unclassified)/i;
const ROAD_CASING_MATCH = /(casing|case)/i;
const PARK_MATCH = /(park|green|leisure|garden|wood|forest)/i;
const WATER_MATCH = /(water|river|lake|canal|stream|reservoir|basin)/i;
const BUILDING_MATCH = /(building)/i;
const LAND_MATCH = /(land|earth|background|landcover|landuse)/i;
const BOUNDARY_MATCH = /(boundary)/i;
const RAIL_MATCH = /(rail|railway)/i;
const ROUTE_LAYER_MATCH = /(route)/i;

export const applyMapPalette = (map: maplibregl.Map) => {
  const style = map.getStyle();
  if (!style?.layers) return;

  style.layers.forEach((layer) => {
    const id = layer.id.toLowerCase();
    if (ROUTE_LAYER_MATCH.test(id)) return;

    if (layer.type === 'background') {
      map.setPaintProperty(layer.id, 'background-color', palette.background);
      return;
    }

    if (layer.type === 'fill') {
      if (isLayerIdMatch(id, PARK_MATCH)) {
        map.setPaintProperty(layer.id, 'fill-color', palette.park);
        return;
      }
      if (isLayerIdMatch(id, WATER_MATCH)) {
        map.setPaintProperty(layer.id, 'fill-color', palette.water);
        return;
      }
      if (isLayerIdMatch(id, BUILDING_MATCH)) {
        map.setPaintProperty(layer.id, 'fill-color', palette.building);
        return;
      }
      if (isLayerIdMatch(id, LAND_MATCH)) {
        map.setPaintProperty(layer.id, 'fill-color', palette.land);
      }
    }

    if (layer.type === 'line') {
      if (isLayerIdMatch(id, RAIL_MATCH)) {
        map.setPaintProperty(layer.id, 'line-color', palette.rail);
        return;
      }
      if (isLayerIdMatch(id, BOUNDARY_MATCH)) {
        map.setPaintProperty(layer.id, 'line-color', palette.boundary);
        return;
      }
      if (ROAD_CASING_MATCH.test(id)) {
        map.setPaintProperty(layer.id, 'line-color', palette.roadCasing);
        return;
      }
      if (ROAD_MAJOR_MATCH.test(id)) {
        map.setPaintProperty(layer.id, 'line-color', palette.roadPrimary);
        return;
      }
      if (ROAD_SECONDARY_MATCH.test(id)) {
        map.setPaintProperty(layer.id, 'line-color', palette.roadSecondary);
        return;
      }
      if (ROAD_MINOR_MATCH.test(id)) {
        map.setPaintProperty(layer.id, 'line-color', palette.roadMinor);
        return;
      }
    }

    if (layer.type === 'symbol') {
      map.setPaintProperty(layer.id, 'text-color', palette.label);
      map.setPaintProperty(layer.id, 'text-halo-color', palette.labelHalo);
      map.setPaintProperty(layer.id, 'text-halo-width', 1);
      map.setPaintProperty(layer.id, 'text-halo-blur', 0.5);
    }
  });
};
