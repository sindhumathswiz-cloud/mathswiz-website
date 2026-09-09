'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { BookOpen, FileText, CheckCircle, PlayCircle, Lock, Download, Calendar, BarChart3, PlusCircle, Bot, Sparkles, UserCircle, Loader2, XCircle, ClipboardList, Clock, CreditCard, Target, Star, MessageSquare, TrendingUp, Video } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { joinBatchAction } from "@/actions/studentActions";
import { setStudentGoalAction } from "@/actions/goalActions";
import PerformanceAnalytics from "@/components/PerformanceAnalytics";
import AchieveJourney from "@/components/AchieveJourney";
import { TodayDashboard } from "@/components/dashboard/TodayDashboard";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend } from 'recharts';
interface Props {
    initialEnrollments: any[];
    initialPayments: any[];
    initialSummary: { totalAmount: number; totalPaid: number; totalOutstanding: number; overdueAmount: number };
    initialMaterials: any[];
    initialTests: any[];
    initialAttempts: any[];
    initialGoal: { targetExam: string; targetScore: number } | null;
    initialNotices?: any[];
    initialProgress?: any[];
    defaultTab?: 'batches' | 'tests' | 'materials' | 'performance' | 'profile' | 'payments' | 'achieve' | 'live-classes';
}

const EMPTY_ARRAY: any[] = [];

