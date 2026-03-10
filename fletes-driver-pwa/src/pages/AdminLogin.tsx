import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getAdminSession, setAdminSession, type AdminRole } from '../lib/adminSession';

const normalizeCode = (value: string) => value.trim().toUpperCase();

const getRoleCode = (role: AdminRole) => {
  const fallback = role === 'owner' ? 'DUENO' : 'ASISTENTE';
  const raw = role === 'owner'
    ? import.meta.env.VITE_ADMIN_OWNER_CODE
    : import.meta.env.VITE_ADMIN_ASSISTANT_CODE;
  const cleaned = typeof raw === 'string' ? raw.trim() : '';
  return normalizeCode(cleaned || fallback);
};

export default function AdminLogin() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const ownerCode = getRoleCode('owner');
  const assistantCode = getRoleCode('assistant');

  useEffect(() => {
    const existing = getAdminSession();
    if (existing) {
      navigate('/admin?tab=jobs', { replace: true });
    }
  }, [navigate]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = normalizeCode(code);
    if (!trimmed) {
      toast.error('Ingresa el codigo');
      return;
    }
    let role: AdminRole | null = null;
    if (trimmed === ownerCode) role = 'owner';
    if (!role && trimmed === assistantCode) role = 'assistant';
    if (!role) {
      toast.error('Codigo invalido');
      return;
    }
    setLoading(true);
    setAdminSession({ role });
    navigate('/admin?tab=jobs', { replace: true });
    setLoading(false);
  };

  return (
    <div className="h-full flex items-center justify-center">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Ingreso admin</h1>
          <p className="text-sm text-gray-500">Ingresa el codigo de acceso.</p>
        </div>
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Codigo de acceso"
          className="w-full rounded border px-3 py-2"
          autoComplete="off"
          type="password"
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
