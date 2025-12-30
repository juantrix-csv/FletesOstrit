import type maplibregl from 'maplibre-gl';

export const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

const palette = {
  background: '#F5F5F5',
  land: '#E8E4D8',
  urban: '#E6E6E6',
  industrial: '#DADADA',
  park: '#CDE8C1',
  forest: '#B6D7A8',
  desert: '#EFE2C3',
  water: '#AADAFF',
  lake: '#8FCBFF',
  canal: '#9DD9FF',
  building: '#D1D1D1',
  motorway: '#F8D147',
  primary: '#FFE066',
  secondary: '#FFFFFF',
  minor: '#E0E0E0',
  unpaved: '#D6CFC7',
  labelStreet: '#5F6368',
  labelCity: '#3C4043',
  labelRegion: '#202124',
  labelPoi: '#1A73E8',
  labelHalo: '#F5F5F5',
};

const isLayerIdMatch = (layerId: string, matcher: RegExp) => matcher.test(layerId);

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
        map.setPaintProperty(layer.id, 'fill-color', palette.industrial);
        return;
      }
      if (isLayerIdMatch(id, URBAN_MATCH)) {
        map.setPaintProperty(layer.id, 'fill-color', palette.urban);
        return;
      }
      if (isLayerIdMatch(id, LAND_MATCH)) {
        map.setPaintProperty(layer.id, 'fill-color', palette.land);
      }
    }

    if (layer.type === 'line') {
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
      if (LABEL_POI_MATCH.test(id)) {
        map.setPaintProperty(layer.id, 'text-color', palette.labelPoi);
      } else if (LABEL_REGION_MATCH.test(id)) {
        map.setPaintProperty(layer.id, 'text-color', palette.labelRegion);
      } else if (LABEL_CITY_MATCH.test(id)) {
        map.setPaintProperty(layer.id, 'text-color', palette.labelCity);
      } else if (LABEL_STREET_MATCH.test(id)) {
        map.setPaintProperty(layer.id, 'text-color', palette.labelStreet);
      }
      map.setPaintProperty(layer.id, 'text-halo-color', palette.labelHalo);
      map.setPaintProperty(layer.id, 'text-halo-width', 1);
      map.setPaintProperty(layer.id, 'text-halo-blur', 0.5);
      if (LABEL_POI_MATCH.test(id)) {
        map.setPaintProperty(layer.id, 'icon-color', palette.labelPoi);
      }
    }
  });
};
