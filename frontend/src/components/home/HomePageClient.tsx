'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Star,
  Zap,
  Sparkles,
  CheckCircle,
  BarChart3,
  Users,
  Video,
  Monitor,
  Layout as LayoutIcon,
  BookOpen
} from 'lucide-react';

interface HomePageClientProps {
  content: any;
  globalSettings?: any;
  isPreview?: boolean;
}

export default function HomePageClient({ content, globalSettings }: HomePageClientProps) {
  const {
    hero = {},
    features = { items: [], title: "Why Choose Us?", style: {} },
    stats = { items: [], style: {} },
    testimonials = { items: [], style: {} },
    faq = { items: [], style: {} },
    footer = { style: {}, contact: {} }
  } = content;

  // Extract from new structure
  const heroStyle = hero.style || {};
  const statsStyle = stats.style || {};
  const featuresStyle = features.style || {};
  const testimonialsStyle = testimonials.style || {};
  const faqStyle = faq.style || {};
  const footerStyle = footer.style || {};

  const [currentTestimonial, setCurrentTestimonial] = useState(0);
  const { theme: currentSystemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!testimonials?.items || testimonials.items.length === 0) return;
    const timer = setInterval(() => {
      setCurrentTestimonial((prev) => (prev + 1) % testimonials.items.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [testimonials?.items?.length]);

  const isDarkMode = mounted && currentSystemTheme === 'dark';

  const primaryColor = globalSettings?.mainColor || '#4f46e5';
  const instituteName = globalSettings?.instituteName || "Sindhu's Mathswiz Classes";

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Target': return <CheckCircle className="w-6 h-6" />;
      case 'Video': return <Video className="w-6 h-6" />;
      case 'BookOpen': return <BookOpen className="w-6 h-6" />;
      case 'Sparkles': return <Sparkles className="w-6 h-6" />;
      case 'Users': return <Users className="w-6 h-6" />;
      default: return <LayoutIcon className="w-6 h-6" />;
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 transition-colors duration-500 overflow-x-hidden text-gray-900 dark:text-gray-100">
        {/* Hero Section */}
        <section 
            id="section-hero"
            className="relative pt-32 pb-24 md:pt-48 md:pb-40 overflow-hidden" 
            style={{ backgroundColor: heroStyle.backgroundColor || '#f5f7ff' }}
        >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 flex flex-col lg:flex-row items-center gap-16">
                <motion.div 
                    initial={{ opacity: 0, x: -30 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex-1 text-center lg:text-left"
                >
                    {hero.badgeText && (
                        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white dark:bg-gray-900 border border-indigo-100 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 font-black text-[10px] uppercase tracking-widest mb-8 shadow-sm">
                            <Sparkles className="w-3 h-3" /> {hero.badgeText}
                        </span>
                    )}
                    <h1 
                        className="text-5xl md:text-7xl font-black leading-[0.95] mb-8 tracking-tighter"
                        style={{ color: heroStyle.titleColor || '#111827', fontSize: heroStyle.titleFontSize || undefined }}
                    >
                        {hero.title}
                    </h1>
                    <p 
                        className="text-lg md:text-xl font-medium mb-10 max-w-2xl mx-auto lg:mx-0"
                        style={{ color: heroStyle.subtitleColor || '#4b5563' }}
                    >
                        {hero.subtitle}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                        <Link 
                            href={hero.ctaLink || "/register"}
                            className="text-white px-10 py-5 rounded-3xl font-black text-lg shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2"
                            style={{ backgroundColor: primaryColor }}
                        >
                            {hero.ctaText} <ArrowRight className="w-5 h-5" />
                        </Link>
                    </div>
                </motion.div>

                <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex-1 relative"
                >
                    <div className="relative z-10 rounded-[3rem] overflow-hidden shadow-2xl border-[12px] border-white dark:border-gray-900 aspect-[4/3]">
                        <img 
                            src={hero.imageUrl || "https://images.unsplash.com/photo-1632516643720-e7f5d7d6eca8?q=80&w=800&auto=format&fit=crop"} 
                            alt="Institute" 
                            className="w-full h-full object-cover"
                        />
                    </div>
                    {/* Decorative blobs */}
                    <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-20" style={{ backgroundColor: primaryColor }} />
                    <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-amber-500/20 rounded-full blur-3xl" />
                </motion.div>
            </div>
        </section>

        {/* Stats Section */}
        {stats?.items?.length > 0 && (
            <section id="section-stats" className="py-20 border-y border-gray-100 dark:border-gray-900" style={{ backgroundColor: statsStyle.backgroundColor || '#ffffff' }}>
                <div className="max-w-7xl mx-auto px-4 grid grid-cols-2 md:grid-cols-3 gap-8">
                    {stats.items.map((stat: any, i: number) => (
                        <div key={i} className="text-center">
                            <h3 className="text-4xl md:text-5xl font-black mb-2" style={{ color: statsStyle.valueColor || primaryColor }}>{stat.value}</h3>
                            <p className="text-xs font-black uppercase tracking-widest" style={{ color: statsStyle.textColor || '#6b7280' }}>{stat.label}</p>
                        </div>
                    ))}
                </div>
            </section>
        )}

        {/* Features Section */}
        {features?.items?.length > 0 && (
            <section id="section-features" className="py-24 md:py-32" style={{ backgroundColor: featuresStyle.backgroundColor || '#f9fafb' }}>
                <div className="max-w-7xl mx-auto px-4">
                    <h2 className="text-3xl md:text-5xl font-black text-center mb-20 tracking-tighter uppercase" style={{ color: featuresStyle.titleColor || '#111827' }}>
                        {features.title}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {features.items.map((feat: any, i: number) => (
                            <div 
                                key={i} 
                                className="p-10 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-xl transition-all group"
                                style={{ backgroundColor: featuresStyle.cardBg || '#ffffff' }}
                            >
                                <div className="w-14 h-14 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 transition">
                                    {getIcon(feat.icon)}
                                </div>
                                <h3 className="text-xl font-bold mb-4" style={{ color: featuresStyle.titleColor || '#111827' }}>{feat.title}</h3>
                                <p className="font-medium leading-relaxed" style={{ color: featuresStyle.descriptionColor || '#6b7280' }}>{feat.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        )}

        {/* Testimonials */}
        {testimonials?.items?.length > 0 && (
            <section id="section-testimonials" className="py-32 overflow-hidden relative" style={{ backgroundColor: testimonialsStyle.backgroundColor || '#111827' }}>
                <div className="absolute top-0 left-0 w-full h-full opacity-10">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-white rounded-full blur-[120px]" />
                </div>
                
                <div className="max-w-4xl mx-auto px-4 relative z-10 text-center">
                    <h2 className="text-3xl font-black mb-20 uppercase tracking-widest text-indigo-300">Student Success Stories</h2>
                    
                    <div className="relative min-h-[400px]">
                        <AnimatePresence mode="wait">
                            <motion.div 
                                key={currentTestimonial}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="bg-white/10 dark:bg-gray-900/50 backdrop-blur-md p-10 md:p-16 rounded-[3rem] border border-white/20 dark:border-gray-800"
                            >
                                <img 
                                    src={testimonials.items[currentTestimonial].avatar} 
                                    className="w-20 h-20 rounded-full mx-auto mb-8 border-4 border-indigo-400 shadow-xl"
                                    alt="Student"
                                />
                                <p className="text-2xl md:text-3xl font-medium italic leading-relaxed mb-10 text-white">
                                    "{testimonials.items[currentTestimonial].comment}"
                                </p>
                                <div className="space-y-1">
                                    <p className="text-xl font-black uppercase tracking-tighter text-white">{testimonials.items[currentTestimonial].name}</p>
                                    <p className="text-indigo-400 font-bold text-sm">{testimonials.items[currentTestimonial].role}</p>
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </section>
        )}

        {/* FAQ Section */}
        {faq?.items?.length > 0 && (
            <section id="section-faq" className="py-24 bg-white dark:bg-gray-950" style={{ backgroundColor: faqStyle.backgroundColor || '#ffffff' }}>
                <div className="max-w-3xl mx-auto px-4">
                    <h2 className="text-3xl font-black text-center text-gray-900 dark:text-white mb-16 uppercase">Frequently Asked Questions</h2>
                    <div className="space-y-6">
                        {faq.items.map((item: any, i: number) => (
                            <div key={i} className="border-b dark:border-gray-800 pb-6">
                                <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{item.question}</h4>
                                <p className="text-gray-500 dark:text-gray-400 font-medium">{item.answer}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        )}

        {/* Global Footer CTA */}
        <section className="py-20" style={{ backgroundColor: primaryColor }}>
            <div className="max-w-7xl mx-auto px-4 text-center">
                <h2 className="text-3xl md:text-5xl font-black text-white mb-10 tracking-tight">Ready to Master Mathematic Concepts?</h2>
                <Link href="/register" className="inline-block bg-white text-indigo-600 px-12 py-5 rounded-3xl font-black text-xl hover:scale-105 active:scale-95 transition shadow-2xl" style={{ color: primaryColor }}>
                    Join Today
                </Link>
            </div>
        </section>

        {/* Final Branding Footer */}
        <footer id="section-footer" className="py-12 px-6 border-t border-gray-100 dark:border-gray-900" style={{ backgroundColor: footerStyle.backgroundColor || '#111827', color: footerStyle.textColor || '#ffffff' }}>
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start gap-12">
                <div className="max-w-md">
                    <h2 className="text-2xl font-black mb-4 tracking-tighter">{instituteName}</h2>
                    <p className="text-sm opacity-60 leading-relaxed mb-6">{footer.about}</p>
                    <div className="flex gap-4">
                        {/* Icons could go here */}
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-12">
                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40">Contact Us</h4>
                        <ul className="text-sm font-medium space-y-2 opacity-80">
                            <li>{footer.contact?.address}</li>
                            <li>{footer.contact?.phone}</li>
                            <li>{footer.contact?.email}</li>
                        </ul>
                    </div>
                    <div className="space-y-4">
                         <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40">Quick Links</h4>
                         <ul className="text-sm font-medium space-y-2 opacity-80">
                            <li><Link href="/exams">Exams</Link></li>
                            <li><Link href="/courses">Courses</Link></li>
                            <li><Link href="/about">About Us</Link></li>
                         </ul>
                    </div>
                </div>
            </div>
            <div className="max-w-7xl mx-auto mt-12 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 opacity-40 text-[10px] font-black uppercase tracking-widest">
                <p>&copy; {new Date().getFullYear()} {instituteName}. All rights reserved.</p>
                <div className="flex gap-6">
                    <Link href="/privacy">Privacy Policy</Link>
                    <Link href="/terms">Terms of Service</Link>
                </div>
            </div>
        </footer>
    </div>
  );
}
