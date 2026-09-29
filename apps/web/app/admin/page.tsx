'use client';
// Admin panel — role-gated. Overview, users, reports, appeals, content,
// catalog (lenses/templates), ops (sounds, AI usage, audit, broadcast).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { LoadingScreen, Tabs, Badge } from '@/components/ui';
import { IconShield } from '@/lib/icons';
import { useToasts, AdminGateDenied } from '@/components/admin/common';
import Overview from '@/components/admin/Overview';
import Users from '@/components/admin/Users';
import Reports from '@/components/admin/Reports';
import Appeals from '@/components/admin/Appeals';
import Content from '@/components/admin/Content';
import Catalog from '@/components/admin/Catalog';
import Cms from '@/components/admin/Cms';
import Ops from '@/components/admin/Ops';

type TabId = 'overview' | 'users' | 'reports' | 'appeals' | 'content' | 'catalog' | 'cms' | 'ops';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'reports', label: 'Reports' },
  { id: 'appeals', label: 'Appeals' },
  { id: 'content', label: 'Content' },
  { id: 'catalog', label: 'Lenses & Templates' },
  { id: 'cms', label: 'CMS' },
  { id: 'ops', label: 'Ops' },
];

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<TabId>('overview');
  const { notify, host } = useToasts();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  if (loading) return <LoadingScreen label="Checking permissions…" />;
  if (!user) return null;
  if (user.role !== 'ADMIN') return <AdminGateDenied />;

  return (
    <div className="mx-auto max-w-md px-4 pb-8 pt-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-extrabold">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-vio/15 text-vio"><IconShield size={18} /></span>
            Admin panel
          </h1>
          <p className="mt-0.5 text-xs text-dim">Signed in as @{user.username}</p>
        </div>
        <Badge tone="cy">ADMIN</Badge>
      </div>

      <div className="mt-4">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
      </div>

      <div className="mt-4" key={tab}>
        {tab === 'overview' && <Overview notify={notify} />}
        {tab === 'users' && <Users notify={notify} />}
        {tab === 'reports' && <Reports notify={notify} />}
        {tab === 'appeals' && <Appeals notify={notify} />}
        {tab === 'content' && <Content notify={notify} />}
        {tab === 'catalog' && <Catalog notify={notify} />}
        {tab === 'cms' && <Cms notify={notify} />}
        {tab === 'ops' && <Ops notify={notify} />}
      </div>

      {host}
    </div>
  );
}
