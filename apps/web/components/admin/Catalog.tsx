'use client';
// Admin → Catalog: manage lenses and templates (create/edit/delete).
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { BottomSheet, Button, EmptyState, Spinner, Tabs, Badge, TextArea } from '@/components/ui';
import { IconWand, IconTemplate, IconTrash, IconEdit, IconPlus } from '@/lib/icons';
import {
  ConfirmSheet, SectionHead, Row, Field, Input, Toggle, fmtNum, errMsg, type NotifyFn,
} from './common';
import type { Lens, LensCategory, Template, TemplateCategory } from '@sigma-snap/shared';

type Sub = 'lenses' | 'templates';

const LENS_CATS: LensCategory[] = ['FACE_EFFECTS', 'BEAUTY', 'FUNNY', 'ANIMALS', 'CARTOON', 'THREE_D', 'DISTORTION', 'BACKGROUND', 'ENVIRONMENT', 'WEATHER', 'GAMING', 'HORROR', 'CINEMATIC', 'SEASONAL', 'TRENDING'];
const TPL_CATS: TemplateCategory[] = ['TRENDING', 'TRAVEL', 'NATURE', 'POETRY', 'ISLAMIC', 'MOTIVATION', 'BIRTHDAY', 'WEDDING', 'CINEMATIC', 'GAMING', 'BUSINESS', 'MEME', 'MUSIC', 'BEAT_SYNC'];

function parseJson(text: string, what: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: text.trim() ? JSON.parse(text) : {} };
  } catch (e) {
    return { ok: false, error: `${what} is not valid JSON: ${e instanceof Error ? e.message : 'parse error'}` };
  }
}

export default function Catalog({ notify }: { notify: NotifyFn }) {
  const [sub, setSub] = useState<Sub>('lenses');

  return (
    <div>
      <SectionHead title="Catalog" hint="Lenses & templates users can create with" />
      <Tabs tabs={[{ id: 'lenses', label: 'Lenses' }, { id: 'templates', label: 'Templates' }]} active={sub} onChange={setSub} />
      <div className="mt-3">{sub === 'lenses' ? <Lenses notify={notify} /> : <Templates notify={notify} />}</div>
    </div>
  );
}

/* ── Lenses ─────────────────────────────────────────────────────────── */
function Lenses({ notify }: { notify: NotifyFn }) {
  const [items, setItems] = useState<Lens[]>([]);
  const [busy, setBusy] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [del, setDel] = useState<Lens | null>(null);
  const [working, setWorking] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<LensCategory>('FUNNY');
  const [description, setDescription] = useState('');
  const [premium, setPremium] = useState(false);
  const [config, setConfig] = useState('{\n  "type": "procedural"\n}');

  const load = useCallback(async () => {
    setBusy(true);
    try { setItems((await api.lenses()) ?? []); }
    catch (e) { notify(errMsg(e), 'err'); }
    finally { setBusy(false); }
  }, [notify]);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!name.trim()) { notify('Name is required.', 'err'); return; }
    const parsed = parseJson(config, 'Config');
    if (!parsed.ok) { notify(parsed.error, 'err'); return; }
    setWorking(true);
    try {
      await api.adminLenses({ name: name.trim(), category, description: description.trim() || undefined, isPremium: premium, config: parsed.value });
      notify('Lens created.');
      setFormOpen(false); setName(''); setDescription(''); setPremium(false); setConfig('{\n  "type": "procedural"\n}');
      void load();
    } catch (e) { notify(errMsg(e), 'err'); }
    finally { setWorking(false); }
  };

  const remove = async () => {
    if (!del) return;
    setWorking(true);
    try {
      await api.adminDeleteLens(del.id);
      notify('Lens deleted.');
      setDel(null); void load();
    } catch (e) { notify(errMsg(e), 'err'); }
    finally { setWorking(false); }
  };

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => setFormOpen(true)}><span className="flex items-center gap-2"><IconPlus size={15} /> New lens</span></Button>
      </div>
      {busy ? <div className="flex justify-center py-10"><Spinner /></div>
        : items.length === 0 ? <EmptyState title="No lenses" hint="Create the first one." />
        : (
          <div className="space-y-2">
            {items.map((l) => (
              <Row key={l.id}>
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-vio/15 text-vio"><IconWand size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold text-ink">{l.name}</p>
                      {l.isPremium && <Badge tone="gold">PRO</Badge>}
                    </div>
                    <p className="text-[11px] text-dim">{l.category} · {fmtNum(l.usageCount)} uses</p>
                  </div>
                  <button onClick={() => setDel(l)} className="rounded-xl bg-danger/10 p-2.5 text-danger hover:bg-danger/20" aria-label="Delete lens">
                    <IconTrash size={15} />
                  </button>
                </div>
              </Row>
            ))}
          </div>
        )}

      <BottomSheet open={formOpen} onClose={() => setFormOpen(false)} title="New lens">
        <div className="space-y-3">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rainy Neon" /></Field>
          <Field label="Category">
            <select value={category} onChange={(e) => setCategory(e.target.value as LensCategory)}
              className="w-full rounded-2xl border border-line bg-panel2 px-4 py-3 text-sm text-ink outline-none focus:border-vio">
              {LENS_CATS.map((c) => <option key={c} value={c} className="bg-panel2">{c}</option>)}
            </select>
          </Field>
          <Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does it do?" /></Field>
          <Toggle checked={premium} onChange={setPremium} label="Premium (plan-gated)" />
          <Field label="Config JSON" hint="Validated before saving. Must parse as JSON.">
            <TextArea rows={6} value={config} onChange={(e) => setConfig(e.target.value)} className="font-mono text-xs" spellCheck={false} />
          </Field>
          <Button className="w-full" onClick={create} disabled={working}>
            {working ? <span className="flex items-center justify-center gap-2"><Spinner size={15} /> Creating…</span> : 'Create lens'}
          </Button>
        </div>
      </BottomSheet>

      <ConfirmSheet open={!!del} onClose={() => setDel(null)} title="Delete lens?"
        body={`“${del?.name}” will be removed from the catalog.`} confirmLabel="Delete" danger busy={working} onConfirm={remove} />
    </div>
  );
}

