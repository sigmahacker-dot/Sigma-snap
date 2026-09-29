
'use client';
// Single chat message bubble: all media types, reactions, reply quotes,
// read receipts, disappearing-message timer chip, long-press actions.
import React, { useEffect, useRef, useState } from 'react';
import type { Message } from '@sigma-snap/shared';
import { Avatar } from '@/components/ui';
import {
  IconCheck, IconTimer, IconReply, IconShare, IconEdit, IconTrash, IconPlay, IconPause,
  IconBookmark, IconBookmarkFill, IconCopy, IconDownload,
} from '@/lib/icons';
import { sounds } from '@/lib/sounds';
import { bubbleTime, disappearingLabel } from './chat-utils';
import { StickerArt } from './Stickers';

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];

export interface BubbleActions {
  onReact: (m: Message, emoji: string) => void;
  onReply: (m: Message) => void;
  onForward: (m: Message) => void;
  onEdit: (m: Message) => void;
  onDelete: (m: Message) => void;
  onSave: (m: Message) => void;
  onCopy: (m: Message) => void;
  onDownload: (m: Message) => void;
}

interface Props extends BubbleActions {
  message: Message;
  meId: string;
  isGroup: boolean;
  readByAll: boolean;
  /** Full message when in the current window, or the API-included partial quote otherwise. */
  replyTo?: Message | NonNullable<Message['replyTo']> | null;
  disappearingAfterSec?: number;
  saved?: boolean;
}

function VoicePlayer({ url, durationSec }: { url: string; durationSec?: number | null }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bars = [8, 14, 20, 12, 18, 10, 22, 16, 9, 13, 19, 11, 15, 8, 17, 12];

  useEffect(() => () => { audioRef.current?.pause(); }, []);
  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { void a.play(); setPlaying(true); sounds.tap(); }
  };
  return (
    <div className="flex items-center gap-2 py-1" onClick={(e) => e.stopPropagation()}>
      <audio ref={audioRef} src={url} preload="metadata"
        onTimeUpdate={(e) => { const t = e.currentTarget; setProgress(t.duration ? t.currentTime / t.duration : 0); }}
        onEnded={() => { setPlaying(false); setProgress(0); }} />
      <button onClick={toggle} aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 hover:bg-white/25">
        {playing ? <IconPause size={16} /> : <IconPlay size={16} />}
      </button>
      <div className="flex h-8 flex-1 items-center gap-[3px]">
        {bars.map((h, i) => (
          <span key={i} className={`w-[3px] rounded-full transition ${i / bars.length <= progress ? 'bg-white' : 'bg-white/35'}`}
            style={{ height: h }} />
        ))}
      </div>
      <span className="text-[11px] font-semibold text-white/80">
        {durationSec ? `${Math.floor(durationSec / 60)}:${Math.floor(durationSec % 60).toString().padStart(2, '0')}` : ''}
      </span>
    </div>
  );
}

