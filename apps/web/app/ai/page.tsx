'use client';
// AI content studio — caption/hashtag/script/ideas/voice/etc. tools + prompt-to-effect hero.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { api, ApiException } from '@/lib/api';
import {
  BottomSheet, Button, EmptyState, Input, LoadingScreen, Spinner, TextArea, Badge,
} from '@/components/ui';
import {
  IconSparkles, IconWand, IconText, IconMusic, IconMic, IconGlobe, IconImage,
  IconVideo, IconZap, IconCheck, IconChevronRight, IconCamera,
} from '@/lib/icons';
import { sounds } from '@/lib/sounds';
import type { AiLanguage } from '@sigma-snap/shared';

const LANGS: Array<{ value: AiLanguage; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'ur', label: 'Urdu' },
  { value: 'roman-ur', label: 'Roman Urdu' },
  { value: 'ar', label: 'Arabic' },
  { value: 'hi', label: 'Hindi' },
];
const LANG_KEY = 'sigmasnap.aiLang';

interface Field {
  name: string; label: string; type: 'text' | 'textarea' | 'number' | 'select';
  placeholder?: string; required?: boolean; hint?: string;
  options?: Array<{ value: string; label: string }>; def?: string;
}
interface ToolDef {
  kind: string; label: string; desc: string; icon: React.ReactNode;
  fields: Field[]; copyNote?: string;
}

