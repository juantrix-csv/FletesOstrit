import { useEffect, useState } from 'react';
import { Layer, Source } from 'react-map-gl/maplibre';
import type { LocationData } from '../lib/types';
import { getServiceArea } from '../lib/serviceArea';

interface OperationsBaseServiceAreaProps {
  location: LocationData | null;
  minutes?: number;
  idPrefix?: string;
}

export default function OperationsBaseServiceArea({
  location,
  minutes = 15,
  idPrefix = 'operations-base',
}: OperationsBaseServiceAreaProps) {
  const [area, setArea] = useState<GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null>(null);

  useEffect(() => {
    let active = true;
    if (!location) {
      setArea(null);
      return () => {
        active = false;
      };
    }

    (async () => {
      const nextArea = await getServiceArea(location, minutes);
      if (active) setArea(nextArea);
    })();

    return () => {
      active = false;
    };
  }, [location?.lat, location?.lng, minutes]);

  if (!area) return null;

  return (
    <Source id={`${idPrefix}-no-extra-area`} type="geojson" data={area}>
      <Layer
        id={`${idPrefix}-no-extra-area-fill`}
        type="fill"
        paint={{
          'fill-color': '#10B981',
          'fill-opacity': 0.16,
        }}
      />
      <Layer
        id={`${idPrefix}-no-extra-area-outline`}
        type="line"
        paint={{
          'line-color': '#059669',
          'line-width': 2,
          'line-opacity': 0.72,
        }}
      />
    </Source>
  );
}
