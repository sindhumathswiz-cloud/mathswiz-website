'use client';

import React, { useState, useMemo } from 'react';
import { 
    ChevronRight, 
    BookOpen, 
    GraduationCap, 
    Calculator, 
    Layers, 
    Plus, 
    Check, 
    FolderPlus,
    Monitor,
    Atom,
    Globe,
    Edit2,
    Trash2,
    RefreshCw,
    CheckSquare,
    Square
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Folder {
    id: string;
    topicName: string;
    className: string | null;
    subject: string | null;
    parentId?: string | null;
}

interface CascadingFolderSelectorProps {
    folders: Folder[];
    selectedId?: string;
    selectedIds?: string[];
    onSelect?: (id: string) => void;
    onSelectMultiple?: (ids: string[]) => void;
    multiSelect?: boolean;
    onCreateNew?: (data: { topicName: string; className: string; subject: string; parentId?: string }) => Promise<any>;
    onUpdate?: (id: string, data: { topicName: string }) => Promise<any>;
    onDelete?: (id: string) => Promise<any>;
}

const CLASSES = ['Class 11', 'Class 12', 'NDA', 'JEEMains', 'JEEAdvanced', 'NEET'];
const SUBJECTS = [
    { name: 'Mathematics', icon: <Calculator className="w-4 h-4" /> },
    { name: 'Physics', icon: <Atom className="w-4 h-4" /> },
    { name: 'Chemistry', icon: <Atom className="w-4 h-4" /> },
    { name: 'General Studies', icon: <Globe className="w-4 h-4" /> },
];

import { useSWRConfig } from 'swr';

export default function CascadingFolderSelector({ 
    folders, 
    selectedId, 
    selectedIds = [],
    onSelect, 
    onSelectMultiple,
    multiSelect = false,
    onCreateNew,
    onUpdate,
    onDelete 
}: CascadingFolderSelectorProps) {
    const [selClass, setSelClass] = useState<string | null>(null);
    const [selSub, setSelSub] = useState<string | null>(null);
    const [selTopicId, setSelTopicId] = useState<string | null>(null);
    const [isCreatingTopic, setIsCreatingTopic] = useState(false);
    const [isCreatingSubtopic, setIsCreatingSubtopic] = useState(false);
    const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
    const [newTopicName, setNewTopicName] = useState('');

    const { mutate } = useSWRConfig();
    const handleRefreshSync = () => {
        mutate('/api/admin/knowledge-folders');
    };

    const filteredTopics = useMemo(() => {
        if (!selClass || !selSub) return [];
        return folders.filter(f => f.className === selClass && f.subject === selSub && !f.parentId);
    }, [folders, selClass, selSub]);

    const filteredSubtopics = useMemo(() => {
        if (!selTopicId) return [];
        return folders.filter(f => f.parentId === selTopicId);
    }, [folders, selTopicId]);

    const allSelectableIds = useMemo(() => {
        return [...filteredTopics.map(t => t.id), ...filteredSubtopics.map(s => s.id)];
    }, [filteredTopics, filteredSubtopics]);

    const isTopicSelected = (id: string) => {
        if (multiSelect) return selectedIds.includes(id);
        return selectedId === id;
    };

    const toggleTopic = (id: string) => {
        if (multiSelect) {
            const next = selectedIds.includes(id) 
                ? selectedIds.filter(x => x !== id)
                : [...selectedIds, id];
            onSelectMultiple?.(next);
        } else {
            onSelect?.(id);
        }
    };

    const toggleAllTopics = () => {
        if (!multiSelect) return;
        if (selectedIds.length === allSelectableIds.length && allSelectableIds.length > 0) {
            onSelectMultiple?.([]);
        } else {
            onSelectMultiple?.(allSelectableIds);
        }
    };

    const handleCreateTopic = async () => {
        if (!newTopicName.trim() || !selClass || !selSub) return;
        const result = await onCreateNew?.({ topicName: newTopicName, className: selClass, subject: selSub });
        setNewTopicName('');
        setIsCreatingTopic(false);
        if (result?.id) {
            if (multiSelect) {
                onSelectMultiple?.([...selectedIds, result.id]);
            } else {
                onSelect?.(result.id);
            }
            setSelTopicId(result.id);
        }
    };

    const handleCreateSubtopic = async () => {
        if (!newTopicName.trim() || !selTopicId || !selClass || !selSub) return;
        const result = await onCreateNew?.({ 
            topicName: newTopicName, 
            className: selClass, 
            subject: selSub, 
            parentId: selTopicId 
        });
        setNewTopicName('');
        setIsCreatingSubtopic(false);
        if (result?.id) {
            if (multiSelect) {
                onSelectMultiple?.([...selectedIds, result.id]);
            } else {
                onSelect?.(result.id);
            }
        }
    };

    const handleUpdateFolder = async (id: string) => {
        if (!newTopicName.trim()) return;
        await onUpdate?.(id, { topicName: newTopicName });
        setNewTopicName('');
        setEditingFolderId(null);
    };

    const handleDeleteFolder = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm("Are you sure you want to delete this topic and all its contents?")) return;
        await onDelete?.(id);
        if (selTopicId === id) setSelTopicId(null);
        if (multiSelect) {
            onSelectMultiple?.(selectedIds.filter(x => x !== id));
        } else {
            if (selectedId === id) onSelect?.('');
        }
    };

    return (
        <div className="bg-[#0f172a] border border-slate-800 rounded-[2rem] p-6 shadow-2xl space-y-8 flex flex-col relative w-full border-t-indigo-500/20">
            <div className="flex items-center justify-between px-1 mb-2">
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-black text-white uppercase tracking-tighter">Sync State:</span>
                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-800 rounded-lg border border-slate-700">
                        <Layers className="w-3 h-3 text-emerald-400" />
                        <span className="text-[10px] font-black text-white uppercase">{folders.length} Folders</span>
                    </div>
                    {multiSelect && selectedIds.length > 0 && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-600/30 rounded-lg border border-indigo-500/50">
                            <CheckSquare className="w-3 h-3 text-indigo-400" />
                            <span className="text-[10px] font-black text-indigo-300 uppercase">{selectedIds.length} Selected</span>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={handleRefreshSync}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-all border border-slate-700"
                        title="Force Refresh"
                    >
                        <RefreshCw className="w-3 h-3" />
                    </button>
                    <div className="text-[10px] font-black text-indigo-500/50 uppercase tracking-tighter">Topic Explorer v2.4</div>
                </div>
            </div>

            <div className="space-y-8">
                {/* STEP 1: CLASS */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <div className="w-6 h-6 bg-indigo-500/20 rounded-lg flex items-center justify-center text-indigo-400 border border-indigo-500/30">
                            <span className="text-[10px] font-black italic">01</span>
                        </div>
                        <label className="text-xs font-black text-gray-900 dark:text-gray-100 uppercase tracking-widest shadow-sm">Target Class / Goal</label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {CLASSES.map(cls => (
                            <button
                                key={cls}
                                onClick={() => { setSelClass(cls); setSelSub(null); setSelTopicId(null); if (multiSelect) onSelectMultiple?.([]); else onSelect?.(''); }}
                                className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all border ${
                                    selClass === cls 
                                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/40 scale-105' 
                                    : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-white'
                                }`}
                            >
                                {cls}
                            </button>
                        ))}
                    </div>
                </div>

                {/* STEP 2: SUBJECT */}
                <AnimatePresence>
                    {selClass && (
                        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                            <div className="flex items-center gap-2 px-1">
                                <div className="w-6 h-6 bg-purple-500/20 rounded-lg flex items-center justify-center text-purple-400 border border-purple-500/30">
                                    <span className="text-[10px] font-black italic">02</span>
                                </div>
                                <label className="text-xs font-black text-gray-900 dark:text-gray-100 uppercase tracking-widest shadow-sm">Select Subject</label>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {SUBJECTS.map(sub => (
                                    <button
                                        key={sub.name}
                                        onClick={() => { setSelSub(sub.name); setSelTopicId(null); if (multiSelect) onSelectMultiple?.([]); else onSelect?.(''); }}
                                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-[13px] font-bold transition-all border ${
                                            selSub === sub.name 
                                            ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/40' 
                                            : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
                                        }`}
                                    >
                                        {sub.icon}
                                        {sub.name}
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* STEP 3: MAIN TOPIC PICKER */}
                <AnimatePresence>
                    {selSub && (
                        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                            <div className="flex items-center justify-between px-1">
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 bg-emerald-500/20 rounded-lg flex items-center justify-center text-emerald-400 border border-emerald-500/30">
                                        <span className="text-[10px] font-black italic">03</span>
                                    </div>
                                    <label className="text-xs font-black text-gray-900 dark:text-gray-100 uppercase tracking-widest shadow-sm">
                                        Master Topic / Chapter {multiSelect && <span className="text-[9px] text-emerald-400 normal-case">(multi-select)</span>}
                                    </label>
                                </div>
                                <div className="flex items-center gap-3">
                                    {multiSelect && allSelectableIds.length > 0 && (
                                        <button 
                                            onClick={toggleAllTopics}
                                            className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest flex items-center gap-1.5 transition-colors"
                                        >
                                            {selectedIds.length === allSelectableIds.length ? 'Deselect All' : 'Select All'}
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => { setIsCreatingTopic(true); setIsCreatingSubtopic(false); }}
                                        className="text-[10px] font-black text-emerald-400 hover:text-emerald-300 uppercase tracking-widest flex items-center gap-1.5 transition-colors"
                                    >
                                        <Plus className="w-3 h-3" /> New Master
                                    </button>
                                </div>
                            </div>

                            {isCreatingTopic ? (
                                <div className="flex gap-2">
                                    <input 
                                        autoFocus 
                                        value={newTopicName} 
                                        onChange={(e) => setNewTopicName(e.target.value)} 
                                        placeholder="Enter master topic..." 
                                        className="w-full p-3 rounded-md border border-gray-300 bg-white text-gray-900 dark:bg-gray-800 dark:text-white dark:border-gray-600 placeholder-gray-500" 
                                    />
                                    <button onClick={handleCreateTopic} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 rounded-2xl transition-colors"><Check className="w-5 h-5" /></button>
                                    <button onClick={() => setIsCreatingTopic(false)} className="bg-slate-800 hover:bg-slate-700 text-slate-400 px-4 rounded-2xl transition-colors">X</button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {filteredTopics.map(topic => (
                                        <div key={topic.id} className="relative group/item">
                                            {editingFolderId === topic.id ? (
                                                <div className="flex gap-2">
                                                    <input 
                                                        autoFocus 
                                                        value={newTopicName} 
                                                        onChange={(e) => setNewTopicName(e.target.value)} 
                                                        className="w-full p-3 rounded-md border border-gray-300 bg-white text-gray-900 dark:bg-gray-800 dark:text-white dark:border-gray-600 placeholder-gray-500" 
                                                    />
                                                    <button onClick={() => handleUpdateFolder(topic.id)} className="bg-emerald-600 p-3 rounded-xl"><Check className="w-4 h-4 text-white" /></button>
                                                    <button onClick={() => setEditingFolderId(null)} className="bg-slate-800 p-3 rounded-xl text-slate-400">X</button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => { setSelTopicId(topic.id); toggleTopic(topic.id); }}
                                                    className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl text-[13px] font-black transition-all border ${
                                                        isTopicSelected(topic.id) 
                                                        ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-900/40' 
                                                        : 'bg-[#161b22]/50 border-slate-800 text-slate-300 hover:border-slate-600 hover:text-white'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        {multiSelect && (
                                                            isTopicSelected(topic.id) 
                                                                ? <CheckSquare className="w-4 h-4 text-white shrink-0" />
                                                                : <Square className="w-4 h-4 text-slate-500 shrink-0" />
                                                        )}
                                                        <span className="truncate">{topic.topicName}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <div className={`flex items-center gap-1.5 opacity-0 group-hover/item:opacity-100 transition-opacity ${isTopicSelected(topic.id) ? 'text-white' : 'text-slate-300'}`}>
                                                            <Edit2 
                                                                className="w-3.5 h-3.5 hover:text-white transition-colors" 
                                                                onClick={(e) => { e.stopPropagation(); setEditingFolderId(topic.id); setNewTopicName(topic.topicName); }}
                                                            />
                                                            <Trash2 
                                                                className="w-3.5 h-3.5 hover:text-rose-400 transition-colors" 
                                                                onClick={(e) => handleDeleteFolder(e, topic.id)}
                                                            />
                                                        </div>
                                                        {!multiSelect && isTopicSelected(topic.id) && <Check className="w-4 h-4 shrink-0" />}
                                                    </div>
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    {filteredTopics.length === 0 && (
                                        <div className="col-span-2 py-8 text-center border-2 border-dashed border-slate-800/50 rounded-2xl italic text-slate-600 text-[10px] font-black uppercase tracking-widest">
                                            No Master Folders Found for this Subject
                                        </div>
                                    )}
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* STEP 4: SUBTOPIC PICKER */}
                <AnimatePresence>
                    {selTopicId && (
                        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4 pb-8">
                            <div className="flex items-center justify-between px-1">
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 bg-cyan-500/20 rounded-lg flex items-center justify-center text-cyan-400 border border-cyan-500/30">
                                        <span className="text-[10px] font-black italic">04</span>
                                    </div>
                                    <label className="text-xs font-black text-gray-900 dark:text-gray-100 uppercase tracking-widest shadow-sm">
                                        Sub-Topic (Precision) {multiSelect && <span className="text-[9px] text-cyan-400 normal-case">(multi-select)</span>}
                                    </label>
                                </div>
                                <button 
                                    onClick={() => { setIsCreatingSubtopic(true); setIsCreatingTopic(false); }}
                                    className="text-[10px] font-black text-cyan-400 hover:text-cyan-300 uppercase tracking-widest flex items-center gap-1.5 transition-colors"
                                >
                                    <Plus className="w-3 h-3" /> New Sub
                                </button>
                            </div>

                            {isCreatingSubtopic ? (
                                <div className="flex gap-2">
                                    <input 
                                        autoFocus 
                                        value={newTopicName} 
                                        onChange={(e) => setNewTopicName(e.target.value)} 
                                        placeholder="Enter sub-topic name..." 
                                        className="w-full p-3 rounded-md border border-gray-300 bg-white text-gray-900 dark:bg-gray-800 dark:text-white dark:border-gray-600 placeholder-gray-500" 
                                    />
                                    <button onClick={handleCreateSubtopic} className="bg-cyan-600 hover:bg-cyan-500 text-white px-6 rounded-2xl transition-colors"><Check className="w-5 h-5" /></button>
                                    <button onClick={() => setIsCreatingSubtopic(false)} className="bg-slate-800 hover:bg-slate-700 text-slate-400 px-4 rounded-2xl transition-colors">X</button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-8">
                                    {filteredSubtopics.map(subtopic => (
                                        <div key={subtopic.id} className="relative group/item">
                                            {editingFolderId === subtopic.id ? (
                                                <div className="flex gap-2">
                                                    <input 
                                                        autoFocus 
                                                        value={newTopicName} 
                                                        onChange={(e) => setNewTopicName(e.target.value)} 
                                                        className="w-full p-3 rounded-md border border-gray-300 bg-white text-gray-900 dark:bg-gray-800 dark:text-white dark:border-gray-600 placeholder-gray-500" 
                                                    />
                                                    <button onClick={() => handleUpdateFolder(subtopic.id)} className="bg-cyan-600 p-3 rounded-xl"><Check className="w-4 h-4 text-white" /></button>
                                                    <button onClick={() => setEditingFolderId(null)} className="bg-slate-800 p-3 rounded-xl text-slate-400">X</button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => toggleTopic(subtopic.id)}
                                                    className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl text-[13px] font-black transition-all border ${
                                                        isTopicSelected(subtopic.id) 
                                                        ? 'bg-cyan-600 border-cyan-500 text-white shadow-lg shadow-cyan-900/40' 
                                                        : 'bg-[#161b22]/50 border-slate-800 text-slate-300 hover:border-slate-600 hover:text-white'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        {multiSelect && (
                                                            isTopicSelected(subtopic.id) 
                                                                ? <CheckSquare className="w-4 h-4 text-white shrink-0" />
                                                                : <Square className="w-4 h-4 text-slate-500 shrink-0" />
                                                        )}
                                                        <span className="truncate">{subtopic.topicName}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <div className={`flex items-center gap-1.5 opacity-0 group-hover/item:opacity-100 transition-opacity ${isTopicSelected(subtopic.id) ? 'text-white' : 'text-slate-300'}`}>
                                                            <Edit2 
                                                                className="w-3.5 h-3.5 hover:text-white transition-colors" 
                                                                onClick={(e) => { e.stopPropagation(); setEditingFolderId(subtopic.id); setNewTopicName(subtopic.topicName); }}
                                                            />
                                                            <Trash2 
                                                                className="w-3.5 h-3.5 hover:text-rose-400 transition-colors" 
                                                                onClick={(e) => handleDeleteFolder(e, subtopic.id)}
                                                            />
                                                        </div>
                                                        {!multiSelect && isTopicSelected(subtopic.id) && <Check className="w-4 h-4 shrink-0" />}
                                                    </div>
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    {filteredSubtopics.length === 0 && (
                                        <div className="col-span-2 py-4 text-center border-2 border-dashed border-slate-800/50 rounded-2xl text-[10px] font-black text-slate-600 uppercase">
                                            No subtopics yet.
                                        </div>
                                    )}
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
