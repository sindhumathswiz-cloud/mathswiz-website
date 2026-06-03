'use client';

import { useEffect, useState } from 'react';
import { Loader2, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, BookOpen } from 'lucide-react';

interface TopicAnalysis {
  topic: string;
  confidence: number;
  totalQuestions: number;
  correctAnswers: number;
  avgDifficulty: string;
  status: 'STRONG' | 'MODERATE' | 'WEAK';
}

export default function TopicAnalysis() {
  const [topics, setTopics] = useState<TopicAnalysis[]>([]);
  const [overallConfidence, setOverallConfidence] = useState(0);
  const [weakTopicsCount, setWeakTopicsCount] = useState(0);
  const [strongTopicsCount, setStrongTopicsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/student/analysis')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setTopics(data.topics);
          setOverallConfidence(data.overallConfidence);
          setWeakTopicsCount(data.weakTopicsCount);
          setStrongTopicsCount(data.strongTopicsCount);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-emerald-600';
    if (confidence >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  const getConfidenceBg = (confidence: number) => {
    if (confidence >= 80) return 'bg-emerald-500';
    if (confidence >= 60) return 'bg-amber-500';
    return 'bg-red-500';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'STRONG':
        return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case 'MODERATE':
        return <BookOpen className="w-4 h-4 text-amber-500" />;
      case 'WEAK':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Overall Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-xl border text-center">
          <div className={`text-3xl font-bold ${getConfidenceColor(overallConfidence)}`}>
            {overallConfidence}%
          </div>
          <div className="text-xs text-slate-500 mt-1">Overall Confidence</div>
        </div>
        <div className="bg-white p-4 rounded-xl border text-center">
          <div className="text-3xl font-bold text-red-600">{weakTopicsCount}</div>
          <div className="text-xs text-slate-500 mt-1">Weak Topics</div>
        </div>
        <div className="bg-white p-4 rounded-xl border text-center">
          <div className="text-3xl font-bold text-emerald-600">{strongTopicsCount}</div>
          <div className="text-xs text-slate-500 mt-1">Strong Topics</div>
        </div>
      </div>

      {/* Topic List */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-3 border-b bg-slate-50">
          <h3 className="font-semibold text-sm text-slate-700">Topics by Performance</h3>
        </div>
        <div className="divide-y">
          {topics.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              No test data available yet
            </div>
          ) : (
            topics.map((topic) => (
              <div key={topic.topic} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(topic.status)}
                    <span className="font-medium text-sm text-slate-800">{topic.topic}</span>
                  </div>
                  <span className={`text-sm font-bold ${getConfidenceColor(topic.confidence)}`}>
                    {topic.confidence}%
                  </span>
                </div>
                
                {/* Confidence Bar */}
                <div className="w-full bg-slate-200 rounded-full h-2 mb-2">
                  <div
                    className={`h-2 rounded-full transition-all ${getConfidenceBg(topic.confidence)}`}
                    style={{ width: `${topic.confidence}%` }}
                  ></div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{topic.correctAnswers}/{topic.totalQuestions} correct</span>
                  <span>Avg difficulty: {topic.avgDifficulty}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Recommendations */}
      {weakTopicsCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
          <div className="flex items-start gap-3">
            <TrendingUp className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-sm text-amber-800">Focus Areas</h4>
              <p className="text-xs text-amber-700 mt-1">
                Practice more questions on: {topics.filter(t => t.status === 'WEAK').map(t => t.topic).join(', ')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
