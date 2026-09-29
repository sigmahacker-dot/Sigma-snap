import type { Server } from 'socket.io';
import { prisma } from '../db/prisma';

let io: Server | null = null;

/** The Socket.IO server registers itself here so services can emit without importing socket.ts (avoids cycles). */
export function setIO(server: Server): void {
  io = server;
}

export function getIO(): Server | null {
  return io;
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function conversationRoom(conversationId: string): string {
  return `conversation:${conversationId}`;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(userRoom(userId)).emit(event, payload);
}

export function emitToConversation(conversationId: string, event: string, payload: unknown): void {
  io?.to(conversationRoom(conversationId)).emit(event, payload);
}

/**
 * Emit to the conversation room AND to every participant's personal user
 * room in ONE emission across the union of rooms. Every device joins
 * `user:<id>` on connect, so this guarantees delivery to all of a
 * recipient's devices even when they haven't opened (joined) the
 * conversation room. A single union emission also avoids delivering the
 * event twice to a device that sits in both rooms.
 * Best-effort: realtime never throws.
 */
export async function emitToConversationMembers(
  conversationId: string,
  event: string,
  payload: unknown,
): Promise<void> {
  const rooms = [conversationRoom(conversationId)];
  try {
    const parts = await prisma.conversationParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    for (const p of parts) rooms.push(userRoom(p.userId));
  } catch {
    /* realtime fan-out must not break the request path */
  }
  io?.to(rooms).emit(event, payload);
}
