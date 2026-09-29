
'use client';
// Real WebRTC voice/video calling with Socket.IO signaling (docs/API.md §12, §16).
// 1:1 calls are fully wired (offer/answer/ICE, renegotiation-safe queues).
// Group calls use a best-effort mesh: the starter offers every participant;
// members who accept answer the starter's offer and also offer each other.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import { Avatar } from '@/components/ui';
import {
  IconPhone, IconPhoneOff, IconMic, IconMicOff, IconVideo, IconVideoOff, IconSpeaker, IconX,
} from '@/lib/icons';
import { sounds } from '@/lib/sounds';
import { convoTitle, dmOther, type ChatUser } from '@/components/chat/chat-utils';

export type CallType = 'VOICE' | 'VIDEO';
export interface OutgoingCall { conversationId?: string; userId?: string; type: CallType }

interface Props {
  meId: string;
  /** When set, starts an outgoing call once. */
  outgoing?: OutgoingCall | null;
  onDone?: () => void;
}

type Phase = 'idle' | 'outgoing' | 'incoming' | 'active';

interface Session {
  callId: string;
  type: CallType;
  direction: 'in' | 'out';
  conversationId?: string;
  title: string;
  avatar?: string | null;
  peerUserId?: string;
  isGroup: boolean;
  memberIds: string[];
}

interface WireCall { id: string; type?: CallType; conversationId?: string | null; status?: string }

function iceServers(): RTCIceServer[] {
  const raw = (process.env.NEXT_PUBLIC_STUN_URLS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!raw.length) raw.push('stun:stun.l.google.com:19302');
  return [{ urls: raw }];
}

