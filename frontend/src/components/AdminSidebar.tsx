'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
    LayoutDashboard,
    CheckSquare,
    BookOpen,
    FileStack,
    Library,
    Globe,
    ShieldCheck,
    LogOut,
    ChevronRight,
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

export default function AdminSidebar() {
    const pathname = usePathname();
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => setMounted(true), []);

    // AdminDashboardClient itself hosts most platform/user/fee/report tabs
    // internally (no routing) -- this sidebar covers /admin/dashboard as the
    // hub plus the handful of admin areas that are genuinely separate routes.
    const menuItems = [
        { href: '/admin/dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
        { href: '/admin/approvals', icon: <CheckSquare size={18} />, label: 'Approvals' },
        { href: '/admin/question-bank', icon: <BookOpen size={18} />, label: 'Question Bank' },
        { href: '/admin/ingestion', icon: <FileStack size={18} />, label: 'Book Ingestion' },
        { href: '/admin/curriculum', icon: <Library size={18} />, label: 'Curriculum Manager' },
    ];

    const toolItems = [
        { href: '/admin/knowledge-base', icon: <Library size={18} />, label: 'Knowledge Base' },
        { href: '/admin/manage-website', icon: <Globe size={18} />, label: 'Manage Website' },
    ];

    const handleLogout = async () => {
        await signOut({ redirect: false });
        window.location.href = '/';
    };

    return (
        <aside className="w-72 bg-white dark:bg-surface border-r border-slate-200 dark:border-white/10 h-screen sticky top-0 flex flex-col shrink-0 overflow-y-auto custom-scrollbar">
            <div className="p-8">
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 bg-indigo-100 dark:bg-brand/15 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-brand shadow-inner">
                        <ShieldCheck size={28} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="font-display font-black text-slate-900 dark:text-white leading-none">Admin Portal</h2>
                        <span className="font-body text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1 block">Mathswiz Control</span>
                    </div>
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
