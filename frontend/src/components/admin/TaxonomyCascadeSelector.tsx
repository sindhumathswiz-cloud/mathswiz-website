'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
    Layers, 
    Plus, 
    Check, 
    CheckSquare,
    Square,
    RefreshCw,
    GraduationCap,
    BookOpen,
    FolderTree,
    Hash,
    AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

interface TaxonomyItem {
    id: string;
    name: string;
    type: string;
    parentId: string | null;
    boardType: string | null;
    _count?: { questionTags: number };
}

interface TaxonomyCascadeSelectorProps {
    selectedIds: string[];
    onSelectMultiple: (ids: string[]) => void;
    singleSelect?: boolean;
    onSelect?: (id: string) => void;
}

const BOARDS = ['CBSE', 'NDA', 'CUET', 'JEE_MAIN'] as const;

export default function TaxonomyCascadeSelector({ 
    selectedIds, 
    onSelectMultiple,
    singleSelect = false,
    onSelect,
}: TaxonomyCascadeSelectorProps) {
    const [selBoard, setSelBoard] = useState<string>('');
    const [selClassId, setSelClassId] = useState<string>('');
    const [selSubjectId, setSelSubjectId] = useState<string>('');
    const [selTopicId, setSelTopicId] = useState<string>('');

    const [classes, setClasses] = useState<TaxonomyItem[]>([]);
    const [subjects, setSubjects] = useState<TaxonomyItem[]>([]);
    const [topics, setTopics] = useState<TaxonomyItem[]>([]);
    const [subtopics, setSubtopics] = useState<TaxonomyItem[]>([]);

    const [loadingClasses, setLoadingClasses] = useState(false);
    const [loadingSubjects, setLoadingSubjects] = useState(false);
    const [loadingTopics, setLoadingTopics] = useState(false);
    const [loadingSubtopics, setLoadingSubtopics] = useState(false);

    const fetcher = async (url: string) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Fetch failed');
        return res.json();
    };

    // Fetch classes when board changes
    useEffect(() => {
        if (!selBoard) {
            setClasses([]);
            setSelClassId('');
            return;
        }
        setLoadingClasses(true);
        fetcher(`/api/taxonomy/cascade?board=${selBoard}`)
            .then(data => {
                if (data.classes) setClasses(data.classes);
            })
            .catch(() => toast.error('Failed to load classes'))
            .finally(() => setLoadingClasses(false));
    }, [selBoard]);

    // Fetch subjects when class changes
    useEffect(() => {
        if (!selClassId) {
            setSubjects([]);
            setSelSubjectId('');
            return;
        }
        setLoadingSubjects(true);
        fetcher(`/api/taxonomy/cascade?classId=${selClassId}`)
            .then(data => {
                if (data.subjects) setSubjects(data.subjects);
            })
            .catch(() => toast.error('Failed to load subjects'))
            .finally(() => setLoadingSubjects(false));
    }, [selClassId]);

    // Fetch topics when subject changes
    useEffect(() => {
        if (!selSubjectId) {
            setTopics([]);
            setSelTopicId('');
            return;
        }
        setLoadingTopics(true);
        fetcher(`/api/taxonomy/cascade?subjectId=${selSubjectId}`)
            .then(data => {
                if (data.topics) setTopics(data.topics);
            })
            .catch(() => toast.error('Failed to load topics'))
            .finally(() => setLoadingTopics(false));
    }, [selSubjectId]);

    // Fetch subtopics when topic changes
    useEffect(() => {
        if (!selTopicId) {
            setSubtopics([]);
            return;
        }
        setLoadingSubtopics(true);
        fetcher(`/api/taxonomy/cascade?topicId=${selTopicId}`)
            .then(data => {
                if (data.subtopics) setSubtopics(data.subtopics);
            })
            .catch(() => toast.error('Failed to load subtopics'))
            .finally(() => setLoadingSubtopics(false));
    }, [selTopicId]);

    // Reset downstream selections when upstream changes
    useEffect(() => {
        setSelClassId('');
        setSelSubjectId('');
        setSelTopicId('');
        setSubjects([]);
        setTopics([]);
        setSubtopics([]);
    }, [selBoard]);

    useEffect(() => {
        setSelSubjectId('');
        setSelTopicId('');
        setTopics([]);
        setSubtopics([]);
    }, [selClassId]);

    useEffect(() => {
        setSelTopicId('');
        setSubtopics([]);
    }, [selSubjectId]);

    const allSelectableIds = useMemo(() => {
        return [...topics.map(t => t.id), ...subtopics.map(s => s.id)];
    }, [topics, subtopics]);

    const isItemSelected = (id: string) => {
        if (singleSelect) return selectedIds.length === 1 && selectedIds[0] === id;
        return selectedIds.includes(id);
    };

    const toggleItem = (id: string) => {
        if (singleSelect) {
            onSelect?.(id);
            onSelectMultiple([id]);
        } else {
            const next = selectedIds.includes(id)
                ? selectedIds.filter(x => x !== id)
                : [...selectedIds, id];
            onSelectMultiple(next);
        }
    };

    const toggleAll = () => {
        if (selectedIds.length === allSelectableIds.length && allSelectableIds.length > 0) {
            onSelectMultiple(selectedIds.filter(id => !allSelectableIds.includes(id)));
        } else {
            const others = selectedIds.filter(id => !allSelectableIds.includes(id));
            onSelectMultiple([...others, ...allSelectableIds]);
        }
    };

    const handleBoardChange = (board: string) => {
        setSelBoard(board);
    };

    const handleClassSelect = (classId: string) => {
        setSelClassId(classId);
    };

    const handleSubjectSelect = (subjectId: string) => {
        setSelSubjectId(subjectId);
    };

    const handleTopicSelect = (topicId: string) => {
        setSelTopicId(topicId);
    };

    const typeIcon = (type: string) => {
        switch (type) {
            case 'CLASS': return <GraduationCap className="w-4 h-4" />;
            case 'SUBJECT': return <BookOpen className="w-4 h-4" />;
            case 'TOPIC': return <FolderTree className="w-4 h-4" />;
            case 'SUBTOPIC': return <Hash className="w-4 h-4" />;
            default: return null;
        }
    };

    return (
        <div className="bg-[#0f172a] border border-slate-800 rounded-[2rem] p-6 shadow-2xl space-y-8 flex flex-col relative w-full border-t-indigo-500/20">
            {/* Header */}
            <div className="flex items-center justify-between px-1 mb-2">
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-black text-white uppercase tracking-tighter">Curriculum Taxonomy:</span>
                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-800 rounded-lg border border-slate-700">
                        <Layers className="w-3 h-3 text-emerald-400" />
                        <span className="text-[10px] font-black text-white uppercase">{classes.length} Classes</span>
                    </div>
                    {selectedIds.length > 0 && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-600/30 rounded-lg border border-indigo-500/50">
                            <CheckSquare className="w-3 h-3 text-indigo-400" />
                            <span className="text-[10px] font-black text-indigo-300 uppercase">{selectedIds.length} Topics Selected</span>
                        </div>
                    )}
                </div>
                <div className="text-[10px] font-black text-indigo-500/50 uppercase tracking-tighter">Taxonomy Selector v1.0</div>
            </div>

            <div className="space-y-8">
                {/* STEP 1: BOARD */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <div className="w-6 h-6 bg-indigo-500/20 rounded-lg flex items-center justify-center text-indigo-400 border border-indigo-500/30">
                            <span className="text-[10px] font-black italic">01</span>
                        </div>
                        <label className="text-xs font-black text-gray-900 dark:text-gray-100 uppercase tracking-widest shadow-sm">Select Board</label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {BOARDS.map(board => (
                            <button
                                key={board}
                                onClick={() => handleBoardChange(board)}
                                className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all border ${
                                    selBoard === board 
                                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/40 scale-105' 
                                    : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-white'
                                }`}
                            >
                                {board.replace('_', ' ')}
                            </button>
                        ))}
                    </div>
                </div>

                {/* STEP 2: CLASS */}
                <AnimatePresence>
                    {selBoard && (
                        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                            <div className="flex items-center gap-2 px-1">
                                <div className="w-6 h-6 bg-purple-500/20 rounded-lg flex items-center justify-center text-purple-400 border border-purple-500/30">
                                    <span className="text-[10px] font-black italic">02</span>
                                </div>
                                <label className="text-xs font-black text-gray-900 dark:text-gray-100 uppercase tracking-widest shadow-sm">Select Class</label>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {loadingClasses ? (
                                    <span className="text-xs text-slate-500">Loading...</span>
                                ) : classes.length === 0 ? (
                                    <span className="text-xs text-slate-500">No classes found for this board</span>
                                ) : (
                                    classes.map(cls => (
                                        <button
                                            key={cls.id}
                                            onClick={() => handleClassSelect(cls.id)}
                                            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all border flex items-center gap-2 ${
                                                selClassId === cls.id 
                                                ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/40 scale-105' 
                                                : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
                                            }`}
                                        >
                                            {typeIcon(cls.type)}
                                            {cls.name}
                                        </button>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* STEP 3: SUBJECT */}
                <AnimatePresence>
                    {selClassId && (
                        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                            <div className="flex items-center gap-2 px-1">
                                <div className="w-6 h-6 bg-emerald-500/20 rounded-lg flex items-center justify-center text-emerald-400 border border-emerald-500/30">
                                    <span className="text-[10px] font-black italic">03</span>
                                </div>
                                <label className="text-xs font-black text-gray-900 dark:text-gray-100 uppercase tracking-widest shadow-sm">Select Subject</label>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {loadingSubjects ? (
                                    <span className="text-xs text-slate-500 col-span-full">Loading...</span>
                                ) : subjects.length === 0 ? (
                                    <span className="text-xs text-slate-500 col-span-full">No subjects found</span>
                                ) : (
                                    subjects.map(sub => (
                                        <button
                                            key={sub.id}
                                            onClick={() => handleSubjectSelect(sub.id)}
                                            className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-[13px] font-bold transition-all border ${
                                                selSubjectId === sub.id 
                                                ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-900/40' 
                                                : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
                                            }`}
                                        >
                                            {typeIcon(sub.type)}
                                            {sub.name}
                                        </button>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* STEP 4: TOPICS (Multi-select) */}
                <AnimatePresence>
                    {selSubjectId && (
                        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                            <div className="flex items-center justify-between px-1">
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 bg-amber-500/20 rounded-lg flex items-center justify-center text-amber-400 border border-amber-500/30">
                                        <span className="text-[10px] font-black italic">04</span>
                                    </div>
                                    <label className="text-xs font-black text-gray-900 dark:text-gray-100 uppercase tracking-widest shadow-sm">
                                        Select Topics <span className="text-[9px] text-amber-400 normal-case">(multi-select)</span>
                                    </label>
                                </div>
                                {allSelectableIds.length > 0 && !singleSelect && (
                                    <button 
                                        onClick={toggleAll}
                                        className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest flex items-center gap-1.5 transition-colors"
                                    >
                                        {selectedIds.length === allSelectableIds.length ? 'Deselect All' : 'Select All'}
                                    </button>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {loadingTopics ? (
                                    <span className="text-xs text-slate-500 col-span-full">Loading...</span>
                                ) : topics.length === 0 ? (
                                    <div className="col-span-2 py-8 text-center border-2 border-dashed border-slate-800/50 rounded-2xl italic text-slate-600 text-[10px] font-black uppercase tracking-widest">
                                        No Topics Found for this Subject
                                    </div>
                                ) : (
                                    topics.map(topic => (
                                        <button
                                            key={topic.id}
                                            onClick={() => toggleItem(topic.id)}
                                            className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl text-[13px] font-black transition-all border ${
                                                isItemSelected(topic.id) 
                                                ? 'bg-amber-600 border-amber-500 text-white shadow-lg shadow-amber-900/40' 
                                                : 'bg-[#161b22]/50 border-slate-800 text-slate-300 hover:border-slate-600 hover:text-white'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                {singleSelect ? (
                                                    isItemSelected(topic.id) 
                                                        ? <Check className="w-4 h-4 text-white shrink-0" />
                                                        : <div className="w-4 h-4 shrink-0" />
                                                ) : (
                                                    isItemSelected(topic.id) 
                                                        ? <CheckSquare className="w-4 h-4 text-white shrink-0" />
                                                        : <Square className="w-4 h-4 text-slate-500 shrink-0" />
                                                )}
                                                <span className="truncate">{topic.name}</span>
                                            </div>
                                            {topic._count && topic._count.questionTags > 0 && (
                                                <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">{topic._count.questionTags} Qs</span>
                                            )}
                                        </button>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* STEP 5: SUBTOPICS (Multi-select) */}
                <AnimatePresence>
                    {selTopicId && (
                        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4 pb-8">
                            <div className="flex items-center justify-between px-1">
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 bg-cyan-500/20 rounded-lg flex items-center justify-center text-cyan-400 border border-cyan-500/30">
                                        <span className="text-[10px] font-black italic">05</span>
                                    </div>
                                    <label className="text-xs font-black text-gray-900 dark:text-gray-100 uppercase tracking-widest shadow-sm">
                                        Select Sub-Topics <span className="text-[9px] text-cyan-400 normal-case">(multi-select)</span>
                                    </label>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-8">
                                {loadingSubtopics ? (
                                    <span className="text-xs text-slate-500 col-span-full">Loading...</span>
                                ) : subtopics.length === 0 ? (
                                    <div className="col-span-2 py-4 text-center border-2 border-dashed border-slate-800/50 rounded-2xl text-[10px] font-black text-slate-600 uppercase">
                                        No subtopics yet.
                                    </div>
                                ) : (
                                    subtopics.map(subtopic => (
                                        <button
                                            key={subtopic.id}
                                            onClick={() => toggleItem(subtopic.id)}
                                            className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl text-[13px] font-black transition-all border ${
                                                isItemSelected(subtopic.id) 
                                                ? 'bg-cyan-600 border-cyan-500 text-white shadow-lg shadow-cyan-900/40' 
                                                : 'bg-[#161b22]/50 border-slate-800 text-slate-300 hover:border-slate-600 hover:text-white'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                {isItemSelected(subtopic.id) 
                                                    ? <CheckSquare className="w-4 h-4 text-white shrink-0" />
                                                    : <Square className="w-4 h-4 text-slate-500 shrink-0" />
                                                }
                                                <span className="truncate">{subtopic.name}</span>
                                            </div>
                                            {subtopic._count && subtopic._count.questionTags > 0 && (
                                                <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">{subtopic._count.questionTags} Qs</span>
                                            )}
                                        </button>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
