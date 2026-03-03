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

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-300 font-sans selection:bg-emerald-500/30">
        <Navigation />

        <main className="py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
