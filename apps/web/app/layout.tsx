import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { ConfigProvider, AnnouncementBanners } from '@/lib/config';
import BottomNav from '@/components/BottomNav';

export const metadata: Metadata = {
  title: 'SIGMA SNAP',
  description: 'Camera-first social + messaging — capture, create, connect.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#0B0B12',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-void text-ink antialiased">
        <AuthProvider>
          <ConfigProvider>
          <div className="mx-auto min-h-dvh w-full max-w-md bg-void shadow-card sm:border-x sm:border-line">
            <AnnouncementBanners />
            {children}
            <div className="h-20" />
            <BottomNav />
          </div>
          </ConfigProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
