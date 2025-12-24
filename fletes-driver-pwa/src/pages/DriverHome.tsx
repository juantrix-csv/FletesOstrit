import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { Play } from 'lucide-react';
export default function DriverHome() {
  const navigate = useNavigate();
  const active = useLiveQuery(() => db.jobs.filter(j => j.status !== 'DONE' && j.status !== 'PENDING').first());
  const next = useLiveQuery(() => db.jobs.where('status').equals('PENDING').first());
  const job = active || next;
  return (
    <div className="h-full flex flex-col items-center justify-center space-y-6">
      <h1 className="text-2xl font-bold">Mis Viajes</h1>
      {job ? (
        <div className="w-full max-w-xs space-y-4">
          <div className="p-4 bg-white shadow rounded">
            <p className="text-blue-600 font-bold">{active ? 'EN CURSO' : 'PENDIENTE'}</p>
            <p className="text-lg">{job.clientName}</p>
          </div>
          <button onClick={() => navigate('/job/' + job.id)} className="w-full bg-blue-600 text-white p-4 rounded-xl flex items-center justify-center gap-2">
            <Play size={20} /> {active ? 'CONTINUAR' : 'EMPEZAR'}
          </button>
        </div>
      ) : <p>No hay fletes asignados</p>}
    </div>
  );
}