// Destination sheet shown after export + upload: Spotlight post, Story, or Draft.
'use client';
import React, { useState } from 'react';
import { api } from '@/lib/api';
import { BottomSheet, Button, Input, Spinner, TextArea } from '@/components/ui';
import { IconCheck, IconGlobe, IconSend, IconSave, IconUsers } from '@/lib/icons';
import type { MediaAsset, StoryPrivacy } from '@sigma-snap/shared';

type Dest = 'post' | 'story' | 'draft';
type Status = 'idle' | 'loading' | 'success' | 'error';

export default function DestinationSheet({ open, onClose, asset, kind, musicId }:
  { open: boolean; onClose: () => void; asset: MediaAsset; kind: 'PHOTO' | 'VIDEO'; musicId?: string | null }) {
  const [dest, setDest] = useState<Dest | null>(null);
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [privacy, setPrivacy] = useState<StoryPrivacy>('EVERYONE');
  const [status, setStatus] = useState<Status>('idle');
  const [err, setErr] = useState('');

  const reset = () => { setDest(null); setStatus('idle'); setErr(''); };

  const fullCaption = [caption.trim(), hashtags.trim()].filter(Boolean).join(' ');

  const go = async () => {
    if (!dest || status === 'loading') return;
    setStatus('loading'); setErr('');
    try {
      if (dest === 'post') {
        await api.createPost({ assetIds: [asset.id], kind, caption: fullCaption || undefined, isPublic: true });
      } else if (dest === 'story') {
        await api.createStory({
          assetId: asset.id, mediaType: kind,
          caption: fullCaption || undefined, privacy,
          musicId: musicId ?? undefined,
        });
      } else {
        await api.createPost({ assetIds: [asset.id], kind, caption: fullCaption || undefined, status: 'draft' });
      }
      setStatus('success');
    } catch (e) {
      setStatus('error');
      setErr(e instanceof Error ? e.message : 'Publish failed');
    }
  };

  const DESTS: Array<{ id: Dest; title: string; hint: string; icon: React.ReactNode }> = [
    { id: 'post', title: 'Post to Spotlight', hint: 'Publish to the public feed', icon: <IconGlobe size={18} className="text-vio" /> },
    { id: 'story', title: 'Share to Story', hint: 'Visible for 24 hours', icon: <IconUsers size={18} className="text-cy" /> },
    { id: 'draft', title: 'Save as Draft', hint: 'Finish later from Creator dashboard', icon: <IconSave size={18} className="text-gold" /> },
  ];

  return (
    <BottomSheet open={open} onClose={() => { reset(); onClose(); }} title="Where should it go?">
      <div className="grid gap-3 pb-2">
        {!dest && DESTS.map((d) => (
          <button key={d.id} onClick={() => { setDest(d.id); setStatus('idle'); setErr(''); }}
            className="flex items-center gap-3 rounded-2xl border border-line bg-panel2 p-4 text-left hover:border-vio active:scale-[.99]">
            <div className="rounded-xl bg-white/5 p-2.5">{d.icon}</div>
            <div>
              <p className="text-sm font-bold">{d.title}</p>
              <p className="text-xs text-dim">{d.hint}</p>
            </div>
          </button>
        ))}

        {dest && status !== 'success' && (
          <div className="grid gap-3 animate-fade-up">
            <button onClick={reset} className="justify-self-start text-xs font-semibold text-dim">← Choose another destination</button>
            {dest !== 'draft' && (
              <TextArea rows={3} value={caption} onChange={(e) => setCaption(e.target.value)}
                placeholder={dest === 'post' ? 'Write a caption…' : 'Add a caption (optional)…'} />
            )}
            {dest === 'post' && (
              <Input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#hashtags (optional)" />
            )}
            {dest === 'story' && (
              <div>
                <p className="mb-1.5 text-xs text-dim">Who can see it</p>
                <div className="flex gap-2">
                  {(['EVERYONE', 'FRIENDS', 'CLOSE_FRIENDS'] as StoryPrivacy[]).map((pv) => (
                    <button key={pv} onClick={() => setPrivacy(pv)}
                      className={`flex-1 rounded-xl py-2 text-xs font-semibold ${privacy === pv ? 'bg-vio text-white' : 'bg-white/5 text-dim'}`}>
                      {pv === 'EVERYONE' ? 'Everyone' : pv === 'FRIENDS' ? 'Friends' : 'Close friends'}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {dest === 'draft' && (
              <p className="rounded-2xl bg-white/5 p-3 text-xs text-dim">
                Saved as a draft post. You can add a caption and publish it later from the Creator dashboard.
              </p>
            )}
            {err && <p className="text-xs text-danger">{err}</p>}
            <Button onClick={go} disabled={status === 'loading'} className="flex items-center justify-center gap-2">
              {status === 'loading' ? <Spinner size={16} /> : <IconSend size={15} />}
              {dest === 'post' ? 'Publish post' : dest === 'story' ? 'Share story' : 'Save draft'}
            </Button>
          </div>
        )}

        {dest && status === 'success' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center animate-fade-up">
            <div className="rounded-full bg-emerald-500/15 p-4"><IconCheck size={28} className="text-emerald-400" /></div>
            <p className="font-bold">
              {dest === 'post' ? 'Posted to Spotlight!' : dest === 'story' ? 'Shared to your story!' : 'Saved as draft!'}
            </p>
            <p className="max-w-xs text-xs text-dim">
              {dest === 'draft'
                ? 'Find it later in the Creator dashboard to finish and publish.'
                : dest === 'story' ? 'Your story expires in 24 hours.' : 'Your post is now live in the feed.'}
            </p>
            <Button variant="ghost" onClick={() => { reset(); onClose(); }}>Done</Button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
