'use client';
// Story composer: pick media → edit (text, stickers, music, location,
// mentions, poll, question) → privacy → publish.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, ApiException } from '@/lib/api';
import type { Sound, StoryPrivacy, User } from '@sigma-snap/shared';
import { BottomSheet, Button, Input, Spinner, Avatar, Badge } from '@/components/ui';
import {
  IconX, IconImage, IconCamera, IconMusic, IconPin, IconCheck, IconTrash,
  IconChevronLeft, IconUsers, IconLock, IconGlobe, IconSmile,
} from '@/lib/icons';
import { sounds } from '@/lib/sounds';

interface Props { open: boolean; onClose: () => void; onCreated: () => void; }

type Step = 'pick' | 'edit' | 'privacy' | 'uploading' | 'done';
type Shape = 'dot' | 'star' | 'zap' | 'heart' | 'fire';

interface OverlayItem {
  id: string; kind: 'text' | 'sticker';
  text?: string; shape?: Shape; color: string; x: number; y: number; size: number;
}

const COLORS = ['#ffffff', '#7C5CFF', '#38E1FF', '#FFC44D', '#FF5470', '#34D399', '#000000'];
const SHAPES: Array<{ id: Shape; glyph: string; label: string }> = [
  { id: 'dot', glyph: '●', label: 'Dot' },
  { id: 'star', glyph: '★', label: 'Star' },
  { id: 'zap', glyph: '⚡', label: 'Bolt' },
  { id: 'heart', glyph: '♥', label: 'Heart' },
  { id: 'fire', glyph: '🔥', label: 'Fire' },
];
const PRIVACY: Array<{ id: StoryPrivacy; label: string; hint: string; Icon: typeof IconGlobe }> = [
  { id: 'EVERYONE', label: 'Everyone', hint: 'Anyone can see it', Icon: IconGlobe },
  { id: 'FRIENDS', label: 'Friends', hint: 'Only your friends', Icon: IconUsers },
  { id: 'CLOSE_FRIENDS', label: 'Close friends', hint: 'Your inner circle', Icon: IconLock },
];

let uid = 0;
const nid = () => `ov${++uid}_${Date.now()}`;

