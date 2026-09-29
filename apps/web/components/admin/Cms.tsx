'use client';
// Admin → CMS: announcements, feature flags, managed lenses.
// Everything here goes live in the app without a rebuild.
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button, EmptyState, Spinner, Tabs, Badge } from '@/components/ui';
import { IconMegaphone, IconFlag, IconSparkles, IconEdit, IconTrash } from '@/lib/icons';
import { ConfirmSheet, SectionHead, Row, Field, Input, TextArea, Toggle, fmtDate, errMsg, type NotifyFn } from './common';
import type { Announcement, FeatureFlagDto, ManagedLens } from '@sigma-snap/shared';

type Sub = 'announcements' | 'flags' | 'lenses';
type LoadState = 'loading' | 'ready' | 'error';

export default function Cms({ notify }: { notify: NotifyFn }) {
  const [sub, setSub] = useState<Sub>('announcements');
  return (
    <div>
      <SectionHead title="CMS & Remote config" hint="Live in the app — no rebuild needed" />
      <Tabs
        tabs={[{ id: 'announcements', label: 'Announcements' }, { id: 'flags', label: 'Feature flags' }, { id: 'lenses', label: 'Lenses' }]}
        active={sub} onChange={setSub}
      />
      <div className="mt-3">
        {sub === 'announcements' && <Announcements notify={notify} />}
        {sub === 'flags' && <Flags notify={notify} />}
        {sub === 'lenses' && <Lenses notify={notify} />}
      </div>
    </div>
  );
}

/* ── Announcements ──────────────────────────────────────────────────── */

const EMPTY_FORM = { title: '', body: '', imageUrl: '', ctaUrl: '', active: true, startsAt: '', endsAt: '' };

