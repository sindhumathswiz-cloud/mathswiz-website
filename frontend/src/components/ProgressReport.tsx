'use client';

import { useEffect, useState, useRef } from 'react';
import { Loader2, Download, FileText, TrendingUp, Award, Flame, Target, Calendar, CheckCircle } from 'lucide-react';
import html2pdf from 'html2pdf.js';

interface ReportData {
  student: { name: string; email: string | null; mobile: string | null };
  stats: {
    totalTests: number;
    avgScore: number;
    totalCorrect: number;
    totalIncorrect: number;
    accuracy: number;
    totalPoints: number;
    currentStreak: number;
    badgesEarned: number;
    attendanceRate: number;
    presentDays: number;
    totalDays: number;
  };
  topics: { topic: string; confidence: number; totalQuestions: number }[];
  recentTests: { title: string; score: number; correct: number; incorrect: number; date: string }[];
  generatedAt: string;
}

export default function ProgressReport() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/student/report')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setReport(data);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const downloadPDF = async () => {
    if (!reportRef.current) return;
    setGeneratingPdf(true);

    const opt = {
      margin: 10,
      filename: `Progress_Report_${report?.student.name || 'Student'}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const },
    };

    await html2pdf().set(opt).from(reportRef.current).save();
    setGeneratingPdf(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="text-center p-8 text-slate-500">
        <FileText className="w-12 h-12 mx-auto mb-2 text-slate-300" />
        <p>Failed to load report</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Download Button */}
      <button
        onClick={downloadPDF}
        disabled={generatingPdf}
        className="w-full px-4 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {generatingPdf ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating PDF...
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            Download PDF Report
          </>
        )}
      </button>

      {/* Report Content (for PDF) */}
      <div ref={reportRef} className="bg-white p-6 rounded-xl border space-y-6">
        {/* Header */}
        <div className="border-b pb-4">
          <h2 className="text-xl font-bold text-slate-800">Progress Report</h2>
          <p className="text-sm text-slate-600">{report.student.name}</p>
          <p className="text-xs text-slate-500">
            Generated: {new Date(report.generatedAt).toLocaleString()}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-indigo-50 rounded-lg">
            <div className="text-2xl font-bold text-indigo-600">{report.stats.totalTests}</div>
            <div className="text-xs text-slate-600">Tests Completed</div>
          </div>
          <div className="p-3 bg-emerald-50 rounded-lg">
            <div className="text-2xl font-bold text-emerald-600">{report.stats.accuracy}%</div>
            <div className="text-xs text-slate-600">Accuracy</div>
          </div>
          <div className="p-3 bg-amber-50 rounded-lg">
            <div className="text-2xl font-bold text-amber-600">{report.stats.totalPoints}</div>
            <div className="text-xs text-slate-600">Total Points</div>
          </div>
          <div className="p-3 bg-orange-50 rounded-lg">
            <div className="text-2xl font-bold text-orange-600">{report.stats.currentStreak}🔥</div>
            <div className="text-xs text-slate-600">Current Streak</div>
          </div>
        </div>

        {/* Topics */}
        <div>
          <h3 className="font-semibold text-sm text-slate-700 mb-2 flex items-center gap-2">
            <Target className="w-4 h-4" />
            Topic Performance
          </h3>
          <div className="space-y-2">
            {report.topics.map((topic) => (
              <div key={topic.topic} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">{topic.topic}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 bg-slate-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        topic.confidence >= 80 ? 'bg-emerald-500' :
                        topic.confidence >= 60 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${topic.confidence}%` }}
                    ></div>
                  </div>
                  <span className="text-xs font-medium w-10 text-right">{topic.confidence}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Tests */}
        <div>
          <h3 className="font-semibold text-sm text-slate-700 mb-2 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Recent Tests
          </h3>
          <div className="space-y-2">
            {report.recentTests.slice(0, 5).map((test, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm p-2 bg-slate-50 rounded">
                <span className="text-slate-700 truncate flex-1">{test.title}</span>
                <span className="text-xs text-slate-500 ml-2">
                  {test.correct}/{test.correct + test.incorrect}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Badges & Attendance */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-purple-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-purple-600" />
              <div>
                <div className="text-lg font-bold text-purple-600">{report.stats.badgesEarned}</div>
                <div className="text-xs text-slate-600">Badges</div>
              </div>
            </div>
          </div>
          <div className="p-3 bg-teal-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-teal-600" />
              <div>
                <div className="text-lg font-bold text-teal-600">{report.stats.attendanceRate}%</div>
                <div className="text-xs text-slate-600">Attendance</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t pt-4 text-center text-xs text-slate-500">
          <p className="font-medium">Sindhu's Mathswiz Classes</p>
          <p>Keep learning and growing! 🌟</p>
        </div>
      </div>
    </div>
  );
}