/* ── Templates ──────────────────────────────────────────────────────── */
interface TplForm { title: string; category: TemplateCategory; description: string; slots: string; premium: boolean; published: boolean }

const EMPTY_TPL: TplForm = {
  title: '', category: 'TRENDING', description: '',
  slots: '[\n  { "index": 0, "kind": "media", "label": "Clip 1", "required": true },\n  { "index": 1, "kind": "text", "label": "Title", "required": false }\n]',
  premium: false, published: true,
};

function Templates({ notify }: { notify: NotifyFn }) {
  const [items, setItems] = useState<Template[]>([]);
  const [busy, setBusy] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState<TplForm>(EMPTY_TPL);
  const [del, setDel] = useState<Template | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const page = await api.templates();
      setItems(page?.data ?? []);
    } catch (e) { notify(errMsg(e), 'err'); }
    finally { setBusy(false); }
  }, [notify]);
  useEffect(() => { void load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_TPL); setFormOpen(true); };
  const openEdit = (t: Template) => {
    setEditing(t);
    setForm({
      title: t.title, category: t.category, description: t.description ?? '',
      slots: JSON.stringify(t.slots ?? [], null, 2),
      premium: t.isPremium, published: (t as unknown as { published?: boolean }).published ?? true,
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) { notify('Title is required.', 'err'); return; }
    const parsed = parseJson(form.slots, 'Slots');
    if (!parsed.ok) { notify(parsed.error, 'err'); return; }
    if (!Array.isArray(parsed.value)) { notify('Slots must be a JSON array.', 'err'); return; }
    setWorking(true);
    try {
      const body = {
        title: form.title.trim(), category: form.category,
        description: form.description.trim() || undefined,
        slots: parsed.value, isPremium: form.premium, published: form.published,
      };
      if (editing) { await api.adminUpdateTemplate(editing.id, body); notify('Template updated.'); }
      else { await api.adminTemplates(body); notify('Template created.'); }
      setFormOpen(false); void load();
    } catch (e) { notify(errMsg(e), 'err'); }
    finally { setWorking(false); }
  };

  const remove = async () => {
    if (!del) return;
    setWorking(true);
    try {
      await api.adminDeleteTemplate(del.id);
      notify('Template deleted.');
      setDel(null); void load();
    } catch (e) { notify(errMsg(e), 'err'); }
    finally { setWorking(false); }
  };

  const set = (k: keyof TplForm, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button onClick={openCreate}><span className="flex items-center gap-2"><IconPlus size={15} /> New template</span></Button>
      </div>
      {busy ? <div className="flex justify-center py-10"><Spinner /></div>
        : items.length === 0 ? <EmptyState title="No templates" hint="Create the first one." />
        : (
          <div className="space-y-2">
            {items.map((t) => (
              <Row key={t.id}>
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cy/15 text-cy"><IconTemplate size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold text-ink">{t.title}</p>
                      {t.isPremium && <Badge tone="gold">PRO</Badge>}
                    </div>
                    <p className="text-[11px] text-dim">{t.category} · {t.slots?.length ?? 0} slots · {fmtNum(t.usageCount)} uses</p>
                  </div>
                  <button onClick={() => openEdit(t)} className="rounded-xl bg-white/5 p-2.5 text-dim hover:text-ink" aria-label="Edit template">
                    <IconEdit size={15} />
                  </button>
                  <button onClick={() => setDel(t)} className="rounded-xl bg-danger/10 p-2.5 text-danger hover:bg-danger/20" aria-label="Delete template">
                    <IconTrash size={15} />
                  </button>
                </div>
              </Row>
            ))}
          </div>
        )}

      <BottomSheet open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit template' : 'New template'}>
        <div className="space-y-3">
          <Field label="Title"><Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Golden Hour Travel" /></Field>
          <Field label="Category">
            <select value={form.category} onChange={(e) => set('category', e.target.value as TemplateCategory)}
              className="w-full rounded-2xl border border-line bg-panel2 px-4 py-3 text-sm text-ink outline-none focus:border-vio">
              {TPL_CATS.map((c) => <option key={c} value={c} className="bg-panel2">{c}</option>)}
            </select>
          </Field>
          <Field label="Description"><TextArea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What is this template for?" /></Field>
          <Field label="Slots JSON" hint='Array of { index, kind: "media"|"text", label, required }. Validated before saving.'>
            <TextArea rows={7} value={form.slots} onChange={(e) => set('slots', e.target.value)} className="font-mono text-xs" spellCheck={false} />
          </Field>
          <div className="flex gap-6">
            <Toggle checked={form.premium} onChange={(v) => set('premium', v)} label="Premium" />
            <Toggle checked={form.published} onChange={(v) => set('published', v)} label="Published" />
          </div>
          <Button className="w-full" onClick={save} disabled={working}>
            {working ? <span className="flex items-center justify-center gap-2"><Spinner size={15} /> Saving…</span> : editing ? 'Save changes' : 'Create template'}
          </Button>
        </div>
      </BottomSheet>

      <ConfirmSheet open={!!del} onClose={() => setDel(null)} title="Delete template?"
        body={`“${del?.title}” will be removed from the marketplace.`} confirmLabel="Delete" danger busy={working} onConfirm={remove} />
    </div>
  );
}
