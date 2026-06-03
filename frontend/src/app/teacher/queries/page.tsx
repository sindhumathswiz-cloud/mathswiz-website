'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
    Inbox, 
    CheckCircle2, 
    MessageSquare, 
    Search,
    AlertCircle,
    User,
    ArrowRight,
    Send,
    Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';

export default function TeacherQueriesInbox() {
    const [queries, setQueries] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchQueries = async () => {
            try {
                const res = await fetch('/api/teacher/queries');
                const data = await res.json();
                if (data.success) {
                    setQueries(data.queries);
                }
            } catch (err) {
                console.error("Failed to fetch queries", err);
            } finally {
                setLoading(false);
            }
        };
        fetchQueries();
    }, []);

    const [activeQuery, setActiveQuery] = useState<any>(null);
    const [replyText, setReplyText] = useState('');
    const [sendingReply, setSendingReply] = useState(false);
    const threadRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (threadRef.current) {
            threadRef.current.scrollTop = threadRef.current.scrollHeight;
        }
    }, [activeQuery?.replies?.length]);

    const handleResolve = async (id: string) => {
        try {
            const res = await fetch('/api/teacher/queries', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ queryId: id, status: 'RESOLVED' })
            });
            const data = await res.json();
            if (data.success) {
                setQueries(queries.map(q => q.id === id ? { ...q, status: 'RESOLVED' } : q));
                toast.success("Query marked as Resolved");
                setActiveQuery((prev: any) => prev?.id === id ? { ...prev, status: 'RESOLVED' } : prev);
            } else { toast.error(data.error); }
        } catch { toast.error("Network error"); }
    };

    const handleSendReply = async () => {
        if (!replyText.trim() || !activeQuery) return;
        setSendingReply(true);
        try {
            const res = await fetch(`/api/teacher/queries/${activeQuery.id}/reply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: replyText }),
            });
            const data = await res.json();
            if (data.success) {
                setReplyText('');
                setQueries(queries.map(q => 
                    q.id === activeQuery.id 
                        ? { ...q, replies: [...(q.replies || []), data.reply], status: 'RESOLVED' }
                        : q
                ));
                setActiveQuery((prev: any) => 
                    prev?.id === activeQuery.id 
                        ? { ...prev, replies: [...(prev.replies || []), data.reply], status: 'RESOLVED' }
                        : prev
                );
                toast.success("Reply sent to student");
            } else { toast.error(data.error || "Failed to send reply"); }
        } catch { toast.error("Network error"); } finally {
            setSendingReply(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 p-8 pb-32">
            <div className="max-w-7xl mx-auto space-y-8">
                
                {/* Header */}
                <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 flex items-center justify-between">
                    <div>
                        <h1 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-4">
                            <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600"><Inbox className="w-8 h-8" /></div>
                            Query Inbox
                        </h1>
                        <p className="text-slate-400 font-bold mt-3 ml-1">Resolve escalated doubts from your students.</p>
                    </div>
                    <div className="flex gap-4">
                        <div className="bg-rose-50 text-rose-600 px-6 py-4 rounded-3xl font-black flex items-center gap-2 border border-rose-100">
                            <AlertCircle className="w-5 h-5" />
                            {queries.filter(q => q.status === 'OPEN').length} Open
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left: Inbox List */}
                    <div className="lg:col-span-1 space-y-4">
                        <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-3">
                            <Search className="w-5 h-5 text-slate-400 ml-2" />
                            <input 
                                type="text" 
                                placeholder="Search queries..."
                                className="w-full font-bold outline-none text-slate-900 bg-transparent py-2"
                            />
                        </div>
                        
                        <div className="space-y-3 h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                            {queries.length === 0 ? (
                                <div className="text-center p-8 text-slate-400">
                                    <Inbox className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                    <p className="font-medium">No queries yet</p>
                                </div>
                            ) : queries.map(q => (
                                <button 
                                    key={q.id}
                                    onClick={() => setActiveQuery(q)}
                                    className={`w-full text-left p-6 rounded-[2rem] border-2 transition-all ${activeQuery?.id === q.id ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-slate-100 hover:border-indigo-200 hover:shadow-md hover:shadow-indigo-50 text-slate-900'}`}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className={`w-2 h-2 rounded-full ${q.status === 'OPEN' ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
                                            <span className={`text-[10px] font-black uppercase tracking-widest ${activeQuery?.id === q.id ? 'text-indigo-200' : 'text-slate-400'}`}>{q.status}</span>
                                        </div>
                                        <span className={`text-[10px] font-bold ${activeQuery?.id === q.id ? 'text-indigo-300' : 'text-slate-400'}`}>{new Date(q.createdAt).toLocaleDateString()}</span>
                                    </div>
                                    <h3 className="font-black text-lg mb-1">{q.student?.firstName ? `${q.student.firstName} ${q.student.lastName || ''}` : q.student?.email || 'Unknown'}</h3>
                                    <p className={`text-xs font-bold mb-3 ${activeQuery?.id === q.id ? 'text-indigo-200' : 'text-slate-400'}`}>{q.replies?.length || 0} replies</p>
                                    <p className={`text-sm font-medium line-clamp-2 ${activeQuery?.id === q.id ? 'text-white/90' : 'text-slate-600'}`}>{q.content}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Right: Message Thread */}
                    <div className="lg:col-span-2">
                        <AnimatePresence mode="wait">
                            {activeQuery ? (
                                <motion.div 
                                    key={activeQuery.id}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="bg-white border-2 border-slate-100 rounded-[3rem] h-[670px] shadow-sm flex flex-col"
                                >
                                    <div className="p-8 border-b-2 border-slate-50 flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-14 h-14 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600">
                                                <User className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h2 className="text-2xl font-black text-slate-900">{activeQuery.student?.firstName ? `${activeQuery.student.firstName} ${activeQuery.student.lastName || ''}` : activeQuery.student?.email}</h2>
                                                <p className="text-sm font-bold text-slate-400">Practice Arena Doubt</p>
                                            </div>
                                        </div>
                                        
                                        {activeQuery.status === 'OPEN' && (
                                            <button 
                                                onClick={() => handleResolve(activeQuery.id)}
                                                className="bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white px-6 py-3 rounded-2xl font-black transition-colors flex items-center gap-2"
                                            >
                                                <CheckCircle2 className="w-5 h-5" /> Resolve
                                            </button>
                                        )}
                                    </div>

                                    <div ref={threadRef} className="flex-1 p-8 overflow-y-auto space-y-6 bg-slate-50/50">
                                        <div className="flex items-start gap-4 max-w-2xl">
                                            <div className="w-10 h-10 bg-indigo-100 rounded-full shrink-0 flex items-center justify-center text-indigo-500 font-bold uppercase">
                                                {(activeQuery.student?.firstName || activeQuery.student?.email || '?').charAt(0)}
                                            </div>
                                            <div className="bg-white p-6 rounded-3xl rounded-tl-sm shadow-sm border border-slate-100">
                                                <p className="text-slate-800 font-medium leading-relaxed">{activeQuery.content}</p>
                                                <span className="text-[10px] font-bold text-slate-400 block mt-3">{new Date(activeQuery.createdAt).toLocaleString()}</span>
                                            </div>
                                        </div>
                                        
                                        {(activeQuery.replies || []).map((reply: any) => (
                                            <div key={reply.id} className={`flex items-start gap-4 max-w-2xl ${reply.sender?.role === 'TEACHER' ? 'ml-auto flex-row-reverse' : ''}`}>
                                                <div className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center font-bold ${
                                                    reply.sender?.role === 'TEACHER' 
                                                        ? 'bg-slate-900 text-white' 
                                                        : 'bg-indigo-100 text-indigo-500'
                                                }`}>
                                                    {(reply.sender?.firstName || '?').charAt(0)}
                                                </div>
                                                <div className={`p-6 rounded-3xl shadow-sm border ${
                                                    reply.sender?.role === 'TEACHER' 
                                                        ? 'bg-indigo-600 text-white rounded-tr-sm border-indigo-600' 
                                                        : 'bg-white rounded-tl-sm border-slate-100'
                                                }`}>
                                                    <p className={`font-medium leading-relaxed ${reply.sender?.role === 'TEACHER' ? 'text-white' : 'text-slate-800'}`}>{reply.content}</p>
                                                    {reply.imageUrl && (
                                                        <img src={reply.imageUrl} alt="Attachment" className="mt-3 rounded-lg max-w-xs" />
                                                    )}
                                                    <span className={`text-[10px] font-bold block mt-3 ${reply.sender?.role === 'TEACHER' ? 'text-indigo-300' : 'text-slate-400'}`}>
                                                        {new Date(reply.createdAt).toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {activeQuery.status === 'OPEN' && (
                                        <div className="p-6 border-t-2 border-slate-50 bg-white rounded-b-[3rem]">
                                            <div className="flex items-center gap-4">
                                                <input 
                                                    type="text" 
                                                    value={replyText}
                                                    onChange={e => setReplyText(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && !sendingReply && handleSendReply()}
                                                    placeholder="Type your explanation here... Use $$ for math."
                                                    className="flex-1 bg-slate-50 border-2 border-slate-100 rounded-full px-6 py-4 font-medium text-slate-900 focus:outline-none focus:border-indigo-400 focus:bg-white transition-colors"
                                                />
                                                <button 
                                                    onClick={handleSendReply}
                                                    disabled={sendingReply || !replyText.trim()}
                                                    className="bg-indigo-600 hover:bg-slate-900 text-white p-4 rounded-full shadow-lg transition-transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                                                >
                                                    {sendingReply ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            ) : (
                                <motion.div 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="h-[670px] border-4 border-dashed border-slate-200 rounded-[3rem] flex flex-col items-center justify-center text-center p-12"
                                >
                                    <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                                        <MessageSquare className="w-10 h-10 text-slate-300" />
                                    </div>
                                    <h2 className="text-2xl font-black text-slate-900 mb-2">No Query Selected</h2>
                                    <p className="text-slate-400 font-bold max-w-sm">Select a student's doubt from the left panel to review and respond.</p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    );
}
