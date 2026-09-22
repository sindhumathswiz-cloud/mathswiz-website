'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
    LayoutDashboard,
    BookOpen,
    ClipboardList,
    FileText,
    BarChart3,
    Star,
    UserCircle,
    CreditCard,
    Sparkles,
    Target,
    ChevronRight,
    LogOut,
    Compass,
    BookX,
    Bookmark,
    Layers,
    Trophy,
    CalendarClock,
    Swords,
    Zap
} from 'lucide-react';
import { signOut } from 'next-auth/react';

interface SidebarItemProps {
    href: string;
    icon: React.ReactNode;
    label: string;
    isActive: boolean;
    badge?: string | number;
}

const SidebarItem = ({ href, icon, label, isActive, badge }: SidebarItemProps) => (
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
        {badge && (
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${isActive ? 'bg-white text-indigo-600' : 'bg-rose-500 text-white'}`}>
                {badge}
            </span>
        )}
        {!badge && isActive && <ChevronRight size={14} className="opacity-50" />}
    </Link>
);

export default function StudentSidebar({ active }: { active?: string }) {
    const pathname = usePathname();
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => setMounted(true), []);

    const menuItems = [
        { href: '/student/dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
        { href: '/student/tests', icon: <ClipboardList size={18} />, label: 'My Tests' },
        { href: '/student/mock-tests', icon: <Trophy size={18} />, label: 'Mock Exams' },
        { href: '/student/leaderboard', icon: <Trophy size={18} />, label: 'Leaderboard' },
        { href: '/student/challenges/class', icon: <Swords size={18} />, label: 'Class Challenge' },
        { href: '/student/practice', icon: <Target size={18} />, label: 'Practice Arena' },
        { href: '/student/materials', icon: <FileText size={18} />, label: 'Study Materials' },
        { href: '/student/performance', icon: <BarChart3 size={18} />, label: 'Performance' },
        { href: '/student/achieve', icon: <Star size={18} />, label: 'Achieve' },
        { href: '/student/payments', icon: <CreditCard size={18} />, label: 'Fee & Payments' },
    ];

    const learningItems = [
        { href: '/student/learning-paths', icon: <Compass size={18} />, label: 'Learning Paths' },
        { href: '/student/mastery', icon: <Target size={18} />, label: 'My Mastery' },
        { href: '/student/mistakes', icon: <BookX size={18} />, label: 'My Mistakes' },
        { href: '/student/bookmarks', icon: <Bookmark size={18} />, label: 'Bookmarks' },
        { href: '/student/flashcards', icon: <Layers size={18} />, label: 'Flashcards' },
        { href: '/student/planner', icon: <CalendarClock size={18} />, label: 'Revision Planner' },
    ];

    const handleLogout = async () => {
        await signOut({ redirect: false });
        // Use relative path to ensure we stay on the current host/port
        window.location.href = '/';
    };

    return (
        <aside className="w-72 bg-white dark:bg-surface border-r border-slate-200 dark:border-white/10 h-screen sticky top-0 flex flex-col shrink-0 overflow-y-auto custom-scrollbar">
            {/* Profile Brief */}
            <div className="p-8">
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 bg-indigo-100 dark:bg-brand/15 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-brand shadow-inner">
                        <UserCircle size={28} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="font-display font-black text-slate-900 dark:text-white leading-none">Student Portal</h2>
                        <span className="font-body text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1 block">Mathswiz Premium</span>
                    </div>
                    <button
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        aria-label="Toggle dark mode"
                        className="p-2 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-400 hover:text-indigo-600 dark:hover:text-brand transition-colors shrink-0"
                    >
                        <Zap className={`w-4 h-4 ${(mounted && theme === 'dark') ? 'text-accent-warm fill-accent-warm' : ''}`} />
                    </button>
                </div>

                {/* Main Navigation */}
                <div className="space-y-2">
                    <p className="font-body text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 ml-4">Command Center</p>
                    {menuItems.map((item) => (
                        <SidebarItem
                            key={item.href}
                            {...item}
                            isActive={pathname === item.href}
                        />
                    ))}
                </div>

                {/* Learning Loop Section */}
                <div className="mt-10 space-y-2">
                    <p className="font-body text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 ml-4">Learning Loop</p>
                    {learningItems.map((item) => (
                        <SidebarItem
                            key={item.href}
                            {...item}
                            isActive={pathname === item.href}
                        />
                    ))}
                </div>

                {/* AI Tools Section */}
                <div className="mt-10 space-y-2">
                    <p className="font-body text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 ml-4">Intelligence</p>
                    <Link
                        href="/student/doubt-buddy"
                        className="flex items-center gap-3 px-4 py-4 rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 dark:from-brand dark:to-brand-violet text-white shadow-xl shadow-indigo-100 dark:shadow-none hover:scale-[1.02] transition-transform group"
                    >
                        <div className="p-2 bg-white/20 rounded-xl">
                            <Sparkles size={18} />
                        </div>
                        <div>
                            <span className="font-display font-black text-sm block">Doubt Buddy AI</span>
                            <span className="font-body text-[9px] font-bold text-indigo-100 uppercase tracking-tighter">Instant Resolution</span>
                        </div>
                    </Link>
                </div>
            </div>

            {/* Bottom Section */}
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
