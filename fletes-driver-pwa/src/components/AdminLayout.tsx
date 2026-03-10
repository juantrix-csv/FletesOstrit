import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, CalendarDays, Package, Settings, Truck, Users } from 'lucide-react';
import { cn } from '../lib/utils';
import { clearAdminSession, getAdminSession } from '../lib/adminSession';

const navItems = [
  { key: 'jobs', label: 'Fletes', to: '/admin?tab=jobs', Icon: Package },
  { key: 'drivers', label: 'Conductores', to: '/admin?tab=drivers', Icon: Users },
  { key: 'calendar', label: 'Calendario', to: '/admin?tab=calendar', Icon: CalendarDays },
  { key: 'analytics', label: 'Analiticas', to: '/admin?tab=analytics', Icon: BarChart3 },
];

const bottomItems = [
  { key: 'settings', label: 'Configuracion', to: '/admin?tab=settings', Icon: Settings },
];

const resolveActiveTab = (loc: string, search: string) => {
  const param = new URLSearchParams(search).get('tab');
  if (param === 'jobs' || param === 'drivers' || param === 'calendar' || param === 'analytics' || param === 'settings') return param;
  const pathTab = loc.split('/')[2];
  if (pathTab === 'jobs' || pathTab === 'drivers' || pathTab === 'calendar' || pathTab === 'analytics' || pathTab === 'settings') return pathTab;
  return 'jobs';
};

export const AdminLayout = ({ children }: { children: React.ReactNode }) => {
  const loc = useLocation();
  const navigate = useNavigate();
  const session = getAdminSession();
  const isOwner = session?.role === 'owner';
  const roleLabel = session?.role === 'owner' ? 'Dueno' : session?.role === 'assistant' ? 'Asistente' : 'Sin sesion';
  const visibleNavItems = isOwner ? navItems : navItems.filter((item) => item.key !== 'analytics');
  const visibleBottomItems = isOwner ? bottomItems : [];
  const allowedTabs = new Set(isOwner
    ? ['jobs', 'drivers', 'calendar', 'analytics', 'settings']
    : ['jobs', 'drivers', 'calendar']
  );
  const resolvedTab = resolveActiveTab(loc.pathname, loc.search);
  const activeTab = allowedTabs.has(resolvedTab) ? resolvedTab : 'jobs';

  const handleLogout = () => {
    clearAdminSession();
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className="flex h-[100dvh] min-h-screen bg-slate-100">
      <aside className="fixed left-0 top-0 flex h-full w-72 flex-col border-r border-slate-900/40 bg-slate-950 text-slate-100">
        <div className="flex items-center gap-3 px-5 py-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow">
            <Truck size={20} />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-wide text-slate-100">Fletes Ostrit</p>
            <p className="text-xs text-slate-400">Panel Admin</p>
          </div>
        </div>
        <nav className="mt-3 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {visibleNavItems.map((item) => {
            const isActive = activeTab === item.key;
            const Icon = item.Icon;
            return (
              <Link
                key={item.key}
                to={item.to}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-sm font-medium transition",
                  isActive
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-300 hover:bg-slate-900 hover:text-white"
                )}
              >
                <span className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg border",
                  isActive ? "border-blue-500/40 bg-blue-500/15 text-blue-300" : "border-slate-800 bg-slate-900 text-slate-400"
                )}>
                  <Icon size={18} />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <nav className="space-y-1 border-t border-slate-900/60 px-3 py-4">
          {visibleBottomItems.map((item) => {
            const isActive = activeTab === item.key;
            const Icon = item.Icon;
            return (
              <Link
                key={item.key}
                to={item.to}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-sm font-medium transition",
                  isActive
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-300 hover:bg-slate-900 hover:text-white"
                )}
              >
                <span className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg border",
                  isActive ? "border-blue-500/40 bg-blue-500/15 text-blue-300" : "border-slate-800 bg-slate-900 text-slate-400"
                )}>
                  <Icon size={18} />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-900/60 px-3 py-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Sesion</p>
            <p className="text-sm font-semibold text-slate-100">{roleLabel}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 w-full rounded-xl border border-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-900"
          >
            Cerrar sesion
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col pl-72">
        <main className="flex-1 min-h-0 overflow-y-auto px-8 py-8">
          <div className="mx-auto w-full max-w-[1500px]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
