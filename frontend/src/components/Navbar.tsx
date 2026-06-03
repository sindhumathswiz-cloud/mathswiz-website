'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { BookOpen, BookText, ChevronDown, GraduationCap, Grid, LineChart, Menu, Calculator, X, Zap } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';
import { Montserrat } from 'next/font/google';
import { useTheme } from 'next-themes';
import toast from 'react-hot-toast';

const montserrat = Montserrat({ subsets: ['latin'], weight: '800' });

export default function Navbar() {
    const { data: session } = useSession();
    const { theme, setTheme } = useTheme();
    const [isOpen, setIsOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const pathname = usePathname();
    const [branding, setBranding] = useState<any>(null);

    useEffect(() => {
        setMounted(true);
        // Fetch home page content for branding
        fetch('/api/site-page/home')
            .then(res => res.json())
            .then(data => {
                // The API returns the whole Page object, including globalSettings
                if (data) setBranding(data);
            })
            .catch(() => { });
    }, []);

    const toggleMenu = () => setIsOpen(!isOpen);

    const handleLogout = async () => {
        await signOut({ redirect: false });
        window.location.href = '/';
    };

    const examDropdown = [
        { label: 'JEE Main & Advanced', path: '/courses/jee' },
        { label: 'NEET / Medical', path: '/courses/neet' },
        { label: 'CBSE Boards (11 & 12)', path: '/courses/cbse' },
        { label: 'NDA / Defence', path: '/courses/nda' },
        { label: 'CUET Entrance', path: '/courses/cuet' },
    ];

    const mainTabs = branding?.navTabs?.filter((t: any) => !t.isHidden) || [
        { label: 'Learn', path: '/student/dashboard', icon: <BookOpen className="w-4 h-4" /> },
        { label: 'Practice', path: '/student/practice', icon: <Calculator className="w-4 h-4" /> },
        { label: 'Test', path: '/student/tests', icon: <BookText className="w-4 h-4" /> },
        { label: 'Achieve', path: '/student/performance', icon: <LineChart className="w-4 h-4" /> },
    ];

    const institutionName = branding?.globalSettings?.instituteName || "Sindhu's Mathswiz";
    const instituteSubtext = branding?.globalSettings?.instituteSubtext || "Classes";
    const logoUrl = branding?.globalSettings?.logoUrl || "/logo.png";
    const navTabs = branding?.content?.navTabs || [
        { label: 'Exams', link: '/exams' },
        { label: 'Learn', link: '/learn' },
        { label: 'Practice', link: '/practice' },
        { label: 'Test', link: '/test' },
        { label: 'Achieve', link: '/achieve' }
    ];

    // HYDRATION & LAYOUT FIX: Hide global navbar on dashboard routes to prevent double headers
    if (pathname?.startsWith('/admin') || pathname?.startsWith('/teacher')) {
        return null;
    }

    return (
        <nav className="bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-50 transition-colors shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-20">

                    {/* Logo & Exams Dropdown */}
                    <div className="flex items-center gap-8">
                        <Link href="/" className="flex items-center gap-3 group">
                        <div className="relative">
                            <img src={logoUrl} alt={institutionName} className="w-12 h-12 rounded-xl object-contain transform group-hover:scale-110 transition-transform" />
                            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white dark:border-gray-950 rounded-full shadow-sm" />
                        </div>
                            <div className="hidden lg:block">
                                <span className={`block text-gray-900 dark:text-white font-black text-xl tracking-tighter leading-none ${montserrat.className}`}>{institutionName.toUpperCase()}</span>
                                <span className="block text-[8px] font-black text-indigo-600 dark:text-indigo-400 tracking-[0.3em] uppercase mt-0.5">{instituteSubtext}</span>
                            </div>
                        </Link>

                        <div className="relative group hidden md:block">
                            <button className="flex items-center gap-1.5 px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 hover:border-indigo-200 transition-all">
                                <Grid className="w-4 h-4 text-indigo-600" />
                                Exams
                                <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:rotate-180 transition-transform" />
                            </button>
                            <div className="absolute top-full pt-2 left-0 w-64 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 translate-y-2 group-hover:translate-y-0 z-50">
                                <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-xl py-3 overflow-hidden">
                                    <div className="px-4 py-2 mb-2 border-b border-gray-50 dark:border-gray-800">
                                        <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Select Your Goal</p>
                                    </div>
                                    {examDropdown.map(item => (
                                        <Link key={item.label} href={item.path} className="block px-4 py-3 text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">{item.label}</Link>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Center Navigation Tabs */}
                    <div className="hidden xl:flex items-center gap-1 bg-gray-50 dark:bg-gray-900 p-1 rounded-2xl border border-gray-100 dark:border-gray-800">
                        {mainTabs.map((tab: any, idx: number) => (
                            <Link
                                key={idx}
                                href={tab.path || tab.link}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${pathname === (tab.path || tab.link)
                                    ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-indigo-100 dark:border-indigo-900/50'
                                    : 'text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400'
                                    }`}
                            >
                                {tab.icon || <Zap className="w-4 h-4" />}
                                {tab.label}
                            </Link>
                        ))}
                    </div>

                    {/* Right Side Buttons */}
                    <div className="hidden md:flex items-center gap-6">
                        <button
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-400 hover:text-indigo-600 hover:bg-white dark:hover:bg-gray-800 border border-transparent hover:border-indigo-100 dark:hover:border-indigo-900 transition-all"
                        >
                            <Zap className={`w-5 h-5 ${(mounted && theme === 'dark') ? 'text-amber-400 fill-amber-400' : ''}`} />
                        </button>

                        {!session ? (
                            <div className="flex items-center gap-4">
                                <Link href="/login" className="text-sm font-bold text-gray-600 dark:text-gray-400 hover:text-indigo-600 transition">Log in</Link>
                                <Link href="/register" className="px-6 py-3 rounded-xl bg-gray-900 dark:bg-white dark:text-gray-900 text-white font-bold text-sm hover:bg-indigo-600 dark:hover:bg-indigo-50 transition shadow-lg shadow-gray-200 dark:shadow-none">Enroll Now</Link>
                            </div>
                        ) : (
                            <div className="flex items-center gap-4">
                                <Link
                                    href={(session?.user as any)?.role === 'ADMIN' ? '/admin/dashboard' : (session?.user as any)?.role === 'TEACHER' ? '/teacher/dashboard' : '/student/dashboard'}
                                    className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl text-sm font-bold border border-indigo-100 dark:border-indigo-900/50 hover:bg-indigo-100 transition"
                                >
                                    My Dashboard
                                </Link>
                                <button onClick={handleLogout} className="text-sm font-bold text-gray-400 hover:text-red-500 transition">Log out</button>
                            </div>
                        )}
                    </div>

                    <div className="md:hidden flex items-center">
                        <button onClick={toggleMenu} className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl">
                            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu */}
            {isOpen && (
                <div className="md:hidden bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800 px-4 py-8 space-y-6 animate-in slide-in-from-top duration-300">
                    <div className="space-y-4">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-2">My Journey</p>
                        {mainTabs.map((tab: any, idx: number) => (
                            <Link
                                key={idx}
                                href={tab.path || tab.link}
                                className="flex items-center gap-4 px-4 py-4 rounded-2xl bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 font-bold active:bg-indigo-50 active:scale-95 transition-all"
                                onClick={() => setIsOpen(false)}
                            >
                                <div className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">{tab.icon || <Zap className="w-4 h-4" />}</div>
                                {tab.label}
                            </Link>
                        ))}
                    </div>

                    <div className="space-y-4 pt-4 border-t border-gray-50 dark:border-gray-800">
                        <div className="flex items-center justify-between px-4 py-2">
                            <span className="text-sm font-bold text-gray-500">Appearance</span>
                            <button
                                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                                className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-400 hover:text-indigo-600 transition-all border border-gray-100 dark:border-gray-800"
                            >
                                <Zap className={`w-5 h-5 ${(mounted && theme === 'dark') ? 'text-amber-400 fill-amber-400' : ''}`} />
                            </button>
                        </div>
                        {!session ? (
                            <div className="grid grid-cols-2 gap-4">
                                <Link href="/login" onClick={() => setIsOpen(false)} className="flex items-center justify-center py-4 rounded-2xl border border-gray-200 dark:border-gray-800 font-bold text-gray-700 dark:text-gray-300">Log in</Link>
                                <Link href="/register" onClick={() => setIsOpen(false)} className="flex items-center justify-center py-4 rounded-2xl bg-indigo-600 font-bold text-white shadow-lg">Join Us</Link>
                            </div>
                        ) : (
                            <button onClick={handleLogout} className="w-full flex items-center justify-center py-4 rounded-2xl border border-red-100 dark:border-red-900/30 text-red-600 font-bold">Log out</button>
                        )}
                    </div>
                </div>
            )}
        </nav>
    );
}