function normalizeSdp(sdp: unknown, type: 'offer' | 'answer'): RTCSessionDescriptionInit | null {
  if (!sdp) return null;
  if (typeof sdp === 'string') return { type, sdp };
  const o = sdp as { type?: string; sdp?: string };
  if (typeof o.sdp === 'string') return { type: (o.type as 'offer' | 'answer') || type, sdp: o.sdp };
  return null;
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m.toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

export default function CallManager({ meId, outgoing, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [session, setSession] = useState<Session | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Array<[string, MediaStream]>>([]);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [connFailed, setConnFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<ReturnType<typeof connectSocket> | null>(null);
  const pcsRef = useRef(new Map<string, RTCPeerConnection>());
  const localStreamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const phaseRef = useRef<Phase>('idle');
  const queuedOffersRef = useRef(new Map<string, RTCSessionDescriptionInit>());
  const queuedIceRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const ringTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const missedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  const setPhaseBoth = (p: Phase) => { phaseRef.current = p; setPhase(p); };
  const setSessionBoth = (s: Session | null) => { sessionRef.current = s; setSession(s); };

  const stopRing = () => {
    if (ringTimerRef.current) { clearInterval(ringTimerRef.current); ringTimerRef.current = null; }
  };
  const startRing = () => {
    stopRing();
    sounds.ring();
    ringTimerRef.current = setInterval(() => sounds.ring(), 1600);
  };

  const cleanup = useCallback((done = true) => {
    stopRing();
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
    if (missedTimerRef.current) { clearTimeout(missedTimerRef.current); missedTimerRef.current = null; }
    pcsRef.current.forEach((pc) => { try { pc.close(); } catch { /* noop */ } });
    pcsRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    queuedOffersRef.current.clear();
    queuedIceRef.current.clear();
    setLocalStream(null);
    setRemoteStreams([]);
    setSessionBoth(null);
    setPhaseBoth('idle');
    setMuted(false); setCamOff(false); setConnFailed(false); setElapsed(0);
    if (done) onDoneRef.current?.();
  }, []);

  const getLocalMedia = async (type: CallType): Promise<MediaStream> => {
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: type === 'VIDEO' ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
    });
  };

  const makePeer = useCallback((key: string, callId: string, toUserId?: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socketRef.current?.emit('call:ice-candidate', {
          callId, toUserId, candidate: e.candidate.toJSON(),
        });
      }
    };
    pc.ontrack = (e) => {
      const stream = e.streams[0];
      if (stream) setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.set(key, stream);
        return [...next.entries()];
      });
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') setConnFailed(true);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') setConnFailed(false);
    };
    const local = localStreamRef.current;
    local?.getTracks().forEach((t) => pc.addTrack(t, local));
    pcsRef.current.set(key, pc);
    return pc;
  }, []);

  const flushQueuedIce = useCallback(async (callId: string) => {
    const q = queuedIceRef.current.get(callId);
    if (!q?.length) return;
    queuedIceRef.current.delete(callId);
    for (const [, pc] of pcsRef.current) {
      if (!pc.remoteDescription) continue;
      for (const c of q) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* noop */ }
      }
    }
  }, []);

  const goActive = useCallback(() => {
    stopRing();
    if (missedTimerRef.current) { clearTimeout(missedTimerRef.current); missedTimerRef.current = null; }
    setPhaseBoth('active');
    sounds.success();
    const t0 = Date.now();
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = setInterval(() => setElapsed(Date.now() - t0), 1000);
  }, []);

  // ── Outgoing ──────────────────────────────────────────────────────────
  const startOutgoing = useCallback(async (o: OutgoingCall) => {
    const socket = socketRef.current;
    if (!socket) return;
    setError(null);
    try {
      const res = await api.startCall({ userId: o.userId, conversationId: o.conversationId, type: o.type });
      const call = (res?.call ?? res ?? {}) as WireCall;
      const callId = call.id;
      if (!callId) throw new Error('Server did not return a call id');

      let title = 'Voice call';
      let avatar: string | null = null;
      let targets: string[] = [];
      let isGroup = false;
      if (o.conversationId) {
        const conv = await api.getConversation(o.conversationId).catch(() => null);
        if (conv) {
          title = convoTitle(conv, meId);
          avatar = conv.type === 'GROUP' ? (conv.avatarUrl ?? null) : (dmOther(conv, meId)?.user.avatarUrl ?? null);
          isGroup = conv.type === 'GROUP';
          targets = conv.participants.map((p) => p.userId).filter((id) => id !== meId);
        }
      }
      if (!targets.length && o.userId) targets = [o.userId];
      if (!targets.length) throw new Error('No one to call');

      const local = await getLocalMedia(o.type);
      localStreamRef.current = local;
      setLocalStream(local);

      const sess: Session = {
        callId, type: o.type, direction: 'out', conversationId: o.conversationId,
        title, avatar, peerUserId: targets.length === 1 ? targets[0] : undefined,
        isGroup: isGroup || targets.length > 1, memberIds: targets,
      };
      setSessionBoth(sess);
      setPhaseBoth('outgoing');
      startRing();

      for (const toUserId of targets) {
        const pc = makePeer(isGroup || targets.length > 1 ? `out-${toUserId}` : 'peer', callId, toUserId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('call:offer', { callId, toUserId, sdp: pc.localDescription });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start call');
      sounds.error();
      cleanup(false);
    }
  }, [meId, makePeer, cleanup]);

  // ── Incoming ──────────────────────────────────────────────────────────
  const handleIncoming = useCallback(async (payload: { call?: WireCall; fromUser?: ChatUser | null }) => {
    const call = payload.call;
    if (!call?.id) return;
    const socket = socketRef.current;
    if (sessionRef.current) {
      // Busy — politely decline so the caller isn't left ringing.
      socket?.emit('call:reject', { callId: call.id });
      return;
    }
    const type: CallType = call.type === 'VIDEO' ? 'VIDEO' : 'VOICE';
    let title = payload.fromUser?.displayName ?? 'Unknown caller';
    let avatar = payload.fromUser?.avatarUrl ?? null;
    let isGroup = false;
    let memberIds: string[] = [];
    let peerUserId = payload.fromUser?.id;
    if (call.conversationId) {
      const conv = await api.getConversation(call.conversationId).catch(() => null);
      if (conv) {
        isGroup = conv.type === 'GROUP';
        title = isGroup ? (conv.title || 'Group call') : (payload.fromUser?.displayName ?? convoTitle(conv, meId));
        avatar = isGroup ? (conv.avatarUrl ?? null) : (payload.fromUser?.avatarUrl ?? null);
        memberIds = conv.participants.map((p) => p.userId).filter((id) => id !== meId && id !== payload.fromUser?.id);
      }
    }
    setSessionBoth({
      callId: call.id, type, direction: 'in', conversationId: call.conversationId ?? undefined,
      title, avatar, peerUserId, isGroup, memberIds,
    });
    setPhaseBoth('incoming');
    startRing();
    // Auto-mark missed after 45s of no answer.
    if (missedTimerRef.current) clearTimeout(missedTimerRef.current);
    missedTimerRef.current = setTimeout(() => {
      socketRef.current?.emit('call:reject', { callId: call.id });
      cleanup();
    }, 45000);
  }, [meId, cleanup]);

  const accept = useCallback(async () => {
    const sess = sessionRef.current;
    const socket = socketRef.current;
    if (!sess || phaseRef.current !== 'incoming' || !socket) return;
    setError(null);
    try {
      const local = await getLocalMedia(sess.type);
      localStreamRef.current = local;
      setLocalStream(local);
      const pc = makePeer('peer', sess.callId, sess.peerUserId);
      const queued = queuedOffersRef.current.get(sess.callId);
      if (queued) {
        queuedOffersRef.current.delete(sess.callId);
        await pc.setRemoteDescription(new RTCSessionDescription(queued));
        await flushQueuedIce(sess.callId);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('call:answer', { callId: sess.callId, sdp: pc.localDescription });
      }
      // Group mesh: also offer every other member (best effort).
      for (const toUserId of sess.memberIds) {
        try {
          const mpc = makePeer(`mesh-${toUserId}`, sess.callId, toUserId);
          const offer = await mpc.createOffer();
          await mpc.setLocalDescription(offer);
          socket.emit('call:offer', { callId: sess.callId, toUserId, sdp: mpc.localDescription });
        } catch { /* one failed mesh leg must not kill the call */ }
      }
      goActive();
    } catch {
      setError('Microphone/camera unavailable — check browser permissions.');
      sounds.error();
    }
  }, [makePeer, flushQueuedIce, goActive]);

  const decline = useCallback(() => {
    const sess = sessionRef.current;
    if (sess) socketRef.current?.emit('call:reject', { callId: sess.callId });
    sounds.tap();
    cleanup();
  }, [cleanup]);

  const hangup = useCallback(() => {
    const sess = sessionRef.current;
    if (sess) {
      socketRef.current?.emit('call:hangup', { callId: sess.callId });
      api.endCall(sess.callId).catch(() => {});
    }
    sounds.tap();
    cleanup();
  }, [cleanup]);

  // ── Socket wiring (registered once) ───────────────────────────────────
  useEffect(() => {
    const socket = connectSocket();
    socketRef.current = socket;

    const onIncoming = (p: { call?: WireCall; fromUser?: ChatUser | null }) => { void handleIncoming(p); };
    const onOffer = async (p: { callId: string; toUserId?: string; sdp: unknown }) => {
      const sess = sessionRef.current;
      if (!sess || p.callId !== sess.callId) return;
      const sdp = normalizeSdp(p.sdp, 'offer');
      if (!sdp) return;
      let pc = pcsRef.current.get('peer');
      if (!pc) {
        queuedOffersRef.current.set(sess.callId, sdp);
        return;
      }
      try {
        if (!pc.remoteDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          await flushQueuedIce(sess.callId);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('call:answer', { callId: sess.callId, sdp: pc.localDescription });
        }
      } catch { /* ignore malformed renegotiation */ }
    };
    const onAnswer = async (p: { callId: string; sdp: unknown }) => {
      const sess = sessionRef.current;
      if (!sess || p.callId !== sess.callId) return;
      const sdp = normalizeSdp(p.sdp, 'answer');
      if (!sdp) return;
      for (const [, pc] of pcsRef.current) {
        if (!pc.remoteDescription) {
          try { await pc.setRemoteDescription(new RTCSessionDescription(sdp)); } catch { /* noop */ }
        }
      }
      await flushQueuedIce(sess.callId);
      if (phaseRef.current === 'outgoing') goActive();
    };
    const onIce = async (p: { callId: string; candidate: unknown }) => {
      const sess = sessionRef.current;
      if (!sess || p.callId !== sess.callId || !p.candidate) return;
      const cand = p.candidate as RTCIceCandidateInit;
      let applied = false;
      for (const [, pc] of pcsRef.current) {
        if (pc.remoteDescription) {
          try { await pc.addIceCandidate(new RTCIceCandidate(cand)); applied = true; } catch { /* noop */ }
        }
      }
      if (!applied) {
        const q = queuedIceRef.current.get(sess.callId) ?? [];
        q.push(cand);
        queuedIceRef.current.set(sess.callId, q);
      }
    };
    const onEnded = (p: { callId: string }) => {
      if (sessionRef.current?.callId === p.callId) cleanup();
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:offer', onOffer);
    socket.on('call:answer', onAnswer);
    socket.on('call:ice-candidate', onIce);
    socket.on('call:ended', onEnded);
    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:offer', onOffer);
      socket.off('call:answer', onAnswer);
      socket.off('call:ice-candidate', onIce);
      socket.off('call:ended', onEnded);
    };
  }, [handleIncoming, flushQueuedIce, goActive, cleanup]);

  // Outgoing trigger
  const outgoingKey = outgoing ? `${outgoing.conversationId ?? ''}|${outgoing.userId ?? ''}|${outgoing.type}` : '';
  useEffect(() => {
    if (!outgoing || startedRef.current) return;
    startedRef.current = true;
    void startOutgoing(outgoing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outgoingKey]);

  // Unmount cleanup
  useEffect(() => () => { cleanup(false); }, [cleanup]);

  // Attach streams to video elements
  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream, phase]);
  useEffect(() => {
    if (remoteVideoRef.current && remoteStreams[0]) remoteVideoRef.current.srcObject = remoteStreams[0][1];
  }, [remoteStreams, phase]);

  // ── Controls ──────────────────────────────────────────────────────────
  const toggleMute = () => {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setMuted(next);
    sounds.tap();
  };
  const toggleCam = () => {
    const next = !camOff;
    localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = !next; });
    setCamOff(next);
    sounds.tap();
  };
  const toggleSpeaker = async () => {
    const next = !speaker;
    setSpeaker(next);
    sounds.tap();
    try {
      const el = remoteVideoRef.current as (HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }) | null;
      if (el && typeof el.setSinkId === 'function') {
        if (next) {
          // Prefer a non-default output device when "speaker" is on.
          const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
          const out = devices.find((d) => d.kind === 'audiooutput' && d.deviceId && d.deviceId !== 'default');
          await el.setSinkId(out ? out.deviceId : '');
        } else {
          await el.setSinkId('');
        }
      }
    } catch { /* setSinkId unsupported — state toggle only */ }
  };

  if (phase === 'idle' && !error) return null;

  const isVideo = session?.type === 'VIDEO';
  const remoteList = remoteStreams.map(([, s]) => s);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-void/97 backdrop-blur-xl" role="dialog" aria-modal aria-label="Call">
      <div className="flex h-full w-full max-w-md flex-col">
        {error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="text-lg font-bold text-danger">Call failed</p>
            <p className="max-w-xs text-sm text-dim">{error}</p>
            <button onClick={() => { setError(null); cleanup(); }}
              className="rounded-2xl bg-white/5 px-6 py-3 text-sm font-semibold hover:bg-white/10">Close</button>
          </div>
        ) : session && (phase === 'incoming' || phase === 'outgoing') ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center animate-fade-up">
            <div className="relative">
              <span className="absolute inset-0 animate-ping rounded-full bg-vio/30" />
              <Avatar src={session.avatar} name={session.title} size={104} ring />
            </div>
            <h2 className="mt-4 text-xl font-bold">{session.title}</h2>
            <p className="text-sm text-dim">
              {phase === 'incoming' ? `Incoming ${session.type === 'VIDEO' ? 'video' : 'voice'} call` : 'Calling…'}
              {session.isGroup && ' · group'}
            </p>
            <div className="mt-8 flex items-center gap-8">
              {phase === 'incoming' ? (
                <>
                  <button onClick={decline} aria-label="Decline call"
                    className="rounded-full bg-danger p-5 text-white shadow-card transition active:scale-90">
                    <IconPhoneOff size={30} />
                  </button>
                  <button onClick={() => void accept()} aria-label="Accept call"
                    className="animate-pulse rounded-full bg-[#2ED573] p-5 text-white shadow-glow transition active:scale-90">
                    <IconPhone size={30} />
                  </button>
                </>
              ) : (
                <button onClick={hangup} aria-label="Cancel call"
                  className="rounded-full bg-danger p-5 text-white shadow-card transition active:scale-90">
                  <IconPhoneOff size={30} />
                </button>
              )}
            </div>
          </div>
        ) : session && phase === 'active' ? (
          <>
            <div className="relative flex-1 overflow-hidden bg-black">
              {isVideo ? (
                remoteList.length > 1 ? (
                  <div className="grid h-full grid-cols-2 gap-1 p-1">
                    {remoteList.slice(0, 4).map((s, i) => (
                      <video key={i} autoPlay playsInline
                        ref={(el) => { if (el) el.srcObject = s; }}
                        className="h-full w-full rounded-xl bg-panel object-cover" />
                    ))}
                  </div>
                ) : (
                  <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
                )
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-4">
                  <div className="relative">
                    <span className="absolute inset-0 animate-ping rounded-full bg-vio/25" />
                    <Avatar src={session.avatar} name={session.title} size={120} ring />
                  </div>
                  <h2 className="text-xl font-bold">{session.title}</h2>
                </div>
              )}

              {/* top bar */}
              <div className="absolute left-0 right-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-4 pt-safe">
                <div>
                  <p className="font-bold">{session.title}</p>
                  <p className="text-xs text-white/70">{fmtElapsed(elapsed)}{session.isGroup ? ' · group call' : ''}</p>
                </div>
                <span className="rounded-full bg-[#2ED573]/20 px-3 py-1 text-[11px] font-bold text-[#2ED573]">
                  {session.type === 'VIDEO' ? 'Video' : 'Voice'}
                </span>
              </div>

              {/* local PiP */}
              {isVideo && localStream && !camOff && (
                <video ref={localVideoRef} autoPlay playsInline muted
                  className="absolute bottom-24 right-4 h-36 w-24 rounded-2xl border border-line bg-panel object-cover" style={{ transform: 'scaleX(-1)' }} />
              )}

              {connFailed && (
                <div className="absolute bottom-24 left-4 right-4 rounded-2xl border border-gold/40 bg-gold/10 p-3 text-xs text-gold">
                  Connection failed — no TURN server is configured, so calls may not connect on restrictive networks (UDP blocked).
                </div>
              )}
            </div>

            {/* controls */}
            <div className="flex items-center justify-center gap-5 bg-void p-6 pb-10">
              <button onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}
                className={`rounded-full p-4 transition active:scale-90 ${muted ? 'bg-danger text-white' : 'bg-white/10 text-ink'}`}>
                {muted ? <IconMicOff size={24} /> : <IconMic size={24} />}
              </button>
              {isVideo && (
                <button onClick={toggleCam} aria-label={camOff ? 'Camera on' : 'Camera off'}
                  className={`rounded-full p-4 transition active:scale-90 ${camOff ? 'bg-danger text-white' : 'bg-white/10 text-ink'}`}>
                  {camOff ? <IconVideoOff size={24} /> : <IconVideo size={24} />}
                </button>
              )}
              <button onClick={() => void toggleSpeaker()} aria-label="Toggle speaker"
                className={`rounded-full p-4 transition active:scale-90 ${speaker ? 'bg-vio text-white shadow-glow' : 'bg-white/10 text-ink'}`}>
                <IconSpeaker size={24} />
              </button>
              <button onClick={hangup} aria-label="End call"
                className="rounded-full bg-danger p-5 text-white shadow-card transition active:scale-90">
                <IconPhoneOff size={28} />
              </button>
            </div>
            {session.isGroup && (
              <p className="bg-void px-6 pb-8 text-center text-[11px] text-dim">
                Group calls use a best-effort mesh — each member connects peer-to-peer.
              </p>
            )}
          </>
        ) : null}

        {phase !== 'idle' && !error && (
          <button onClick={hangup} aria-label="Close call"
            className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white/80 hover:text-white">
            <IconX size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
