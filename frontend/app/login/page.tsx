'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, LoginResponse } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await apiClient.post<LoginResponse>('/api/auth/login', {
        username,
        password,
      });
      login(data.access_token, data.role, username);
      router.replace(data.role === 'staff' ? '/pos' : '/analytics/sales');
    } catch {
      setError('帳號或密碼錯誤');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-linen px-4">
      <div className="w-full max-w-sm rounded-2xl border border-sand/60 bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-dusk/60">Modular Retail Suite</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-wide text-dusk">about-nine²</h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm text-dusk">
            帳號
            <input
              className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2 text-dusk focus:outline-none focus:ring-2 focus:ring-dusk/30"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm text-dusk">
            密碼
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2 text-dusk focus:outline-none focus:ring-2 focus:ring-dusk/30"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-dusk py-2 text-sm font-semibold text-amber-50 shadow hover:bg-dusk/90 disabled:opacity-60"
          >
            {loading ? '登入中...' : '登入'}
          </button>
        </form>
      </div>
    </div>
  );
}