export default function StoryComposer({ open, onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [kind, setKind] = useState<'PHOTO' | 'VIDEO'>('PHOTO');
  const [pickErr, setPickErr] = useState('');

  const [caption, setCaption] = useState('');
  const [items, setItems] = useState<OverlayItem[]>([]);
  const [activeShape, setActiveShape] = useState<Shape>('star');
  const [activeColor, setActiveColor] = useState(COLORS[1]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState('');

  const [musicOpen, setMusicOpen] = useState(false);
  const [music, setMusic] = useState<Sound | null>(null);
  const [locationName, setLocationName] = useState('');
  const [mentionsRaw, setMentionsRaw] = useState('');
  const [pollQ, setPollQ] = useState('');
  const [pollOpts, setPollOpts] = useState<string[]>(['', '']);
  const [question, setQuestion] = useState('');

  const [privacy, setPrivacy] = useState<StoryPrivacy>('EVERYONE');
  const [hideQ, setHideQ] = useState('');
  const [hideResults, setHideResults] = useState<User[]>([]);
  const [hideUsers, setHideUsers] = useState<User[]>([]);
  const [hideBusy, setHideBusy] = useState(false);

  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStep('pick'); setFile(null); setPreviewUrl(''); setPickErr('');
      setCaption(''); setItems([]); setSelectedId(null); setTextDraft('');
      setMusic(null); setLocationName(''); setMentionsRaw('');
      setPollQ(''); setPollOpts(['', '']); setQuestion('');
      setPrivacy('EVERYONE'); setHideUsers([]); setHideQ(''); setHideResults([]);
      setProgress(0); setErr('');
    }
  }, [open ]);

  useEffect(() => {
    if (!hideQ.trim()) { setHideResults([]); return; }
    setHideBusy(true);
    const t = window.setTimeout(async () => {
      try { setHideResults(await api.searchUsers(hideQ.trim())); }
      catch { setHideResults([]); }
      finally { setHideBusy(false); }
    }, 350);
    return () => window.clearTimeout(t);
  }, [hideQ]);

  if (!open) return null;

  const onFile = (f: File | undefined) => {
    setPickErr('');
    if (!f) return;
    const isImg = f.type.startsWith('image/');
    const isVid = f.type.startsWith('video/');
    if (!isImg && !isVid) { setPickErr('Please choose a photo or video file.'); return; }
    if (f.size > 250 * 1024 * 1024) { setPickErr('File is too large (max 250 MB).'); return; }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setKind(isVid ? 'VIDEO' : 'PHOTO');
    setStep('edit');
    sounds.tap();
  };

  const placeAt = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * 100);
    const y = Math.round(((e.clientY - r.top) / r.height) * 100);
    const it: OverlayItem = { id: nid(), kind: 'sticker', shape: activeShape, color: activeColor, x, y, size: 56 };
    setItems((p) => [...p, it]);
    setSelectedId(it.id);
    sounds.tap();
  };

  const addText = () => {
    const t = textDraft.trim();
    if (!t) return;
    const it: OverlayItem = { id: nid(), kind: 'text', text: t, color: activeColor, x: 50, y: 42, size: 26 };
    setItems((p) => [...p, it]);
    setSelectedId(it.id);
    setTextDraft('');
    sounds.tap();
  };

  const nudge = (dx: number, dy: number) => {
    if (!selectedId) return;
    setItems((p) => p.map((i) => i.id === selectedId
      ? { ...i, x: Math.min(96, Math.max(4, i.x + dx)), y: Math.min(96, Math.max(4, i.y + dy)) } : i));
  };
  const resizeSel = (d: number) => {
    if (!selectedId) return;
    setItems((p) => p.map((i) => i.id === selectedId
      ? { ...i, size: Math.min(160, Math.max(20, i.size + d)) } : i));
  };
  const removeSel = () => {
    setItems((p) => p.filter((i) => i.id !== selectedId));
    setSelectedId(null);
  };

  const setPollOpt = (i: number, v: string) =>
    setPollOpts((p) => p.map((o, j) => (j === i ? v : o)));
  const addPollOpt = () => { if (pollOpts.length < 4) setPollOpts((p) => [...p, '']); };
  const rmPollOpt = (i: number) => {
    if (pollOpts.length <= 2) return;
    setPollOpts((p) => p.filter((_, j) => j !== i));
  };

  const toggleHide = (u: User) => {
    setHideUsers((p) => p.some((x) => x.id === u.id) ? p.filter((x) => x.id !== u.id) : [...p, u]);
    sounds.tap();
  };

  const publish = async () => {
    if (!file) return;
    setErr(''); setProgress(0); setStep('uploading');
    try {
      const asset = await api.uploadFile(kind, file, setProgress);
      const mentions = mentionsRaw.split(/[\s,]+/).map((m) => m.replace(/^@/, '').trim()).filter(Boolean);
      const opts = pollOpts.map((o) => o.trim()).filter(Boolean);
      const poll = pollQ.trim() && opts.length >= 2 ? { question: pollQ.trim(), options: opts } : undefined;
      await api.createStory({
        assetId: asset.id,
        mediaType: kind,
        caption: caption.trim() || undefined,
        textOverlays: items.filter((i) => i.kind === 'text')
          .map((i) => ({ text: i.text, color: i.color, x: i.x, y: i.y })),
        stickers: items.filter((i) => i.kind === 'sticker')
          .map((i) => ({ shape: i.shape, color: i.color, x: i.x, y: i.y, size: i.size })),
        musicId: music?.id,
        locationName: locationName.trim() || undefined,
        mentions,
        poll,
        question: question.trim() || undefined,
        privacy,
        hideFrom: hideUsers.map((u) => u.id),
      });
      sounds.success();
      setStep('done');
      window.setTimeout(() => { onCreated(); }, 1200);
    } catch (e) {
      sounds.error();
      setErr(e instanceof ApiException ? e.message : 'Failed to publish story. Please try again.');
      setStep('privacy');
    }
  };

  const selected = items.find((i) => i.id === selectedId) ?? null;

  return (
    <div className="fixed inset-0 z-[60] bg-void" role="dialog" aria-modal aria-label="Create story">
      <div className="mx-auto flex h-dvh w-full max-w-md flex-col">
        {/* header */}
        <div className="flex items-center gap-3 border-b border-line px-4 py-3 pt-safe">
          <button onClick={() => step === 'edit' ? setStep('pick') : step === 'privacy' ? setStep('edit') : onClose()}
            aria-label="Back" className="rounded-full bg-white/5 p-2 hover:bg-white/10">
            {step === 'pick' ? <IconX size={18} /> : <IconChevronLeft size={18} />}
          </button>
          <h2 className="flex-1 text-base font-bold">
            {step === 'pick' && 'New story'}
            {step === 'edit' && 'Edit story'}
            {step === 'privacy' && 'Privacy'}
            {step === 'uploading' && 'Publishing…'}
            {step === 'done' && 'Published!'}
          </h2>
          {step === 'edit' && (
            <Button className="!px-4 !py-2" onClick={() => setStep('privacy')}>Next</Button>
          )}
          {step === 'privacy' && (
            <Button className="!px-4 !py-2" onClick={() => void publish()}>Share</Button>
          )}
        </div>

        {err && (
          <div className="mx-4 mt-3 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {err}
          </div>
        )}

        {/* ── PICK ── */}
        {step === 'pick' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center animate-fade-up">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-vio to-cy shadow-glow">
              <IconImage size={36} className="text-white" />
            </div>
            <div>
              <p className="text-lg font-bold">Create a story</p>
              <p className="mt-1 text-sm text-dim">Photos and videos disappear after 24 hours.</p>
            </div>
            {pickErr && <p className="text-sm text-danger">{pickErr}</p>}
            <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])} />
            <Button onClick={() => fileRef.current?.click()} className="w-full">
              <span className="inline-flex items-center gap-2"><IconImage size={18} /> Upload photo / video</span>
            </Button>
            <Link href="/camera?target=story" onClick={() => sounds.tap()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line px-5 py-3 text-sm font-semibold hover:border-vio">
              <IconCamera size={18} /> Open camera
            </Link>
          </div>
        )}

        {/* ── EDIT ── */}
        {step === 'edit' && previewUrl && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="relative mx-4 mt-4 min-h-0 flex-1 overflow-hidden rounded-3xl border border-line bg-black">
              {kind === 'VIDEO'
                ? <video src={previewUrl} className="media-cover" controls playsInline muted />
                : <img src={previewUrl} alt="preview" className="media-cover" draggable={false} />}
              {/* placement layer */}
              <div className="absolute inset-0 cursor-crosshair" onClick={placeAt}>
                {items.map((i) => i.kind === 'text' ? (
                  <div key={i.id}
                    onClick={(e) => { e.stopPropagation(); setSelectedId(i.id); sounds.tap(); }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer text-center font-extrabold drop-shadow-[0_2px_8px_rgba(0,0,0,.9)] ${selectedId === i.id ? 'outline outline-2 outline-cy rounded' : ''}`}
                    style={{ left: `${i.x}%`, top: `${i.y}%`, color: i.color, fontSize: i.size }}>
                    {i.text}
                  </div>
                ) : (
                  <div key={i.id}
                    onClick={(e) => { e.stopPropagation(); setSelectedId(i.id); sounds.tap(); }}
                    className={`absolute flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full font-bold text-white shadow-glow ${selectedId === i.id ? 'outline outline-2 outline-cy' : ''}`}
                    style={{ left: `${i.x}%`, top: `${i.y}%`, width: i.size, height: i.size, background: i.color }}>
                    <span style={{ fontSize: i.size * 0.5 }}>
                      {i.shape === 'star' ? '★' : i.shape === 'zap' ? '⚡' : i.shape === 'heart' ? '♥' : i.shape === 'fire' ? '🔥' : '●'}
                    </span>
                  </div>
                ))}
              </div>
              <p className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-3 py-1 text-[11px] font-semibold text-white/80">
                Tap to place a {SHAPES.find((s) => s.id === activeShape)?.label.toLowerCase()} · tap item to select
              </p>
            </div>

            {/* tools */}
            <div className="max-h-[46%] space-y-3 overflow-y-auto px-4 py-3">
              <div className="flex items-center gap-2">
                <input value={textDraft} onChange={(e) => setTextDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addText(); }}
                  placeholder="Add text…" maxLength={80}
                  className="min-w-0 flex-1 rounded-2xl border border-line bg-panel2 px-4 py-2.5 text-sm outline-none focus:border-vio" />
                <Button variant="ghost" className="!px-4 !py-2.5" onClick={addText}>Add</Button>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-dim">Stickers</p>
                <div className="flex gap-2">
                  {SHAPES.map((s) => (
                    <button key={s.id} onClick={() => { setActiveShape(s.id); sounds.tap(); }}
                      aria-label={s.label}
                      className={`flex h-11 w-11 items-center justify-center rounded-2xl text-xl transition ${activeShape === s.id ? 'bg-vio text-white shadow-glow' : 'bg-white/5 text-dim hover:bg-white/10'}`}>
                      {s.glyph}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-dim">Color</p>
                <div className="flex gap-2">
                  {COLORS.map((c) => (
                    <button key={c} onClick={() => { setActiveColor(c); sounds.tap(); }} aria-label={`Color ${c}`}
                      className={`h-8 w-8 rounded-full border-2 transition ${activeColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ background: c }} />
                  ))}
                </div>
              </div>
              {selected && (
                <div className="flex items-center gap-2 rounded-2xl border border-line bg-panel p-2 animate-fade-up">
                  <span className="px-2 text-xs font-bold text-dim">Move</span>
                  {([['←', -3, 0], ['→', 3, 0], ['↑', 0, -3], ['↓', 0, 3]] as const).map(([g, dx, dy]) => (
                    <button key={g} onClick={() => nudge(dx, dy)} aria-label={`Move ${g}`}
                      className="rounded-xl bg-white/5 px-3 py-1.5 text-sm font-bold hover:bg-white/10">{g}</button>
                  ))}
                  <button onClick={() => resizeSel(8)} aria-label="Bigger" className="rounded-xl bg-white/5 px-3 py-1.5 text-sm font-bold hover:bg-white/10">A+</button>
                  <button onClick={() => resizeSel(-8)} aria-label="Smaller" className="rounded-xl bg-white/5 px-3 py-1.5 text-sm font-bold hover:bg-white/10">A−</button>
                  <button onClick={removeSel} aria-label="Remove" className="ml-auto rounded-xl bg-danger/15 px-3 py-1.5 text-danger hover:bg-danger/25">
                    <IconTrash size={15} />
                  </button>
                </div>
              )}
              <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption (optional)" maxLength={150} />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setMusicOpen(true)}
                  className="flex items-center gap-2 rounded-2xl border border-line bg-panel2 px-3 py-2.5 text-left text-sm hover:border-vio">
                  <IconMusic size={16} className="shrink-0 text-vio" />
                  <span className="truncate">{music ? music.title : 'Add music'}</span>
                  {music && <IconCheck size={14} className="ml-auto shrink-0 text-cy" />}
                </button>
                <div className="flex items-center gap-2 rounded-2xl border border-line bg-panel2 px-3">
                  <IconPin size={16} className="shrink-0 text-vio" />
                  <input value={locationName} onChange={(e) => setLocationName(e.target.value)}
                    placeholder="Location" maxLength={60} className="w-full bg-transparent py-2.5 text-sm outline-none" />
                </div>
              </div>
              <Input value={mentionsRaw} onChange={(e) => setMentionsRaw(e.target.value)}
                placeholder="Mention @usernames (comma separated)" />
              {/* poll builder */}
              <div className="rounded-2xl border border-line bg-panel p-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-dim">Poll</p>
                <Input value={pollQ} onChange={(e) => setPollQ(e.target.value)} placeholder="Poll question" maxLength={80} className="mb-2" />
                {pollOpts.map((o, i) => (
                  <div key={i} className="mb-1.5 flex gap-2">
                    <Input value={o} onChange={(e) => setPollOpt(i, e.target.value)} placeholder={`Option ${i + 1}`} maxLength={40} />
                    {pollOpts.length > 2 && (
                      <button onClick={() => rmPollOpt(i)} aria-label="Remove option" className="rounded-xl bg-white/5 px-3 text-danger"><IconX size={14} /></button>
                    )}
                  </div>
                ))}
                {pollOpts.length < 4 && (
                  <button onClick={addPollOpt} className="mt-1 text-xs font-bold text-vio">+ Add option</button>
                )}
              </div>
              <div className="rounded-2xl border border-line bg-panel p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-dim">
                  <IconSmile size={14} /> Question sticker
                </p>
                <Input value={question} onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask your viewers anything…" maxLength={120} />
              </div>
            </div>
          </div>
        )}

        {/* ── PRIVACY ── */}
        {step === 'privacy' && (
          <div className="flex-1 space-y-4 overflow-y-auto p-4 animate-fade-up">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-dim">Who can see this</p>
              <div className="space-y-2">
                {PRIVACY.map(({ id, label, hint, Icon }) => (
                  <button key={id} onClick={() => { setPrivacy(id); sounds.tap(); }}
                    className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition ${privacy === id ? 'border-vio bg-vio/10' : 'border-line bg-panel hover:border-vio/50'}`}>
                    <span className={`rounded-xl p-2 ${privacy === id ? 'bg-vio text-white' : 'bg-white/5 text-dim'}`}><Icon size={18} /></span>
                    <span className="flex-1">
                      <span className="block text-sm font-bold">{label}</span>
                      <span className="block text-xs text-dim">{hint}</span>
                    </span>
                    {privacy === id && <IconCheck size={18} className="text-vio" />}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-dim">Hide from specific people</p>
              {hideUsers.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {hideUsers.map((u) => (
                    <button key={u.id} onClick={() => toggleHide(u)}
                      className="flex items-center gap-1.5 rounded-full bg-vio/15 py-1.5 pl-1.5 pr-3 text-xs font-semibold">
                      <Avatar src={u.avatarUrl} name={u.displayName} size={20} />
                      @{u.username} <IconX size={12} />
                    </button>
                  ))}
                </div>
              )}
              <div className="relative">
                <Input value={hideQ} onChange={(e) => setHideQ(e.target.value)} placeholder="Search users to hide from…" />
                {hideBusy && <span className="absolute right-3 top-3"><Spinner size={16} /></span>}
              </div>
              {hideResults.length > 0 && (
                <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-2xl border border-line bg-panel p-2">
                  {hideResults.map((u) => {
                    const on = hideUsers.some((x) => x.id === u.id);
                    return (
                      <li key={u.id}>
                        <button onClick={() => toggleHide(u)}
                          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/5">
                          <Avatar src={u.avatarUrl} name={u.displayName} size={34} />
                          <span className="min-w-0 flex-1 text-left">
                            <span className="block truncate text-sm font-semibold">{u.displayName}</span>
                            <span className="block truncate text-xs text-dim">@{u.username}</span>
                          </span>
                          {on && <IconCheck size={16} className="text-vio" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="rounded-2xl border border-line bg-panel p-3 text-xs text-dim">
              Stories expire 24 hours after posting. {music && <>Sound: <b className="text-ink">{music.title}</b>. </>}
              {items.length > 0 && <>{items.length} overlay{items.length > 1 ? 's' : ''} added. </>}
            </div>
          </div>
        )}

        {/* ── UPLOADING ── */}
        {step === 'uploading' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="w-full max-w-xs">
              <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-vio to-cy transition-all"
                  style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p className="mt-3 text-sm text-dim">
                {progress < 1 ? `Uploading… ${Math.round(progress * 100)}%` : 'Finishing up…'}
              </p>
            </div>
            <Spinner size={28} />
          </div>
        )}

        {/* ── DONE ── */}
        {step === 'done' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center animate-fade-up">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-cy/15">
              <IconCheck size={36} className="text-cy" />
            </div>
            <p className="text-lg font-bold">Story published!</p>
            <p className="text-sm text-dim">Your friends can see it for the next 24 hours.</p>
          </div>
        )}
      </div>

      {/* music picker */}
      <MusicSheet open={musicOpen} onClose={() => setMusicOpen(false)}
        selected={music} onPick={(s) => { setMusic(s); setMusicOpen(false); sounds.tap(); }} />
    </div>
  );
}

export function MusicSheet({ open, onClose, selected, onPick }:
  { open: boolean; onClose: () => void; selected: Sound | null; onPick: (s: Sound | null) => void }) {
  const [q, setQ] = useState('');
  const [soundsList, setSoundsList] = useState<Sound[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setBusy(true); setErr('');
    api.sounds(q.trim() || undefined)
      .then((r) => setSoundsList(r.data))
      .catch((e) => setErr(e instanceof Error ? e.message : 'Could not load sounds'))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      setBusy(true);
      api.sounds(q.trim() || undefined)
        .then((r) => setSoundsList(r.data))
        .catch(() => { /* keep old */ })
        .finally(() => setBusy(false));
    }, 400);
    return () => window.clearTimeout(t);
  }, [q, open ]);

  return (
    <BottomSheet open={open} onClose={onClose} title="Choose music">
      <div className="mb-3 flex items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sounds…" />
        {selected && (
          <Button variant="ghost" className="!px-3 !py-2.5 text-xs" onClick={() => onPick(null)}>Clear</Button>
        )}
      </div>
      {busy && soundsList.length === 0 && (
        <div className="flex items-center justify-center gap-2 py-8 text-dim"><Spinner size={20} /> Loading sounds…</div>
      )}
      {err && <p className="py-4 text-center text-sm text-danger">{err}</p>}
      {!busy && !err && soundsList.length === 0 && (
        <p className="py-8 text-center text-sm text-dim">No sounds found.</p>
      )}
      <ul className="space-y-1">
        {soundsList.map((s) => (
          <li key={s.id}>
            <button onClick={() => onPick(s)}
              className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-white/5 ${selected?.id === s.id ? 'bg-vio/10' : ''}`}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-vio to-cy">
                <IconMusic size={18} className="text-white" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{s.title}</span>
                <span className="block truncate text-xs text-dim">{s.artist ?? 'Original'} · {s.usageCount} uses</span>
              </span>
              {selected?.id === s.id && <Badge tone="vio">Selected</Badge>}
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}
