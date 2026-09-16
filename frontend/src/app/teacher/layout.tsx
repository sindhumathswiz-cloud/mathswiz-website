import React from 'react';
import TeacherSidebar from '@/components/TeacherSidebar';

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-slate-50 flex">
            <TeacherSidebar />
            <main className="flex-1 h-screen overflow-y-auto custom-scrollbar">
                {children}
            </main>
        </div>
    );
}
