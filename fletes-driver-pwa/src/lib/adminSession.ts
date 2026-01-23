export type AdminRole = 'owner' | 'assistant';

export interface AdminSession {
  role: AdminRole;
}

const STORAGE_KEY = 'fletes-admin-session';

const isValidRole = (role: unknown): role is AdminRole => role === 'owner' || role === 'assistant';

export const getAdminSession = (): AdminSession | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminSession;
    if (!parsed || !isValidRole(parsed.role)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const setAdminSession = (session: AdminSession) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
};

export const clearAdminSession = () => {
  localStorage.removeItem(STORAGE_KEY);
};
