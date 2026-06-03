'use client';

import React, { useState, useEffect } from 'react';
import { X, Save, Globe, Smartphone, Monitor, ChevronRight, ChevronDown, Plus, Trash2, Image as ImageIcon, Palette, Type, Smartphone as Mobile, Layout as LayoutIcon, MessageCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

interface VisualBlockEditorProps {
    page: any;
    onClose: () => void;
}

export function VisualBlockEditor({ page: initialPage, onClose }: VisualBlockEditorProps) {
    const [page, setPage] = useState(initialPage);
    const [activeSection, setActiveSection] = useState<string | null>('hero');
    const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
    const [isSaving, setIsSaving] = useState(false);

    const handleUpdate = (section: string, data: any) => {
        setPage({
            ...page,
            content: {
                ...page.content,
                [section]: data
            }
        });
    };

    const handleUpdateGlobal = (data: any) => {
        setPage({
            ...page,
            globalSettings: {
                ...page.globalSettings,
                ...data
            }
        });
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch(`/api/admin/site-pages/${page.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: page.content,
                    globalSettings: page.globalSettings,
                    title: page.title
                })
            });
            if (!res.ok) throw new Error("Save failed");
            toast.success("Page published successfully!");
        } catch (err) {
            toast.error("Failed to save changes");
        } finally {
            setIsSaving(false);
        }
    };

    // Live Preview Component (Internal)
    const Preview = () => {
        const { content, globalSettings } = page;
        return (
            <div className={`bg-white h-full overflow-y-auto scrollbar-none transition-all duration-500 mx-auto border-x shadow-2xl ${viewMode === 'mobile' ? 'max-w-[375px]' : 'max-w-full'}`}>
                {/* Visual Navbar Mockup */}
                <nav className="p-6 border-b flex justify-between items-center bg-white sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white text-xs font-black">M</div>
                        <span className="font-extrabold text-gray-900">{globalSettings.instituteName}</span>
                    </div>
                    <div className="hidden md:flex gap-6 text-sm font-bold text-gray-600">
                        <span>Home</span>
                        <span>Courses</span>
                        <span>Contact</span>
                    </div>
                    <button className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-100">{content.hero?.ctaText}</button>
                </nav>

                {/* Hero Section */}
                <header className="p-8 md:p-16 text-center bg-indigo-50/30 relative overflow-hidden">
                    <div className="relative z-10 max-w-2xl mx-auto">
                        {content.hero?.showBadge && (
                            <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-6 inline-block">{content.hero.badgeText}</span>
                        )}
                        <h1 className="text-4xl md:text-6xl font-black text-gray-900 mb-6 leading-tight">{content.hero?.title}</h1>
                        <p className="text-lg text-gray-500 mb-8 font-medium">{content.hero?.subtitle}</p>
                        <div className="flex justify-center gap-4">
                            <button className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-indigo-100 hover:scale-105 transition">{content.hero?.ctaText}</button>
                        </div>
                    </div>
                </header>

                {/* Stats */}
                <div className="p-10 grid grid-cols-3 gap-4 text-center border-y bg-white">
                    {content.stats?.map((s: any, i: number) => (
                        <div key={i}>
                            <p className="text-2xl font-black text-gray-900 leading-none">{s.value}</p>
                            <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 tracking-widest">{s.label}</p>
                        </div>
                    ))}
                </div>

                {/* Features */}
                <div className="p-10 md:p-20 bg-white">
                    <h2 className="text-3xl font-black text-center text-gray-900 mb-12">Learn with the Best</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {content.features?.map((f: any, i: number) => (
                            <div key={i} className="text-center p-8 rounded-3xl bg-gray-50 border border-gray-100">
                                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                                    <LayoutIcon className="w-6 h-6" />
                                </div>
                                <h3 className="font-bold text-gray-900 mb-2">{f.title}</h3>
                                <p className="text-sm text-gray-500 font-medium">{f.description}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Testimonials */}
                <div className="p-10 md:p-20 bg-indigo-900 text-white">
                    <h2 className="text-3xl font-black text-center mb-12">Success Stories</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {content.testimonials?.map((t: any, i: number) => (
                            <div key={i} className="bg-white/10 p-8 rounded-3xl backdrop-blur-sm border border-white/20">
                                <p className="italic text-indigo-100 mb-6">"{t.comment}"</p>
                                <div className="flex items-center gap-4">
                                    <img src={t.avatar} className="w-12 h-12 rounded-full border-2 border-indigo-400" />
                                    <div>
                                        <p className="font-bold">{t.name}</p>
                                        <p className="text-xs text-indigo-300">{t.role}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer Mockup */}
                <footer className="p-8 bg-gray-50 text-center border-t">
                    <p className="text-sm text-gray-400 font-bold">{content.footer?.copyright}</p>
                </footer>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-50 bg-gray-100 flex overflow-hidden">
            {/* Sidebar Editor */}
            <div className="w-96 bg-white border-r flex flex-col shadow-2xl relative z-20">
                <div className="p-6 border-b flex justify-between items-center bg-gray-50/50">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Visual Editor</h2>
                        <p className="text-xs text-indigo-600 font-black uppercase">Live Design Mode</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-none">
                    {/* Global Branding Section */}
                    <div className="border rounded-2xl overflow-hidden bg-gray-50">
                        <button 
                            onClick={() => setActiveSection(activeSection === 'global' ? null : 'global')}
                            className="w-full p-4 flex justify-between items-center bg-white border-b hover:bg-gray-50 transition"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                                    <Palette className="w-4 h-4" />
                                </div>
                                <span className="font-bold text-sm">Global Branding</span>
                            </div>
                            {activeSection === 'global' ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                        <AnimatePresence>
                            {activeSection === 'global' && (
                                <motion.div 
                                    initial={{ height: 0 }} 
                                    animate={{ height: 'auto' }} 
                                    exit={{ height: 0 }}
                                    className="p-4 space-y-4"
                                >
                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Institute Name</label>
                                        <input 
                                            type="text" 
                                            value={page.globalSettings.instituteName} 
                                            onChange={(e) => handleUpdateGlobal({ instituteName: e.target.value })}
                                            className="w-full border p-2 rounded-xl text-sm font-bold bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Support Phone</label>
                                        <input 
                                            type="text" 
                                            value={page.globalSettings.contactPhone} 
                                            onChange={(e) => handleUpdateGlobal({ contactPhone: e.target.value })}
                                            className="w-full border p-2 rounded-xl text-sm font-bold bg-white"
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Hero Section */}
                    <div className="border rounded-2xl overflow-hidden bg-gray-50">
                        <button 
                            onClick={() => setActiveSection(activeSection === 'hero' ? null : 'hero')}
                            className="w-full p-4 flex justify-between items-center bg-white border-b hover:bg-gray-50 transition"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                                    <LayoutIcon className="w-4 h-4" />
                                </div>
                                <span className="font-bold text-sm">Hero Section</span>
                            </div>
                            {activeSection === 'hero' ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                        <AnimatePresence>
                            {activeSection === 'hero' && (
                                <motion.div 
                                    initial={{ height: 0 }} 
                                    animate={{ height: 'auto' }} 
                                    exit={{ height: 0 }}
                                    className="p-4 space-y-4 overflow-hidden"
                                >
                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Main Heading</label>
                                        <textarea 
                                            rows={2} 
                                            value={page.content.hero?.title} 
                                            onChange={(e) => handleUpdate('hero', { ...page.content.hero, title: e.target.value })}
                                            className="w-full border p-2 rounded-xl text-sm font-bold bg-white resize-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Subtitle</label>
                                        <textarea 
                                            rows={3} 
                                            value={page.content.hero?.subtitle} 
                                            onChange={(e) => handleUpdate('hero', { ...page.content.hero, subtitle: e.target.value })}
                                            className="w-full border p-2 rounded-xl text-sm font-medium bg-white resize-none"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">CTA Label</label>
                                            <input 
                                                type="text" 
                                                value={page.content.hero?.ctaText} 
                                                onChange={(e) => handleUpdate('hero', { ...page.content.hero, ctaText: e.target.value })}
                                                className="w-full border p-2 rounded-xl text-sm font-bold bg-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Badge Text</label>
                                            <input 
                                                type="text" 
                                                value={page.content.hero?.badgeText} 
                                                onChange={(e) => handleUpdate('hero', { ...page.content.hero, badgeText: e.target.value })}
                                                className="w-full border p-2 rounded-xl text-sm font-bold bg-white"
                                            />
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Features Section */}
                    <div className="border rounded-2xl overflow-hidden bg-gray-50">
                        <button 
                            onClick={() => setActiveSection(activeSection === 'features' ? null : 'features')}
                            className="w-full p-4 flex justify-between items-center bg-white border-b hover:bg-gray-50 transition"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                                    <Plus className="w-4 h-4" />
                                </div>
                                <span className="font-bold text-sm">Feature Blocks</span>
                            </div>
                            {activeSection === 'features' ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                        <AnimatePresence>
                            {activeSection === 'features' && (
                                <motion.div 
                                    initial={{ height: 0 }} 
                                    animate={{ height: 'auto' }} 
                                    exit={{ height: 0 }}
                                    className="p-4 space-y-6"
                                >
                                    {page.content.features?.map((f: any, i: number) => (
                                        <div key={i} className="bg-white p-3 rounded-xl border relative group">
                                            <button className="absolute -top-2 -right-2 bg-red-100 text-red-600 p-1 rounded-full opacity-0 group-hover:opacity-100 transition"><Trash2 className="w-3" /></button>
                                            <input 
                                                className="w-full font-black text-xs mb-1 focus:outline-none" 
                                                value={f.title} 
                                                onChange={(e) => {
                                                    const newFeat = [...page.content.features];
                                                    newFeat[i].title = e.target.value;
                                                    handleUpdate('features', newFeat);
                                                }}
                                            />
                                            <textarea 
                                                className="w-full text-xs text-gray-500 focus:outline-none resize-none" 
                                                value={f.description} 
                                                rows={2}
                                                onChange={(e) => {
                                                    const newFeat = [...page.content.features];
                                                    newFeat[i].description = e.target.value;
                                                    handleUpdate('features', newFeat);
                                                }}
                                            />
                                        </div>
                                    ))}
                                    <button className="w-full border-2 border-dashed p-3 rounded-xl text-xs font-bold text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition">+ Add Feature</button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                <div className="p-6 border-t bg-gray-50 flex gap-4">
                    <button 
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex-1 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition"
                    >
                        {isSaving ? "Publishing..." : <><Globe className="w-4 h-4" /> Publish Home</>}
                    </button>
                </div>
            </div>

            {/* Preview Toolbar */}
            <div className="flex-1 flex flex-col relative">
                <div className="bg-white border-b h-16 flex items-center justify-center gap-4 relative z-10 shadow-sm">
                    <div className="flex bg-gray-100 p-1 rounded-xl">
                        <button 
                            onClick={() => setViewMode('desktop')}
                            className={`p-2 rounded-lg transition flex items-center gap-2 text-xs font-bold ${viewMode === 'desktop' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            <Monitor className="w-4 h-4" /> Desktop
                        </button>
                        <button 
                            onClick={() => setViewMode('mobile')}
                            className={`p-2 rounded-lg transition flex items-center gap-2 text-xs font-bold ${viewMode === 'mobile' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            <Mobile className="w-4 h-4" /> Mobile
                        </button>
                    </div>
                </div>

                {/* Main Preview Pane */}
                <div className="flex-1 overflow-hidden p-6 md:p-12 bg-[#f8fafc]">
                    <Preview />
                </div>
            </div>
        </div>
    );
}
