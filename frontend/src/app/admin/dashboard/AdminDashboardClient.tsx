'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
    Users, 
    LayoutDashboard, 
    TrendingUp, 
    DollarSign, 
    Activity, 
    Bell, 
    Search, 
    Filter, 
    Plus, 
    Download, 
    CheckCircle2, 
    Clock,
    AlertCircle,
    XCircle,
    Copy,
    ExternalLink,
    ArrowUpRight,
    ArrowDownRight,
    MoreHorizontal,
    UserPlus,
    Lock,
    Eye,
    BookOpen,
    Zap,
    UserCheck,
    Loader2,
    FileText,
    Upload,
    Globe,
    FileSpreadsheet,
    Image,
    Youtube,
    FolderOpen,
    Sparkles,
    RefreshCw
} from 'lucide-react';
import { 
    LineChart, 
    Line, 
    AreaChart, 
    Area, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    ResponsiveContainer,
    BarChart,
    Bar,
    Cell
} from 'recharts';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useTheme } from 'next-themes';

import { PlatformOverview } from "@/components/admin/PlatformOverview";
import { UserDirectoryTable } from "@/components/admin/UserDirectoryTable";
import { QuestionBankStudio } from "@/components/admin/QuestionBankStudio";
import QuestionBankStats from "@/components/admin/QuestionBankStats";
import { TestEngineCreator } from "@/components/admin/TestEngineCreator";
import { LeadCRM } from "@/components/admin/LeadCRM";
import { ReportsExport } from "@/components/admin/ReportsExport";
import { SystemFeatures } from "@/components/admin/SystemFeatures";
import { FeeManagement } from "@/components/admin/FeeManagement";
import { FeeStructureGenerator } from "@/components/admin/FeeStructureGenerator";
import { ManageWebsiteStudio } from "@/components/admin/ManageWebsiteStudio";
import { IngestionHub } from "@/components/admin/IngestionHub";
import { QuestionReviewQueue } from "@/components/admin/QuestionReviewQueue";
interface AdminDashboardClientProps {
    stats: {
        totalUsers: number;
        totalBatches: number;
        activeSessions: number;
        revenue: number;
        questionBank?: { total: number; approved: number; pending: number; draft: number; public: number; teacherPrivate: number; pendingTeacherReview: number };
        userDirectory?: { totalStudents: number; activeEnrolled: number; suspended: number };
        testEngine?: { total: number; published: number };
    };
    users: any[];
    leads: any[];
    coupons: any[];
    banners: any[];
    notifications: any[];
    sitePages: any[];
    payments: any[];
    pendingReviewQuestions?: any[];
}

