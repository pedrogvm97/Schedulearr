'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function ProfilesRedirectContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    useEffect(() => {
        const tabParam = searchParams.get('tab');
        const targetTab = tabParam === 'indexers' ? 'indexers' : tabParam === 'plex-users' || tabParam === 'users' ? 'users' : 'profiles';
        router.replace(`/downloads?tab=${targetTab}`);
    }, [searchParams, router]);

    return (
        <div className="flex items-center justify-center py-40 gap-3 text-zinc-500 text-sm font-bold">
            <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
            Opening Transfers...
        </div>
    );
}

export default function ProfilesAndIndexersPage() {
    return (
        <Suspense fallback={null}>
            <ProfilesRedirectContent />
        </Suspense>
    );
}
