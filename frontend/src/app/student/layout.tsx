import React from 'react';
import ContentProtector from '@/components/ContentProtector';
import StudentSidebar from '@/components/StudentSidebar';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
    return (
        <ContentProtector>
            <div className="min-h-screen bg-slate-50 flex">
                <StudentSidebar />
                <main className="flex-1 h-screen overflow-y-auto custom-scrollbar">
                    {children}
                </main>
            </div>
        </ContentProtector>
    );
}