export default function AdminDashboardClient({ 
    stats, 
    users, 
    leads: initialLeads,
    coupons,
    banners,
    notifications,
    sitePages,
    payments,
    pendingReviewQuestions = []
}: AdminDashboardClientProps) {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        setMounted(true);
    }, []);
    const [activeKpiModal, setActiveKpiModal] = useState<string | null>(null);
    const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
    const [newLead, setNewLead] = useState({ name: '', phone: '', courseInterest: '' });
    const [leads, setLeads] = useState(initialLeads);
    const [activeTab, setActiveTab] = useState<'Platform Overview' | 'User Directory' | 'Manage Website' | 'Approvals' | 'Lead CRM' | 'Curriculum Manager' | 'Test & Exam Engine' | 'Reports & Export' | 'System Features' | 'Fee Management' | 'Question Bank'>('Platform Overview');
    const [isCreateBatchOpen, setIsCreateBatchOpen] = useState(false);
    const [newBatch, setNewBatch] = useState({ name: '', code: '', teacherId: '', class: 'Class 12', startDate: '' });

    const [questionBankStats, setQuestionBankStats] = useState(stats.questionBank);

    const handleQuestionStatsChange = useCallback((apiStats: any) => {
        if (!apiStats) return;
        setQuestionBankStats(prev => ({
            total: apiStats.total ?? prev?.total ?? 0,
            approved: apiStats.approved ?? prev?.approved ?? 0,
            pending: apiStats.pending ?? prev?.pending ?? 0,
            draft: apiStats.draft ?? prev?.draft ?? 0,
            public: prev?.public ?? 0,
            teacherPrivate: prev?.teacherPrivate ?? 0,
            pendingTeacherReview: prev?.pendingTeacherReview ?? 0,
        }));
    }, []);

    const handleAddLeadSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/admin/leads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newLead)
            });
            if (res.ok) {
                const lead = await res.json();
                setLeads([lead, ...leads]);
                setIsAddLeadOpen(false);
                setNewLead({ name: '', phone: '', courseInterest: '' });
                toast.success('Lead added successfully!');
            }
        } catch (error) {
            toast.error('Failed to add lead');
        }
    };

    const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
    const [approvalsLoading, setApprovalsLoading] = useState(true);
    const [processingApproval, setProcessingApproval] = useState<string | null>(null);

    useEffect(() => {
        fetchPendingApprovals();
    }, []);

    const fetchPendingApprovals = async () => {
        try {
            const res = await fetch('/api/admin/users/pending');
            const data = await res.json();
            if (data.users) setPendingApprovals(data.users);
        } catch (e) {
            console.error('Failed to fetch pending approvals');
        } finally {
            setApprovalsLoading(false);
        }
    };

    const handleApproval = async (userId: string, status: 'APPROVED' | 'BLOCKED') => {
        setProcessingApproval(userId);
        try {
            const res = await fetch('/api/admin/users/pending', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, status }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success(status === 'APPROVED' ? 'User approved' : 'User rejected');
                fetchPendingApprovals();
            } else {
                toast.error('Action failed');
            }
        } catch (e) {
            toast.error('Network error');
        } finally {
            setProcessingApproval(null);
        }
    };

    const ApprovalsTab = () => (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Account Approvals</h2>
                    <p className="text-sm text-gray-500 mt-1">Review and approve pending user registrations</p>
                </div>
                <Link href="/admin/approvals" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
                    View Full Page <ExternalLink className="w-3 h-3" />
                </Link>
            </div>

            {approvalsLoading ? (
                <div className="flex items-center justify-center p-12">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                </div>
            ) : pendingApprovals.length === 0 ? (
                <div className="bg-white p-12 rounded-xl border text-center">
                    <UserCheck className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-slate-700">No pending approvals</h3>
                    <p className="text-slate-500 mt-1">All user accounts have been reviewed</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {pendingApprovals.map((user: any) => (
                        <div key={user.id} className="bg-white p-6 rounded-xl border shadow-sm">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
                                        <span className="text-lg font-bold text-indigo-600">
                                            {(user.firstName || user.email || '?')[0].toUpperCase()}
                                        </span>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-slate-900">
                                            {user.firstName && user.lastName
                                                ? `${user.firstName} ${user.lastName}`
                                                : user.email || 'Unnamed User'}
                                        </h3>
                                        <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                                user.role === 'TEACHER' ? 'bg-purple-100 text-purple-700' :
                                                user.role === 'PARENT' ? 'bg-amber-100 text-amber-700' :
                                                'bg-blue-100 text-blue-700'
                                            }`}>
                                                {user.role}
                                            </span>
                                            {user.mobileNumber && <span>{user.mobileNumber}</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleApproval(user.id, 'APPROVED')}
                                        disabled={processingApproval === user.id}
                                        className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                                    >
                                        {processingApproval === user.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <CheckCircle2 className="w-4 h-4" />
                                        )}
                                        Approve
                                    </button>
                                    <button
                                        onClick={() => handleApproval(user.id, 'BLOCKED')}
                                        disabled={processingApproval === user.id}
                                        className="flex items-center gap-2 bg-rose-600 text-white px-4 py-2 rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50"
                                    >
                                        <XCircle className="w-4 h-4" />
                                        Reject
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    const SummaryTile = ({ title, value, icon: Icon, color, bg, detail }: any) => (
        <div className={`bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4 transition-all hover:shadow-md`}>
            <div className={`p-2.5 ${bg} ${color} rounded-lg`}>
                <Icon className="w-5 h-5" />
            </div>
            <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{title}</p>
                <div className="flex items-baseline gap-2">
                    <h4 className="text-xl font-black text-gray-900 tracking-tight">{value}</h4>
                    {detail && <span className="text-[10px] font-bold text-gray-400">{detail}</span>}
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50 pb-12">
            {/* Top Navigation */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
                <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-8">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                                <Activity className="w-5 h-5 text-white" />
                            </div>
                            <span className="font-extrabold text-xl tracking-tight text-gray-900">ADMIN <span className="text-indigo-600">COMMAND</span></span>
                        </div>
                        <div className="hidden md:flex items-center bg-gray-100 rounded-xl px-4 py-2 w-96 border border-gray-200 focus-within:ring-2 focus-within:ring-indigo-500 transition-all">
                            <Search className="w-4 h-4 text-gray-400" />
                            <input 
                                type="text" 
                                placeholder="Search by name, email or mobile..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="bg-transparent border-none outline-none ml-3 text-sm w-full font-medium" 
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => setIsCreateBatchOpen(true)}
                            className="hidden lg:flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-md shadow-indigo-100"
                        >
                            <Plus className="w-4 h-4" /> Create Batch
                        </button>
                        <button className="p-2 text-gray-400 hover:bg-gray-100 rounded-full relative transition-colors">
                            <Bell className="w-5 h-5" />
                            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full"></span>
                        </button>
                        <button 
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                        >
                            <Zap className={`w-5 h-5 ${(mounted && theme === 'dark') ? 'text-amber-400 fill-amber-400' : ''}`} />
                        </button>
                        <div className="h-8 w-px bg-gray-200 mx-2"></div>
                        <div className="flex items-center gap-3 pl-2">
                            <div className="text-right hidden sm:block">
                                <p className="text-sm font-bold text-gray-900">Master Admin</p>
                                <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Global Control</p>
                            </div>
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-lg border-2 border-white shadow-sm">A</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 mt-8">
                {/* Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    {[
                        { title: 'Global Users', value: stats.totalUsers, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100', trend: '+12%', id: 'users' },
                        { title: 'Active Batches', value: stats.totalBatches, icon: LayoutDashboard, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', trend: '+3', id: 'batches' },
                        { title: 'Live Now', value: stats.activeSessions, icon: Activity, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', trend: 'Live', id: 'active' },
                        { title: 'Gross Revenue', value: `â‚¹${stats.revenue.toLocaleString()}`, icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', trend: '+18%', id: 'revenue' },
                    ].map((m, i) => (
                        <div key={i} onClick={() => setActiveKpiModal(m.id)} className={`bg-white p-6 rounded-2xl border ${m.border} shadow-sm hover:shadow-md transition-all cursor-pointer group relative overflow-hidden`}>
                            <div className={`absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity`}>
                                <m.icon className="w-16 h-16" />
                            </div>
                            <div className="flex items-center gap-3 mb-4">
                                <div className={`p-2 ${m.bg} ${m.color} rounded-xl`}>
                                    <m.icon className="w-5 h-5" />
                                </div>
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{m.title}</span>
                            </div>
                            <div className="flex items-end justify-between">
                                <h3 className="text-3xl font-black text-gray-900 tracking-tight" suppressHydrationWarning>{m.value}</h3>
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${m.trend.includes('+') ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                    {m.trend}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* DEEP INTELLIGENCE / QUICK ACTIONS - Prominent Ingestion & Explorer */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <button onClick={() => window.location.href = '/admin/ingestion'} className="group bg-gradient-to-br from-indigo-900 to-indigo-950 p-6 rounded-3xl border border-indigo-500/30 shadow-xl shadow-indigo-950/20 hover:scale-[1.01] transition-all flex items-center justify-between overflow-hidden relative">
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Upload className="w-24 h-24 text-white" />
                        </div>
                        <div className="relative z-10">
                            <div className="w-12 h-12 bg-indigo-500/20 rounded-2xl flex items-center justify-center mb-4 border border-indigo-400/30">
                                <Upload className="w-6 h-6 text-indigo-400" />
                            </div>
                            <h3 className="text-xl font-black text-white mb-2">Ingestion Hub</h3>
                            <p className="text-indigo-200/60 text-xs font-bold max-w-xs">PDF, Images, URLs, and Excel - all in one place.</p>
                        </div>
                        <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white group-hover:bg-indigo-600 transition-colors">
                            <ArrowUpRight className="w-5 h-5" />
                        </div>
                    </button>

                    <button onClick={() => window.location.href = '/admin/question-bank'} className="group bg-gradient-to-br from-amber-900 to-amber-950 p-6 rounded-3xl border border-amber-500/30 shadow-xl shadow-amber-950/20 hover:scale-[1.01] transition-all flex items-center justify-between overflow-hidden relative">
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Clock className="w-24 h-24 text-white" />
                        </div>
                        <div className="relative z-10">
                            <div className="w-12 h-12 bg-amber-500/20 rounded-2xl flex items-center justify-center mb-4 border border-amber-400/30">
                                <Clock className="w-6 h-6 text-amber-400" />
                            </div>
                            <h3 className="text-xl font-black text-white mb-2">Question Review</h3>
                            <p className="text-amber-200/60 text-xs font-bold max-w-xs">{questionBankStats?.pendingTeacherReview || 0} teacher questions awaiting your approval.</p>
                        </div>
                        <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white group-hover:bg-amber-600 transition-colors">
                            <ArrowUpRight className="w-5 h-5" />
                        </div>
                    </button>

                    <button onClick={() => setActiveTab('Question Bank')} className="group bg-gradient-to-br from-slate-900 to-slate-950 p-6 rounded-3xl border border-slate-700/50 shadow-xl shadow-slate-950/20 hover:scale-[1.01] transition-all flex items-center justify-between overflow-hidden relative">
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                            <BookOpen className="w-24 h-24 text-white" />
                        </div>
                        <div className="relative z-10">
                            <div className="w-12 h-12 bg-slate-700/50 rounded-2xl flex items-center justify-center mb-4 border border-slate-600/50">
                                <BookOpen className="w-6 h-6 text-slate-400" />
                            </div>
                            <h3 className="text-xl font-black text-white mb-2">Question Bank</h3>
                            <p className="text-slate-400 text-xs font-bold max-w-xs">{questionBankStats?.total || 0} questions in the repository.</p>
                            <div className="flex flex-wrap gap-1.5 mt-3">
                                <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded text-[10px] font-bold">{questionBankStats?.approved || 0} Approved</span>
                                <span className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded text-[10px] font-bold">{questionBankStats?.pending || 0} Pending</span>
                                <span className="bg-slate-600/30 text-slate-400 px-2 py-0.5 rounded text-[10px] font-bold">{questionBankStats?.draft || 0} Drafts</span>
                                <span className="bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded text-[10px] font-bold">{questionBankStats?.public || 0} Public</span>
                            </div>
                        </div>
                        <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white group-hover:bg-slate-700 transition-colors">
                            <ArrowUpRight className="w-5 h-5" />
                        </div>
                    </button>
                </div>

                {/* Pill-Shaped Secondary Navigation */}
                <div className="flex space-x-2 mb-8 overflow-x-auto pb-2 scrollbar-none w-full">
                    {['Platform Overview', 'User Directory', 'Curriculum Manager', 'Manage Website', 'Approvals', 'Lead CRM', 'Test & Exam Engine', 'Fee Management', 'Reports & Export', 'System Features', 'Question Bank'].map((tab) => (
                        <button 
                            key={tab} 
                            onClick={() => setActiveTab(tab as any)} 
                            className={`px-6 py-2.5 rounded-full font-bold text-sm whitespace-nowrap transition-all duration-200 border ${
                                activeTab === tab 
                                    ? 'bg-indigo-900 text-white border-indigo-900 shadow-md transform scale-105' 
                                    : 'bg-white text-gray-600 hover:bg-gray-100 border-gray-200 hover:border-gray-300'
                            }`}
                        >
                            {tab === 'Manage Website' ? 'Manage Website' : tab}
                        </button>
                    ))}
                </div>

                <div className="animate-in fade-in duration-300">
                    {/* Platform Overview Tab */}
                    {activeTab === 'Platform Overview' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                             <PlatformOverview 
                                totalPending={users.filter(u => u.accountStatus === 'PENDING').length} 
                                onActionNow={() => setActiveTab('User Directory')} 
                            />
                        </div>
                    )}

                    {/* User Directory Tab */}
                    {activeTab === 'User Directory' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                <SummaryTile title="Total Students" value={stats.userDirectory?.totalStudents} icon={Users} color="text-indigo-600" bg="bg-indigo-50" />
                                <SummaryTile title="Active Subscriptions" value={stats.userDirectory?.activeEnrolled} icon={CheckCircle2} color="text-emerald-600" bg="bg-emerald-50" detail="Enrolled in batches" />
                                <SummaryTile title="Suspended" value={stats.userDirectory?.suspended} icon={AlertCircle} color="text-red-600" bg="bg-red-50" />
                            </div>
                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                                <div className="xl:col-span-2 space-y-6">
                                    <UserDirectoryTable 
                                        users={users} 
                                        searchQuery={searchQuery} 
                                        onSearchChange={setSearchQuery} 
                                    />
                                </div>
                                <div className="xl:col-span-1 space-y-6">
                                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full max-h-[800px]">
                                        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                                            <div>
                                                <h2 className="text-lg font-bold text-gray-900">Entrance Interest</h2>
                                                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mt-0.5">Live Lead Queue</p>
                                            </div>
                                            <button onClick={() => setIsAddLeadOpen(true)} className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100"><UserPlus className="w-4 h-4" /></button>
                                        </div>
                                        <div className="flex-1 overflow-y-auto divide-y divide-gray-50 p-2">
                                            {leads.map((lead: any) => (
                                                <div key={lead.id} className="p-4 hover:bg-gray-50 rounded-xl transition-colors flex justify-between items-start gap-4">
                                                    <div className="space-y-1 min-w-0">
                                                        <div className="text-sm font-bold text-gray-900 truncate">{lead.name}</div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-black">{lead.courseInterest}</span>
                                                            <span className="text-[10px] font-bold text-gray-400">{lead.phone}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-2 text-[10px] text-gray-400 font-bold" suppressHydrationWarning>
                                                        {new Date(lead.createdAt).toLocaleDateString()}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Curriculum Manager Tab */}
                    {activeTab === 'Curriculum Manager' && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 rounded-2xl text-white mb-6">
                                <h2 className="text-xl font-bold mb-2">Curriculum Manager</h2>
                                <p className="text-indigo-100 text-sm">Manage the hierarchical taxonomy structure for curriculum classification. View, add, or edit topics across CBSE, NDA, CUET, and JEE Main syllabi.</p>
                                <a href="/admin/curriculum" className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-bold transition-colors">
                                    Open Full Manager <ExternalLink className="w-4 h-4" />
                                </a>
                            </div>
                        </div>
                    )}

                    {/* Test Engine Tab */}
                    {activeTab === 'Test & Exam Engine' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                <SummaryTile title="Total Exams Created" value={stats.testEngine?.total} icon={LayoutDashboard} color="text-indigo-600" bg="bg-indigo-50" />
                                <SummaryTile title="Live & Published" value={stats.testEngine?.published} icon={CheckCircle2} color="text-emerald-600" bg="bg-emerald-50" />
                            </div>
                            <TestEngineCreator />
                        </div>
                    )}
                    
                    {/* Manage Website Tab */}
                    {activeTab === 'Manage Website' && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                            <ManageWebsiteStudio sitePages={sitePages} />
                        </div>
                    )}

                    {/* CRM & Features Tabs */}
                    {activeTab === 'Lead CRM' && <div className="animate-in fade-in duration-500"><LeadCRM leads={leads} /></div>}
                    {activeTab === 'Reports & Export' && <div className="animate-in fade-in duration-500"><ReportsExport stats={stats} users={users} leads={leads} payments={payments} /></div>}
                    {activeTab === 'Approvals' && <ApprovalsTab />}
                    {activeTab === 'System Features' && (
                        <div className="animate-in fade-in duration-500">
                            <SystemFeatures coupons={coupons} banners={banners} notifications={notifications} />
                        </div>
                    )}

                    {/* Fee Management Tab */}
                    {activeTab === 'Question Bank' && (
                        <div className="animate-in fade-in duration-500 bg-white p-6 rounded-2xl border border-gray-200">
                            <QuestionBankStats onStatsChange={handleQuestionStatsChange} />
                        </div>
                    )}
                    {activeTab === 'Fee Management' && (
                        <div className="space-y-12 animate-in fade-in duration-500">
                            <FeeStructureGenerator />
                            <FeeManagement payments={payments} />
                        </div>
                    )}

                </div>
            </div>

            {/* Modal: Add Lead */}
            {isAddLeadOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-gray-100">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900">Manually Inject Lead</h3>
                            <button onClick={() => setIsAddLeadOpen(false)} className="text-gray-400 hover:text-gray-900 transition"><XCircle className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleAddLeadSubmit} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Full Name</label>
                                <input required type="text" value={newLead.name} onChange={e => setNewLead({ ...newLead, name: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium transition" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Mobile / WhatsApp</label>
                                <input required type="text" value={newLead.phone} onChange={e => setNewLead({ ...newLead, phone: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium transition" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Batch Interest (e.g., NDA 2026)</label>
                                <input required type="text" value={newLead.courseInterest} onChange={e => setNewLead({ ...newLead, courseInterest: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium transition" />
                            </div>
                            <div className="flex justify-end gap-3 pt-6">
                                <button type="button" onClick={() => setIsAddLeadOpen(false)} className="px-6 py-2.5 text-sm text-gray-600 font-bold hover:bg-gray-100 rounded-xl transition">Cancel</button>
                                <button type="submit" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-md transition shadow-indigo-100">Add Live Lead</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* KPI Modal - Simplified for now */}
            {activeKpiModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-xl border border-gray-100">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900 border-b-2 border-indigo-600 pb-2 uppercase tracking-tight">Active {activeKpiModal} Analytics</h3>
                            <button onClick={() => setActiveKpiModal(null)} className="text-gray-400 hover:text-gray-900 transition"><XCircle className="w-5 h-5" /></button>
                        </div>
                        <div className="p-12 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-300">
                            <Activity className="w-12 h-12 text-indigo-300 mx-auto mb-4 animate-pulse" />
                            <h3 className="text-lg font-bold text-gray-700">Detailed Analytics compiling...</h3>
                            <p className="text-xs text-gray-500 mt-2 font-medium">Crunching live usage telemetry and historical enrollment vectors.</p>
                        </div>
                        <div className="mt-6 flex justify-end">
                            <button onClick={() => setActiveKpiModal(null)} className="px-6 py-2.5 bg-gray-900 text-white font-bold rounded-xl text-xs transition">Dismiss Report</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Drawer: Create Batch */}
            {isCreateBatchOpen && (
                <>
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] animate-in fade-in" onClick={() => setIsCreateBatchOpen(false)} />
                    <div className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white z-[70] shadow-2xl border-l border-gray-100 animate-in slide-in-from-right duration-300 flex flex-col">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 tracking-tight">Create New Batch</h3>
                                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-1">Institutional Operations</p>
                            </div>
                            <button onClick={() => setIsCreateBatchOpen(false)} className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-900 transition-all hover:border-gray-300">
                                <XCircle className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Batch Name</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g., Target JEE 2026 Morning" 
                                        value={newBatch.name} 
                                        onChange={e => setNewBatch({ ...newBatch, name: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium transition" 
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Unique Batch Code</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g., JEE26M" 
                                        value={newBatch.code} 
                                        onChange={e => setNewBatch({ ...newBatch, code: e.target.value.toUpperCase() })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium transition uppercase" 
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Class / Segment</label>
                                        <select 
                                            value={newBatch.class} 
                                            onChange={e => setNewBatch({ ...newBatch, class: e.target.value })}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium transition"
                                        >
                                            <option>Class 12</option>
                                            <option>Class 11</option>
                                            <option>Repeaters</option>
                                            <option>NDA Entrance</option>
                                            <option>JEE Main</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Start Date</label>
                                        <input 
                                            type="date" 
                                            value={newBatch.startDate} 
                                            onChange={e => setNewBatch({ ...newBatch, startDate: e.target.value })}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium transition" 
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Assigned Teacher</label>
                                    <select 
                                        value={newBatch.teacherId} 
                                        onChange={e => setNewBatch({ ...newBatch, teacherId: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium transition"
                                    >
                                        <option value="">Select a Teacher</option>
                                        {users.filter(u => u.role === 'TEACHER').map(teacher => (
                                            <option key={teacher.id} value={teacher.id}>{teacher.firstName} {teacher.lastName}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3">
                                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                                <p className="text-[11px] font-medium text-amber-800 leading-relaxed">
                                    Batch codes are used by students to request enrollment. Make sure the code is easy to remember yet unique to this session.
                                </p>
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-3">
                            <button 
                                onClick={() => setIsCreateBatchOpen(false)}
                                className="flex-1 px-6 py-3 bg-white border border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition shadow-sm"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={async () => {
                                    if (!newBatch.name || !newBatch.code || !newBatch.teacherId) {
                                        toast.error("Please fill in all required fields");
                                        return;
                                    }
                                    try {
                                        const res = await fetch('/api/admin/batches', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify(newBatch)
                                        });
                                        const data = await res.json();
                                        if (res.ok) {
                                            toast.success("Batch created successfully!");
                                            setIsCreateBatchOpen(false);
                                            setNewBatch({ name: '', code: '', teacherId: '', class: 'Class 12', startDate: '' });
                                            // Optional: trigger refresh
                                            window.location.reload();
                                        } else {
                                            toast.error(data.error || "Failed to create batch");
                                        }
                                    } catch (err) {
                                        toast.error("An error occurred");
                                    }
                                }}
                                className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-100"
                            >
                                Launch Batch
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}


