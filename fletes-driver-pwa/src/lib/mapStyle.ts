import type maplibregl from 'maplibre-gl';

export const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

const palette = {
  background: '#F4F4F4',
  land: '#EDEDED',
  urban: '#EDEDED',
  industrial: '#EDEDED',
  park: '#D8D8D8',
  forest: '#CECECE',
  desert: '#E2E2E2',
  water: '#D0D0D0',
  lake: '#C8C8C8',
  canal: '#D4D4D4',
  building: '#D1D1D1',
  motorway: '#9A9A9A',
  primary: '#B0B0B0',
  secondary: '#C3C3C3',
  minor: '#D6D6D6',
  unpaved: '#D0D0D0',
  labelStreet: '#666666',
  labelCity: '#4D4D4D',
  labelRegion: '#3D3D3D',
  labelPoi: '#5A5A5A',
  labelHalo: '#F4F4F4',
};

const isLayerIdMatch = (layerId: string, matcher: RegExp) => matcher.test(layerId);
const getSourceLayer = (layer: { [key: string]: unknown }) => layer['source-layer'] as string | undefined;

const ROAD_MOTORWAY_MATCH = /(motorway|trunk)/i;
const ROAD_PRIMARY_MATCH = /(primary)/i;
const ROAD_SECONDARY_MATCH = /(secondary|tertiary)/i;
const ROAD_UNPAVED_MATCH = /(track|unpaved|gravel|dirt)/i;
const ROAD_MINOR_MATCH = /(residential|service|street|road|path|footway|pedestrian|living|unclassified)/i;
const PARK_MATCH = /(park|green|leisure|garden)/i;
const FOREST_MATCH = /(forest|wood|nature|scrub)/i;
const DESERT_MATCH = /(desert|sand|dune|beach)/i;
const WATER_CANAL_MATCH = /(canal)/i;
const WATER_LAKE_MATCH = /(lake|reservoir|basin)/i;
const WATER_MATCH = /(water|river|stream)/i;
const BUILDING_MATCH = /(building)/i;
const URBAN_MATCH = /(urban|residential|settlement)/i;
const INDUSTRIAL_MATCH = /(industrial|commercial)/i;
const LAND_MATCH = /(land|earth|background|landcover|landuse)/i;
const ROUTE_LAYER_MATCH = /(route)/i;
const LABEL_STREET_MATCH = /(road|street|transportation|streetname|roadname)/i;
const LABEL_CITY_MATCH = /(place|city|town|village)/i;
const LABEL_REGION_MATCH = /(country|region|state|province)/i;
const LABEL_POI_MATCH = /(poi|amenity|shop|food|school|hospital)/i;

