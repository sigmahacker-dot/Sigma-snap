
'use client';
// Chat composer: text input, image/video attach, hold-to-record voice,
// sticker picker, reply + edit banners, typing notifications.
import React, { useEffect, useRef, useState } from 'react';
import type { Message } from '@sigma-snap/shared';
import { IconSend, IconPlus, IconMic, IconSmile, IconX, IconImage, IconVideo, IconTrash } from '@/lib/icons';
import { sounds } from '@/lib/sounds';
import { StickerPicker } from './Stickers';
import { messageSnippet } from './chat-utils';

export interface OutgoingMedia { file: File; kind: 'IMAGE' | 'VIDEO' }
export interface ComposerCallbacks {
  onSendText: (text: string) => void;
  onSendMedia: (m: OutgoingMedia) => void;
  onSendSticker: (stickerId: string) => void;
  onSendVoice: (blob: Blob, durationSec: number) => void;
  onSaveEdit: (text: string) => void;
  onCancelEdit: () => void;
  onClearReply: () => void;
  onTyping: (typing: boolean) => void;
}

interface Props extends ComposerCallbacks {
  replyTo: Message | null;
  editing: Message | null;
  disabled?: boolean;
}

export default function Composer(props: Props) {
  const { replyTo, editing, disabled, onTyping } = props;
  const [text, setText] = useState('');
  const [attachOpen, setAttachOpen] = useState(false);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recStartRef = useRef(0);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const vidInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) { setText(editing.text ?? ''); inputRef.current?.focus(); }
    else setText('');
  }, [editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    stopRecorder(true);
    if (recTimerRef.current) clearInterval(recTimerRef.current);
  }, []);

  const notifyTyping = (v: string) => {
    onTyping(true);
    if (typingRef.current) clearTimeout(typingRef.current);
    typingRef.current = setTimeout(() => onTyping(false), 2500);
    if (!v) { if (typingRef.current) clearTimeout(typingRef.current); onTyping(false); }
  };

  const stopRecorder = (discard: boolean) => {
    try { if (mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop(); } catch { /* noop */ }
    mediaRef.current?.stream.getTracks().forEach((t) => t.stop());
    mediaRef.current = null;
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
    if (discard) chunksRef.current = [];
  };

  const finishRecording = (send: boolean) => {
    const rec = mediaRef.current;
    const startedAt = recStartRef.current;
    if (!rec) { setRecording(false); return; }
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
      chunksRef.current = [];
      const dur = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      setRecording(false);
      if (send && blob.size > 0) props.onSendVoice(blob, dur);
      try { rec.stream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
      if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
    };
    try { rec.stop(); } catch { setRecording(false); }
    mediaRef.current = null;
  };

  const startRecording = async () => {
    if (recording || disabled) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.start();
      mediaRef.current = rec;
      recStartRef.current = Date.now();
      setRecSec(0);
      setRecording(true);
      sounds.recStart();
      recTimerRef.current = setInterval(() => {
        setRecSec(Math.round((Date.now() - recStartRef.current) / 1000));
      }, 500);
    } catch {
      sounds.error();
    }
  };

  const sendText = () => {
    const t = text.trim();
    if (!t || disabled) return;
    if (editing) props.onSaveEdit(t);
    else { props.onSendText(t); sounds.send(); }
    setText('');
    if (typingRef.current) clearTimeout(typingRef.current);
    onTyping(false);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>, kind: 'IMAGE' | 'VIDEO') => {
    const f = e.target.files?.[0];
    if (f) { props.onSendMedia({ file: f, kind }); sounds.send(); }
    e.target.value = '';
    setAttachOpen(false);
  };

  const recLabel = `${Math.floor(recSec / 60)}:${(recSec % 60).toString().padStart(2, '0')}`;

  return (
    <div className="relative">
      {replyTo && (
        <div className="mx-3 mb-1 flex items-center justify-between rounded-xl border-l-2 border-vio bg-panel2 px-3 py-2">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-vio">{replyTo.sender?.displayName ?? 'Message'}</p>
            <p className="truncate text-xs text-dim">{messageSnippet(replyTo)}</p>
          </div>
          <button onClick={props.onClearReply} aria-label="Cancel reply" className="p-1 text-dim hover:text-ink"><IconX size={15} /></button>
        </div>
      )}
      {editing && (
        <div className="mx-3 mb-1 flex items-center justify-between rounded-xl border-l-2 border-gold bg-panel2 px-3 py-2">
          <p className="text-[11px] font-bold text-gold">Editing message</p>
          <button onClick={props.onCancelEdit} aria-label="Cancel edit" className="p-1 text-dim hover:text-ink"><IconX size={15} /></button>
        </div>
      )}

      {recording ? (
        <div className="mx-3 mb-2 flex items-center gap-3 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3">
          <span className="h-2.5 w-2.5 animate-rec-blink rounded-full bg-danger" />
          <span className="flex-1 text-sm font-bold text-danger">Recording… {recLabel}</span>
          <button onClick={() => { stopRecorder(true); setRecording(false); sounds.recStop(); }}
            aria-label="Discard recording" className="rounded-full bg-white/5 p-2 text-dim hover:text-danger">
            <IconTrash size={17} />
          </button>
          <span className="text-[11px] text-dim">Release mic to send</span>
        </div>
      ) : (
        <div className="flex items-end gap-2 px-3 pb-1">
          <div className="relative">
            <button onClick={() => setAttachOpen((v) => !v)} aria-label="Attach"
              className="rounded-full bg-panel2 p-2.5 text-dim transition hover:text-ink active:scale-95">
              <IconPlus size={20} />
            </button>
            {attachOpen && (
              <div className="absolute bottom-12 left-0 z-30 w-44 rounded-2xl border border-line bg-panel p-1.5 shadow-card animate-fade-up">
                <button onClick={() => imgInputRef.current?.click()}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-white/5">
                  <IconImage size={18} className="text-cy" /> Photo
                </button>
                <button onClick={() => vidInputRef.current?.click()}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-white/5">
                  <IconVideo size={18} className="text-vio" /> Video
                </button>
              </div>
            )}
          </div>
          <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e, 'IMAGE')} />
          <input ref={vidInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => onFile(e, 'VIDEO')} />

          <div className="flex flex-1 items-center rounded-3xl border border-line bg-panel2 pl-4 pr-1.5 focus-within:border-vio">
            <input
              ref={inputRef}
              value={text}
              disabled={disabled}
              onChange={(e) => { setText(e.target.value); notifyTyping(e.target.value); }}
              onKeyDown={(e) => { if (e.key === 'Enter') sendText(); }}
              placeholder={editing ? 'Edit message…' : 'Message…'}
              className="w-full bg-transparent py-2.5 text-[15px] text-ink placeholder:text-dim/70 outline-none"
            />
            <button onClick={() => setStickerOpen(true)} aria-label="Stickers"
              className="p-2 text-dim transition hover:text-gold active:scale-95">
              <IconSmile size={21} />
            </button>
          </div>

          {text.trim() || editing ? (
            <button onClick={sendText} disabled={disabled} aria-label="Send"
              className="rounded-full bg-gradient-to-r from-vio to-vio-deep p-3 text-white shadow-glow transition active:scale-95 disabled:opacity-40">
              <IconSend size={19} />
            </button>
          ) : (
            <button
              onPointerDown={(e) => { e.preventDefault(); void startRecording(); }}
              onPointerUp={() => finishRecording(true)}
              onPointerLeave={() => { if (recording) finishRecording(true); }}
              onContextMenu={(e) => e.preventDefault()}
              aria-label="Hold to record voice message"
              className="touch-none select-none rounded-full bg-panel2 p-3 text-dim transition hover:text-ink active:scale-95 active:bg-vio/20">
              <IconMic size={19} />
            </button>
          )}
        </div>
      )}

      {stickerOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal>
          <div className="absolute inset-0 bg-black/70" onClick={() => setStickerOpen(false)} />
          <div className="relative w-full max-w-md animate-fade-up">
            <StickerPicker onPick={(id) => props.onSendSticker(id)} onClose={() => setStickerOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
