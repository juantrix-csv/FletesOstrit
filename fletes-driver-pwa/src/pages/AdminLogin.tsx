import { useEffect, useMemo, useState } from 'react';
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

const roleMeta = [
  { role: 'owner' as const, label: 'Dueno', detail: 'Ve analiticas y montos.' },
  { role: 'assistant' as const, label: 'Asistente', detail: 'Agenda, drivers y creacion de fletes.' },
];

export default function AdminLogin() {
  const navigate = useNavigate();
  const [role, setRole] = useState<AdminRole>('owner');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const expectedCode = useMemo(() => getRoleCode(role), [role]);

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
    if (trimmed !== expectedCode) {
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
          <p className="text-sm text-gray-500">Elige el rol y valida el codigo de acceso.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {roleMeta.map((item) => {
            const isActive = role === item.role;
            return (
              <button
                key={item.role}
                type="button"
                onClick={() => setRole(item.role)}
                className={[
                  "rounded-xl border px-3 py-2 text-left transition",
                  isActive ? "border-blue-600 bg-blue-50" : "border-gray-200 bg-white hover:border-blue-200",
                ].join(' ')}
              >
                <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                <p className="text-xs text-gray-500">{item.detail}</p>
              </button>
            );
          })}
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
