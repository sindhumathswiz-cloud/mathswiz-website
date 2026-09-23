'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
    LayoutDashboard,
    Users,
    ClipboardList,
    BookOpen,
    ClipboardCheck,
    Target,
    Flame,
    HeartHandshake,
    Library,
    MessageSquareQuote,
    ChevronRight,
    LogOut,
    Zap,
} from 'lucide-react';
import { signOut } from 'next-auth/react';

interface SidebarItemProps {
    href: string;
    icon: React.ReactNode;
    label: string;
    isActive: boolean;
}

const SidebarItem = ({ href, icon, label, isActive }: SidebarItemProps) => (
    <Link
        href={href}
        className={`flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-200 group ${
            isActive
                ? 'bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet text-white shadow-lg shadow-indigo-200 dark:shadow-none'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-indigo-600 dark:hover:text-brand'
        }`}
    >
        <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl transition-colors ${isActive ? 'bg-white/20' : 'bg-slate-100 dark:bg-white/5 group-hover:bg-indigo-50 dark:group-hover:bg-brand/10'}`}>
                {icon}
            </div>
            <span className="font-body font-bold text-sm tracking-tight">{label}</span>
        </div>
        {isActive && <ChevronRight size={14} className="opacity-50" />}
    </Link>
);

export default function TeacherSidebar() {
    const pathname = usePathname();
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => setMounted(true), []);

    const menuItems = [
        { href: '/teacher/dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
        { href: '/teacher/batch-management', icon: <Users size={18} />, label: 'Batch Management' },
        { href: '/teacher/question-bank', icon: <BookOpen size={18} />, label: 'Question Bank' },
        { href: '/teacher/tests', icon: <ClipboardList size={18} />, label: 'Test Ledger' },
        { href: '/teacher/homework', icon: <ClipboardCheck size={18} />, label: 'Homework Review' },
    ];

    const insightItems = [
        { href: '/teacher/mastery', icon: <Target size={18} />, label: 'Student Mastery' },
        { href: '/teacher/heatmap', icon: <Flame size={18} />, label: 'Class Heatmap' },
        { href: '/teacher/interventions', icon: <HeartHandshake size={18} />, label: 'Interventions' },
    ];

    const toolItems = [
        { href: '/teacher/knowledge-base', icon: <Library size={18} />, label: 'Knowledge Base' },
        { href: '/teacher/queries', icon: <MessageSquareQuote size={18} />, label: 'Student Queries' },
    ];

    const handleLogout = async () => {
        await signOut({ redirect: false });
        window.location.href = '/';
    };

    return (
        <aside className="w-72 bg-white dark:bg-surface border-r border-slate-200 dark:border-white/10 h-screen sticky top-0 flex flex-col shrink-0 overflow-y-auto custom-scrollbar">
            <div className="p-8">
                <div className="flex items-center gap-3 mb-8">
                    <Link href="/" className="flex items-center gap-3 flex-1 min-w-0">
                        <img src="/logo.png" alt="Sindhu's Mathswiz Classes" className="w-10 h-10 rounded-xl object-contain shrink-0" />
                        <div className="flex-1 min-w-0">
                            <h2 className="font-display font-black text-slate-900 dark:text-white leading-none text-sm truncate">Sindhu&apos;s Mathswiz Classes</h2>
                            <span className="font-body text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1 block">Teacher</span>
                        </div>
                    </Link>
                    <button
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        aria-label="Toggle dark mode"
                        className="p-2 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-400 hover:text-indigo-600 dark:hover:text-brand transition-colors shrink-0"
                    >
                        <Zap className={`w-4 h-4 ${(mounted && theme === 'dark') ? 'text-accent-warm fill-accent-warm' : ''}`} />
                    </button>
                </div>

                <div className="space-y-2">
                    <p className="font-body text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 ml-4">Command Center</p>
                    {menuItems.map((item) => (
                        <SidebarItem key={item.href} {...item} isActive={pathname === item.href} />
                    ))}
                </div>

                <div className="mt-10 space-y-2">
                    <p className="font-body text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 ml-4">Class Insights</p>
                    {insightItems.map((item) => (
                        <SidebarItem key={item.href} {...item} isActive={pathname === item.href} />
                    ))}
                </div>

                <div className="mt-10 space-y-2">
                    <p className="font-body text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 ml-4">Tools</p>
                    {toolItems.map((item) => (
                        <SidebarItem key={item.href} {...item} isActive={pathname === item.href} />
                    ))}
                </div>
            </div>

            <div className="mt-auto p-8 border-t border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02]">
                <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 px-4 py-3 w-full rounded-2xl text-slate-500 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 transition-colors font-body font-bold text-sm"
                >
                    <LogOut size={18} />
                    Log Out
                </button>
            </div>
        </aside>
    );
}
