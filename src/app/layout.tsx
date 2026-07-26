import type { Metadata } from 'next';
import './globals.css';
import '@/lib/scheduler';
import { Navigation } from '@/components/Navigation';

export const metadata: Metadata = {
  title: 'Schedulearr',
  description: 'Intelligent scheduling dashboard for Radarr and Sonarr',
  icons: {
    icon: [
      {
        url: '/icon.png',
        href: '/icon.png',
        type: 'image/png',
      },
    ],
  },
};

import { Toaster } from 'sonner';
import { MobileLayout } from '@/components/mobile/MobileLayout';
import { DesktopLayout } from '@/components/desktop/DesktopLayout';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen w-full max-w-full overflow-x-hidden bg-zinc-950 text-zinc-300 font-sans selection:bg-emerald-500/30">
        {/* Dedicated 100% Exclusive Mobile/Tablet Layout (<1024px) */}
        <MobileLayout>{children}</MobileLayout>

        {/* Dedicated 100% Exclusive Desktop Layout (>=1024px) */}
        <DesktopLayout>{children}</DesktopLayout>

        <Toaster position="top-right" theme="dark" closeButton richColors />
      </body>
    </html>
  );
}
