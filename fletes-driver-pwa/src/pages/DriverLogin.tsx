import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getDriverByCode } from '../lib/api';
import { getDriverSession, setDriverSession } from '../lib/driverSession';

export default function DriverLogin() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const existing = getDriverSession();
    if (existing) {
      navigate('/driver', { replace: true });
    }
  }, [navigate]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      toast.error('Ingresa tu codigo');
      return;
    }
    try {
      setLoading(true);
      const driver = await getDriverByCode(trimmed);
      if (!driver.active) {
        toast.error('Conductor inactivo');
        return;
      }
      setDriverSession({ driverId: driver.id, code: driver.code, name: driver.name });
      navigate('/driver', { replace: true });
    } catch {
      toast.error('Codigo invalido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Ingreso chofer</h1>
          <p className="text-sm text-gray-500">Ingresa el codigo que te dio el administrador.</p>
        </div>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Codigo"
          className="w-full rounded border px-3 py-2"
          autoComplete="off"
        />
        <button
          type="submit"
          className="w-full rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          disabled={loading}
        >
          {loading ? 'Validando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
