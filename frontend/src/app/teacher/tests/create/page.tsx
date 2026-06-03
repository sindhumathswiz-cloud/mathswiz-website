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

export default function TestCreatorStudio() {
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
  const [filterClass, setFilterClass] = useState('All');

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
  }, [filterSubject, filterTopic, filterDifficulty, filterType, filterClass]);

  const fetchQuestions = async () => {
    setIsLoadingQuestions(true);
    try {
      const query = new URLSearchParams();
      if (filterSubject !== 'All') query.append('subject', filterSubject);
      if (filterTopic !== 'All') query.append('topic', filterTopic);
      if (filterDifficulty !== 'All') query.append('difficulty', filterDifficulty);
      if (filterType !== 'All') query.append('type', filterType);
      if (filterClass !== 'All') query.append('class', filterClass);

      const res = await fetch(`/api/teacher/questions?${query.toString()}`);
      const data = await res.json();
      setAvailableQuestions(data.questions || []);
    } catch (error) {
      console.error('Failed to fetch questions:', error);
    } finally {
      setIsLoadingQuestions(false);
    }
  };

  // Section Management
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

  // Cart Management
  const addQuestionToTest = (q: Question) => {
    if (!activeSectionId && sections.length === 0) {
      alert("Please add a section first!");
      return;
    }
    
    let targetSectionId = activeSectionId;
    if (!targetSectionId) targetSectionId = sections[0].id;

    setSections(sections.map(s => {
      if (s.id === targetSectionId) {
        // Prevent duplicate addition in the same section
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

  // AI Blueprint
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
        // Auto create a section if none exists
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
        alert(data.error || 'No questions found for the given criteria.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to generate blueprint.');
    } finally {
      setIsGeneratingBlueprint(false);
    }
  };

  // Save Test
  const handleSaveTest = async () => {
    if (!title) { alert('Test title is required'); return; }
    if (sections.length === 0) { alert('At least one section is required'); return; }

    setIsSaving(true);
    try {
      // Calculate total marks based on logic
      let computedTotal = 0;
      sections.forEach(s => {
        computedTotal += (s.marksPerQuestion * s.questions.length);
      });

      const res = await fetch('/api/teacher/tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          mode,
          duration,
          totalMarks: computedTotal,
          sections
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

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-900 overflow-hidden print:h-auto print:overflow-visible font-sans">
      
      {/* ─── LEFT PANEL (REPOSITORY) ─── */}
      <div className="w-1/2 flex flex-col border-r border-slate-200 bg-white print:hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h2 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
            <Search className="w-5 h-5 text-indigo-500" /> Question Repository
          </h2>
          
          {/* Filters */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)} className="bg-white border rounded p-2 text-sm outline-none focus:border-indigo-500">
              <option value="All">All Subjects</option>
              <option value="Mathematics">Mathematics</option>
              <option value="Physics">Physics</option>
              <option value="Chemistry">Chemistry</option>
            </select>
            <select value={filterTopic} onChange={e => setFilterTopic(e.target.value)} className="bg-white border rounded p-2 text-sm outline-none focus:border-indigo-500">
              <option value="All">All Topics</option>
              <option value="Calculus">Calculus</option>
              <option value="Algebra">Algebra</option>
              <option value="Mechanics">Mechanics</option>
            </select>
            <select value={filterDifficulty} onChange={e => setFilterDifficulty(e.target.value)} className="bg-white border rounded p-2 text-sm outline-none focus:border-indigo-500">
              <option value="All">All Difficulties</option>
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-white border rounded p-2 text-sm outline-none focus:border-indigo-500">
              <option value="All">All Types</option>
              <option value="SINGLE_CHOICE">Single MCQ</option>
              <option value="MULTIPLE_CHOICE">Multi MCQ</option>
              <option value="INTEGER">Integer</option>
              <option value="SUBJECTIVE">Subjective</option>
            </select>
            <select value={filterClass} onChange={e => setFilterClass(e.target.value)} className="bg-white border rounded p-2 text-sm outline-none focus:border-indigo-500">
                <option value="All">All Classes</option>
                <option value="Class 12">Class 12</option>
                <option value="Class 11">Class 11</option>
                <option value="NDA">NDA</option>
            </select>
          </div>
        </div>

        {/* Scrollable Question List */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-100 custom-scrollbar">
          {isLoadingQuestions ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
          ) : availableQuestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full opacity-50">
              <p className="font-bold">No questions found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {availableQuestions.map((q, idx) => (
                <div key={q.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3 hover:border-indigo-300 transition-colors">
                  <div className="flex justify-between items-start">
                    <div className="flex gap-2 mb-2 flex-wrap">
                      <span className="bg-slate-100 text-slate-600 text-[10px] uppercase font-bold px-2 py-0.5 rounded">{q.difficulty}</span>
                      <span className="bg-indigo-50 text-indigo-600 text-[10px] uppercase font-bold px-2 py-0.5 rounded">{q.type}</span>
                    </div>
                    <button 
                      onClick={() => addQuestionToTest(q)}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded-md text-xs font-bold transition flex items-center gap-1 shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add
                    </button>
                  </div>
                  
                  <div className="text-sm">
                     <MathRenderer content={q.content} />
                  </div>
                  
                  {/* Options Preview if exists */}
                  {q.type.includes('CHOICE') && q.options && Array.isArray(q.options) && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                       {q.options.map((opt: string, i: number) => (
                          <div key={i} className="text-xs bg-slate-50 p-2 rounded border border-slate-100">
                             <span className="font-bold mr-1">{String.fromCharCode(65 + i)}.</span>
                             <MathRenderer content={opt} />
                          </div>
                       ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── RIGHT PANEL (CURRENT TEST CONFIG/CART) ─── */}
      <div className="w-1/2 flex flex-col bg-white print:w-full print:block">
        
        {/* Test Header Config */}
        <div className="p-6 border-b border-slate-200 bg-white">
          <div className="flex justify-between items-center mb-6 print:hidden">
            <h1 className="text-2xl font-black text-slate-900">Test Creator Studio</h1>
            <div className="flex gap-2">
               <button onClick={() => setIsAIModalOpen(true)} className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg flex items-center gap-2 transition-all">
                 <Sparkles className="w-4 h-4" /> Generate with AI
               </button>
               <button onClick={handlePrint} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow flex items-center gap-2 transition-all">
                 <Printer className="w-4 h-4" /> Export PDF
               </button>
               <button onClick={handleSaveTest} disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg flex items-center gap-2 transition-all">
                 {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Test
               </button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 mb-4">
             <div className="col-span-2">
               <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Test Title</label>
               <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Midterm Examination" className="w-full border-b-2 border-slate-300 focus:border-indigo-500 outline-none text-xl font-black py-1 print:border-none" />
             </div>
             <div>
               <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Mode</label>
               <select value={mode} onChange={e => setMode(e.target.value)} className="w-full border-b-2 border-slate-300 focus:border-indigo-500 outline-none text-sm font-bold py-1.5 print:appearance-none">
                 <option value="STRICT">Strict Evaluation</option>
                 <option value="PRACTICE">Practice Mode</option>
               </select>
             </div>
             <div>
               <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Duration (mins)</label>
               <input type="number" value={duration} onChange={e => setDuration(e.target.value)} className="w-full border-b-2 border-slate-300 focus:border-indigo-500 outline-none text-sm font-bold py-1.5 print:border-none" />
             </div>
          </div>
          <div className="print:hidden">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Description / General Instructions</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full border rounded-lg p-3 text-sm outline-none focus:border-indigo-500 custom-scrollbar" placeholder="General test instructions..." />
          </div>
          {/* Print only description view */}
          {description && (
             <div className="hidden print:block mt-2 mb-4 text-sm whitespace-pre-wrap">
                <span className="font-bold">Instructions: </span>{description}
             </div>
          )}
        </div>

        {/* Sections & Added Questions List */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 print:bg-white print:p-0 custom-scrollbar">
           
           <div className="flex items-center justify-between mb-6 print:hidden">
              <h3 className="text-lg font-black text-slate-800">Test Sections</h3>
              <button onClick={addSection} className="text-indigo-600 hover:bg-indigo-50 font-bold text-sm px-3 py-1.5 rounded-lg border border-indigo-200 flex items-center gap-1 transition-colors">
                 <Plus className="w-4 h-4" /> Add Section
              </button>
           </div>

           {sections.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 opacity-50 border-2 border-dashed border-slate-300 rounded-xl print:hidden">
                 <p className="font-bold text-lg">No sections added</p>
                 <p className="text-sm">Click "Add Section" or generate a blueprint to start</p>
              </div>
           ) : (
             <div className="space-y-8">
               {sections.map((section, sIdx) => (
                 <div key={section.id} className={`bg-white rounded-xl ${activeSectionId === section.id ? 'ring-2 ring-indigo-500' : 'border border-slate-200'} shadow-sm overflow-hidden print:ring-0 print:border-none print:shadow-none`}>
                   
                   {/* Section Header */}
                   <div 
                      onClick={() => setActiveSectionId(section.id)}
                      className={`p-4 border-b border-slate-100 cursor-pointer print:p-0 print:border-b-2 print:border-black print:mb-4 print:pb-2 ${activeSectionId === section.id ? 'bg-indigo-50/50' : ''}`}
                   >
                     <div className="flex justify-between items-start print:items-end">
                       <div className="flex-1 pr-4">
                          <input type="text" value={section.title} onChange={e => updateSection(section.id, 'title', e.target.value)} onClick={e => e.stopPropagation()} placeholder="Section Title..." className="w-full font-black text-lg bg-transparent outline-none mb-1 text-slate-800" />
                          <input type="text" value={section.instructions} onChange={e => updateSection(section.id, 'instructions', e.target.value)} onClick={e => e.stopPropagation()} placeholder="Section instructions..." className="w-full text-xs text-slate-500 bg-transparent outline-none" />
                       </div>
                       <div className="flex flex-col items-end gap-2 shrink-0 print:flex-row print:gap-4 print:items-center">
                          <div className="flex gap-2 text-[10px] uppercase font-bold text-slate-500">
                            <span className="bg-slate-100 px-2 py-1 rounded print:bg-transparent print:p-0">Marks: <input type="number" step="0.5" value={section.marksPerQuestion} onChange={e => updateSection(section.id, 'marksPerQuestion', parseFloat(e.target.value))} onClick={e => e.stopPropagation()} className="w-10 bg-transparent text-slate-800 border-b border-slate-300 text-center outline-none" /></span>
                            <span className="bg-red-50 text-red-600 px-2 py-1 rounded print:bg-transparent print:p-0">Neg: <input type="number" step="0.5" value={section.negativeMarks} onChange={e => updateSection(section.id, 'negativeMarks', parseFloat(e.target.value))} onClick={e => e.stopPropagation()} className="w-10 bg-transparent text-red-700 border-b border-red-300 text-center outline-none" /></span>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); removeSection(section.id); }} className="text-slate-400 hover:text-red-500 print:hidden transition-colors"><Trash2 className="w-4 h-4" /></button>
                       </div>
                     </div>
                   </div>

                   {/* Section Questions */}
                   <div className="p-4 space-y-4 print:p-0">
                      {section.questions.length === 0 ? (
                        <div className="text-center p-6 text-sm text-slate-400 font-bold print:hidden">
                           Empty Section - Click "+ Add" on questions from the repository.
                        </div>
                      ) : (
                        section.questions.map((q, qIndex) => (
                           <div key={q.id} className="group relative pl-8 print:pl-6 print:break-inside-avoid print:mb-6">
                              {/* Controls */}
                              <div className="absolute left-0 top-0 bottom-0 w-8 flex flex-col items-center pt-1 print:hidden opacity-0 group-hover:opacity-100 transition-opacity">
                                 <button onClick={() => moveQuestion(section.id, qIndex, 'up')} disabled={qIndex === 0} className="text-slate-400 hover:text-indigo-600 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                                 <span className="text-[10px] font-black text-slate-300 my-1">{qIndex + 1}</span>
                                 <button onClick={() => moveQuestion(section.id, qIndex, 'down')} disabled={qIndex === section.questions.length - 1} className="text-slate-400 hover:text-indigo-600 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                              </div>

                              <div className="absolute -left-2 top-0 print:left-0 print:top-0 w-8 text-center text-sm font-black text-slate-800">
                                 {qIndex + 1}.
                              </div>
                              
                              <div className="flex justify-between items-start gap-4">
                                <div className="text-sm flex-1 text-slate-900">
                                  <MathRenderer content={q.content} />
                                </div>
                                <button onClick={() => removeQuestionFromTest(section.id, q.id)} className="text-slate-300 hover:text-red-500 shrink-0 print:hidden opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-4 h-4" /></button>
                              </div>
                              
                              {/* Print / Render Options */}
                              {q.type.includes('CHOICE') && q.options && Array.isArray(q.options) && (
                                <div className="grid grid-cols-2 gap-y-2 gap-x-6 mt-3 pl-2">
                                  {q.options.map((opt: string, optIndex: number) => (
                                      <div key={optIndex} className="text-sm flex items-start gap-2">
                                          <span className="font-bold print:font-normal">({String.fromCharCode(65 + optIndex)})</span>
                                          <div className="flex-1">
                                             <MathRenderer content={opt} />
                                          </div>
                                      </div>
                                  ))}
                                </div>
                              )}
                           </div>
                        ))
                      )}
                   </div>
                 </div>
               ))}
             </div>
           )}
        </div>
      </div>

      {/* ─── AI BLUEPRINT MODAL ─── */}
      {isAIModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 print:hidden">
           <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-200">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                 <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-600" /> AI Blueprint Generator
                 </h2>
                 <button onClick={() => setIsAIModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6">
                 <p className="text-sm text-slate-500 font-medium mb-4">
                     Describe your ideal test paper. The AI will parse your requirements, set up filters, and randomly auto-populate questions from your bank.
                 </p>
                 <textarea 
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    placeholder="E.g., Give me a 50-mark test on Calculus, 60% Medium, 20% Hard. Include 10 MCQs and 2 Subjective."
                    className="w-full border-2 border-slate-200 rounded-xl p-4 text-sm resize-none outline-none focus:border-purple-400 transition-colors mb-6 h-32"
                 />
                 <div className="flex justify-end gap-3">
                    <button onClick={() => setIsAIModalOpen(false)} className="px-5 py-2 hover:bg-slate-100 rounded-xl text-sm font-bold text-slate-600 transition-colors">Cancel</button>
                    <button onClick={handleGenerateBlueprint} disabled={isGeneratingBlueprint || !aiPrompt.trim()} className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white px-6 py-2 rounded-xl text-sm font-black shadow-lg shadow-purple-900/20 flex items-center gap-2 transition-all">
                       {isGeneratingBlueprint ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} 
                       Generate Magic Blueprint
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

    </div>
  );
}
