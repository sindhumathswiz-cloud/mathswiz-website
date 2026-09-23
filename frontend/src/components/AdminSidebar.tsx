'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
    LayoutDashboard,
    Users,
    Target,
    TrendingUp,
    ClipboardList,
    DollarSign,
    FileSpreadsheet,
    Sparkles,
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
        aria-current={isActive ? 'page' : undefined}
        className={`flex items-center justify-between px-4 py-2.5 rounded-2xl transition-all duration-200 group ${
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
    const searchParams = useSearchParams();
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => setMounted(true), []);

    const onDashboard = pathname === '/admin/dashboard';
    const currentTab = onDashboard ? (searchParams.get('tab') || 'Platform Overview') : null;

    // Sections rendered inside AdminDashboardClient (no dedicated route of their
    // own) are reached via a `tab` query param on /admin/dashboard.
    const dashboardTab = (tab: string) => `/admin/dashboard?tab=${encodeURIComponent(tab)}`;

    const overviewItem = { href: '/admin/dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard', isActive: onDashboard && currentTab === 'Platform Overview' };

    const sectionItems = [
        { href: dashboardTab('User Directory'), icon: <Users size={18} />, label: 'User Directory', tab: 'User Directory' },
        { href: dashboardTab('Lead CRM'), icon: <Target size={18} />, label: 'Lead CRM', tab: 'Lead CRM' },
        { href: dashboardTab('Question Bank'), icon: <TrendingUp size={18} />, label: 'Question Analytics', tab: 'Question Bank' },
        { href: dashboardTab('Test & Exam Engine'), icon: <ClipboardList size={18} />, label: 'Test & Exam Engine', tab: 'Test & Exam Engine' },
        { href: dashboardTab('Fee Management'), icon: <DollarSign size={18} />, label: 'Fee Management', tab: 'Fee Management' },
        { href: dashboardTab('Reports & Export'), icon: <FileSpreadsheet size={18} />, label: 'Reports & Export', tab: 'Reports & Export' },
        { href: dashboardTab('System Features'), icon: <Sparkles size={18} />, label: 'System Features', tab: 'System Features' },
    ].map((item) => ({ ...item, isActive: onDashboard && currentTab === item.tab }));

    const pageItems = [
        { href: '/admin/approvals', icon: <CheckSquare size={18} />, label: 'Approvals' },
        { href: '/admin/question-bank', icon: <BookOpen size={18} />, label: 'Question Bank' },
        { href: '/admin/ingestion', icon: <FileStack size={18} />, label: 'Book Ingestion' },
        { href: '/admin/curriculum', icon: <Library size={18} />, label: 'Curriculum Manager' },
        { href: '/admin/knowledge-base', icon: <Library size={18} />, label: 'Knowledge Base' },
        { href: '/admin/manage-website', icon: <Globe size={18} />, label: 'Manage Website' },
    ].map((item) => ({ ...item, isActive: pathname === item.href }));

    const handleLogout = async () => {
        await signOut({ redirect: false });
        window.location.href = '/';
    };

    return (
        <aside className="w-72 bg-white dark:bg-surface border-r border-slate-200 dark:border-white/10 h-screen sticky top-0 flex flex-col shrink-0 overflow-y-auto custom-scrollbar">
            <div className="p-6">
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-10 h-10 bg-indigo-100 dark:bg-brand/15 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-brand shadow-inner shrink-0">
                        <ShieldCheck size={20} />
                    </div>
                    <span className="font-body text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex-1">Admin</span>
                    <button
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        aria-label="Toggle dark mode"
                        className="p-2 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-400 hover:text-indigo-600 dark:hover:text-brand transition-colors shrink-0"
                    >
                        <Zap className={`w-4 h-4 ${(mounted && theme === 'dark') ? 'text-accent-warm fill-accent-warm' : ''}`} />
                    </button>
                </div>

                <div className="space-y-1.5">
                    <SidebarItem {...overviewItem} />
                </div>

                <div className="mt-8 space-y-1.5">
                    <p className="font-body text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-3 ml-4">Dashboard Sections</p>
                    {sectionItems.map((item) => (
                        <SidebarItem key={item.label} {...item} />
                    ))}
                </div>

                <div className="mt-8 space-y-1.5">
                    <p className="font-body text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-3 ml-4">Admin Pages</p>
                    {pageItems.map((item) => (
                        <SidebarItem key={item.href} {...item} />
                    ))}
                </div>
            </div>

            <div className="mt-auto p-6 border-t border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02]">
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
