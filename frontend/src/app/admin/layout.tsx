import React, { Suspense } from 'react';
import AdminSidebar from '@/components/AdminSidebar';
import ResponsiveSidebar from '@/components/ResponsiveSidebar';
import { StagingSiteStrip } from '@/components/admin/ContentRoleNotice';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        // One screen high: the menu beside the page from tablet width up, folded into a top bar on a phone.
        <div className="h-screen bg-slate-50 dark:bg-background flex flex-col md:flex-row">
            <ResponsiveSidebar>
                <Suspense fallback={<div className="w-72 h-screen border-r border-slate-200 dark:border-white/10 shrink-0 bg-white dark:bg-surface" />}>
                    <AdminSidebar />
                </Suspense>
            </ResponsiveSidebar>
            <main className="relative flex-1 min-h-0 min-w-0 overflow-y-auto custom-scrollbar">
                <StagingSiteStrip />
                {children}
            </main>
        </div>
    );
}