export default function MessageBubble({ message: m, meId, isGroup, readByAll, replyTo, disappearingAfterSec, saved, onReact, onReply, onForward, onEdit, onDelete, onSave, onCopy, onDownload }: Props) {
  const own = m.senderId === meId;
  const [menuOpen, setMenuOpen] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // swipe-to-reply (touch): drag the bubble right to quote it
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [swipeX, setSwipeX] = useState(0);
  const canEdit = own && m.type === 'TEXT' && !m.isDeleted && (Date.now() - new Date(m.createdAt).getTime()) < 15 * 60 * 1000;
  const hasMedia = !m.isDeleted && m.attachments[0]?.url && (m.type === 'IMAGE' || m.type === 'VIDEO' || m.type === 'VOICE');

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = touchStart.current;
    if (!s || menuOpen) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    // only track a mostly-horizontal rightward drag
    if (dx > 8 && Math.abs(dy) < 60) setSwipeX(Math.min(dx * 0.5, 56));
  };
  const onTouchEnd = () => {
    const s = touchStart.current;
    touchStart.current = null;
    if (s && swipeX >= 44 && !menuOpen && !m.isDeleted) {
      sounds.tap();
      try { navigator.vibrate?.(12); } catch { /* noop */ }
      onReply(m);
    }
    setSwipeX(0);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const fn = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('mousedown', fn);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('mousedown', fn); window.removeEventListener('keydown', esc); };
  }, [menuOpen]);

  const startPress = () => {
    pressTimer.current = setTimeout(() => { sounds.tap(); setMenuOpen(true); }, 480);
  };
  const endPress = () => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  };

  const reactionGroups = m.reactions.reduce<Record<string, number>>((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] ?? 0) + 1; return acc;
  }, {});
  const myReaction = m.reactions.find((r) => r.userId === meId)?.emoji;

  const senderName = m.sender?.displayName ?? 'Unknown';

  return (
    <div className={`flex w-full px-3 ${own ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`flex max-w-[78%] gap-2 transition-transform ${own ? 'flex-row-reverse' : ''}`}
        style={{ transform: swipeX ? `translateX(${swipeX}px)` : undefined }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      >
        {!own && isGroup && (
          <Avatar src={m.sender?.avatarUrl} name={senderName} size={28} />
        )}
        <div className="relative min-w-0">
          {!own && isGroup && <p className="mb-0.5 ml-1 text-[11px] font-bold text-vio">{senderName}</p>}
          <div
            onPointerDown={startPress} onPointerUp={endPress} onPointerLeave={endPress}
            onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true); }}
            className={`relative select-none rounded-2xl px-3 py-2 shadow-card ${
              m.isDeleted ? 'bg-panel2 text-dim italic' :
              m.type === 'STICKER' ? 'bg-transparent shadow-none' :
              own ? 'rounded-br-md bg-gradient-to-br from-vio to-vio-deep text-white'
                  : 'rounded-bl-md bg-panel2 text-ink'
            }`}>
            {replyTo && !m.isDeleted && (
              <div className={`mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs ${own ? 'border-white/60 bg-black/15' : 'border-vio bg-black/25'}`}>
                <p className={`font-bold ${own ? 'text-white/90' : 'text-vio'}`}>{replyTo.sender?.displayName ?? 'Message'}</p>
                <p className="truncate opacity-80">{(replyTo as { isDeleted?: boolean }).isDeleted ? 'Message deleted' : (replyTo.text || '📎 Attachment')}</p>
              </div>
            )}
            {m.isDeleted ? (
              <p className="text-sm">🚫 This message was deleted</p>
            ) : m.type === 'TEXT' ? (
              <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">{m.text}</p>
            ) : m.type === 'STICKER' ? (
              <StickerArt id={m.text ?? 'hex'} size={110} />
            ) : m.type === 'IMAGE' ? (
              <div className="-m-1 mb-1 overflow-hidden rounded-xl">
                {m.attachments[0] ? (
                  <img src={m.attachments[0].url} alt="attachment" className="max-h-64 w-full object-cover" loading="lazy" />
                ) : <p className="p-2 text-sm">📷 Photo</p>}
              </div>
            ) : m.type === 'VIDEO' ? (
              <div className="-m-1 mb-1 overflow-hidden rounded-xl">
                {m.attachments[0] ? (
                  <video src={m.attachments[0].url} controls preload="metadata" className="max-h-64 w-full" playsInline />
                ) : <p className="p-2 text-sm">🎬 Video</p>}
              </div>
            ) : m.type === 'VOICE' ? (
              <div className="min-w-[190px]">
                <VoicePlayer url={m.attachments[0]?.url ?? ''} durationSec={m.attachments[0]?.durationSec} />
              </div>
            ) : (
              <p className="text-sm">📎 Attachment</p>
            )}
            {!m.isDeleted && m.type !== 'STICKER' && m.text && m.type !== 'TEXT' && (
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{m.text}</p>
            )}

            <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${own && m.type !== 'STICKER' ? 'text-white/70' : 'text-dim'}`}>
              {hasMedia && (
                <button onClick={(e) => { e.stopPropagation(); onDownload(m); }} aria-label="Download"
                  className="mr-1 rounded-full bg-black/25 p-1.5 transition hover:bg-black/40 active:scale-95" title="Download">
                  <IconDownload size={12} />
                </button>
              )}
              {(m.expiresAt || (disappearingAfterSec ?? 0) > 0) && (
                <span className="mr-1 inline-flex items-center gap-0.5 rounded-full bg-black/25 px-1.5 py-0.5 font-bold">
                  <IconTimer size={10} />{disappearingLabel(Math.max(1, Math.round(((m.expiresAt ? new Date(m.expiresAt).getTime() : Date.now() + (disappearingAfterSec ?? 0) * 1000) - Date.now()) / 1000)))}
                </span>
              )}
              <span>{bubbleTime(m.createdAt)}</span>
              {own && !m.isDeleted && (
                <span className={readByAll ? 'text-cy' : 'opacity-70'} title={readByAll ? 'Read' : 'Sent'}>
                  <span className="inline-flex -space-x-1.5">
                    <IconCheck size={13} strokeWidth={2.4} />
                    <IconCheck size={13} strokeWidth={2.4} />
                  </span>
                </span>
              )}
            </div>

            {menuOpen && (
              <div ref={menuRef}
                className={`absolute bottom-full z-30 mb-2 w-60 rounded-2xl border border-line bg-panel p-2 shadow-card animate-fade-up ${own ? 'right-0' : 'left-0'}`}
                onPointerDown={(e) => e.stopPropagation()}>
                <div className="mb-1 flex justify-around rounded-xl bg-panel2 p-1.5">
                  {QUICK_REACTIONS.map((e) => (
                    <button key={e} onClick={() => { onReact(m, e); setMenuOpen(false); sounds.pop(); }}
                      className={`rounded-lg p-1 text-xl transition hover:scale-125 ${myReaction === e ? 'bg-vio/25 ring-1 ring-vio' : ''}`}
                      aria-label={`React ${e}`}>{e}</button>
                  ))}
                </div>
                {([
                  { label: 'Reply', Icon: IconReply, fn: () => onReply(m), danger: false },
                  { label: saved ? 'Unsave' : 'Save', Icon: saved ? IconBookmarkFill : IconBookmark, fn: () => onSave(m), danger: false },
                  ...(m.type === 'TEXT' && m.text && !m.isDeleted ? [{ label: 'Copy', Icon: IconCopy, fn: () => onCopy(m), danger: false }] : []),
                  { label: 'Forward', Icon: IconShare, fn: () => onForward(m), danger: false },
                  ...(canEdit ? [{ label: 'Edit', Icon: IconEdit, fn: () => onEdit(m), danger: false }] : []),
                  ...(own && !m.isDeleted ? [{ label: 'Delete', Icon: IconTrash, fn: () => onDelete(m), danger: true }] : []),
                ] as Array<{ label: string; Icon: (p: { size?: number }) => JSX.Element; fn: () => void; danger: boolean }>).map((a) => (
                  <button key={a.label} onClick={() => { a.fn(); setMenuOpen(false); }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition hover:bg-white/5 ${a.danger ? 'text-danger' : 'text-ink'}`}>
                    <a.Icon size={17} />{a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {Object.keys(reactionGroups).length > 0 && (
            <div className={`mt-1 flex gap-1 ${own ? 'justify-end' : 'justify-start'}`}>
              {Object.entries(reactionGroups).map(([emoji, n]) => (
                <button key={emoji} onClick={() => onReact(m, emoji)}
                  className={`rounded-full border px-2 py-0.5 text-xs ${myReaction === emoji ? 'border-vio bg-vio/20' : 'border-line bg-panel2'}`}>
                  {emoji}{n > 1 && <span className="ml-0.5 font-bold">{n}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
