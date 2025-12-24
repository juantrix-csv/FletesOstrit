import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Truck, List } from 'lucide-react';
import { cn } from '../lib/utils';
export const Layout = ({ children }: { children: React.ReactNode }) => {
  const loc = useLocation();
  const navClass = (p: string) => cn("flex flex-col items-center w-full text-xs", loc.pathname === p ? "text-blue-600" : "text-gray-500");
  const isJobRoute = loc.pathname.startsWith('/job/');
  const mainClass = cn("flex-1 p-4 pb-20", isJobRoute ? "overflow-hidden" : "overflow-y-auto");
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <main className={mainClass}>{children}</main>
      <nav className="fixed bottom-0 w-full h-16 bg-white border-t flex justify-around items-center">
        <Link to="/" className={navClass('/')}><Truck size={24} /><span>Driver</span></Link>
        <Link to="/admin" className={navClass('/admin')}><List size={24} /><span>Admin</span></Link>
      </nav>
      <Toaster />
    </div>
  );
};
