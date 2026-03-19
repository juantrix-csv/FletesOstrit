import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Truck } from 'lucide-react';
import { cn } from '../lib/utils';
import { APP_VERSION } from '../lib/appVersion';
import { AdminLayout } from './AdminLayout';
import { useApiActivity } from '../hooks/useApiActivity';

const GlobalApiFeedback = () => {
  const { pendingRequests, pendingMutations } = useApiActivity();

  return (
    <>
      {pendingRequests > 0 && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-1 overflow-hidden bg-blue-100/70">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-600" />
        </div>
      )}
      {pendingMutations > 0 && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/10 backdrop-blur-[1px]">
          <div className="rounded-2xl border border-white/70 bg-white px-4 py-3 shadow-lg">
            <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
              Procesando...
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const loc = useLocation();
  const navClass = (p: string) => cn("flex flex-col items-center w-full text-xs", loc.pathname === p ? "text-blue-600" : "text-gray-500");
  const isAdminRoute = loc.pathname.startsWith('/admin') && loc.pathname !== '/admin/login';
  const isJobRoute = loc.pathname.startsWith('/job/');
  const isDriverRoute = loc.pathname.startsWith('/driver');
  const isDriverLogin = loc.pathname === '/driver/login';
  const showDriverNav = isDriverRoute && !isDriverLogin && !isJobRoute;
  const mainClass = cn("flex-1 min-h-0 p-4", isAdminRoute ? "overflow-y-auto" : "overflow-hidden");
  const navStyle = { height: 'calc(4rem + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)' } as const;
  const jobBottomPadding = 'calc(env(safe-area-inset-bottom) + 24px)';
  const mainStyle = {
    paddingBottom: isJobRoute ? jobBottomPadding : showDriverNav ? 'calc(4rem + env(safe-area-inset-bottom))' : 'env(safe-area-inset-bottom)'
  } as const;
  if (isAdminRoute) {
    return (
      <div className="min-h-screen bg-slate-100">
        <div className="fixed top-2 right-3 z-50 text-[10px] text-gray-400">
          build {APP_VERSION}
        </div>
        <GlobalApiFeedback />
        <AdminLayout>{children}</AdminLayout>
        <Toaster />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen h-[100dvh] bg-gray-50">
      <div className="fixed top-2 right-3 z-50 text-[10px] text-gray-400">
        build {APP_VERSION}
      </div>
      <GlobalApiFeedback />
      <main className={mainClass} style={mainStyle}>{children}</main>
      {showDriverNav && (
        <nav className="fixed bottom-0 w-full bg-white border-t flex justify-around items-center" style={navStyle}>
        <Link to="/driver" className={navClass('/driver')}><Truck size={24} /><span>Driver</span></Link>
        </nav>
      )}
      <Toaster />
    </div>
  );
};
