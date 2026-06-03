'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Calculator, Mail, Phone, MapPin, Facebook, Twitter, Instagram, Youtube } from 'lucide-react';
import { Montserrat } from 'next/font/google';

const montserrat = Montserrat({ subsets: ['latin'], weight: '800' });

export default function Footer() {
    const pathname = usePathname();
    const [branding, setBranding] = useState<any>(null);

    useEffect(() => {
        fetch('/api/site-page/home')
            .then(res => res.json())
            .then(data => {
                if (data?.content) setBranding(data.content);
            })
            .catch(() => { });
    }, []);

    const institutionName = branding?.globalSettings?.instituteName || "Sindhu's Mathswiz";
    const instituteSubtext = branding?.globalSettings?.instituteSubtext || "Classes";
    const logoUrl = branding?.globalSettings?.logoUrl || "/logo.png";
    const footerData = branding?.content?.footer;

    // HYDRATION & LAYOUT FIX: Hide global footer on dashboard routes
    if (pathname?.startsWith('/admin') || pathname?.startsWith('/teacher')) {
        return null;
    }

    const style = footerData?.style || {};

    return (
        <footer
            className="py-16 border-t border-gray-100 dark:border-gray-800 transition-colors"
            style={{
                backgroundColor: style.backgroundColor || undefined,
                color: style.textColor || undefined,
                fontFamily: style.fontFamily || undefined
            }}
        >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-12">

                    {/* Brand & Socials */}
                    <div className="space-y-6">
                        <Link href="/" className="flex items-center gap-3">
                            <img src={logoUrl} alt={institutionName} className="w-12 h-12 rounded-xl object-contain shadow-sm" />
                            <div>
                                <span className={`block font-black text-2xl tracking-tighter leading-none ${montserrat.className}`}>{institutionName.toUpperCase()}</span>
                                <span className="block text-[8px] font-black tracking-[0.3em] text-indigo-600 dark:text-indigo-400 uppercase mt-1">{instituteSubtext}</span>
                            </div>
                        </Link>
                        <p className="text-sm opacity-70 leading-relaxed font-medium">
                            {footerData?.aboutText || "Empowering students with AI-driven insights, flawless mathematics, and expert guidance for CBSE, NDA, and CUET preparations."}
                        </p>
                        <div className="flex space-x-4">
                            {footerData?.socialLinks?.facebook && <a href={footerData.socialLinks.facebook} className="opacity-50 hover:opacity-100 transition"><Facebook className="w-5 h-5" /></a>}
                            {footerData?.socialLinks?.instagram && <a href={footerData.socialLinks.instagram} className="opacity-50 hover:opacity-100 transition"><Instagram className="w-5 h-5" /></a>}
                            {footerData?.socialLinks?.youtube && <a href={footerData.socialLinks.youtube} className="opacity-50 hover:opacity-100 transition"><Youtube className="w-5 h-5" /></a>}
                        </div>
                    </div>

                    {/* Quick Links */}
                    <div>
                        <h3 className="font-black text-xs uppercase tracking-widest mb-6 opacity-40">Quick Links</h3>
                        <ul className="space-y-4">
                            <li><Link href="/" className="text-sm font-bold hover:text-indigo-600 transition">Home</Link></li>
                            <li><Link href="/courses" className="text-sm font-bold hover:text-indigo-600 transition">Courses</Link></li>
                            <li><Link href="/student/dashboard" className="text-sm font-bold hover:text-indigo-600 transition">Student Portal</Link></li>
                            <li><Link href="/teacher/dashboard" className="text-sm font-bold hover:text-indigo-600 transition">Teacher Portal</Link></li>
                        </ul>
                    </div>

                    {/* Resources */}
                    <div>
                        <h3 className="font-black text-xs uppercase tracking-widest mb-6 opacity-40">Resources</h3>
                        <ul className="space-y-4">
                            <li><Link href="/resources/mock-tests" className="text-sm font-bold hover:text-indigo-600 transition">Mock Tests</Link></li>
                            <li><Link href="/resources/pyq" className="text-sm font-bold hover:text-indigo-600 transition">Previous Year Papers</Link></li>
                            <li><Link href="/success" className="text-sm font-bold hover:text-indigo-600 transition">Success Stories</Link></li>
                            <li><Link href="/privacy" className="text-sm font-bold hover:text-indigo-600 transition">Privacy Policy</Link></li>
                        </ul>
                    </div>

                    {/* Contact */}
                    <div>
                        <h3 className="font-black text-xs uppercase tracking-widest mb-6 opacity-40">Contact Us</h3>
                        <ul className="space-y-4">
                            <li className="flex items-start gap-3">
                                <MapPin className="w-5 h-5 text-indigo-600 shrink-0" />
                                <span className="text-sm font-medium opacity-80">{footerData?.contact?.address || "Greenwood Residency, Yapral, Secunderabad, Telangana 500087"}</span>
                            </li>
                            <li className="flex items-center gap-3">
                                <Phone className="w-5 h-5 text-indigo-600 shrink-0" />
                                <span className="text-sm font-medium opacity-80">{footerData?.contact?.phone || "+91 8919057248 / +91 9434289963"}</span>
                            </li>
                            <li className="flex items-center gap-3">
                                <Mail className="w-5 h-5 text-indigo-600 shrink-0" />
                                <span className="text-sm font-medium opacity-80">{footerData?.contact?.email || "sindhu.mathswiz@gmail.com"}</span>
                            </li>
                        </ul>
                    </div>

                </div>

                <div className="border-t border-gray-100 dark:border-gray-800 mt-16 pt-8 flex flex-col md:flex-row justify-between items-center text-[10px] font-black uppercase tracking-[0.2em] opacity-40">
                    <p>&copy; {new Date().getFullYear()} {institutionName}. All rights reserved.</p>
                    <p className="mt-4 md:mt-0 flex items-center gap-2 italic">
                        Powered by Sindhu <Calculator className="w-3.5 h-3.5" />
                    </p>
                </div>
            </div>
        </footer>
    );
}

