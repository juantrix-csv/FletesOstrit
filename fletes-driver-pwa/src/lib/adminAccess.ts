import type { AdminRole } from './adminSession';

export type AdminTab = 'jobs' | 'leads' | 'drivers' | 'calendar' | 'analytics' | 'settings';

const OWNER_TABS: AdminTab[] = ['jobs', 'leads', 'drivers', 'calendar', 'analytics', 'settings'];
const ASSISTANT_TABS: AdminTab[] = ['jobs', 'leads', 'drivers', 'calendar'];

export const resolveAdminTab = (value?: string | null): AdminTab | null => {
  if (
    value === 'jobs'
    || value === 'leads'
    || value === 'drivers'
    || value === 'calendar'
    || value === 'analytics'
    || value === 'settings'
  ) {
    return value;
  }
  return null;
};

export const getAllowedAdminTabs = (role: AdminRole | null | undefined): AdminTab[] => (
  role === 'owner' ? OWNER_TABS : ASSISTANT_TABS
);

export const canAccessAdminTab = (role: AdminRole | null | undefined, tab: AdminTab) => (
  getAllowedAdminTabs(role).includes(tab)
);

export const resolveAccessibleAdminTab = (
  role: AdminRole | null | undefined,
  requested: string | null | undefined,
  fallback: AdminTab = 'jobs',
) => {
  const tab = resolveAdminTab(requested) ?? fallback;
  return canAccessAdminTab(role, tab) ? tab : fallback;
};
