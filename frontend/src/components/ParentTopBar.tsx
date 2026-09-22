'use client';

import React from 'react';
import { useTheme } from 'next-themes';
import { Zap, LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';

export default function ParentTopBar() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => setMounted(true), []);

    const handleLogout = async () => {
        await signOut({ redirect: false });
        window.location.href = '/';
    };

    return (
        <div className="bg-white dark:bg-surface border-b border-slate-200 dark:border-white/10 sticky top-0 z-30">
            <div className="max-w-7xl mx-auto px-8 h-16 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <img src="/logo.png" alt="Mathswiz" className="w-8 h-8 rounded-lg object-contain" />
                    <span className="font-display font-black text-sm tracking-tight text-slate-900 dark:text-white uppercase">Sindhu&apos;s Mathswiz</span>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        aria-label="Toggle dark mode"
                        className="p-2 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-400 hover:text-indigo-600 dark:hover:text-brand transition-colors"
                    >
                        <Zap className={`w-4 h-4 ${(mounted && theme === 'dark') ? 'text-accent-warm fill-accent-warm' : ''}`} />
                    </button>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 transition-colors font-body font-bold text-sm"
                    >
                        <LogOut size={16} />
                        <span className="hidden sm:inline">Log Out</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
