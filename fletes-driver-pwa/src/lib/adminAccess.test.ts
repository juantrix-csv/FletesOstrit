import { describe, expect, it } from 'vitest';
import {
  canAccessAdminTab,
  getAllowedAdminTabs,
  resolveAccessibleAdminTab,
  resolveAdminTab,
} from './adminAccess';

describe('admin access', () => {
  it('lets the owner access every admin section', () => {
    expect(getAllowedAdminTabs('owner')).toEqual([
      'jobs',
      'leads',
      'drivers',
      'calendar',
      'analytics',
      'settings',
    ]);
    expect(canAccessAdminTab('owner', 'analytics')).toBe(true);
    expect(canAccessAdminTab('owner', 'settings')).toBe(true);
  });

  it('limits the assistant to operational sections', () => {
    expect(getAllowedAdminTabs('assistant')).toEqual(['jobs', 'leads', 'drivers', 'calendar']);
    expect(canAccessAdminTab('assistant', 'jobs')).toBe(true);
    expect(canAccessAdminTab('assistant', 'leads')).toBe(true);
    expect(canAccessAdminTab('assistant', 'drivers')).toBe(true);
    expect(canAccessAdminTab('assistant', 'calendar')).toBe(true);
    expect(canAccessAdminTab('assistant', 'analytics')).toBe(false);
    expect(canAccessAdminTab('assistant', 'settings')).toBe(false);
  });

  it('normalizes requested tabs and falls back when forbidden', () => {
    expect(resolveAdminTab('drivers')).toBe('drivers');
    expect(resolveAdminTab('unknown')).toBeNull();
    expect(resolveAccessibleAdminTab('owner', 'settings')).toBe('settings');
    expect(resolveAccessibleAdminTab('assistant', 'settings')).toBe('jobs');
    expect(resolveAccessibleAdminTab(null, 'analytics')).toBe('jobs');
  });
});
