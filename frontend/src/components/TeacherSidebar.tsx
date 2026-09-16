'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
    UserCircle,
    ChevronRight,
    LogOut,
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
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                : 'text-slate-500 hover:bg-slate-50 hover:text-indigo-600'
        }`}
    >
        <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl transition-colors ${isActive ? 'bg-white/20' : 'bg-slate-100 group-hover:bg-indigo-50'}`}>
                {icon}
            </div>
            <span className="font-bold text-sm tracking-tight">{label}</span>
        </div>
        {isActive && <ChevronRight size={14} className="opacity-50" />}
    </Link>
);

export default function TeacherSidebar() {
    const pathname = usePathname();

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
        <aside className="w-72 bg-white border-r border-slate-200 h-screen sticky top-0 flex flex-col shrink-0 overflow-y-auto custom-scrollbar">
            <div className="p-8">
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 shadow-inner">
                        <UserCircle size={28} />
                    </div>
                    <div>
                        <h2 className="font-black text-slate-900 leading-none">Teacher Portal</h2>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 block">Mathswiz Premium</span>
                    </div>
                </div>

                <div className="space-y-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 ml-4">Command Center</p>
                    {menuItems.map((item) => (
                        <SidebarItem key={item.href} {...item} isActive={pathname === item.href} />
                    ))}
                </div>

                <div className="mt-10 space-y-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 ml-4">Class Insights</p>
                    {insightItems.map((item) => (
                        <SidebarItem key={item.href} {...item} isActive={pathname === item.href} />
                    ))}
                </div>

                <div className="mt-10 space-y-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 ml-4">Tools</p>
                    {toolItems.map((item) => (
                        <SidebarItem key={item.href} {...item} isActive={pathname === item.href} />
                    ))}
                </div>
            </div>

            <div className="mt-auto p-8 border-t border-slate-100 bg-slate-50/50">
                <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 px-4 py-3 w-full rounded-2xl text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors font-bold text-sm"
                >
                    <LogOut size={18} />
                    Log Out
                </button>
            </div>
        </aside>
    );
}
