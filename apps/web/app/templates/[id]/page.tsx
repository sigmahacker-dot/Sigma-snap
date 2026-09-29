'use client';
// Template detail — fill slots, pick music, generate a draft post.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { api, ApiException } from '@/lib/api';
import {
  BottomSheet, Button, EmptyState, ErrorState, Input, LoadingScreen, Spinner, TextArea, Badge,
} from '@/components/ui';
import {
  IconChevronLeft, IconImage, IconText, IconMusic, IconCheck, IconWand,
  IconSearch, IconPlay, IconTemplate, IconChevronRight,
} from '@/lib/icons';
import { sounds } from '@/lib/sounds';
import type { Post, Sound, Template } from '@sigma-snap/shared';

interface Slot { index: number; kind: 'media' | 'text'; label: string; required: boolean }
interface TemplateExtra { effects?: string[]; filters?: string[]; transitions?: string[] }

export default function TemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user, loading } = useAuth();
  const router = useRouter();
  const [tpl, setTpl] = useState<Template | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [media, setMedia] = useState<Record<number, { assetId: string; url: string }>>({});
  const [texts, setTexts] = useState<Record<number, string>>({});
  const [uploading, setUploading] = useState<number | null>(null);
  const [musicOpen, setMusicOpen] = useState(false);
  const [soundsList, setSoundsList] = useState<Sound[]>([]);
  const [soundsBusy, setSoundsBusy] = useState(false);
  const [soundQuery, setSoundQuery] = useState('');
  const [musicId, setMusicId] = useState<string | null>(null);
  const [musicTitle, setMusicTitle] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Post | null>(null);
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  const load = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const t = await api.getTemplate(id);
      setTpl(t);
    } catch (e) {
      setError(e instanceof ApiException ? e.message : 'Could not load this template.');
    } finally {
      setBusy(false);
    }
  }, [id]);

  useEffect(() => { if (user) void load(); }, [user, load]);

  const slots: Slot[] = (tpl?.slots ?? []) as Slot[];
  const extra = (tpl ?? {}) as unknown as TemplateExtra;

  const pickFile = (index: number) => fileRefs.current[index]?.click();

  const onFile = async (index: number, file: File | undefined) => {
    if (!file) return;
    setUploading(index); setFormError(null);
    try {
      const kind = file.type.startsWith('video/') ? 'VIDEO' : 'PHOTO';
      const asset = await api.uploadFile(kind, file);
      setMedia((m) => ({ ...m, [index]: { assetId: asset.id, url: asset.thumbnailUrl ?? asset.url } }));
      sounds.success();
    } catch (e) {
      sounds.error();
      setFormError(e instanceof ApiException ? e.message : 'Upload failed. Try a smaller file.');
    } finally {
      setUploading(null);
    }
  };

  const openMusic = async () => {
    setMusicOpen(true); setSoundsBusy(true);
    try {
      const page = await api.sounds(soundQuery || undefined);
      setSoundsList(page?.data ?? []);
    } catch { setSoundsList([]); }
    finally { setSoundsBusy(false); }
  };

  const searchSounds = async () => {
    setSoundsBusy(true);
    try {
      const page = await api.sounds(soundQuery || undefined);
      setSoundsList(page?.data ?? []);
    } catch { /* noop */ }
    finally { setSoundsBusy(false); }
  };

  const useTemplate = async () => {
    if (!tpl) return;
    const missing = slots.filter((s) => s.required && (s.kind === 'media' ? !media[s.index] : !(texts[s.index] ?? '').trim()));
    if (missing.length > 0) {
      sounds.error();
      setFormError(`Fill the required slot${missing.length > 1 ? 's' : ''}: ${missing.map((s) => s.label).join(', ')}`);
      return;
    }
    setCreating(true); setFormError(null);
    try {
      const mediaMap: Record<number, string> = {};
      for (const [k, v] of Object.entries(media)) mediaMap[Number(k)] = v.assetId;
      const p = await api.useTemplate(tpl.id, { media: mediaMap, texts, musicId: musicId ?? undefined });
      sounds.success();
      setDraft(p);
    } catch (e) {
      sounds.error();
      setFormError(e instanceof ApiException ? e.message : 'Could not create the draft.');
    } finally {
      setCreating(false);
    }
  };

  if (loading || busy) return <LoadingScreen label="Loading template…" />;
  if (!user) return null;
  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 pt-5">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm font-bold text-dim hover:text-ink">
          <IconChevronLeft size={16} /> Back
        </button>
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }
  if (!tpl) return null;

  const mediaSlots = slots.filter((s) => s.kind === 'media');
  const textSlots = slots.filter((s) => s.kind === 'text');
  const chips = (
    [
      { label: 'Effects', items: extra.effects ?? [], tone: 'vio' as const },
      { label: 'Filters', items: extra.filters ?? [], tone: 'cy' as const },
      { label: 'Transitions', items: extra.transitions ?? [], tone: 'gold' as const },
    ] as Array<{ label: string; items: string[]; tone: 'vio' | 'cy' | 'gold' }>
  ).filter((c) => c.items.length > 0);

  return (
    <div className="mx-auto max-w-md px-4 pb-8 pt-5">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-sm font-bold text-dim hover:text-ink">
        <IconChevronLeft size={16} /> Templates
      </button>

      {/* Preview */}
      <div className="relative mt-3 aspect-[4/3] overflow-hidden rounded-3xl border border-line bg-panel">
        {tpl.previewUrl ? (
          <img src={tpl.previewUrl} alt={tpl.title} className="media-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-vio/50 to-cy/50 p-6 text-center">
            <IconTemplate size={34} className="text-white/80" />
            <p className="mt-2 text-lg font-extrabold text-white">{tpl.title}</p>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-3 left-3 right-3">
          <div className="flex items-center gap-2">
            <p className="text-lg font-extrabold text-white">{tpl.title}</p>
            {tpl.isPremium && <Badge tone="gold">PRO</Badge>}
          </div>
          {tpl.description && <p className="mt-1 line-clamp-2 text-xs text-white/80">{tpl.description}</p>}
        </div>
      </div>

      {chips.length > 0 && (
        <div className="mt-3 space-y-2">
          {chips.map((c) => (
            <div key={c.label}>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-dim">{c.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {c.items.map((it, i) => <Badge key={i} tone={c.tone}>{it}</Badge>)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Media slots */}
      {mediaSlots.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-bold">Your media <span className="font-normal text-dim">({mediaSlots.filter((s) => s.required).length} required)</span></p>
          <div className="grid grid-cols-3 gap-2">
            {mediaSlots.map((s) => {
              const filled = media[s.index];
              return (
                <div key={s.index}>
                  <button onClick={() => pickFile(s.index)} disabled={uploading === s.index}
                    className={`relative flex aspect-[3/4] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition
                      ${filled ? 'border-vio' : 'border-line bg-panel hover:border-vio/60'}`}>
                    {uploading === s.index ? (
                      <Spinner size={22} />
                    ) : filled ? (
                      <img src={filled.url} alt={s.label} className="media-cover" />
                    ) : (
                      <>
                        <IconImage size={22} className="text-dim" />
                        <span className="mt-1 px-1 text-center text-[10px] font-bold text-dim">{s.label}</span>
                      </>
                    )}
                    {filled && (
                      <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-vio text-white">
                        <IconCheck size={12} />
                      </span>
                    )}
                  </button>
                  <input ref={(el) => { fileRefs.current[s.index] = el; }} type="file" accept="image/*,video/*" className="hidden"
                    onChange={(e) => { void onFile(s.index, e.target.files?.[0]); e.target.value = ''; }} />
                  {s.required && !filled && <p className="mt-1 text-center text-[10px] font-bold text-danger">Required</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Text slots */}
      {textSlots.length > 0 && (
        <div className="mt-4 space-y-2.5">
          <p className="text-sm font-bold">Text</p>
          {textSlots.map((s) => (
            <label key={s.index} className="block">
              <span className="mb-1 block text-xs font-bold text-ink">
                {s.label}{s.required && <span className="text-danger"> *</span>}
              </span>
              <Input value={texts[s.index] ?? ''} placeholder={`Enter ${s.label.toLowerCase()}…`}
                onChange={(e) => setTexts((t) => ({ ...t, [s.index]: e.target.value }))} />
            </label>
          ))}
        </div>
      )}

      {/* Music */}
      <div className="mt-4">
        <p className="mb-2 text-sm font-bold">Music <span className="font-normal text-dim">(optional)</span></p>
        <button onClick={openMusic}
          className="flex w-full items-center gap-3 rounded-2xl border border-line bg-panel p-3 text-left hover:border-vio">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-vio/15 text-vio"><IconMusic size={18} /></span>
          <span className="flex-1">
            <span className="block text-sm font-bold text-ink">{musicTitle ?? 'Pick a sound'}</span>
            <span className="block text-[11px] text-dim">{musicTitle ? 'Tap to change' : 'From the sound library'}</span>
          </span>
          <IconChevronRight size={16} className="text-dim" />
        </button>
      </div>

      {formError && <p className="mt-3 rounded-2xl bg-danger/10 p-3 text-xs font-semibold text-danger">{formError}</p>}

      <Button className="mt-5 w-full" onClick={useTemplate} disabled={creating || uploading !== null}>
        {creating ? <span className="flex items-center justify-center gap-2"><Spinner size={16} /> Creating draft…</span>
          : <span className="flex items-center justify-center gap-2"><IconWand size={16} /> Use template</span>}
      </Button>

      {/* Success */}
      <BottomSheet open={!!draft} onClose={() => setDraft(null)} title="Draft ready">
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-cy/15 text-cy"><IconCheck size={26} /></span>
          <p className="mt-3 font-bold text-ink">Your video draft is ready</p>
          <p className="mt-1 text-sm text-dim">Polish it in the editor or find it later under Creator → Drafts.</p>
          <div className="mt-4 flex gap-2">
            <Button className="flex-1" onClick={() => draft && router.push(`/editor?postId=${draft.id}`)}>
              <span className="flex items-center justify-center gap-2"><IconPlay size={15} /> Open in editor</span>
            </Button>
            <Link href="/creator" className="flex-1">
              <Button variant="outline" className="w-full">View drafts</Button>
            </Link>
          </div>
        </div>
      </BottomSheet>

      {/* Music picker */}
      <BottomSheet open={musicOpen} onClose={() => setMusicOpen(false)} title="Pick a sound">
        <div className="mb-3 flex gap-2">
          <Input value={soundQuery} onChange={(e) => setSoundQuery(e.target.value)} placeholder="Search sounds…"
            onKeyDown={(e) => { if (e.key === 'Enter') void searchSounds(); }} />
          <button onClick={searchSounds} className="rounded-2xl bg-white/5 px-4 text-dim hover:text-ink" aria-label="Search">
            <IconSearch size={16} />
          </button>
        </div>
        {musicId && (
          <button onClick={() => { setMusicId(null); setMusicTitle(null); setMusicOpen(false); }}
            className="mb-2 w-full rounded-2xl border border-line bg-panel2 p-3 text-left text-xs font-bold text-danger">
            Remove selected sound
          </button>
        )}
        {soundsBusy ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : soundsList.length === 0 ? (
          <EmptyState title="No sounds found" hint="Try a different search." />
        ) : (
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {soundsList.map((s) => (
              <button key={s.id} onClick={() => { setMusicId(s.id); setMusicTitle(s.title); setMusicOpen(false); sounds.tap(); }}
                className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${musicId === s.id ? 'bg-vio/15 border border-vio' : 'hover:bg-white/5 border border-transparent'}`}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-vio/25 to-cy/25 text-vio">
                  <IconMusic size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink">{s.title}</span>
                  <span className="block text-[11px] text-dim">{s.artist ?? 'Original audio'} · {s.usageCount} uses</span>
                </span>
                {musicId === s.id && <IconCheck size={16} className="text-vio" />}
              </button>
            ))}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
