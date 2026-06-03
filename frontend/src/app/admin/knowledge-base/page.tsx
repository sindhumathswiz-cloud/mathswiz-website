'use client';

import React, { useState, useEffect } from 'react';
import { 
    Folder, 
    Plus, 
    FileText, 
    Globe, 
    Youtube, 
    Upload, 
    Trash2, 
    ChevronLeft, 
    Sparkles, 
    Loader2, 
    CheckCircle2,
    BookOpen,
    Target,
    Zap,
    X,
    FileCode,
    FileType,
    Edit3
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import Script from 'next/script';

interface KnowledgeFolder {
    id: string;
    topicName: string;
    _count?: { documents: number };
    documents?: KnowledgeDocument[];
    createdAt: string;
}

interface KnowledgeDocument {
    id: string;
    title: string;
    content: string;
    sourceType: string;
    isActive: boolean;
    createdAt: string;
}

export default function KnowledgeBasePage() {
    const [folders, setFolders] = useState<KnowledgeFolder[]>([]);
    const [activeFolder, setActiveFolder] = useState<KnowledgeFolder | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [newTopicName, setNewTopicName] = useState('');
    
    // Upload State
    const [isUploading, setIsUploading] = useState(false);
    const [urlInput, setUrlInput] = useState('');
    const [youtubeInput, setYoutubeInput] = useState('');
    
    // Generation Modal State
    const [isGenModalOpen, setIsGenModalOpen] = useState(false);
    const [genConfig, setGenConfig] = useState({
        count: 5,
        types: ['SINGLE_CHOICE'],
        difficulties: ['MEDIUM']
    });
    const [isGenerating, setIsGenerating] = useState(false);
    const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false);
    const [editingDoc, setEditingDoc] = useState<KnowledgeDocument | null>(null);
    const [isSavingDoc, setIsSavingDoc] = useState(false);
    const [isProcessingRAG, setIsProcessingRAG] = useState(false);
    const [ragChunkCount, setRagChunkCount] = useState<number | null>(null);

    useEffect(() => {
        fetchFolders();
    }, []);

    const fetchFolders = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/admin/knowledge-folders');
            const data = await res.json();
            if (data.success) setFolders(data.folders);
        } catch (err) {
            toast.error("Failed to load folders");
        } finally {
            setIsLoading(false);
        }
    };

    const fetchFolderDetail = async (id: string) => {
        try {
            const res = await fetch(`/api/admin/knowledge-folders/${id}`);
            const data = await res.json();
            if (data.success) {
                setActiveFolder(data.folder);
                // Fetch RAG chunk count
                const ragRes = await fetch(`/api/admin/knowledge-folders/${id}/process-for-rag`);
                const ragData = await ragRes.json();
                if (ragData.success) setRagChunkCount(ragData.chunkCount);
            }
        } catch (err) {
            toast.error("Failed to load folder details");
        }
    };

    const createFolder = async () => {
        if (!newTopicName.trim()) return;
        try {
            const res = await fetch('/api/admin/knowledge-folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topicName: newTopicName })
            });
            const data = await res.json();
            if (data.success) {
                if (folders.find(f => f.id === data.folder.id)) {
                    // Update if already exists
                    setFolders(folders.map(f => f.id === data.folder.id ? data.folder : f));
                } else {
                    setFolders([...folders, data.folder]);
                }
                setIsCreatingFolder(false);
                setNewTopicName('');
                toast.success(`Folder "${newTopicName}" created!`);
            } else {
                toast.error(data.error || "Failed to create folder");
            }
        } catch (err) {
            toast.error("Network error");
        }
    };

    const handleRenameFolder = async (folderId: string, oldName: string) => {
        const newName = prompt("Enter new topic name:", oldName);
        if (!newName || newName === oldName) return;
        
        try {
            const res = await fetch('/api/knowledge-folders', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderId, newTopicName: newName })
            });
            const data = await res.json();
            if (data.success) {
                setFolders(prev => prev.map(f => f.id === folderId ? { ...f, topicName: newName } : f));
                if (activeFolder?.id === folderId) setActiveFolder({ ...activeFolder, topicName: newName });
                toast.success("Topic renamed!");
            }
        } catch (err) {
            toast.error("Rename failed");
        }
    };

    const handleFileUpload = async (files: FileList | null) => {
        if (!files || !activeFolder) return;
        setIsUploading(true);
        
        const loadingToast = toast.loading(`Processing ${files.length} documents...`);
        
        try {
            for (const file of Array.from(files)) {
                if (file.type === 'application/pdf') {
                    // pdf.js rasterization logic (simplified)
                    await processPDF(file, activeFolder.id);
                } else {
                    const formData = new FormData();
                    formData.append('files', file);
                    formData.append('folderId', activeFolder.id);

                    await fetch('/api/teacher/knowledge/extract-multi', {
                        method: 'POST',
                        body: formData
                    });
                }
            }
            toast.success("Training content successfully extracted!", { id: loadingToast });
            fetchFolderDetail(activeFolder.id);
        } catch (err) {
            toast.error("Failed to process files", { id: loadingToast });
        } finally {
            setIsUploading(false);
        }
    };

    const processPDF = async (file: File, folderId: string) => {
        const loadingPage = toast.loading(`Rasterizing PDF: ${file.name}...`);
        try {
            // @ts-ignore
            const pdfjsLib = window['pdfjs-dist/build/pdf'];
            const pdfData = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
            
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                await page.render({ canvasContext: context!, viewport }).promise;
                const base64Image = canvas.toDataURL('image/jpeg', 0.8);

                await fetch('/api/extract', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'image', fileBase64: base64Image, folderId })
                });
            }
            toast.success(`Extracted ${pdf.numPages} pages from ${file.name}!`, { id: loadingPage });
        } catch (err) {
            toast.error(`PDF extraction failed for ${file.name}`, { id: loadingPage });
        }
    };

    const handleUrlTrain = async (type: 'URL' | 'YOUTUBE') => {
        const val = type === 'URL' ? urlInput : youtubeInput;
        if (!val || !activeFolder) return;
        
        setIsUploading(true);
        const loadingToast = toast.loading(`Scraping ${type === 'URL' ? 'Webpage' : 'YouTube transcript'}...`);
        
        try {
            const res = await fetch('/api/teacher/knowledge/extract-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: val, type, folderId: activeFolder.id })
            });
            const data = await res.json();
            if (data.success) {
                toast.success("Content trained!", { id: loadingToast });
                if (type === 'URL') setUrlInput(''); else setYoutubeInput('');
                fetchFolderDetail(activeFolder.id);
            } else {
                toast.error(data.error || "Scraping failed", { id: loadingToast });
            }
        } catch (err) {
            toast.error("Failed to process URL", { id: loadingToast });
        } finally {
            setIsUploading(false);
        }
    };

    const handleGenerateQuestions = async () => {
        if (!activeFolder) return;
        setIsGenerating(true);
        const loadingToast = toast.loading(`Generating ${genConfig.count} questions from "${activeFolder.topicName}" folder...`);

        try {
            const res = await fetch('/api/teacher/questions/generate-from-rag', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    folderId: activeFolder.id,
                    topic: activeFolder.topicName,
                    count: genConfig.count,
                    types: genConfig.types,
                    difficulties: genConfig.difficulties,
                })
            });
            
            const data = await res.json();
            if (data.success) {
                toast.success(`Generated ${data.generated} questions (${data.similarQuestionSources} similar Qs as context)!`, { id: loadingToast });
                setIsGenModalOpen(false);
            } else {
                toast.error(data.error || "Generation failed", { id: loadingToast });
            }
        } catch (err) {
            toast.error("Network error during generation", { id: loadingToast });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleProcessForRAG = async () => {
        if (!activeFolder) return;
        setIsProcessingRAG(true);
        const loadingToast = toast.loading(`Processing "${activeFolder.topicName}" for RAG...`);
        try {
            const res = await fetch(`/api/admin/knowledge-folders/${activeFolder.id}/process-for-rag`, {
                method: 'POST',
            });
            const data = await res.json();
            if (data.success) {
                setRagChunkCount(data.totalChunks);
                toast.success(`RAG processed: ${data.chunksCreated} chunks from ${data.documentsProcessed} documents!`, { id: loadingToast });
            } else {
                toast.error(data.error || "RAG processing failed", { id: loadingToast });
            }
        } catch (err) {
            toast.error("Network error during RAG processing", { id: loadingToast });
        } finally {
            setIsProcessingRAG(false);
        }
    };

    const handleGenerateFlashcards = async () => {
        if (!activeFolder) return;
        setIsGeneratingFlashcards(true);
        const loadingToast = toast.loading(`Generating Flashcards from "${activeFolder.topicName}"...`);

        try {
            const res = await fetch('/api/teacher/knowledge/flashcards/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderId: activeFolder.id })
            });
            const data = await res.json();
            if (data.success) {
                toast.success(`Generated ${data.count} new Flashcards!`, { id: loadingToast });
            } else {
                toast.error(data.error || "Generation failed", { id: loadingToast });
            }
        } catch (err) {
            toast.error("Network error during flashcard generation", { id: loadingToast });
        } finally {
            setIsGeneratingFlashcards(false);
        }
    };

    const handleUpdateDocument = async () => {
        if (!editingDoc) return;
        setIsSavingDoc(true);
        try {
            const res = await fetch(`/api/admin/knowledge-documents/${editingDoc.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    content: editingDoc.content,
                    title: editingDoc.title 
                })
            });
            const data = await res.json();
            if (data.success) {
                toast.success("Source updated successfully!");
                setEditingDoc(null);
                if (activeFolder) fetchFolderDetail(activeFolder.id);
            } else {
                toast.error(data.error || "Update failed");
            }
        } catch {
            toast.error("Network error");
        } finally {
            setIsSavingDoc(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
                <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                <p className="text-slate-400 font-bold animate-pulse">Initializing Topic Lab...</p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto p-8 space-y-8">
            <div className="flex items-center justify-between mb-4">
                <div></div>
                {!activeFolder && (
                    <button 
                        onClick={() => setIsCreatingFolder(true)}
                        className="bg-indigo-600 hover:bg-slate-900 text-white font-black px-6 py-4 rounded-3xl shadow-xl shadow-indigo-100 flex items-center gap-2 transition-all hover:scale-[1.02]"
                    >
                        <Plus className="w-5 h-5" />
                        New Topic Folder
                    </button>
                )}
            </div>

            <AnimatePresence mode="wait">
                {!activeFolder ? (
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                    >
                        {folders.map((folder) => (
                            <motion.div 
                                key={folder.id}
                                whileHover={{ scale: 1.02 }}
                                onClick={() => { setActiveFolder(folder); fetchFolderDetail(folder.id); }}
                                className="group relative bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 p-8 rounded-[2.5rem] cursor-pointer hover:border-indigo-200 dark:hover:border-indigo-500 hover:shadow-2xl hover:shadow-indigo-50 dark:hover:shadow-indigo-900/20 transition-all"
                            >
                                <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/30 transition-colors">
                                    <Folder className="w-8 h-8 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                                </div>
                                <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-2 truncate">{folder.topicName}</h3>
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest bg-slate-50 dark:bg-slate-800 px-3 py-1 rounded-full group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/30 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-all">
                                        {folder._count?.documents || 0} Documents
                                    </span>
                                    <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full">
                                        Active
                                    </span>
                                </div>
                                
                                <div className="absolute top-8 right-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Sparkles className="w-5 h-5 text-indigo-200" />
                                </div>
                            </motion.div>
                        ))}

                        {folders.length === 0 && (
                            <div className="col-span-full py-20 text-center">
                                <div className="w-24 h-24 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <BookOpen className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                                </div>
                                <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100 mb-2">No Training Folders Yet</h2>
                                <p className="text-slate-400 dark:text-slate-500 font-medium">Create your first topic folder to start training the AI generator.</p>
                            </div>
                        )}
                    </motion.div>
                ) : (
                    <motion.div 
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-8"
                    >
                        <div className="bg-slate-950 p-10 rounded-[3rem] text-white overflow-hidden relative shadow-2xl">
                            <div className="absolute top-0 right-0 p-12 opacity-10">
                                <Folder className="w-40 h-40" />
                            </div>
                            
                            <button 
                                onClick={() => setActiveFolder(null)}
                                className="flex items-center gap-2 text-indigo-400 font-black text-xs uppercase tracking-widest hover:text-white transition-colors mb-6"
                            >
                                <ChevronLeft className="w-4 h-4" />
                                Back to Lab
                            </button>
                            
                            <div className="relative z-10 flex items-end justify-between gap-8">
                                <div>
                                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] block mb-2">Topic Folder</span>
                                    <h2 className="text-5xl font-black tracking-tight">{activeFolder.topicName}</h2>
                                    <div className="flex items-center gap-4 mt-6">
                                        <div className="flex items-center gap-2 text-slate-400 font-bold text-sm">
                                            <FileText className="w-4 h-4" />
                                            {activeFolder.documents?.length || 0} Sources Trained
                                        </div>
                                    </div>
                                </div>
                                
                                 <button 
                                     onClick={handleProcessForRAG}
                                     disabled={isProcessingRAG}
                                     className="bg-emerald-600 hover:bg-white hover:text-emerald-600 text-white font-black px-8 py-5 rounded-[2rem] flex items-center gap-3 transition-all transform hover:scale-105 shadow-2xl shrink-0"
                                 >
                                     {isProcessingRAG ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                                     {isProcessingRAG ? 'Processing...' : 'Process for RAG'}
                                 </button>
                                 
                                 <button 
                                     onClick={() => setIsGenModalOpen(true)}
                                     className="bg-indigo-600 hover:bg-white hover:text-indigo-600 text-white font-black px-10 py-5 rounded-[2rem] flex items-center gap-3 transition-all transform hover:scale-105 shadow-2xl shrink-0"
                                 >
                                     <Sparkles className="w-5 h-5" />
                                     Generate Questions
                                 </button>
                                 
                                 <button 
                                     onClick={handleGenerateFlashcards}
                                     disabled={isGeneratingFlashcards}
                                     className="bg-fuchsia-600 hover:bg-white hover:text-fuchsia-600 text-white font-black px-10 py-5 rounded-[2rem] flex items-center gap-3 transition-all transform hover:scale-105 shadow-2xl shrink-0"
                                 >
                                     {isGeneratingFlashcards ? <Loader2 className="w-5 h-5 animate-spin" /> : <span className="text-xl">🃏</span>}
                                     Generate Flashcards
                                 </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div className="lg:col-span-2 space-y-6">
                                <section className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 p-10 rounded-[3rem] shadow-sm">
                                    <div className="flex items-center justify-between mb-8">
                                        <h3 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-3">
                                            <Upload className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                                            Universal Trainer
                                        </h3>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <label className="group relative border-2 border-dashed border-slate-100 dark:border-slate-800 p-8 rounded-3xl hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/20 transition-all cursor-pointer flex flex-col items-center text-center">
                                            <input 
                                                type="file" 
                                                multiple 
                                                className="hidden" 
                                                onChange={(e) => handleFileUpload(e.target.files)}
                                                accept=".pdf,.docx,.jpg,.jpeg,.png"
                                            />
                                            <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center mb-4 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/30 transition-colors">
                                                <Upload className="w-6 h-6 text-slate-400 dark:text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                                            </div>
                                            <p className="text-sm font-black text-gray-900 dark:text-gray-100 mb-1 leading-none">Drop Files Here</p>
                                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter mt-1">PDF, DOCX, or IMAGES</p>
                                        </label>

                                        <div className="space-y-4">
                                            <div className="relative">
                                                <input 
                                                    type="text" 
                                                    placeholder="Paste Web URL..."
                                                    value={urlInput}
                                                    onChange={e => setUrlInput(e.target.value)}
                                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-4 pr-12 text-sm font-medium text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                                                />
                                                <button 
                                                    onClick={() => handleUrlTrain('URL')}
                                                    className="absolute right-2 top-2 p-2 bg-white rounded-lg text-indigo-600 shadow-sm hover:scale-105 active:scale-95 transition"
                                                >
                                                    <Zap className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <div className="relative">
                                                <input 
                                                    type="text" 
                                                    placeholder="YouTube Video Link..."
                                                    value={youtubeInput}
                                                    onChange={e => setYoutubeInput(e.target.value)}
                                                    className="w-full bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-2xl p-4 pr-12 text-sm font-medium text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-rose-400 transition"
                                                />
                                                <button 
                                                    onClick={() => handleUrlTrain('YOUTUBE')}
                                                    className="absolute right-2 top-2 p-2 bg-white dark:bg-slate-800 rounded-lg text-rose-600 dark:text-rose-400 shadow-sm hover:scale-105 active:scale-95 transition"
                                                >
                                                    <Zap className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {isUploading && (
                                        <div className="mt-8 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center gap-4">
                                            <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                                            <p className="text-indigo-900 font-bold text-sm">AI is extracting your mathematical context. Please wait...</p>
                                        </div>
                                    )}
                                </section>

                                <div className="space-y-4">
                                    <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 tracking-tight">📜 Training Sources ({activeFolder.documents?.length || 0})</h3>
                                    <div className="grid grid-cols-1 gap-3">
                                        {activeFolder.documents?.map((doc) => (
                                            <div key={doc.id} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-2xl flex items-center justify-between group hover:shadow-lg transition-all">
                                                <div className="flex items-center gap-4">
                                                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-slate-400 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/30 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                                        {doc.sourceType === 'PDF' && <FileText className="w-5 h-5" />}
                                                        {doc.sourceType === 'URL' && <Globe className="w-5 h-5" />}
                                                        {doc.sourceType === 'YOUTUBE' && <Youtube className="w-5 h-5" />}
                                                        {doc.sourceType === 'WORD' && <FileCode className="w-5 h-5" />}
                                                        {doc.sourceType === 'IMAGE' && <FileType className="w-5 h-5" />}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-black text-gray-900 dark:text-gray-100 text-sm truncate max-w-md">{doc.title}</h4>
                                                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                                            Trained on {new Date(doc.createdAt).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 opacity-100 transition-opacity">
                                                    <button 
                                                        onClick={() => setEditingDoc(doc)}
                                                        className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                                                        title="Edit Source Text"
                                                    >
                                                        <Edit3 className="w-5 h-5" />
                                                    </button>
                                                    <button 
                                                        onClick={async () => {
                                                            if (!confirm("Remove this source?")) return;
                                                            await fetch(`/api/admin/knowledge-documents/${doc.id}`, { method: 'DELETE' });
                                                            fetchFolderDetail(activeFolder.id);
                                                        }}
                                                        className="p-3 text-slate-200 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                                                        title="Delete Source"
                                                    >
                                                        <Trash2 className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-8 rounded-[3rem] text-white shadow-xl">
                                     <h4 className="text-xl font-black mb-6">Folder IQ</h4>
                                     <ul className="space-y-4 text-sm font-bold opacity-90">
                                         <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-indigo-200" /> Deep context alignment.</li>
                                         <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-indigo-200" /> Multi-format anti-repetition.</li>
                                     </ul>
                                     <div className="mt-6 pt-6 border-t border-white/20">
                                         <div className="text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-2">RAG Status</div>
                                         {ragChunkCount === null ? (
                                             <p className="text-sm font-bold text-indigo-200">Not processed yet</p>
                                         ) : (
                                             <p className="text-sm font-bold text-white">{ragChunkCount} vector chunks indexed</p>
                                         )}
                                     </div>
                                 </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Creation Modal */}
            <AnimatePresence>
                {isCreatingFolder && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white dark:bg-slate-900 p-12 rounded-[3.5rem] w-full max-w-md shadow-2xl border border-white/10">
                            <h2 className="text-3xl font-black text-gray-900 dark:text-gray-100 mb-2">New Topic</h2>
                            <p className="text-slate-400 dark:text-slate-500 font-bold mb-8">Group your school notes and URLs into a specialized AI training library.</p>
                            <input autoFocus type="text" placeholder="e.g. Calculus: Limits" value={newTopicName} onChange={e => setNewTopicName(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-50 dark:border-slate-700 rounded-3xl p-6 font-bold text-gray-900 dark:text-gray-100 focus:outline-none focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-900 mb-8" />
                            <div className="flex gap-4">
                                <button onClick={() => setIsCreatingFolder(false)} className="flex-1 py-5 text-slate-400 font-black">Cancel</button>
                                <button disabled={!newTopicName.trim()} onClick={createFolder} className="flex-1 py-5 bg-slate-900 text-white rounded-3xl font-black shadow-xl disabled:opacity-30">Create</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Generation Modal */}
            <AnimatePresence>
                {isGenModalOpen && activeFolder && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl z-[60] flex items-center justify-center p-4">
                        <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-white dark:bg-slate-900 p-16 rounded-[4rem] w-full max-w-2xl shadow-2xl relative border border-white/10">
                            <button onClick={() => setIsGenModalOpen(false)} className="absolute top-10 right-10 p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-2xl transition"><X className="w-6 h-6 text-slate-400" /></button>
                            <h2 className="text-4xl font-black text-gray-900 dark:text-gray-100 tracking-tight mb-8">Mass Quiz Builder</h2>
                            <div className="grid grid-cols-2 gap-10">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-4">How many?</label>
                                    <div className="flex items-center gap-4">
                                        <button onClick={() => setGenConfig({...genConfig, count: Math.max(1, genConfig.count - 1)})} className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-xl font-black text-xl text-gray-900 dark:text-gray-100 hover:bg-indigo-50">-</button>
                                        <span className="text-3xl font-black w-10 text-center text-gray-900 dark:text-gray-100">{genConfig.count}</span>
                                        <button onClick={() => setGenConfig({...genConfig, count: Math.min(20, genConfig.count + 1)})} className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-xl font-black text-xl text-gray-900 dark:text-gray-100 hover:bg-indigo-50">+</button>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-4">Difficulty</label>
                                    <div className="flex flex-wrap gap-2">
                                        {['EASY', 'MEDIUM', 'HARD'].map(d => (
                                            <button key={d} onClick={() => setGenConfig({...genConfig, difficulties: [d]})} className={`px-6 py-3 rounded-2xl text-[10px] font-black transition-all ${genConfig.difficulties.includes(d) ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-400'}`}>{d}</button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <button onClick={handleGenerateQuestions} disabled={isGenerating} className="w-full mt-12 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-6 rounded-[2rem] shadow-2xl flex items-center justify-center gap-3 transition-all disabled:opacity-50">
                                {isGenerating ? <><Loader2 className="w-5 h-5 animate-spin" /> Training...</> : <><Sparkles className="w-5 h-5" /> Execute Generation</>}
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {/* Source Editor Modal */}
            <AnimatePresence>
                {editingDoc && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xl z-[70] flex items-center justify-center p-8">
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0, y: 30 }} 
                            animate={{ scale: 1, opacity: 1, y: 0 }} 
                            className="bg-[#0d1117] border border-slate-700/50 rounded-[3rem] w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden shadow-2xl"
                        >
                            <div className="px-10 py-6 border-b border-slate-700/50 bg-[#161b22] flex items-center justify-between">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-3">
                                        <div className="flex gap-2">
                                            <div className="w-3 h-3 rounded-full bg-rose-500" />
                                            <div className="w-3 h-3 rounded-full bg-amber-500" />
                                            <div className="w-3 h-3 rounded-full bg-emerald-500" />
                                        </div>
                                        <h3 className="text-indigo-400 font-mono text-sm font-black uppercase tracking-widest">Source Editor</h3>
                                    </div>
                                    <input 
                                        value={editingDoc.title}
                                        onChange={e => setEditingDoc({...editingDoc, title: e.target.value})}
                                        className="bg-transparent text-white text-xl font-black focus:outline-none border-b border-transparent focus:border-indigo-500 transition-all w-[400px]"
                                    />
                                </div>
                                <div className="flex items-center gap-4">
                                    <button 
                                        onClick={() => setEditingDoc(null)}
                                        className="px-6 py-3 text-slate-400 font-black text-sm uppercase tracking-widest hover:text-white"
                                    >
                                        Discard
                                    </button>
                                    <button 
                                        onClick={handleUpdateDocument}
                                        disabled={isSavingDoc}
                                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-black px-8 py-3 rounded-2xl shadow-xl transition-all flex items-center gap-2"
                                    >
                                        {isSavingDoc ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                        Save Changes
                                    </button>
                                </div>
                            </div>

                            <div className="flex-grow relative bg-[#0d1117]">
                                <textarea 
                                    autoFocus
                                    value={editingDoc.content}
                                    onChange={e => setEditingDoc({...editingDoc, content: e.target.value})}
                                    className="absolute inset-0 w-full h-full p-12 bg-transparent text-slate-300 font-mono text-sm leading-relaxed focus:outline-none resize-none scrollbar-hide"
                                    placeholder="Paste or edit the source content here..."
                                />
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