export const applyMapPalette = (map: maplibregl.Map) => {
  const style = map.getStyle();
  if (!style?.layers) return;

  (style.layers as Array<{ id: string; type: string; [key: string]: unknown }>).forEach((layer) => {
    const id = layer.id.toLowerCase();
    const sourceLayer = getSourceLayer(layer);
    if (ROUTE_LAYER_MATCH.test(id)) return;

    if (layer.type === 'background') {
      map.setPaintProperty(layer.id, 'background-color', palette.background);
      return;
    }

    if (layer.type === 'fill') {
      if (sourceLayer === 'landuse') {
        map.setPaintProperty(layer.id, 'fill-color', [
          'match',
          ['get', 'class'],
          'park', palette.park,
          'garden', palette.park,
          'grass', palette.park,
          'forest', palette.forest,
          'wood', palette.forest,
          'nature_reserve', palette.forest,
          'industrial', palette.land,
          'commercial', palette.land,
          'residential', palette.land,
          'sand', palette.desert,
          'beach', palette.desert,
          palette.land,
        ]);
        return;
      }
      if (sourceLayer === 'landcover') {
        map.setPaintProperty(layer.id, 'fill-color', [
          'match',
          ['get', 'class'],
          'wood', palette.forest,
          'forest', palette.forest,
          'scrub', palette.forest,
          palette.land,
        ]);
        return;
      }
      if (sourceLayer === 'water') {
        map.setPaintProperty(layer.id, 'fill-color', [
          'match',
          ['get', 'class'],
          'lake', palette.lake,
          'reservoir', palette.lake,
          'basin', palette.lake,
          'canal', palette.canal,
          palette.water,
        ]);
        return;
      }
      if (isLayerIdMatch(id, PARK_MATCH)) {
        map.setPaintProperty(layer.id, 'fill-color', palette.park);
        return;
      }
      if (isLayerIdMatch(id, FOREST_MATCH)) {
        map.setPaintProperty(layer.id, 'fill-color', palette.forest);
        return;
      }
      if (isLayerIdMatch(id, DESERT_MATCH)) {
        map.setPaintProperty(layer.id, 'fill-color', palette.desert);
        return;
      }
      if (isLayerIdMatch(id, WATER_CANAL_MATCH)) {
        map.setPaintProperty(layer.id, 'fill-color', palette.canal);
        return;
      }
      if (isLayerIdMatch(id, WATER_LAKE_MATCH)) {
        map.setPaintProperty(layer.id, 'fill-color', palette.lake);
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
      if (isLayerIdMatch(id, INDUSTRIAL_MATCH)) {
        map.setPaintProperty(layer.id, 'fill-color', palette.land);
        return;
      }
      if (isLayerIdMatch(id, URBAN_MATCH)) {
        map.setPaintProperty(layer.id, 'fill-color', palette.land);
        return;
      }
      if (isLayerIdMatch(id, LAND_MATCH)) {
        map.setPaintProperty(layer.id, 'fill-color', palette.land);
      }
    }

    if (layer.type === 'line') {
      if (sourceLayer === 'waterway') {
        map.setPaintProperty(layer.id, 'line-color', [
          'match',
          ['get', 'class'],
          'canal', palette.canal,
          palette.water,
        ]);
        return;
      }
      if (sourceLayer === 'transportation') {
        map.setPaintProperty(layer.id, 'line-color', [
          'match',
          ['get', 'class'],
          'motorway', palette.motorway,
          'trunk', palette.primary,
          'primary', palette.primary,
          'secondary', palette.secondary,
          'tertiary', palette.secondary,
          'minor', palette.minor,
          'service', palette.minor,
          'track', palette.unpaved,
          'path', palette.unpaved,
          palette.minor,
        ]);
        return;
      }
      if (ROAD_MOTORWAY_MATCH.test(id)) {
        map.setPaintProperty(layer.id, 'line-color', palette.motorway);
        return;
      }
      if (ROAD_PRIMARY_MATCH.test(id)) {
        map.setPaintProperty(layer.id, 'line-color', palette.primary);
        return;
      }
      if (ROAD_SECONDARY_MATCH.test(id)) {
        map.setPaintProperty(layer.id, 'line-color', palette.secondary);
        return;
      }
      if (ROAD_UNPAVED_MATCH.test(id)) {
        map.setPaintProperty(layer.id, 'line-color', palette.unpaved);
        return;
      }
      if (ROAD_MINOR_MATCH.test(id)) {
        map.setPaintProperty(layer.id, 'line-color', palette.minor);
      }
    }

    if (layer.type === 'symbol') {
      if (sourceLayer === 'poi' || LABEL_POI_MATCH.test(id)) {
        map.setPaintProperty(layer.id, 'text-color', palette.labelPoi);
      } else if (sourceLayer === 'place' || LABEL_CITY_MATCH.test(id)) {
        map.setPaintProperty(layer.id, 'text-color', palette.labelCity);
      } else if (sourceLayer === 'boundary' || LABEL_REGION_MATCH.test(id)) {
        map.setPaintProperty(layer.id, 'text-color', palette.labelRegion);
      } else if (sourceLayer === 'transportation_name' || LABEL_STREET_MATCH.test(id)) {
        map.setPaintProperty(layer.id, 'text-color', palette.labelStreet);
      }
      map.setPaintProperty(layer.id, 'text-halo-color', palette.labelHalo);
      map.setPaintProperty(layer.id, 'text-halo-width', 1);
      map.setPaintProperty(layer.id, 'text-halo-blur', 0.5);
      if (sourceLayer === 'poi' || LABEL_POI_MATCH.test(id)) {
        map.setPaintProperty(layer.id, 'icon-color', palette.labelPoi);
      }
    }
  });
};
