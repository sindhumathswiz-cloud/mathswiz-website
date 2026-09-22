import React from 'react';
import ParentTopBar from '@/components/ParentTopBar';

export default function ParentLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-background">
            <ParentTopBar />
            {children}
        </div>
    );
}
