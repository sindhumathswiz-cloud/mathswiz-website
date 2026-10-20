import React, { Suspense } from 'react';
import AdminSidebar from '@/components/AdminSidebar';
import { StagingSiteStrip } from '@/components/admin/ContentRoleNotice';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-background flex">
            <Suspense fallback={<div className="w-72 h-screen border-r border-slate-200 dark:border-white/10 shrink-0 bg-white dark:bg-surface" />}>
                <AdminSidebar />
            </Suspense>
            <main className="flex-1 h-screen overflow-y-auto custom-scrollbar">
                <StagingSiteStrip />
                {children}
            </main>
        </div>
    );
}
