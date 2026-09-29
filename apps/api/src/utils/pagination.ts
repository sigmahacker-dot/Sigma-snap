/** Cursor helpers: opaque base64url-encoded JSON cursors. */

export function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeCursor<T>(cursor: string | undefined | null): T | null {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

export interface PageEnvelope<T> {
  data: T[];
  page: { nextCursor: string | null };
}

export function pageEnvelope<T>(data: T[], nextCursor: string | null): PageEnvelope<T> {
  return { data, page: { nextCursor } };
}

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export function clampLimit(raw: unknown, fallback = DEFAULT_LIMIT): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), MAX_LIMIT);
}
