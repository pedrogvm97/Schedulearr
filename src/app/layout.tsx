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
import { PhoneLayout } from '@/components/phone/PhoneLayout';
import { TabletLayout } from '@/components/tablet/TabletLayout';
import { DesktopLayout } from '@/components/desktop/DesktopLayout';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen w-full max-w-full overflow-x-hidden bg-zinc-950 text-zinc-300 font-sans selection:bg-emerald-500/30">
        {/* 100% Dedicated Mobile Phone Layout (<640px) */}
        <PhoneLayout>{children}</PhoneLayout>

        {/* 100% Dedicated Tablet Layout (640px–1023px) */}
        <TabletLayout>{children}</TabletLayout>

        {/* 100% Dedicated Desktop Browser Layout (>=1024px) */}
        <DesktopLayout>{children}</DesktopLayout>

        <Toaster position="top-right" theme="dark" closeButton richColors />
      </body>
    </html>
  );
}
