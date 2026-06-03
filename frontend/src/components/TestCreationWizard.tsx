'use client';

import { useState } from 'react';
import { Loader2, Sparkles, Eye, CheckCircle, AlertCircle, ChevronRight, ArrowLeft } from 'lucide-react';

interface TestConfig {
  title: string;
  description: string;
  batchId: string;
  timeLimit: number;
  dueDate: string;
}

interface GeneratedQuestion {
  id: string;
  questionText: string;
  topic: string;
  difficulty: string;
  type: string;
  options?: string[];
  correctAnswer?: string;
}

export default function TestCreationWizard() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [config, setConfig] = useState<TestConfig>({
    title: '',
    description: '',
    batchId: '',
    timeLimit: 30,
    dueDate: '',
  });
  const [prompt, setPrompt] = useState('');
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const generateTest = async () => {
    setGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/teacher/tests/generate-blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (data.success) {
        setGeneratedQuestions(data.questions);
        setSelectedQuestions(new Set(data.questions.map((q: GeneratedQuestion) => q.id)));
        setStep(2);
      } else {
        setError(data.error || 'Generation failed');
      }
    } catch (err) {
      setError('Failed to generate test');
    }
    setGenerating(false);
  };

  const toggleQuestion = (id: string) => {
    const newSelected = new Set(selectedQuestions);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedQuestions(newSelected);
  };

  const createTest = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/teacher/tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          questionIds: Array.from(selectedQuestions),
          status: 'DRAFT', // Requires teacher review before publish
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        setStep(3);
      } else {
        setError(data.error || 'Failed to create test');
      }
    } catch (err) {
      setError('Failed to create test');
    }
    setLoading(false);
  };

  const reset = () => {
    setStep(1);
    setPrompt('');
    setGeneratedQuestions([]);
    setSelectedQuestions(new Set());
    setConfig({ title: '', description: '', batchId: '', timeLimit: 30, dueDate: '' });
    setSuccess(false);
    setError('');
  };

  if (success) {
    return (
      <div className="text-center p-8">
        <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-800 mb-2">Test Created Successfully!</h2>
        <p className="text-slate-600 mb-6">
          Your test has been saved as a draft. Review it before publishing to students.
        </p>
        <button
          onClick={reset}
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Create Another Test
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step Indicator */}
      <div className="flex items-center justify-center gap-4">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                s <= step ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'
              }`}
            >
              {s}
            </div>
            {s < 3 && (
              <ChevronRight className={`w-5 h-5 mx-2 ${s < step ? 'text-indigo-600' : 'text-slate-300'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 p-3 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Step 1: Describe Test */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-xl border">
            <h3 className="font-semibold text-lg text-slate-800 mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              Describe Your Test
            </h3>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="E.g., Create a 30-minute test on Algebra and Geometry with 20 questions, mix of easy and medium difficulty..."
              className="w-full p-4 border rounded-lg text-sm min-h-[120px] focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            <button
              onClick={generateTest}
              disabled={generating || !prompt.trim()}
              className="mt-4 w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Test
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Review & Select Questions */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-xl border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
                <Eye className="w-5 h-5 text-indigo-600" />
                Review Questions
              </h3>
              <span className="text-sm text-slate-500">
                {selectedQuestions.size}/{generatedQuestions.length} selected
              </span>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {generatedQuestions.map((q) => (
                <div
                  key={q.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedQuestions.has(q.id)
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                  onClick={() => toggleQuestion(q.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm text-slate-800 mb-2">{q.questionText}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="px-2 py-0.5 bg-slate-100 rounded">{q.topic}</span>
                        <span className="px-2 py-0.5 bg-slate-100 rounded">{q.difficulty}</span>
                        <span className="px-2 py-0.5 bg-slate-100 rounded">{q.type}</span>
                      </div>
                    </div>
                    <div className="ml-3">
                      {selectedQuestions.has(q.id) ? (
                        <CheckCircle className="w-5 h-5 text-indigo-600" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-slate-300"></div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setStep(1)}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={selectedQuestions.size === 0}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next: Configure
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Configure Test */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-xl border">
            <h3 className="font-semibold text-lg text-slate-800 mb-4">Test Configuration</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Test Title</label>
                <input
                  type="text"
                  value={config.title}
                  onChange={(e) => setConfig({ ...config, title: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="E.g., Chapter 5: Algebra Test"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  value={config.description}
                  onChange={(e) => setConfig({ ...config, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  rows={2}
                  placeholder="Brief description of the test..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Time Limit (minutes)</label>
                  <input
                    type="number"
                    value={config.timeLimit}
                    onChange={(e) => setConfig({ ...config, timeLimit: parseInt(e.target.value) || 30 })}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    min={5}
                    max={180}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={config.dueDate}
                    onChange={(e) => setConfig({ ...config, dueDate: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setStep(2)}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <button
                onClick={createTest}
                disabled={loading || !config.title}
                className="flex-1 px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Save as Draft
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
