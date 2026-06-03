"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
    Monitor, 
    Smartphone, 
    Tablet, 
    Save, 
    Plus, 
    Trash2, 
    Image as ImageIcon, 
    Layout, 
    Type, 
    Palette, 
    Globe, 
    ChevronRight, 
    Eye, 
    X, 
    Check, 
    Smartphone as MobileIcon,
    ChevronDown,
    Settings,
    Layers,
    MousePointer2,
    Sparkles,
    Star,
    MessageSquare,
    Facebook,
    Instagram,
    Youtube,
    Mail,
    Phone,
    MapPin,
    ArrowRight,
    Search,
    Clock,
    XCircle,
    Copy,
    ExternalLink,
    ChevronLeft,
    TrendingUp
} from "lucide-react";
import { toast } from "react-hot-toast";
import { SitePage } from "@prisma/client";
import { updateSitePageAction, createSitePageAction, deleteSitePageAction } from "@/lib/actions/site-page";
import HomePageClient from "@/components/home/HomePageClient";

interface ManageWebsiteStudioProps {
    sitePages: SitePage[];
}

export const ManageWebsiteStudio = ({ sitePages: initialPages }: ManageWebsiteStudioProps) => {
    const [sitePages, setSitePages] = useState(initialPages);
    const [isEditingPage, setIsEditingPage] = useState<any>(null);
    const [draftContent, setDraftContent] = useState<any>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [activeAccordion, setActiveAccordion] = useState<string | null>("hero");
    const previewScrollRef = useRef<HTMLDivElement>(null);

    const defaultContentSchema = {
        hero: { isVisible: true, badge: "New", title: "Site Title", subtitle: "Site Subtitle", primaryButton: { text: "Action", link: "#" }, style: { backgroundColor: "#ffffff", titleColor: "#111827", titleFontSize: "48px" } },
        stats: { isVisible: true, items: [], style: { backgroundColor: "#f9fafb" } },
        features: { isVisible: true, title: "Features", items: [], style: { backgroundColor: "#ffffff" } },
        testimonials: { isVisible: true, title: "Testimonials", items: [], style: { backgroundColor: "#f3f4f6" } },
        faq: { isVisible: true, items: [], style: { backgroundColor: "#ffffff" } },
        footer: { isVisible: true, aboutText: "", contact: { address: "", phone: "", email: "" }, socialLinks: { facebook: "", instagram: "", youtube: "" } }
    };

    const defaultGlobalSchema = {
        instituteName: "Sindhu's Mathswiz",
        instituteSubtext: "PLATFORM",
        logoUrl: "/logo.png",
        style: { headerBgColor: "#ffffff", headerTextColor: "#111827", footerBgColor: "#111827", footerTextColor: "#f3f4f6" }
    };

    const defaultGlobalTheme = {
        primaryColor: "#4f46e5",
        enableDarkMode: true,
        fontFamily: "Inter"
    };

    useEffect(() => {
        if (isEditingPage) {
            // Deep merge function to ensure no blank inputs
            const mergeDeep = (target: any, source: any) => {
                let output = Object.assign({}, target);
                if (typeof target === 'object' && target !== null && typeof source === 'object' && source !== null) {
                    Object.keys(source).forEach(key => {
                        if (typeof source[key] === 'object' && source[key] !== null) {
                            if (!(key in target)) Object.assign(output, { [key]: source[key] });
                            else output[key] = mergeDeep(target[key], source[key]);
                        } else {
                            Object.assign(output, { [key]: source[key] });
                        }
                    });
                }
                return output;
            };

            const existingContent = isEditingPage.content || {};
            const existingGlobal = isEditingPage.globalSettings || {};
            
            setDraftContent({
                content: mergeDeep(defaultContentSchema, existingContent),
                global: mergeDeep(defaultGlobalSchema, existingGlobal),
                theme: mergeDeep(defaultGlobalTheme, existingContent.theme || {})
            });
        }
    }, [isEditingPage]);

    const handleOpenEditor = (page: SitePage) => {
        setIsEditingPage(page);
    };

    const handleSave = async () => {
        if (!isEditingPage || !draftContent) return;
        setIsSaving(true);
        try {
            // Include theme back into content for storage
            const contentToSave = { ...draftContent.content, theme: draftContent.theme };
            const res = await updateSitePageAction(isEditingPage.id, contentToSave, draftContent.global);
            if (res.success) {
                toast.success("Changes published to live site!");
                setSitePages(sitePages.map(p => p.id === isEditingPage.id ? (res.page as any) : p));
                setIsEditingPage(null);
            }
        } catch (error) {
            toast.error("Failed to publish changes");
        } finally {
            setIsSaving(false);
        }
    };

    const handleCreatePage = async () => {
        const title = prompt("Enter Page Title:");
        if (!title) return;
        const slug = title.toLowerCase().replace(/\s+/g, '-');
        
        try {
            const res = await createSitePageAction({ title, slug, content: defaultContentSchema });
            if (res.success) {
                setSitePages([res.page as any, ...sitePages]);
                toast.success("Page created!");
            }
        } catch (error) {
            toast.error("Failed to create page");
        }
    };

    // Scroll preview to section when accordion is opened
    useEffect(() => {
        if (activeAccordion && previewScrollRef.current) {
            const targetId = `section-${activeAccordion}`;
            const element = document.getElementById(targetId);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }, [activeAccordion]);

    if (isEditingPage && draftContent) {
        return (
            <div className="fixed inset-0 bg-white z-[100] flex flex-col overflow-hidden animate-in fade-in duration-300">
                {/* Editor Top Bar */}
                <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between shrink-0 shadow-sm">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setIsEditingPage(null)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                            <ChevronLeft className="w-5 h-5 text-gray-500" />
                        </button>
                        <div className="h-8 w-px bg-gray-200 mx-1" />
                        <div>
                            <h2 className="text-sm font-black text-gray-900 tracking-tight leading-none">{isEditingPage.title}</h2>
                            <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mt-1">/{isEditingPage.slug === 'home' ? '' : isEditingPage.slug}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 mr-4">
                            <button className="p-2 bg-white shadow-sm rounded-lg text-indigo-600"><Monitor className="w-4 h-4" /></button>
                            <button className="p-2 text-gray-400 hover:text-gray-600"><Tablet className="w-4 h-4" /></button>
                            <button className="p-2 text-gray-400 hover:text-gray-600"><Smartphone className="w-4 h-4" /></button>
                        </div>
                        <button 
                            onClick={handleSave}
                            disabled={isSaving}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-100 flex items-center gap-2 disabled:opacity-50"
                        >
                            {isSaving ? <Clock className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Publish Live
                        </button>
                    </div>
                </header>

                <div className="flex-1 flex overflow-hidden">
                    {/* Left Sidebar: Controls */}
                    <aside className="w-[420px] bg-gray-50 border-r border-gray-200 overflow-y-auto p-6 space-y-6 custom-scrollbar shrink-0">
                        {/* Section: Global Settings */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Layout className="w-4 h-4 text-indigo-600" />
                                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Global Identity</h3>
                            </div>
                            
                            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-gray-400 uppercase ml-1">Institute Name</label>
                                    <input 
                                        type="text" 
                                        value={draftContent.global.instituteName} 
                                        onChange={(e) => setDraftContent({ ...draftContent, global: { ...draftContent.global, instituteName: e.target.value } })}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-gray-400 uppercase ml-1">Logo URL</label>
                                    <div className="flex gap-3">
                                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center border border-gray-200 overflow-hidden">
                                            {draftContent.global.logoUrl ? <img src={draftContent.global.logoUrl} className="w-full h-full object-contain" /> : <ImageIcon className="w-4 h-4 text-gray-400" />}
                                        </div>
                                        <input 
                                            type="text" 
                                            value={draftContent.global.logoUrl} 
                                            onChange={(e) => setDraftContent({ ...draftContent, global: { ...draftContent.global, logoUrl: e.target.value } })}
                                            className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                                            placeholder="/logo.png"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Section: Block Editor */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Layers className="w-4 h-4 text-indigo-600" />
                                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Page Blocks</h3>
                            </div>

                            {/* Hero Block Accordion */}
                            <EditorAccordion 
                                title="Hero Section" 
                                id="hero" 
                                isActive={activeAccordion === 'hero'} 
                                onClick={() => setActiveAccordion(activeAccordion === 'hero' ? null : 'hero')}
                                icon={Sparkles}
                            >
                                <div className="space-y-4 pt-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-gray-400 uppercase ml-1">Headline</label>
                                        <textarea 
                                            value={draftContent.content.hero.title}
                                            onChange={(e) => setDraftContent({ ...draftContent, content: { ...draftContent.content, hero: { ...draftContent.content.hero, title: e.target.value } } })}
                                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold h-24 resize-none outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-gray-400 uppercase ml-1">Title Color</label>
                                            <div className="flex gap-2">
                                                <input 
                                                    type="color" 
                                                    value={draftContent.content.hero.style.titleColor}
                                                    onChange={(e) => setDraftContent({ ...draftContent, content: { ...draftContent.content, hero: { ...draftContent.content.hero, style: { ...draftContent.content.hero.style, titleColor: e.target.value } } } })}
                                                    className="w-8 h-8 rounded-lg cursor-pointer border border-gray-200"
                                                />
                                                <input type="text" value={draftContent.content.hero.style.titleColor} className="flex-1 text-[10px] font-mono px-2 border rounded-lg" readOnly />
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-gray-400 uppercase ml-1">Title Size</label>
                                            <select 
                                                value={draftContent.content.hero.style.titleFontSize}
                                                onChange={(e) => setDraftContent({ ...draftContent, content: { ...draftContent.content, hero: { ...draftContent.content.hero, style: { ...draftContent.content.hero.style, titleFontSize: e.target.value } } } })}
                                                className="w-full px-2 py-1.5 border rounded-lg text-[10px] font-bold"
                                            >
                                                <option value="32px">Small</option>
                                                <option value="48px">Medium</option>
                                                <option value="64px">Large</option>
                                                <option value="72px">X-Large</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </EditorAccordion>

                            {/* Testimonials Block Accordion */}
                            <EditorAccordion 
                                title="Success Stories" 
                                id="testimonials" 
                                isActive={activeAccordion === 'testimonials'} 
                                onClick={() => setActiveAccordion(activeAccordion === 'testimonials' ? null : 'testimonials')}
                                icon={Star}
                            >
                                <div className="space-y-4 pt-4">
                                    {(draftContent.content.testimonialsBlock.testimonials || []).map((t: any, idx: number) => (
                                        <div key={t.id} className="bg-gray-50 p-4 rounded-2xl border border-gray-200 relative group">
                                            <button 
                                                onClick={() => {
                                                    const news = draftContent.content.testimonialsBlock.testimonials.filter((_: any, i: number) => i !== idx);
                                                    setDraftContent({ ...draftContent, content: { ...draftContent.content, testimonialsBlock: { ...draftContent.content.testimonialsBlock, testimonials: news } } });
                                                }}
                                                className="absolute -top-2 -right-2 bg-white shadow-md border w-6 h-6 rounded-full flex items-center justify-center text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                            <div className="space-y-3">
                                                <input 
                                                    value={t.name}
                                                    onChange={(e) => {
                                                        const news = [...draftContent.content.testimonialsBlock.testimonials];
                                                        news[idx].name = e.target.value;
                                                        setDraftContent({ ...draftContent, content: { ...draftContent.content, testimonialsBlock: { ...draftContent.content.testimonialsBlock, testimonials: news } } });
                                                    }}
                                                    className="w-full bg-transparent border-b border-gray-300 focus:border-indigo-500 outline-none text-xs font-black p-1"
                                                    placeholder="Student Name"
                                                />
                                                <textarea 
                                                    value={t.quote}
                                                    onChange={(e) => {
                                                        const news = [...draftContent.content.testimonialsBlock.testimonials];
                                                        news[idx].quote = e.target.value;
                                                        setDraftContent({ ...draftContent, content: { ...draftContent.content, testimonialsBlock: { ...draftContent.content.testimonialsBlock, testimonials: news } } });
                                                    }}
                                                    className="w-full bg-transparent border-none outline-none text-[11px] font-medium resize-none h-16 leading-relaxed"
                                                    placeholder="Student testimonial..."
                                                />
                                            </div>
                                        </div>
                                    ))}
                                    <button 
                                        onClick={() => {
                                            const news = [...(draftContent.content.testimonialsBlock.testimonials || []), { id: Date.now().toString(), name: "New Student", quote: "", photoUrl: "/boy.png" }];
                                            setDraftContent({ ...draftContent, content: { ...draftContent.content, testimonialsBlock: { ...draftContent.content.testimonialsBlock, testimonials: news } } });
                                        }}
                                        className="w-full py-3 border-2 border-dashed border-gray-300 rounded-2xl text-[10px] font-black text-gray-400 uppercase tracking-widest hover:border-indigo-300 hover:text-indigo-400 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Plus className="w-4 h-4" /> Add Story
                                    </button>
                                </div>
                            </EditorAccordion>

                            {/* Theme Accordion */}
                            <EditorAccordion 
                                title="Global Theme" 
                                id="theme" 
                                isActive={activeAccordion === 'theme'} 
                                onClick={() => setActiveAccordion(activeAccordion === 'theme' ? null : 'theme')}
                                icon={Palette}
                            >
                                <div className="space-y-4 pt-4">
                                     <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border">
                                        <div className="flex items-center gap-3">
                                            <MobileIcon className="w-4 h-4 text-gray-500" />
                                            <span className="text-[10px] font-black text-gray-600 uppercase">Dark Mode Support</span>
                                        </div>
                                        <button 
                                            onClick={() => setDraftContent({ ...draftContent, theme: { ...draftContent.theme, enableDarkMode: !draftContent.theme.enableDarkMode } })}
                                            className={`w-10 h-5 rounded-full transition-colors relative ${draftContent.theme.enableDarkMode ? 'bg-indigo-600' : 'bg-gray-300'}`}
                                        >
                                            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${draftContent.theme.enableDarkMode ? 'right-1' : 'left-1'}`} />
                                        </button>
                                     </div>
                                </div>
                            </EditorAccordion>
                        </div>
                    </aside>

                    {/* Right: Live Preview Iframe Container */}
                    <main className="flex-1 bg-gray-100 flex flex-col relative overflow-hidden">
                        <div className="h-10 bg-gray-200 border-b border-gray-300 flex items-center justify-center gap-4 shrink-0">
                             <div className="bg-white px-8 py-1 rounded-full border border-gray-300 text-[10px] font-black text-gray-400 flex items-center gap-2">
                                <Globe className="w-3 h-3" /> mathswiz.com/{isEditingPage.slug === 'home' ? '' : isEditingPage.slug}
                             </div>
                        </div>

                        <div className="flex-1 overflow-auto p-12 bg-pattern" ref={previewScrollRef}>
                            <div className="mx-auto w-[1024px] bg-white shadow-2xl rounded-[32px] overflow-hidden border-8 border-gray-900 min-h-[800px] relative">
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-6 bg-gray-900 rounded-b-2xl z-20" />
                                <div className="transform origin-top">
                                    <HomePageClient content={draftContent.content} globalSettings={draftContent.global} isPreview={true} />
                                </div>
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-black text-gray-900 tracking-tight">Manage Website</h2>
                    <p className="text-gray-500 font-medium text-sm mt-1">Design, edit, and publish your institution's public-facing pages.</p>
                </div>
                <button 
                    onClick={handleCreatePage}
                    className="bg-gray-900 hover:bg-black text-white px-6 py-3 rounded-2xl text-sm font-black uppercase tracking-widest transition-all shadow-xl shadow-gray-200 flex items-center gap-2"
                >
                    <Plus className="w-5 h-5" /> New Page
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sitePages.map((page) => (
                    <div key={page.id} className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
                        <div className="flex justify-between items-start mb-6">
                            <div className="p-3 bg-indigo-50 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
                                <Globe className="w-6 h-6" />
                            </div>
                            <div className="flex gap-2">
                                <button className="p-2 text-gray-400 hover:text-indigo-600"><Copy className="w-4 h-4" /></button>
                                <button onClick={() => handleDelete(page.id)} className="p-2 text-gray-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        </div>
                        
                        <div className="space-y-1">
                            <h3 className="text-lg font-black text-gray-900">{page.title}</h3>
                            <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest">/{page.slug === 'home' ? '' : page.slug}</p>
                        </div>

                        <div className="mt-8 flex items-center justify-between pt-6 border-t border-gray-100">
                            <div className="flex items-center gap-3">
                                <button className={`w-10 h-5 rounded-full transition-colors relative ${page.isPublished ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${page.isPublished ? 'right-1' : 'left-1'}`} />
                                </button>
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">{page.isPublished ? 'Published' : 'Draft'}</span>
                            </div>
                            <button 
                                onClick={() => handleOpenEditor(page)}
                                className="bg-gray-100 hover:bg-indigo-600 hover:text-white text-gray-900 px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                            >
                                Edit Visuals
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const EditorAccordion = ({ title, icon: Icon, id, isActive, onClick, children }: any) => {
    return (
        <div id={`section-${id}`} className={`bg-white rounded-2xl border transition-all duration-300 overflow-hidden ${isActive ? 'border-indigo-200 shadow-lg shadow-indigo-50' : 'border-gray-200 shadow-sm'}`}>
            <button 
                onClick={onClick}
                className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isActive ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                        <Icon className="w-3.5 h-3.5" />
                    </div>
                    <span className={`text-[11px] font-black uppercase tracking-widest ${isActive ? 'text-gray-900' : 'text-gray-500'}`}>{title}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${isActive ? 'rotate-180' : ''}`} />
            </button>
            {isActive && (
                <div className="px-5 pb-5 border-t border-gray-100">
                    {children}
                </div>
            )}
        </div>
    );
};

const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this page?")) {
        await deleteSitePageAction(id);
        window.location.reload();
    }
};
