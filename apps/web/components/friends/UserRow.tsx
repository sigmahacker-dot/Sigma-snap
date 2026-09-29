'use client';
// Shared user list row: avatar (+online dot), name, actions slot.
import React from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/ui';
import type { User } from '@sigma-snap/shared';

export function UserRow({
  user, online = false, right, href, onClick,
}: {
  user: User; online?: boolean; right?: React.ReactNode; href?: string; onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="relative">
        <Avatar src={user.avatarUrl} name={user.displayName} size={46} />
        {online && (
          <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-void bg-emerald-400" aria-label="online" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{user.displayName}</p>
        <p className="truncate text-xs text-dim">@{user.username}</p>
      </div>
      {right}
    </>
  );
  const cls = 'flex w-full items-center gap-3 rounded-2xl border border-transparent bg-panel p-3 transition hover:border-line';
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={`${cls} text-left`}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}
