'use client';
// SIGMA SNAP — create an account.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ApiException } from '@/lib/api';
import { sounds } from '@/lib/sounds';
import { Button, Input, Spinner } from '@/components/ui';
import { Logo, IconEye, IconEyeOff, IconCheck, IconX } from '@/lib/icons';

const USER_RE = /^[a-z0-9._]{3,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Fields { email: string; username: string; displayName: string; password: string; confirm: string; }

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading: authLoading, register } = useAuth();
  const [f, setF] = useState<Fields>({ email: '', username: '', displayName: '', password: '', confirm: '' });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authLoading && user) router.replace('/camera');
  }, [authLoading, user, router]);

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));
  const touch = (k: keyof Fields) => () => setTouched((p) => ({ ...p, [k]: true }));

  const fieldErrors: Record<keyof Fields, string> = {
    email: !EMAIL_RE.test(f.email.trim()) ? 'Enter a valid email address.' : '',
    username: !USER_RE.test(f.username) ? '3–24 chars: lowercase letters, numbers, dots and underscores.' : '',
    displayName:
      f.displayName.trim().length < 1
        ? 'Display name is required.'
        : f.displayName.length > 64
          ? 'Keep it under 64 characters.'
          : '',
    password: f.password.length < 8 ? 'Use at least 8 characters.' : '',
    confirm: f.confirm !== f.password || f.confirm.length === 0 ? 'Passwords do not match.' : '',
  };
  const show = (k: keyof Fields) => touched[k] ? fieldErrors[k] : '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setTouched({ email: true, username: true, displayName: true, password: true, confirm: true });
    if (Object.values(fieldErrors).some(Boolean)) {
      setError('Please fix the highlighted fields.');
      sounds.error();
      return;
    }
    setBusy(true);
    setError('');
    try {
      await register({
        email: f.email.trim(),
        username: f.username,
        password: f.password,
        displayName: f.displayName.trim(),
      });
      sounds.success();
      router.replace('/camera');
    } catch (e2) {
      setError(e2 instanceof ApiException ? e2.message : 'Registration failed. Please try again.');
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

  const usernameOk = USER_RE.test(f.username);

  const field = (
    k: keyof Fields,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement>,
    hint?: React.ReactNode,
  ) => (
    <div>
      <label htmlFor={`reg-${k}`} className="mb-1.5 block text-xs font-semibold text-dim">
        {label}
      </label>
      <Input
        id={`reg-${k}`}
        {...props}
        value={f[k]}
        onChange={set(k)}
        onBlur={touch(k)}
      />
      {hint}
      {show(k) && <p className="mt-1.5 text-xs text-danger">{show(k)}</p>}
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-void px-6 py-10">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo size={52} />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Join <span className="text-gradient">SIGMA SNAP</span>
            </h1>
            <p className="mt-1 text-sm text-dim">Your lens on the world.</p>
          </div>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4 rounded-3xl border border-line bg-panel p-6 shadow-card" noValidate>
          {field('email', 'Email', {
            type: 'email', autoComplete: 'email', autoCapitalize: 'none', autoCorrect: 'off',
            placeholder: 'you@example.com',
          })}
          {field(
            'username',
            'Username',
            {
              autoComplete: 'username', autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false,
              placeholder: 'sigma.shooter',
            },
            <p className={`mt-1.5 flex items-center gap-1.5 text-xs ${f.username.length === 0 ? 'text-dim' : usernameOk ? 'text-cy' : 'text-danger'}`}>
              {f.username.length === 0 ? (
                <>Use 3–24 lowercase letters, numbers, <code className="rounded bg-panel2 px-1">.</code> or <code className="rounded bg-panel2 px-1">_</code></>
              ) : usernameOk ? (
                <><IconCheck size={14} /> Looks good</>
              ) : (
                <><IconX size={14} /> 3–24 chars: a–z, 0–9, . and _</>
              )}
            </p>,
          )}
          {field('displayName', 'Display name', { autoComplete: 'name', placeholder: 'Sigma Shooter', maxLength: 64 })}
          {field('password', 'Password', {
            type: showPw ? 'text' : 'password', autoComplete: 'new-password', placeholder: 'At least 8 characters',
          })}
          {field('confirm', 'Confirm password', {
            type: showPw ? 'text' : 'password', autoComplete: 'new-password', placeholder: 'Repeat your password',
          })}

          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="flex items-center gap-2 self-start text-xs font-semibold text-dim hover:text-ink"
          >
            {showPw ? <IconEyeOff size={15} /> : <IconEye size={15} />}
            {showPw ? 'Hide passwords' : 'Show passwords'}
          </button>

          {error && (
            <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}

          <Button type="submit" disabled={busy} className="flex items-center justify-center gap-2">
            {busy && <Spinner size={16} className="text-white" />}
            {busy ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-dim">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-vio hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
