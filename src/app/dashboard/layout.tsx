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
        const checkOnboarding = async () => {
            // Fast path: if we already verified this session, skip the API call
            const verified = sessionStorage.getItem('onboardingVerified');
            if (verified) {
                setChecking(false);
                return;
            }

            try {
                const res = await fetch('/api/onboarding/status');
                const data = await res.json();

                if (data.onboarded) {
                    // Store project ID and mark as verified for this session
                    if (data.projectId) {
                        localStorage.setItem('currentProjectId', data.projectId);
                    }
                    sessionStorage.setItem('onboardingVerified', 'true');
                    setChecking(false);
                } else {
                    // Not configured — send to onboarding
                    router.replace('/onboarding');
                }
            } catch {
                // On error, let them through rather than blocking
                setChecking(false);
            }
        };

        checkOnboarding();
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
