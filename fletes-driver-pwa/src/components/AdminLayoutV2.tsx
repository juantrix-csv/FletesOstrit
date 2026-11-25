import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, CalendarDays, ChevronRight, LayoutGrid, Menu, Package, Phone, Settings, Truck, Users, X } from 'lucide-react';
import { AdminLayoutLegacy } from './AdminLayout';
import AdminJobs from '../pages/AdminJobs';
import { canAccessAdminTab, getAllowedAdminTabs, resolveAdminTab, type AdminTab } from '../lib/adminAccess';
import { clearAdminSession, getAdminSession } from '../lib/adminSession';

const PREFERENCE_KEY = 'fletes-admin-interface';

const pages: { key: AdminTab; label: string; detail: string; icon: typeof Package }[] = [
  { key: 'jobs', label: 'Fletes', detail: 'Operación y seguimiento', icon: Package },
  { key: 'calendar', label: 'Calendario', detail: 'Agenda y disponibilidad', icon: CalendarDays },
  { key: 'drivers', label: 'Conductores', detail: 'Equipo y vehículos', icon: Users },
  { key: 'leads', label: 'Oportunidades', detail: 'Consultas perdidas', icon: Phone },
  { key: 'analytics', label: 'Analíticas', detail: 'Resultados del negocio', icon: BarChart3 },
  { key: 'settings', label: 'Configuración', detail: 'Precios y parámetros', icon: Settings },
];

const pageCopy: Record<AdminTab, { eyebrow: string; title: string; description: string }> = {
  jobs: { eyebrow: 'CENTRO DE OPERACIONES', title: 'Fletes', description: 'Gestioná cada viaje desde la solicitud hasta el cobro.' },
  calendar: { eyebrow: 'PLANIFICACIÓN', title: 'Calendario', description: 'Una vista clara de tu agenda y la disponibilidad del equipo.' },
  drivers: { eyebrow: 'EQUIPO', title: 'Conductores', description: 'Choferes, vehículos y liquidaciones en un solo lugar.' },
  leads: { eyebrow: 'OPORTUNIDADES', title: 'Consultas perdidas', description: 'Revisá las consultas que no llegaron a convertirse en fletes.' },
  analytics: { eyebrow: 'RENDIMIENTO', title: 'Analíticas', description: 'Entendé los ingresos, costos y márgenes de la operación.' },
  settings: { eyebrow: 'PREFERENCIAS', title: 'Configuración', description: 'Administrá los valores que usa la app para cotizar y calcular.' },
};

export function AdminLayoutV2({ children }: { children: ReactNode }) {
  const [classic, setClassic] = useState(() => {
    try { return localStorage.getItem(PREFERENCE_KEY) === 'classic'; } catch { return false; }
  });

  const selectVersion = (nextClassic: boolean) => {
    try { localStorage.setItem(PREFERENCE_KEY, nextClassic ? 'classic' : 'v2'); } catch { /* Keep this session's choice. */ }
    setClassic(nextClassic);
  };

  if (classic) {
    return (
      <div className="admin-classic-wrapper">
        <AdminLayoutLegacy><AdminJobs /></AdminLayoutLegacy>
        <button type="button" className="admin-return-v2" onClick={() => selectVersion(false)}>
          <LayoutGrid size={17} /> Usar panel V2
        </button>
      </div>
    );
  }

  return <ModernAdminLayout onClassic={() => selectVersion(true)}>{children}</ModernAdminLayout>;
}

function ModernAdminLayout({ children, onClassic }: { children: ReactNode; onClassic: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const session = getAdminSession();
  const requestedTab = resolveAdminTab(new URLSearchParams(location.search).get('tab'))
    ?? resolveAdminTab(location.pathname.split('/')[2]) ?? 'jobs';
  const activeTab = canAccessAdminTab(session?.role, requestedTab) ? requestedTab : 'jobs';
  const allowed = getAllowedAdminTabs(session?.role);
  const currentPage = pageCopy[activeTab];

  useEffect(() => setMenuOpen(false), [location.pathname, location.search]);

  const logout = () => {
    clearAdminSession();
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className="admin-v2">
      <aside className={`admin-v2__sidebar ${menuOpen ? 'is-open' : ''}`}>
        <div className="admin-v2__brand">
          <div className="admin-v2__brand-mark"><Truck size={25} strokeWidth={2.1} /></div>
          <div><strong>OSTRIT<span>.</span></strong><small>Gestión de fletes</small></div>
          <button type="button" className="admin-v2__close" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"><X size={20} /></button>
        </div>

        <div className="admin-v2__nav-label">ESPACIO DE TRABAJO</div>
        <nav className="admin-v2__nav" aria-label="Navegación del panel">
          {pages.filter((page) => allowed.includes(page.key) && page.key !== 'settings').map(({ key, label, icon: Icon }) => (
            <Link key={key} to={`/admin?tab=${key}`} className={`admin-v2__nav-item ${activeTab === key ? 'is-active' : ''}`} aria-current={activeTab === key ? 'page' : undefined}>
              <Icon size={19} strokeWidth={1.8} /><span>{label}</span>{activeTab === key && <ChevronRight size={16} className="admin-v2__nav-arrow" />}
            </Link>
          ))}
        </nav>

        <div className="admin-v2__sidebar-bottom">
          {allowed.includes('settings') && <Link to="/admin?tab=settings" className={`admin-v2__nav-item ${activeTab === 'settings' ? 'is-active' : ''}`} aria-current={activeTab === 'settings' ? 'page' : undefined}><Settings size={19} strokeWidth={1.8} /><span>Configuración</span></Link>}
          <button type="button" className="admin-v2__classic" onClick={onClassic}><LayoutGrid size={16} /> Volver al diseño clásico</button>
          <div className="admin-v2__account">
            <div className="admin-v2__avatar">{session?.role === 'owner' ? 'D' : 'A'}</div>
            <div><strong>{session?.role === 'owner' ? 'Dueño' : 'Asistente'}</strong><small>Sesión activa</small></div>
            <button type="button" onClick={logout} title="Cerrar sesión" aria-label="Cerrar sesión">Salir</button>
          </div>
        </div>
      </aside>

      {menuOpen && <button type="button" className="admin-v2__scrim" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú" />}

      <div className="admin-v2__workspace">
        <header className="admin-v2__topbar">
          <button type="button" className="admin-v2__menu" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu size={22} /></button>
          <div className="admin-v2__breadcrumb"><span>Panel de control</span><ChevronRight size={15} /><strong>{currentPage.title}</strong></div>
          <div className="admin-v2__top-date">{new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date())}</div>
        </header>
        <main className="admin-v2__main">
          <div className="admin-v2__content">
            <div className="admin-v2__page-heading">
              <div><p>{currentPage.eyebrow}</p><h1>{currentPage.title}</h1><span>{currentPage.description}</span></div>
              <div className="admin-v2__page-icon">{(() => { const Icon = pages.find((page) => page.key === activeTab)?.icon ?? Package; return <Icon size={23} strokeWidth={1.8} />; })()}</div>
            </div>
            <div className={`admin-v2__screen admin-v2__screen--${activeTab}`}>{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
