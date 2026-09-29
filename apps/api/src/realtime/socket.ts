import type { Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { setIO, emitToConversation, userRoom } from './events';
import { sendMessage, markRead, assertMembership } from '../modules/conversations/service';
import { endCall, rejectCall, getCall } from '../modules/calls/service';
import { MessageType } from '@prisma/client';

interface AuthedSocket extends Socket {
  data: { userId: string };
}

// presence bookkeeping: socket count per user + delayed offline timers
const socketCounts = new Map<string, number>();
const offlineTimers = new Map<string, NodeJS.Timeout>();

function emitError(socket: AuthedSocket, code: string, message: string): void {
  socket.emit('error', { code, message });
}

async function broadcastPresence(userId: string, isOnline: boolean): Promise<void> {
  const io = (globalThis as { __sigmaIO?: Server }).__sigmaIO;
  if (!io) return;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { showOnlineStatus: true, lastSeenAt: true },
  });
  const friends = await prisma.friend.findMany({ where: { userId }, select: { friendId: true } });
  const payload = {
    userId,
    isOnline: user?.showOnlineStatus === false ? false : isOnline,
    lastSeenAt: user?.lastSeenAt?.toISOString() ?? new Date().toISOString(),
  };
  for (const f of friends) {
    io.to(userRoom(f.friendId)).emit('presence:update', payload);
  }
}

async function markOnline(userId: string): Promise<void> {
  const timer = offlineTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    offlineTimers.delete(userId);
  }
  socketCounts.set(userId, (socketCounts.get(userId) ?? 0) + 1);
  await prisma.user.update({ where: { id: userId }, data: { isOnline: true, lastSeenAt: new Date() } });
  await broadcastPresence(userId, true);
}

