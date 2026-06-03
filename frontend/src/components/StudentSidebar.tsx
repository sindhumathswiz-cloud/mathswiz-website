'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
    LogOut
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

    const menuItems = [
        { href: '/student/dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
        { href: '/student/tests', icon: <ClipboardList size={18} />, label: 'My Tests' },
        { href: '/student/practice-arena', icon: <Target size={18} />, label: 'Practice Arena' },
        { href: '/student/materials', icon: <FileText size={18} />, label: 'Study Materials' },
        { href: '/student/performance', icon: <BarChart3 size={18} />, label: 'Performance' },
        { href: '/student/achieve', icon: <Star size={18} />, label: 'Achieve' },
        { href: '/student/payments', icon: <CreditCard size={18} />, label: 'Fee & Payments' },
    ];

    const handleLogout = async () => {
        await signOut({ redirect: false });
        // Use relative path to ensure we stay on the current host/port
        window.location.href = '/';
    };

    return (
        <aside className="w-72 bg-white border-r border-slate-200 h-screen sticky top-0 flex flex-col shrink-0 overflow-y-auto custom-scrollbar">
            {/* Profile Brief */}
            <div className="p-8">
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 shadow-inner">
                        <UserCircle size={28} />
                    </div>
                    <div>
                        <h2 className="font-black text-slate-900 leading-none">Student Portal</h2>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 block">Mathswiz Premium</span>
                    </div>
                </div>

                {/* Main Navigation */}
                <div className="space-y-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 ml-4">Command Center</p>
                    {menuItems.map((item) => (
                        <SidebarItem 
                            key={item.href}
                            {...item}
                            isActive={pathname === item.href}
                        />
                    ))}
                </div>

                {/* AI Tools Section */}
                <div className="mt-10 space-y-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 ml-4">Intelligence</p>
                    <Link 
                        href="/student/doubt-buddy"
                        className="flex items-center gap-3 px-4 py-4 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-xl shadow-indigo-100 hover:scale-[1.02] transition-transform group"
                    >
                        <div className="p-2 bg-white/20 rounded-xl">
                            <Sparkles size={18} />
                        </div>
                        <div>
                            <span className="font-black text-sm block">Doubt Buddy AI</span>
                            <span className="text-[9px] font-bold text-indigo-100 uppercase tracking-tighter">Instant Resolution</span>
                        </div>
                    </Link>
                </div>
            </div>

            {/* Bottom Section */}
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
