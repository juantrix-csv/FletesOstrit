import { useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { driversListQueryKey, jobsListQueryKey, leadsListQueryKey, listDrivers, listJobs, listLeads, listVehicles, vehiclesListQueryKey } from '../lib/api';
import { canAccessAdminTab, resolveAdminTab } from '../lib/adminAccess';
import { getAdminSession } from '../lib/adminSession';
import type { Driver, Job, Lead, Vehicle } from '../lib/types';
import { useCachedQuery } from '../hooks/useCachedQuery';
import AdminJobsV2 from './AdminJobsV2';
import AdminCalendarV2 from './AdminCalendarV2';
import AdminDriversV2 from './AdminDriversV2';
import AdminLeadsV2 from './AdminLeadsV2';
import AdminAnalyticsV2 from './AdminAnalyticsV2';
import AdminSettingsV2 from './AdminSettingsV2';

export default function AdminWorkspace() {
  const navigate = useNavigate();
  const { section } = useParams<{ section?: string }>();
  const [searchParams] = useSearchParams();
  const role = getAdminSession()?.role ?? null;
  const tab = useMemo(() => resolveAdminTab(searchParams.get('tab')) ?? resolveAdminTab(section) ?? 'jobs', [searchParams, section]);
  const jobs = useCachedQuery<Job[]>({ key: jobsListQueryKey(), loader: listJobs, enabled: Boolean(role), staleMs: 15000, refreshIntervalMs: 30000, onError: () => toast.error('No se pudieron cargar los fletes') });
  const drivers = useCachedQuery<Driver[]>({ key: driversListQueryKey(), loader: listDrivers, enabled: Boolean(role), staleMs: 30000, onError: () => toast.error('No se pudieron cargar los conductores') });
  const vehicles = useCachedQuery<Vehicle[]>({ key: vehiclesListQueryKey(), loader: listVehicles, enabled: Boolean(role), staleMs: 60000, onError: () => toast.error('No se pudieron cargar los vehículos') });
  const leads = useCachedQuery<Lead[]>({ key: leadsListQueryKey(), loader: listLeads, enabled: Boolean(role) && tab === 'leads', staleMs: 30000, onError: () => toast.error('No se pudieron cargar las consultas') });

  useEffect(() => { if (!role) navigate('/admin/login', { replace: true }); }, [role, navigate]);
  useEffect(() => { if (role && !canAccessAdminTab(role, tab)) navigate('/admin?tab=jobs', { replace: true }); }, [role, tab, navigate]);
  if (!role || !canAccessAdminTab(role, tab)) return null;

  const common = { jobs: jobs.data ?? [], drivers: drivers.data ?? [], vehicles: vehicles.data ?? [], loading: jobs.loading || drivers.loading, refreshJobs: jobs.reload };
  if (tab === 'jobs') return <AdminJobsV2 {...common} isOwner={role === 'owner'} />;
  if (tab === 'calendar') return <AdminCalendarV2 {...common} isOwner={role === 'owner'} />;
  if (tab === 'drivers') return <AdminDriversV2 drivers={drivers.data ?? []} vehicles={vehicles.data ?? []} jobs={jobs.data ?? []} loading={drivers.loading} refreshDrivers={drivers.reload} isOwner={role === 'owner'} />;
  if (tab === 'leads') return <AdminLeadsV2 leads={leads.data ?? []} loading={leads.loading} refreshLeads={leads.reload} isOwner={role === 'owner'} />;
  if (tab === 'analytics') return <AdminAnalyticsV2 {...common} />;
  return <AdminSettingsV2 vehicles={vehicles.data ?? []} refreshVehicles={vehicles.reload} />;
}
