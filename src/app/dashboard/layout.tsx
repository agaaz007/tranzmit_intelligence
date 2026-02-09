'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { Loader2 } from 'lucide-react';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        // Check if user already completed onboarding this session
        const cameFromOnboarding = sessionStorage.getItem('onboardingComplete');

        if (cameFromOnboarding) {
            // User completed onboarding this session, let them through
            setChecking(false);
            return;
        }

        // Always redirect to onboarding to ask for org ID
        router.replace('/onboarding');
    }, [router]);

    if (checking) {
        return (
            <div className="flex min-h-screen bg-[var(--background)] items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-[var(--background)]">
            <Sidebar />
            <main className="flex-1 overflow-auto">
                {children}
            </main>
        </div>
    );
}
