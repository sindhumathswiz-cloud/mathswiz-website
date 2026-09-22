import React from 'react';
import AdminSidebar from '@/components/AdminSidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-background flex">
            <AdminSidebar />
            <main className="flex-1 h-screen overflow-y-auto custom-scrollbar">
                {children}
            </main>
        </div>
    );
}
