import { getOperationsBaseLocation, operationsBaseLocationQueryKey } from '../lib/api';
import { useCachedQuery } from './useCachedQuery';

export const useOperationsBaseLocation = () => {
  const query = useCachedQuery({
    key: operationsBaseLocationQueryKey(),
    loader: getOperationsBaseLocation,
    staleMs: 5 * 60 * 1000,
  });

  return {
    ...query,
    location: query.data?.location ?? null,
  };
};
