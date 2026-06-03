'use client';

import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Plus, Search, Filter, Lock, Unlock, Edit2, Trash2, CheckCircle, Clock, XCircle, Loader2, BookOpen, GraduationCap, FolderTree, Hash } from 'lucide-react';
import toast from 'react-hot-toast';

interface TaxonomyItem {
    id: string;
    name: string;
    type: string;
    parentId: string | null;
    order: number;
    source: string;
    boardType: string | null;
    isApproved: boolean;
    isLocked: boolean;
    isActive: boolean;
    questionCount: number;
    description?: string | null;
    sourceUrl?: string | null;
    children?: TaxonomyItem[];
    _count?: { children: number; questionTags: number };
}

interface CurriculumManagerClientProps {
    initialClasses: TaxonomyItem[];
    pendingCount: number;
}

interface CascadeOption {
    id: string;
    name: string;
    type: string;
    _count?: { questionTags: number };
}

const typeIcons: Record<string, React.ReactNode> = {
    CLASS: <GraduationCap className="w-4 h-4" />,
    SUBJECT: <BookOpen className="w-4 h-4" />,
    TOPIC: <FolderTree className="w-4 h-4" />,
    SUBTOPIC: <Hash className="w-4 h-4" />,
};

const typeColors: Record<string, string> = {
    CLASS: 'bg-indigo-100 text-indigo-700',
    SUBJECT: 'bg-emerald-100 text-emerald-700',
    TOPIC: 'bg-amber-100 text-amber-700',
    SUBTOPIC: 'bg-purple-100 text-purple-700',
};

const boardColors: Record<string, string> = {
    CBSE: 'bg-blue-100 text-blue-700',
    NDA: 'bg-green-100 text-green-700',
    CUET: 'bg-orange-100 text-orange-700',
    JEE_MAIN: 'bg-red-100 text-red-700',
};

const BOARDS = ['CBSE', 'NDA', 'CUET', 'JEE_MAIN'] as const;

