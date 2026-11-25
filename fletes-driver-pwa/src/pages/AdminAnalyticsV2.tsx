import { useMemo, useState } from 'react';
import { BarChart3, Download, TrendingUp, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { downloadJobsHistory } from '../lib/api';
import { dateKey, jobCollected, jobCompletedDay, jobOwnerShare, money } from '../lib/adminV2';
import type { Driver, Job, Vehicle } from '../lib/types';

type Props = { jobs: Job[]; drivers: Driver[]; vehicles: Vehicle[]; loading: boolean; refreshJobs: () => Promise<unknown> };
const monthName = new Intl.DateTimeFormat('es-AR', { month: 'short' });

export default function AdminAnalyticsV2({ jobs, drivers, loading }: Props) {
  const [downloading, setDownloading] = useState(false);
  const now = new Date();
  const currentMonth = dateKey(now).slice(0, 7);
  const completed = jobs.filter((job) => job.status === 'DONE');
  const monthJobs = completed.filter((job) => jobCompletedDay(job).startsWith(currentMonth));
  const monthGross = monthJobs.reduce((sum, job) => sum + (jobCollected(job) ?? 0), 0);
  const monthOwner = monthJobs.reduce((sum, job) => sum + (jobOwnerShare(job, drivers) ?? 0), 0);
  const missingOwner = monthJobs.filter((job) => jobOwnerShare(job, drivers) == null).length;
  const external = monthJobs.filter((job) => { const driver = drivers.find((item) => item.id === job.driverId); return driver && driver.code !== '6666' && driver.name.trim().toLowerCase() !== 'juan'; }).length;
  const months = useMemo(() => Array.from({ length: 6 }, (_, index) => { const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1); const key = dateKey(date).slice(0, 7); const month = completed.filter((job) => jobCompletedDay(job).startsWith(key)); return { key, label: monthName.format(date), jobs: month.length, gross: month.reduce((sum, job) => sum + (jobCollected(job) ?? 0), 0), owner: month.reduce((sum, job) => sum + (jobOwnerShare(job, drivers) ?? 0), 0) }; }), [jobs, drivers, currentMonth]);
  const maxGross = Math.max(1, ...months.map((month) => month.gross));
  const exportHistory = async () => {
    setDownloading(true);
    try { const blob = await downloadJobsHistory(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `fletes-historial-${currentMonth}.csv`; link.click(); URL.revokeObjectURL(url); }
    catch { toast.error('No se pudo descargar el historial'); }
    finally { setDownloading(false); }
  };

  return <div className="v2-stack"><div className="v2-panel-head v2-analytics-head"><div><p className="v2-kicker">MES ACTUAL Y TENDENCIA</p><h2>Resultados de {new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(now)}</h2><span>Montos registrados en fletes finalizados. Los importes no descuentan todos los gastos del negocio.</span></div><button type="button" className="v2-secondary" onClick={exportHistory} disabled={downloading}><Download size={17} /> {downloading ? 'Descargando…' : 'Exportar historial'}</button></div>
    <div className="v2-summary-grid"><div className="v2-stat"><div className="v2-stat-icon"><BarChart3 size={19} /></div><p>Cobros registrados</p><strong className="v2-stat-money">{money.format(monthGross)}</strong><small>{monthJobs.length} fletes finalizados</small></div><div className="v2-stat"><div className="v2-stat-icon"><TrendingUp size={19} /></div><p>Participación del negocio</p><strong className="v2-stat-money">{money.format(monthOwner)}</strong><small>{missingOwner ? `${missingOwner} fletes sin participación registrada` : 'Antes de costos generales'}</small></div><div className="v2-stat"><div className="v2-stat-icon"><Truck size={19} /></div><p>Fletes delegados</p><strong>{external}</strong><small>{monthJobs.length ? `${Math.round(external / monthJobs.length * 100)}% de los finalizados` : 'Sin fletes este mes'}</small></div></div>
    <div className="v2-panel"><div className="v2-panel-head"><div><p className="v2-kicker">ÚLTIMOS SEIS MESES</p><h2>Evolución de cobros</h2><span>Compará volumen y montos sin perder de vista la inflación.</span></div></div>{loading ? <div className="v2-empty">Cargando datos…</div> : <div className="v2-chart" role="img" aria-label="Cobros mensuales de los últimos seis meses">{months.map((month) => <div className="v2-chart-column" key={month.key}><div className="v2-chart-value">{money.format(month.gross)}</div><div className="v2-chart-bars"><div className="v2-chart-bar" style={{ height: `${Math.max(2, month.gross / maxGross * 100)}%` }} /></div><strong>{month.label}</strong><small>{month.jobs} fletes</small></div>)}</div>}</div>
    <div className="v2-panel"><div className="v2-panel-head"><div><p className="v2-kicker">DETALLE MENSUAL</p><h2>Resumen por mes</h2></div></div><div className="v2-table-scroll"><table className="v2-table"><thead><tr><th>Mes</th><th>Fletes</th><th>Cobros</th><th>Participación registrada</th></tr></thead><tbody>{[...months].reverse().map((month) => <tr key={month.key}><td><strong>{month.label} {month.key.slice(0, 4)}</strong></td><td>{month.jobs}</td><td>{money.format(month.gross)}</td><td>{money.format(month.owner)}</td></tr>)}</tbody></table></div></div>
  </div>;
}