const TOOLS: ToolDef[] = [
  {
    kind: 'caption', label: 'Caption writer', desc: 'Scroll-stopping captions for your clip',
    icon: <IconText size={22} />,
    fields: [{ name: 'context', label: 'What is the post about?', type: 'textarea', placeholder: 'Sunset bike ride with friends…', hint: 'A line or two is enough.' }],
    copyNote: 'Paste it on your post',
  },
  {
    kind: 'hashtags', label: 'Hashtags', desc: 'Reach-boosting tags for any caption',
    icon: <IconZap size={22} />,
    fields: [{ name: 'caption', label: 'Caption', type: 'textarea', placeholder: 'Paste your caption…' }],
    copyNote: 'Copy and add to your caption',
  },
  {
    kind: 'title', label: 'Title maker', desc: 'Punchy titles that earn the tap',
    icon: <IconSparkles size={22} />,
    fields: [{ name: 'context', label: 'What is the video about?', type: 'textarea', placeholder: 'My 5am gym routine…' }],
  },
  {
    kind: 'script', label: 'Script writer', desc: 'Talking points & full scripts',
    icon: <IconVideo size={22} />,
    fields: [
      { name: 'topic', label: 'Topic', type: 'text', required: true, placeholder: 'Why I switched to morning workouts' },
      { name: 'durationSec', label: 'Duration (seconds)', type: 'number', def: '30' },
    ],
  },
  {
    kind: 'ideas', label: 'Story & video ideas', desc: 'Never run out of content',
    icon: <IconWand size={22} />,
    fields: [
      { name: 'kind', label: 'Ideas for', type: 'select', def: 'video', options: [{ value: 'video', label: 'Videos' }, { value: 'story', label: 'Stories' }] },
      { name: 'niche', label: 'Your niche (optional)', type: 'text', placeholder: 'travel, food, comedy…' },
    ],
  },
  {
    kind: 'thumbnail', label: 'Thumbnail', desc: 'Generate a cover frame for a post',
    icon: <IconImage size={22} />,
    fields: [{ name: 'postId', label: 'Post ID', type: 'text', required: true, placeholder: 'Paste a post ID', hint: 'Find it in your creator studio URL.' }],
  },
  {
    kind: 'subtitles', label: 'Subtitles', desc: 'Auto captions for your video',
    icon: <IconText size={22} />,
    fields: [{ name: 'assetId', label: 'Video asset ID', type: 'text', required: true, placeholder: 'Paste an uploaded video asset ID' }],
  },
  {
    kind: 'translate', label: 'Translate', desc: 'Your words in another language',
    icon: <IconGlobe size={22} />,
    fields: [
      { name: 'text', label: 'Text', type: 'textarea', required: true, placeholder: 'Type or paste text…' },
      {
        name: 'targetLang', label: 'Translate to', type: 'select', def: 'ur',
        options: [{ value: 'ur', label: 'Urdu' }, { value: 'roman-ur', label: 'Roman Urdu' }, { value: 'en', label: 'English' }, { value: 'ar', label: 'Arabic' }, { value: 'hi', label: 'Hindi' }],
      },
    ],
  },
  {
    kind: 'voice', label: 'Voiceover', desc: 'Turn text into spoken audio',
    icon: <IconMic size={22} />,
    fields: [
      { name: 'text', label: 'Script', type: 'textarea', required: true, placeholder: 'What should the voice say?' },
      { name: 'voice', label: 'Voice', type: 'select', def: 'auto', options: [{ value: 'auto', label: 'Auto' }, { value: 'masculine', label: 'Masculine' }, { value: 'feminine', label: 'Feminine' }] },
    ],
    copyNote: 'Needs a voice provider on the server — may be unavailable.',
  },
  {
    kind: 'background', label: 'Background swap', desc: 'Re-imagine the scene behind you',
    icon: <IconCamera size={22} />,
    fields: [
      { name: 'assetId', label: 'Photo asset ID', type: 'text', required: true, placeholder: 'Paste an uploaded photo asset ID' },
      { name: 'prompt', label: 'New background', type: 'textarea', required: true, placeholder: 'Neon Tokyo street at night…' },
    ],
  },
];

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function ResultView({ kind, data }: { kind: string; data: Record<string, unknown> }) {
  const chips = (list: unknown[]) => (
    <div className="flex flex-wrap gap-2">
      {list.map((h, i) => (
        <span key={i} className="rounded-full bg-vio/15 px-3 py-1.5 text-xs font-bold text-vio">{String(h)}</span>
      ))}
    </div>
  );
  if (kind === 'hashtags') {
    const hs = arr(data.hashtags).length ? arr(data.hashtags) : arr(data.tags);
    if (hs.length) return chips(hs);
  }
  if (kind === 'ideas') {
    const ideas = arr(data.ideas);
    if (ideas.length) {
      return (
        <ol className="space-y-2">
          {ideas.map((it, i) => (
            <li key={i} className="flex gap-3 rounded-xl bg-panel2 p-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-vio/20 text-xs font-extrabold text-vio">{i + 1}</span>
              <span className="text-ink">{typeof it === 'string' ? it : JSON.stringify(it)}</span>
            </li>
          ))}
        </ol>
      );
    }
  }
  if (kind === 'voice') {
    const url = str(data.url ?? data.audioUrl ?? (data.asset as Record<string, unknown> | undefined)?.url);
    if (url) return <audio controls src={url} className="w-full" />;
  }
  if (kind === 'thumbnail' || kind === 'background') {
    const url = str(data.url ?? data.imageUrl ?? (data.asset as Record<string, unknown> | undefined)?.url ?? data.thumbnailUrl);
    if (url) return <img src={url} alt="AI result" className="w-full rounded-2xl border border-line" />;
  }
  const text =
    str(data.caption) || str(data.title) || str(data.script) || str(data.translation) ||
    str(data.text) || str(data.vtt) || str(data.subtitles) || str(data.result);
  if (text) {
    return <p className="whitespace-pre-wrap rounded-2xl bg-panel2 p-4 text-sm leading-relaxed text-ink">{text}</p>;
  }
  return <pre className="max-h-64 overflow-auto rounded-2xl bg-panel2 p-4 text-xs text-dim">{JSON.stringify(data, null, 2)}</pre>;
}

function copyTextOf(kind: string, data: Record<string, unknown>): string {
  if (kind === 'hashtags') {
    const hs = arr(data.hashtags).length ? arr(data.hashtags) : arr(data.tags);
    if (hs.length) return hs.map(String).join(' ');
  }
  if (kind === 'ideas') {
    const ideas = arr(data.ideas);
    if (ideas.length) return ideas.map((i, n) => `${n + 1}. ${typeof i === 'string' ? i : JSON.stringify(i)}`).join('\n');
  }
  const t = str(data.caption) || str(data.title) || str(data.script) || str(data.translation) || str(data.text) || str(data.vtt) || str(data.result);
  return t || JSON.stringify(data, null, 2);
}

