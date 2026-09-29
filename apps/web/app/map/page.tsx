'use client';
// MAP — strictly opt-in friend location sharing on an original schematic canvas.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiException } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Avatar, Button, Input, EmptyState, ErrorState, LoadingScreen, Spinner, Badge, Toggle } from '@/components/ui';
import { IconChevronLeft, IconPin, IconEyeOff, IconEye, IconClock, IconRefresh, IconUsers } from '@/lib/icons';
import { sounds } from '@/lib/sounds';
import type { User } from '@sigma-snap/shared';

type ShareMode = 'OFF' | 'FRIENDS' | 'TEMPORARY';
type Consent = 'unknown' | 'granted' | 'declined';

interface FriendWithLoc extends User {
  lastLatitude?: number | null;
  lastLongitude?: number | null;
  locationUpdatedAt?: string | null;
}

interface Dot { lat: number; lng: number; label: string; me?: boolean }

const CONSENT_KEY = 'sigmasnap.map.consent';

function errMsg(e: unknown): string {
  return e instanceof ApiException ? e.message : e instanceof Error ? e.message : 'Something went wrong';
}

/** Original schematic "map": dark void grid + glowing dots. Clearly labeled as schematic. */
function SchematicMap({ dots }: { dots: Dot[] }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let t = 0;

    const draw = () => {
      t += 0.016;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr; canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // background
      const bg = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, Math.max(w, h) * 0.75);
      bg.addColorStop(0, '#141423');
      bg.addColorStop(1, '#0B0B12');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      // grid
      ctx.strokeStyle = 'rgba(124,92,255,0.10)';
      ctx.lineWidth = 1;
      const step = 34;
      ctx.beginPath();
      for (let x = step / 2; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      for (let y = step / 2; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();
      // radar rings around center
      const cx = w / 2, cy = h / 2;
      ctx.strokeStyle = 'rgba(56,225,255,0.14)';
      for (let r = 46; r < Math.max(w, h); r += 46) {
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      }
      // project lat/lng to canvas
      const lats = dots.map((d) => d.lat), lngs = dots.map((d) => d.lng);
      let minLat = Math.min(...lats, 0), maxLat = Math.max(...lats, 0);
      let minLng = Math.min(...lngs, 0), maxLng = Math.max(...lngs, 0);
      const padLat = Math.max(0.002, (maxLat - minLat) * 0.25);
      const padLng = Math.max(0.002, (maxLng - minLng) * 0.25);
      minLat -= padLat; maxLat += padLat; minLng -= padLng; maxLng += padLng;
      const px = (lng: number) => 24 + ((lng - minLng) / (maxLng - minLng || 1)) * (w - 48);
      const py = (lat: number) => 24 + (1 - (lat - minLat) / (maxLat - minLat || 1)) * (h - 48);

      for (const d of dots) {
        const x = px(d.lng), y = py(d.lat);
        if (d.me) {
          // pulse rings
          for (let i = 0; i < 2; i++) {
            const pr = 14 + ((t * 22 + i * 18) % 40);
            ctx.strokeStyle = `rgba(124,92,255,${Math.max(0, 0.5 - pr / 90)})`;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(x, y, pr, 0, Math.PI * 2); ctx.stroke();
          }
          glowDot(ctx, x, y, 7, '#7C5CFF');
          ctx.fillStyle = '#F2F2FA';
          ctx.font = '700 11px Inter, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('You', x, y - 16);
        } else {
          glowDot(ctx, x, y, 5.5, '#38E1FF');
          ctx.fillStyle = 'rgba(242,242,250,0.85)';
          ctx.font = '600 10px Inter, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(d.label, x, y - 13);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    const glowDot = (c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) => {
      const g = c.createRadialGradient(x, y, 0, x, y, r * 3);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, r * 3, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(x, y, r * 0.45, 0, Math.PI * 2); c.fill();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [dots]);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-line">
      <canvas ref={ref} className="h-[340px] w-full" aria-label="Schematic friend map" />
      <span className="absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-dim backdrop-blur">
        Schematic · not to scale
      </span>
    </div>
  );
}

export default function MapPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [consent, setConsent] = useState<Consent>('unknown');
  const [mode, setMode] = useState<ShareMode>('OFF');
  const [mePos, setMePos] = useState<{ lat: number; lng: number } | null>(null);
  const [invisible, setInvisible] = useState(false);
  const [prevMode, setPrevMode] = useState<ShareMode>('FRIENDS');
  const [tempMinutes, setTempMinutes] = useState(30);
  const [tempExpiresAt, setTempExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  const [friends, setFriends] = useState<FriendWithLoc[]>([]);
  const [friendsState, setFriendsState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);
  useEffect(() => {
    try {
      const t = localStorage.getItem('sigmasnap.theme');
      if (t === 'light') document.documentElement.dataset.theme = 'light';
      setConsent((localStorage.getItem(CONSENT_KEY) as Consent) || 'unknown');
    } catch { /* noop */ }
  }, []);

  // temporary-sharing countdown ticker
  useEffect(() => {
    if (!tempExpiresAt) return;
    const id = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= tempExpiresAt) {
        setTempExpiresAt(null);
        setMode('OFF');
        setNotice('Temporary sharing expired — you are hidden again.');
      }
    }, 1000);
    return () => clearInterval(id);
  }, [tempExpiresAt]);

  const loadFriends = useCallback(async () => {
    setFriendsState('loading'); setBanner('');
    try {
      const list = (await api.friends()) as FriendWithLoc[];
      setFriends(list);
      setFriendsState('ready');
    } catch (e) { setFriendsState('error'); setBanner(errMsg(e)); }
  }, []);

  useEffect(() => {
    if (user && consent === 'granted') void loadFriends();
  }, [user, consent, loadFriends]);

  if (loading || !user) return <LoadingScreen label="Loading map…" />;

  const saveConsent = (c: Consent) => {
    try { localStorage.setItem(CONSENT_KEY, c); } catch { /* noop */ }
    setConsent(c);
  };

  const enableSharing = () => {
    saveConsent('granted');
    sounds.tap();
    setNotice('Now we need your position — your browser will ask for permission.');
    requestPosition('FRIENDS');
  };

  /** Only ever called from an explicit user action. */
  const requestPosition = (nextMode: ShareMode, minutes?: number) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setBanner('Geolocation is not available on this device.');
      sounds.error();
      return;
    }
    setBusy(true); setBanner(''); setNotice('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        try {
          await api.updateLocation({ mode: nextMode, latitude: lat, longitude: lng, minutes });
          setMePos({ lat, lng });
          setMode(nextMode);
          setTempExpiresAt(nextMode === 'TEMPORARY' && minutes ? Date.now() + minutes * 60000 : null);
          setInvisible(false);
          sounds.success();
          setNotice(nextMode === 'OFF' ? 'Location sharing is off.' : 'Your location is now visible to friends.');
          void loadFriends();
        } catch (e) { setBanner(errMsg(e)); sounds.error(); }
        finally { setBusy(false); }
      },
      (err) => {
        setBusy(false); sounds.error();
        setBanner(err.code === 1
          ? 'Location permission was denied. Enable it in your browser settings to share.'
          : 'Could not get your position. Try again.');
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 },
    );
  };

  const stopSharing = async () => {
    setBusy(true); setBanner('');
    try {
      await api.updateLocation({ mode: 'OFF' });
      setMode('OFF'); setTempExpiresAt(null); setMePos(null); setInvisible(false);
      sounds.tap();
      setNotice('Stopped sharing. Friends can no longer see your location.');
    } catch (e) { setBanner(errMsg(e)); sounds.error(); }
    finally { setBusy(false); }
  };

  const toggleInvisible = async (v: boolean) => {
    setBusy(true); setBanner('');
    try {
      if (v) {
        setPrevMode(mode === 'OFF' ? 'FRIENDS' : mode);
        await api.updateLocation({ mode: 'OFF' });
        setMode('OFF'); setTempExpiresAt(null); setInvisible(true);
        setNotice('Invisible mode on — you are hidden, sharing paused.');
      } else {
        setInvisible(false);
        requestPosition(prevMode, prevMode === 'TEMPORARY' ? tempMinutes : undefined);
        return;
      }
      sounds.tap();
    } catch (e) { setBanner(errMsg(e)); sounds.error(); }
    finally { setBusy(false); }
  };

  const sharingFriends = friends.filter((f) => f.lastLatitude != null && f.lastLongitude != null);
  const dots: Dot[] = [
    ...(mePos && mode !== 'OFF' ? [{ lat: mePos.lat, lng: mePos.lng, label: 'You', me: true }] : []),
    ...sharingFriends.map((f) => ({ lat: f.lastLatitude!, lng: f.lastLongitude!, label: f.displayName.split(' ')[0] })),
  ];
  const tempLeft = tempExpiresAt ? Math.max(0, tempExpiresAt - now) : 0;
  const tempLabel = tempExpiresAt
    ? `${Math.floor(tempLeft / 60000)}:${String(Math.floor((tempLeft % 60000) / 1000)).padStart(2, '0')}`
    : '';

  return (
    <div className="animate-fade-up px-4 pt-6">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/profile" className="rounded-full bg-panel p-2.5 text-dim hover:text-ink" aria-label="Back to profile">
          <IconChevronLeft size={18} />
        </Link>
        <h1 className="text-xl font-extrabold tracking-tight">Map</h1>
        {mode !== 'OFF' && !invisible && <Badge tone={mode === 'TEMPORARY' ? 'gold' : 'cy'}>Sharing</Badge>}
        {invisible && <Badge tone="vio">Invisible</Badge>}
      </div>

      {banner && <div className="mb-3 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{banner}</div>}
      {notice && <div className="mb-3 rounded-2xl border border-cy/30 bg-cy/10 px-4 py-3 text-sm text-cy">{notice}</div>}

      {consent !== 'granted' ? (
        /* ── explicit opt-in gate ── */
        <div className="rounded-3xl border border-vio/30 bg-gradient-to-b from-vio/10 to-panel p-6 text-center shadow-glow">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-vio/15 text-vio">
            <IconPin size={30} />
          </div>
          <h2 className="text-lg font-extrabold">Share your location with friends?</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm text-dim">
            Opt in to show your live position to friends on a private schematic map.
            Nothing is tracked until you enable it — you can pause or stop anytime.
          </p>
          <div className="mt-5 flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => { saveConsent('declined'); sounds.tap(); }}>
              Not now
            </Button>
            <Button className="flex-1" onClick={enableSharing}>
              Enable
            </Button>
          </div>
          {consent === 'declined' && (
            <p className="mt-4 text-xs text-dim">
              Location sharing stays off. You can enable it anytime from this page.
            </p>
          )}
        </div>
      ) : (
        <div className="pb-10">
          {/* schematic map */}
          {mePos && mode !== 'OFF' ? (
            <SchematicMap dots={dots} />
          ) : (
            <div className="flex h-[220px] flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-line bg-panel text-center">
              <IconEyeOff size={26} className="text-dim" />
              <p className="text-sm font-semibold text-ink">You're not sharing right now</p>
              <p className="max-w-[260px] text-xs text-dim">Choose a sharing mode below to appear on the schematic map.</p>
            </div>
          )}

          {/* controls */}
          <div className="mt-4 rounded-3xl border border-line bg-panel p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-dim">Sharing mode</p>
            <div className="grid grid-cols-3 gap-2">
              {(['OFF', 'FRIENDS', 'TEMPORARY'] as ShareMode[]).map((m) => (
                <button key={m} disabled={busy}
                  onClick={() => {
                    sounds.tap();
                    if (m === 'OFF') void stopSharing();
                    else requestPosition(m, m === 'TEMPORARY' ? tempMinutes : undefined);
                  }}
                  className={`rounded-2xl px-3 py-3 text-xs font-bold transition disabled:opacity-40 ${mode === m && !invisible ? 'bg-vio text-white shadow-glow' : 'bg-panel2 text-dim hover:text-ink'}`}>
                  {m === 'OFF' ? 'Off' : m === 'FRIENDS' ? 'Friends' : 'Temporary'}
                </button>
              ))}
            </div>

            {mode === 'TEMPORARY' && !invisible && (
              <div className="mt-3 flex items-center gap-3 rounded-2xl bg-panel2 p-3">
                <IconClock size={18} className="shrink-0 text-gold" />
                <div className="flex-1">
                  <label className="text-xs text-dim">Share for (minutes)</label>
                  <Input type="number" min={5} max={180} value={tempMinutes}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setTempMinutes(Number.isFinite(v) ? Math.min(180, Math.max(5, v)) : 30);
                    }} className="!py-2" />
                </div>
                {tempExpiresAt && (
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-dim">Ends in</p>
                    <p className="font-mono text-lg font-bold text-gold">{tempLabel}</p>
                  </div>
                )}
              </div>
            )}

            <div className="mt-3 flex items-center justify-between rounded-2xl bg-panel2 p-3">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                  {invisible ? <IconEyeOff size={15} className="text-vio" /> : <IconEye size={15} className="text-dim" />}
                  Invisible mode
                </p>
                <p className="text-xs text-dim">Hide yourself without revoking consent.</p>
              </div>
              <Toggle checked={invisible} onChange={toggleInvisible} />
            </div>

            <div className="mt-3 flex gap-2">
              <Button variant="ghost" className="flex-1" disabled={busy || mode === 'OFF'} onClick={() => requestPosition(mode === 'OFF' ? 'FRIENDS' : mode, tempMinutes)}>
                {busy ? <Spinner size={16} /> : <span className="flex items-center justify-center gap-1.5"><IconRefresh size={15} /> Refresh position</span>}
              </Button>
              {mode !== 'OFF' && (
                <Button variant="danger" className="flex-1" disabled={busy} onClick={stopSharing}>
                  Stop sharing
                </Button>
              )}
            </div>
          </div>

          {/* friends on map */}
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink"><IconUsers size={15} /> Friends sharing</h3>
              <button onClick={() => { sounds.tap(); void loadFriends(); }} className="text-xs font-semibold text-vio hover:underline">
                Refresh
              </button>
            </div>
            {friendsState === 'loading' ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : friendsState === 'error' ? (
              <ErrorState message={banner || 'Could not load friends.'} onRetry={loadFriends} />
            ) : sharingFriends.length === 0 ? (
              <EmptyState title="No friends sharing yet" hint="When friends enable location sharing, they'll appear here as glowing dots." />
            ) : (
              <div className="flex flex-col gap-2">
                {sharingFriends.map((f) => (
                  <Link key={f.id} href={`/profile/${f.username}`} className="flex items-center gap-3 rounded-2xl bg-panel p-3 hover:border-line border border-transparent">
                    <div className="relative">
                      <Avatar src={f.avatarUrl} name={f.displayName} size={42} />
                      <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-cy shadow-glow" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{f.displayName}</p>
                      <p className="truncate text-xs text-dim">
                        {f.locationUpdatedAt
                          ? `Updated ${new Date(f.locationUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : 'Sharing location'}
                      </p>
                    </div>
                    <IconPin size={16} className="text-cy" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