export default function StudentDashboardClient({ 
    initialEnrollments: enrolledBatches = EMPTY_ARRAY, 
    initialPayments: payments = EMPTY_ARRAY, 
    initialSummary: paymentSummary = { totalAmount: 0, totalPaid: 0, totalOutstanding: 0, overdueAmount: 0 }, 
    initialMaterials: materials = EMPTY_ARRAY,
    initialTests: assignedTests = EMPTY_ARRAY,
    initialAttempts: attempts = EMPTY_ARRAY,
    initialGoal,
    initialNotices: notices = EMPTY_ARRAY,
    initialProgress: progress = EMPTY_ARRAY,
    defaultTab
}: Props) {
    const { data: session } = useSession();
    const [activeTab, setActiveTab] = useState<'batches' | 'tests' | 'materials' | 'performance' | 'profile' | 'payments' | 'achieve' | 'live-classes'>(defaultTab || 'batches');
    const [goal, setGoal] = useState<{ targetExam: string; targetScore: number } | null>(initialGoal);
    const [goalFormExam, setGoalFormExam] = useState('');
    const [goalFormScore, setGoalFormScore] = useState('');
    const [isSavingGoal, setIsSavingGoal] = useState(false);
    const [batchCodeInput, setBatchCodeInput] = useState('');
    const [activePaymentForPDF, setActivePaymentForPDF] = useState<any>(null);

    const handleDownloadPDF = async (elementId: string, filename: string) => {
        const html2pdf = (await import('html2pdf.js')).default;
        const element = document.getElementById(elementId);
        if (!element) return;
        const opt = {
            margin:       10, // 10mm margin for strict adherence
            filename:     filename,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, windowWidth: 800 }, // Lock width for stability
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        } as const;
        html2pdf().set(opt).from(element).save();
    };
    
    const [joinSuccess, setJoinSuccess] = useState(false);
    const [joinError, setJoinError] = useState('');
    const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
    const [embeddedNotebook, setEmbeddedNotebook] = useState<string | null>(null);

    const handleJoinBatch = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setJoinError('');
        setJoinSuccess(false);

        const formData = new FormData(e.currentTarget);
        const code = formData.get("batchCode") as string;
        
        // Inject studentId for the server action
        const studentId = (session?.user as any)?.id;
        if (studentId) formData.append("studentId", studentId);

        if (!code?.trim()) {
            setJoinError('Please enter a batch code');
            return;
        }

        try {
            await joinBatchAction(formData);
            setJoinSuccess(true);
            setBatchCodeInput('');
            toast.success("Successfully requested to join batch!");
            setTimeout(() => setJoinSuccess(false), 3000);
        } catch (err: any) {
            setJoinError(err.message || 'Server error');
            toast.error(err.message || "Server error");
        }
    };

    const handleSaveGoal = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSavingGoal(true);
        const userId = (session?.user as any)?.id;
        if (!userId) { toast.error('Please log in again.'); setIsSavingGoal(false); return; }
        const formData = new FormData();
        formData.append('userId', userId);
        formData.append('targetExam', goalFormExam);
        formData.append('targetScore', goalFormScore);
        try {
            await setStudentGoalAction(formData);
            setGoal({ targetExam: goalFormExam, targetScore: parseFloat(goalFormScore) });
            toast.success('Goal saved! Track your progress here.');
        } catch (err: any) {
            toast.error(err.message || 'Failed to save goal.');
        } finally {
            setIsSavingGoal(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-8">
            <div className="max-w-7xl mx-auto text-gray-900">

                <TodayDashboard
                    role="Student"
                    title={`Welcome back, ${(session?.user as any)?.firstName || 'Student'}`}
                    description="Your next lesson, assessment, and practice options are gathered here so you can start quickly."
                    metrics={[
                        { label: 'Batches', value: enrolledBatches.length, hint: 'active enrollments', icon: BookOpen, tone: 'indigo' },
                        { label: 'Assigned tests', value: assignedTests.length, hint: 'available assessments', icon: ClipboardList, tone: 'amber' },
                        { label: 'Completed', value: attempts.length, hint: 'test attempts', icon: CheckCircle, tone: 'emerald' },
                        { label: 'Fees due', value: `₹${paymentSummary.totalOutstanding.toLocaleString('en-IN')}`, hint: paymentSummary.overdueAmount ? 'includes overdue fees' : 'current outstanding', icon: CreditCard, tone: paymentSummary.overdueAmount ? 'rose' : 'sky' },
                    ]}
                    priorities={[
                        { title: assignedTests.length ? `${assignedTests.length} assigned tests` : 'No tests waiting', detail: assignedTests.length ? 'Choose an assessment and continue your progress.' : 'Use Practice Arena to keep your skills moving.', tone: assignedTests.length ? 'attention' : 'success' },
                        { title: notices.length ? `${notices.length} class notices` : 'No new notices', detail: notices.length ? 'Read the latest updates from your teachers.' : 'You are caught up with classroom updates.', tone: notices.length ? 'neutral' : 'success' },
                    ]}
                    actions={[
                        { label: 'Start practice', href: '/student/practice', icon: Target },
                        { label: 'Ask Doubt Buddy', href: '/student/doubt-buddy', icon: Bot },
                        { label: 'View assigned tests', icon: ClipboardList, onClick: () => setActiveTab('tests') },
                    ]}
                />

                {/* Welcome Header */}
                <div className="today-panel mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="hidden">
                        <h1 className="text-3xl font-bold mb-2">Welcome back, {(session?.user as any)?.firstName || 'Student'}! 👋</h1>
                        <p className="text-indigo-100 mb-6">Ready to conquer mathematics today? Your personalized dashboard is ready.</p>
                        <div className="flex flex-wrap gap-3">
                            <Link href="/student/doubt-buddy" className="inline-flex bg-gradient-to-r from-amber-400 to-orange-500 text-white px-6 py-3 rounded-xl font-bold hover:scale-105 transition-transform items-center justify-center gap-2 shadow-lg w-fit">
                                <Sparkles className="w-5 h-5 text-amber-100" /> Open Doubt Buddy AI (BETA)
                            </Link>
                            <Link href="/student/practice" className="inline-flex bg-white/20 hover:bg-white/30 text-white px-6 py-3 rounded-xl font-bold transition-all items-center justify-center gap-2 border border-white/30 w-fit">
                                <Target className="w-5 h-5" /> Practice Arena
                            </Link>
                        </div>
                    </div>

                    <div className="w-full">
                        <p className="today-kicker">Enrollment</p>
                        <h2 className="today-title">Join another batch</h2>
                        <p className="mb-4 mt-1 text-sm text-slate-500">Enter the batch code shared by your teacher.</p>
                        <form onSubmit={handleJoinBatch} className="flex flex-col gap-2 sm:flex-row">
                            <input
                                type="text"
                                name="batchCode"
                                aria-label="Batch code"
                                placeholder="BATCH CODE"
                                value={batchCodeInput}
                                onChange={(e) => setBatchCodeInput(e.target.value.toUpperCase())}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-center font-mono font-bold tracking-widest text-slate-900 outline-none transition focus:ring-2 focus:ring-indigo-500 sm:w-48"
                            />
                            <button
                                type="submit"
                                className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 font-bold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                            >
                                <PlusCircle className="w-5 h-5" /> Join
                            </button>
                        </form>
                        {joinSuccess && <p className="mt-2 flex items-center gap-1 text-sm font-medium text-emerald-600"><CheckCircle className="w-4 h-4" /> Successfully requested!</p>}
                        {joinError && <p className="mt-2 text-sm text-rose-600">{joinError}</p>}
                    </div>
                </div>

                {/* Navigation Tabs */}
                <div className="dashboard-tabs mb-8" aria-label="Student dashboard sections">
                    <button onClick={() => setActiveTab('batches')} className={`dashboard-tab flex items-center gap-2 ${activeTab === 'batches' ? 'dashboard-tab-active' : ''}`}>
                        <BookOpen className="w-4 h-4" /> My Batches
                    </button>
                    <button onClick={() => setActiveTab('live-classes')} className={`dashboard-tab flex items-center gap-2 ${activeTab === 'live-classes' ? 'dashboard-tab-active' : ''}`}>
                        <Video className="w-4 h-4" /> Live Classes
                    </button>
                    <button onClick={() => setActiveTab('tests')} className={`dashboard-tab flex items-center gap-2 ${activeTab === 'tests' ? 'dashboard-tab-active' : ''}`}>
                        <ClipboardList className="w-4 h-4" /> Assigned Tests
                        {assignedTests.length > 0 && <span className="ml-1 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{assignedTests.length}</span>}
                    </button>
                    <button onClick={() => setActiveTab('materials')} className={`dashboard-tab flex items-center gap-2 ${activeTab === 'materials' ? 'dashboard-tab-active' : ''}`}>
                        <FileText className="w-4 h-4" /> Study Materials
                    </button>
                    <button onClick={() => setActiveTab('performance')} className={`dashboard-tab flex items-center gap-2 ${activeTab === 'performance' ? 'dashboard-tab-active' : ''}`}>
                        <BarChart3 className="w-4 h-4" /> Performance
                    </button>
                    <Link href="/student/mastery" className="dashboard-tab flex items-center gap-2">
                        <Target className="w-4 h-4" /> My Mastery
                    </Link>
                    <Link href="/student/interventions" className="dashboard-tab flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" /> Support Plans
                    </Link>
                    <button onClick={() => setActiveTab('achieve')} className={`dashboard-tab flex items-center gap-2 ${activeTab === 'achieve' ? 'dashboard-tab-active' : ''}`}>
                        <Star className="w-4 h-4" /> Achieve
                    </button>
                    <button onClick={() => setActiveTab('profile')} className={`dashboard-tab flex items-center gap-2 ${activeTab === 'profile' ? 'dashboard-tab-active' : ''}`}>
                        <UserCircle className="w-4 h-4" /> Profile
                    </button>
                    <button onClick={() => setActiveTab('payments')} className={`dashboard-tab flex items-center gap-2 ${activeTab === 'payments' ? 'dashboard-tab-active' : ''}`}>
                        <CreditCard className="w-4 h-4" /> Fee & Payments
                    </button>
                </div>

                {/* Tab Content */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 min-h-[500px]">

                    {activeTab === 'live-classes' && (
                        <div className="animate-in fade-in duration-300">
                             <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2"><Video className="w-5 h-5 text-indigo-600" /> Upcoming Live Classes</h2>
                             {enrolledBatches.some((enr: any) => enr.batch?.liveClasses?.length > 0) ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {enrolledBatches.flatMap((enr: any) =>
                                        (enr.batch?.liveClasses || []).map((cls: any) => (
                                            <div key={cls.id} className="bg-white border border-gray-200 rounded-[2rem] p-6 shadow-sm hover:shadow-xl transition-all group overflow-hidden relative">
                                                <div className="flex items-center justify-between mb-4">
                                                    <div className="bg-indigo-50 text-indigo-700 p-3 rounded-2xl">
                                                        <Video className="w-6 h-6" />
                                                    </div>
                                                    <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full uppercase tracking-widest">{enr.batch?.name}</span>
                                                </div>
                                                <h3 className="text-lg font-black text-gray-900 mb-4">{cls.title}</h3>
                                                <div className="space-y-2 mb-6">
                                                    <div className="flex items-center gap-2 text-sm text-gray-500 font-bold">
                                                        <Calendar className="w-4 h-4" /> {new Date(cls.startTime).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-sm text-gray-500 font-bold">
                                                        <Clock className="w-4 h-4" /> {new Date(cls.startTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} - {new Date(cls.endTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </div>
                                                <a 
                                                    href={cls.meetingUrl} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-3 rounded-2xl font-black text-sm hover:bg-indigo-600 transition shadow-lg shadow-gray-200"
                                                >
                                                    <PlayCircle className="w-4 h-4" /> Join Class Now
                                                </a>
                                            </div>
                                        ))
                                    )}
                                </div>
                             ) : (
                                <div className="text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                                    <Video className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                    <p className="text-gray-500 font-bold">No live classes scheduled for your batches.</p>
                                </div>
                             )}
                        </div>
                    )}

                    {activeTab === 'batches' && (
                        <div className="animate-in fade-in duration-300">
                            {/* Notices / Banners */}
                            {notices.length > 0 && (
                                <div className="mb-8 space-y-3">
                                    {notices.map((notice) => (
                                        <div key={notice.id} className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-xl shadow-sm flex items-start gap-4">
                                            <div className="bg-amber-100 p-2 rounded-lg text-amber-600">
                                                <TrendingUp className="w-5 h-5" />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between mb-1">
                                                    <h4 className="font-bold text-amber-900">{notice.title}</h4>
                                                    <span className="text-[10px] font-bold text-amber-600 uppercase tracking-tighter">
                                                        {new Date(notice.createdAt).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-amber-800 font-medium">{notice.content}</p>
                                                <p className="text-[10px] text-amber-600 mt-2 font-bold uppercase">Posted by: {notice.teacher?.firstName} {notice.teacher?.lastName}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <h2 className="text-xl font-bold text-gray-900 mb-6">Enrolled Batches</h2>
                            {enrolledBatches.length === 0 ? (
                                <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
                                    <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-500 font-medium">No batches joined yet.</p>
                                    <p className="text-gray-400 text-sm">Enter a batch code above to get started.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {enrolledBatches.map((enr) => (
                                        <div key={enr.id} className="border border-gray-200 rounded-2xl p-6 hover:shadow-md transition group">
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg text-xs font-bold font-mono border border-indigo-100">
                                                    {enr.batch?.code}
                                                </div>
                                                {enr.status === 'PENDING' ? (
                                                    <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full"><Loader2 className="w-3 h-3 animate-spin" /> Pending Admission</span>
                                                ) : enr.status === 'SUSPENDED' ? (
                                                    <span className="flex items-center gap-1.5 text-xs font-medium text-rose-600 bg-rose-50 px-2 py-1 rounded-full"><XCircle className="w-3 h-3" /> Suspended</span>
                                                ) : (
                                                    <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full"><CheckCircle className="w-3 h-3" /> Enrolled</span>
                                                )}
                                            </div>
                                            <h3 className="text-lg font-bold text-gray-900 mb-1">{enr.batch?.name}</h3>
                                            <p className="text-gray-500 text-sm font-medium mb-6">Instructor: {enr.batch?.teacher?.name}</p>
                                            
                                            {enr.status === 'APPROVED' && enr.batch?.lastMeetingLink && (
                                                <a 
                                                    href={enr.batch.lastMeetingLink}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="w-full mb-3 px-4 py-3 rounded-xl font-black flex items-center justify-center gap-2 transition bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-200 animate-pulse"
                                                >
                                                    <Video className="w-5 h-5" /> Join Live Session Now
                                                </a>
                                            )}

                                            <button
                                                disabled={enr.status === 'PENDING' || enr.status === 'SUSPENDED'}
                                                className={`w-full px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition focus:ring-4 focus:ring-indigo-100 ${enr.status === 'PENDING' || enr.status === 'SUSPENDED' ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-900 text-white hover:bg-indigo-600 hover:shadow-lg'}`}
                                            >
                                                {enr.status === 'PENDING' || enr.status === 'SUSPENDED' ? <Lock className="w-5 h-5" /> : <PlayCircle className="w-5 h-5" />}
                                                {enr.status === 'PENDING' ? 'Access Restricted' : enr.status === 'SUSPENDED' ? 'Account Suspended' : 'Enter Classroom'}
                                            </button>
                                            
                                            {enr.status === 'APPROVED' && enr.batch?.teamChatUrl && (
                                                <a 
                                                    href={enr.batch.teamChatUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="w-full mt-3 px-4 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition bg-[#6264a7]/10 text-[#6264a7] hover:bg-[#6264a7]/20 border border-[#6264a7]/30 shadow-sm"
                                                >
                                                    <MessageSquare className="w-4 h-4" /> 💬 Open Batch Chat
                                                </a>
                                            )}
                                            {enr.status === 'APPROVED' && enr.batch?.oneNoteUrl && (
                                                <button 
                                                    onClick={() => setEmbeddedNotebook(enr.batch.oneNoteUrl)}
                                                    className="w-full mt-3 px-4 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition bg-[#7719aa]/10 text-[#7719aa] hover:bg-[#7719aa]/20 border border-[#7719aa]/30 shadow-sm"
                                                >
                                                    <BookOpen className="w-5 h-5" /> 📓 Open Class Notebook
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Upcoming Live Classes */}
                            {enrolledBatches.some((enr: any) => enr.batch?.liveClasses?.length > 0) && (
                                <div className="mt-8">
                                    <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-indigo-500" /> Upcoming Live Classes
                                    </h3>
                                    <div className="space-y-3">
                                        {enrolledBatches.flatMap((enr: any) =>
                                            (enr.batch?.liveClasses || []).map((cls: any) => (
                                                <div key={cls.id} className="flex items-center justify-between p-4 bg-indigo-50 border border-indigo-100 rounded-xl hover:shadow-sm transition">
                                                    <div>
                                                        <p className="font-bold text-gray-900 text-sm">{cls.title}</p>
                                                        <p className="text-xs text-gray-500 mt-1">{enr.batch?.name} · {new Date(cls.startTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                                                    </div>
                                                    <a 
                                                        href={cls.meetingUrl} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold text-sm transition shadow-sm"
                                                    >
                                                        <PlayCircle className="w-4 h-4" /> Join Meeting
                                                    </a>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'tests' && (
                        <div className="animate-in fade-in duration-300">
                            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2"><ClipboardList className="w-5 h-5 text-indigo-600" /> Tests &amp; Homework</h2>
                            {assignedTests.length === 0 ? (
                                <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
                                    <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-500 font-medium">No tests or homework assigned yet.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {assignedTests.map((assignment: any) => {
                                        const now = new Date();
                                        const opens = assignment.scheduledFor ? new Date(assignment.scheduledFor) : null;
                                        const closes = assignment.deadline ? new Date(assignment.deadline) : null;
                                        const isOpen = (!opens || now >= opens) && (!closes || now <= closes);
                                        const isExpired = closes && now > closes;
                                        return (
                                            <div key={assignment.id} className="border border-gray-200 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:shadow-md transition">
                                                <div>
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg ${assignment.kind === 'HOMEWORK' ? 'bg-violet-100 text-violet-700' : 'bg-red-100 text-red-700'}`}>{assignment.kind === 'HOMEWORK' ? 'Homework' : 'Test'}</span>
                                                        {isExpired && <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg bg-gray-100 text-gray-500">Expired</span>}
                                                    </div>
                                                    <h3 className="text-lg font-black text-gray-900">{assignment.test?.title}</h3>
                                                    {assignment.instructions && <p className="text-sm text-gray-600 mt-1">{assignment.instructions}</p>}
                                                    <div className="flex items-center gap-4 text-xs text-gray-500 font-medium mt-1">
                                                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{assignment.test?.duration} mins</span>
                                                        <span>{assignment.test?.totalMarks} marks</span>
                                                        {opens && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Opens: {opens.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                                                        {closes && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Due: {closes.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                                                    </div>
                                                </div>
                                                <div className="shrink-0">
                                                    {isExpired ? (
                                                        <span className="text-sm font-bold text-gray-400 font-mono">CLOSED</span>
                                                    ) : isOpen ? (
                                                        (assignment.test?.attempts?.length || 0) >= (assignment.maxAttempts || 1) ? (
                                                            <div className="flex items-center gap-2 text-gray-500 font-bold text-sm border border-gray-200 bg-gray-50 px-4 py-2.5 rounded-xl cursor-not-allowed">
                                                                <CheckCircle className="w-4 h-4" /> Max Attempts Reached
                                                            </div>
                                                        ) : (
                                                            <Link href={`/student/tests/${assignment.test?.id}/take`} className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-black text-sm transition shadow-lg shadow-indigo-900/20">
                                                                <PlayCircle className="w-4 h-4" /> {assignment.kind === 'HOMEWORK' ? 'Start Homework' : 'Start Test'}
                                                            </Link>
                                                        )
                                                    ) : (
                                                        <div className="flex items-center gap-2 text-amber-600 font-bold text-sm border border-amber-200 bg-amber-50 px-4 py-2.5 rounded-xl">
                                                            <Lock className="w-4 h-4" /> Scheduled
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'materials' && (
                        <div className="animate-in fade-in duration-300">
                            <h2 className="text-xl font-bold text-gray-900 mb-6">Study Materials</h2>
                            
                            {/* NEW: Microsoft OneNote Class Notebook Embed */}
                            {enrolledBatches?.some((e: any) => e.batch?.oneNoteUrl) && (
                                <div className="mb-8">
                                    <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4">Class Notebooks</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {enrolledBatches.filter((e: any) => e.batch?.oneNoteUrl).map((e: any) => (
                                            <div key={e.batch.id} className="border border-purple-200 rounded-2xl p-6 bg-gradient-to-br from-purple-50 to-indigo-50 shadow-sm hover:shadow-lg transition">
                                                <div className="flex items-center gap-3 mb-4">
                                                    <div className="bg-purple-100 text-purple-700 p-3 rounded-xl">
                                                        <BookOpen className="w-6 h-6" />
                                                    </div>
                                                    <div>
                                                        <h4 className="font-black text-gray-900">{e.batch.name}</h4>
                                                        <p className="text-xs text-purple-600 font-bold">OneNote Class Notebook</p>
                                                    </div>
                                                </div>
                                                <a 
                                                    href={e.batch.oneNoteUrl} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-xl font-black text-sm transition shadow-lg shadow-purple-200"
                                                >
                                                    📓 Open Class Notebook
                                                </a>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4">Files & Downloads</h3>
                            {materials.length === 0 ? (
                                <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
                                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-500 font-medium">No materials shared yet.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {materials.map((mat) => (
                                        <div key={mat.id} className={`flex items-center justify-between p-4 rounded-xl border ${mat.isFree ? 'border-gray-200 bg-white' : 'border-indigo-100 bg-indigo-50/30'}`}>
                                            <div className="flex items-center gap-4">
                                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${mat.isFree ? 'bg-gray-100 text-gray-500' : 'bg-indigo-100 text-indigo-600'}`}>
                                                    {mat.type === 'VIDEO' ? <PlayCircle className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-gray-900 text-sm">{mat.title}</p>
                                                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{mat.type} {mat.isFree && "• FREE"}</p>
                                                </div>
                                            </div>
                                            <button className="text-gray-400 hover:text-indigo-600 transition p-2"><Download className="w-5 h-5" /></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'performance' && (
                        <div className="animate-in fade-in duration-300 space-y-8">
                            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-indigo-600" /> Performance & Analytics</h2>
                            
                            {attempts.length === 0 ? (
                                <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
                                    <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-500 font-medium">No data available yet. Complete a test or practice session!</p>
                                </div>
                            ) : (
                                <>
                                    {/* Advanced Analytics Engine (Task 14) */}
                                    <PerformanceAnalytics attempts={attempts} />

                                    <div className="mt-12">
                                        <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-6">Recent Activity</h3>
                                        <div className="space-y-4">
                                            {attempts.map((attempt: any) => (
                                                <Link href={`/student/performance/${attempt.id}`} key={attempt.id} className="border border-gray-200 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4 hover:shadow-md hover:border-indigo-300 transition group block">
                                                    <div>
                                                        <h3 className="text-lg font-black text-gray-900 group-hover:text-indigo-600 transition">{attempt.test?.title || (attempt.isPracticeArena ? 'Practice Arena Session' : 'Untitled Test')}</h3>
                                                        <div className="flex items-center gap-4 text-xs text-gray-500 font-medium mt-1">
                                                            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Taken: {attempt.endTime ? new Date(attempt.endTime).toLocaleDateString('en-IN') : 'N/A'}</span>
                                                            <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded uppercase tracking-wider text-[10px] font-bold">{attempt.status}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-6 items-center flex-wrap md:flex-nowrap">
                                                        <div className="text-center">
                                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Score</p>
                                                            <p className="text-xl font-black text-emerald-600">{attempt.totalScore}</p>
                                                        </div>
                                                        <div className="text-center border-l pl-6 border-gray-200">
                                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Acc.</p>
                                                            <p className="text-lg font-bold text-gray-800">
                                                                {attempt.totalCorrect + attempt.totalIncorrect > 0 
                                                                    ? Math.round((attempt.totalCorrect / (attempt.totalCorrect + attempt.totalIncorrect)) * 100) 
                                                                    : 0}%
                                                            </p>
                                                        </div>
                                                        <div className="ml-4 text-indigo-500 font-bold text-sm bg-indigo-50 px-4 py-2 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition whitespace-nowrap">
                                                            View Analytics
                                                        </div>
                                                    </div>
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {activeTab === 'achieve' && (() => {
                        const last5 = attempts.slice(0, 5).reverse().map((a: any) => ({
                            name: a.isPracticeArena ? 'Practice' : (a.test?.title?.substring(0, 15) || 'Test'),
                            score: a.totalScore,
                        }));
                        const currentScore = last5.length > 0 ? last5[last5.length - 1].score : 0;
                        const gap = goal ? Math.max(0, goal.targetScore - currentScore) : null;
                        return (
                        <div className="animate-in fade-in duration-300 space-y-8">
                            <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                                <Star className="w-6 h-6 text-amber-500" /> Achieve — Target Tracker
                            </h2>

                            {!goal ? (
                                <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-3xl p-8 border border-amber-200 max-w-md">
                                    <h3 className="text-xl font-black text-gray-900 mb-2 flex items-center gap-2"><Target className="w-5 h-5 text-amber-500" /> Set Your Dream Goal</h3>
                                    <p className="text-gray-600 text-sm mb-6">Define your target and let us chart your path to success.</p>
                                    <form onSubmit={handleSaveGoal} className="space-y-4">
                                        <div>
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Target Exam</label>
                                            <select
                                                value={goalFormExam}
                                                onChange={e => setGoalFormExam(e.target.value)}
                                                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:ring-2 focus:ring-amber-400 outline-none font-medium"
                                                required
                                            >
                                                <option value="">Select exam...</option>
                                                <option value="JEE Main">JEE Main</option>
                                                <option value="JEE Advanced">JEE Advanced</option>
                                                <option value="NEET">NEET</option>
                                                <option value="Boards (Class 12)">Boards (Class 12)</option>
                                                <option value="Boards (Class 10)">Boards (Class 10)</option>
                                                <option value="KVPY">KVPY</option>
                                                <option value="Olympiad">Olympiad</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Target Score</label>
                                            <input
                                                type="number"
                                                placeholder="e.g. 250"
                                                value={goalFormScore}
                                                onChange={e => setGoalFormScore(e.target.value)}
                                                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-800 focus:ring-2 focus:ring-amber-400 outline-none font-bold text-lg"
                                                required min={1}
                                            />
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={isSavingGoal}
                                            className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-black py-3 rounded-xl transition shadow-md shadow-amber-500/30 flex items-center justify-center gap-2"
                                        >
                                            {isSavingGoal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />}
                                            Set My Goal
                                        </button>
                                    </form>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {/* Advanced Achievement Journey (Task 16) */}
                                    <AchieveJourney goal={goal} attempts={attempts} progress={progress} />
                                </div>
                            )}
                        </div>
                        );
                    })()}

                    {activeTab === 'payments' && (
                        <div className="animate-in fade-in duration-300">
                            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2"><CreditCard className="w-5 h-5 text-indigo-600" /> Fee & Payments</h2>
                            
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
                                <div className="bg-indigo-50 rounded-2xl p-6 border border-indigo-100">
                                    <h3 className="text-indigo-800 font-bold mb-1 text-xs uppercase tracking-wider">Total Fees</h3>
                                    <p className="text-2xl font-black text-indigo-900">₹ {Number(paymentSummary.totalAmount || 0).toLocaleString('en-IN')}</p>
                                </div>
                                <div className="bg-emerald-50 rounded-2xl p-6 border border-emerald-100">
                                    <h3 className="text-emerald-800 font-bold mb-1 text-xs uppercase tracking-wider">Total Paid</h3>
                                    <p className="text-2xl font-black text-emerald-600">₹ {Number(paymentSummary.totalPaid || 0).toLocaleString('en-IN')}</p>
                                </div>
                                <div className="bg-amber-50 rounded-2xl p-6 border border-amber-100">
                                    <h3 className="text-amber-800 font-bold mb-1 text-xs uppercase tracking-wider">Outstanding</h3>
                                    <p className="text-2xl font-black text-amber-600">₹ {Number(paymentSummary.totalOutstanding || 0).toLocaleString('en-IN')}</p>
                                </div>
                                <div className="bg-red-50 rounded-2xl p-6 border border-red-100">
                                    <h3 className="text-red-800 font-bold mb-1 text-xs uppercase tracking-wider">Overdue</h3>
                                    <p className="text-2xl font-black text-red-600">₹ {Number(paymentSummary.overdueAmount || 0).toLocaleString('en-IN')}</p>
                                </div>
                            </div>

                            <div className="border border-gray-200 rounded-2xl overflow-hidden scrollbar-none">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50 uppercase tracking-widest text-[10px] font-black text-gray-400">
                                        <tr>
                                            <th className="px-6 py-4 text-left">Installment</th>
                                            <th className="px-6 py-4 text-left">Due/Paid On</th>
                                            <th className="px-6 py-4 text-left">Amount</th>
                                            <th className="px-6 py-4 text-right">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {payments.map((p) => {
                                            const receiptNo = `REC-${p.id.slice(-6).toUpperCase()}`;
                                            const amt = Number(p.amount || 0);

                                            return (
                                                <tr key={p.id} className="hover:bg-gray-50 transition">
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <p className="text-sm font-bold text-gray-900">{p.description}</p>
                                                        {p.status === 'PAID' && (
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 uppercase">{receiptNo}</span>
                                                                <span className="text-[10px] text-gray-400 font-bold uppercase">{p.paymentMode || 'N/A'}</span>
                                                            </div>
                                                        )}
                                                        <p className="text-[10px] text-gray-300 font-bold uppercase mt-1 tracking-tighter">{p.enrollment?.batch?.name}</p>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        {p.status === 'PAID' ? (
                                                            <div>
                                                                <p className="text-xs font-bold text-emerald-700">Paid on</p>
                                                                <p className="text-[10px] text-gray-500 font-medium">{p.paymentDate ? new Date(p.paymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p>
                                                            </div>
                                                        ) : (
                                                            <div>
                                                                <p className="text-xs font-bold text-red-600">Due</p>
                                                                <p className="text-[10px] text-gray-500 font-medium">{p.dueDate ? new Date(p.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-black text-gray-900">
                                                        ₹ {amt.toLocaleString('en-IN')}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                                        {p.status === 'PAID' || p.status?.toUpperCase() === 'PAID' ? (
                                                            <div className="flex flex-col items-end gap-1">
                                                                <span className="bg-green-100 text-green-800 px-2 py-1 rounded-lg border border-green-300 text-[10px] font-black uppercase flex items-center gap-1">
                                                                    <CheckCircle className="w-3 h-3" /> Paid
                                                                </span>
                                                                <button 
                                                                    onClick={() => {
                                                                        setActivePaymentForPDF(p);
                                                                        setTimeout(() => {
                                                                            handleDownloadPDF('receipt-pdf-template', `Receipt_${p.id.slice(-6)}.pdf`);
                                                                            setTimeout(() => setActivePaymentForPDF(null), 1000);
                                                                        }, 100);
                                                                    }}
                                                                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 underline underline-offset-2 no-print mt-1"
                                                                >
                                                                    Download Receipt
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-700 transition shadow-sm shadow-indigo-200">
                                                                Pay Now
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'profile' && (
                        <div className="animate-in fade-in duration-300">
                            <h2 className="text-xl font-bold text-gray-900 mb-6">Profile Settings</h2>
                            <div className="max-w-xl bg-gray-50 p-6 rounded-2xl border border-gray-100">
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-bold text-gray-400 uppercase">First Name</label>
                                            <p className="font-bold text-gray-900">{(session?.user as any)?.firstName}</p>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-gray-400 uppercase">Last Name</label>
                                            <p className="font-bold text-gray-900">{(session?.user as any)?.lastName}</p>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-400 uppercase">Phone</label>
                                        <p className="font-bold text-gray-900">{(session?.user as any)?.mobileNumber}</p>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-400 uppercase">Class/Grade (Locked)</label>
                                        <p className="font-bold text-indigo-600">{(session?.user as any)?.class || 'Not set'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </div>
            {/* OFF-SCREEN PDF TEMPLATE FOR STUDENT RECEIPTS */}
            <div style={{ position: 'absolute', left: '-9999px', top: 0, opacity: 0, pointerEvents: 'none', colorScheme: 'light' }}>
                <div id="receipt-pdf-template" className="w-[800px] bg-white p-12 text-black font-sans" style={{ color: '#000000', backgroundColor: '#ffffff' }}>
                    <div className="flex justify-between items-center border-b-4 pb-6 mb-8" style={{ borderBottomColor: '#f59e0b' }}>
                        <img src="/logo.png" className="h-20 object-contain" alt="Logo" />
                        <div className="text-right">
                            <h1 className="text-3xl font-black" style={{ color: '#111827' }}>Sindhu's Mathswiz Classes</h1>
                            <p className="text-sm font-bold mt-1 uppercase tracking-widest" style={{ color: '#9ca3af' }}>Official Fee Receipt</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-12 mb-10">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: '#9ca3af' }}>Receipt No</p>
                            <p className="text-lg font-black" style={{ color: '#d97706' }}>REC-{activePaymentForPDF?.id?.slice(-6).toUpperCase()}</p>
                        </div>
                        <div className="text-right">
                             <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: '#9ca3af' }}>Payment Date</p>
                             <p className="text-lg font-bold" style={{ color: '#111827' }}>{activePaymentForPDF?.paymentDate ? new Date(activePaymentForPDF.paymentDate).toLocaleDateString('en-IN') : 'N/A'}</p>
                        </div>
                    </div>

                    <div className="rounded-3xl p-8 mb-10 border" style={{ backgroundColor: '#f9fafb', borderColor: '#f3f4f6' }}>
                        <div className="grid grid-cols-2 gap-8">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: '#9ca3af' }}>Billed To</p>
                                <p className="text-xl font-black" style={{ color: '#111827' }}>{(session?.user as any)?.name || 'Student'}</p>
                                <p className="text-sm font-medium" style={{ color: '#6b7280' }}>ID: {(session?.user as any)?.id?.slice(-6).toUpperCase()}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: '#9ca3af' }}>Batch / Class</p>
                                <p className="text-xl font-black" style={{ color: '#4f46e5' }}>{activePaymentForPDF?.enrollment?.batch?.name}</p>
                            </div>
                        </div>
                    </div>

                    <table className="w-full text-left border-collapse mb-12">
                        <thead>
                            <tr style={{ borderBottomColor: '#e5e7eb' }} className="border-b-2">
                                <th className="py-4 font-black uppercase text-xs" style={{ color: '#9ca3af' }}>Description</th>
                                <th className="py-4 font-black uppercase text-xs text-right" style={{ color: '#9ca3af' }}>Amount Paid</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="py-6 text-lg font-bold" style={{ color: '#1f2937' }}>{activePaymentForPDF?.description}</td>
                                <td className="py-6 text-2xl font-black text-right" style={{ color: '#d97706' }}>₹ {activePaymentForPDF?.amount?.toLocaleString('en-IN')}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div className="mt-20 pt-10 border-t flex justify-between items-end" style={{ borderTopColor: '#f3f4f6' }}>
                        <div className="text-[10px] font-medium leading-relaxed" style={{ color: '#9ca3af' }}>
                            <p>This is a system-generated document and does not require a physical signature.</p>
                            <p>For any queries, contact support@mathswiz.com</p>
                            <p className="mt-4 font-bold" style={{ color: '#111827' }}>© {new Date().getFullYear()} Sindhu's Mathswiz Classes</p>
                        </div>
                        <div className="text-center opacity-20 rotate-[-15deg]">
                            <div className="border-4 font-black text-4xl p-4 rounded-3xl uppercase tracking-tighter" style={{ borderColor: '#10b981', color: '#10b981' }}>
                                PAID
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Embedded OneNote Modal Overlay */}
            {embeddedNotebook && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
                    <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm transition-opacity" onClick={() => setEmbeddedNotebook(null)}></div>
                    <div className="relative w-full h-full max-w-6xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-[#7719aa]/20">
                        <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gradient-to-r from-[#7719aa] to-[#5c1384] text-white">
                            <h2 className="text-lg font-bold flex items-center gap-2"><BookOpen className="w-5 h-5 text-purple-200" /> Microsoft OneNote - Class Notebook</h2>
                            <button onClick={() => setEmbeddedNotebook(null)} className="text-white/80 hover:text-white hover:scale-110 active:scale-95 transition bg-white/10 rounded-full p-1"><XCircle className="w-6 h-6" /></button>
                        </div>
                        <div className="flex-1 bg-gray-100 p-2 sm:p-4">
                            <div className="w-full h-full rounded-xl overflow-hidden shadow-inner border border-gray-200 bg-white relative">
                                <div className="absolute inset-0 flex items-center justify-center z-0">
                                    <div className="flex flex-col items-center gap-3 text-gray-400">
                                        <Loader2 className="w-8 h-8 animate-spin text-[#7719aa]" />
                                        <p className="font-medium animate-pulse">Connecting to Microsoft Graph...</p>
                                    </div>
                                </div>
                                <iframe 
                                    src={embeddedNotebook} 
                                    className="w-full h-full relative z-10 bg-white"
                                    allow="camera; microphone; display-capture; autoplay; clipboard-write; fullscreen"
                                    sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads"
                                ></iframe>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
