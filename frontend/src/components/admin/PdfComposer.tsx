'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  X, Save, Plus, Trash2, FileText, CheckCircle, 
  ChevronRight, ChevronLeft, Loader2, Sparkles, 
  ExternalLink, BookOpen, HelpCircle, Eye, 
  Edit3, ArrowRightToLine, ScanSearch, ListChecks, Copy, Circle
} from 'lucide-react';
import toast from 'react-hot-toast';
import MathRenderer from '@/components/MathRenderer';
import { parseQuestionsFromMarkdown, createQuestionFromParsed } from '@/lib/question-parser';
import type { ParsedQuestion } from '@/lib/question-parser';
import QuestionReview from '@/components/admin/QuestionReview';

type QuestionType = 'MCQ' | 'ASSERTION_REASONING' | 'CASE_STUDY' | 'VERY_SHORT_ANSWER' | 'SHORT_ANSWER' | 'LONG_ANSWER' | 'FILL_IN_THE_BLANK';

interface AuthoredSubQuestion {
  id: string;
  question: string;
  options: { label: string; text: string }[];
  correctOption: string | null;
  solution: string;
}

interface AuthoredQuestion {
  id: string;
  type: QuestionType;
  question: string;
  solution: string;
  tags?: string[];
  options?: { label: string; text: string }[];
  correctOption?: string | null;
  assertion?: string;
  reasoning?: string;
  passage?: string;
  subQuestions?: AuthoredSubQuestion[];
}

interface SessionData {
  id: string;
  status: string;
  authoredQuestions: AuthoredQuestion[];
  topicIds: string[] | null;
  topicId: string | null;
  topicName: string | null;
  subjectName: string | null;
  className: string | null;
  sourceDocument: {
    id: string;
    title: string;
    filePath: string;
    totalPages: number;
    pages: { pageNumber: number; rawMarkdown: string }[];
  } | null;
  solutionDocument: {
    id: string;
    title: string;
    filePath: string;
    totalPages: number;
    pages: { pageNumber: number; rawMarkdown: string }[];
  } | null;
}

type TargetField = 'question' | 'solution' | 'assertion' | 'reasoning' | 'passage' | `option-${string}` | 'sub-question' | 'sub-solution';

function TargetDot({ field, current, onSelect }: { field: TargetField | null; current: TargetField | null; onSelect: (f: TargetField) => void }) {
  if (!field) return null;
  const isActive = current === field;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onSelect(field); }}
      title={`Set as paste target${isActive ? ' (active)' : ''}`}
      className={`flex-shrink-0 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-colors ${
        isActive ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300 hover:border-indigo-400'
      }`}
    >
      {isActive && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
    </button>
  );
}

