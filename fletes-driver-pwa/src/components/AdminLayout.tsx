import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';

const navItems = [
  { key: 'jobs', label: 'Fletes', to: '/admin?tab=jobs' },
  { key: 'drivers', label: 'Conductores', to: '/admin?tab=drivers' },
  { key: 'calendar', label: 'Calendario', to: '/admin?tab=calendar' },
  { key: 'analytics', label: 'Analiticas', to: '/admin?tab=analytics' },
];

const kpis = [
  { label: 'Total Fletes', value: '0' },
  { label: 'Asignados', value: '0' },
  { label: 'Sin Asignar', value: '0' },
  { label: 'Conductores Activos', value: '0' },
];

export const AdminLayout = ({ children }: { children: React.ReactNode }) => {
  const loc = useLocation();
  const activeTab = new URLSearchParams(loc.search).get('tab') ?? 'jobs';

  return (
    <div className="flex h-[100dvh] min-h-screen bg-slate-100">
      <aside className="fixed left-0 top-0 h-full w-64 bg-slate-950 text-slate-100">
        <div className="px-5 py-6 text-sm font-semibold tracking-wide text-slate-200">
          Panel Admin
        </div>
        <nav className="mt-2 space-y-1 px-3">
          {navItems.map((item) => {
            const isActive = activeTab === item.key;
            return (
              <Link
                key={item.key}
                to={item.to}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  "flex items-center rounded-lg border-l-4 px-3 py-2 text-sm font-medium transition",
                  isActive
                    ? "border-blue-500 bg-slate-800 text-white"
                    : "border-transparent text-slate-300 hover:bg-slate-900 hover:text-white"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col pl-64">
        <header className="px-6 pt-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-2xl bg-white p-4 shadow-sm"
              >
                <p className="text-2xl font-semibold text-gray-900">{kpi.value}</p>
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  {kpi.label}
                </p>
              </div>
            ))}
          </div>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
          {children}
        </main>
      </div>
    </div>
  );
};