interface Pipeline {
  filter?: string;
  overlays?: unknown[];
  colorGrade?: unknown;
  params?: Record<string, unknown>;
}

function PipelineChips({ pipeline }: { pipeline: Pipeline }) {
  const overlays = arr(pipeline.overlays).map(String);
  const grade: Array<[string, string]> = pipeline.colorGrade && typeof pipeline.colorGrade === 'object'
    ? Object.entries(pipeline.colorGrade as Record<string, unknown>).map(([k, v]) => [k, String(v)])
    : pipeline.colorGrade ? [['grade', String(pipeline.colorGrade)]] : [];
  const params = pipeline.params ? Object.entries(pipeline.params).map(([k, v]) => [k, String(v)] as [string, string]) : [];
  return (
    <div className="space-y-3">
      {pipeline.filter && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-dim">Filter</p>
          <span className="inline-flex items-center gap-2 rounded-full bg-vio/15 px-4 py-2 text-sm font-bold text-vio"><IconWand size={15} />{pipeline.filter}</span>
        </div>
      )}
      {overlays.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-dim">Overlays</p>
          <div className="flex flex-wrap gap-2">
            {overlays.map((o, i) => <span key={i} className="rounded-full bg-cy/15 px-3 py-1.5 text-xs font-bold text-cy">{o}</span>)}
          </div>
        </div>
      )}
      {grade.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-dim">Color grade</p>
          <div className="flex flex-wrap gap-2">
            {grade.map(([k, v]) => <span key={k} className="rounded-full bg-gold/15 px-3 py-1.5 text-xs font-bold text-gold">{k}: {v}</span>)}
          </div>
        </div>
      )}
      {params.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-dim">Parameters</p>
          <div className="flex flex-wrap gap-2">
            {params.map(([k, v]) => <span key={k} className="rounded-full bg-white/5 border border-line px-3 py-1.5 text-xs text-dim">{k}: {v}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AiPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [lang, setLang] = useState<AiLanguage>('en');
  const [openTool, setOpenTool] = useState<ToolDef | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [running, setRunning] = useState(false);
  const [toolError, setToolError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [credits, setCredits] = useState<string | null>(null);
  // effect hero
  const [prompt, setPrompt] = useState('');
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [fxBusy, setFxBusy] = useState(false);
  const [fxError, setFxError] = useState<string | null>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY) as AiLanguage | null;
      if (saved && LANGS.some((l) => l.value === saved)) setLang(saved);
    } catch { /* noop */ }
    api.features()
      .then((f) => {
        const c = f?.ai_credits;
        setCredits(c === -1 ? 'Unlimited' : c != null ? `${c}` : null);
      })
      .catch(() => setCredits(null));
  }, []);

  const changeLang = (v: AiLanguage) => {
    setLang(v);
    try { localStorage.setItem(LANG_KEY, v); } catch { /* noop */ }
  };

  const openSheet = (t: ToolDef) => {
    setOpenTool(t);
    setForm(Object.fromEntries(t.fields.map((f) => [f.name, f.def ?? ''])));
    setResult(null); setToolError(null); setCopied(false);
    sounds.tap();
  };

  const runTool = async () => {
    if (!openTool) return;
    for (const f of openTool.fields) {
      if (f.required && !form[f.name]?.trim()) {
        setToolError(`“${f.label}” is required.`);
        return;
      }
    }
    setRunning(true); setToolError(null); setResult(null);
    try {
      const body: Record<string, unknown> = { ...form, language: lang };
      const r = await api.ai(openTool.kind, body);
      setResult((r ?? {}) as Record<string, unknown>);
      sounds.success();
    } catch (e) {
      sounds.error();
      const msg = e instanceof ApiException ? e.message : 'AI request failed.';
      // Honest surfacing for unconfigured providers (e.g. voice → 501).
      setToolError(e instanceof ApiException && e.status === 501
        ? `Not available right now: ${msg}`
        : msg);
    } finally {
      setRunning(false);
    }
  };

  const copyResult = async () => {
    if (!openTool || !result) return;
    const text = copyTextOf(openTool.kind, result);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    setCopied(true); sounds.pop();
    window.setTimeout(() => setCopied(false), 1800);
  };

  const runEffect = async () => {
    if (!prompt.trim()) { setFxError('Describe the look you want first.'); return; }
    setFxBusy(true); setFxError(null); setPipeline(null);
    try {
      const r = await api.aiEffect(prompt.trim(), lang);
      setPipeline((r?.pipeline ?? {}) as Pipeline);
      sounds.success();
    } catch (e) {
      sounds.error();
      setFxError(e instanceof ApiException ? e.message : 'Could not generate the effect.');
    } finally {
      setFxBusy(false);
    }
  };

  const openInEditor = () => {
    if (!pipeline) return;
    try { sessionStorage.setItem('sigmasnap.aiEffect', JSON.stringify(pipeline)); } catch { /* noop */ }
    router.push('/editor');
  };

  if (loading) return <LoadingScreen label="Warming up the AI studio…" />;
  if (!user) return null;

  return (
    <div className="mx-auto max-w-md px-4 pb-8 pt-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-extrabold">
            <span className="text-gradient">AI studio</span>
          </h1>
          <p className="text-xs text-dim">Create faster with on-device & cloud AI</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-2xl border border-line bg-panel px-3 py-2">
          <IconGlobe size={15} className="text-cy" />
          <select value={lang} onChange={(e) => changeLang(e.target.value as AiLanguage)}
            className="bg-transparent text-xs font-bold text-ink outline-none" aria-label="AI language">
            {LANGS.map((l) => <option key={l.value} value={l.value} className="bg-panel">{l.label}</option>)}
          </select>
        </div>
      </div>

      {/* ── Prompt-to-effect hero ─────────────────────────────── */}
      <div ref={heroRef} className="relative mt-4 overflow-hidden rounded-3xl border border-vio/30 bg-panel p-5 shadow-glow">
        <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-vio/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 -left-8 h-40 w-40 rounded-full bg-cy/20 blur-3xl" />
        <div className="relative">
          <p className="flex items-center gap-2 text-sm font-extrabold"><IconWand size={16} className="text-vio" /> Prompt-to-look</p>
          <p className="mt-1 text-xs text-dim">Describe a vibe — the AI builds the full effect pipeline.</p>
          <div className="mt-3 flex gap-2">
            <Input value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder="Make my video look like a cinematic rainy night…"
              onKeyDown={(e) => { if (e.key === 'Enter') void runEffect(); }} />
            <Button onClick={runEffect} disabled={fxBusy} className="shrink-0">
              {fxBusy ? <Spinner size={16} /> : 'Generate'}
            </Button>
          </div>
          {fxError && <p className="mt-2 text-xs font-semibold text-danger">{fxError}</p>}
          {pipeline && (
            <div className="mt-4 animate-fade-up rounded-2xl border border-line bg-void/60 p-4">
              <PipelineChips pipeline={pipeline} />
              <Button className="mt-4 w-full" onClick={openInEditor}>
                <span className="flex items-center justify-center gap-2">Open in editor <IconChevronRight size={15} /></span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Tool grid ─────────────────────────────────────────── */}
      <p className="mb-2 mt-5 text-sm font-bold text-dim">Content tools</p>
      <div className="grid grid-cols-2 gap-3">
        {TOOLS.map((t) => (
          <button key={t.kind} onClick={() => openSheet(t)}
            className="group rounded-2xl border border-line bg-panel p-4 text-left transition hover:border-vio active:scale-[.98]">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-vio/25 to-cy/25 text-vio transition group-hover:from-vio/40 group-hover:to-cy/40">
              {t.icon}
            </span>
            <p className="mt-2.5 text-sm font-bold text-ink">{t.label}</p>
            <p className="mt-0.5 line-clamp-2 text-[11px] text-dim">{t.desc}</p>
          </button>
        ))}
        <button onClick={() => heroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          className="group rounded-2xl border border-vio/40 bg-gradient-to-br from-vio/15 to-cy/10 p-4 text-left transition hover:border-vio active:scale-[.98]">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-vio to-cy text-white">
            <IconSparkles size={22} />
          </span>
          <p className="mt-2.5 text-sm font-bold text-ink">Effect prompt</p>
          <p className="mt-0.5 line-clamp-2 text-[11px] text-dim">Design a full look from words — use the generator above</p>
        </button>
      </div>

      {/* ── Usage note ────────────────────────────────────────── */}
      <div className="mt-5 rounded-2xl border border-line bg-panel p-4">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-bold"><IconZap size={15} className="text-gold" /> AI usage</p>
          {credits !== null && <Badge tone={credits === 'Unlimited' ? 'cy' : 'gold'}>{credits === 'Unlimited' ? 'Unlimited credits' : `${credits} credits`}</Badge>}
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-dim">
          Every generation counts toward your plan's daily AI credits{user.plan ? ` (${user.plan})` : ''}.
          Voiceover may be unavailable if the server has no voice provider configured — you'll see a clear message instead of a silent failure.
        </p>
      </div>

      {/* ── Tool sheet ────────────────────────────────────────── */}
      <BottomSheet open={!!openTool} onClose={() => setOpenTool(null)} title={openTool?.label}>
        {openTool && (
          <div>
            <p className="text-xs text-dim">{openTool.desc} · replies in {LANGS.find((l) => l.value === lang)?.label}.</p>
            <div className="mt-3 space-y-3">
              {openTool.fields.map((f) => (
                <label key={f.name} className="block">
                  <span className="mb-1 block text-xs font-bold text-ink">
                    {f.label}{f.required && <span className="text-danger"> *</span>}
                  </span>
                  {f.type === 'textarea' ? (
                    <TextArea rows={3} value={form[f.name] ?? ''} placeholder={f.placeholder}
                      onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))} />
                  ) : f.type === 'select' ? (
                    <select value={form[f.name] ?? f.def ?? ''} onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))}
                      className="w-full rounded-2xl border border-line bg-panel2 px-4 py-3 text-sm text-ink outline-none focus:border-vio">
                      {f.options?.map((o) => <option key={o.value} value={o.value} className="bg-panel2">{o.label}</option>)}
                    </select>
                  ) : (
                    <Input type={f.type} value={form[f.name] ?? ''} placeholder={f.placeholder}
                      onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))} />
                  )}
                  {f.hint && <span className="mt-1 block text-[11px] text-dim">{f.hint}</span>}
                </label>
              ))}
            </div>
            {openTool.copyNote && <p className="mt-2 text-[11px] text-dim">Note: {openTool.copyNote}</p>}
            <Button className="mt-4 w-full" onClick={runTool} disabled={running}>
              {running ? <span className="flex items-center justify-center gap-2"><Spinner size={16} /> Creating…</span>
                : <span className="flex items-center justify-center gap-2"><IconSparkles size={15} /> Generate</span>}
            </Button>
            {toolError && <p className="mt-2 text-xs font-semibold text-danger">{toolError}</p>}
            {result && (
              <div className="mt-4 animate-fade-up">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-dim">Result</p>
                <ResultView kind={openTool.kind} data={result} />
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={copyResult}>
                    <span className="flex items-center justify-center gap-2">
                      {copied ? <IconCheck size={15} className="text-cy" /> : null}{copied ? 'Copied!' : 'Copy'}
                    </span>
                  </Button>
                  <Link href="/camera" className="flex-1">
                    <Button variant="ghost" className="w-full">
                      <span className="flex items-center justify-center gap-2"><IconCamera size={15} /> Use in camera</span>
                    </Button>
                  </Link>
                </div>
              </div>
            )}
            {result === null && !running && !toolError && (
              <EmptyState title="Nothing yet" hint="Fill the form and hit Generate." />
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
