'use client';
// SIGMA SNAP — sign in.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ApiException } from '@/lib/api';
import { sounds } from '@/lib/sounds';
import { Button, Input, Spinner } from '@/components/ui';
import { Logo, IconEye, IconEyeOff } from '@/lib/icons';

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading, login } = useAuth();
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authLoading && user) router.replace('/camera');
  }, [authLoading, user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!id.trim() || !password) {
      setError('Enter your email or username and your password.');
      sounds.error();
      return;
    }
    setBusy(true);
    setError('');
    try {
      await login(id.trim(), password);
      sounds.success();
      router.replace('/camera');
    } catch (e2) {
      setError(e2 instanceof ApiException ? e2.message : 'Sign in failed. Please try again.');
      sounds.error();
    } finally {
      setBusy(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-void">
        <Spinner size={30} />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-void px-6 py-10">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo size={52} />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Welcome to <span className="text-gradient">SIGMA SNAP</span>
            </h1>
            <p className="mt-1 text-sm text-dim">Capture, create, connect.</p>
          </div>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4 rounded-3xl border border-line bg-panel p-6 shadow-card">
          <div>
            <label htmlFor="login-id" className="mb-1.5 block text-xs font-semibold text-dim">
              Email or username
            </label>
            <Input
              id="login-id"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="you@example.com"
              value={id}
              onChange={(e) => setId(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="login-pw" className="mb-1.5 block text-xs font-semibold text-dim">
              Password
            </label>
            <div className="relative">
              <Input
                id="login-pw"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dim hover:text-ink"
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}

          <Button type="submit" disabled={busy} className="flex items-center justify-center gap-2">
            {busy && <Spinner size={16} className="text-white" />}
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-dim">
          New here?{' '}
          <Link href="/register" className="font-semibold text-vio hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
