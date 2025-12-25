import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Truck, List } from 'lucide-react';
import { cn } from '../lib/utils';
export const Layout = ({ children }: { children: React.ReactNode }) => {
  const loc = useLocation();
  const navClass = (p: string) => cn("flex flex-col items-center w-full text-xs", loc.pathname === p ? "text-blue-600" : "text-gray-500");
  const isAdminRoute = loc.pathname.startsWith('/admin');
  const mainClass = cn("flex-1 min-h-0 p-4", isAdminRoute ? "overflow-y-auto" : "overflow-hidden");
  const navStyle = { height: 'calc(4rem + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)' } as const;
  const mainStyle = { paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' } as const;
  return (
    <div className="flex flex-col min-h-screen h-[100dvh] bg-gray-50">
      <main className={mainClass} style={mainStyle}>{children}</main>
      <nav className="fixed bottom-0 w-full bg-white border-t flex justify-around items-center" style={navStyle}>
        <Link to="/" className={navClass('/')}><Truck size={24} /><span>Driver</span></Link>
        <Link to="/admin" className={navClass('/admin')}><List size={24} /><span>Admin</span></Link>
      </nav>
      <Toaster />
    </div>
  );
};