function Announcements({ notify }: { notify: NotifyFn }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Announcement | null>(null);

  const load = useCallback(async () => {
    setState('loading'); setError('');
    try { setItems(await api.adminAnnouncements()); setState('ready'); }
    catch (e) { setError(errMsg(e)); setState('error'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const startEdit = (a: Announcement) => {
    setEditingId(a.id);
    setForm({
      title: a.title, body: a.body, imageUrl: a.imageUrl ?? '', ctaUrl: a.ctaUrl ?? '',
      active: a.active,
      startsAt: a.startsAt ? a.startsAt.slice(0, 16) : '',
      endsAt: a.endsAt ? a.endsAt.slice(0, 16) : '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const save = async () => {
    if (!form.title.trim() || !form.body.trim()) { notify('Title and body are required', 'err'); return; }
    setSaving(true);
    const body: Record<string, unknown> = {
      title: form.title.trim(), body: form.body.trim(),
      imageUrl: form.imageUrl.trim() || undefined, ctaUrl: form.ctaUrl.trim() || undefined,
      active: form.active,
      ...(form.startsAt ? { startsAt: new Date(form.startsAt).toISOString() } : {}),
      ...(form.endsAt ? { endsAt: new Date(form.endsAt).toISOString() } : {}),
    };
    try {
      if (editingId) await api.adminUpdateAnnouncement(editingId, body);
      else await api.adminCreateAnnouncement(body);
      notify(editingId ? 'Announcement updated — live in the app' : 'Announcement published', 'ok');
      setForm(EMPTY_FORM); setEditingId(null); void load();
    } catch (e) { notify(errMsg(e), 'err'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div className="rounded-2xl border border-line bg-panel p-4">
        <p className="mb-3 text-sm font-extrabold">{editingId ? 'Edit announcement' : 'New announcement'}</p>
        <div className="space-y-3">
          <Field label="Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Announcement title" /></Field>
          <Field label="Body"><TextArea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="What should users see?" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Image URL"><Input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://…" /></Field>
            <Field label="CTA URL"><Input value={form.ctaUrl} onChange={(e) => setForm({ ...form, ctaUrl: e.target.value })} placeholder="https://…" /></Field>
            <Field label="Starts at"><Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></Field>
            <Field label="Ends at"><Input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></Field>
          </div>
          <Field label="Visible to users"><Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} /></Field>
          <div className="flex gap-2">
            <Button onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Publish'}</Button>
            {editingId && <Button variant="ghost" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}>Cancel</Button>}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {state === 'loading' && <div className="flex justify-center py-8"><Spinner /></div>}
        {state === 'error' && (
          <div className="rounded-2xl border border-danger/30 bg-danger/10 p-4 text-center">
            <p className="text-sm text-danger">{error}</p>
            <Button variant="ghost" onClick={() => void load()} className="mt-2">Retry</Button>
          </div>
        )}
        {state === 'ready' && items.length === 0 && (
          <EmptyState title="No announcements" hint="Publish one above — it appears as a banner in the app." />
        )}
        {items.map((a) => (
          <Row key={a.id}>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-vio/15 text-vio"><IconMegaphone size={17} /></span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-bold">{a.title}
                  <Badge tone={a.active ? 'cy' : undefined}>{a.active ? 'Live' : 'Off'}</Badge>
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-dim">{a.body}</p>
                <p className="mt-1 text-[11px] text-dim">{fmtDate(a.createdAt)}
                  {a.startsAt && ` · from ${fmtDate(a.startsAt)}`}{a.endsAt && ` · until ${fmtDate(a.endsAt)}`}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => startEdit(a)} aria-label="Edit" className="rounded-lg p-2 text-dim hover:text-ink"><IconEdit size={16} /></button>
                <button onClick={() => setDeleting(a)} aria-label="Delete" className="rounded-lg p-2 text-dim hover:text-danger"><IconTrash size={16} /></button>
              </div>
            </div>
          </Row>
        ))}
      </div>

      <ConfirmSheet open={!!deleting} onClose={() => setDeleting(null)} title="Delete announcement?"
        body={`"${deleting?.title}" will disappear from the app immediately.`} danger confirmLabel="Delete"
        onConfirm={() => {
          if (!deleting) return;
          api.adminDeleteAnnouncement(deleting.id)
            .then(() => { notify('Deleted', 'ok'); setDeleting(null); void load(); })
            .catch((e) => notify(errMsg(e), 'err'));
        }} />
    </div>
  );
}

/* ── Feature flags ──────────────────────────────────────────────────── */

function Flags({ notify }: { notify: NotifyFn }) {
  const [flags, setFlags] = useState<FeatureFlagDto[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [descEdit, setDescEdit] = useState<{ key: string; value: string } | null>(null);

  const load = useCallback(async () => {
    setState('loading'); setError('');
    try { setFlags(await api.adminFeatureFlags()); setState('ready'); }
    catch (e) { setError(errMsg(e)); setState('error'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (f: FeatureFlagDto) => {
    setBusyKey(f.key);
    try {
      const updated = await api.adminPatchFeatureFlag(f.key, { enabled: !f.enabled });
      setFlags((prev) => prev.map((x) => (x.key === f.key ? updated : x)));
      notify(`${f.key} ${updated.enabled ? 'enabled' : 'disabled'}`, 'ok');
    } catch (e) { notify(errMsg(e), 'err'); }
    finally { setBusyKey(null); }
  };

  const saveDesc = async () => {
    if (!descEdit) return;
    setBusyKey(descEdit.key);
    try {
      const updated = await api.adminPatchFeatureFlag(descEdit.key, { description: descEdit.value.trim() || null });
      setFlags((prev) => prev.map((x) => (x.key === descEdit.key ? updated : x)));
      setDescEdit(null); notify('Description saved', 'ok');
    } catch (e) { notify(errMsg(e), 'err'); }
    finally { setBusyKey(null); }
  };

  return (
    <div className="space-y-2">
      {state === 'loading' && <div className="flex justify-center py-8"><Spinner /></div>}
      {state === 'error' && (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 p-4 text-center">
          <p className="text-sm text-danger">{error}</p>
          <Button variant="ghost" onClick={() => void load()} className="mt-2">Retry</Button>
        </div>
      )}
      {state === 'ready' && flags.length === 0 && (
        <EmptyState title="No feature flags" hint="Flags appear here once seeded or created." />
      )}
      {flags.map((f) => (
        <Row key={f.key}>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cy/15 text-cy"><IconFlag size={17} /></span>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm font-bold">{f.key}</p>
              {descEdit?.key === f.key ? (
                <div className="mt-1 flex gap-2">
                  <Input value={descEdit.value} onChange={(e) => setDescEdit({ key: f.key, value: e.target.value })} placeholder="What does this flag do?" />
                  <Button onClick={() => void saveDesc()} disabled={busyKey === f.key}>Save</Button>
                </div>
              ) : (
                <button onClick={() => setDescEdit({ key: f.key, value: f.description ?? '' })}
                  className="mt-0.5 block truncate text-left text-xs text-dim hover:text-ink">
                  {f.description || <span className="italic">Add a description…</span>}
                </button>
              )}
              {f.plans.length > 0 && (
                <div className="mt-1 flex gap-1">{f.plans.map((p) => <Badge key={p} tone="vio">{p}</Badge>)}</div>
              )}
            </div>
            <Toggle checked={f.enabled} onChange={() => void toggle(f)} />
          </div>
        </Row>
      ))}
      <p className="px-1 pt-1 text-[11px] leading-relaxed text-dim">
        Shell flags: <span className="font-mono">calls</span> hides call buttons, <span className="font-mono">spotlight</span> hides the Discover tab, <span className="font-mono">ai_effects</span> gates AI tools.
      </p>
    </div>
  );
}

/* ── Managed lenses ─────────────────────────────────────────────────── */

const LENS_FORM = { key: '', name: '', description: '', configJson: '', enabled: true, sortOrder: 0 };
const LENS_HINT = '{\n  "registryKey": "neon-contours"\n}\nor a pure color grade:\n{\n  "kind": "grade",\n  "cssFilter": "saturate(1.5) contrast(1.1)",\n  "isPremium": false\n}';

function Lenses({ notify }: { notify: NotifyFn }) {
  const [items, setItems] = useState<ManagedLens[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [form, setForm] = useState(LENS_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<ManagedLens | null>(null);

  const load = useCallback(async () => {
    setState('loading'); setError('');
    try { setItems(await api.adminManagedLenses()); setState('ready'); }
    catch (e) { setError(errMsg(e)); setState('error'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const parseConfig = (): Record<string, unknown> | null => {
    if (!form.configJson.trim()) return {};
    try {
      const v = JSON.parse(form.configJson) as unknown;
      if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('must be a JSON object');
      return v as Record<string, unknown>;
    } catch (e) {
      notify(`Invalid config JSON: ${e instanceof Error ? e.message : 'parse error'}`, 'err');
      return null;
    }
  };

  const save = async () => {
    const cfg = parseConfig();
    if (cfg === null) return;
    if (!editingId && !/^[a-z0-9-]+$/.test(form.key.trim())) { notify('Key must be lowercase letters, numbers and dashes', 'err'); return; }
    if (!form.name.trim()) { notify('Name is required', 'err'); return; }
    setSaving(true);
    try {
      if (editingId) {
        await api.adminUpdateManagedLens(editingId, {
          name: form.name.trim(), description: form.description.trim() || null,
          configJson: cfg, enabled: form.enabled, sortOrder: form.sortOrder,
        });
      } else {
        await api.adminCreateManagedLens({
          key: form.key.trim(), name: form.name.trim(), description: form.description.trim() || null,
          configJson: cfg, enabled: form.enabled, sortOrder: form.sortOrder,
        });
      }
      notify('Lens saved — live in the camera picker', 'ok');
      setForm(LENS_FORM); setEditingId(null); void load();
    } catch (e) { notify(errMsg(e), 'err'); }
    finally { setSaving(false); }
  };

  const startEdit = (l: ManagedLens) => {
    setEditingId(l.id);
    setForm({
      key: l.key, name: l.name, description: l.description ?? '',
      configJson: JSON.stringify(l.configJson, null, 2), enabled: l.enabled, sortOrder: l.sortOrder,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div>
      <div className="rounded-2xl border border-line bg-panel p-4">
        <p className="mb-3 text-sm font-extrabold">{editingId ? 'Edit managed lens' : 'New managed lens'}</p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Key (unique id)"><Input value={form.key} disabled={!!editingId} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="neon-mornings" /></Field>
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Neon Mornings" /></Field>
          </div>
          <Field label="Description"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short blurb for the picker" /></Field>
          <Field label="Config JSON" hint={LENS_HINT}>
            <TextArea value={form.configJson} onChange={(e) => setForm({ ...form, configJson: e.target.value })} placeholder='{"registryKey": "…"}' />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Order"><Input type="number" value={String(form.sortOrder)} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) || 0 })} /></Field>
            <Field label="Enabled"><Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} /></Field>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add lens'}</Button>
            {editingId && <Button variant="ghost" onClick={() => { setEditingId(null); setForm(LENS_FORM); }}>Cancel</Button>}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {state === 'loading' && <div className="flex justify-center py-8"><Spinner /></div>}
        {state === 'error' && (
          <div className="rounded-2xl border border-danger/30 bg-danger/10 p-4 text-center">
            <p className="text-sm text-danger">{error}</p>
            <Button variant="ghost" onClick={() => void load()} className="mt-2">Retry</Button>
          </div>
        )}
        {state === 'ready' && items.length === 0 && (
          <EmptyState title="No managed lenses" hint="Add one above to feature it in the camera picker." />
        )}
        {items.map((l) => (
          <Row key={l.id}>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-vio/15 text-vio"><IconSparkles size={17} /></span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-bold">{l.name}
                  <Badge tone={l.enabled ? 'cy' : undefined}>{l.enabled ? 'Live' : 'Off'}</Badge>
                </p>
                <p className="truncate font-mono text-[11px] text-dim">{l.key} · order {l.sortOrder}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => startEdit(l)} aria-label="Edit" className="rounded-lg p-2 text-dim hover:text-ink"><IconEdit size={16} /></button>
                <button onClick={() => setDeleting(l)} aria-label="Delete" className="rounded-lg p-2 text-dim hover:text-danger"><IconTrash size={16} /></button>
              </div>
            </div>
          </Row>
        ))}
      </div>

      <ConfirmSheet open={!!deleting} onClose={() => setDeleting(null)} title="Delete managed lens?"
        body={`"${deleting?.name}" will be removed from the camera picker.`} danger confirmLabel="Delete"
        onConfirm={() => {
          if (!deleting) return;
          api.adminDeleteManagedLens(deleting.id)
            .then(() => { notify('Deleted', 'ok'); setDeleting(null); void load(); })
            .catch((e) => notify(errMsg(e), 'err'));
        }} />
    </div>
  );
}