async function markOfflineSoon(userId: string): Promise<void> {
  const count = (socketCounts.get(userId) ?? 1) - 1;
  socketCounts.set(userId, Math.max(0, count));
  if (count > 0) return; // other sockets still connected
  if (offlineTimers.has(userId)) return;
  const timer = setTimeout(async () => {
    offlineTimers.delete(userId);
    if ((socketCounts.get(userId) ?? 0) > 0) return; // reconnected meanwhile
    try {
      await prisma.user.update({ where: { id: userId }, data: { isOnline: false, lastSeenAt: new Date() } });
      await broadcastPresence(userId, false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[socket] offline update failed:', err);
    }
  }, 30_000);
  offlineTimers.set(userId, timer);
}

const joinSchema = z.object({ conversationId: z.string().uuid() });
const sendSchema = z.object({
  conversationId: z.string().uuid(),
  type: z.nativeEnum(MessageType),
  text: z.string().max(4000).optional(),
  attachmentIds: z.array(z.string().uuid()).max(10).optional(),
  replyToId: z.string().uuid().optional(),
  clientId: z.string().max(128).optional(),
});
const readSchema = z.object({ conversationId: z.string().uuid(), messageId: z.string().uuid().optional() });
const typingSchema = z.object({ conversationId: z.string().uuid() });
const offerSchema = z.object({ callId: z.string().uuid(), toUserId: z.string().uuid(), sdp: z.unknown() });
const answerSchema = z.object({ callId: z.string().uuid(), sdp: z.unknown() });
const iceSchema = z.object({ callId: z.string().uuid(), candidate: z.unknown() });
const callIdSchema = z.object({ callId: z.string().uuid() });

async function assertCallParticipant(userId: string, callId: string) {
  const call = await getCall(userId, callId);
  return call;
}

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: env.WEB_URL, credentials: true },
  });
  (globalThis as { __sigmaIO?: Server }).__sigmaIO = io;
  setIO(io);

  // JWT auth in the handshake
  io.use(async (socket, next) => {
    const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
    if (!token) return next(new Error('AUTH_REQUIRED'));
    try {
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as { sub?: string; type?: string };
      if (payload.type !== 'access' || !payload.sub) return next(new Error('INVALID_TOKEN'));
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, deletedAt: true, isBanned: true, bannedUntil: true },
      });
      if (!user || user.deletedAt) return next(new Error('USER_NOT_FOUND'));
      if (user.isBanned && (!user.bannedUntil || user.bannedUntil > new Date())) {
        return next(new Error('ACCOUNT_BANNED'));
      }
      (socket as AuthedSocket).data.userId = user.id;
      next();
    } catch {
      next(new Error('INVALID_TOKEN'));
    }
  });

  io.on('connection', (raw) => {
    const socket = raw as AuthedSocket;
    const userId = socket.data.userId;

    socket.join(userRoom(userId));
    markOnline(userId).catch((e) => console.error('[socket] markOnline failed:', e));

    socket.on('disconnect', () => {
      markOfflineSoon(userId).catch((e) => console.error('[socket] markOffline failed:', e));
    });

    socket.on('presence:ping', async () => {
      try {
        await prisma.user.update({ where: { id: userId }, data: { isOnline: true, lastSeenAt: new Date() } });
      } catch (err) {
        emitError(socket, 'PRESENCE_FAILED', (err as Error).message);
      }
    });

    socket.on('conversation:join', async (payload: unknown) => {
      const parsed = joinSchema.safeParse(payload);
      if (!parsed.success) return emitError(socket, 'VALIDATION_ERROR', 'Invalid conversation:join payload');
      try {
        await assertMembership(userId, parsed.data.conversationId);
        socket.join(`conversation:${parsed.data.conversationId}`);
      } catch (err) {
        emitError(socket, 'JOIN_FAILED', (err as Error).message);
      }
    });

    socket.on('conversation:leave', (payload: unknown) => {
      const parsed = joinSchema.safeParse(payload);
      if (!parsed.success) return emitError(socket, 'VALIDATION_ERROR', 'Invalid conversation:leave payload');
      socket.leave(`conversation:${parsed.data.conversationId}`);
    });

    socket.on('message:send', async (payload: unknown, ack?: (res: unknown) => void) => {
      const parsed = sendSchema.safeParse(payload);
      if (!parsed.success) {
        emitError(socket, 'VALIDATION_ERROR', 'Invalid message:send payload');
        ack?.({ error: { code: 'VALIDATION_ERROR', message: 'Invalid payload' } });
        return;
      }
      try {
        const message = await sendMessage(userId, parsed.data.conversationId, {
          type: parsed.data.type,
          text: parsed.data.text,
          attachmentIds: parsed.data.attachmentIds ?? [],
          replyToId: parsed.data.replyToId,
        });
        ack?.({ message, clientId: parsed.data.clientId ?? null });
      } catch (err) {
        const e = err as { code?: string; message?: string };
        emitError(socket, e.code ?? 'SEND_FAILED', e.message ?? 'Failed to send message');
        ack?.({ error: { code: e.code ?? 'SEND_FAILED', message: e.message ?? 'Failed to send message' } });
      }
    });

    socket.on('message:read', async (payload: unknown) => {
      const parsed = readSchema.safeParse(payload);
      if (!parsed.success) return emitError(socket, 'VALIDATION_ERROR', 'Invalid message:read payload');
      try {
        await markRead(userId, parsed.data.conversationId);
        socket.to(`conversation:${parsed.data.conversationId}`).emit('message:read', {
          conversationId: parsed.data.conversationId,
          userId,
          messageId: parsed.data.messageId ?? null,
        });
      } catch (err) {
        emitError(socket, 'READ_FAILED', (err as Error).message);
      }
    });

    const typing = (on: boolean) => async (payload: unknown) => {
      const parsed = typingSchema.safeParse(payload);
      if (!parsed.success) return;
      try {
        await assertMembership(userId, parsed.data.conversationId);
        socket.to(`conversation:${parsed.data.conversationId}`).emit('typing:update', {
          conversationId: parsed.data.conversationId,
          userId,
          typing: on,
        });
      } catch {
        // ignore typing for conversations the user can't access
      }
    };
    socket.on('typing:start', typing(true));
    socket.on('typing:stop', typing(false));

    // ── call signaling (passthrough with membership checks) ──
    socket.on('call:offer', async (payload: unknown) => {
      const parsed = offerSchema.safeParse(payload);
      if (!parsed.success) return emitError(socket, 'VALIDATION_ERROR', 'Invalid call:offer payload');
      try {
        await assertCallParticipant(userId, parsed.data.callId);
        io.to(userRoom(parsed.data.toUserId)).emit('call:offer', {
          callId: parsed.data.callId,
          fromUserId: userId,
          sdp: parsed.data.sdp,
        });
      } catch (err) {
        emitError(socket, 'SIGNAL_FAILED', (err as Error).message);
      }
    });

    socket.on('call:answer', async (payload: unknown) => {
      const parsed = answerSchema.safeParse(payload);
      if (!parsed.success) return emitError(socket, 'VALIDATION_ERROR', 'Invalid call:answer payload');
      try {
        const call = await assertCallParticipant(userId, parsed.data.callId);
        for (const p of call.participants) {
          if (p.userId === userId) continue;
          io.to(userRoom(p.userId)).emit('call:answer', { callId: parsed.data.callId, sdp: parsed.data.sdp });
        }
        if (call.status === 'RINGING') {
          await prisma.call.update({ where: { id: call.id }, data: { status: 'ONGOING' } });
        }
      } catch (err) {
        emitError(socket, 'SIGNAL_FAILED', (err as Error).message);
      }
    });

    socket.on('call:ice-candidate', async (payload: unknown) => {
      const parsed = iceSchema.safeParse(payload);
      if (!parsed.success) return emitError(socket, 'VALIDATION_ERROR', 'Invalid call:ice-candidate payload');
      try {
        const call = await assertCallParticipant(userId, parsed.data.callId);
        for (const p of call.participants) {
          if (p.userId === userId) continue;
          io.to(userRoom(p.userId)).emit('call:ice-candidate', {
            callId: parsed.data.callId,
            candidate: parsed.data.candidate,
          });
        }
      } catch (err) {
        emitError(socket, 'SIGNAL_FAILED', (err as Error).message);
      }
    });

    socket.on('call:reject', async (payload: unknown) => {
      const parsed = callIdSchema.safeParse(payload);
      if (!parsed.success) return emitError(socket, 'VALIDATION_ERROR', 'Invalid call:reject payload');
      try {
        await rejectCall(userId, parsed.data.callId);
      } catch (err) {
        emitError(socket, 'REJECT_FAILED', (err as Error).message);
      }
    });

    socket.on('call:hangup', async (payload: unknown) => {
      const parsed = callIdSchema.safeParse(payload);
      if (!parsed.success) return emitError(socket, 'VALIDATION_ERROR', 'Invalid call:hangup payload');
      try {
        await endCall(userId, parsed.data.callId);
      } catch (err) {
        emitError(socket, 'HANGUP_FAILED', (err as Error).message);
      }
    });
  });

  return io;
}

// Re-export room emitters for services that prefer the socket module.
export { emitToConversation };
