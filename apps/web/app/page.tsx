'use client';
// Root route — camera is the home screen; auth gate redirects to /login.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { LoadingScreen } from '@/components/ui';

export default function RootPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    router.replace(user ? '/camera' : '/login');
  }, [user, loading, router]);
  return <LoadingScreen label="Opening camera…" />;
}
