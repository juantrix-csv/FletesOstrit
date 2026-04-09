import { useSyncExternalStore } from 'react';
import { getApiActivitySnapshot, subscribeApiActivity } from '../lib/api';

const emptySnapshot = {
  pendingRequests: 0,
  pendingMutations: 0,
};

export const useApiActivity = () =>
  useSyncExternalStore(subscribeApiActivity, getApiActivitySnapshot, () => emptySnapshot);
