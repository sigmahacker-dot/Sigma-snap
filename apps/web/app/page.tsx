// SIGMA SNAP — landing page. Static showcase, no auth, no backend calls.
// Original branding, layout, icons and copy. Not derived from any existing product.
import { Logo, IconCamera, IconSave, IconStories, IconChat, IconFlash, IconDiscover } from '@/lib/icons';

const FEATURES = [
  {
    icon: IconCamera,
    title: 'Camera & AR Lenses',
    text: 'A camera-first canvas with original face-anchored effects, crafted in-house — playful, cinematic, and fast.',
  },
  {
    icon: IconSave,
    title: 'Memories',
    text: 'Every capture you keep lives in your personal gallery — organized, searchable, and always yours to revisit.',
  },
  {
    icon: IconStories,
    title: 'Stories',
    text: 'Share the day as it happens. Moments stitched into a story your friends can watch for 24 hours.',
  },
  {
    icon: IconChat,
    title: 'Chat',
    text: 'Text, photos, video and voice — with swipe-to-reply, quoted messages and saved conversations.',
  },
  {
    icon: IconFlash,
    title: 'Spotlight',
    text: 'A stage for your best vertical clips. Create once, shine everywhere.',
  },
  {
    icon: IconDiscover,
    title: 'Snap Map',
    text: 'See where the moment is happening. Explore stories pinned to places around the world.',
  },
];

function PhoneMock() {
  // Pure-CSS decorative phone showing the SIGMA SNAP camera layout.
  return (
    <div className="relative mx-auto w-[270px] animate-fade-up" aria-hidden>
      <div className="rounded-[2.6rem] border border-line bg-panel p-2.5 shadow-card">
        <div className="relative aspect-[9/19] overflow-hidden rounded-[2rem] bg-void">
          {/* viewfinder */}
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(120% 90% at 50% 20%, #2a2350 0%, #141422 55%, #0b0b12 100%)' }}
          />
          {/* face anchor hint */}
          <div className="absolute left-1/2 top-[30%] h-24 w-20 -translate-x-1/2 rounded-full border-2 border-dashed border-cy/50" />
          <div className="absolute left-1/2 top-[30%] mt-24 -translate-x-1/2 text-[10px] font-semibold tracking-widest text-cy/70">
            FACE LOCKED
          </div>
          {/* top row */}
          <div className="absolute inset-x-4 top-4 flex items-center justify-between">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40">
              <IconDiscover size={16} className="text-ink" />
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1.5">
              <span className="rec-dot h-1.5 w-1.5 rounded-full bg-danger" />
              <span className="text-[10px] font-bold tracking-widest text-ink">LIVE LENS</span>
            </div>
          </div>
          {/* lens rail */}
          <div className="absolute inset-x-6 bottom-24 flex items-center justify-center gap-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`h-11 w-11 rounded-full border ${
                  i === 2 ? 'border-cy shadow-glow' : 'border-line bg-black/40'
                }`}
                style={i === 2 ? { background: 'linear-gradient(135deg,#7C5CFF,#38E1FF)' } : undefined}
              />
            ))}
          </div>
          {/* capture button */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
            <div className="flex h-[68px] w-[68px] items-center justify-center rounded-full border-4 border-ink/90">
              <div
                className="h-[52px] w-[52px] rounded-full"
                style={{ background: 'linear-gradient(135deg,#7C5CFF,#38E1FF)' }}
              />
            </div>
          </div>
        </div>
      </div>
      {/* glow */}
      <div
        className="pointer-events-none absolute -inset-8 -z-10 rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, #7C5CFF55 0%, transparent 70%)' }}
      />
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-void text-ink">
      {/* nav */}
      <header className="sticky top-0 z-20 border-b border-line/60 bg-void/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <Logo size={30} />
            <span className="text-lg font-extrabold tracking-tight">
              SIGMA <span className="text-gradient">SNAP</span>
            </span>
          </div>
          <span className="rounded-full border border-line bg-panel px-3 py-1 text-[11px] font-bold tracking-widest text-dim">
            SHOWCASE
          </span>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(80% 60% at 50% 0%, #7C5CFF22 0%, transparent 70%)' }}
          aria-hidden
        />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 md:grid-cols-2 md:pt-20">
          <div className="animate-fade-up">
            <p className="mb-4 text-xs font-bold tracking-[0.25em] text-cy">SIGMA SNAP</p>
            <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
              Capture.
              <br />
              Create. <span className="text-gradient">Connect.</span>
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-dim">
              A camera-first world with original AR lenses, a memories gallery that keeps
              every moment, stories that live for a day, and chat that feels instant.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {['Original AR lenses', 'Memories gallery', 'Stories', 'Instant chat'].map((t) => (
                <span key={t} className="rounded-full border border-line bg-panel px-4 py-2 text-sm font-semibold text-ink">
                  {t}
                </span>
              ))}
            </div>
          </div>
          <PhoneMock />
        </div>
      </section>

      {/* features */}
      <section className="border-t border-line/60 bg-panel/40">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-3xl font-extrabold tracking-tight">
            Everything a <span className="text-gradient">moment</span> needs
          </h2>
          <p className="mt-2 max-w-lg text-sm text-dim">
            Six pillars, one flow — from the second you open the camera to the story
            your friends wake up to.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-3xl border border-line bg-panel p-6 shadow-card transition-transform hover:-translate-y-1"
              >
                <div
                  className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
                  style={{ background: 'linear-gradient(135deg,#7C5CFF33,#38E1FF33)', border: '1px solid #26263a' }}
                >
                  <f.icon size={24} className="text-cy" />
                </div>
                <h3 className="text-lg font-bold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-dim">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* strip */}
      <section className="border-t border-line/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 py-14 text-center">
          <Logo size={44} />
          <p className="max-w-md text-sm leading-relaxed text-dim">
            Designed from scratch — every pixel, icon, lens and sound is original.
            This page is a visual showcase of the SIGMA SNAP experience.
          </p>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-line/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-xs text-dim sm:flex-row">
          <div className="flex items-center gap-2">
            <Logo size={20} />
            <span className="font-bold text-ink">SIGMA SNAP</span>
            <span>© 2026</span>
          </div>
          <span>An original concept. All artwork created in-house.</span>
        </div>
      </footer>
    </div>
  );
}
