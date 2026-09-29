'use client';
// Bottom navigation — CAMERA · CHAT · DISCOVER · STORIES · PROFILE.
// Original SIGMA SNAP layout (not modeled on any existing product).
// Tabs are gated by remote feature flags (admin can hide Discover, etc.).
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconCamera, IconChat, IconDiscover, IconStories, IconProfile } from '@/lib/icons';
import { useConfig } from '@/lib/config';
import { sounds } from '@/lib/sounds';

const TABS = [
  { href: '/camera', label: 'Camera', Icon: IconCamera, flag: null as string | null },
  { href: '/chat', label: 'Chat', Icon: IconChat, flag: null },
  { href: '/spotlight', label: 'Discover', Icon: IconDiscover, flag: 'spotlight' },
  { href: '/stories', label: 'Stories', Icon: IconStories, flag: null },
  { href: '/profile', label: 'Profile', Icon: IconProfile, flag: null },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { flagOn } = useConfig();
  const tabs = TABS.filter((t) => !t.flag || flagOn(t.flag));
  // Full-screen experiences hide the nav
  if (pathname?.startsWith('/editor') || pathname?.startsWith('/chat/') && pathname !== '/chat') return null;
  if (pathname === '/login' || pathname === '/register') return null;
  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-line bg-void/90 backdrop-blur-lg pb-safe">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map(({ href, label, Icon }) => {
          const active = pathname === href || (href !== '/camera' && pathname?.startsWith(href));
          return (
            <Link key={href} href={href} onClick={() => sounds.tap()}
              className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition ${active ? 'text-vio' : 'text-dim hover:text-ink'}`}>
              <Icon size={23} strokeWidth={active ? 2.2 : 1.8} />
              {label}
              {active && <span className="h-1 w-1 rounded-full bg-vio" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
