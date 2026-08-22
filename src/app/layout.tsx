import type { Metadata } from 'next';
import './globals.css';
import '@/lib/scheduler';
import { Navigation } from '@/components/Navigation';
import { Toaster } from 'sonner';
import { MusicPlayerProvider } from '@/context/MusicPlayerContext';

export const metadata: Metadata = {
  title: 'Schedulearr',
  description: 'Scheduling dashboard for Radarr and Sonarr',
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
      <head>
        <script src="https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1" async></script>
      </head>
      <body className="min-h-screen w-full max-w-full overflow-x-hidden bg-zinc-950 text-zinc-300 font-sans selection:bg-emerald-500/30 flex flex-col">
        <MusicPlayerProvider>
          <Navigation />

          <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-6 pb-24 sm:pb-6 overflow-x-hidden">
            {children}
          </main>
        </MusicPlayerProvider>

        <Toaster position="top-right" theme="dark" closeButton richColors />
      </body>
    </html>
  );
}