export default function CurriculumManagerClient({ initialClasses, pendingCount }: CurriculumManagerClientProps) {
    const [classes, setClasses] = useState<TaxonomyItem[]>(initialClasses);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedBoard, setSelectedBoard] = useState<string>('ALL');
    const [isAdding, setIsAdding] = useState(false);
    const [newTag, setNewTag] = useState({ name: '', type: 'TOPIC', boardType: '' });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [loading, setLoading] = useState(false);

    // Cascade state for granular parent selection
    const [addBoard, setAddBoard] = useState('');
    const [addClass, setAddClass] = useState('');
    const [addSubject, setAddSubject] = useState('');
    const [addTopic, setAddTopic] = useState('');
    const [cascadeClasses, setCascadeClasses] = useState<CascadeOption[]>([]);
    const [cascadeSubjects, setCascadeSubjects] = useState<CascadeOption[]>([]);
    const [cascadeTopics, setCascadeTopics] = useState<CascadeOption[]>([]);
    const [loadingCascade, setLoadingCascade] = useState(false);

    // Fetch classes for cascade
    useEffect(() => {
        if (!addBoard || newTag.type === 'CLASS') {
            setCascadeClasses([]);
            return;
        }
        setLoadingCascade(true);
        setAddClass(''); setAddSubject(''); setAddTopic('');
        fetch(`/api/taxonomy/cascade?board=${addBoard}`)
            .then(r => r.json())
            .then(data => { if (data.classes) setCascadeClasses(data.classes); })
            .catch(() => toast.error('Failed to load classes'))
            .finally(() => setLoadingCascade(false));
    }, [addBoard, newTag.type]);

    // Fetch subjects for cascade
    useEffect(() => {
        if (!addClass || newTag.type === 'SUBJECT' || newTag.type === 'CLASS') {
            setCascadeSubjects([]);
            return;
        }
        setLoadingCascade(true);
        setAddSubject(''); setAddTopic('');
        fetch(`/api/taxonomy/cascade?classId=${addClass}`)
            .then(r => r.json())
            .then(data => { if (data.subjects) setCascadeSubjects(data.subjects); })
            .catch(() => toast.error('Failed to load subjects'))
            .finally(() => setLoadingCascade(false));
    }, [addClass, newTag.type]);

    // Fetch topics for cascade
    useEffect(() => {
        if (!addSubject || newTag.type !== 'SUBTOPIC') {
            setCascadeTopics([]);
            return;
        }
        setLoadingCascade(true);
        setAddTopic('');
        fetch(`/api/taxonomy/cascade?subjectId=${addSubject}`)
            .then(r => r.json())
            .then(data => { if (data.topics) setCascadeTopics(data.topics); })
            .catch(() => toast.error('Failed to load topics'))
            .finally(() => setLoadingCascade(false));
    }, [addSubject, newTag.type]);

    const resetCascade = () => {
        setAddBoard(''); setAddClass(''); setAddSubject(''); setAddTopic('');
        setCascadeClasses([]); setCascadeSubjects([]); setCascadeTopics([]);
    };

    const deriveParentId = (): string | null => {
        switch (newTag.type) {
            case 'CLASS': return null;
            case 'SUBJECT': return addClass || null;
            case 'TOPIC': return addSubject || null;
            case 'SUBTOPIC': return addTopic || addSubject || null;
            default: return null;
        }
    };

    const toggleExpand = (id: string) => {
        const newExpanded = new Set(expandedIds);
        if (newExpanded.has(id)) newExpanded.delete(id);
        else newExpanded.add(id);
        setExpandedIds(newExpanded);
    };

    const handleAddTag = async () => {
        if (!newTag.name.trim()) {
            toast.error('Tag name is required');
            return;
        }

        const parentId = deriveParentId();
        if (newTag.type !== 'CLASS' && !parentId) {
            toast.error('Please select the parent in the hierarchy');
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/taxonomy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newTag.name,
                    type: newTag.type,
                    parentId,
                    boardType: newTag.boardType || null,
                })
            });
            const data = await res.json();

            if (data.success) {
                toast.success('Tag created successfully!');
                setIsAdding(false);
                setNewTag({ name: '', type: 'TOPIC', boardType: '' });
                resetCascade();
                refreshData();
            } else {
                toast.error(data.error || 'Failed to create tag');
            }
        } catch (e: any) {
            toast.error('Error: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddSubtopic = (topicId: string, topicName: string) => {
        setIsAdding(true);
        setNewTag({ name: '', type: 'SUBTOPIC', boardType: '' });
        resetCascade();
        // Pre-fill the cascade from the topic's parent chain
        const parents = findParents(topicId, classes);
        if (parents.board) setAddBoard(parents.board);
        if (parents.classId) setAddClass(parents.classId);
        if (parents.subjectId) setAddSubject(parents.subjectId);
        setAddTopic(topicId);
    };

    const findParents = (topicId: string, items: TaxonomyItem[], board?: string, classId?: string, subjectId?: string): { board?: string; classId?: string; subjectId?: string } => {
        for (const cls of items) {
            if (cls.id === topicId) return { board: cls.boardType || board, classId: cls.id };
            if (cls.children) {
                for (const subj of cls.children) {
                    if (subj.id === topicId) return { board: cls.boardType || board, classId: cls.id, subjectId: subj.id };
                    if (subj.children) {
                        for (const topic of subj.children) {
                            if (topic.id === topicId) return { board: cls.boardType || board, classId: cls.id, subjectId: subj.id };
                        }
                    }
                }
            }
        }
        return {};
    };

    const handleUpdateTag = async (id: string) => {
        if (!editName.trim()) {
            toast.error('Tag name is required');
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`/api/taxonomy/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: editName })
            });
            const data = await res.json();
            if (data.success) {
                toast.success('Tag updated successfully!');
                setEditingId(null);
                refreshData();
            } else {
                toast.error(data.error || 'Failed to update tag');
            }
        } catch (e: any) {
            toast.error('Error: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteTag = async (id: string) => {
        if (!confirm('Are you sure you want to delete this tag? This cannot be undone.')) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/taxonomy/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                toast.success('Tag deleted successfully!');
                refreshData();
            } else {
                toast.error(data.error || 'Failed to delete tag');
            }
        } catch (e: any) {
            toast.error('Error: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const refreshData = async () => {
        try {
            const res = await fetch('/api/taxonomy?type=CLASS');
            const data = await res.json();
            if (data.items) setClasses(data.items);
        } catch (e) {
            console.error('Failed to refresh:', e);
        }
    };

    const filterClasses = (items: TaxonomyItem[]): TaxonomyItem[] => {
        return items.filter(item => {
            const matchesBoard = selectedBoard === 'ALL' || item.boardType === selectedBoard;
            const matchesSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesBoard && matchesSearch;
        }).map(item => ({
            ...item,
            children: item.children ? filterClasses(item.children) : undefined
        }));
    };

    const filteredClasses = filterClasses(classes);

    const renderTree = (items: TaxonomyItem[], level: number = 0) => {
        return items.map(item => {
            const hasChildren = item.children && item.children.length > 0;
            const isExpanded = expandedIds.has(item.id);
            const isTopic = item.type === 'TOPIC';
            const isSubtopic = item.type === 'SUBTOPIC';

            return (
                <div key={item.id} style={{ paddingLeft: level * 20 }}>
                    <div className={`flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg border border-transparent hover:border-gray-200 transition-all ${level === 0 ? 'bg-white mb-2' : ''}`}>
                        <div className="flex items-center gap-3">
                            {hasChildren && (
                                <button onClick={() => toggleExpand(item.id)} className="p-1 hover:bg-gray-200 rounded transition-colors">
                                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </button>
                            )}
                            {!hasChildren && <div className="w-6" />}

                            <div className={`p-1.5 rounded-lg ${typeColors[item.type] || 'bg-gray-100'}`}>
                                {typeIcons[item.type] || <FolderTree className="w-4 h-4" />}
                            </div>

                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-gray-900">{item.name}</span>
                                    {item.isLocked && <Lock className="w-3 h-3 text-gray-400" />}
                                    {item.source === 'OFFICIAL' && (
                                        <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">OFFICIAL</span>
                                    )}
                                    {!item.isApproved && (
                                        <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                            <Clock className="w-3 h-3" /> PENDING
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${typeColors[item.type]}`}>
                                        {item.type}
                                    </span>
                                    {item.boardType && (
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${boardColors[item.boardType]}`}>
                                            {item.boardType}
                                        </span>
                                    )}
                                    {item._count?.questionTags !== undefined && item._count.questionTags > 0 && (
                                        <span className="text-[10px] text-gray-500">
                                            {item._count.questionTags} questions
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {isTopic && !item.isLocked && (
                                <button
                                    onClick={() => handleAddSubtopic(item.id, item.name)}
                                    className="p-1.5 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200"
                                    title="Add Subtopic"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            )}
                            {editingId === item.id ? (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        className="px-3 py-1 border rounded-lg text-sm"
                                        autoFocus
                                    />
                                    <button onClick={() => handleUpdateTag(item.id)} disabled={loading} className="p-1 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200">
                                        <CheckCircle className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => { setEditingId(null); setEditName(''); }} className="p-1 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                                        <XCircle className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {!item.isLocked && (
                                        <>
                                            <button
                                                onClick={() => { setEditingId(item.id); setEditName(item.name); }}
                                                className="p-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                                                title="Edit"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteTag(item.id)}
                                                className="p-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {isExpanded && hasChildren && (
                        <div className="border-l-2 border-gray-200 ml-4">
                            {renderTree(item.children!, level + 1)}
                        </div>
                    )}
                </div>
            );
        });
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Curriculum Manager</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            Manage the hierarchical taxonomy structure for curriculum classification
                        </p>
                    </div>
                    <button
                        onClick={() => { setIsAdding(true); setNewTag({ name: '', type: 'TOPIC', boardType: '' }); resetCascade(); }}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700"
                    >
                        <Plus className="w-4 h-4" /> Add Tag
                    </button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                    {[
                        { label: 'Total Classes', value: classes.length, color: 'indigo' },
                        { label: 'Total Topics', value: classes.reduce((acc, c) => acc + (c.children?.reduce((a, s) => a + (s.children?.length || 0), 0) || 0), 0), color: 'emerald' },
                        { label: 'Approved', value: classes.reduce((acc, c) => acc + 1 + (c.children?.length || 0), 0), color: 'blue' },
                        { label: 'Pending Approval', value: pendingCount, color: 'amber' },
                    ].map((stat, i) => (
                        <div key={i} className={`bg-white p-4 rounded-xl border border-gray-200`}>
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">{stat.label}</p>
                            <p className={`text-2xl font-black text-${stat.color}-600 mt-1`}>{stat.value}</p>
                        </div>
                    ))}
                </div>

                {/* Filters */}
                <div className="bg-white p-4 rounded-xl border border-gray-200 mb-6 flex items-center gap-4">
                    <div className="flex-1">
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search tags..."
                                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>
                    <select
                        value={selectedBoard}
                        onChange={(e) => setSelectedBoard(e.target.value)}
                        className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="ALL">All Boards</option>
                        <option value="CBSE">CBSE</option>
                        <option value="NDA">NDA</option>
                        <option value="CUET">CUET</option>
                        <option value="JEE_MAIN">JEE Main</option>
                    </select>
                </div>

                {/* Add Tag Modal */}
                {isAdding && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
                            <h2 className="text-xl font-bold text-gray-900 mb-4">Add New Tag</h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase">Tag Name</label>
                                    <input
                                        type="text"
                                        value={newTag.name}
                                        onChange={(e) => setNewTag({ ...newTag, name: e.target.value })}
                                        className="w-full px-4 py-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                                        placeholder="Enter tag name..."
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase">Type</label>
                                    <select
                                        value={newTag.type}
                                        onChange={(e) => { setNewTag({ ...newTag, type: e.target.value }); resetCascade(); }}
                                        className="w-full px-4 py-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="CLASS">Class</option>
                                        <option value="SUBJECT">Subject</option>
                                        <option value="TOPIC">Topic</option>
                                        <option value="SUBTOPIC">Subtopic</option>
                                    </select>
                                </div>

                                {/* Board selector for CLASS and SUBJECT */}
                                {(newTag.type === 'CLASS' || newTag.type === 'SUBJECT') && (
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase">Board</label>
                                        <select
                                            value={addBoard}
                                            onChange={(e) => setAddBoard(e.target.value)}
                                            className="w-full px-4 py-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                                        >
                                            <option value="">Select board...</option>
                                            {BOARDS.map(b => (
                                                <option key={b} value={b}>{b.replace('_', ' ')}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Cascade selectors for non-CLASS types */}
                                {(newTag.type !== 'CLASS') && (
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase">
                                            Parent {newTag.type === 'SUBJECT' ? 'Class' : newTag.type === 'TOPIC' ? 'Subject' : 'Topic'}
                                        </label>
                                        {(newTag.type === 'TOPIC' || newTag.type === 'SUBTOPIC') && (
                                            <>
                                                <select
                                                    value={addBoard}
                                                    onChange={(e) => setAddBoard(e.target.value)}
                                                    className="w-full px-4 py-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 mb-2"
                                                >
                                                    <option value="">Select board...</option>
                                                    {BOARDS.map(b => (
                                                        <option key={b} value={b}>{b.replace('_', ' ')}</option>
                                                    ))}
                                                </select>
                                                <select
                                                    value={addClass}
                                                    onChange={(e) => setAddClass(e.target.value)}
                                                    disabled={!addBoard || loadingCascade}
                                                    className="w-full px-4 py-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 mb-2"
                                                >
                                                    <option value="">{loadingCascade ? 'Loading...' : 'Select class...'}</option>
                                                    {cascadeClasses.map(c => (
                                                        <option key={c.id} value={c.id}>{c.name}</option>
                                                    ))}
                                                </select>
                                            </>
                                        )}
                                        {newTag.type === 'SUBTOPIC' && (
                                            <select
                                                value={addSubject}
                                                onChange={(e) => setAddSubject(e.target.value)}
                                                disabled={!addClass || loadingCascade}
                                                className="w-full px-4 py-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 mb-2"
                                            >
                                                <option value="">{loadingCascade ? 'Loading...' : 'Select subject...'}</option>
                                                {cascadeSubjects.map(s => (
                                                    <option key={s.id} value={s.id}>{s.name}</option>
                                                ))}
                                            </select>
                                        )}
                                        {(newTag.type === 'SUBJECT' || newTag.type === 'TOPIC') && (
                                            <select
                                                value={newTag.type === 'SUBJECT' ? addClass : addSubject}
                                                onChange={(e) => newTag.type === 'SUBJECT' ? setAddClass(e.target.value) : setAddSubject(e.target.value)}
                                                disabled={loadingCascade}
                                                className="w-full px-4 py-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                                            >
                                                <option value={newTag.type === 'SUBJECT' ? 'Select class...' : 'Select subject...'}>
                                                    {loadingCascade ? 'Loading...' : newTag.type === 'SUBJECT' ? 'Select class...' : 'Select subject...'}
                                                </option>
                                                {(newTag.type === 'SUBJECT' ? cascadeClasses : cascadeSubjects).map(o => (
                                                    <option key={o.id} value={o.id}>{o.name}</option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                )}

                                {/* Board selector for TOPIC/SUBTOPIC */}
                                {(newTag.type === 'TOPIC' || newTag.type === 'SUBTOPIC') && (
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase">Board (Optional)</label>
                                        <select
                                            value={newTag.boardType}
                                            onChange={(e) => setNewTag({ ...newTag, boardType: e.target.value })}
                                            className="w-full px-4 py-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                                        >
                                            <option value="">Inherit from parent</option>
                                            <option value="CBSE">CBSE</option>
                                            <option value="NDA">NDA</option>
                                            <option value="CUET">CUET</option>
                                            <option value="JEE_MAIN">JEE Main</option>
                                        </select>
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    onClick={() => setIsAdding(false)}
                                    className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg font-bold hover:bg-gray-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddTag}
                                    disabled={loading}
                                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 flex items-center gap-2"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    Create Tag
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tree View */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                    {filteredClasses.length === 0 ? (
                        <div className="text-center py-12">
                            <FolderTree className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <p className="text-gray-500">No curriculum entries found</p>
                            <p className="text-sm text-gray-400">Run the seeding script to populate the curriculum</p>
                        </div>
                    ) : (
                        renderTree(filteredClasses)
                    )}
                </div>
            </div>
        </div>
    );
}
