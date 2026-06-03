'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Plus, Trash2, Search, ArrowUp, ArrowDown, 
  Printer, Save, Sparkles, X, Loader2
} from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';

type Question = {
  id: string;
  content: string;
  options?: any;
  correctAnswer?: string;
  type: string;
  difficulty: string;
  subject?: string;
  topic?: string;
};

type TestSection = {
  id: string;
  title: string;
  instructions: string;
  marksPerQuestion: number;
  negativeMarks: number;
  questions: Question[];
};

export function TestEngineCreator({ stats = { liveTests: 0, pendingAssignments: 0 } }: any) {
  const router = useRouter();

  // Settings / Metadata
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState('STRICT');
  const [duration, setDuration] = useState('60');
  
  // Left Panel - Repository State
  const [availableQuestions, setAvailableQuestions] = useState<Question[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  
  // Filters
  const [filterSubject, setFilterSubject] = useState('All');
  const [filterTopic, setFilterTopic] = useState('All');
  const [filterDifficulty, setFilterDifficulty] = useState('All');
  const [filterType, setFilterType] = useState('All');

  // Right Panel - Test Cart State
  const [sections, setSections] = useState<TestSection[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  // Modal State
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGeneratingBlueprint, setIsGeneratingBlueprint] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch Questions
  useEffect(() => {
    fetchQuestions();
  }, [filterSubject, filterTopic, filterDifficulty, filterType]);

  const fetchQuestions = async () => {
    setIsLoadingQuestions(true);
    try {
      const query = new URLSearchParams();
      if (filterSubject !== 'All') query.append('subject', filterSubject);
      if (filterTopic !== 'All') query.append('topic', filterTopic);
      if (filterDifficulty !== 'All') query.append('difficulty', filterDifficulty);
      if (filterType !== 'All') query.append('type', filterType);

      const res = await fetch(`/api/teacher/questions?${query.toString()}`);
      const data = await res.json();
      setAvailableQuestions(data.questions || []);
    } catch (error) {
      console.error('Failed to fetch questions:', error);
    } finally {
      setIsLoadingQuestions(false);
    }
  };

  const addSection = () => {
    const newSection: TestSection = {
      id: Date.now().toString() + Math.random().toString(36).substring(2),
      title: `Section ${String.fromCharCode(65 + sections.length)}`,
      instructions: '',
      marksPerQuestion: 4.0,
      negativeMarks: 1.0,
      questions: []
    };
    setSections([...sections, newSection]);
    if (!activeSectionId) setActiveSectionId(newSection.id);
  };

  const removeSection = (id: string) => {
    const updated = sections.filter(s => s.id !== id);
    setSections(updated);
    if (activeSectionId === id) {
      setActiveSectionId(updated.length > 0 ? updated[0].id : null);
    }
  };

  const updateSection = (id: string, field: keyof TestSection, value: any) => {
    setSections(sections.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const addQuestionToTest = (q: Question) => {
    if (!activeSectionId && sections.length === 0) {
      alert("Please add a section first!");
      return;
    }
    
    let targetSectionId = activeSectionId;
    if (!targetSectionId) targetSectionId = sections[0].id;

    setSections(sections.map(s => {
      if (s.id === targetSectionId) {
        if (s.questions.some(existing => existing.id === q.id)) return s;
        return { ...s, questions: [...s.questions, q] };
      }
      return s;
    }));
  };

  const removeQuestionFromTest = (sectionId: string, questionId: string) => {
    setSections(sections.map(s => {
      if (s.id === sectionId) {
        return { ...s, questions: s.questions.filter(q => q.id !== questionId) };
      }
      return s;
    }));
  };

  const moveQuestion = (sectionId: string, index: number, direction: 'up' | 'down') => {
    setSections(sections.map(s => {
      if (s.id === sectionId) {
        const newQs = [...s.questions];
        if (direction === 'up' && index > 0) {
          [newQs[index - 1], newQs[index]] = [newQs[index], newQs[index - 1]];
        } else if (direction === 'down' && index < newQs.length - 1) {
          [newQs[index + 1], newQs[index]] = [newQs[index], newQs[index + 1]];
        }
        return { ...s, questions: newQs };
      }
      return s;
    }));
  };

  const handleGenerateBlueprint = async () => {
    if (!aiPrompt.trim()) return;
    setIsGeneratingBlueprint(true);
    try {
      const res = await fetch('/api/teacher/tests/generate-blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt })
      });
      const data = await res.json();
      
      if (res.ok && data.questions && data.questions.length > 0) {
        let currentSections = [...sections];
        if (currentSections.length === 0) {
          const newSection: TestSection = {
            id: crypto.randomUUID(),
            title: 'Auto-Generated Section',
            instructions: '',
            marksPerQuestion: 4.0,
            negativeMarks: 1.0,
            questions: []
          };
          currentSections = [newSection];
        }

        const targetSection = currentSections[0];
        const combinedQuestions = [...targetSection.questions];

        data.questions.forEach((q: Question) => {
           if (!combinedQuestions.some(existing => existing.id === q.id)) {
               combinedQuestions.push(q);
           }
        });

        targetSection.questions = combinedQuestions;
        setSections(currentSections);
        setActiveSectionId(targetSection.id);
        setAiPrompt('');
        setIsAIModalOpen(false);
      } else {
        alert(data.error || 'No questions found.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to generate blueprint.');
    } finally {
      setIsGeneratingBlueprint(false);
    }
  };

  const handleSaveTest = async () => {
    if (!title) { alert('Test title is required'); return; }
    if (sections.length === 0) { alert('At least one section is required'); return; }

    setIsSaving(true);
    try {
      let computedTotal = 0;
      sections.forEach(s => {
        computedTotal += (s.marksPerQuestion * s.questions.length);
      });

      const res = await fetch('/api/teacher/tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, description, mode, duration,
          totalMarks: computedTotal, sections
        })
      });

      if (res.ok) {
        router.push('/teacher/tests');
      } else {
        const errorData = await res.json();
        alert(errorData.error || 'Failed to save test');
      }
    } catch (err) {
      alert('Error saving test');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Test Engine Summary Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
              { label: 'Total Tests Created', value: stats.liveTests || 0, icon: Save, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
              { label: 'Published Tests', value: stats.liveTests || 0, icon: Sparkles, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
              { label: 'Live Now (Running)', value: stats.pendingAssignments || 0, icon: Printer, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
          ].map((m, i) => (
              <div key={i} className={`bg-white p-5 rounded-2xl border ${m.border} shadow-sm flex items-center gap-4`}>
                  <div className={`p-3 ${m.bg} ${m.color} rounded-xl shrink-0`}>
                      <m.icon className="w-6 h-6" />
                  </div>
                  <div>
                      <p className="text-xs font-black text-gray-500 uppercase tracking-widest">{m.label}</p>
                      <p className="text-3xl font-black text-gray-900 leading-none mt-1">{m.value}</p>
                  </div>
              </div>
          ))}
      </div>

      <div className="flex h-screen w-full bg-slate-50 text-slate-900 overflow-hidden font-sans border border-gray-200 rounded-2xl shadow-sm">
      {/* LEFT PANEL */}
      <div className="w-1/2 flex flex-col border-r border-slate-200 bg-white">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
            <Search className="w-5 h-5 text-indigo-500" /> Question Repository
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)} className="bg-white border rounded p-2 text-sm">
              <option value="All">All Subjects</option>
              <option value="Mathematics">Mathematics</option>
              <option value="Physics">Physics</option>
              <option value="Chemistry">Chemistry</option>
            </select>
            <select value={filterDifficulty} onChange={e => setFilterDifficulty(e.target.value)} className="bg-white border rounded p-2 text-sm">
              <option value="All">All Difficulties</option>
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-slate-100">
          {isLoadingQuestions ? (
            <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-indigo-500" /></div>
          ) : (
            <div className="space-y-4">
              {availableQuestions.map((q) => (
                <div key={q.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <span className="bg-slate-100 text-[10px] font-bold px-2 py-0.5 rounded uppercase">{q.difficulty}</span>
                    <button onClick={() => addQuestionToTest(q)} className="bg-indigo-600 text-white px-3 py-1 rounded text-xs font-bold">+ Add</button>
                  </div>
                  <div className="text-sm"><MathRenderer content={q.content} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="w-1/2 flex flex-col bg-white overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-black text-slate-900">Test Creator</h1>
            <div className="flex gap-2">
               <button onClick={() => setIsAIModalOpen(true)} className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2"><Sparkles size={14} /> AI Blueprint</button>
               <button onClick={handleSaveTest} disabled={isSaving} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2">
                 {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
               </button>
            </div>
          </div>
          <div className="space-y-4">
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Test Title..." className="w-full text-xl font-black outline-none border-b-2 border-slate-100 focus:border-indigo-500" />
            <div className="flex gap-4">
              <select value={mode} onChange={e => setMode(e.target.value)} className="text-sm font-bold border rounded p-1">
                <option value="STRICT">Strict</option>
                <option value="PRACTICE">Practice</option>
              </select>
              <input type="number" value={duration} onChange={e => setDuration(e.target.value)} className="w-20 border rounded p-1 text-sm font-bold" />
              <span className="text-xs text-gray-500 self-center">mins</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold">Sections</h3>
            <button onClick={addSection} className="text-indigo-600 text-xs font-bold border px-2 py-1 rounded">+ Section</button>
          </div>
          <div className="space-y-6">
            {sections.map((section, sIdx) => (
              <div key={section.id} className={`bg-white rounded-xl p-4 border ${activeSectionId === section.id ? 'ring-2 ring-indigo-500' : 'border-slate-200'}`} onClick={() => setActiveSectionId(section.id)}>
                <div className="flex justify-between items-center mb-4">
                   <input type="text" value={section.title} onChange={e => updateSection(section.id, 'title', e.target.value)} className="font-bold outline-none bg-transparent" />
                   <button onClick={() => removeSection(section.id)} className="text-red-400"><Trash2 size={14} /></button>
                </div>
                <div className="space-y-3">
                   {section.questions.map((q, qIdx) => (
                     <div key={q.id} className="text-xs flex justify-between gap-2 border-b pb-2">
                        <div className="flex gap-2 font-bold"><span className="text-gray-400">{qIdx + 1}.</span> <MathRenderer content={q.content} /></div>
                        <button onClick={() => removeQuestionFromTest(section.id, q.id)}><X size={12} /></button>
                     </div>
                   ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI MODAL */}
      {isAIModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 flex flex-col gap-4">
            <h3 className="text-lg font-black flex items-center gap-2"><Sparkles className="text-purple-600" /> AI Blueprint</h3>
            <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="Describe your test... e.g. 10 Calculus questions, Medium difficulty." className="w-full border-2 rounded-xl p-4 h-32 outline-none focus:border-purple-400" />
            <div className="flex justify-end gap-2">
               <button onClick={() => setIsAIModalOpen(false)} className="px-4 py-2 font-bold text-sm">Cancel</button>
               <button onClick={handleGenerateBlueprint} disabled={isGeneratingBlueprint || !aiPrompt.trim()} className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold text-sm flex items-center gap-2">
                 {isGeneratingBlueprint ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
