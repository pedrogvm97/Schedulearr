import type { Metadata } from 'next';
import './globals.css';
import '@/lib/scheduler';
import { Navigation } from '@/components/Navigation';

export const metadata: Metadata = {
  title: 'Arr Scheduler',
  description: 'Intelligent scheduling dashboard for Radarr and Sonarr',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-300 font-sans selection:bg-emerald-500/30">
        <Navigation />

        <main className="py-8 min-h-[calc(100vh-140px)]">
          {children}
        </main>

        <footer className="border-t border-zinc-900 bg-zinc-950 py-6 mt-8">
          <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between text-zinc-500 text-xs">
            <div className="flex items-center gap-4 mb-4 md:mb-0">
              <img src="/author.png" alt="Author" className="w-10 h-10 rounded-full grayscale hover:grayscale-0 transition-all border border-zinc-800" />
              <div>
                <p className="font-medium text-zinc-300">Arr Scheduler is free and unlocked forever.</p>
                <p>If this app saved you time, <a href="https://ko-fi.com/flash4k" target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:text-emerald-400 font-semibold underline underline-offset-2">you can buy me a coffee here!</a> ☕</p>
              </div>
            </div>
            <div>
              &copy; {new Date().getFullYear()} Flash4K
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
