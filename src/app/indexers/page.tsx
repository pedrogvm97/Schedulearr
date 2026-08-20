'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function IndexersPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/profiles?tab=indexers');
    }, [router]);

    return (
        <div className="max-w-[1800px] mx-auto p-8 flex items-center justify-center py-40">
            <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
        </div>
    );
}
