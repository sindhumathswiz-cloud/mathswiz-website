import React, { Suspense } from 'react';
import ContentProtector from '@/components/ContentProtector';
import StudentSidebar from '@/components/StudentSidebar';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
    return (
        <ContentProtector>
            <div className="min-h-screen bg-slate-50 dark:bg-background flex">
                <Suspense fallback={<div className="w-72 h-screen border-r border-slate-200 dark:border-white/10 shrink-0 bg-white dark:bg-surface" />}>
                    <StudentSidebar />
                </Suspense>
                <main className="flex-1 h-screen overflow-y-auto custom-scrollbar">
                    {children}
                </main>
            </div>
        </ContentProtector>
    );
}
