export interface DriverSession {
  driverId: string;
  code: string;
  name: string;
}

const STORAGE_KEY = 'fletes-driver-session';

export const getDriverSession = (): DriverSession | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DriverSession;
    if (!parsed?.driverId || !parsed?.code || !parsed?.name) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const setDriverSession = (session: DriverSession) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
};

export const clearDriverSession = () => {
  localStorage.removeItem(STORAGE_KEY);
};
