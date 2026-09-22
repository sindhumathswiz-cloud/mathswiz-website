'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronRight, Loader2, Send, ToggleLeft, ToggleRight, Users } from 'lucide-react';

type Batch = { id: string; name: string };
type StudentLite = { id: string; firstName: string | null; lastName: string | null };
type Assignment = {
  id: string;
  kind: 'TEST' | 'HOMEWORK';
  batchId: string | null;
  studentId: string | null;
  scheduledFor: string | null;
  deadline: string | null;
  maxAttempts: number;
  instructions: string | null;
  createdAt: string;
  batch: { id: string; name: string } | null;
  student: { id: string; firstName: string | null; lastName: string | null } | null;
};

export default function TestAssignPage() {
  const params = useParams<{ testId: string }>();
  const testId = params.testId;

  const [isPublished, setIsPublished] = useState<boolean | null>(null);
  const [togglingPublish, setTogglingPublish] = useState(false);

  const [batches, setBatches] = useState<Batch[]>([]);
  const [targetMode, setTargetMode] = useState<'batch' | 'students'>('batch');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [batchStudents, setBatchStudents] = useState<StudentLite[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [kind, setKind] = useState<'TEST' | 'HOMEWORK'>('TEST');
  const [scheduledFor, setScheduledFor] = useState('');
  const [deadline, setDeadline] = useState('');
  const [maxAttempts, setMaxAttempts] = useState('1');
  const [instructions, setInstructions] = useState('');
  const [assigning, setAssigning] = useState(false);

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(true);

  useEffect(() => {
    fetch('/api/teacher/tests/list')
      .then((r) => r.json())
      .then((data) => {
        const test = (data.tests || []).find((t: any) => t.id === testId);
        if (test) setIsPublished(test.isPublished);
      });
    fetch('/api/teacher/batches')
      .then((r) => r.json())
      .then((data) => setBatches(Array.isArray(data) ? data : []));
    loadAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId]);

  useEffect(() => {
    if (!selectedBatchId) { setBatchStudents([]); return; }
    fetch(`/api/teacher/mastery?batchId=${selectedBatchId}`)
      .then((r) => r.json())
      .then((data) => setBatchStudents(data.students || []))
      .catch(() => setBatchStudents([]));
  }, [selectedBatchId]);

  const loadAssignments = () => {
    setLoadingAssignments(true);
    fetch(`/api/teacher/tests/assign?testId=${testId}`)
      .then((r) => r.json())
      .then((data) => setAssignments(data.assignments || []))
      .finally(() => setLoadingAssignments(false));
  };

  const togglePublish = async () => {
    if (isPublished === null) return;
    setTogglingPublish(true);
    try {
      const res = await fetch(`/api/teacher/tests/${testId}/publish`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: !isPublished }),
      });
      const data = await res.json();
      if (res.ok) setIsPublished(data.isPublished);
      else alert(data.error || 'Could not update publish status');
    } finally {
      setTogglingPublish(false);
    }
  };

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const submitAssignment = async () => {
    if (!isPublished) { alert('Publish the test before assigning it.'); return; }
    const targets: { batchId?: string; studentId?: string }[] =
      targetMode === 'batch'
        ? (selectedBatchId ? [{ batchId: selectedBatchId }] : [])
        : selectedStudentIds.map((studentId) => ({ studentId }));

    if (targets.length === 0) {
      alert(targetMode === 'batch' ? 'Select a batch first.' : 'Select at least one student.');
      return;
    }

    setAssigning(true);
    try {
      // "Groups" = one already-tested assign call per selected student,
      // looped client-side -- no new grouping model, classroom-scale count.
      for (const target of targets) {
        const res = await fetch('/api/teacher/tests/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            testId,
            ...target,
            kind,
            scheduledFor: scheduledFor || undefined,
            deadline: deadline || undefined,
            maxAttempts: parseInt(maxAttempts, 10) || 1,
            instructions: instructions || undefined,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          alert(data.error || 'One or more assignments failed.');
        }
      }
      setSelectedStudentIds([]);
      loadAssignments();
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background">
      <div className="bg-white dark:bg-surface border-b border-slate-200 dark:border-white/10 px-8 py-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-2 font-medium">
            <Link href="/teacher/tests" className="hover:text-indigo-600 dark:hover:text-brand transition-colors">Test Ledger</Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-slate-800 dark:text-white">Publish &amp; Assign</span>
          </div>
          <div className="flex items-center justify-between">
            <h1 className="font-display text-3xl font-black text-slate-900 dark:text-white">Publish &amp; Assign</h1>
            <button
              onClick={togglePublish}
              disabled={togglingPublish || isPublished === null}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold shadow-lg transition-all disabled:opacity-50 ${
                isPublished ? 'bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-500 dark:hover:bg-emerald-400 text-white' : 'bg-slate-800 dark:bg-white/10 hover:bg-slate-700 dark:hover:bg-white/20 text-white'
              }`}
            >
              {togglingPublish ? <Loader2 className="w-4 h-4 animate-spin" /> : isPublished ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
              {isPublished ? 'Published' : 'Unpublished — click to publish'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 py-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-surface rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm p-6">
          <h2 className="font-display text-lg font-black text-slate-800 dark:text-white mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-indigo-500 dark:text-brand" /> Assign to</h2>

          <div className="flex gap-2 mb-4">
            <button onClick={() => setTargetMode('batch')} className={`px-4 py-2 rounded-lg text-sm font-bold ${targetMode === 'batch' ? 'bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400'}`}>Whole batch</button>
            <button onClick={() => setTargetMode('students')} className={`px-4 py-2 rounded-lg text-sm font-bold ${targetMode === 'students' ? 'bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400'}`}>Individual students</button>
          </div>

          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 block">Batch</label>
          <select data-testid="assign-batch-select" value={selectedBatchId} onChange={(e) => setSelectedBatchId(e.target.value)} className="w-full border dark:border-white/10 bg-white dark:bg-white/5 dark:text-white rounded-lg p-2.5 text-sm mb-4 outline-none focus:border-indigo-400 dark:focus:border-brand">
            <option value="">Select a batch…</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>

          {targetMode === 'students' && (
            <div className="mb-4 max-h-48 overflow-y-auto border dark:border-white/10 rounded-lg divide-y dark:divide-white/10">
              {batchStudents.length === 0 ? (
                <p className="p-3 text-xs text-slate-400 dark:text-slate-500">Select a batch above to see its students.</p>
              ) : batchStudents.map((s) => (
                <label key={s.id} className="flex items-center gap-2 p-2.5 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 dark:text-slate-200">
                  <input type="checkbox" checked={selectedStudentIds.includes(s.id)} onChange={() => toggleStudent(s.id)} />
                  {s.firstName} {s.lastName}
                </label>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 block">Kind</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as 'TEST' | 'HOMEWORK')} className="w-full border dark:border-white/10 bg-white dark:bg-white/5 dark:text-white rounded-lg p-2.5 text-sm outline-none focus:border-indigo-400 dark:focus:border-brand">
                <option value="TEST">Test</option>
                <option value="HOMEWORK">Homework</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 block">Max attempts</label>
              <input type="number" min={1} max={10} value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)} className="w-full border dark:border-white/10 bg-white dark:bg-white/5 dark:text-white rounded-lg p-2.5 text-sm outline-none focus:border-indigo-400 dark:focus:border-brand" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 block">Opens</label>
              <input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} className="w-full border dark:border-white/10 bg-white dark:bg-white/5 dark:text-white rounded-lg p-2.5 text-sm outline-none focus:border-indigo-400 dark:focus:border-brand" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 block">Deadline</label>
              <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="w-full border dark:border-white/10 bg-white dark:bg-white/5 dark:text-white rounded-lg p-2.5 text-sm outline-none focus:border-indigo-400 dark:focus:border-brand" />
            </div>
          </div>

          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 block">Instructions</label>
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} className="w-full border dark:border-white/10 bg-white dark:bg-white/5 dark:text-white rounded-lg p-2.5 text-sm mb-4 outline-none focus:border-indigo-400 dark:focus:border-brand" placeholder="Optional instructions for students…" />

          <button onClick={submitAssignment} disabled={assigning} className="w-full bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet hover:opacity-90 disabled:opacity-50 text-white px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2">
            {assigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Assign
          </button>
        </div>

        <div className="bg-white dark:bg-surface rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm p-6">
          <h2 className="font-display text-lg font-black text-slate-800 dark:text-white mb-4">Existing assignments</h2>
          {loadingAssignments ? (
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500 dark:text-brand mx-auto my-8" />
          ) : assignments.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">Not assigned to anyone yet.</p>
          ) : (
            <div className="space-y-3">
              {assignments.map((a) => (
                <div key={a.id} className="border dark:border-white/10 rounded-lg p-3 text-sm">
                  <p className="font-bold text-slate-800 dark:text-white">
                    {a.batch ? a.batch.name : `${a.student?.firstName} ${a.student?.lastName}`}
                    <span className="ml-2 text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-brand">{a.kind}</span>
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    {a.deadline ? `Due ${new Date(a.deadline).toLocaleString('en-IN')}` : 'No deadline'} · {a.maxAttempts} attempt{a.maxAttempts === 1 ? '' : 's'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
