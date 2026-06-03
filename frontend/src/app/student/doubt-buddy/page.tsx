'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
    Bot, 
    Send, 
    Sparkles, 
    MessageSquare, 
    CheckCircle2, 
    ArrowLeft, 
    UploadCloud, 
    Trash2, 
    Loader2, 
    Brain 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import Link from 'next/link';
import { toast } from 'react-hot-toast';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export default function DoubtBuddyPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>}>
            <DoubtBuddyContent />
        </Suspense>
    );
}

function DoubtBuddyContent() {
    const searchParams = useSearchParams();
    const contextQ = searchParams.get('context');
    const questionId = searchParams.get('id');

    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [view, setView] = useState<'CHAT' | 'UPLOAD'>('UPLOAD');
    const [file, setFile] = useState<File | null>(null);

    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (contextQ) {
            setView('CHAT');
            setMessages([
                { role: 'assistant', content: `Hello! I see you are stuck on this question. How can I help you? I notice there is specific context to address. What part of the problem feels most challenging to you?` }
            ]);
        }
    }, [contextQ]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleFileUpload = async (selectedFile: File) => {
        if (!selectedFile.type.startsWith('image/')) return toast.error("Please upload an image.");
        setFile(selectedFile);
        setIsAnalyzing(true);
        
        try {
            const formData = new FormData();
            formData.append('image', selectedFile);
            
            const res = await fetch('/api/doubts/analyze', { method: 'POST', body: formData });
            const data = await res.json();
            
            if (data.question) {
                setView('CHAT');
                setMessages([
                    { role: 'assistant', content: `I've analyzed your image! I've found this question:\n\n${data.question.markdown_content}\n\nI recommend we walk through it step-by-step. What have you tried so far?` }
                ]);
            } else {
                toast.error("Could not find a question in the image.");
            }
        } catch (err) {
            toast.error("Extraction failed.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleSendMessage = async () => {
        if (!input.trim() || isLoading) return;
        const newMsg: Message = { role: 'user', content: input };
        setMessages(prev => [...prev, newMsg]);
        setInput('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/student/doubt-buddy/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    messages: [...messages, newMsg],
                    questionContext: contextQ || "General math help."
                })
            });
            const data = await res.json();
            if (data.success) {
                setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
            } else {
                toast.error(data.error || "Tutor error.");
            }
        } catch (err) {
            toast.error("Network error.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F8FAFF] dark:bg-slate-950 flex flex-col md:flex-row font-sans">
            {/* Sidebar / Context Panel */}
            <aside className="w-full md:w-80 bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-slate-800 p-8 flex flex-col shrink-0">
                <div className="flex items-center gap-3 mb-10">
                    <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-100 dark:shadow-none">
                        <Bot className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight leading-none">Doubt Buddy</h1>
                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-1 block">AI Tutor v2</span>
                    </div>
                </div>

                <div className="space-y-6 flex-1">
                    {contextQ ? (
                        <div className="animate-in slide-in-from-left-4">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Active Question</h3>
                            <div className="bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800/40 p-6 rounded-3xl text-sm font-bold text-slate-800 dark:text-slate-300">
                                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                    {decodeURIComponent(contextQ)}
                                </ReactMarkdown>
                            </div>
                            <button 
                                onClick={() => { window.history.pushState({}, '', '/student/doubt-buddy'); window.location.reload(); }}
                                className="mt-4 text-xs font-black text-rose-500 hover:text-rose-700 flex items-center gap-1 transition-colors"
                            >
                                <XCircle className="w-3 h-3" /> Clear Context
                            </button>
                        </div>
                    ) : (
                        <div className="p-8 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-[2.5rem] text-center">
                            <UploadCloud className="w-10 h-10 text-slate-300 mx-auto mb-4" />
                            <p className="text-slate-400 text-xs font-bold leading-relaxed">No active question context found. Upload an image to start a new tutor session.</p>
                        </div>
                    )}
                </div>

                <div className="mt-auto pt-8 border-t border-slate-100 dark:border-slate-800">
                    <Link href="/student/practice-arena" className="flex items-center gap-2 text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold transition">
                        <ArrowLeft className="w-4 h-4" />
                        Back to Practice
                    </Link>
                </div>
            </aside>

            {/* Main Interaction Area */}
            <main className="flex-1 flex flex-col relative max-h-screen">
                <AnimatePresence mode="wait">
                    {view === 'UPLOAD' && !contextQ ? (
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex-1 flex flex-col items-center justify-center p-10"
                        >
                            <label className="group w-full max-w-2xl aspect-[16/9] bg-white dark:bg-slate-900 border-4 border-dashed border-slate-100 dark:border-slate-800 rounded-[4rem] flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 hover:bg-white dark:hover:bg-slate-900 transition-all shadow-2xl shadow-indigo-50/50 dark:shadow-none">
                                <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])} />
                                {isAnalyzing ? (
                                    <div className="flex flex-col items-center gap-4">
                                        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
                                        <p className="font-black text-slate-900 dark:text-white">AI is reading the problem...</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center text-center px-10">
                                        <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/30 rounded-[2rem] flex items-center justify-center text-indigo-600 mb-6 group-hover:scale-110 transition-transform">
                                            <UploadCloud className="w-10 h-10" />
                                        </div>
                                        <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-2">Drop your math doubt here</h2>
                                        <p className="text-slate-400 font-bold max-w-xs">Snap a photo of your school worksheet or handwritten notes.</p>
                                    </div>
                                )}
                            </label>
                        </motion.div>
                    ) : (
                        <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex-1 flex flex-col p-6 lg:p-12"
                        >
                            {/* Chat Messages */}
                            <div ref={scrollRef} className="flex-1 space-y-6 overflow-y-auto mb-6 pr-4 custom-scrollbar">
                                {messages.map((m, i) => (
                                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[80%] rounded-[2rem] p-8 shadow-sm ${
                                            m.role === 'user' 
                                                ? 'bg-indigo-600 text-white rounded-br-none' 
                                                : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-100 dark:border-slate-800 rounded-bl-none'
                                        }`}>
                                            <div className="font-medium text-sm lg:text-base leading-relaxed">
                                                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                                    {m.content}
                                                </ReactMarkdown>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {isLoading && (
                                    <div className="flex justify-start">
                                        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] rounded-bl-none border border-slate-100 dark:border-slate-800 flex items-center gap-3">
                                            <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Tutor is thinking...</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Chat Input */}
                            <div className="sticky bottom-0 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-[2.5rem] flex items-center gap-2 shadow-2xl">
                                <input 
                                    onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                                    type="text" 
                                    placeholder="Explain your approach or ask for a hint..."
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    className="flex-1 bg-transparent px-6 py-4 font-bold text-slate-900 dark:text-white focus:outline-none"
                                />
                                <button 
                                    onClick={handleSendMessage}
                                    disabled={!input.trim() || isLoading}
                                    className="w-14 h-14 bg-indigo-600 text-white rounded-[1.5rem] flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg shadow-indigo-100 dark:shadow-none disabled:opacity-50"
                                >
                                    <Send className="w-6 h-6" />
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
}

function XCircle(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  )
}