export function PdfComposer({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [questions, setQuestions] = useState<AuthoredQuestion[]>([]);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isInserting, setIsInserting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isGeneratingSolutions, setIsGeneratingSolutions] = useState(false);
  const [validationResults, setValidationResults] = useState<any[] | null>(null);
  const [isMatchingSolutions, setIsMatchingSolutions] = useState(false);
  const [isExtractingAI, setIsExtractingAI] = useState(false);
  const [isParsingDirect, setIsParsingDirect] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const [viewMode, setViewMode] = useState<'render' | 'edit'>('render');
  const [suggestions, setSuggestions] = useState<ParsedQuestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [editPageContent, setEditPageContent] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [activeTargetField, setActiveTargetField] = useState<TargetField | null>(null);
  const [composerTab, setComposerTab] = useState<'composer' | 'notes'>('composer');
  const [notes, setNotes] = useState('');
  const [scanRange, setScanRange] = useState<{ from: number; to: number } | null>(null);
  const scannedPagesRef = useRef<Set<number>>(new Set());
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const [leftPanelTab, setLeftPanelTab] = useState<'questions' | 'solutions'>('questions');
  const [isUploadingSolutions, setIsUploadingSolutions] = useState(false);
  const solutionFileInputRef = useRef<HTMLInputElement>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [parsedQuestions, setParsedQuestions] = useState<any[]>([]);
  const [selectedText, setSelectedText] = useState<string>('');

  // Global mouseup listener for reliable text selection detection
  useEffect(() => {
    const handleMouseUp = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (text && text.length > 5) {
        setSelectedText(text);
      } else {
        setSelectedText('');
      }
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const activeQuestion = questions.find(q => q.id === activeQuestionId);
  const currentDoc = leftPanelTab === 'solutions' && session?.solutionDocument
    ? session.solutionDocument
    : session?.sourceDocument;
  const currentPageData = currentDoc?.pages.find(p => p.pageNumber === activePage);
  const pageContent = viewMode === 'edit' ? editPageContent : (currentPageData?.rawMarkdown || '');
  useEffect(() => { setTagInput(''); }, [activeQuestionId]);

  useEffect(() => {
    loadSession();
  }, [sessionId]);

  const loadSession = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/ingest/sessions/${sessionId}`);
      const data = await res.json();
      if (data.success) {
        setSession(data.session);
        setQuestions(data.session.authoredQuestions || []);
        setNotes(data.session.notes || '');
      } else {
        toast.error(data.error || 'Failed to load session');
        onClose();
      }
    } catch (e: any) {
      toast.error('Session load failed: ' + e.message);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const doc = leftPanelTab === 'solutions' && session?.solutionDocument
      ? session.solutionDocument
      : session?.sourceDocument;
    const page = doc?.pages.find(p => p.pageNumber === activePage);
    if (page) setEditPageContent(page.rawMarkdown);
  }, [activePage, session, leftPanelTab]);



  useEffect(() => {
    if (!isLoading && session && !scannedPagesRef.current.has(activePage) && leftPanelTab === 'questions') {
      scannedPagesRef.current.add(activePage);
      const page = session.sourceDocument?.pages.find(p => p.pageNumber === activePage);
      if (page) {
        const parsed = parseQuestionsFromMarkdown(page.rawMarkdown);
        if (parsed.length > 0) {
          setSuggestions(parsed);
          setShowSuggestions(true);
        }
      }
    }
  }, [isLoading, session, activePage, leftPanelTab]);

  const saveDraft = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/ingest/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authoredQuestions: questions, notes }),
      });
      if (res.ok) {
        toast.success('Draft saved successfully!');
      } else {
        toast.error('Failed to save draft');
      }
    } catch (e: any) {
      toast.error('Save failed: ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExtractWithAI = async () => {
    if (!session) return;
    setIsExtractingAI(true);
    try {
      const res = await fetch(`/api/admin/ingest/sessions/${sessionId}/extract-with-llm`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success && data.questions) {
        setQuestions(prev => [...prev, ...data.questions]);
        if (data.questions.length > 0) {
          setActiveQuestionId(data.questions[0].id);
        }
        toast.success(`AI extracted ${data.count} question(s)!`);
      } else {
        toast.error(data.error || 'AI extraction failed');
      }
    } catch (e: any) {
      toast.error('AI extraction error: ' + e.message);
    } finally {
      setIsExtractingAI(false);
    }
  };

  const handleParseDirect = async () => {
    if (!session) return;
    setIsParsingDirect(true);
    try {
      const res = await fetch(`/api/admin/ingest/sessions/${sessionId}/parse-direct`, { method: 'POST' });
      const data = await res.json();
      if (data.success && data.questions) {
        if (data.questions.length === 0) {
          // Show debug info
          const dbg = data.debug;
          console.log('[PARSE-DIRECT DEBUG]', dbg);
          toast.error(`No questions detected. Pages: ${dbg?.pageCount || 0}, Chars: ${dbg?.totalChars || 0}. Sample: ${dbg?.sampleContent?.substring(0, 200) || 'empty'}`);
        } else {
          setParsedQuestions(data.questions);
          setShowReviewModal(true);
          const dupes = data.stats?.duplicates || 0;
          toast.success(`Parsed ${data.count} question(s)${dupes > 0 ? ` (${dupes} duplicates flagged)` : ''}!`);
        }
      } else {
        toast.error(data.error || data.message || 'Parsing failed');
      }
    } catch (e: any) {
      toast.error('Parse error: ' + e.message);
    } finally {
      setIsParsingDirect(false);
    }
  };

  const handleApproveQuestions = async (approved: any[]) => {
    try {
      const res = await fetch('/api/admin/questions/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questions: approved,
          className: session?.className,
          subjectName: session?.subjectName,
          topicName: session?.topicName,
          topicId: session?.topicId,
          topicIds: session?.topicIds || (session?.topicId ? [session.topicId] : []),
          sourceDocumentId: session?.sourceDocument?.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setQuestions(prev => [...prev, ...approved]);
        setParsedQuestions(prev => prev.filter(q => !approved.find(a => a.id === q.id)));
        if (approved.length > 0) setActiveQuestionId(approved[0].id);
        // Also save to session so it persists across tab switches
        await fetch(`/api/admin/ingest/sessions/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authoredQuestions: [...questions, ...approved] }),
        });
        toast.success(`${data.count} question(s) approved and added to bank!`);
      } else {
        toast.error(data.error || 'Failed to approve questions');
      }
    } catch (e: any) {
      toast.error('Approve failed: ' + e.message);
    }
  };

  const handleSaveDraftQuestions = async (drafts: any[]) => {
    try {
      const res = await fetch('/api/admin/questions/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questions: drafts.map(q => ({ ...q, status: 'PENDING_REVIEW' })),
          className: session?.className,
          subjectName: session?.subjectName,
          topicName: session?.topicName,
          topicId: session?.topicId,
          topicIds: session?.topicIds || (session?.topicId ? [session.topicId] : []),
          sourceDocumentId: session?.sourceDocument?.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const draftQuestions = drafts.map(q => ({ ...q, status: 'DRAFT' }));
        setQuestions(prev => [...prev, ...draftQuestions]);
        setParsedQuestions(prev => prev.filter(q => !drafts.find(d => d.id === q.id)));
        if (drafts.length > 0) setActiveQuestionId(drafts[0].id);
        // Also save to session so it persists across tab switches
        await fetch(`/api/admin/ingest/sessions/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authoredQuestions: [...questions, ...draftQuestions] }),
        });
        toast.success(`${data.count} question(s) saved as draft!`);
      } else {
        toast.error(data.error || 'Failed to save drafts');
      }
    } catch (e: any) {
      toast.error('Save draft failed: ' + e.message);
    }
  };

  const handleRejectQuestions = (ids: string[]) => {
    setParsedQuestions(prev => prev.filter(q => !ids.includes(q.id)));
    toast.success(`${ids.length} question(s) rejected`);
  };

  const handleMatchSolutions = async () => {
    if (!session?.solutionDocument) return toast.error('No solutions PDF uploaded');
    setIsMatchingSolutions(true);
    try {
      const res = await fetch(`/api/admin/ingest/sessions/${sessionId}/match-solutions`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success && data.matches) {
        let filled = 0;
        setQuestions(prev => prev.map(q => {
          const match = data.matches.find((m: any) => m.questionId === q.id);
          if (match && match.solutionText && match.confidence > 30) {
            filled++;
            return { ...q, solution: match.solutionText };
          }
          return q;
        }));
        toast.success(`Auto-matched solutions for ${filled} question(s)`);
        if (filled === 0) toast('No high-confidence matches found. Try manual copy-paste from the Solutions tab.', { icon: '💡' });
      } else {
        toast.error(data.error || 'Matching failed');
      }
    } catch (e: any) {
      toast.error('Match failed: ' + e.message);
    } finally {
      setIsMatchingSolutions(false);
    }
  };

  const handleValidate = async () => {
    const empty = questions.filter(q => !q.question.trim());
    if (empty.length > 0) return toast.error(`${empty.length} question(s) have empty content`);
    setIsValidating(true);
    setValidationResults(null);
    try {
      const res = await fetch('/api/admin/ingest/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: questions.map(q => ({
          content: q.question,
          options: q.options,
          correctAnswer: q.correctOption || null,
          solution: q.solution,
        })) }),
      });
      const data = await res.json();
      if (data.success) {
        setValidationResults(data.results);
        const issues = data.results.filter((r: any) => !r.valid).length;
        if (issues === 0) toast.success('All questions validated successfully!');
        else toast(`⚠️ ${issues} question(s) have issues flagged`, { duration: 5000 });
      } else toast.error(data.error || 'Validation failed');
    } catch (e: any) {
      toast.error('Validation failed: ' + e.message);
    } finally {
      setIsValidating(false);
    }
  };

  const handleGenerateSolutions = async () => {
    const missing = questions.filter(q => !q.solution.trim());
    if (missing.length === 0) return toast.success('All questions already have solutions');
    setIsGeneratingSolutions(true);
    try {
      const res = await fetch('/api/admin/ingest/generate-solution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: missing.map(q => ({
          content: q.question,
          options: q.options,
          correctAnswer: q.correctOption || null,
        })) }),
      });
      const data = await res.json();
      if (data.success && data.solutions) {
        let idx = 0;
        setQuestions(prev => prev.map(q => {
          if (!q.solution.trim() && data.solutions[idx]) {
            return { ...q, solution: data.solutions[idx++] };
          }
          return q;
        }));
        toast.success(`Generated ${data.solutions.length} solution(s)`);
      } else toast.error(data.error || 'Generation failed');
    } catch (e: any) {
      toast.error('Generation failed: ' + e.message);
    } finally {
      setIsGeneratingSolutions(false);
    }
  };

  const handleInsertAll = async () => {
    if (questions.length === 0) return toast.error('No questions to insert');
    
    setIsInserting(true);
    try {
      const payload: any[] = [];
      for (const q of questions) {
        const common = {
          tagTaxonomyId: session?.topicId,
          tags: q.tags || [],
        };
        if (q.type === 'MCQ') {
          payload.push({
            ...common,
            content: q.question,
            options: q.options?.map(o => o.text) || [],
            correctAnswer: q.correctOption || '',
            explanation: q.solution,
            type: 'SINGLE_CHOICE',
          });
        } else if (q.type === 'ASSERTION_REASONING') {
          payload.push({
            ...common,
            content: `Assertion (A): ${q.assertion}\n\nReason (R): ${q.reasoning}`,
            options: q.options?.map(o => o.text) || [],
            correctAnswer: q.correctOption || '',
            explanation: q.solution,
            type: 'SINGLE_CHOICE',
          });
        } else if (q.type === 'FILL_IN_THE_BLANK') {
          payload.push({
            ...common,
            content: q.question,
            options: [],
            correctAnswer: q.solution,
            explanation: q.solution,
            type: 'SUBJECTIVE',
          });
        } else if (q.type === 'CASE_STUDY') {
          for (const sq of q.subQuestions || []) {
            payload.push({
              ...common,
              content: `${q.passage}\n\n${sq.question}`,
              options: sq.options?.map(o => o.text) || [],
              correctAnswer: sq.correctOption || '',
              explanation: sq.solution,
              type: sq.options?.length ? 'SINGLE_CHOICE' : 'SUBJECTIVE',
            });
          }
        } else {
          payload.push({
            ...common,
            content: q.question,
            options: [],
            correctAnswer: q.solution,
            explanation: q.solution,
            type: 'SUBJECTIVE',
          });
        }
      }

      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (res.ok) {
        await fetch(`/api/admin/ingest/sessions/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'COMPLETED' }),
        });
        toast.success(`Inserted ${payload.length} questions to bank!`);
        onClose();
      } else if (res.status === 409) {
        const dupData = await res.json();
        const dupCount = dupData.duplicates?.length || 0;
        const inserted = dupData.inserted?.length || (payload.length - dupCount);
        toast.error(`${inserted} inserted, ${dupCount} duplicates skipped`, { duration: 5000 });
        onClose();
      } else {
        toast.error('Insertion failed');
      }
    } catch (e: any) {
      toast.error('Insert failed: ' + e.message);
    } finally {
      setIsInserting(false);
    }
  };

  const addQuestion = (type: QuestionType) => {
    const id = `q-${Date.now()}`;
    let newQuestion: AuthoredQuestion = {
      id,
      type,
      question: '',
      solution: '',
      tags: [],
    };

    if (type === 'MCQ') {
      newQuestion.options = [
        { label: 'A', text: '' }, { label: 'B', text: '' },
        { label: 'C', text: '' }, { label: 'D', text: '' }
      ];
      newQuestion.correctOption = null;
    } else if (type === 'ASSERTION_REASONING') {
      newQuestion.assertion = '';
      newQuestion.reasoning = '';
      newQuestion.options = [
        { label: 'A', text: 'Both A and R are true, and R is the correct explanation of A' },
        { label: 'B', text: 'Both A and R are true, but R is NOT the correct explanation of A' },
        { label: 'C', text: 'A is true, but R is false' },
        { label: 'D', text: 'A is false, but R is true' },
      ];
      newQuestion.correctOption = null;
    } else if (type === 'CASE_STUDY') {
      newQuestion.passage = '';
      newQuestion.subQuestions = [
        { 
          id: `sq-${Date.now()}`, 
          question: '', 
          options: [{ label: 'A', text: '' }, { label: 'B', text: '' }, { label: 'C', text: '' }, { label: 'D', text: '' }],
          correctOption: null,
          solution: '' 
        }
      ];
    } else if (type === 'FILL_IN_THE_BLANK') {
      newQuestion.question = '_____';
    }

    setQuestions([...questions, newQuestion]);
    setActiveQuestionId(id);
  };

  const updateQuestion = (id: string, updates: Partial<AuthoredQuestion>) => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, ...updates } : q));
  };

  const removeQuestion = (id: string) => {
    setQuestions(prev => prev.filter(q => q.id !== id));
    if (activeQuestionId === id) setActiveQuestionId(null);
  };

  const updateSubQuestion = (qId: string, sqId: string, updates: Partial<AuthoredSubQuestion>) => {
    setQuestions(prev => prev.map(q => {
      if (q.id !== qId) return q;
      return {
        ...q,
        subQuestions: q.subQuestions?.map(sq => sq.id === sqId ? { ...sq, ...updates } : sq)
      };
    }));
  };

  const addSubQuestion = (qId: string) => {
    setQuestions(prev => prev.map(q => {
      if (q.id !== qId) return q;
      return {
        ...q,
        subQuestions: [...(q.subQuestions || []), {
          id: `sq-${Date.now()}`,
          question: '',
          options: [{ label: 'A', text: '' }, { label: 'B', text: '' }, { label: 'C', text: '' }, { label: 'D', text: '' }],
          correctOption: null,
          solution: '',
        }]
      };
    }));
  };

  const handleScanPage = useCallback(async () => {
    const doc = leftPanelTab === 'solutions' && session?.solutionDocument
      ? session.solutionDocument
      : session?.sourceDocument;
    const page = doc?.pages.find(p => p.pageNumber === activePage);
    if (!page) return toast.error('No content on this page');
    setIsScanning(true);
    try {
      const parsed = parseQuestionsFromMarkdown(page.rawMarkdown);
      if (parsed.length === 0) {
        toast.error('No questions detected on this page');
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }
      setSuggestions(parsed);
      setShowSuggestions(true);
      toast.success(`Detected ${parsed.length} question(s)`);
    } catch (e: any) {
      toast.error('Scan failed: ' + e.message);
    } finally {
      setIsScanning(false);
    }
  }, [activePage, session, leftPanelTab]);

  const handleFillFromSuggestion = useCallback((parsed: ParsedQuestion) => {
    const id = `q-${Date.now()}`;
    const question = createQuestionFromParsed(parsed, id);
    setQuestions(prev => [...prev, question]);
    setActiveQuestionId(id);
    toast.success(`Added ${parsed.type.replace('_', ' ')} question`);
  }, []);

  const handleSendToSolution = useCallback(() => {
    if (!activeQuestionId) {
      toast.error('Select a question first to send solution to');
      return;
    }
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!text) return;
    const activeQ = questions.find(q => q.id === activeQuestionId);
    const existing = activeQ?.solution || '';
    updateQuestion(activeQuestionId, {
      solution: existing ? existing + '\n\n' + text : text
    });
    sel?.removeAllRanges();
    toast.success('Text sent to solution field');
  }, [activeQuestionId, questions]);

  const handleEditContentChange = useCallback((value: string) => {
    setEditPageContent(value);
  }, []);

  const addTag = useCallback((qId: string, tag: string) => {
    const trimmed = tag.trim().toUpperCase();
    if (!trimmed) return;
    setQuestions(prev => prev.map(q => {
      if (q.id !== qId) return q;
      const existing = q.tags || [];
      if (existing.includes(trimmed)) return q;
      return { ...q, tags: [...existing, trimmed] };
    }));
  }, []);

  const removeTag = useCallback((qId: string, tag: string) => {
    setQuestions(prev => prev.map(q => {
      if (q.id !== qId) return q;
      return { ...q, tags: (q.tags || []).filter(t => t !== tag) };
    }));
  }, []);

  const handleTagInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>, qId: string) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const value = tagInput.replace(/,/g, '').trim();
      if (value) {
        addTag(qId, value);
        setTagInput('');
      }
    }
  }, [tagInput, addTag]);

  const handleQuickTag = useCallback((qId: string, tag: string) => {
    addTag(qId, tag);
  }, [addTag]);

  const handleCopyPlainText = useCallback(() => {
    const source = currentPageData?.rawMarkdown || editPageContent;
    if (!source) return toast.error('No content to copy');
    const clean = source
      .replace(/\$\$(.+?)\$\$/gs, '$1')
      .replace(/\$(.+?)\$/g, '$1')
      .replace(/\\\(/g, '')
      .replace(/\\\)/g, '')
      .replace(/\\\[/g, '')
      .replace(/\\\]/g, '')
      .replace(/\\begin\{([^}]+)\}(.+?)\\end\{\1\}/gs, '$2')
      .replace(/\\(?:frac|sqrt|lim|sum|int|sin|cos|tan|cot|sec|csc|log|ln|to|infty|alpha|beta|gamma|theta|phi|pi|lambda|mu|sigma|omega|Delta|Gamma|Theta|Pi|Sigma|Omega)\{/g, '')
      .replace(/\\([a-zA-Z]+)/g, '')
      .replace(/\{|\}/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    navigator.clipboard.writeText(clean).then(() => {
      toast.success('Copied plain text to clipboard');
    }).catch(() => {
      toast.error('Failed to copy');
    });
  }, [currentPageData, editPageContent]);

  const handleUploadSolutions = async (file: File) => {
    if (!session) return;
    setIsUploadingSolutions(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/admin/ingest/sessions/${session.id}/solutions`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Solutions PDF uploaded (${data.totalPages} pages)`);
        await loadSession();
        setLeftPanelTab('solutions');
      } else {
        toast.error(data.error || 'Failed to upload solutions');
      }
    } catch (e: any) {
      toast.error('Solutions upload failed: ' + e.message);
    } finally {
      setIsUploadingSolutions(false);
    }
  };

  const handlePasteToTarget = useCallback(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!text || !activeQuestionId || !activeTargetField) {
      toast.error('Select text, choose a target field, then click Paste');
      return;
    }
    if (activeTargetField.startsWith('option-')) {
      const label = activeTargetField.split('-')[1];
      const q = questions.find(q => q.id === activeQuestionId);
      if (!q?.options) return;
      const newOptions = q.options.map(o => o.label === label ? { ...o, text } : o);
      updateQuestion(activeQuestionId, { options: newOptions });
    } else if (activeTargetField === 'sub-question') {
      const q = questions.find(q => q.id === activeQuestionId);
      if (q?.subQuestions && q.subQuestions.length > 0) {
        updateSubQuestion(activeQuestionId, q.subQuestions[0].id, { question: text });
      }
    } else if (activeTargetField === 'sub-solution') {
      const q = questions.find(q => q.id === activeQuestionId);
      if (q?.subQuestions && q.subQuestions.length > 0) {
        updateSubQuestion(activeQuestionId, q.subQuestions[0].id, { solution: text });
      }
    } else {
      updateQuestion(activeQuestionId, { [activeTargetField]: text } as any);
    }
    setActiveTargetField(null);
    sel?.removeAllRanges();
    toast.success(`Pasted into ${activeTargetField}`);
  }, [activeQuestionId, activeTargetField, questions]);

  if (isLoading) return (
    <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
        <p className="font-bold text-gray-600">Loading Session...</p>
      </div>
    </div>
  );

  return (
    <div className={`fixed inset-0 bg-gray-50 z-50 flex flex-col ${selectedText ? 'pt-10' : ''}`}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-gray-900">{session?.sourceDocument?.title}</h2>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">{session?.className}</span>
              <span>•</span>
              <span>{session?.subjectName}</span>
              <span>•</span>
              <span>{session?.topicName}</span>
              <span>•</span>
              <span className="font-medium uppercase">{session?.status}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {session?.sourceDocument?.filePath && (
            <a 
              href={session.sourceDocument.filePath} 
              target="_blank" 
              rel="noopener noreferrer"
              className="px-4 py-2 text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-2 transition-colors"
            >
              <ExternalLink className="w-4 h-4" /> View PDF
            </a>
          )}
          {session?.solutionDocument && (
            <button 
              onClick={handleMatchSolutions} 
              disabled={isMatchingSolutions}
              className="px-4 py-2 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {isMatchingSolutions ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Match Solutions
            </button>
          )}
          <button
            onClick={handleValidate}
            disabled={isValidating}
            className="px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {isValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListChecks className="w-4 h-4" />} Validate
          </button>
          <button
            onClick={handleGenerateSolutions}
            disabled={isGeneratingSolutions}
            className="px-4 py-2 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {isGeneratingSolutions ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Gen Solutions
          </button>
          <button 
            onClick={saveDraft} 
            disabled={isSaving}
            className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Draft
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Raw Text */}
        <div className="w-1/2 border-r border-gray-200 bg-white flex flex-col">
          {/* Left Panel Header */}
          <div className="p-4 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" />
                <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => { setLeftPanelTab('questions'); setActivePage(1); }}
                    className={`px-3 py-1 text-[10px] font-bold transition-colors ${
                      leftPanelTab === 'questions'
                        ? 'bg-indigo-600 text-white'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Question Paper
                  </button>
                  {session?.solutionDocument && (
                    <button
                      onClick={() => { setLeftPanelTab('solutions'); setActivePage(1); }}
                      className={`px-3 py-1 text-[10px] font-bold transition-colors ${
                        leftPanelTab === 'solutions'
                          ? 'bg-indigo-600 text-white'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Solutions ({session.solutionDocument.totalPages}p)
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-500">Page {activePage} of {currentDoc?.totalPages || 0}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              {/* View Mode Toggle */}
              <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('render')}
                  className={`px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 transition-colors ${
                    viewMode === 'render' 
                      ? 'bg-indigo-600 text-white' 
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" /> Render
                </button>
                <button
                  onClick={() => setViewMode('edit')}
                  className={`px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 transition-colors ${
                    viewMode === 'edit' 
                      ? 'bg-indigo-600 text-white' 
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" /> Edit
                </button>
              </div>
              {/* Action Buttons */}
              <div className="flex items-center gap-1.5">
                {!session?.solutionDocument && (
                  <>
                    <input
                      ref={solutionFileInputRef}
                      type="file"
                      accept=".pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadSolutions(file);
                      }}
                      className="hidden"
                    />
                    <button
                      onClick={() => solutionFileInputRef.current?.click()}
                      disabled={isUploadingSolutions}
                      className="px-2.5 py-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg flex items-center gap-1 transition-colors disabled:opacity-50"
                    >
                      {isUploadingSolutions ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      Upload Solutions
                    </button>
                  </>
                )}
                <button
                  onClick={handleCopyPlainText}
                  className="px-2.5 py-1.5 text-[10px] font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg flex items-center gap-1 transition-colors"
                  title="Copy page content as plain text (LaTeX delimiters stripped)"
                >
                  <Copy className="w-3 h-3" /> Copy Text
                </button>
                <button
                  onClick={handlePasteToTarget}
                  disabled={!activeTargetField}
                  className={`px-2.5 py-1.5 text-[10px] font-bold rounded-lg flex items-center gap-1 transition-colors border ${
                    activeTargetField
                      ? 'text-indigo-600 bg-indigo-50 border-indigo-300 hover:bg-indigo-100'
                      : 'text-gray-400 bg-gray-50 border-gray-200 cursor-not-allowed'
                  }`}
                  title="Select text in the panel, choose a target field on the right, then click Paste"
                >
                  <ArrowRightToLine className="w-3 h-3" /> Paste{activeTargetField ? ` → ${activeTargetField}` : ''}
                </button>
                {/* Page Navigation */}
                <div className="flex items-center gap-1 ml-2 pl-2 border-l border-gray-200">
                  <button 
                    disabled={activePage <= 1}
                    onClick={() => setActivePage(p => p - 1)}
                    className="p-1 hover:bg-gray-200 rounded disabled:opacity-30"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] font-bold text-gray-500 min-w-[40px] text-center">{activePage} / {currentDoc?.totalPages || 0}</span>
                  <button 
                    disabled={activePage >= (currentDoc?.totalPages || 1)}
                    onClick={() => setActivePage(p => p + 1)}
                    className="p-1 hover:bg-gray-200 rounded disabled:opacity-30"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Left Panel Content */}
          <div 
            ref={leftPanelRef}
            className="flex-1 overflow-y-auto relative select-text"
            onCopy={(e) => {
              // In Render mode, copy raw markdown instead of garbled KaTeX text
              if (viewMode === 'render' && pageContent) {
                e.preventDefault();
                e.clipboardData.setData('text/plain', pageContent);
                toast.success('Raw markdown copied! Use Edit mode to select specific parts.');
              }
            }}
          >
            {viewMode === 'render' ? (
              <div className="p-6 prose max-w-none text-sm">
                <MathRenderer content={pageContent} />
              </div>
            ) : (
              <textarea 
                className="w-full h-full p-4 font-mono text-sm bg-white outline-none resize-none border-0"
                value={editPageContent}
                onChange={(e) => handleEditContentChange(e.target.value)}
              />
            )}
          </div>
        </div>

        {/* Right Panel: Composer */}
        <div className="w-1/2 bg-gray-50 flex flex-col">
          <div className="p-4 border-b border-gray-200 bg-white">
            {/* Tab Toggle */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setComposerTab('composer')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${
                    composerTab === 'composer' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Sparkles className="w-3 h-3 inline mr-1" />Composer
                </button>
                <button
                  onClick={() => setComposerTab('notes')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${
                    composerTab === 'notes' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <BookOpen className="w-3 h-3 inline mr-1" />Notes
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                {/* Parse Direct — zero LLM cost, instant */}
                <button
                  onClick={handleParseDirect}
                  disabled={isParsingDirect}
                  className="px-2.5 py-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  {isParsingDirect ? <Loader2 className="w-3 h-3 animate-spin" /> : <ScanSearch className="w-3 h-3" />}
                  Parse Direct
                </button>
                {/* Extract with AI — LLM-based fallback */}
                <button
                  onClick={handleExtractWithAI}
                  disabled={isExtractingAI}
                  className="px-2.5 py-1.5 text-[10px] font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  {isExtractingAI ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  Extract with AI
                </button>
                {/* Scan Range / Current Page */}
                <button 
                  onClick={() => {
                    const doc = leftPanelTab === 'solutions' && session?.solutionDocument
                      ? session.solutionDocument
                      : session?.sourceDocument;
                    if (scanRange) {
                      handleScanPage();
                    } else {
                      const from = prompt('Scan from page (1-' + (doc?.totalPages || 1) + '):', '1');
                      if (!from) return;
                      const to = prompt('Scan to page (1-' + (doc?.totalPages || 1) + '):', String(doc?.totalPages || 1));
                      if (!to) return;
                      const f = parseInt(from), t = parseInt(to);
                      if (f > 0 && t >= f && t <= (doc?.totalPages || 1)) {
                        setScanRange({ from: f, to: t });
                        const pages = (doc?.pages || [])
                          .filter(p => p.pageNumber >= f && p.pageNumber <= t)
                          .sort((a, b) => a.pageNumber - b.pageNumber)
                          .map(p => p.rawMarkdown)
                          .join('\n\n');
                        if (pages) {
                          setIsScanning(true);
                          try {
                            const parsed = parseQuestionsFromMarkdown(pages);
                            if (parsed.length > 0) {
                              setSuggestions(parsed);
                              setShowSuggestions(true);
                              toast.success(`Detected ${parsed.length} question(s) across pages ${f}-${t}`);
                            } else {
                              toast.error('No questions detected in range');
                            }
                          } catch (e: any) {
                            toast.error('Scan failed: ' + e.message);
                          } finally {
                            setIsScanning(false);
                          }
                        }
                      }
                    }
                  }}
                  disabled={isScanning}
                  className="px-2.5 py-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  {isScanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <ScanSearch className="w-3 h-3" />}
                  {scanRange ? `Scan ${scanRange.from}-${scanRange.to}` : 'Scan Range'}
                </button>
                <div className="w-px h-5 bg-gray-200" />
              </div>
            </div>
            {/* Question Type Buttons - only show on composer tab */}
            {composerTab === 'composer' && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button onClick={() => addQuestion('MCQ')} className="px-2.5 py-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors flex items-center gap-1"><Plus className="w-3 h-3" /> MCQ</button>
                <button onClick={() => addQuestion('ASSERTION_REASONING')} className="px-2.5 py-1 text-[10px] font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors flex items-center gap-1"><Plus className="w-3 h-3" /> AR</button>
                <button onClick={() => addQuestion('CASE_STUDY')} className="px-2.5 py-1 text-[10px] font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors flex items-center gap-1"><Plus className="w-3 h-3" /> Case</button>
                <button onClick={() => addQuestion('VERY_SHORT_ANSWER')} className="px-2.5 py-1 text-[10px] font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-1"><Plus className="w-3 h-3" /> VSA</button>
                <button onClick={() => addQuestion('SHORT_ANSWER')} className="px-2.5 py-1 text-[10px] font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-1"><Plus className="w-3 h-3" /> SA</button>
                <button onClick={() => addQuestion('LONG_ANSWER')} className="px-2.5 py-1 text-[10px] font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-1"><Plus className="w-3 h-3" /> LA</button>
                <button onClick={() => addQuestion('FILL_IN_THE_BLANK')} className="px-2.5 py-1 text-[10px] font-bold text-teal-600 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors flex items-center gap-1"><Plus className="w-3 h-3" /> Fill</button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {composerTab === 'notes' ? (
              <div className="bg-white rounded-2xl border-2 border-emerald-400 shadow-lg overflow-hidden">
                <div className="p-4 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm font-bold text-emerald-900">Revision Notes</span>
                  </div>
                  <span className="text-[10px] text-emerald-500">Saved with draft</span>
                </div>
                <div className="p-4">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Paste summarized revision material for this topic here..."
                    className="w-full h-[400px] p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-sm resize-none"
                  />
                </div>
              </div>
            ) : (
            <>
            {/* Active Editor */}
            {activeQuestion ? (
              <div className="bg-white rounded-2xl border-2 border-indigo-500 shadow-lg overflow-hidden">
                <div className="p-4 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-indigo-600 text-white text-[10px] font-bold rounded-full uppercase">{activeQuestion.type.replace('_', ' ')}</span>
                    <span className="text-xs font-bold text-indigo-900">Editing Question</span>
                    {activeTargetField && (
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
                        Target: {activeTargetField}
                      </span>
                    )}
                  </div>
                  <button onClick={() => removeQuestion(activeQuestion.id)} className="p-1.5 hover:bg-red-100 text-red-500 rounded-full transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  {/* Question Text */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <TargetDot field="question" current={activeTargetField} onSelect={setActiveTargetField} />
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Question Text *</label>
                    </div>
                    <textarea 
                      value={activeQuestion.question}
                      onChange={(e) => updateQuestion(activeQuestion.id, { question: e.target.value })}
                      placeholder="Paste question here..."
                      className={`w-full p-3 bg-gray-50 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm min-h-[80px] resize-none ${
                        activeTargetField === 'question' ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-gray-200'
                      }`}
                    />
                  </div>

                  {/* Assertion / Reasoning */}
                  {activeQuestion.type === 'ASSERTION_REASONING' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <TargetDot field="assertion" current={activeTargetField} onSelect={setActiveTargetField} />
                          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Assertion (A) *</label>
                        </div>
                        <textarea 
                          value={activeQuestion.assertion}
                          onChange={(e) => updateQuestion(activeQuestion.id, { assertion: e.target.value })}
                          placeholder="Paste assertion..."
                          className={`w-full p-3 bg-gray-50 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm min-h-[80px] resize-none ${
                            activeTargetField === 'assertion' ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-gray-200'
                          }`}
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <TargetDot field="reasoning" current={activeTargetField} onSelect={setActiveTargetField} />
                          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Reason (R) *</label>
                        </div>
                        <textarea 
                          value={activeQuestion.reasoning}
                          onChange={(e) => updateQuestion(activeQuestion.id, { reasoning: e.target.value })}
                          placeholder="Paste reason..."
                          className={`w-full p-3 bg-gray-50 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm min-h-[80px] resize-none ${
                            activeTargetField === 'reasoning' ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-gray-200'
                          }`}
                        />
                      </div>
                    </div>
                  )}

                  {/* Case Study Passage */}
                  {activeQuestion.type === 'CASE_STUDY' && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <TargetDot field="passage" current={activeTargetField} onSelect={setActiveTargetField} />
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Case Study Passage *</label>
                      </div>
                      <textarea 
                        value={activeQuestion.passage}
                        onChange={(e) => updateQuestion(activeQuestion.id, { passage: e.target.value })}
                        placeholder="Paste passage here..."
                        className={`w-full p-3 bg-gray-50 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm min-h-[120px] resize-none ${
                          activeTargetField === 'passage' ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-gray-200'
                        }`}
                      />
                    </div>
                  )}

                  {/* Options */}
                  {(activeQuestion.type === 'MCQ' || activeQuestion.type === 'ASSERTION_REASONING') && (
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Options *</label>
                      <div className="space-y-3">
                        {activeQuestion.options?.map((opt, idx) => {
                          const optField: TargetField = `option-${opt.label}`;
                          return (
                            <div key={idx} className="flex items-center gap-3">
                              <input 
                                type="radio" 
                                name={`correct-${activeQuestion.id}`}
                                checked={activeQuestion.correctOption === opt.label}
                                onChange={() => updateQuestion(activeQuestion.id, { correctOption: opt.label })}
                                className="w-4 h-4 text-indigo-600"
                              />
                              <TargetDot field={optField} current={activeTargetField} onSelect={setActiveTargetField} />
                              <span className="text-xs font-bold text-gray-400 w-4">{opt.label}.</span>
                              <input 
                                value={opt.text}
                                onChange={(e) => {
                                  const newOptions = [...(activeQuestion.options || [])];
                                  newOptions[idx].text = e.target.value;
                                  updateQuestion(activeQuestion.id, { options: newOptions });
                                }}
                                placeholder={`Option ${opt.label} text...`}
                                className={`flex-1 px-3 py-2 bg-gray-50 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm ${
                                  activeTargetField === optField ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-gray-200'
                                }`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Sub-questions for Case Study */}
                  {activeQuestion.type === 'CASE_STUDY' && (
                    <div className="space-y-6 pt-4 border-t border-gray-100">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <TargetDot field="sub-question" current={activeTargetField} onSelect={setActiveTargetField} />
                          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Sub-Questions</label>
                        </div>
                        <button 
                          onClick={() => addSubQuestion(activeQuestion.id)}
                          className="px-2 py-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Add Sub-Question
                        </button>
                      </div>
                      {activeQuestion.subQuestions?.map((sq, idx) => (
                        <div key={sq.id} className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-400">Sub-Question {idx + 1}</span>
                            <button 
                              onClick={() => {
                                const filtered = activeQuestion.subQuestions?.filter(s => s.id !== sq.id);
                                updateQuestion(activeQuestion.id, { subQuestions: filtered });
                              }}
                              className="text-red-500 hover:bg-red-50 p-1 rounded"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          <div>
                            <textarea 
                              value={sq.question}
                              onChange={(e) => updateSubQuestion(activeQuestion.id, sq.id, { question: e.target.value })}
                              placeholder="Sub-question text..."
                              className="w-full p-2 bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm min-h-[60px] resize-none"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {sq.options?.map((opt, oidx) => (
                              <div key={oidx} className="flex items-center gap-2">
                                <input 
                                  type="radio" 
                                  name={`sub-correct-${sq.id}`}
                                  checked={sq.correctOption === opt.label}
                                  onChange={() => updateSubQuestion(activeQuestion.id, sq.id, { correctOption: opt.label })}
                                  className="w-3 h-3 text-indigo-600"
                                />
                                <input 
                                  value={opt.text}
                                  onChange={(e) => {
                                    const newOpts = [...sq.options];
                                    newOpts[oidx].text = e.target.value;
                                    updateSubQuestion(activeQuestion.id, sq.id, { options: newOpts });
                                  }}
                                  placeholder={`Option ${opt.label}...`}
                                  className="flex-1 px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs"
                                />
                              </div>
                            ))}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 mb-1">
                              <TargetDot field="sub-solution" current={activeTargetField} onSelect={setActiveTargetField} />
                              <span className="text-[10px] font-bold text-gray-400 uppercase">Solution</span>
                            </div>
                            <textarea 
                              value={sq.solution}
                              onChange={(e) => updateSubQuestion(activeQuestion.id, sq.id, { solution: e.target.value })}
                              placeholder="Sub-question solution..."
                              className={`w-full p-2 bg-white border rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm min-h-[60px] resize-none ${
                                activeTargetField === 'sub-solution' ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-gray-200'
                              }`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Tags */}
                  <div className="pt-2">
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Tags</label>
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      {(activeQuestion.tags || []).map(tag => (
                        <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-full">
                          {tag}
                          <button onClick={() => removeTag(activeQuestion.id, tag)} className="hover:text-red-600">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}
                      <input
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => handleTagInputKeyDown(e, activeQuestion.id)}
                        placeholder="Add tag + Enter"
                        className="flex-1 min-w-[100px] px-2 py-1 text-xs bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {['PYQ', 'EXEMPLAR', 'NCERT', 'DPP', 'COMPETENCY'].map(quick => (
                        <button
                          key={quick}
                          onClick={() => handleQuickTag(activeQuestion.id, quick)}
                          className={`px-2 py-0.5 text-[9px] font-bold rounded-full border transition-colors ${
                            (activeQuestion.tags || []).includes(quick)
                              ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                              : 'bg-white border-gray-200 text-gray-400 hover:border-indigo-300 hover:text-indigo-600'
                          }`}
                        >
                          + {quick}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Solution */}
                  {activeQuestion.type !== 'CASE_STUDY' && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <TargetDot field="solution" current={activeTargetField} onSelect={setActiveTargetField} />
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Solution/Explanation *</label>
                      </div>
                      <textarea 
                        value={activeQuestion.solution}
                        onChange={(e) => updateQuestion(activeQuestion.id, { solution: e.target.value })}
                        placeholder="Paste detailed solution here..."
                        className={`w-full p-3 bg-gray-50 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm min-h-[100px] resize-none ${
                          activeTargetField === 'solution' ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-gray-200'
                        }`}
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-white rounded-3xl border-2 border-dashed border-gray-200">
                <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
                  <HelpCircle className="w-8 h-8 text-indigo-400" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">No Question Selected</h3>
                <p className="text-sm text-gray-500 max-w-xs mt-2">
                  Select a question from the list or create a new one using the buttons above to start authoring.
                </p>
              </div>
            )}

            {/* Suggestions Drawer */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="bg-white rounded-2xl border-2 border-emerald-400 shadow-lg overflow-hidden">
                <div className="p-4 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm font-bold text-emerald-900">Detected Questions ({suggestions.length})</span>
                  </div>
                  <button 
                    onClick={() => setShowSuggestions(false)}
                    className="p-1 hover:bg-emerald-200 rounded-full transition-colors"
                  >
                    <X className="w-4 h-4 text-emerald-600" />
                  </button>
                </div>
                <div className="p-4 space-y-3 max-h-[320px] overflow-y-auto">
                  {suggestions.map((sq, idx) => (
                    <div key={idx} className="p-3 bg-gray-50 rounded-xl border border-gray-200 hover:border-emerald-300 transition-colors group">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {sq.number && <span className="text-xs font-bold text-gray-400">Q{sq.number}</span>}
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                            sq.type === 'MCQ' ? 'bg-blue-100 text-blue-700' :
                            sq.type === 'ASSERTION_REASONING' ? 'bg-orange-100 text-orange-700' :
                            sq.type === 'CASE_STUDY' ? 'bg-purple-100 text-purple-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {sq.type.replace(/_/g, ' ')}
                          </span>
                          <span className={`text-[9px] font-bold ${
                            sq.confidence > 0.8 ? 'text-emerald-600' : 'text-amber-600'
                          }`}>
                            {Math.round(sq.confidence * 100)}% match
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-700 line-clamp-2 mb-2">
                        {sq.questionText?.substring(0, 150) || sq.assertion?.substring(0, 100) || 'No text extracted'}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleFillFromSuggestion(sq)}
                          className="px-2.5 py-1 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Fill
                        </button>
                        {sq.correctOption && (
                          <span className="text-[10px] text-gray-400">
                            Answer: <span className="font-bold text-gray-600">{sq.correctOption}</span>
                          </span>
                        )}
                        <button
                          onClick={() => {
                            setSuggestions(prev => prev.filter((_, i) => i !== idx));
                          }}
                          className="ml-auto p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Authored Questions List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Authored Questions ({questions.length})</h3>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {questions.map((q) => (
                  <button 
                    key={q.id}
                    onClick={() => setActiveQuestionId(q.id)}
                    className={`p-4 rounded-xl border-2 text-left transition-all group ${
                      activeQuestionId === q.id 
                        ? 'border-indigo-600 bg-indigo-50 shadow-sm' 
                        : 'border-white bg-white hover:border-gray-200 shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                            q.type === 'MCQ' ? 'bg-blue-100 text-blue-700' :
                            q.type === 'CASE_STUDY' ? 'bg-purple-100 text-purple-700' :
                            q.type === 'ASSERTION_REASONING' ? 'bg-orange-100 text-orange-700' :
                            q.type === 'FILL_IN_THE_BLANK' ? 'bg-teal-100 text-teal-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {q.type.replace(/_/g, ' ')}
                          </span>
                          <span className="text-xs font-bold text-gray-400"># {questions.indexOf(q) + 1}</span>
                        </div>
                        <p className="text-sm text-gray-700 truncate font-medium">
                          {q.question || q.assertion || q.passage || 'Empty Question'}
                        </p>
                      </div>
                      <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${activeQuestionId === q.id ? 'rotate-90 text-indigo-600' : ''}`} />
                    </div>
                  </button>
                ))}
                {questions.length === 0 && (
                  <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
                    <p className="text-sm text-gray-400">No questions authored yet.</p>
                    <p className="text-xs text-gray-400 mt-1">Questions auto-detected from the page appear above. Click "Fill" to add them.</p>
                  </div>
            )}
          </div>
        </div>
            </>
            )}
          </div>
        </div>
      </div>

      {/* Fixed Paste Toolbar - appears when text is selected */}
      {selectedText && activeQuestionId && (
        <div className="fixed top-0 left-0 right-0 z-[9999] bg-gray-900 text-white shadow-2xl border-b border-gray-700 pointer-events-auto">
          <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-3">
            <span className="text-xs text-gray-300 truncate max-w-md font-mono bg-gray-800 px-2 py-1 rounded">
              ✂️ {selectedText.substring(0, 80)}{selectedText.length > 80 ? '...' : ''}
            </span>
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[10px] text-gray-400 mr-1">Paste to:</span>
              <button
                onClick={() => {
                  updateQuestion(activeQuestionId, { question: selectedText });
                  setSelectedText('');
                  window.getSelection()?.removeAllRanges();
                  toast.success('Pasted to question text');
                }}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 rounded text-xs font-bold transition-colors"
              >
                Question
              </button>
              <button
                onClick={() => {
                  updateQuestion(activeQuestionId, { solution: selectedText });
                  setSelectedText('');
                  window.getSelection()?.removeAllRanges();
                  toast.success('Pasted to solution');
                }}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 rounded text-xs font-bold transition-colors"
              >
                Solution
              </button>
              {activeQuestion?.options?.map(opt => (
                <button
                  key={opt.label}
                  onClick={() => {
                    const newOptions = activeQuestion.options!.map(o => o.label === opt.label ? { ...o, text: selectedText } : o);
                    updateQuestion(activeQuestionId, { options: newOptions });
                    setSelectedText('');
                    window.getSelection()?.removeAllRanges();
                    toast.success(`Pasted to option ${opt.label}`);
                  }}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs font-bold transition-colors"
                >
                  {opt.label}
                </button>
              ))}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(pageContent);
                  toast.success('Full page raw markdown copied');
                }}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 rounded text-xs font-bold transition-colors ml-2"
                title="Copy full page raw markdown (better for LaTeX)"
              >
                Copy Raw
              </button>
              <button
                onClick={() => {
                  setSelectedText('');
                  window.getSelection()?.removeAllRanges();
                }}
                className="p-1 hover:bg-gray-700 rounded ml-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spacer when toolbar is visible */}
      {selectedText && activeQuestionId && <div className="h-10" />}

      {/* Question Review Right Panel */}
      {showReviewModal && parsedQuestions.length > 0 && (
        <div className="absolute inset-y-0 right-0 w-[45%] bg-white border-l shadow-xl z-20 flex flex-col">
          <QuestionReview
            questions={parsedQuestions}
            existingQuestions={questions.map(q => ({ id: q.id, question: q.question }))}
            onApprove={handleApproveQuestions}
            onReject={handleRejectQuestions}
            onSaveDraft={handleSaveDraftQuestions}
            onClose={() => { setShowReviewModal(false); setParsedQuestions([]); }}
          />
        </div>
      )}
    </div>
  );
}
