import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart3, CalendarDays, Package, Settings, Truck, Users } from 'lucide-react';
import { cn } from '../lib/utils';

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
  const activeTab = resolveActiveTab(loc.pathname, loc.search);

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
          {navItems.map((item) => {
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
          {bottomItems.map((item) => {
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
