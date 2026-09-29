'use client';
// SETTINGS — account, privacy, notifications, plans, appearance, about.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiException } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Input, EmptyState, ErrorState, LoadingScreen, Spinner, Toggle, Badge } from '@/components/ui';
import {
  IconChevronLeft, IconLock, IconShield, IconBell, IconWallet, IconEye, IconLogout, IconCheck, IconUsers,
} from '@/lib/icons';
import { sounds } from '@/lib/sounds';

type MsgAudience = 'EVERYONE' | 'FRIENDS' | 'NOBODY';
type StoryPrivacy = 'EVERYONE' | 'FRIENDS' | 'CLOSE';

const NOTIF_TYPES = [
  { key: 'likes', label: 'Likes', hint: 'When someone likes your posts' },
  { key: 'comments', label: 'Comments', hint: 'Replies on your posts' },
  { key: 'follows', label: 'Follows', hint: 'New followers and friend requests' },
  { key: 'messages', label: 'Messages', hint: 'New chat messages' },
  { key: 'stories', label: 'Stories', hint: 'Friends post new stories' },
  { key: 'calls', label: 'Calls', hint: 'Incoming voice and video calls' },
] as const;

function errMsg(e: unknown): string {
  return e instanceof ApiException ? e.message : e instanceof Error ? e.message : 'Something went wrong';
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-panel p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-dim">
        <span className="text-vio">{icon}</span> {title}
      </h2>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const { user, loading, logout, refreshUser } = useAuth();
  const router = useRouter();
  const [banner, setBanner] = useState('');

  // account
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameBusy, setUsernameBusy] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});
  const [pwBusy, setPwBusy] = useState(false);
  const [pwDone, setPwDone] = useState(false);

  // privacy
  const [isPrivate, setIsPrivate] = useState(false);
  const [msgFrom, setMsgFrom] = useState<MsgAudience>('EVERYONE');
  const [storyPrivacy, setStoryPrivacy] = useState<StoryPrivacy>('FRIENDS');
  const [showOnline, setShowOnline] = useState(true);
  const [privacyBusy, setPrivacyBusy] = useState(false);

  // notifications
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({
    likes: true, comments: true, follows: true, messages: true, stories: true, calls: true,
  });
  const [notifBusy, setNotifBusy] = useState(false);

  // plans
  const [plans, setPlans] = useState<Array<{ id?: string; name?: string; priceMonthlyUSD?: number; price?: number; perks?: string[] }>>([]);
  const [features, setFeatures] = useState<Record<string, string | number | boolean>>({});
  const [plansState, setPlansState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null);
  const [checkoutMsg, setCheckoutMsg] = useState('');

  // appearance
  const [lightTheme, setLightTheme] = useState(false);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    setUsername(user.username);
    try {
      const t = localStorage.getItem('sigmasnap.theme');
      const light = t === 'light';
      setLightTheme(light);
      if (light) document.documentElement.dataset.theme = 'light';
    } catch { /* noop */ }
    // hydrate privacy + notification prefs from profile
    api.getUser(user.username).then((p) => {
      const x = p as unknown as Record<string, unknown>;
      if (typeof x.isPrivate === 'boolean') setIsPrivate(x.isPrivate);
      if (typeof x.allowMessagesFrom === 'string') setMsgFrom(x.allowMessagesFrom as MsgAudience);
      if (typeof x.storyPrivacyDefault === 'string') setStoryPrivacy(x.storyPrivacyDefault as StoryPrivacy);
      if (typeof x.showOnlineStatus === 'boolean') setShowOnline(x.showOnlineStatus);
      const np = x.notificationPrefs as Record<string, boolean> | undefined;
      if (np) setNotifPrefs((s) => ({ ...s, ...np }));
    }).catch(() => { /* keep defaults */ });
    loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadPlans = async () => {
    setPlansState('loading');
    try {
      const [pl, ft] = await Promise.all([api.plans(), api.features()]);
      setPlans(pl ?? []);
      setFeatures(ft ?? {});
      setPlansState('ready');
    } catch (e) { setPlansState('error'); setBanner(errMsg(e)); }
  };

  if (loading || !user) return <LoadingScreen label="Loading settings…" />;

  const changeUsername = async () => {
    const v = username.trim().toLowerCase();
    if (!/^[a-z0-9._]{3,24}$/.test(v)) {
      setUsernameError('3–24 chars, lowercase letters, numbers, dots and underscores only.');
      sounds.error();
      return;
    }
    setUsernameError(''); setUsernameBusy(true); setBanner('');
    try {
      await api.changeUsername(v);
      await refreshUser();
      sounds.success();
      setBanner('Username updated.');
    } catch (e) { setUsernameError(errMsg(e)); sounds.error(); }
    finally { setUsernameBusy(false); }
  };

  const changePassword = async () => {
    const errs: Record<string, string> = {};
    if (!pw.current) errs.current = 'Enter your current password.';
    if (pw.next.length < 8) errs.next = 'New password needs at least 8 characters.';
    if (pw.next && pw.next === pw.current) errs.next = 'New password must differ from the current one.';
    if (pw.confirm !== pw.next) errs.confirm = 'Passwords do not match.';
    setPwErrors(errs);
    if (Object.keys(errs).length > 0) { sounds.error(); return; }
    setPwBusy(true); setBanner('');
    try {
      await api.changePassword({ currentPassword: pw.current, newPassword: pw.next });
      setPw({ current: '', next: '', confirm: '' });
      setPwDone(true);
      sounds.success();
    } catch (e) { setPwErrors({ current: errMsg(e) }); sounds.error(); }
    finally { setPwBusy(false); }
  };

  const savePrivacy = async (patch: Record<string, unknown>) => {
    setPrivacyBusy(true); setBanner('');
    try {
      await api.updatePrivacy(patch);
      await refreshUser();
      sounds.success();
    } catch (e) { setBanner(errMsg(e)); sounds.error(); }
    finally { setPrivacyBusy(false); }
  };

  const saveNotif = async (next: Record<string, boolean>) => {
    setNotifPrefs(next);
    setNotifBusy(true);
    try { await api.updateNotificationPrefs(next); sounds.tap(); }
    catch (e) { setBanner(errMsg(e)); sounds.error(); }
    finally { setNotifBusy(false); }
  };

  const checkout = async (planId: string) => {
    setCheckoutBusy(planId); setCheckoutMsg('');
    try {
      const res = await api.checkout(planId);
      if (res?.url) {
        sounds.success();
        window.location.href = res.url;
      } else {
        setCheckoutMsg('Checkout is not configured by the provider yet — upgrades are unavailable. Your current plan stays active.');
        sounds.error();
      }
    } catch (e) { setCheckoutMsg(errMsg(e)); sounds.error(); }
    finally { setCheckoutBusy(null); }
  };

  const toggleTheme = (light: boolean) => {
    setLightTheme(light);
    try {
      if (light) { document.documentElement.dataset.theme = 'light'; localStorage.setItem('sigmasnap.theme', 'light'); }
      else { delete document.documentElement.dataset.theme; localStorage.setItem('sigmasnap.theme', 'dark'); }
    } catch { /* noop */ }
    sounds.tap();
  };

  const doLogout = async () => {
    sounds.tap();
    await logout();
    router.replace('/login');
  };

  const planName = (p: { id?: string; name?: string }) => p.name ?? p.id ?? 'Plan';
  const planPrice = (p: { priceMonthlyUSD?: number; price?: number }) =>
    typeof p.priceMonthlyUSD === 'number' ? p.priceMonthlyUSD : typeof p.price === 'number' ? p.price : 0;

  return (
    <div className="animate-fade-up px-4 pt-6">
      {/* light-theme overrides, only active when html[data-theme='light'] */}
      <style jsx global>{`
        html[data-theme='light'] { color-scheme: light; }
        html[data-theme='light'] body { background: #eef0f6; }
        html[data-theme='light'] .bg-void { background-color: #eef0f6; }
        html[data-theme='light'] .bg-panel { background-color: #ffffff; }
        html[data-theme='light'] .bg-panel2 { background-color: #e9ebf3; }
        html[data-theme='light'] .text-ink { color: #14141c; }
        html[data-theme='light'] .text-dim { color: #5d5d78; }
        html[data-theme='light'] .border-line { border-color: #e0e2ec; }
      `}</style>

      <div className="mb-4 flex items-center gap-3">
        <Link href="/profile" className="rounded-full bg-panel p-2.5 text-dim hover:text-ink" aria-label="Back to profile">
          <IconChevronLeft size={18} />
        </Link>
        <h1 className="text-xl font-extrabold tracking-tight">Settings</h1>
      </div>

      {banner && <div className="mb-3 rounded-2xl border border-cy/30 bg-cy/10 px-4 py-3 text-sm text-cy">{banner}</div>}

      <div className="flex flex-col gap-4 pb-10">
        {/* ── Account ── */}
        <Section icon={<IconLock size={16} />} title="Account">
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-dim">Email</label>
              <Input value={user.email} disabled className="opacity-60" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-dim">Username</label>
              <div className="flex gap-2">
                <Input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} maxLength={24} />
                <Button onClick={changeUsername} disabled={usernameBusy || username.trim() === user.username} className="!px-4">
                  {usernameBusy ? <Spinner size={16} /> : 'Save'}
                </Button>
              </div>
              {usernameError ? <p className="mt-1 text-xs text-danger">{usernameError}</p>
                : <p className="mt-1 text-xs text-dim">Usernames can be changed at most once every 30 days.</p>}
            </div>
            <div className="border-t border-line pt-4">
              <p className="mb-2 text-sm font-bold text-ink">Change password</p>
              <div className="flex flex-col gap-2">
                <div>
                  <Input type="password" placeholder="Current password" value={pw.current}
                    onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
                  {pwErrors.current && <p className="mt-1 text-xs text-danger">{pwErrors.current}</p>}
                </div>
                <div>
                  <Input type="password" placeholder="New password (min 8 characters)" value={pw.next}
                    onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
                  {pwErrors.next && <p className="mt-1 text-xs text-danger">{pwErrors.next}</p>}
                </div>
                <div>
                  <Input type="password" placeholder="Confirm new password" value={pw.confirm}
                    onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" />
                  {pwErrors.confirm && <p className="mt-1 text-xs text-danger">{pwErrors.confirm}</p>}
                </div>
                <Button variant="outline" onClick={changePassword} disabled={pwBusy} className="mt-1 self-start">
                  {pwBusy ? <Spinner size={16} /> : 'Update password'}
                </Button>
                {pwDone && <p className="flex items-center gap-1.5 text-xs text-emerald-300"><IconCheck size={13} /> Password updated.</p>}
              </div>
            </div>
          </div>
        </Section>

        {/* ── Privacy ── */}
        <Section icon={<IconShield size={16} />} title="Privacy">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Private profile</p>
                <p className="text-xs text-dim">Only approved friends see your posts.</p>
              </div>
              <Toggle checked={isPrivate} onChange={(v) => { setIsPrivate(v); void savePrivacy({ isPrivate: v }); }} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-dim">Who can message me</label>
              <div className="grid grid-cols-3 gap-2">
                {(['EVERYONE', 'FRIENDS', 'NOBODY'] as MsgAudience[]).map((a) => (
                  <button key={a} disabled={privacyBusy}
                    onClick={() => { setMsgFrom(a); void savePrivacy({ allowMessagesFrom: a }); sounds.tap(); }}
                    className={`rounded-2xl px-2 py-2.5 text-xs font-bold transition disabled:opacity-40 ${msgFrom === a ? 'bg-vio text-white' : 'bg-panel2 text-dim hover:text-ink'}`}>
                    {a === 'EVERYONE' ? 'Everyone' : a === 'FRIENDS' ? 'Friends' : 'Nobody'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-dim">Default story privacy</label>
              <div className="grid grid-cols-3 gap-2">
                {(['EVERYONE', 'FRIENDS', 'CLOSE'] as StoryPrivacy[]).map((s) => (
                  <button key={s} disabled={privacyBusy}
                    onClick={() => { setStoryPrivacy(s); void savePrivacy({ storyPrivacyDefault: s }); sounds.tap(); }}
                    className={`rounded-2xl px-2 py-2.5 text-xs font-bold transition disabled:opacity-40 ${storyPrivacy === s ? 'bg-vio text-white' : 'bg-panel2 text-dim hover:text-ink'}`}>
                    {s === 'EVERYONE' ? 'Everyone' : s === 'FRIENDS' ? 'Friends' : 'Close friends'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Show online status</p>
                <p className="text-xs text-dim">Let friends see when you're active.</p>
              </div>
              <Toggle checked={showOnline} onChange={(v) => { setShowOnline(v); void savePrivacy({ showOnlineStatus: v }); }} />
            </div>
            <Link href="/friends" className="flex items-center justify-between rounded-2xl bg-panel2 px-4 py-3 hover:bg-white/5">
              <span className="flex items-center gap-2 text-sm font-semibold text-ink"><IconUsers size={16} className="text-dim" /> Blocked accounts</span>
              <IconChevronLeft size={16} className="rotate-180 text-dim" />
            </Link>
          </div>
        </Section>

        {/* ── Notifications ── */}
        <Section icon={<IconBell size={16} />} title="Notifications">
          <div className="flex flex-col gap-1">
            {NOTIF_TYPES.map((n) => (
              <div key={n.key} className="flex items-center justify-between gap-3 rounded-2xl px-1 py-2.5">
                <div>
                  <p className="text-sm font-semibold text-ink">{n.label}</p>
                  <p className="text-xs text-dim">{n.hint}</p>
                </div>
                <Toggle checked={!!notifPrefs[n.key]} onChange={(v) => void saveNotif({ ...notifPrefs, [n.key]: v })} />
              </div>
            ))}
            {notifBusy && <p className="text-xs text-dim">Saving…</p>}
            <p className="mt-2 rounded-2xl bg-panel2 px-4 py-3 text-xs text-dim">
              Push tokens are registered automatically on supported devices when you sign in.
            </p>
          </div>
        </Section>

        {/* ── Plans ── */}
        <Section icon={<IconWallet size={16} />} title="Plans">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-sm text-dim">Current plan:</span>
            <Badge tone={user.plan === 'FREE' ? 'vio' : 'gold'}>{user.plan}</Badge>
          </div>
          {plansState === 'loading' ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : plansState === 'error' ? (
            <ErrorState message={banner || 'Could not load plans.'} onRetry={loadPlans} />
          ) : plans.length === 0 ? (
            <EmptyState title="No plans available" hint="Plan details couldn't be loaded right now." />
          ) : (
            <div className="flex flex-col gap-3">
              {plans.map((p, i) => {
                const id = p.id ?? `plan-${i}`;
                const isCurrent = (p.id ?? p.name ?? '').toUpperCase() === user.plan;
                const price = planPrice(p);
                return (
                  <div key={id} className={`rounded-2xl border p-4 ${isCurrent ? 'border-vio bg-vio/10' : 'border-line bg-panel2'}`}>
                    <div className="flex items-center justify-between">
                      <p className="font-extrabold text-ink">{planName(p)}</p>
                      {isCurrent ? <Badge tone="vio">Current</Badge>
                        : <Badge tone="cy">${price}/mo</Badge>}
                    </div>
                    {p.perks && p.perks.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1">
                        {p.perks.map((perk, j) => (
                          <li key={j} className="flex items-start gap-1.5 text-xs text-dim">
                            <IconCheck size={13} className="mt-0.5 shrink-0 text-emerald-300" /> {perk}
                          </li>
                        ))}
                      </ul>
                    )}
                    {!isCurrent && (
                      <Button variant="outline" className="mt-3 w-full !py-2.5 text-sm"
                        disabled={checkoutBusy === id} onClick={() => checkout(id)}>
                        {checkoutBusy === id ? <Spinner size={16} /> : `Upgrade to ${planName(p)}`}
                      </Button>
                    )}
                  </div>
                );
              })}
              {checkoutMsg && <p className="rounded-2xl bg-panel2 px-4 py-3 text-xs text-dim">{checkoutMsg}</p>}
              {Object.keys(features).length > 0 && (
                <details className="rounded-2xl bg-panel2 px-4 py-3">
                  <summary className="cursor-pointer text-xs font-bold text-dim">Your feature flags</summary>
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    {Object.entries(features).map(([k, v]) => (
                      <p key={k} className="truncate text-[11px] text-dim">
                        <span className="text-ink/80">{k}</span>: {String(v)}
                      </p>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </Section>

        {/* ── Appearance ── */}
        <Section icon={<IconEye size={16} />} title="Appearance">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">Light theme</p>
              <p className="text-xs text-dim">Swap the void-dark look for a light one.</p>
            </div>
            <Toggle checked={lightTheme} onChange={toggleTheme} />
          </div>
        </Section>

        {/* ── About ── */}
        <Section icon={<IconShield size={16} />} title="About">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-dim">Version</p>
              <p className="text-sm font-bold text-ink">0.1.0</p>
            </div>
            <p className="rounded-2xl bg-panel2 px-4 py-3 text-xs leading-relaxed text-dim">
              SIGMA SNAP is an original design and codebase — every screen, icon and sound here was
              created for this project. No third-party layouts, artwork or audio are used.
            </p>
            <Button variant="danger" onClick={doLogout}>
              <span className="flex items-center justify-center gap-2"><IconLogout size={16} /> Log out</span>
            </Button>
          </div>
        </Section>
      </div>
    </div>
  );
}
