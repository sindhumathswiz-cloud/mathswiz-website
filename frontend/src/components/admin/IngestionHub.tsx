'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, Globe, Image, Youtube, FileSpreadsheet, Loader2, CheckCircle, AlertCircle, Sparkles, X, BookOpen, History, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import MathRenderer from '@/components/MathRenderer';
import { PdfComposer } from './PdfComposer';
import TaxonomyCascadeSelector from './TaxonomyCascadeSelector';

export function IngestionHub() {
  const [activeMethod, setActiveMethod] = useState<'pdf' | 'image' | 'url' | 'excel' | 'manual'>('pdf');
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedQuestions, setExtractedQuestions] = useState<any[]>([]);
  const [showResults, setShowResults] = useState(false);

  // Taxonomy topic IDs (multi-select for topics/subtopics)
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);

  // Image state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // URL state
  const [url, setUrl] = useState('');

  // Manual text state
  const [manualText, setManualText] = useState('');

  // Excel state
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  // PDF state
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfSessionId, setPdfSessionId] = useState<string | null>(null);
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeMethod === 'pdf') {
      fetchRecentSessions();
    }
  }, [activeMethod]);

  const fetchRecentSessions = async () => {
    try {
      const res = await fetch('/api/admin/ingest/sessions');
      const data = await res.json();
      if (data.success) setRecentSessions(data.sessions);
    } catch (e) {
      console.error('Failed to fetch recent sessions', e);
    }
  };

  const handlePdfUpload = async () => {
    if (!pdfFile) return toast.error('Please select a PDF file');
    if (selectedFolderIds.length === 0) return toast.error('Please select at least one topic folder');

    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('file', pdfFile);
      formData.append('topicIds', JSON.stringify(selectedFolderIds));

      const res = await fetch('/api/admin/ingest/sessions', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        setPdfSessionId(data.sessionId);
        toast.success(`PDF uploaded! Session created with ${selectedFolderIds.length} topic(s).`);
        fetchRecentSessions();
      } else {
        toast.error(data.error || 'Failed to process PDF');
      }
    } catch (e: any) {
      toast.error('Upload failed: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImageUpload = async () => {
    if (!imageFile) return toast.error('Please select an image');

    setIsProcessing(true);
    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(imageFile);
      });

      const res = await fetch('/api/admin/extract-mathpix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64: base64 }),
      });
      const data = await res.json();

      if (data.questions) {
        setExtractedQuestions(data.questions);
        setShowResults(true);
        toast.success(`Extracted ${data.questions.length} questions from image!`);
      } else {
        toast.error(data.error || 'Failed to extract from image');
      }
    } catch (e: any) {
      toast.error('Image extraction failed: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUrlExtract = async () => {
    if (!url) return toast.error('Please enter a URL');

    setIsProcessing(true);
    try {
      const res = await fetch('/api/extract-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();

      if (data.questions) {
        setExtractedQuestions(data.questions);
        setShowResults(true);
        toast.success(`Extracted ${data.questions.length} questions from URL!`);
      } else {
        toast.error(data.error || 'Failed to extract from URL');
      }
    } catch (e: any) {
      toast.error('URL extraction failed: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExcelUpload = async () => {
    if (!excelFile) return toast.error('Please select an Excel/JSON file');

    setIsProcessing(true);
    try {
      const text = await excelFile.text();
      const questions = JSON.parse(text);

      if (!Array.isArray(questions)) {
        toast.error('File must contain a JSON array of questions');
        return;
      }

      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(questions),
      });
      const data = await res.json();

      if (res.status === 409) {
        const dupCount = data.duplicates?.length || 0;
        toast.success(`Imported ${questions.length - dupCount} questions (${dupCount} duplicates skipped)!`);
      } else if (data.success) {
        toast.success(`Imported ${data.count} questions successfully!`);
      } else {
        toast.error(data.error || 'Failed to import questions');
      }
    } catch (e: any) {
      toast.error('Excel import failed: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualExtract = async () => {
    if (!manualText.trim()) return toast.error('Please enter question text');

    setIsProcessing(true);
    try {
      const res = await fetch('/api/admin/extract-mathpix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'text', rawText: manualText }),
      });
      const data = await res.json();

      if (data.questions) {
        setExtractedQuestions(data.questions);
        setShowResults(true);
        toast.success(`Structured ${data.questions.length} questions from text!`);
      } else {
        toast.error(data.error || 'Failed to structure text');
      }
    } catch (e: any) {
      toast.error('Text extraction failed: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRefineWithAI = async () => {
    if (extractedQuestions.length === 0) return;
    setIsProcessing(true);
    try {
      const payload = extractedQuestions.map(q => ({
        _tempId: q._tempId || `q-${Math.random().toString(36).slice(2, 8)}`,
        content: q.content,
      }));
      const res = await fetch('/api/admin/ingest/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: payload }),
      });
      const data = await res.json();
      if (data.success && data.questions) {
        const refined = extractedQuestions.map((orig) => {
          const match = data.questions.find((r: any) => r._tempId === orig._tempId);
          return match ? { ...orig, ...match } : orig;
        });
        setExtractedQuestions(refined);
        toast.success(`Refined ${data.questions.length} questions with AI!`);
      } else {
        toast.error(data.error || 'Refinement failed');
      }
    } catch (e: any) {
      toast.error('Refinement failed: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const resetSelections = () => {
    setSelectedFolderIds([]);
  };

  const handleInsertExtracted = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(extractedQuestions),
      });
      const data = await res.json();

      if (res.status === 409) {
        const dupCount = data.duplicates?.length || 0;
        toast.success(`Saved ${extractedQuestions.length - dupCount} questions (${dupCount} duplicates skipped)!`);
        setExtractedQuestions([]);
        setShowResults(false);
      } else if (data.success) {
        toast.success(`Saved ${data.count} questions to ${data.scope}!`);
        setExtractedQuestions([]);
        setShowResults(false);
      } else {
        toast.error(data.error || 'Failed to save questions');
      }
    } catch (e: any) {
      toast.error('Save failed: ' + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const methods = [
    { id: 'pdf' as const, label: 'PDF / Book', icon: FileText, desc: 'Upload PDF chapters' },
    { id: 'image' as const, label: 'Image', icon: Image, desc: 'Photo of questions' },
    { id: 'url' as const, label: 'URL / Web', icon: Globe, desc: 'Scrape from websites' },
    { id: 'excel' as const, label: 'Excel / JSON', icon: FileSpreadsheet, desc: 'Bulk import file' },
    { id: 'manual' as const, label: 'Manual Text', icon: Sparkles, desc: 'Paste raw text' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Ingestion Hub</h2>
          <p className="text-sm text-gray-500 mt-1">Upload documents, scrape URLs, or paste text to extract questions automatically.</p>
        </div>
      </div>

      {/* Method Selector */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {methods.map((m) => (
          <button
            key={m.id}
            onClick={() => { setActiveMethod(m.id); setShowResults(false); }}
            className={`p-4 rounded-xl border-2 transition-all text-center ${
              activeMethod === m.id
                ? 'border-indigo-600 bg-indigo-50 shadow-md'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <m.icon className={`w-6 h-6 mx-auto mb-2 ${activeMethod === m.id ? 'text-indigo-600' : 'text-gray-400'}`} />
            <p className={`text-sm font-bold ${activeMethod === m.id ? 'text-indigo-900' : 'text-gray-700'}`}>{m.label}</p>
            <p className="text-[10px] text-gray-500">{m.desc}</p>
          </button>
        ))}
      </div>

      {/* Curriculum Taxonomy Selector */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200">
        <div className="flex items-center gap-3 mb-4">
          <BookOpen className="w-5 h-5 text-indigo-600" />
          <h3 className="font-bold text-gray-900">Select Topics from Curriculum</h3>
          {selectedFolderIds.length > 0 && (
            <button onClick={resetSelections} className="ml-auto text-xs text-gray-400 hover:text-red-500 transition-colors">
              Clear
            </button>
          )}
        </div>
        <TaxonomyCascadeSelector
          selectedIds={selectedFolderIds}
          onSelectMultiple={setSelectedFolderIds}
        />
        {selectedFolderIds.length === 0 && (
          <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Select at least one topic/subtopic from the curriculum to categorise ingested questions.
          </p>
        )}
      </div>

      {/* Active Method Panel */}
      <div className="bg-white p-8 rounded-2xl border border-gray-200">
        {/* PDF Upload */}
        {activeMethod === 'pdf' && (
          pdfSessionId ? (
            <PdfComposer 
              sessionId={pdfSessionId} 
              onClose={() => setPdfSessionId(null)} 
            />
          ) : (
            <div className="space-y-8">
              <div className="space-y-6">
                <h3 className="text-lg font-bold text-gray-900">PDF / Book Chapter Ingestion</h3>
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-indigo-400 transition-colors">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  {pdfFile ? (
                    <div>
                      <p className="font-bold text-gray-900">{pdfFile.name}</p>
                      <p className="text-sm text-gray-500">{(pdfFile.size / 1024 / 1024).toFixed(2)} MB</p>
                      <button onClick={() => setPdfFile(null)} className="text-red-600 text-sm mt-2 hover:underline">Remove</button>
                    </div>
                  ) : (
                    <>
                      <p className="font-bold text-gray-700 mb-1">Drop your PDF here or click to browse</p>
                      <p className="text-sm text-gray-500">Supports math textbooks, workbooks, and sample papers</p>
                      <button onClick={() => fileInputRef.current?.click()} className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700">
                        Select PDF
                      </button>
                    </>
                  )}
                </div>
                <button
                  onClick={handlePdfUpload}
                  disabled={isProcessing || !pdfFile || selectedFolderIds.length === 0}
                  className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                  {isProcessing ? 'Processing PDF via Mathpix OCR...' : 'Start Ingestion'}
                </button>
              </div>

              {recentSessions.length > 0 && (
                <div className="space-y-4 pt-8 border-t border-gray-100">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-gray-400" />
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Recent Sessions</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {recentSessions.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setPdfSessionId(s.id)}
                        className="p-3 rounded-xl border border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50 text-left transition-all group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">{s.sourceDocument?.title || 'Unnamed Document'}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                s.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : 
                                s.status === 'DRAFT' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'
                              }`}>
                                {s.status}
                              </span>
                              <span className="text-[10px] text-gray-400">{new Date(s.updatedAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-500 transition-colors" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        )}

        {/* Image Upload */}
        {activeMethod === 'image' && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-gray-900">Image OCR Extraction</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-indigo-400 transition-colors">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setImageFile(file);
                      setImagePreview(URL.createObjectURL(file));
                    }
                  }}
                  className="hidden"
                />
                {imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="max-h-64 mx-auto rounded-lg" />
                ) : (
                  <>
                    <Image className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="font-bold text-gray-700 mb-1">Upload an image</p>
                    <p className="text-sm text-gray-500">Photo or screenshot of math questions</p>
                    <button onClick={() => imageInputRef.current?.click()} className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700">
                      Select Image
                    </button>
                  </>
                )}
              </div>
              <div className="space-y-4">
                <button
                  onClick={handleImageUpload}
                  disabled={isProcessing || !imageFile}
                  className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                  {isProcessing ? 'Extracting with Mathpix...' : 'Extract Questions'}
                </button>
                <div className="bg-slate-900 rounded-xl p-4 text-slate-300 text-xs font-mono">
                  <p className="text-white font-bold mb-2">How it works:</p>
                  <p>1. Image uploaded</p>
                  <p>2. Mathpix OCR extracts LaTeX</p>
                  <p>3. LLM structures into JSON</p>
                  <p>4. Review & insert to question bank</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* URL Extraction */}
        {activeMethod === 'url' && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-gray-900">URL / Web Scraping</h3>
            <div className="flex gap-4">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/math-questions"
                className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              />
              <button
                onClick={handleUrlExtract}
                disabled={isProcessing || !url}
                className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Globe className="w-5 h-5" />}
                Extract
              </button>
            </div>
          </div>
        )}

        {/* Excel/JSON Import */}
        {activeMethod === 'excel' && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-gray-900">Excel / JSON Bulk Import</h3>
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-indigo-400 transition-colors">
              <input
                ref={excelInputRef}
                type="file"
                accept=".json,.csv,.xlsx"
                onChange={(e) => setExcelFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              {excelFile ? (
                <div>
                  <p className="font-bold text-gray-900">{excelFile.name}</p>
                  <p className="text-sm text-gray-500">{(excelFile.size / 1024).toFixed(0)} KB</p>
                  <button onClick={() => setExcelFile(null)} className="text-red-600 text-sm mt-2 hover:underline">Remove</button>
                </div>
              ) : (
                <>
                  <p className="font-bold text-gray-700 mb-1">Drop your JSON file here</p>
                  <p className="text-sm text-gray-500">Format: array of {`{ content, options, correctAnswer, type }`}</p>
                  <button onClick={() => excelInputRef.current?.click()} className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700">
                    Select File
                  </button>
                </>
              )}
            </div>
            <button
              onClick={handleExcelUpload}
              disabled={isProcessing || !excelFile}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
              Import Questions
            </button>
          </div>
        )}

        {/* Manual Text */}
        {activeMethod === 'manual' && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-gray-900">Manual Text Structuring</h3>
            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="Paste raw question text here. The AI will auto-structure it into proper JSON format with LaTeX..."
              className="w-full h-64 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm resize-none"
            />
            <button
              onClick={handleManualExtract}
              disabled={isProcessing || !manualText.trim()}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
              {isProcessing ? 'Structuring with AI...' : 'Structure with AI'}
            </button>
          </div>
        )}
      </div>

      {/* Extraction Results */}
      {showResults && extractedQuestions.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Extraction Results</h3>
              <p className="text-sm text-gray-500">{extractedQuestions.length} questions extracted. Review before inserting.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRefineWithAI}
                disabled={isProcessing}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Refine with AI
              </button>
              <button
                onClick={handleInsertExtracted}
                disabled={isProcessing}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold text-sm hover:bg-emerald-700 flex items-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Insert All to Bank
              </button>
            </div>
          </div>
          <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
            {extractedQuestions.map((q, i) => (
              <div key={i} className="p-6 hover:bg-gray-50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="prose max-w-none text-gray-900 mb-3">
                      <MathRenderer content={q.content || ''} />
                    </div>
                    {q.options && q.options.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 mt-3">
                        {q.options.map((opt: string, idx: number) => (
                          <div key={idx} className={`p-2 rounded-lg text-sm border ${q.correctAnswer === String.fromCharCode(65 + idx) ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200'}`}>
                            <span className="font-bold mr-2">{String.fromCharCode(65 + idx)}.</span>
                            <MathRenderer content={opt} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                      q.difficulty === 'HARD' ? 'bg-red-100 text-red-700' :
                      q.difficulty === 'MEDIUM' ? 'bg-amber-100 text-amber-700' :
                      'bg-emerald-100 text-emerald-700'
                    }`}>
                      {q.difficulty || 'MEDIUM'}
                    </span>
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-bold">
                      {q.type || 'SINGLE_CHOICE'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
