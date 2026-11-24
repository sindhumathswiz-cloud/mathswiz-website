import React, { Suspense } from 'react';
import ContentProtector from '@/components/ContentProtector';
import StudentSidebar from '@/components/StudentSidebar';
import ResponsiveSidebar from '@/components/ResponsiveSidebar';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
    return (
        <ContentProtector>
            {/* One screen high: the menu beside the page from tablet width up, folded into a top bar on a phone. */}
            <div className="h-screen bg-slate-50 dark:bg-background flex flex-col md:flex-row">
                <ResponsiveSidebar>
                    <Suspense fallback={<div className="w-72 h-screen border-r border-slate-200 dark:border-white/10 shrink-0 bg-white dark:bg-surface" />}>
                        <StudentSidebar />
                    </Suspense>
                </ResponsiveSidebar>
                <main className="relative flex-1 min-h-0 min-w-0 overflow-y-auto custom-scrollbar">
                    {children}
                </main>
            </div>
        </ContentProtector>
    );
}
