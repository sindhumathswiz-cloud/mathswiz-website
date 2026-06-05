'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { debounce } from 'lodash';
import {
    FileText, UploadCloud, Loader2, CheckCircle2, AlertCircle,
    ChevronLeft, ChevronRight, Save, Eye, AlignLeft,
    Plus, Trash2, SplitSquareHorizontal, Target, Globe, Youtube,
    MousePointerClick, BookOpen, AlertTriangle, X, Clock, RefreshCw,
    FileUp, PenLine, ZoomIn, ZoomOut, CheckSquare, Clipboard, Edit3,
    FileSpreadsheet, ChevronDown,
    Activity,
    Terminal,
    ArrowRight,
    ArrowLeft,
    Sparkles,
    Activity as ActivityIcon,
    Terminal as TerminalIcon,
    Folder,
    XCircle,
    Zap,
    Link2,
    Image,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import MathRenderer from '@/components/MathRenderer';
import { buildPageWindows, dedupeByContent } from '@/lib/page-windows';
import { chapterFromFilename } from '@/lib/chapter-classifier';
import QuestionTags from '@/components/QuestionTags';
import QAFlags from '@/components/QAFlags';
import { analyzeQuestion } from '@/lib/question-qa';
import useSWR from 'swr';
import TaxonomyCascadeSelector from '@/components/admin/TaxonomyCascadeSelector';
import GlobalMathToolbar from '@/components/GlobalMathToolbar';
import * as XLSX from 'xlsx';
import { toast } from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';


const fetcher = (url: string) => fetch(url).then(res => {
    if (!res.ok) return { error: 'Fetch failed' };
    return res.json().catch(() => ({ error: 'Invalid JSON' }));
});

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface DuplicateMatchData {
    content: string;
    options: string[];
    explanation: string;
    type: string;
    difficulty: string;
    class: string;
    topic: string;
    subject: string;
    examType: string;
    tags: string[];
    status: string;
    similarity: number;
    matchType: string;
}

interface ExtractedQuestion {
    id: string;
    dbId?: string;
    content: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
    type: string;
    difficulty: string;
    subject: string;
    classLevel: string;
    examType: string;
    tags: string[];
    tagInput: string;
    originalRawText?: string;
    isDuplicate?: boolean;       // true if question already exists in DB
    duplicateChecked?: boolean;  // true once the check has completed
    duplicateMatchId?: string;   // ID of the matched existing question
    duplicateMatchContent?: string; // text of the matched question for comparison
    duplicateMatchData?: DuplicateMatchData;
}



const blankQuestion = (): ExtractedQuestion => ({
    id: `manual_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    content: '',
    options: ['', '', '', ''],
    correctAnswer: '',
    explanation: '',
    type: 'SINGLE_CHOICE',
    difficulty: 'MEDIUM',
    subject: 'Mathematics',
    classLevel: 'Class 12',
    examType: 'Board',
    tags: [],
    tagInput: '',
    originalRawText: '',
});

const sanitizeLaTeX = (text: string) => {
    if (!text) return '';
    return text.replace(/\\\(/g, '$').replace(/\\\)/g, '$').replace(/\\\[/g, '$$').replace(/\\\]/g, '$$');
};

const mapDbQuestion = (q: { 
    id: string; 
    content?: string; 
    options?: any; 
    correctAnswer?: string; 
    explanation?: string; 
    type?: string; 
    difficulty?: string; 
    subject?: string; 
    class?: string; 
    examType?: string; 
    tags?: string[]; 
    originalRawText?: string;
}): ExtractedQuestion => ({
    id: q.id,
    dbId: q.id,
    content: sanitizeLaTeX(q.content || ''),
    options: Array.isArray(q.options) ? [...q.options, ...Array(4).fill('')].slice(0, 4).map(sanitizeLaTeX) : ['', '', '', ''],
    correctAnswer: sanitizeLaTeX(q.correctAnswer || ''),
    explanation: sanitizeLaTeX(q.explanation || ''),
    type: q.type || 'SINGLE_CHOICE',
    difficulty: q.difficulty || 'MEDIUM',
    subject: q.subject || 'Mathematics',
    classLevel: q.class || 'Class 12',
    examType: q.examType || 'Board',
    tags: Array.isArray(q.tags) ? q.tags : [],
    tagInput: '',
    originalRawText: q.originalRawText || '',
});

// â”€â”€â”€ Caching Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const getCacheDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('MathswizOCR', 1);
        req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains('pdf_cache')) db.createObjectStore('pdf_cache');
            if (!db.objectStoreNames.contains('extracted_questions')) db.createObjectStore('extracted_questions');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

const getCachedOCR = async (key: string): Promise<ExtractedQuestion[] | null> => {
    try {
        const db = await getCacheDB();
        return new Promise((resolve) => {
            const tx = db.transaction('pdf_cache', 'readonly');
            const req = tx.objectStore('pdf_cache').get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch { return null; }
};

const setCachedOCR = async (key: string, data: ExtractedQuestion[]) => {
    try {
        const db = await getCacheDB();
        return new Promise<void>((resolve) => {
            const tx = db.transaction('pdf_cache', 'readwrite');
            tx.objectStore('pdf_cache').put(data, key);
            tx.oncomplete = () => resolve();
        });
    } catch {}
};

const getCachedExtraction = async (fileHash: string): Promise<{ savedCount: number; timestamp: number } | null> => {
    try {
        const db = await getCacheDB();
        return new Promise((resolve) => {
            const tx = db.transaction('extracted_questions', 'readonly');
            const req = tx.objectStore('extracted_questions').get(fileHash);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch { return null; }
};

const setCachedExtraction = async (fileHash: string, data: { savedCount: number; timestamp: number }) => {
    try {
        const db = await getCacheDB();
        return new Promise<void>((resolve) => {
            const tx = db.transaction('extracted_questions', 'readwrite');
            tx.objectStore('extracted_questions').put(data, fileHash);
            tx.oncomplete = () => resolve();
        });
    } catch {}
};

const generateFileHash = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
};

const mapExtracted = (q: any, prefix: string, idx: number): ExtractedQuestion => ({
    id: `${prefix}_${idx}_${Date.now()}`,
    content: sanitizeLaTeX(q.content || q.questionContent || ''),
    options: Array.isArray(q.options) ? [...q.options, ...Array(4).fill('')].slice(0, 4).map(sanitizeLaTeX) : ['', '', '', ''],
    correctAnswer: sanitizeLaTeX(q.correctAnswer || ''),
    explanation: sanitizeLaTeX(q.explanation || ''),
    type: q.type || 'SINGLE_CHOICE',
    difficulty: q.difficulty || 'MEDIUM',
    subject: 'Mathematics',
    classLevel: 'Class 12',
    examType: 'Board',
    tags: Array.isArray(q.tags) ? q.tags : [],
    tagInput: '',
});

// â”€â”€â”€ PDF.js loader (module-level, shared by component + SourcePanel) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const loadPdfJs = async (): Promise<any> => {
    if ((window as any).pdfjsLib) return (window as any).pdfjsLib;
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    document.body.appendChild(script);
    return new Promise(resolve => {
        script.onload = () => {
            (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            resolve((window as any).pdfjsLib);
        };
    });
};

// â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function BulkImportStudio() {
    const { data: session } = useSession();

    // Primary tab: pdf | word | drafts | excel | manual
    const [mainTab, setMainTab] = useState<'pdf' | 'word' | 'drafts' | 'excel' | 'manual' | 'qa'>('pdf');
    const [selectedTaxonomyIds, setSelectedTaxonomyIds] = useState<string[]>([]);

    // Workspace mode (PDF only)
    const [viewMode, setViewMode] = useState<'upload' | 'workspace'>('upload');

    // Unified staging queue (PDF + Word + manual cards)
    const [questions, setQuestions] = useState<ExtractedQuestion[]>([]);
    const [isExtracting, setIsExtracting] = useState(false);
    const [rawMarkdown, setRawMarkdown] = useState<string>('');
    const [showRawMarkdown, setShowRawMarkdown] = useState(false);
    const [sourceViewMode, setSourceViewMode] = useState<'raw' | 'rendered' | 'pdf'>('raw');

    // PDF state
    const fileInputRef = useRef<HTMLInputElement>(null);
    const bookInputRef = useRef<HTMLInputElement>(null);
    const docxInputRef = useRef<HTMLInputElement>(null);
    const pdfDocRef = useRef<any>(null);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [leftTab, setLeftTab] = useState<'viewer' | 'rawText'>('viewer');
    const [rawTextDump, setRawTextDump] = useState<{ page: number; text: string }[]>([]);
    const [leftZoom, setLeftZoom] = useState(150);
    const [rightZoom, setRightZoom] = useState(100);

    // Bulk selection & Edit toggles
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
    const [isBulkImporting, setIsBulkImporting] = useState(false);
    const [isDuplicateChecking, setIsDuplicateChecking] = useState(false);

    // Word state
    const [wordFileName, setWordFileName] = useState<string | null>(null);
    const [wordStatus, setWordStatus] = useState<'idle' | 'parsing' | 'structuring' | 'done' | 'error'>('idle');
    const [wordError, setWordError] = useState('');
    
    // Excel state
    const excelInputRef = useRef<HTMLInputElement>(null);
    const [excelStatus, setExcelStatus] = useState<'idle' | 'parsing' | 'done' | 'error'>('idle');
    const [excelError, setExcelError] = useState('');


    // Aggregate full raw text from all pages for source comparison
    const fullRawText = React.useMemo(() => 
        rawTextDump.map(p => p.text).join('\n\n--- Page Break ---\n\n'), 
        [rawTextDump]
    );

    // Drafts state (Task 3: Real-time Review Queue)
    const [draftQuestions, setDraftQuestions] = useState<ExtractedQuestion[]>([]);
    const [isSyncPaused, setIsSyncPaused] = useState(false);
    const [isEditingDraft, setIsEditingDraft] = useState(false);

    // Drafts that fail automated QA (broken LaTeX, missing answer/options, etc.)
    const flaggedDrafts = useMemo(
        () => draftQuestions.filter(q => analyzeQuestion({
            content: q.content, options: q.options, correctAnswer: q.correctAnswer,
            explanation: q.explanation, type: q.type,
        }).length > 0),
        [draftQuestions]
    );
    
    const { data: draftsData, isLoading: isDraftsLoading, mutate: mutateDrafts } = useSWR(
        (mainTab === 'drafts' || mainTab === 'qa') && !isSyncPaused && !isEditingDraft
            ? `/api/admin/questions?status=DRAFT${selectedTaxonomyIds.length > 0 ? `&taxonomyIds=${encodeURIComponent(JSON.stringify(selectedTaxonomyIds))}` : ''}`
            : null,
        fetcher,
        { refreshInterval: 5000, revalidateOnFocus: false }
    );
    // Removed redundant useEffect (merged into fetchFolders above)

    // Sync SWR data to local state for editing, but PRESERVE local edits
    useEffect(() => {
        if (draftsData?.questions) {
            const incoming = draftsData.questions.map(mapDbQuestion);
            setDraftQuestions(prev => {
                // If local state is empty, just take incoming
                if (prev.length === 0) return incoming;
                
                // Identify truly NEW questions by ID
                const existingIds = new Set(prev.map((q: ExtractedQuestion) => q.id));
                const newQuestions = incoming.filter((q: ExtractedQuestion) => !existingIds.has(q.id));
                
                if (newQuestions.length === 0) return prev;
                
                // Prepend new ones to show them "magically" at the top
                return [...newQuestions, ...prev];
            });
        }
    }, [draftsData]);

    // Feedback
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const showMsg = (type: 'error' | 'success', text: string) => {
        if (type === 'error') { setErrorMsg(text); setTimeout(() => setErrorMsg(''), 6000); }
        else { setSuccessMsg(text); setTimeout(() => setSuccessMsg(''), 3000); }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (fileInputRef.current) fileInputRef.current.value = '';

        // Auto-detect the chapter from the filename when none was selected,
        // and pre-select it (the user can still override in "Select Topic").
        let taxIds = selectedTaxonomyIds;
        if (taxIds.length === 0) {
            const guess = chapterFromFilename(file.name);
            if (guess) {
                try {
                    const r = await fetch(`/api/taxonomy/resolve-chapter?name=${encodeURIComponent(guess)}`);
                    const d = await r.json();
                    if (d.topicId) {
                        taxIds = [d.topicId];
                        setSelectedTaxonomyIds(taxIds);
                        toast.success(`Auto-detected chapter: ${d.topicName}. Change it in "Select Topic" if wrong.`);
                    } else if (d.canonical) {
                        toast.error(`Detected "${d.canonical}" but it isn't in the taxonomy. Please select a Topic manually.`);
                    }
                } catch { /* fall through to the manual prompt */ }
            }
        }

        if (taxIds.length === 0) {
            toast.error("Please select at least one Topic or Sub-Topic first.");
            return;
        }

        if (file.type === 'application/pdf') {
            // Create blob URL for SourcePanel PDF page view
            const blobUrl = URL.createObjectURL(file);
            setPdfUrl(blobUrl);
            setCurrentPage(1);

            const fileHash = await generateFileHash(file);
            const cached = await getCachedExtraction(fileHash);
            
            if (cached) {
                const timeSinceExtraction = Date.now() - cached.timestamp;
                const hoursSince = Math.floor(timeSinceExtraction / (1000 * 60 * 60));
                
                const useCache = window.confirm(
                    `This file was previously extracted (${hoursSince}h ago) with ${cached.savedCount} questions.\n\n` +
                    `Would you like to use the cached result (saves Mathpix tokens)?\n\n` +
                    `Click OK to use cache, Cancel to re-extract.`
                );
                
                if (useCache) {
                    toast.success(`Using cached extraction (${cached.savedCount} questions). No Mathpix tokens used!`);
                    mutateDrafts();
                    setMainTab('drafts');
                    return;
                }
            }
            
            const loadingToast = toast.loading('Extracting via MathPix (this may take a minute)...');
            setIsExtracting(true);
            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('taxonomyIds', JSON.stringify(taxIds));
                
                const res = await fetch('/api/admin/extract-pdf', {
                    method: 'POST',
                    body: formData
                });
                
                const data = await res.json();
                if (data.success) {
                    await setCachedExtraction(fileHash, { savedCount: data.savedCount, timestamp: Date.now() });
                    if (data.rawMarkdown) {
                        setRawMarkdown(data.rawMarkdown);
                        setShowRawMarkdown(true);
                    }
                    toast.success(`Successfully saved ${data.savedCount} questions as DRAFT!`, { id: loadingToast });
                    mutateDrafts();
                    setMainTab('drafts');
                } else {
                    throw new Error(data.error || 'Failed to extract PDF');
                }
            } catch (err: any) {
                toast.error(err.message, { id: loadingToast });
            } finally {
                setIsExtracting(false);
            }
        } else {
            setTotalPages(1);
            await extractImage(file);
        }
    };



    const extractAllPages = async (doc: any, fileHash: string) => {
        setIsExtracting(true);
        let allQuestions: ExtractedQuestion[] = [];
        try {
            // ── Phase 1: OCR every page to LaTeX text (Mathpix), in page order ──
            const pageTexts: string[] = [];
            for (let i = 1; i <= doc.numPages; i++) {
                setCurrentPage(i);
                showMsg('success', `Reading page ${i} of ${doc.numPages}...`);
                const page = await doc.getPage(i);
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
                const base64 = canvas.toDataURL('image/jpeg', 0.9);

                try {
                    const textContent = await page.getTextContent();
                    const raw = textContent.items.map((it: any) => it.str).join(' ');
                    setRawTextDump(prev => {
                        const idx = prev.findIndex(r => r.page === i);
                        if (idx >= 0) { const n = [...prev]; n[idx] = { page: i, text: raw }; return n; }
                        return [...prev, { page: i, text: raw }];
                    });
                } catch (_) { }

                const ocrRes = await fetch('/api/extract', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'image', fileBase64: base64 })
                });
                const ocrData = await ocrRes.json();
                if (ocrData.error) throw new Error(`Page ${i} OCR: ${ocrData.error}`);
                pageTexts.push(ocrData.text || '');
            }

            // ── Phase 2: structure in overlapping windows so a question and its
            // solution spilling onto the next page reach the LLM together ──
            const windows = buildPageWindows(pageTexts, 4, 1);
            for (let w = 0; w < windows.length; w++) {
                const win = windows[w];
                showMsg('success', `Structuring pages ${win.startPage}-${win.endPage} (${w + 1}/${windows.length})...`);
                const res = await fetch('/api/admin/extract-mathpix', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'text', rawText: win.text })
                });
                const data = await res.json();
                if (data.error) throw new Error(data.error + (data.details ? ' | ' + data.details : ''));

                const arr = Array.isArray(data) ? data : [];
                const mapped = arr.map((q: any, idx: number) => mapExtracted(q, `w${win.startPage}`, idx));
                // Dedupe across the window overlap.
                allQuestions = dedupeByContent([...allQuestions, ...mapped]);
                setQuestions(prev => dedupeByContent([...prev, ...mapped]));
            }
            await setCachedOCR(fileHash, allQuestions);
            showMsg('success', `Extracted ${allQuestions.length} questions from ${doc.numPages} pages! Saved to cache.`);
            checkDuplicatesForQueue(allQuestions);
        } catch (err: any) {
            showMsg('error', `Extraction stopped at page ${currentPage}: ${err.message}`);
            if (allQuestions.length > 0) {
                await setCachedOCR(fileHash, allQuestions);
                checkDuplicatesForQueue(allQuestions);
            }
        } finally {
            setIsExtracting(false);
        }
    };

    const extractPage = useCallback(async (pageNum: number, doc?: any) => {
        const pdfDoc = doc || pdfDocRef.current;
        if (!pdfDoc) return;
        setIsExtracting(true);
        try {
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
            const base64 = canvas.toDataURL('image/jpeg', 0.9);

            // Raw text dump
            try {
                const textContent = await page.getTextContent();
                const raw = textContent.items.map((i: any) => i.str).join(' ');
                setRawTextDump(prev => {
                    const idx = prev.findIndex(r => r.page === pageNum);
                    if (idx >= 0) { const n = [...prev]; n[idx] = { page: pageNum, text: raw }; return n; }
                    return [...prev, { page: pageNum, text: raw }];
                });
            } catch (_) { }

            const res = await fetch('/api/admin/extract-mathpix', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileBase64: base64, mimeType: 'image/jpeg' })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error + (data.details ? ' | ' + data.details : ''));

            const arr = Array.isArray(data) ? data : [data];
            setQuestions(prev => [...prev, ...arr.map((q, idx) => mapExtracted(q, `p${pageNum}`, idx))]);
            showMsg('success', `Page ${pageNum}: extracted ${arr.length} question(s)`);
        } catch (err: any) {
            showMsg('error', `Page ${pageNum} failed: ${err.message}`);
        } finally {
            setIsExtracting(false);
        }
    }, []);

    const extractImage = async (file: File) => {
        setIsExtracting(true);
        try {
            const reader = new FileReader();
            const base64 = await new Promise<string>(r => { reader.onload = e => r(e.target!.result as string); reader.readAsDataURL(file); });
            const res = await fetch('/api/admin/extract-mathpix', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileBase64: base64, mimeType: file.type })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            const arr = Array.isArray(data) ? data : [data];
            setQuestions(prev => [...prev, ...arr.map((q, idx) => mapExtracted(q, 'img', idx))]);
            showMsg('success', `Extracted ${arr.length} question(s) from image`);
        } catch (err: any) { showMsg('error', err.message); }
        finally { setIsExtracting(false); }
    };

    const navigatePage = (dir: 'prev' | 'next') => {
        setCurrentPage(p => dir === 'next' ? Math.min(p + 1, totalPages) : Math.max(p - 1, 1));
    };

    // â”€â”€ Word Document handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const handleWordUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (docxInputRef.current) docxInputRef.current.value = '';

        setWordFileName(file.name);
        setWordError('');
        setWordStatus('parsing');

        try {
            // Step 1: parse .docx â†’ raw text
            const form = new FormData();
            form.append('file', file);
            const parseRes = await fetch('/api/extract-word', { method: 'POST', body: form });
            const parseData = await parseRes.json();
            if (!parseRes.ok || parseData.error) throw new Error(parseData.error || 'Word parse failed');

            // Step 2: structure raw text â†’ JSON questions
            setWordStatus('structuring');
            const structRes = await fetch('/api/admin/extract-mathpix', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'text', rawText: parseData.text })
            });
            const structData = await structRes.json();
            if (structData.error) throw new Error(structData.error);

            const arr = Array.isArray(structData) ? structData : [structData];
            const mapped = arr.map((q, idx) => mapExtracted(q, 'word', idx));
            setQuestions(prev => [...prev, ...mapped]);
            setWordStatus('done');
            showMsg('success', `Word doc: extracted ${arr.length} question(s) into the queue.`);
            checkDuplicatesForQueue(mapped);
        } catch (err: any) {
            setWordStatus('error');
            setWordError(err.message);
        }
    };
    
    // â”€â”€ Excel handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (excelInputRef.current) excelInputRef.current.value = '';

        setExcelStatus('parsing');
        setExcelError('');

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const json: any[] = XLSX.utils.sheet_to_json(sheet);

            if (json.length === 0) throw new Error('Excel sheet is empty');

            const mapped = json.map((row, idx) => {
                const rawType = String(row['Question Type'] || row['Type'] || '').toUpperCase();
                let type = 'SINGLE_CHOICE';

                if (rawType.includes('MULTI')) type = 'MULTIPLE_CHOICE';
                else if (rawType.includes('INT')) type = 'INTEGER';
                else if (rawType.includes('TRUE')) type = 'TRUE_FALSE';
                else if (rawType.includes('FILL')) type = 'FILL_IN_BLANKS';
                else if (rawType.includes('CASE')) type = 'CASE_STUDY';
                else if (rawType.includes('VERY_SHORT')) type = 'VERY_SHORT_ANSWER';
                else if (rawType.includes('SHORT')) type = 'SHORT_ANSWER';
                else if (rawType.includes('LONG')) type = 'LONG_ANSWER';
                else if (rawType.includes('ASSERT')) type = 'ASSERTION_REASONING';
                else if (rawType.includes('SUBJECTIVE')) type = 'SUBJECTIVE';

                const options = [
                    row['Option A'] || row['Option 1'] || row['A'],
                    row['Option B'] || row['Option 2'] || row['B'],
                    row['Option C'] || row['Option 3'] || row['C'],
                    row['Option D'] || row['Option 4'] || row['D']
                ].filter(o => o !== undefined && o !== null).map(o => String(o));
                
                let content = String(row['Question Text'] || row['Content'] || row['Question'] || '');
                const passage = row['Common Passage'] || row['Passage'] || row['Context'];
                const assertion = row['Assertion'] || row['Statement 1'];
                const reason = row['Reason'] || row['Statement 2'];

                if (type === 'ASSERTION_REASONING' && assertion && reason) {
                    content = `**Assertion (A):** ${assertion}\n\n**Reason (R):** ${reason}`;
                } else if (passage) {
                    content = `**PASSAGE:** ${passage}\n\n**QUESTION:** ${content}`;
                }

                return {
                    id: `excel_${Date.now()}_${idx}`,
                    content: sanitizeLaTeX(content),
                    options: options.length > 0 ? [...options, '', '', ''].slice(0, 4) : ['', '', '', ''],
                    correctAnswer: String(row['Correct Answer'] || row['Answer'] || row['Correct'] || row['Ans'] || row['Suggested Answer'] || row['Expected Answer'] || ''),
                    explanation: sanitizeLaTeX(String(row['Detailed Solution'] || row['Explanation'] || row['Solution'] || row['Reasoning'] || row['Sol'] || '')),
                    type,
                    difficulty: (row['Difficulty'] || row['Level'] || row['Diff'] || 'MEDIUM').toUpperCase(),
                    subject: row['Subject'] || row['Sub'] || 'Mathematics',
                    classLevel: row['Class'] || row['Grade'] || row['Standard'] || 'Class 12',
                    examType: row['Exam'] || row['Board'] || row['Target'] || 'Board',
                    tags: row['Tags'] ? String(row['Tags']).split(',').map(t => t.trim()) : [],
                    tagInput: '',
                };
            });

            setQuestions(prev => [...prev, ...mapped]);
            setExcelStatus('done');
            showMsg('success', `Imported ${mapped.length} questions from Excel!`);
            checkDuplicatesForQueue(mapped);
        } catch (err: any) {
            setExcelStatus('error');
            setExcelError(err.message);
        }
    };

    const downloadTemplate = (type: 'MCQ' | 'SUBJECTIVE' | 'CASE_STUDY') => {
        let headers: string[] = [];
        let samples: any[] = [];

        if (type === 'MCQ') {
            headers = ['Question Type', 'Question Text', 'Assertion', 'Reason', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Detailed Solution', 'Difficulty', 'Subject', 'Topic', 'Tags'];
            samples = [
                {
                    'Question Type': 'SINGLE_CHOICE',
                    'Question Text': 'Find $x$ in $2x + 5 = 15$.',
                    'Option A': '5', 'Option B': '10', 'Option C': '15', 'Option D': '20',
                    'Correct Answer': 'A', 'Detailed Solution': '$2x=10 \\implies x=5$',
                    'Difficulty': 'EASY', 'Subject': 'Math', 'Topic': 'Algebra', 'Tags': 'Linear'
                },
                {
                    'Question Type': 'ASSERTION_REASONING',
                    'Question Text': 'Assertion: All primes are odd. Reason: 2 is prime.',
                    'Option A': 'Both A and R are true and R is correct explanation',
                    'Option B': 'Both A and R are true but R is NOT correct explanation',
                    'Option C': 'A is true but R is false',
                    'Option D': 'A is false but R is true',
                    'Correct Answer': 'D', 'Detailed Solution': '2 is an even prime.',
                    'Difficulty': 'MEDIUM', 'Subject': 'Math', 'Topic': 'Numbers', 'Tags': 'Logic'
                }
            ];
        } else if (type === 'SUBJECTIVE') {
            headers = ['Question Type', 'Question Text', 'Expected Answer', 'Detailed Solution', 'Difficulty', 'Subject', 'Topic', 'Tags'];
            samples = [
                {
                    'Question Type': 'SHORT_ANSWER',
                    'Question Text': 'Define Continuity.',
                    'Expected Answer': 'Limit equals function value.',
                    'Detailed Solution': '$\\lim_{x \\to a} f(x) = f(a)$',
                    'Difficulty': 'EASY', 'Subject': 'Math', 'Topic': 'Calculus', 'Tags': 'Limits'
                }
            ];
        } else if (type === 'CASE_STUDY') {
            headers = ['Common Passage', 'Question Text', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Detailed Solution', 'Difficulty', 'Subject', 'Topic', 'Tags'];
            samples = [
                {
                    'Common Passage': 'A ball is thrown with $v=20m/s$...',
                    'Question Text': 'Find the max height.',
                    'Option A': '10m', 'Option B': '20m', 'Option C': '30m', 'Option D': '40m',
                    'Correct Answer': 'B', 'Detailed Solution': '$H = v^2/2g$',
                    'Difficulty': 'HARD', 'Subject': 'Physics', 'Topic': 'Motion', 'Tags': 'Projectiles'
                }
            ];
        }

        const ws = XLSX.utils.json_to_sheet(samples, { header: headers });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Template");
        XLSX.writeFile(wb, `Mathswiz_${type}_Template.xlsx`);
    };



    // â”€â”€ Queue card state helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const updateCard = (id: string, field: keyof ExtractedQuestion, value: any) =>
        setQuestions(prev => prev.map(q => q.id === id ? { ...q, [field]: value } : q));
    const updateOption = (id: string, oIdx: number, value: string) =>
        setQuestions(prev => prev.map(q => {
            if (q.id !== id) return q;
            const opts = [...q.options]; opts[oIdx] = value; return { ...q, options: opts };
        }));
    const addTag = (id: string) =>
        setQuestions(prev => prev.map(q => {
            if (q.id !== id || !q.tagInput.trim()) return q;
            if (q.tags.includes(q.tagInput.trim())) return { ...q, tagInput: '' };
            return { ...q, tags: [...q.tags, q.tagInput.trim()], tagInput: '' };
        }));
    const removeTag = (id: string, tag: string) =>
        setQuestions(prev => prev.map(q => q.id === id ? { ...q, tags: q.tags.filter(t => t !== tag) } : q));

    // â”€â”€ Draft card state helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const updateDraftCard = (id: string, field: keyof ExtractedQuestion, value: any) =>
        setDraftQuestions(prev => prev.map(q => q.id === id ? { ...q, [field]: value } : q));
    const updateDraftOption = (id: string, oIdx: number, value: string) =>
        setDraftQuestions(prev => prev.map(q => {
            if (q.id !== id) return q;
            const opts = [...q.options]; opts[oIdx] = value; return { ...q, options: opts };
        }));
    const addDraftTag = (id: string) =>
        setDraftQuestions(prev => prev.map(q => {
            if (q.id !== id || !q.tagInput.trim()) return q;
            if (q.tags.includes(q.tagInput.trim())) return { ...q, tagInput: '' };
            return { ...q, tags: [...q.tags, q.tagInput.trim()], tagInput: '' };
        }));
    const removeDraftTag = (id: string, tag: string) =>
        setDraftQuestions(prev => prev.map(q => q.id === id ? { ...q, tags: q.tags.filter(t => t !== tag) } : q));

    // â”€â”€ Save newly extracted questions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const saveQuestion = async (q: ExtractedQuestion, status: 'DRAFT' | 'APPROVED') => {
        if (status === 'APPROVED') {
            const res = await fetch('/api/questions/check-duplicate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: q.content })
            });
            const { isDuplicate } = await res.json();
            if (isDuplicate && !window.confirm('âš ï¸ A similar question already exists.\nApprove anyway?')) return;
        }
        try {
            const res = await fetch('/api/questions', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: q.content,
                    options: q.options.some(o => o.trim()) ? q.options : undefined,
                    correctAnswer: q.correctAnswer || undefined,
                    explanation: q.explanation || undefined,
                    type: q.type, difficulty: q.difficulty,
                    subject: q.subject, class: q.classLevel, examType: q.examType,
                    tags: q.tags, status,
                    taxonomyTagIds: selectedTaxonomyIds,
                    createdById: (session?.user as any)?.id || 'admin'
                })
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Save failed'); }
            setQuestions(prev => prev.filter(x => x.id !== q.id));
            showMsg('success', status === 'APPROVED' ? 'âœ“ Published to question bank!' : 'âœ“ Saved as draft.');
        } catch (err: any) { showMsg('error', err.message); }
    };

    // â”€â”€ Bulk Import Helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const handleBulkImport = async () => {
        if (selectedIds.size === 0) return;
        setIsBulkImporting(true);
        const toSave = questions.filter(q => selectedIds.has(q.id));
        let successCount = 0;
        let failCount = 0;

        for (const q of toSave) {
            try {
                // Check duplicates first
                const dupRes = await fetch('/api/questions/check-duplicate', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: q.content })
                });
                const { isDuplicate } = await dupRes.json();
                if (isDuplicate) {
                    failCount++;
                    continue; // Skip silently or we could add a warning/flag
                }

                const res = await fetch('/api/questions', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content: q.content,
                        options: q.options.some(o => o.trim()) ? q.options : undefined,
                        correctAnswer: q.correctAnswer || undefined,
                        explanation: q.explanation || undefined,
                        type: q.type, difficulty: q.difficulty,
                        subject: q.subject, class: q.classLevel, examType: q.examType,
                        tags: q.tags, status: 'APPROVED',
                        taxonomyTagIds: selectedTaxonomyIds,
                        createdById: (session?.user as any)?.id || 'admin'
                    })
                });
                if (!res.ok) throw new Error('Save failed');
                successCount++;
                setQuestions(prev => prev.filter(x => x.id !== q.id));
                setSelectedIds(prev => { const n = new Set(prev); n.delete(q.id); return n; });
            } catch {
                failCount++;
            }
        }

        setIsBulkImporting(false);
        showMsg(failCount > 0 ? 'error' : 'success', `Bulk Import: ${successCount} saved, ${failCount} skipped/failed.`);
    };

    // â”€â”€ Background Duplicate Checker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const checkDuplicatesForQueue = async (qs: ExtractedQuestion[]) => {
        if (qs.length === 0) return;
        setIsDuplicateChecking(true);
        for (const q of qs) {
            try {
                const res = await fetch('/api/questions/check-duplicate', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: q.content })
                });
                const data = await res.json();
                const isDuplicate = !!data.isDuplicate;
                const dupData: DuplicateMatchData | undefined = isDuplicate ? {
                    content: data.matchContent ?? '',
                    options: data.matchOptions ?? [],
                    explanation: data.matchExplanation ?? '',
                    type: data.matchTypeLabel ?? '',
                    difficulty: data.matchDifficulty ?? '',
                    class: data.matchClass ?? '',
                    topic: data.matchTopic ?? '',
                    subject: data.matchSubject ?? '',
                    examType: data.matchExamType ?? '',
                    tags: data.matchTags ?? [],
                    status: data.matchStatus ?? '',
                    similarity: data.similarity ?? 0,
                    matchType: data.matchType ?? '',
                } : undefined;
                setQuestions(prev => prev.map(x =>
                    x.id === q.id ? { 
                        ...x, 
                        isDuplicate, 
                        duplicateChecked: true,
                        duplicateMatchId: isDuplicate ? (data.existingId ?? null) : undefined,
                        duplicateMatchContent: isDuplicate ? (data.matchContent ?? null) : undefined,
                        duplicateMatchData: dupData,
                    } : x
                ));
            } catch {
                setQuestions(prev => prev.map(x =>
                    x.id === q.id ? { ...x, isDuplicate: false, duplicateChecked: true } : x
                ));
            }
        }
        setIsDuplicateChecking(false);
    };

    // â”€â”€ Batch Edit Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const batchSetDifficulty = useCallback((difficulty: string) => {
        setQuestions(prev => prev.map(q => selectedIds.has(q.id) ? { ...q, difficulty } : q));
    }, [selectedIds]);

    const batchSetType = useCallback((type: string) => {
        setQuestions(prev => prev.map(q => selectedIds.has(q.id) ? { ...q, type } : q));
    }, [selectedIds]);

    // â”€â”€ Approve / save / delete existing drafts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const saveDraftQuestion = async (q: ExtractedQuestion, status: 'DRAFT' | 'APPROVED') => {
        if (!q.dbId) return showMsg('error', 'Missing DB id.');
        if (status === 'APPROVED') {
            const res = await fetch('/api/questions/check-duplicate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: q.content })
            });
            const { isDuplicate } = await res.json();
            if (isDuplicate && !window.confirm('âš ï¸ A similar question already exists.\nApprove anyway?')) return;
        }
        try {
            const res = await fetch(`/api/questions/${q.dbId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status,
                    content: q.content,
                    options: q.options.some(o => o.trim()) ? q.options : undefined,
                    correctAnswer: q.correctAnswer || undefined,
                    explanation: q.explanation || undefined,
                    type: q.type, difficulty: q.difficulty,
                    subject: q.subject, class: q.classLevel, examType: q.examType,
                    tags: q.tags,
                    taxonomyTagIds: selectedTaxonomyIds,
                })
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Update failed'); }
            if (status === 'APPROVED') {
                setDraftQuestions(prev => prev.filter(x => x.id !== q.id));
                mutateDrafts();
                showMsg('success', 'âœ“ Approved & published!');
            } else {
                mutateDrafts();
                showMsg('success', 'âœ“ Draft saved.');
            }
        } catch (err: any) { showMsg('error', err.message); }
    };

    const deleteDraftQuestion = async (q: ExtractedQuestion) => {
        if (!q.dbId) return setDraftQuestions(prev => prev.filter(x => x.id !== q.id));
        if (!window.confirm('Delete this draft from the database? This cannot be undone.')) return;
        try {
            const res = await fetch(`/api/questions/${q.dbId}`, { method: 'DELETE' });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Delete failed'); }
            setDraftQuestions(prev => prev.filter(x => x.id !== q.id));
            mutateDrafts();
            showMsg('success', 'âœ“ Draft deleted.');
        } catch (err: any) { showMsg('error', err.message); }
    };

    const stitchDraftSolution = async (sourceId: string, targetId: string) => {
        const source = draftQuestions.find(q => q.id === sourceId);
        const target = draftQuestions.find(q => q.id === targetId);
        if (!source || !target || !target.dbId || !source.dbId) return;

        const mergedExplanation = target.explanation 
            ? `${target.explanation}\n\n**Appended Solution:**\n${source.explanation || source.content}`
            : source.explanation || source.content;

        setDraftQuestions(prev => prev.map(q => q.id === targetId ? { ...q, explanation: mergedExplanation } : q));

        const res = await fetch(`/api/questions/${target.dbId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ explanation: mergedExplanation })
        });
        
        if (!res.ok) {
            toast.error('Failed to update target question in DB');
            return;
        }

        const delRes = await fetch(`/api/questions/${source.dbId}`, { method: 'DELETE' });
        if (delRes.ok) {
            setDraftQuestions(prev => prev.filter(q => q.id !== sourceId));
            showMsg('success', 'Solution stitched and standalone source removed!');
            mutateDrafts();
        } else {
            toast.error('Failed to delete stitched source question');
        }
    };

    const stitchWorkspaceSolution = (sourceId: string, targetId: string) => {
        setQuestions(prev => {
            const source = prev.find(q => q.id === sourceId);
            const target = prev.find(q => q.id === targetId);
            if (!source || !target) return prev;
            
            const mergedExplanation = target.explanation 
                ? `${target.explanation}\n\n**Appended Solution:**\n${source.explanation || source.content}`
                : source.explanation || source.content;

            return prev.map(q => q.id === targetId ? { ...q, explanation: mergedExplanation } : q).filter(q => q.id !== sourceId);
        });
        showMsg('success', 'Solution stitched successfully in workspace!');
    };

    // â”€â”€ Shared alert overlay â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const AlertOverlay = () => (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
            {errorMsg && (
                <div className="flex items-center gap-3 bg-red-500 text-white px-5 py-3 rounded-xl shadow-2xl border border-red-400 pointer-events-auto text-sm font-bold">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {errorMsg}
                    <button onClick={() => setErrorMsg('')} className="ml-2 opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
                </div>
            )}
            {successMsg && (
                <div className="flex items-center gap-3 bg-emerald-500 text-white px-5 py-3 rounded-xl shadow-2xl border border-emerald-400 text-sm font-bold">
                    <CheckCircle2 className="w-4 h-4 shrink-0" /> {successMsg}
                </div>
            )}
            

        </div>
    );

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // UPLOAD / LANDING VIEW
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    return (
        <div className="min-h-screen bg-slate-950 flex flex-col font-sans">
            <AlertOverlay />

            {/* Header */}
            <div className="bg-slate-900 border-b border-slate-800 px-8 py-4 flex items-center justify-between">
                <Link 
                    href={session?.user && (session.user as any).role === 'TEACHER' ? "/teacher/dashboard" : "/admin/dashboard"} 
                    className="flex items-center gap-3 text-indigo-400 hover:text-indigo-300 transition-all group"
                >
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-all">
                        <ChevronLeft className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                        <span className="font-black text-[11px] uppercase tracking-[0.2em] leading-none">Back to Admin</span>
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Dashboard</span>
                    </div>
                </Link>
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-indigo-500/10 rounded-xl flex items-center justify-center">
                        <BookOpen className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-base font-black text-white tracking-tight">AI Extraction Studio</h1>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Mathpix OCR Â· Bulk Import</p>
                    </div>
                </div>
                <GlobalMathToolbar />
            </div>

            <div className={`${mainTab === 'drafts' || mainTab === 'qa' ? 'max-w-[98vw] mx-4' : 'max-w-4xl mx-auto'} mt-10 px-8 w-full pb-20`}>
                <Link href="/admin/dashboard" className="flex items-center text-blue-600 hover:text-blue-800 mb-6 font-semibold">
                    <ArrowLeft className="w-4 h-4 mr-2"/> Back to Admin Dashboard
                </Link>
                {/* Primary tabs */}
                <div className="flex gap-2 mb-10 bg-slate-800 p-1.5 rounded-2xl w-fit mx-auto">
                    {([
                        { key: 'pdf' as const, label: 'PDF / Image', icon: <UploadCloud className="w-4 h-4" />, color: 'bg-indigo-600', badge: undefined },
                        { key: 'word' as const, label: 'Word Document', icon: <FileUp className="w-4 h-4" />, color: 'bg-violet-600', badge: undefined },
                        { key: 'excel' as const, label: 'Excel / CSV', icon: <FileText className="w-4 h-4" />, color: 'bg-emerald-600', badge: undefined },
                        { key: 'manual' as const, label: 'Manual Entry', icon: <PenLine className="w-4 h-4" />, color: 'bg-slate-600', badge: undefined },
                        { key: 'drafts' as const, label: 'Pending Drafts', icon: <Clock className="w-4 h-4" />, color: 'bg-amber-600', badge: draftQuestions.length },
                        { key: 'qa' as const, label: 'QA Issues', icon: <AlertTriangle className="w-4 h-4" />, color: 'bg-red-600', badge: flaggedDrafts.length },
                    ] as { key: 'pdf' | 'word' | 'excel' | 'manual' | 'drafts' | 'qa'; label: string; icon: React.ReactNode; color: string; badge: number | undefined }[]).map(({ key, label, icon, color, badge }) => (
                        <button key={key} onClick={() => setMainTab(key)}
                            className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${mainTab === key ? `${color} text-white shadow-lg` : 'text-slate-400 hover:text-white'}`}>
                            {icon} {label}
                            {badge != null && badge > 0 && <span className="bg-white/20 text-white text-[10px] px-2 py-0.5 rounded-full font-black">{badge}</span>}
                        </button>
                    ))}
                </div>

                {/* â”€â”€ Tab: PDF / Image â”€â”€ */}
                {mainTab === 'pdf' && (
                    <div className="space-y-6">
                        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Folder className="w-4 h-4 text-indigo-400" /> 1. Select Topic
                                </h3>
                                <button 
                                    onClick={async () => {
                                        const loading = toast.loading("Clearing stuck jobs...");
                                        try {
                                            const res = await fetch("/api/admin/ingest/clear-jobs", { method: "POST" });
                                            const data = await res.json();
                                            if (data.success) toast.success(data.message, { id: loading });
                                            else throw new Error(data.error);
                                        } catch (err: any) {
                                            toast.error(err.message, { id: loading });
                                        }
                                    }}
                                    className="px-3 py-1 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-lg text-xs font-bold transition-colors"
                                >
                                    Wipe Stuck Jobs (Temp)
                                </button>
                            </div>
                            <TaxonomyCascadeSelector 
                                selectedIds={selectedTaxonomyIds} 
                                onSelectMultiple={setSelectedTaxonomyIds}
                            />
                        </div>

                        <div
                            onClick={() => {
                                if (selectedTaxonomyIds.length === 0) {
                                    toast.error("Please select at least one Topic or Sub-Topic first.");
                                    return;
                                }
                                fileInputRef.current?.click();
                            }}
                            className="w-full border-2 border-dashed border-slate-700 hover:border-indigo-500 bg-slate-900 hover:bg-slate-800/80 rounded-[3rem] p-16 flex flex-col items-center justify-center text-center transition-all cursor-pointer group mt-6"
                        >
                            <div className="w-20 h-20 bg-indigo-500/10 rounded-3xl flex items-center justify-center mb-6 text-indigo-400 group-hover:scale-110 transition-transform">
                                <UploadCloud className="w-10 h-10" />
                            </div>
                            <h3 className="text-xl font-black text-white mb-2">Click to browse or drag and drop a PDF here</h3>
                            <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-2">Local PDF Batch Extraction via Mathpix</p>
                            <input ref={fileInputRef} type="file" onChange={handleFileUpload} className="hidden" accept="application/pdf,image/*" id="pdf-upload" />
                        </div>
                    </div>
                )}

                {/* â”€â”€ Tab: Word Document â”€â”€ */}
                {mainTab === 'word' && (
                    <div className="space-y-6">
                        <div
                            onClick={() => docxInputRef.current?.click()}
                            className="border-2 border-dashed border-slate-700 hover:border-violet-500 bg-slate-900 hover:bg-slate-800/80 rounded-3xl p-16 flex flex-col items-center justify-center text-center transition-all cursor-pointer group"
                        >
                            <div className="w-20 h-20 bg-violet-500/10 rounded-3xl flex items-center justify-center mb-6 text-violet-400 group-hover:scale-110 transition-transform">
                                <FileUp className="w-10 h-10" />
                            </div>
                            <h3 className="text-xl font-black text-white mb-2">Upload Word Document</h3>
                            <p className="text-slate-500 font-medium text-sm flex items-center gap-2 mt-1">
                                <MousePointerClick className="w-4 h-4" /> Click or drag &amp; drop (.docx)
                            </p>
                            <div className="mt-5 flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 rounded-xl px-4 py-2">
                                <span className="text-[11px] text-violet-300 font-bold">mammoth text extraction â†’ OpenRouter LLM structuring</span>
                            </div>
                            <input ref={docxInputRef} type="file" onChange={handleWordUpload} className="hidden" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
                        </div>

                        {/* Word processing status */}
                        {wordStatus !== 'idle' && (
                            <div className={`rounded-2xl border p-5 flex items-center gap-4 ${wordStatus === 'error' ? 'bg-red-500/10 border-red-500/30' : wordStatus === 'done' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-violet-500/10 border-violet-500/30'}`}>
                                {(wordStatus === 'parsing' || wordStatus === 'structuring') && <Loader2 className="w-5 h-5 text-violet-400 animate-spin shrink-0" />}
                                {wordStatus === 'done' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
                                {wordStatus === 'error' && <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />}
                                <div>
                                    <p className="text-sm font-black text-white">
                                        {wordStatus === 'parsing' && `Parsing "${wordFileName}"...`}
                                        {wordStatus === 'structuring' && 'Sending to AI for question extraction...'}
                                        {wordStatus === 'done' && `"${wordFileName}" processed successfully â€” check the queue below!`}
                                        {wordStatus === 'error' && 'Processing failed'}
                                    </p>
                                    {wordStatus === 'error' && <p className="text-xs text-red-400 mt-1">{wordError}</p>}
                                </div>
                            </div>
                        )}

                        {/* Show the queue inline on word tab */}
                        {questions.length > 0 && (
                            <div className="flex gap-4 mt-8">
                                {showRawMarkdown && rawMarkdown && (
                                    <SourcePanel rawMarkdown={rawMarkdown} fullRawText={fullRawText} sourceViewMode={sourceViewMode} setSourceViewMode={setSourceViewMode} color="indigo" pdfUrl={pdfUrl} pageNumber={currentPage} />
                                )}
                                <div className={`${showRawMarkdown && rawMarkdown ? 'w-1/2' : 'w-full'} space-y-4`}>
                                    {rawMarkdown && (
                                        <div className="flex items-center justify-end">
                                            <button onClick={() => setShowRawMarkdown(v => !v)}
                                                className={`flex items-center gap-1.5 border text-xs font-bold transition-all px-3 py-1.5 rounded-lg ${showRawMarkdown ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/30' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}>
                                                <FileText className="w-3.5 h-3.5" /> {showRawMarkdown ? 'Hide Source' : 'View Source'}
                                            </button>
                                        </div>
                                    )}
                                    <QueuePanelHeader 
                                        count={questions.length}
                                        selectedCount={selectedIds.size}
                                        allSelected={questions.length > 0 && questions.every(q => selectedIds.has(q.id))}
                                        toggleSelectAll={() => {
                                            if (questions.every(q => selectedIds.has(q.id))) setSelectedIds(prev => { const n = new Set(prev); questions.forEach(q => n.delete(q.id)); return n; });
                                            else setSelectedIds(prev => { const n = new Set(prev); questions.forEach(q => n.add(q.id)); return n; });
                                        }}
                                        onAddBlank={() => setQuestions(prev => [blankQuestion(), ...prev])}
                                        onBulkImport={handleBulkImport}
                                        isBulkImporting={isBulkImporting}
                                        onBatchSetDifficulty={batchSetDifficulty}
                                        onBatchSetType={batchSetType}
                                    />
                                    <div className="space-y-8">
                                        {questions.map((q, idx) => (
                                            <ReviewCard key={q.id} q={q} idx={idx}
                                                onUpdate={updateCard} onUpdateOption={updateOption}
                                                onAddTag={addTag} onRemoveTag={removeTag}
                                                onDelete={(id) => setQuestions(prev => prev.filter(x => x.id !== id))}
                                                onSave={saveQuestion}
                                                isSelected={selectedIds.has(q.id)}
                                                onToggleSelect={() => setSelectedIds(prev => { const n = new Set(prev); n.has(q.id) ? n.delete(q.id) : n.add(q.id); return n; })}
                                                isEditing={editingIds.has(q.id)}
                                                onToggleEdit={() => setEditingIds(prev => { const n = new Set(prev); n.has(q.id) ? n.delete(q.id) : n.add(q.id); return n; })}
                                                onStitch={stitchWorkspaceSolution}
                                                stitchTargets={questions.filter(x => x.id !== q.id).map((x, iIdx) => ({ id: x.id, label: `Workspace #${questions.findIndex(wq => wq.id === x.id) + 1} (${x.content.substring(0,25)}...)` }))}
                                                fullRawText={fullRawText} />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                {/* â”€â”€ Tab: Excel / CSV â”€â”€ */}
                {mainTab === 'excel' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Upload Area */}
                            <div 
                                onClick={() => excelInputRef.current?.click()}
                                className="border-2 border-dashed border-slate-700 hover:border-emerald-500 bg-slate-900 hover:bg-slate-800/80 rounded-3xl p-10 flex flex-col items-center justify-center text-center transition-all cursor-pointer group"
                            >
                                <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-4 text-emerald-400 group-hover:scale-110 transition-transform">
                                    <FileText className="w-8 h-8" />
                                </div>
                                <h3 className="text-lg font-black text-white mb-1">Upload Spreadsheet</h3>
                                <p className="text-slate-500 text-xs font-medium">Click to select .xlsx or .csv file</p>
                                <input ref={excelInputRef} type="file" onChange={handleExcelUpload} className="hidden" accept=".xlsx,.csv" />
                            </div>

                            {/* Template Area */}
                            {/* Template Area - Highly Aesthetic Cards */}
                            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col justify-center">
                                <h3 className="text-xs font-black text-slate-500 mb-6 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Clipboard className="w-4 h-4 text-emerald-400" /> Standardized Templates
                                </h3>
                                <div className="grid grid-cols-1 gap-4">
                                    <button 
                                        onClick={() => downloadTemplate('MCQ')}
                                        className="group flex items-center justify-between p-5 bg-gradient-to-br from-indigo-500/10 to-purple-600/5 hover:from-indigo-600 hover:to-purple-700 border border-indigo-500/20 rounded-2xl transition-all duration-300 shadow-lg hover:shadow-indigo-500/20"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 bg-white dark:bg-slate-800 rounded-xl text-indigo-600 group-hover:scale-110 transition-transform">
                                                <FileSpreadsheet className="w-5 h-5" />
                                            </div>
                                            <div className="text-left">
                                                <p className="text-sm font-black text-white group-hover:text-white">Objective (MCQ/MSQ)</p>
                                                <p className="text-[10px] text-slate-500 group-hover:text-indigo-100 font-bold uppercase tracking-wider">CBSE / JEE Format</p>
                                            </div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-white" />
                                    </button>

                                    <button 
                                        onClick={() => downloadTemplate('SUBJECTIVE')}
                                        className="group flex items-center justify-between p-5 bg-gradient-to-br from-emerald-500/10 to-teal-600/5 hover:from-emerald-600 hover:to-teal-700 border border-emerald-500/20 rounded-2xl transition-all duration-300 shadow-lg hover:shadow-emerald-500/20"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 bg-white dark:bg-slate-800 rounded-xl text-emerald-600 group-hover:scale-110 transition-transform">
                                                <FileText className="w-5 h-5" />
                                            </div>
                                            <div className="text-left">
                                                <p className="text-sm font-black text-white group-hover:text-white">Subjective (VSA/SA/LA)</p>
                                                <p className="text-[10px] text-slate-500 group-hover:text-emerald-100 font-bold uppercase tracking-wider">Theory & Answers</p>
                                            </div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-white" />
                                    </button>

                                    <button 
                                        onClick={() => downloadTemplate('CASE_STUDY')}
                                        className="group flex items-center justify-between p-5 bg-gradient-to-br from-amber-500/10 to-orange-600/5 hover:from-amber-600 hover:to-orange-700 border border-amber-500/20 rounded-2xl transition-all duration-300 shadow-lg hover:shadow-amber-500/20"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 bg-white dark:bg-slate-800 rounded-xl text-amber-600 group-hover:scale-110 transition-transform">
                                                <BookOpen className="w-5 h-5" />
                                            </div>
                                            <div className="text-left">
                                                <p className="text-sm font-black text-white group-hover:text-white">Case Study / Passage</p>
                                                <p className="text-[10px] text-slate-500 group-hover:text-amber-100 font-bold uppercase tracking-wider">Contextual Quests</p>
                                            </div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-white" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {excelStatus !== 'idle' && (
                            <div className={`rounded-2xl border p-5 flex items-center gap-4 ${excelStatus === 'error' ? 'bg-red-500/10 border-red-500/30' : excelStatus === 'done' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-indigo-500/10 border-indigo-500/30'}`}>
                                {excelStatus === 'parsing' && <Loader2 className="w-5 h-5 text-indigo-400 animate-spin shrink-0" />}
                                {excelStatus === 'done' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
                                {excelStatus === 'error' && <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />}
                                <div>
                                    <p className="text-sm font-black text-white">
                                        {excelStatus === 'parsing' && 'Analyzing spreadsheet data...'}
                                        {excelStatus === 'done' && 'Import complete â€” check the queue below!'}
                                        {excelStatus === 'error' && 'Excel processing failed'}
                                    </p>
                                    {excelStatus === 'error' && <p className="text-xs text-red-400 mt-1">{excelError}</p>}
                                </div>
                            </div>
                        )}

                        {/* Inline Queue for Excel */}
                        {questions.length > 0 && (
                            <div className="flex gap-4 mt-6">
                                {showRawMarkdown && rawMarkdown && (
                                    <SourcePanel rawMarkdown={rawMarkdown} fullRawText={fullRawText} sourceViewMode={sourceViewMode} setSourceViewMode={setSourceViewMode} color="emerald" pdfUrl={pdfUrl} pageNumber={currentPage} />
                                )}
                                <div className={`${showRawMarkdown && rawMarkdown ? 'w-1/2' : 'w-full'} space-y-4`}>
                                    {rawMarkdown && (
                                        <div className="flex items-center justify-end">
                                            <button onClick={() => setShowRawMarkdown(v => !v)}
                                                className={`flex items-center gap-1.5 border text-xs font-bold transition-all px-3 py-1.5 rounded-lg ${showRawMarkdown ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}>
                                                <FileText className="w-3.5 h-3.5" /> {showRawMarkdown ? 'Hide Source' : 'View Source'}
                                            </button>
                                        </div>
                                    )}
                                    <QueuePanelHeader 
                                        count={questions.length}
                                        selectedCount={selectedIds.size}
                                        allSelected={questions.length > 0 && questions.every(q => selectedIds.has(q.id))}
                                        toggleSelectAll={() => {
                                            if (questions.every(q => selectedIds.has(q.id))) setSelectedIds(prev => { const n = new Set(prev); questions.forEach(q => n.delete(q.id)); return n; });
                                            else setSelectedIds(prev => { const n = new Set(prev); questions.forEach(q => n.add(q.id)); return n; });
                                        }}
                                        onAddBlank={() => setQuestions(prev => [blankQuestion(), ...prev])}
                                        onBulkImport={handleBulkImport}
                                        isBulkImporting={isBulkImporting}
                                        color="emerald"
                                        onBatchSetDifficulty={batchSetDifficulty}
                                        onBatchSetType={batchSetType}
                                    />
                                    <div className="grid grid-cols-1 gap-8">
                                        {questions.map((q, idx) => (
                                            <ReviewCard key={q.id} q={q} idx={idx}
                                                onUpdate={updateCard} onUpdateOption={updateOption}
                                                onAddTag={addTag} onRemoveTag={removeTag}
                                                onDelete={(id) => setQuestions(prev => prev.filter(x => x.id !== id))}
                                                onSave={saveQuestion}
                                                isSelected={selectedIds.has(q.id)}
                                                onToggleSelect={() => setSelectedIds(prev => { const n = new Set(prev); n.has(q.id) ? n.delete(q.id) : n.add(q.id); return n; })}
                                                isEditing={editingIds.has(q.id)}
                                                onToggleEdit={() => setEditingIds(prev => { const n = new Set(prev); n.has(q.id) ? n.delete(q.id) : n.add(q.id); return n; })}
                                                onStitch={stitchWorkspaceSolution}
                                                stitchTargets={questions.filter(x => x.id !== q.id).map((x, iIdx) => ({ id: x.id, label: `Workspace #${questions.findIndex(wq => wq.id === x.id) + 1} (${x.content.substring(0,25)}...)` }))}
                                                fullRawText={fullRawText} />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}



                {mainTab === 'manual' && (
                    <div className="space-y-6">
                        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                            <h2 className="text-xl font-black text-white flex items-center gap-2">
                                <PenLine className="w-6 h-6 text-emerald-400" /> Manual Question Entry
                            </h2>
                            <div className="flex items-center gap-4">
                                <div className="w-full">
                                    <TaxonomyCascadeSelector 
                                        selectedIds={selectedTaxonomyIds} 
                                        onSelectMultiple={setSelectedTaxonomyIds}
                                    />
                                </div>
                                <button onClick={() => setQuestions(prev => [blankQuestion(), ...prev])}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-2xl font-black text-sm transition-all shadow-lg shadow-emerald-900/40 flex items-center gap-2">
                                    <Plus className="w-5 h-5" /> Add New Card
                                </button>
                            </div>
                        </div>
                        
                        {questions.length === 0 ? (
                            <div className="border-2 border-dashed border-slate-800 bg-slate-900/50 rounded-3xl p-20 flex flex-col items-center justify-center text-center">
                                <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mb-4 text-slate-500">
                                    <Clipboard className="w-8 h-8" />
                                </div>
                                <p className="text-slate-500 font-bold">No items in the creation queue.</p>
                                <button onClick={() => setQuestions([blankQuestion()])} className="mt-4 text-emerald-400 hover:text-emerald-300 font-black text-sm transition-colors">
                                    Click here to start with a blank question â†’
                                </button>
                            </div>
                        ) : (
                            <div className="flex gap-4">
                                {showRawMarkdown && rawMarkdown && (
                                    <SourcePanel rawMarkdown={rawMarkdown} fullRawText={fullRawText} sourceViewMode={sourceViewMode} setSourceViewMode={setSourceViewMode} color="emerald" pdfUrl={pdfUrl} pageNumber={currentPage} />
                                )}
                                <div className={`${showRawMarkdown && rawMarkdown ? 'w-1/2' : 'w-full'} space-y-4`}>
                                    {rawMarkdown && (
                                        <div className="flex items-center justify-end">
                                            <button onClick={() => setShowRawMarkdown(v => !v)}
                                                className={`flex items-center gap-1.5 border text-xs font-bold transition-all px-3 py-1.5 rounded-lg ${showRawMarkdown ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}>
                                                <FileText className="w-3.5 h-3.5" /> {showRawMarkdown ? 'Hide Source' : 'View Source'}
                                            </button>
                                        </div>
                                    )}
                                    <QueuePanelHeader 
                                        count={questions.length}
                                        selectedCount={selectedIds.size}
                                        allSelected={questions.length > 0 && questions.every(q => selectedIds.has(q.id))}
                                        toggleSelectAll={() => {
                                            if (questions.every(q => selectedIds.has(q.id))) setSelectedIds(prev => { const n = new Set(prev); questions.forEach(q => n.delete(q.id)); return n; });
                                            else setSelectedIds(prev => { const n = new Set(prev); questions.forEach(q => n.add(q.id)); return n; });
                                        }}
                                        onAddBlank={() => setQuestions(prev => [blankQuestion(), ...prev])}
                                        onBulkImport={handleBulkImport}
                                        isBulkImporting={isBulkImporting}
                                        color="emerald"
                                        onBatchSetDifficulty={batchSetDifficulty}
                                        onBatchSetType={batchSetType}
                                    />
                                    <div className="space-y-8">
                                        {questions.map((q, idx) => (
                                            <ReviewCard key={q.id} q={q} idx={idx}
                                                onUpdate={updateCard} onUpdateOption={updateOption}
                                                onAddTag={addTag} onRemoveTag={removeTag}
                                                onDelete={(id) => setQuestions(prev => prev.filter(x => x.id !== id))}
                                                onSave={saveQuestion}
                                                isSelected={selectedIds.has(q.id)}
                                                onToggleSelect={() => setSelectedIds(prev => { const n = new Set(prev); n.has(q.id) ? n.delete(q.id) : n.add(q.id); return n; })}
                                                isEditing={editingIds.has(q.id)}
                                                onToggleEdit={() => setEditingIds(prev => { const n = new Set(prev); n.has(q.id) ? n.delete(q.id) : n.add(q.id); return n; })}
                                                onStitch={stitchWorkspaceSolution}
                                                stitchTargets={questions.filter(x => x.id !== q.id).map((x, iIdx) => ({ id: x.id, label: `Workspace #${questions.findIndex(wq => wq.id === x.id) + 1} (${x.content.substring(0,25)}...)` }))}
                                                fullRawText={fullRawText} />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* â”€â”€ Tab: Pending Drafts â”€â”€ */}
                {mainTab === 'drafts' && (
                    <div>
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-lg font-black text-white flex items-center gap-2">
                                    <Clock className="w-5 h-5 text-amber-400" /> Pending Drafts
                                    {!isDraftsLoading && <span className="bg-amber-600 text-white text-[10px] px-2 py-0.5 rounded-full font-black">{draftQuestions.length}</span>}
                                </h2>
                                <p className="text-[11px] text-slate-500 mt-0.5 uppercase tracking-widest font-bold">Review, edit &amp; publish questions from external imports</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => setIsSyncPaused(!isSyncPaused)}
                                    className={`flex items-center gap-2 border text-xs font-bold transition-all px-4 py-2 rounded-xl ${
                                        isSyncPaused 
                                            ? 'bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30' 
                                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                                    }`}
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncPaused ? '' : 'animate-spin'}`} /> 
                                    {isSyncPaused ? 'Sync Paused' : 'Auto-Sync On'}
                                </button>
                                {rawMarkdown && (
                                    <button 
                                        onClick={() => setShowRawMarkdown(!showRawMarkdown)}
                                        className={`flex items-center gap-2 border text-xs font-bold transition-all px-4 py-2 rounded-xl ${
                                            showRawMarkdown 
                                                ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 hover:bg-amber-500/30' 
                                                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                                        }`}
                                    >
                                        <FileText className="w-3.5 h-3.5" /> 
                                        {showRawMarkdown ? 'Hide Source' : 'View Source'}
                                    </button>
                                )}
                                <button 
                                    onClick={async () => {
                                        try {
                                            const db = await getCacheDB();
                                            const tx = db.transaction('extracted_questions', 'readwrite');
                                            tx.objectStore('extracted_questions').clear();
                                            toast.success('Extraction cache cleared!');
                                        } catch {
                                            toast.error('Failed to clear cache');
                                        }
                                    }}
                                    className="flex items-center gap-2 bg-slate-800 hover:bg-red-500/20 border border-slate-700 hover:border-red-500/40 text-slate-300 hover:text-red-400 px-4 py-2 rounded-xl text-xs font-bold transition-all"
                                >
                                    <Trash2 className="w-3.5 h-3.5" /> Clear Cache
                                </button>
                                <button onClick={() => mutateDrafts()} disabled={isDraftsLoading}
                                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50">
                                    <RefreshCw className={`w-3.5 h-3.5 ${isDraftsLoading ? 'animate-spin' : ''}`} /> Refresh
                                </button>
                            </div>
                        </div>
                        
                        {/* Split View: Raw Markdown (left) + Draft Questions (right) */}
                        <div className="flex gap-4">
                            {/* Left Panel: Raw Markdown */}
                            {showRawMarkdown && rawMarkdown && (
                                <SourcePanel rawMarkdown={rawMarkdown} fullRawText={fullRawText} sourceViewMode={sourceViewMode} setSourceViewMode={setSourceViewMode} color="amber" pdfUrl={pdfUrl} pageNumber={currentPage} />
                            )}
                            
                            {/* Right Panel: Draft Questions */}
                            <div className={`${showRawMarkdown && rawMarkdown ? 'w-1/2' : 'w-full'} transition-all`}>
                                {isDraftsLoading && (
                                    <div className="flex flex-col items-center justify-center h-64 gap-4">
                                        <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
                                        <p className="text-amber-400 text-sm font-black uppercase tracking-widest">Loading drafts...</p>
                                    </div>
                                )}
                                {!isDraftsLoading && draftQuestions.length === 0 && (
                                    <div className="flex flex-col items-center justify-center h-64 opacity-40 gap-4 bg-slate-900 rounded-3xl border border-slate-800">
                                        <CheckCircle2 className="w-14 h-14 text-emerald-500" />
                                        <p className="text-slate-400 font-black uppercase tracking-widest text-sm">No pending drafts â€” all clear!</p>
                                    </div>
                                )}
                                {!isDraftsLoading && draftQuestions.length > 0 && (
                                    <div className="space-y-8 pb-16 overflow-y-auto custom-scrollbar" style={{ height: 'calc(100vh - 280px)', minHeight: '500px' }}>
                                        <QueuePanelHeader 
                                            count={draftQuestions.length}
                                            selectedCount={0}
                                            allSelected={false}
                                            toggleSelectAll={() => {}}
                                            onAddBlank={() => {}}
                                            onBulkImport={() => {}}
                                            isBulkImporting={false}
                                            color="amber"
                                            hideActions
                                        />
                                        {draftQuestions.map((q, idx) => (
                                            <ReviewCard key={q.id} q={q} idx={idx} isDraft
                                                onUpdate={updateDraftCard} onUpdateOption={updateDraftOption}
                                                onAddTag={addDraftTag} onRemoveTag={removeDraftTag}
                                                onDelete={() => deleteDraftQuestion(q)}
                                                onSave={saveDraftQuestion}
                                                onStitch={stitchDraftSolution}
                                                stitchTargets={draftQuestions.filter(x => x.id !== q.id).map((x, iIdx) => ({ id: x.id, label: `Draft #${draftQuestions.findIndex(dq => dq.id === x.id) + 1} (${x.content.substring(0,25)}...)` }))}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* â”€â”€ Tab: QA Issues â”€â”€ */}
                {mainTab === 'qa' && (
                    <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6">
                        <div className="flex items-center gap-3 mb-6 flex-wrap">
                            <AlertTriangle className="w-5 h-5 text-red-400" />
                            <h2 className="text-lg font-black text-white">QA Issues</h2>
                            {!isDraftsLoading && <span className="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded-full font-black">{flaggedDrafts.length}</span>}
                            <p className="text-slate-400 text-xs font-semibold">Drafts auto-flagged for broken LaTeX, missing answers/options, answer mismatches, or missing data. Fix &amp; save, or delete.</p>
                        </div>

                        {isDraftsLoading && (
                            <div className="flex flex-col items-center justify-center h-64 gap-4">
                                <Loader2 className="w-10 h-10 text-red-500 animate-spin" />
                                <p className="text-red-400 text-sm font-black uppercase tracking-widest">Scanning drafts...</p>
                            </div>
                        )}
                        {!isDraftsLoading && flaggedDrafts.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-64 opacity-40 gap-4 bg-slate-900 rounded-3xl border border-slate-800">
                                <CheckCircle2 className="w-14 h-14 text-emerald-500" />
                                <p className="text-slate-400 font-black uppercase tracking-widest text-sm">No QA issues â€” all drafts look clean!</p>
                            </div>
                        )}
                        {!isDraftsLoading && flaggedDrafts.length > 0 && (
                            <div className="space-y-8 pb-16 overflow-y-auto custom-scrollbar" style={{ height: 'calc(100vh - 280px)', minHeight: '500px' }}>
                                {flaggedDrafts.map((q, idx) => (
                                    <ReviewCard key={q.id} q={q} idx={idx} isDraft
                                        onUpdate={updateDraftCard} onUpdateOption={updateDraftOption}
                                        onAddTag={addDraftTag} onRemoveTag={removeDraftTag}
                                        onDelete={() => deleteDraftQuestion(q)}
                                        onSave={saveDraftQuestion}
                                        onStitch={stitchDraftSolution}
                                        stitchTargets={draftQuestions.filter(x => x.id !== q.id).map((x) => ({ id: x.id, label: `Draft (${x.content.substring(0, 25)}...)` }))}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>


        </div>
    );
}

// â”€â”€â”€ Shared UI Components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function QueuePanelHeader({ 
    count, selectedCount, allSelected, toggleSelectAll, onAddBlank, onBulkImport, isBulkImporting, color = 'indigo', hideActions = false,
    onBatchSetDifficulty, onBatchSetType,
}: { 
    count: number; selectedCount: number; allSelected: boolean; toggleSelectAll: () => void; onAddBlank: () => void; 
    onBulkImport: () => void; isBulkImporting: boolean; color?: string; hideActions?: boolean;
    onBatchSetDifficulty?: (d: string) => void;
    onBatchSetType?: (t: string) => void;
}) {
    const bgColors: any = { indigo: 'bg-indigo-600', emerald: 'bg-emerald-600', violet: 'bg-violet-600', red: 'bg-red-600', blue: 'bg-blue-600', amber: 'bg-amber-600' };
    const borderColors: any = { indigo: 'border-indigo-500/30', emerald: 'border-emerald-500/30', violet: 'border-violet-500/30', red: 'border-red-500/30', blue: 'border-blue-500/30', amber: 'border-amber-500/30' };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl">
                <div className="flex items-center gap-4">
                    {!hideActions && (
                        <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                            className={`w-5 h-5 accent-${color}-500 shrink-0 cursor-pointer rounded-lg`} />
                    )}
                    <div>
                        <h3 className="text-sm font-black text-white flex items-center gap-2">
                            Review Queue <span className={`${bgColors[color]} text-white text-[10px] px-2 py-0.5 rounded-full font-black`}>{count}</span>
                        </h3>
                        {selectedCount > 0 && <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest mt-0.5">{selectedCount} items selected</p>}
                    </div>
                </div>
                {!hideActions && (
                    <div className="flex items-center gap-3">
                        <button onClick={onAddBlank}
                            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-4 py-2 rounded-xl text-xs font-bold transition-all">
                            <Plus className="w-4 h-4" /> Add Question
                        </button>
                        {selectedCount > 0 && (
                            <>
                                {onBatchSetDifficulty && (
                                    <select onChange={(e) => { if (e.target.value) { onBatchSetDifficulty(e.target.value); e.target.value = ''; } }}
                                        className="bg-slate-800 border border-slate-700 text-slate-300 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer outline-none">
                                        <option value="">Set difficultyâ€¦</option>
                                        <option value="EASY">EASY</option>
                                        <option value="MEDIUM">MEDIUM</option>
                                        <option value="HARD">HARD</option>
                                    </select>
                                )}
                                {onBatchSetType && (
                                    <select onChange={(e) => { if (e.target.value) { onBatchSetType(e.target.value); e.target.value = ''; } }}
                                        className="bg-slate-800 border border-slate-700 text-slate-300 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer outline-none">
                                        <option value="">Set typeâ€¦</option>
                                        <option value="SINGLE_CHOICE">Single MCQ</option>
                                        <option value="MULTIPLE_CHOICE">Multi MCQ</option>
                                        <option value="INTEGER">Integer</option>
                                        <option value="TRUE_FALSE">True/False</option>
                                        <option value="SUBJECTIVE">Subjective</option>
                                    </select>
                                )}
                                <button onClick={onBulkImport} disabled={isBulkImporting}
                                    className={`flex items-center gap-2 ${bgColors[color]} hover:opacity-90 disabled:opacity-50 text-white px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg`}>
                                    {isBulkImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}
                                    Import Selected ({selectedCount})
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
            
            {/* Legend */}
            {!hideActions && (
                <div className="flex items-center gap-6 text-[10px] font-bold uppercase text-slate-500 tracking-widest px-2">
                    <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-sm" /> NEWLY EXTRACTED</div>
                    <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm animate-pulse" /> SIMILAR QUESTION EXISTS</div>
                </div>
            )}
        </div>
    );
}

// â”€â”€â”€ Queue Panel (right side of workspace) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function QueuePanel({ questions, isExtracting, onUpdate, onUpdateOption, onAddTag, onRemoveTag, onDelete, onSave, onAddBlank,
    rightZoom, setRightZoom, selectedIds, setSelectedIds, editingIds, setEditingIds, isBulkImporting, handleBulkImport
}: {
    questions: ExtractedQuestion[];
    isExtracting: boolean;
    onUpdate: (id: string, field: keyof ExtractedQuestion, value: any) => void;
    onUpdateOption: (id: string, oIdx: number, value: string) => void;
    onAddTag: (id: string) => void;
    onRemoveTag: (id: string, tag: string) => void;
    onDelete: (id: string) => void;
    onSave: (q: ExtractedQuestion, status: 'DRAFT' | 'APPROVED') => void;
    onAddBlank: () => void;
    rightZoom: number;
    setRightZoom: (fn: (z: number) => number) => void;
    selectedIds: Set<string>;
    setSelectedIds: (fn: (s: Set<string>) => Set<string>) => void;
    editingIds: Set<string>;
    setEditingIds: (fn: (s: Set<string>) => Set<string>) => void;
    isBulkImporting: boolean;
    handleBulkImport: () => void;
}) {
    const allSelected = questions.length > 0 && questions.every(q => selectedIds.has(q.id));
    const toggleSelectAll = () => {
        if (allSelected) setSelectedIds(() => new Set());
        else setSelectedIds(() => new Set(questions.map(q => q.id)));
    };
    const toggleSelect = (id: string) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const toggleEdit = (id: string) => setEditingIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

    return (
        <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden" style={{ fontSize: `${rightZoom}%` }}>
            {/* Header row */}
            <div className="shrink-0 px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                        className="w-4 h-4 accent-indigo-500 shrink-0 cursor-pointer" />
                    <h3 className="text-sm font-black text-white flex items-center gap-2 truncate">
                        Queue <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded-full font-black">{questions.length}</span>
                    </h3>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {/* Right zoom controls */}
                    <div className="flex items-center gap-0.5 bg-slate-800 rounded-lg p-1">
                        <button onClick={() => setRightZoom(z => Math.max(z - 10, 60))} className="p-1 text-slate-400 hover:text-white"><ZoomOut className="w-3 h-3" /></button>
                        <span className="text-[9px] font-black text-slate-500 w-6 text-center">{rightZoom}%</span>
                        <button onClick={() => setRightZoom(z => Math.min(z + 10, 140))} className="p-1 text-slate-400 hover:text-white"><ZoomIn className="w-3 h-3" /></button>
                        <button onClick={() => setRightZoom(() => 100)} className="text-[9px] font-black px-1 text-slate-400 hover:text-white">FIT</button>
                    </div>
                    <button onClick={onAddBlank}
                        className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 border border-emerald-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all">
                        <PenLine className="w-3.5 h-3.5" /> +Add
                    </button>
                </div>
            </div>

            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
                <div className="shrink-0 px-4 py-2 bg-indigo-900/40 border-b border-indigo-500/30 flex items-center justify-between">
                    <span className="text-xs font-black text-indigo-300">{selectedIds.size} selected</span>
                    <button onClick={handleBulkImport} disabled={isBulkImporting}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
                        {isBulkImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckSquare className="w-3.5 h-3.5" />}
                        Import {selectedIds.size} Selected
                    </button>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
                {isExtracting && questions.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-64 gap-4">
                        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                        <p className="text-indigo-400 text-sm font-black uppercase tracking-widest">Mathpix OCR + AI Structuring...</p>
                    </div>
                )}
                {!isExtracting && questions.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-64 opacity-30 gap-4">
                        <Target className="w-14 h-14 text-slate-600" />
                        <p className="text-slate-500 font-black uppercase tracking-widest text-sm">Queue Empty â€” Extract a page or add manually</p>
                    </div>
                )}
                {questions.map((q, idx) => (
                    <ReviewCard key={q.id} q={q} idx={idx}
                        onUpdate={onUpdate} onUpdateOption={onUpdateOption}
                        onAddTag={onAddTag} onRemoveTag={onRemoveTag}
                        onDelete={onDelete} onSave={onSave}
                        isSelected={selectedIds.has(q.id)} onToggleSelect={() => toggleSelect(q.id)}
                        isEditing={editingIds.has(q.id)} onToggleEdit={() => toggleEdit(q.id)} />
                ))}
                {isExtracting && questions.length > 0 && (
                    <div className="flex items-center justify-center gap-3 p-4 bg-slate-900 rounded-2xl border border-slate-800">
                        <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                        <p className="text-indigo-400 text-xs font-black uppercase tracking-widest">Processing next page...</p>
                    </div>
                )}
            </div>
        </div>
    );
}

// â”€â”€â”€ Source Panel (side-by-side extracted markdown viewer) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function SourcePanel({ rawMarkdown, fullRawText, sourceViewMode, setSourceViewMode, color = 'indigo', pdfUrl, pageNumber = 1 }: {
    rawMarkdown: string;
    fullRawText?: string;
    sourceViewMode: 'raw' | 'rendered' | 'pdf';
    setSourceViewMode: (mode: 'raw' | 'rendered' | 'pdf') => void;
    color?: string;
    pdfUrl?: string | null;
    pageNumber?: number;
}) {
    const [sourceSource, setSourceSource] = useState<'markdown' | 'original'>('markdown');
    const [pdfCanvas, setPdfCanvas] = useState<HTMLCanvasElement | null>(null);
    const displayText = sourceSource === 'original' && fullRawText ? fullRawText : rawMarkdown;
    const borderColors: Record<string, string> = {
        indigo: 'border-indigo-500/30', emerald: 'border-emerald-500/30',
        amber: 'border-amber-500/30', violet: 'border-violet-500/30',
    };
    const bgColors: Record<string, string> = {
        indigo: 'bg-indigo-500/10', emerald: 'bg-emerald-500/10',
        amber: 'bg-amber-500/10', violet: 'bg-violet-500/10',
    };
    const textColors: Record<string, string> = {
        indigo: 'text-indigo-400', emerald: 'text-emerald-400',
        amber: 'text-amber-400', violet: 'text-violet-400',
    };
    const bc = borderColors[color] || borderColors.indigo;
    const bg = bgColors[color] || bgColors.indigo;
    const tc = textColors[color] || textColors.indigo;
    const hasBoth = !!fullRawText && rawMarkdown !== fullRawText;
    const hasPdf = !!pdfUrl;

    // Render PDF page to canvas when sourceViewMode === 'pdf'
    useEffect(() => {
        if (sourceViewMode !== 'pdf' || !pdfUrl) return;
        let cancelled = false;
        (async () => {
            const pdfjsLib = await loadPdfJs();
            if (cancelled) return;
            const loadingTask = pdfjsLib.getDocument(pdfUrl);
            const pdfDoc = await loadingTask.promise;
            if (cancelled) return;
            const page = await pdfDoc.getPage(Math.min(pageNumber, pdfDoc.numPages));
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
            if (!cancelled) setPdfCanvas(canvas);
        })();
        return () => { cancelled = true; };
    }, [sourceViewMode, pdfUrl, pageNumber]);

    const titleLabel = !hasPdf ? (sourceSource === 'original' ? 'Original Raw Text' : 'Extracted Markdown')
        : sourceViewMode === 'pdf' ? 'Original PDF Page'
        : sourceSource === 'original' ? 'Original Raw Text'
        : 'Extracted Markdown';

    return (
        <div className={`w-1/2 border ${bc} rounded-2xl overflow-hidden bg-slate-900/50 flex flex-col shrink-0`}
            style={{ height: 'calc(100vh - 280px)', minHeight: '500px' }}>
            <div className={`flex items-center justify-between px-4 py-3 ${bg} border-b ${bc} shrink-0`}>
                <div className="flex items-center gap-2 min-w-0">
                    {sourceViewMode === 'pdf' ? <Image className={`w-4 h-4 ${tc} shrink-0`} /> : <FileText className={`w-4 h-4 ${tc} shrink-0`} />}
                    <span className={`text-sm font-black ${tc} uppercase tracking-widest truncate`}>{titleLabel}</span>
                    {sourceViewMode !== 'pdf' && <span className="text-[10px] text-slate-500 font-bold shrink-0">({displayText.length.toLocaleString()} chars)</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {hasPdf && (
                        <button onClick={() => setSourceViewMode(sourceViewMode === 'pdf' ? 'rendered' : 'pdf')}
                            className={`flex items-center gap-1.5 ${bg} hover:opacity-80 border ${bc} ${tc} px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all`}>
                            {sourceViewMode === 'pdf' ? <FileText className="w-3 h-3" /> : <Image className="w-3 h-3" />}
                            {sourceViewMode === 'pdf' ? 'Markdown' : 'PDF Page'}
                        </button>
                    )}
                    {hasBoth && sourceViewMode !== 'pdf' && (
                        <button onClick={() => setSourceSource(s => s === 'markdown' ? 'original' : 'markdown')}
                            className={`flex items-center gap-1.5 ${bg} hover:opacity-80 border ${bc} ${tc} px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all`}>
                            {sourceSource === 'markdown' ? 'Original Text' : 'Markdown'}
                        </button>
                    )}
                    {sourceViewMode !== 'pdf' && (
                        <button onClick={() => setSourceViewMode(sourceViewMode === 'raw' ? 'rendered' : 'raw')}
                            className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all">
                            {sourceViewMode === 'raw' ? <Eye className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                            {sourceViewMode === 'raw' ? 'Rendered' : 'Raw'}
                        </button>
                    )}
                    {sourceViewMode !== 'pdf' && (
                        <button onClick={() => { navigator.clipboard.writeText(displayText); toast.success(`${sourceSource === 'original' ? 'Original' : 'Markdown'} source copied!`); }}
                            className={`flex items-center gap-1.5 ${bg} hover:opacity-80 border ${bc} ${tc} px-3 py-1.5 rounded-lg text-xs font-bold transition-all`}>
                            <Clipboard className="w-3.5 h-3.5" /> Copy All
                        </button>
                    )}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {sourceViewMode === 'pdf' ? (
                    pdfCanvas ? (
                        <div className="flex justify-center">
                            <img src={pdfCanvas.toDataURL()} alt="PDF Page" className="max-w-full h-auto rounded-lg shadow-xl" />
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="w-8 h-8 text-slate-500 animate-spin" />
                        </div>
                    )
                ) : sourceViewMode === 'raw' ? (
                    <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed select-all">
                        {displayText}
                    </pre>
                ) : (
                    <div className="text-sm text-slate-200 leading-relaxed prose max-w-none prose-invert">
                        <ReactMarkdown
                            remarkPlugins={[remarkMath]}
                            rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
                        >
                            {displayText}
                        </ReactMarkdown>
                    </div>
                )}
            </div>
        </div>
    );
}

// â”€â”€â”€ ReviewCard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface ReviewCardProps {
    q: ExtractedQuestion; idx: number; isDraft?: boolean;
    onUpdate: (id: string, field: keyof ExtractedQuestion, value: any) => void;
    onUpdateOption: (id: string, oIdx: number, value: string) => void;
    onAddTag: (id: string) => void;
    onRemoveTag: (id: string, tag: string) => void;
    onDelete: (id: string) => void;
    onSave: (q: ExtractedQuestion, status: 'DRAFT' | 'APPROVED') => void;
    isSelected?: boolean;
    onToggleSelect?: () => void;
    isEditing?: boolean;
    onToggleEdit?: () => void;
    onStitch?: (sourceId: string, targetId: string) => void;
    stitchTargets?: { id: string; label: string }[];
    fullRawText?: string;
}

function ReviewCard({ q, idx, isDraft, onUpdate, onUpdateOption, onAddTag, onRemoveTag, onDelete, onSave,
    isSelected, onToggleSelect, isEditing, onToggleEdit, onStitch, stitchTargets, fullRawText
}: ReviewCardProps) {
    const editing = isEditing ?? true; // drafts are always in edit mode; queue cards default to view mode
    const isDup = !!q.isDuplicate;
    const [showOriginal, setShowOriginal] = useState(false);
    const [showComparison, setShowComparison] = useState(false);

    // Debounced updates to avoid excessive re-renders and sync calls
    const debouncedOnUpdate = useCallback(
        debounce((id: string, field: keyof ExtractedQuestion, value: any) => {
            onUpdate(id, field, value);
        }, 500),
        [onUpdate]
    );

    const debouncedOnUpdateOption = useCallback(
        debounce((id: string, oIdx: number, value: string) => {
            onUpdateOption(id, oIdx, value);
        }, 500),
        [onUpdateOption]
    );

    // Clean up debounced functions on unmount
    useEffect(() => {
        return () => {
            debouncedOnUpdate.cancel();
            debouncedOnUpdateOption.cancel();
        };
    }, [debouncedOnUpdate, debouncedOnUpdateOption]);

    return (
        <div className={`border rounded-3xl overflow-hidden shadow-xl transition-all relative ${
            isDup ? 'bg-red-950/20 border-red-500 shadow-red-900/40 ring-2 ring-red-500/50' :
            isSelected ? 'bg-slate-900 border-indigo-500 shadow-indigo-900/40' :
            'bg-slate-900 border-slate-800'
        }`}>
            {isDup && (
                <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
                    <span className="bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded shadow-lg animate-pulse uppercase tracking-widest">
                        âš  Duplicate
                    </span>
                    {q.duplicateMatchData && (
                        <button onClick={() => setShowComparison(!showComparison)}
                            className="bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-400 px-2 py-0.5 rounded text-[9px] font-bold transition-all flex items-center gap-1">
                            <Eye className="w-3 h-3" /> {showComparison ? 'Hide' : 'Show Existing'}
                        </button>
                    )}
                </div>
            )}
            {isDup && showComparison && q.duplicateMatchData && (
                <div className="mx-4 mb-4 border border-red-500/30 bg-slate-900 rounded-2xl overflow-hidden shadow-lg animate-in fade-in zoom-in duration-200">
                    <div className="flex items-center justify-between px-4 py-2 bg-red-500/10 border-b border-red-500/20">
                        <span className="text-[10px] font-black text-red-400 uppercase tracking-widest flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5" /> Existing Question in Database
                        </span>
                        <span className="text-[9px] text-slate-500 font-mono">Match: {q.duplicateMatchData.similarity}% ({q.duplicateMatchData.matchType})</span>
                    </div>
                    <div className="p-4 space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
                        <div className="flex flex-wrap gap-1.5">
                            {q.duplicateMatchData.class && (
                                <span className="bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded text-[10px] font-bold">{q.duplicateMatchData.class}</span>
                            )}
                            {q.duplicateMatchData.topic && (
                                <span className="bg-purple-500/10 text-purple-300 px-2 py-0.5 rounded text-[10px] font-bold">{q.duplicateMatchData.topic}</span>
                            )}
                            {q.duplicateMatchData.difficulty && (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    q.duplicateMatchData.difficulty === 'EASY' ? 'bg-green-500/10 text-green-300' :
                                    q.duplicateMatchData.difficulty === 'HARD' ? 'bg-red-500/10 text-red-300' :
                                    'bg-yellow-500/10 text-yellow-300'
                                }`}>{q.duplicateMatchData.difficulty}</span>
                            )}
                            {q.duplicateMatchData.type && (
                                <span className="bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded text-[10px] font-bold">{q.duplicateMatchData.type.replace(/_/g, ' ')}</span>
                            )}
                            {q.duplicateMatchData.examType && (
                                <span className="bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded text-[10px] font-bold">{q.duplicateMatchData.examType}</span>
                            )}
                        </div>
                        <div className="bg-slate-800/50 rounded-xl p-3 text-sm text-slate-200">
                            <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-2">Question:</div>
                            <MathRenderer content={q.duplicateMatchData.content} />
                        </div>
                        {q.duplicateMatchData.options && q.duplicateMatchData.options.length > 0 && q.duplicateMatchData.options.some((o: string) => o.trim()) && (
                            <div className="grid grid-cols-2 gap-2">
                                {q.duplicateMatchData.options.map((opt: string, oi: number) => {
                                    const letter = String.fromCharCode(65 + oi);
                                    return opt.trim() ? (
                                        <div key={oi} className="flex items-start gap-2 p-2 rounded-lg text-xs bg-slate-800/30">
                                            <span className="font-bold shrink-0 text-slate-400">{letter}.</span>
                                            <MathRenderer content={opt} />
                                        </div>
                                    ) : null;
                                })}
                            </div>
                        )}
                        {q.duplicateMatchData.explanation && (
                            <div className="bg-blue-500/5 rounded-xl p-3 border border-blue-500/20">
                                <div className="text-[9px] text-blue-400 font-bold uppercase tracking-widest mb-1">Solution:</div>
                                <div className="text-xs text-slate-300">
                                    <MathRenderer content={q.duplicateMatchData.explanation} />
                                </div>
                            </div>
                        )}
                        {q.duplicateMatchData.tags && q.duplicateMatchData.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {q.duplicateMatchData.tags.map((t: string) => (
                                    <span key={t} className="px-2 py-0.5 text-[9px] rounded-full bg-slate-800 text-slate-400 border border-slate-700">{t}</span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}{/* Card header */}
            <div className={`flex items-center justify-between px-4 py-3 border-b border-slate-800 ${isDup ? 'bg-red-500/10' : 'bg-slate-800/40'}`}>
                <div className="flex items-center gap-2 min-w-0">
                    {onToggleSelect && (
                        <input type="checkbox" checked={!!isSelected} onChange={onToggleSelect}
                            className="w-4 h-4 accent-indigo-500 shrink-0 cursor-pointer" />
                    )}
                    <span className={`text-white text-[11px] font-black px-3 py-1 rounded-lg shrink-0 tracking-wide ${isDraft ? 'bg-gradient-to-br from-amber-500 to-orange-600' : 'bg-gradient-to-br from-indigo-500 to-purple-600'}`}>
                        Q{idx + 1}
                    </span>
                    {q.duplicateChecked === false && (
                        <span className="text-slate.600 text-[9px] font-bold animate-pulse">checkingâ€¦</span>
                    )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    {onToggleEdit && (
                        <button onClick={onToggleEdit}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${editing ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate.700'}`}>
                            <Edit3 className="w-3 h-3" /> {editing ? 'Done' : 'Edit'}
                        </button>
                    )}
                    <button onClick={() => setShowOriginal(v => !v)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${showOriginal ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate.700'}`}>
                        <Eye className="w-3 h-3" /> Source
                    </button>
                    <button onClick={() => onDelete(q.id)} className="text-slate.600 hover:text-red-400 hover:bg-red-400/10 p-1.5 rounded-lg transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
            
            {/* Side-by-Side Comparison Panel */}
            <AnimatePresence>
                {showOriginal && (fullRawText || q.originalRawText) && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-b border-amber-500/20 bg-amber-500/5"
                    >
                        <div className="p-4 flex gap-4">
                            <div className="flex-1 space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-[9px] font-black text-amber-500 uppercase tracking-widest block">Original Source Text</label>
                                    <button 
                                        onClick={() => {
                                            navigator.clipboard.writeText(fullRawText || q.originalRawText || '');
                                            toast.success('Source text copied!');
                                        }}
                                        className="flex items-center gap-1 text-amber-500 hover:text-amber-400 text-[9px] font-black uppercase tracking-widest transition-all"
                                    >
                                        <Clipboard className="w-3 h-3" /> Copy All
                                    </button>
                                </div>
                                <div className="bg-slate-950/50 rounded-xl p-4 text-xs text-slate.400 font-mono leading-relaxed max-h-[300px] overflow-y-auto shadow-inner border border-amber-500/10 whitespace-pre-wrap">
                                    {fullRawText || q.originalRawText}
                                </div>
                            </div>
                            <div className="flex items-center justify-center p-4">
                                <ArrowRight className="w-5 h-5 text-amber-500/30" />
                            </div>
                            <div className="flex-1 space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-[9px] font-black text-indigo-400 uppercase tracking-widest block">AI-Generated LaTeX Preview</label>
                                    <button 
                                        onClick={() => {
                                            navigator.clipboard.writeText(q.content || '');
                                            toast.success('LaTeX content copied!');
                                        }}
                                        className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 text-[9px] font-black uppercase tracking-widest transition-all"
                                    >
                                        <Clipboard className="w-3 h-3" /> Copy LaTeX
                                    </button>
                                </div>
                                <div className="bg-white rounded-xl p-4 text-sm text-slate-900 shadow-xl max-h-[300px] overflow-y-auto">
                                    <MathRenderer content={q.content || '*(empty content)*'} />
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* VIEW MODE: clean math preview */}
            {!editing && (
                <div className={`p-4 space-y-3 ${isDup ? 'line-through opacity-60' : ''}`}>
                    <div className="bg-white rounded-2xl p-4 text-sm text-slate-900 shadow-inner">
                        <MathRenderer content={q.content || '*(empty)*'} />
                    </div>
                    {q.options.some(o => o.trim()) && (
                        <div className="grid grid-cols-2 gap-2">
                            {q.options.map((opt, oIdx) => (
                                <div key={oIdx} className={`rounded-xl p-3 text-xs border ${q.correctAnswer.toUpperCase().includes(String.fromCharCode(65 + oIdx)) ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-slate-800 border-slate-700'}`}>
                                    <span className="font-black text-indigo-400 mr-2">{String.fromCharCode(65 + oIdx)}.</span>
                                    <span className="text-slate.300"><MathRenderer content={opt || 'â€”'} /></span>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex gap-2 pt-1">
                        <button onClick={() => onSave(q, 'DRAFT')} disabled={isDup}
                            className="flex-1 bg-slate.800 hover:bg-slate.700 disabled:opacity-30 disabled:cursor-not-allowed border border-slate.700 text-slate.300 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all">
                            <Save className="w-3.5 h-3.5" /> {isDraft ? 'Save Edits' : 'Save as Draft'}
                        </button>
                        <button onClick={() => onSave(q, 'APPROVED')} disabled={isDup}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-emerald-900/40">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Approve &amp; Publish
                        </button>
                    </div>
                    {onStitch && stitchTargets && stitchTargets.length > 0 && (
                        <div className="flex gap-2 pt-2 relative group">
                            <button className="flex-1 bg-violet-600/20 hover:bg-violet-600 border border-violet-500/30 text-violet-300 hover:text-white py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all">
                                <Link2 className="w-3.5 h-3.5" /> Stitch this into...
                            </button>
                            <div className="absolute bottom-full mb-2 hidden group-hover:block bg-slate-800 border border-slate-700 rounded-xl p-2 w-full z-50 shadow-2xl max-h-48 overflow-y-auto custom-scrollbar">
                                <div className="text-[9px] text-slate.500 uppercase tracking-widest font-black mb-2 px-2">Select target question:</div>
                                {stitchTargets.map(t => (
                                    <button key={t.id} onClick={() => onStitch(q.id, t.id)} className="w-full text-left px-3 py-2 hover:bg-indigo-500/20 text-slate.300 hover:text-indigo-400 text-xs rounded-lg transition-all font-bold truncate">
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
            
            {/* EDIT MODE: full LaTeX editor */}
            {editing && (
                <div className="p-4 space-y-4">
                    <div className="grid grid-cols-4 gap-4">
                        {[
                            { label: 'Type', field: 'type' as const, opts: [
                                ['SINGLE_CHOICE', 'Single MCQ'], 
                                ['MULTIPLE_CHOICE', 'Multi MCQ'], 
                                ['INTEGER', 'Integer'], 
                                ['FILL_IN_BLANKS', 'Fill in Blanks'],
                                ['ASSERTION_REASONING', 'Assertion & Reasoning'],
                                ['CASE_STUDY', 'Case Study'],
                                ['VERY_SHORT_ANSWER', 'Very Short Ans'],
                                ['SHORT_ANSWER', 'Short Answer'],
                                ['LONG_ANSWER', 'Long Answer']
                            ] },
                            { label: 'Difficulty', field: 'difficulty' as const, opts: [['EASY', 'Easy'], ['MEDIUM', 'Medium'], ['HARD', 'Hard']] },
                            { label: 'Subject', field: 'subject' as const, opts: [['Mathematics', 'Mathematics'], ['Physics', 'Physics'], ['Chemistry', 'Chemistry']] },
                            { label: 'Class', field: 'classLevel' as const, opts: [['Class 12', 'Class 12'], ['Class 11', 'Class 11'], ['NDA', 'NDA']] },
                        ].map(({ label, field, opts }) => (
                            <div key={field}>
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">{label}</label>
                                <select value={(q as any)[field]} onChange={e => onUpdate(q.id, field, e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-indigo-500 font-semibold">
                                    {opts.map(([val, lbl]) => <option key={val} value={val} className="bg-slate-800">{lbl}</option>)}
                                </select>
                            </div>
                        ))}
                    </div>

                    {/* Tags section */}
                    <div>
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Tags</label>
                        <div className="flex flex-wrap gap-1 items-center">
                            {q.tags.map(tag => (
                                <span key={tag} className="bg-slate-700 text-slate-300 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 group">
                                    {tag}
                                    <X className="w-2.5 h-2.5 cursor-pointer opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all" onClick={() => onRemoveTag(q.id, tag)} />
                                </span>
                            ))}
                            <input type="text" value={q.tagInput}
                                onChange={e => {
                                    const val = e.target.value;
                                    if (val.includes(',')) {
                                        const parts = val.split(',');
                                        const newTag = parts[0].trim();
                                        if (newTag) {
                                            onUpdate(q.id, 'tagInput', parts.slice(1).join(','));
                                            onUpdate(q.id, 'tags', [...q.tags, newTag]);
                                        }
                                    } else {
                                        onUpdate(q.id, 'tagInput', val);
                                    }
                                }}
                                onKeyDown={e => { 
                                    if (e.key === 'Enter') { 
                                        e.preventDefault(); 
                                        const val = q.tagInput.trim();
                                        if (val) {
                                            onUpdate(q.id, 'tags', [...q.tags, val]);
                                            onUpdate(q.id, 'tagInput', '');
                                        }
                                    } 
                                }}
                                placeholder="+ tag"
                                className="bg-transparent border border-dashed border-slate-600 rounded px-1.5 py-0.5 text-[10px] text-slate.400 w-16 outline-none focus:border-indigo-500 focus:text-white" />
                            <div className="flex gap-1 ml-2">
                                {['Board', 'NDA', 'JEE', 'MCQ'].map(t => (
                                    <button key={t} onClick={() => !q.tags.includes(t) && onUpdate(q.id, 'tags', [...q.tags, t])}
                                        className="bg-slate-800 hover:bg-slate-700 text-slate-500 hover:text-indigo-300 px-1.5 py-0.5 rounded text-[8px] font-black transition-all border border-slate-700">
                                        +{t}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <QAFlags q={{ content: q.content, options: q.options, correctAnswer: q.correctAnswer, explanation: q.explanation, type: q.type }} />

                    <FieldRow label="Problem Statement" value={q.content} onChange={v => onUpdate(q.id, 'content', v)} rows={4} tags={q.tags} />
                    
                    <div>
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Answer Options</label>
                        {['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'ASSERTION_REASONING'].includes(q.type) && (
                            <div className="grid grid-cols-2 gap-3">
                                {q.options.map((opt, oIdx) => {
                                    const letter = String.fromCharCode(65 + oIdx);
                                    const isCorrect = q.correctAnswer.toUpperCase().includes(letter);
                                    return (
                                        <div key={oIdx} className="space-y-1">
                                            <div className="flex items-center justify-between px-1">
                                                <div className="flex items-center gap-2">
                                                    <input 
                                                        type="radio" 
                                                        name={`correct-${q.id}`}
                                                        checked={isCorrect}
                                                        onChange={() => onUpdate(q.id, 'correctAnswer', letter)}
                                                        className="w-3 h-3 accent-emerald-500 cursor-pointer"
                                                    />
                                                    <div className={`text-[9px] font-black uppercase tracking-widest ${isCorrect ? 'text-emerald-400' : 'text-slate-500'}`}>Option {letter}</div>
                                                </div>
                                                {isCorrect && <span className="text-[8px] text-emerald-500 font-black uppercase tracking-tighter">âœ“ Correct</span>}
                                            </div>
                                            <FieldRow label="" value={opt} onChange={v => onUpdateOption(q.id, oIdx, v)} rows={2} compact />
                                            
                                            {!isCorrect && (
                                                <button 
                                                    onClick={() => onUpdate(q.id, 'correctAnswer', letter)}
                                                    className="w-full mt-1 bg-slate-800/50 hover:bg-emerald-500/10 text-[8px] font-black text-slate.600 hover:text-emerald-500 py-1 rounded-lg border border-transparent hover:border-emerald-500/30 transition-all uppercase tracking-tighter"
                                                >
                                                    Mark as Correct
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-4 gap-4">
                        <div className="col-span-1 space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Answer Key</label>
                            <input value={q.correctAnswer} onChange={e => onUpdate(q.id, 'correctAnswer', e.target.value.toUpperCase())}
                                placeholder={q.type === 'SINGLE_CHOICE' || q.type === 'MULTIPLE_CHOICE' ? 'A' : 'Ans'}
                                className="w-full bg-slate-800 border-2 border-slate-700 rounded-xl py-3 text-sm text-center text-indigo-400 font-black outline-none focus:border-indigo-500 transition-colors" />
                        </div>
                        <div className="col-span-3">
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Explanation</label>
                                <button
                                    title="Paste from clipboard"
                                    onClick={async () => {
                                        try {
                                            const text = await navigator.clipboard.readText();
                                            onUpdate(q.id, 'explanation', text);
                                        } catch {}
                                    }}
                                    className="flex items-center gap-1 text-slate-600 hover:text-indigo-400 text-[9px] font-black uppercase tracking-widest transition-all">
                                    <Clipboard className="w-3 h-3" /> Quick Paste
                                </button>
                            </div>
                            <FieldRow label="" value={q.explanation} onChange={v => onUpdate(q.id, 'explanation', v)} rows={3} />
                        </div>
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-slate-800">
                        <button onClick={() => onSave(q, 'DRAFT')} disabled={isDup}
                            className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed border border-slate-700 text-slate-300 py-3 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all">
                            <Save className="w-4 h-4" /> {isDraft ? 'Save Edits' : 'Save as Draft'}
                        </button>
                        <button onClick={() => onSave(q, 'APPROVED')} disabled={isDup}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed text-white py-3 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-900/40">
                            <CheckCircle2 className="w-4 h-4" /> Approve &amp; Publish
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// â”€â”€â”€ FieldRow (side-by-side LaTeX textarea | MathRenderer) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function FieldRow({ label, value, onChange, rows, compact, tags }: {
    label: string; value: string; onChange: (v: string) => void; rows: number; compact?: boolean; tags?: string[];
}) {
    return (
        <div className={compact ? '' : 'space-y-1'}>
            {label && <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">{label}</label>}
            <div className="grid grid-cols-2 gap-2">
                <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} placeholder="LaTeX source..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs font-mono text-slate-300 resize-none outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all custom-scrollbar" />
                <div className="bg-white rounded-xl p-3 text-xs text-slate-900 overflow-auto select-none pointer-events-none border border-slate-200"
                    style={{ minHeight: `${rows * 1.75}rem` }} onContextMenu={e => e.preventDefault()}>
                    <MathRenderer content={value || '*(empty)*'} />
                    {tags && <QuestionTags tags={tags} />}
                </div>
            </div>
        </div>
    );
}

function FolderIcon(props: any) {
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
            <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
        </svg>
    )
}





