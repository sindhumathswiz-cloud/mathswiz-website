'use client';

import React, { useState } from 'react';
import { Check, X, AlertTriangle, Edit3, Trash2, Save, FileText, Radio, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import MathRenderer from '@/components/MathRenderer';

interface ParsedQuestion {
  id: string;
  number: string | null;
  type: string;
  question: string;
  options: { label: string; text: string }[] | null;
  correctOption: string | null;
  assertion: string | null;
  reasoning: string | null;
  passage: string | null;
  subQuestions: any[] | null;
  solution: string | null;
  tags: string[];
  difficulty: string;
  sourcePage: number;
  rawText: string;
  duplicate?: {
    isDuplicate: boolean;
    matchType: 'exact' | 'similar' | 'none';
    similarity: number;
    matchedQuestionId: string | null;
    matchedQuestionText: string | null;
  };
}

interface QuestionReviewProps {
  questions: ParsedQuestion[];
  existingQuestions: { id: string; question: string; status?: string }[];
  onApprove: (questions: ParsedQuestion[]) => void;
  onReject: (ids: string[]) => void;
  onSaveDraft: (questions: ParsedQuestion[]) => void;
  onClose: () => void;
}

export default function QuestionReview({ questions, existingQuestions, onApprove, onReject, onSaveDraft, onClose }: QuestionReviewProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<ParsedQuestion>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'pending' | 'duplicate'>('pending');
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [draftIds, setDraftIds] = useState<Set<string>>(new Set());
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());

  const existingIds = new Set(existingQuestions.map(q => q.id));

  const filtered = questions.filter(q => {
    if (approvedIds.has(q.id) || draftIds.has(q.id) || rejectedIds.has(q.id)) return false;
    if (filter === 'pending') return true;
    if (filter === 'duplicate') return q.duplicate?.isDuplicate || existingIds.has(q.id);
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(q => q.id)));
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startEdit = (q: ParsedQuestion) => {
    setEditingId(q.id);
    setEditData({
      ...q,
      options: q.options ? q.options.map(o => ({ ...o })) : null,
      tags: [...q.tags],
    });
  };

  const saveEdit = () => {
    if (!editingId) return;
    const idx = questions.findIndex(q => q.id === editingId);
    if (idx >= 0) {
      questions[idx] = { ...questions[idx], ...editData } as ParsedQuestion;
      toast.success('Question updated');
    }
    setEditingId(null);
    setEditData({});
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };

  const handleApproveSelected = () => {
    if (selected.size === 0) return toast.error('No questions selected');
    const approved = questions.filter(q => selected.has(q.id));
    setApprovedIds(prev => new Set([...prev, ...Array.from(selected)]));
    onApprove(approved);
    setSelected(new Set());
  };

  const handleSaveDraftSelected = () => {
    if (selected.size === 0) return toast.error('No questions selected');
    const drafts = questions.filter(q => selected.has(q.id));
    setDraftIds(prev => new Set([...prev, ...Array.from(selected)]));
    onSaveDraft(drafts);
    setSelected(new Set());
  };

  const handleRejectSelected = () => {
    if (selected.size === 0) return toast.error('No questions selected');
    setRejectedIds(prev => new Set([...prev, ...Array.from(selected)]));
    onReject(Array.from(selected));
    setSelected(new Set());
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'EASY': return 'bg-green-100 text-green-700';
      case 'MEDIUM': return 'bg-yellow-100 text-yellow-700';
      case 'HARD': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const copySolutionToClipboard = (solution: string) => {
    navigator.clipboard.writeText(solution).then(() => {
      toast.success('Solution copied to clipboard');
    }).catch(() => {
      toast.error('Failed to copy');
    });
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between bg-gray-50">
        <div>
          <h3 className="text-lg font-bold">Review Questions</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {questions.length} extracted • {approvedIds.size} approved • {draftIds.size} drafts • {questions.length - approvedIds.size - draftIds.size - rejectedIds.size} pending
          </p>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Toolbar */}
      <div className="px-4 py-2 border-b flex items-center gap-2 bg-white">
        <button onClick={toggleSelectAll} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
          {selected.size === filtered.length ? 'Deselect All' : 'Select All'}
        </button>
        <span className="text-xs text-gray-400">({selected.size})</span>
        <div className="flex-1" />
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {(['pending', 'all', 'duplicate'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-colors ${
                filter === f ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-4 py-2 border-b flex gap-2 bg-white">
        <button
          onClick={handleApproveSelected}
          disabled={selected.size === 0}
          className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          <Check className="w-3.5 h-3.5" /> Approve
        </button>
        <button
          onClick={handleSaveDraftSelected}
          disabled={selected.size === 0}
          className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          <Save className="w-3.5 h-3.5" /> Save Draft
        </button>
        <button
          onClick={handleRejectSelected}
          disabled={selected.size === 0}
          className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          <Trash2 className="w-3.5 h-3.5" /> Reject
        </button>
      </div>

      {/* Question List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map((q, idx) => {
          const isDupOfExisting = q.duplicate?.isDuplicate || existingIds.has(q.id);

          return (
            <div
              key={q.id}
              className={`border-b transition-colors ${
                isDupOfExisting ? 'bg-amber-50 border-l-4 border-l-amber-400' :
                selected.has(q.id) ? 'bg-indigo-50/50' : 'hover:bg-gray-50'
              }`}
            >
              <div className="px-4 py-3">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(q.id)}
                    onChange={() => toggleSelect(q.id)}
                    className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="flex-1 min-w-0">
                    {/* Metadata Row */}
                    <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                      <span className="text-[10px] font-mono font-bold text-gray-400">#{idx + 1}</span>
                      {q.number && <span className="text-[10px] font-bold text-gray-600">Q{q.number}</span>}
                      <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded-full bg-indigo-100 text-indigo-700">
                        {q.type}
                      </span>
                      <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded-full ${getDifficultyColor(q.difficulty)}`}>
                        {q.difficulty}
                      </span>
                      <span className="text-[10px] text-gray-400">P{q.sourcePage}</span>
                      {isDupOfExisting && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-amber-100 text-amber-700">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          Already in bank
                        </span>
                      )}
                      {q.tags.length > 0 && (
                        <div className="flex gap-0.5">
                          {q.tags.slice(0, 3).map(t => (
                            <span key={t} className="px-1 py-0.5 text-[9px] rounded bg-gray-100 text-gray-600">{t}</span>
                          ))}
                          {q.tags.length > 3 && <span className="text-[9px] text-gray-400">+{q.tags.length - 3}</span>}
                        </div>
                      )}
                    </div>

                    {editingId === q.id ? (
                      <div className="space-y-2">
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Question</label>
                          <textarea
                            value={editData.question || ''}
                            onChange={e => setEditData(prev => ({ ...prev, question: e.target.value }))}
                            className="w-full p-2 text-sm border rounded-lg font-mono"
                            rows={3}
                          />
                        </div>
                        {editData.options && editData.options.length > 0 && (
                          <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase">Options</label>
                            <div className="space-y-1 mt-1">
                              {editData.options.map((opt, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <input
                                    type="radio"
                                    name={`correct-${q.id}`}
                                    checked={editData.correctOption === opt.label}
                                    onChange={() => setEditData(prev => ({ ...prev, correctOption: opt.label }))}
                                    className="w-3.5 h-3.5 text-emerald-600"
                                  />
                                  <span className="text-xs font-bold text-gray-500 w-4">{opt.label}.</span>
                                  <input
                                    value={opt.text}
                                    onChange={e => {
                                      const newOpts = [...(editData.options || [])];
                                      newOpts[i] = { ...opt, text: e.target.value };
                                      setEditData(prev => ({ ...prev, options: newOpts }));
                                    }}
                                    className="flex-1 p-1.5 text-sm border rounded font-mono"
                                  />
                                </div>
                              ))}
                            </div>
                            <p className="text-[9px] text-gray-400 mt-1">Click radio button to mark correct answer</p>
                          </div>
                        )}
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Detailed Solution</label>
                          <textarea
                            value={editData.solution || ''}
                            onChange={e => setEditData(prev => ({ ...prev, solution: e.target.value }))}
                            placeholder="Step-by-step solution..."
                            className="w-full p-2 text-sm border rounded-lg font-mono"
                            rows={4}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Tags</label>
                          <input
                            value={(editData.tags || []).join(', ')}
                            onChange={e => setEditData(prev => ({ ...prev, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))}
                            placeholder="Tags (comma separated)"
                            className="w-full p-2 text-sm border rounded-lg"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={saveEdit} className="px-3 py-1 text-xs font-medium text-white bg-emerald-600 rounded-lg">Save</button>
                          <button onClick={cancelEdit} className="px-3 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {/* Question */}
                        <div className="text-sm text-gray-800 mb-2">
                          <MathRenderer content={q.question} />
                        </div>

                        {/* Options with Radio Buttons */}
                        {q.options && q.options.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {q.options.map(opt => {
                              const isCorrect = q.correctOption === opt.label;
                              return (
                                <div
                                  key={opt.label}
                                  className={`flex items-start gap-2 p-2 rounded-lg transition-colors ${
                                    isCorrect
                                      ? 'bg-emerald-50 border-2 border-emerald-300'
                                      : 'bg-gray-50 border border-gray-200 hover:border-gray-300'
                                  }`}
                                >
                                  <div className={`mt-0.5 flex-shrink-0 ${
                                    isCorrect ? 'text-emerald-600' : 'text-gray-400'
                                  }`}>
                                    <Radio className="w-4 h-4" fill={isCorrect ? 'currentColor' : 'none'} />
                                  </div>
                                  <span className={`text-xs font-bold ${
                                    isCorrect ? 'text-emerald-700' : 'text-gray-500'
                                  }`}>
                                    {opt.label}.
                                  </span>
                                  <span className={`text-sm flex-1 ${
                                    isCorrect ? 'text-emerald-800 font-medium' : 'text-gray-700'
                                  }`}>
                                    <MathRenderer content={opt.text} />
                                  </span>
                                  {isCorrect && (
                                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                                      Correct
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Detailed Solution */}
                        {q.solution && (
                          <div className="mt-2 p-2.5 bg-blue-50/50 rounded-lg border border-blue-100">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1">
                                <FileText className="w-3 h-3 text-blue-600" />
                                <strong className="text-xs text-blue-700">Detailed Solution:</strong>
                              </div>
                              <button
                                onClick={() => copySolutionToClipboard(q.solution!)}
                                className="p-1 hover:bg-blue-100 rounded"
                                title="Copy solution"
                              >
                                <Copy className="w-3 h-3 text-blue-500" />
                              </button>
                            </div>
                            <div className="text-sm text-blue-900">
                              <MathRenderer content={q.solution} />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => startEdit(q)}
                      className="p-1 hover:bg-gray-200 rounded"
                      title="Edit"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                    <button
                      onClick={() => toggleExpand(q.id)}
                      className="p-1 hover:bg-gray-200 rounded"
                      title="Expand"
                    >
                      {expanded.has(q.id) ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-gray-500" />
                      ) : (
                        <FileText className="w-3.5 h-3.5 text-gray-500" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Raw Text */}
                {expanded.has(q.id) && (
                  <div className="mt-2 pl-5">
                    <pre className="p-2 bg-gray-900 text-green-400 text-[10px] rounded-lg overflow-x-auto max-h-32">
                      {q.rawText}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
              <Check className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-600">All questions processed</p>
            <p className="text-xs text-gray-400 mt-1">Approve, draft, or reject questions to clear this list</p>
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="px-4 py-2 border-t bg-gray-50 flex items-center justify-between text-xs text-gray-500">
        <span>{filtered.length} showing</span>
        <div className="flex gap-3">
          <span className="text-emerald-600">{approvedIds.size} approved</span>
          <span className="text-blue-600">{draftIds.size} drafts</span>
          <span className="text-amber-600">{questions.filter(q => q.duplicate?.isDuplicate || existingIds.has(q.id)).length} duplicates</span>
        </div>
      </div>
    </div>
  );
}
