'use client';

import React, { useState, useEffect } from 'react';
import { Layers, FileText, TrendingUp, Plus, Users, CheckCircle2, Lock, MessageSquare, LineChart, AlertCircle, XCircle, ClipboardList, PenSquare, Trash2, Download, Video, Link as LinkIcon, Book, Loader2, RefreshCw } from 'lucide-react';
import { QuestionBankStudio } from "@/components/admin/QuestionBankStudio";
import { TestEngineCreator } from "@/components/admin/TestEngineCreator";
import { PlatformOverview } from "@/components/admin/PlatformOverview";
import { LiveClassCalendar } from "@/components/admin/LiveClassCalendar";
import { FeeManagement } from "@/components/admin/FeeManagement";
import { FeeStructureGenerator } from "@/components/admin/FeeStructureGenerator";
import { LeadCRM } from "@/components/admin/LeadCRM";
import { ReportsExport } from "@/components/admin/ReportsExport";
import KnowledgeBasePage from "../knowledge-base/page";
import { createBatchAction, deleteBatchAction } from "@/actions/batchActions";
import { createMaterialAction, updateMaterialAction, deleteMaterialAction } from "@/actions/materialActions";
// @ts-ignore
import { MaterialType } from "@prisma/client";
import { toast } from "react-hot-toast";
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

interface Batch {
    id: string;
    batchCode: string;
    course: { title: string };
    studentCount: number;
}

const mockEngagementData = [
    { week: 'Week 1', score: 65 },
    { week: 'Week 2', score: 70 },
    { week: 'Week 3', score: 68 },
    { week: 'Week 4', score: 75 },
    { week: 'Week 5', score: 82 },
    { week: 'Week 6', score: 85 },
];

const mockDoubts = [
    { id: 1, student: "Aarav Sharma", question: "Can someone re-explain the substitution method for this integral? I am stuck on question 4.", time: "10 mins ago", status: "PENDING" },
    { id: 2, student: "Priya Das", question: "Why does the matrix determinant equal zero in this specific edge case?", time: "1 hour ago", status: "PENDING" },
];

export default function TeacherDashboardClient({ 
    initialBatches = [], 
    initialPendingEnrollments = [], 
    initialPendingParents = [],
    initialMaterials = [],
    initialPayments = [],
    initialLeads = [],
    initialUsers = [],
    initialNotices = [],
    teacherId = '',
    initialStats = { totalStudents: 0, pendingAssignments: 0, liveTests: 0, activeNow: 0 }
}: any) {
    const { data: session } = useSession();
    const [activeTab, setActiveTab] = useState<'Platform Overview' | 'Live Classes' | 'User Directory' | 'Lead CRM' | 'Question Bank' | 'Test & Exam Engine' | 'Study Materials' | 'Fee Management' | 'Reports & Export' | 'System Features' | 'AI Training Content'>('Platform Overview');

    // State initialized with Server-fetched data
    const [batches, setBatches] = useState<Batch[]>(initialBatches);
    const [pendingEnrollments, setPendingEnrollments] = useState<any[]>(initialPendingEnrollments);
    const [pendingParents, setPendingParents] = useState<any[]>(initialPendingParents);
    const [totalStudents, setTotalStudents] = useState<number>(initialStats.totalStudents);
    const [pendingAssignments, setPendingAssignments] = useState<number>(initialStats.pendingAssignments);
    const [liveTests, setLiveTests] = useState<number>(initialStats.liveTests);
    const [activeNow, setActiveNow] = useState<number>(initialStats.activeNow);
    const [materials, setMaterials] = useState<any[]>(initialMaterials);
    const [payments, setPayments] = useState<any[]>(initialPayments);
    const [leads, setLeads] = useState<any[]>(initialLeads);
    const [users, setUsers] = useState<any[]>(initialUsers);
    const [notices, setNotices] = useState<any[]>(initialNotices);
    const [doubts, setDoubts] = useState(mockDoubts);
    const [isSyncingTeams, setIsSyncingTeams] = useState(false);

    // Notice form state
    const [noticeTitle, setNoticeTitle] = useState('');
    const [noticeContent, setNoticeContent] = useState('');
    const [noticeBatchId, setNoticeBatchId] = useState('');
    const [isPostingNotice, setIsPostingNotice] = useState(false);

    const [isAddBatchModalOpen, setAddBatchModalOpen] = useState(false);
    const [newCourseName, setNewCourseName] = useState('');
    const [newBatchCode, setNewBatchCode] = useState('');
    const [newBatchDate, setNewBatchDate] = useState('');
    const [isScheduleTestModalOpen, setIsScheduleTestModalOpen] = useState(false);
    const [testToSchedule, setTestToSchedule] = useState('');

    const [isMaterialModalOpen, setMaterialModalOpen] = useState(false);
    const [editingMaterial, setEditingMaterial] = useState<any>(null);

    const hasAutoSynced = React.useRef(false);

    // Re-fetch periodically or on demand if needed, but primary load is from props
    const fetchDashboardData = async () => {
        try {
            const timestamp = new Date().getTime();
            const res = await fetch(`/api/teacher/dashboard-data?t=${timestamp}`, { cache: 'no-store' });
            const data = await res.json();
            if (data.batches) setBatches(data.batches);
            if (data.pendingEnrollments) setPendingEnrollments(data.pendingEnrollments);
            if (data.pendingParents) setPendingParents(data.pendingParents);
            if (typeof data.totalStudents === 'number') setTotalStudents(data.totalStudents);
            if (typeof data.pendingAssignments === 'number') setPendingAssignments(data.pendingAssignments);
            if (typeof data.liveTests === 'number') setLiveTests(data.liveTests);
            if (typeof data.activeNow === 'number') setActiveNow(data.activeNow);
            if (data.materials) setMaterials(data.materials);
            if (data.payments) setPayments(data.payments);
            if (data.users) setUsers(data.users);
        } catch (error) {
            console.error("Failed to re-fetch teacher dashboard data", error);
        }
    };

    // Sync materials if props change
    useEffect(() => { setMaterials(initialMaterials); }, [initialMaterials]);

    // 🚀 INSTANT PERSISTENCE & AUTO-SYNC (Task Implementation)
    useEffect(() => {
        // 1. Immediate Load: Show last known data from DB instantly
        fetchDashboardData();

        // 2. Silent Background Sync: Refresh in background if MS token exists
        const token = (session as any)?.accessToken;
        if (token && !hasAutoSynced.current) {
            hasAutoSynced.current = true;
            // Trigger sync silently after a short delay
            const timeoutId = setTimeout(() => {
                handleGlobalSyncTeams(true); // true = silent mode
            }, 1000);
            return () => clearTimeout(timeoutId);
        }
    }, [(session as any)?.accessToken]);

    const handleApproval = async (targetId: string, action: 'APPROVED' | 'REJECTED', type: 'ENROLLMENT' | 'PARENT') => {
        try {
            const res = await fetch('/api/teacher/approvals', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetId, action, type })
            });
            if (res.ok) fetchDashboardData();
        } catch (error) {
            console.error("Failed to process approval", error);
        }
    };

    const handleAddBatch = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        
        try {
            // Call the Server Action instead of fetch()
            await createBatchAction(formData);
            
            toast.success("Batch created successfully!");
            // DO NOT MANUALLY UPDATE STATE HERE. 
            // The Server Action's `revalidatePath` will automatically fetch the new data
            // and pass it down through props.
            
            setAddBatchModalOpen(false);
            setNewCourseName('');
            setNewBatchCode('');
            setNewBatchDate('');
        } catch (error: any) {
            toast.error(error.message);
        }
    };

    const handleDeleteBatch = async (batchId: string) => {
        if (window.confirm("Are you sure you want to permanently delete this batch? All student enrollments will be lost.")) {
            try {
                await deleteBatchAction(batchId);
                toast.success("Batch deleted successfully!");
            } catch (error: any) {
                toast.error(error.message);
            }
        }
    };

    const handleGlobalSyncTeams = async (isSilent = false) => {
        if (!isSilent) setIsSyncingTeams(true);
        const toastId = !isSilent ? toast.loading("Auto-Syncing Microsoft Teams & Students...") : null;
        try {
            const res = await fetch('/api/admin/teams/sync', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ autoDiscovery: true })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            
            if (!isSilent) {
                toast.success(data.message || "Teams auto-synced successfully!", { id: toastId ?? undefined, duration: 5000 });
                // Show detailed sync logs
                if (data.logs && data.logs.length > 0) {
                    data.logs.forEach((log: string) => toast(log, { icon: '📋', duration: 4000 }));
                }
            }
            
            // Refresh counts and lists from DB once sync completes
            fetchDashboardData();
        } catch (error: any) {
            if (!isSilent) toast.error(error.message, { id: toastId ?? undefined });
        } finally {
            if (!isSilent) setIsSyncingTeams(false);
        }
    };

    const handleScheduleMeeting = async (batchId: string) => {
        const subject = prompt("Enter Meeting Subject (Optional):", "Live Class Session");
        if (subject === null) return;
        
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour later

        const toastId = toast.loading("Scheduling Teams Meeting...");
        try {
            const res = await fetch('/api/admin/teams/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    batchId, 
                    subject, 
                    startTime: startTime.toISOString(), 
                    endTime: endTime.toISOString() 
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            
            toast.success("Meeting Scheduled! Link copied to clipboard.", { id: toastId });
            navigator.clipboard.writeText(data.joinUrl);
            window.open(data.joinUrl, '_blank');
            fetchDashboardData();
        } catch (error: any) {
            toast.error(error.message, { id: toastId });
        }
    };

    const handleMaterialSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        if (session?.user) formData.append('teacherId', (session.user as any).id);

        try {
            if (editingMaterial) {
                formData.append('id', editingMaterial.id);
                await updateMaterialAction(formData);
                toast.success("Material updated successfully!");
            } else {
                await createMaterialAction(formData);
                toast.success("Material added successfully!");
            }
            setMaterialModalOpen(false);
            setEditingMaterial(null);
        } catch (error: any) {
            toast.error(error.message);
        }
    };

    const handleDeleteMaterial = async (id: string) => {
        if (window.confirm("Are you sure you want to delete this material?")) {
            try {
                await deleteMaterialAction(id);
                toast.success("Material deleted!");
            } catch (error: any) {
                toast.error(error.message);
            }
        }
    };

    const totalPending = pendingEnrollments.length + pendingParents.length;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <div className="flex-1 p-8">
                <div className="max-w-7xl mx-auto">
                    {/* Workspace Header */}
                    <div className="mb-8">
                        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Teacher Workspace</h1>
                        <p className="text-lg text-gray-500 mt-2 font-medium">Platform Analytics, User Management & Lead CRM</p>
                    </div>

                    {/* Top Metric Cards Row — Clickable to jump to tab */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                        {[
                            { title: 'My Total Students', value: totalStudents, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100', trend: '+5', tab: 'User Directory' },
                            { title: 'My Active Batches', value: batches.length, icon: Layers, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', trend: 'Live', tab: 'User Directory' },
                            { title: 'Pending Assignments', value: pendingAssignments, icon: ClipboardList, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', trend: 'Action Needed', tab: 'Test & Exam Engine' },
                            { title: 'Live Tests', value: liveTests, icon: CheckCircle2, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', trend: 'Active', tab: 'Test & Exam Engine' },
                        ].map((m, i) => (
                            <button key={i} onClick={() => setActiveTab(m.tab as any)} className={`bg-white p-6 rounded-2xl border ${m.border} shadow-sm hover:shadow-md transition-all group relative overflow-hidden text-left w-full cursor-pointer hover:scale-[1.02] active:scale-100`}>
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
                            </button>
                        ))}
                    </div>

                    {/* Pill-Shaped Secondary Navigation */}
                    <div className="flex space-x-2 mb-8 overflow-x-auto pb-2 scrollbar-none w-full">
                        {['Platform Overview', 'Live Classes', 'User Directory', 'Lead CRM', 'Question Bank', 'Test & Exam Engine', 'AI Training Content', 'Study Materials', 'Fee Management', 'Reports & Export', 'System Features'].map((tab) => (
                            <button 
                                key={tab} 
                                onClick={() => setActiveTab(tab as any)} 
                                className={`px-6 py-2.5 rounded-full font-bold text-sm whitespace-nowrap transition-all duration-200 border ${
                                    activeTab === tab 
                                        ? 'bg-indigo-900 text-white border-indigo-900 shadow-md transform scale-105' 
                                        : 'bg-white text-gray-600 hover:bg-gray-100 border-gray-200 hover:border-gray-300'
                                }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 min-h-[500px]">
                        {activeTab === 'Platform Overview' && (
                            <PlatformOverview 
                                totalPending={totalPending} 
                                onActionNow={() => setActiveTab('User Directory')} 
                            />
                        )}

                        {activeTab === 'Live Classes' && (
                            <div className="animate-in fade-in duration-300">
                                <LiveClassCalendar teacherId={teacherId} batches={batches} />
                            </div>
                        )}

                        {activeTab === 'User Directory' && (
                            <div className="animate-in fade-in duration-300">
                                {/* User Directory Summary Tiles */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                                    {[
                                        { label: 'Total Students (My Batches)', value: users.filter(u => u.role === 'STUDENT').length, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
                                        { label: 'Active Students', value: users.filter(u => u.role === 'STUDENT' && u.accountStatus !== 'SUSPENDED').length, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
                                        { label: 'Suspended Students', value: users.filter(u => u.role === 'STUDENT' && u.accountStatus === 'SUSPENDED').length, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
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
                                <div className="grid xl:grid-cols-2 gap-8 mb-8">
                                    <div>
                                        <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
                                            <h2 className="text-xl font-bold text-gray-900">Active Batches</h2>
                                            <div className="flex gap-2">
                                                <button onClick={() => handleGlobalSyncTeams(false)} disabled={isSyncingTeams} className="flex items-center gap-2 text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-100 transition shadow-sm text-sm disabled:opacity-50">
                                                    <RefreshCw className={`w-4 h-4 ${isSyncingTeams ? 'animate-spin' : ''}`} /> Sync MS Teams
                                                </button>
                                                <button onClick={() => setAddBatchModalOpen(true)} className="flex items-center gap-2 text-white bg-indigo-600 px-3 py-1.5 rounded-lg font-medium hover:bg-indigo-700 transition shadow-sm text-sm">
                                                    <Plus className="w-4 h-4" /> Generate Batch
                                                </button>
                                            </div>
                                        </div>
                                        <div className="overflow-hidden rounded-xl border border-gray-200 mb-8">
                                            <table className="min-w-full divide-y divide-gray-200">
                                                <thead className="bg-gray-50">
                                                    <tr>
                                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Batch Code</th>
                                                        <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Course</th>
                                                        <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Manage</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-gray-200">
                                                {batches.map((batch: any) => (
                                                    <tr key={batch.id} className="hover:bg-gray-50 transition group">
                                                        <td className="px-5 py-4 whitespace-nowrap">
                                                            <span className="inline-flex items-center justify-center px-2 py-1 rounded bg-indigo-50 text-indigo-700 font-mono font-bold text-sm mr-2">{batch.batchCode}</span>
                                                            <button onClick={() => navigator.clipboard.writeText(batch.batchCode)} className="text-xs text-gray-500 hover:text-indigo-600">Copy Link</button>
                                                        </td>
                                                        <td className="px-5 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{batch.course?.title}</td>
                                                        <td className="px-5 py-4 whitespace-nowrap text-right">
                                                            <div className="flex justify-end gap-2">
                                                                {batch.oneNoteUrl && (
                                                                    <a href={batch.oneNoteUrl} target="_blank" rel="noopener noreferrer" className="text-purple-600 p-2 hover:bg-purple-50 rounded-lg transition" title="Open Class Notebook">
                                                                        <Book size={16} />
                                                                    </a>
                                                                )}
                                                                {batch.teamChatUrl && (
                                                                    <a href={batch.teamChatUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 p-2 hover:bg-blue-50 rounded-lg transition" title="Open MS Teams Chat">
                                                                        <MessageSquare size={16} />
                                                                    </a>
                                                                )}
                                                                <Link href={`/teacher/batch-management/${batch.id}`} className="text-indigo-600 p-2 hover:bg-indigo-50 rounded-lg transition" title="Manage Students">
                                                                    <Users size={16} />
                                                                </Link>
                                                                <button onClick={() => handleDeleteBatch(batch.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors" title="Delete Batch">
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {batches.length === 0 && (
                                                    <tr><td colSpan={3} className="px-6 py-6 text-center text-gray-500 text-sm">No active batches available.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <h2 className="text-xl font-bold text-amber-900 mb-6 flex items-center gap-2"><Users className="w-5 h-5" /> Authorization Queue</h2>
                                    <div className="border border-amber-200 bg-amber-50/30 rounded-xl overflow-hidden shadow-sm">
                                        <div className="px-4 py-3 border-b border-amber-100 bg-amber-100/30">
                                            <h3 className="font-semibold text-amber-900 text-sm">Student Enrollments ({pendingEnrollments.length})</h3>
                                        </div>
                                        {pendingEnrollments.length > 0 ? (
                                            <ul className="divide-y divide-amber-100/50 bg-white">
                                                {pendingEnrollments.map((enr) => (
                                                    <li key={enr.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition">
                                                        <div>
                                                            <p className="font-medium text-gray-900">{enr.student?.firstName} {enr.student?.lastName}</p>
                                                            <p className="text-xs text-gray-500">{enr.student?.email}</p>
                                                            <p className="text-xs text-gray-400 font-medium">Phone: {enr.student?.phone || enr.student?.mobileNumber || "N/A"}</p>
                                                            <p className="text-sm text-indigo-600 font-mono font-bold mt-1">{(enr.batch as any)?.code || (enr.batch as any)?.batchCode}</p>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button onClick={() => handleApproval(enr.id, 'APPROVED', 'ENROLLMENT')} className="text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded font-medium text-sm transition">Allow</button>
                                                            <button onClick={() => handleApproval(enr.id, 'REJECTED', 'ENROLLMENT')} className="text-red-700 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded font-medium text-sm transition">Deny</button>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <div className="p-6 text-center text-gray-500 text-sm bg-white">No pending student enrollments.</div>
                                        )}
                                    </div>

                                    <div className="border border-amber-200 bg-amber-50/30 rounded-xl overflow-hidden shadow-sm">
                                        <div className="px-4 py-3 border-b border-amber-100 bg-amber-100/30">
                                            <h3 className="font-semibold text-amber-900 text-sm">Parent Accounts ({pendingParents.length})</h3>
                                        </div>
                                        {pendingParents.length > 0 ? (
                                            <ul className="divide-y divide-amber-100/50 bg-white">
                                                {pendingParents.map((parent) => (
                                                    <li key={parent.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition">
                                                        <div>
                                                            <p className="font-medium text-gray-900">{parent.firstName} {parent.lastName}</p>
                                                            <p className="text-xs text-gray-500">{parent.email}</p>
                                                            <p className="text-xs text-amber-600 font-bold uppercase mt-1">Parent Registration</p>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button onClick={() => handleApproval(parent.id, 'APPROVED', 'PARENT')} className="text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded font-medium text-sm transition">Verify</button>
                                                            <button onClick={() => handleApproval(parent.id, 'REJECTED', 'PARENT')} className="text-red-700 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded font-medium text-sm transition">Reject</button>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <div className="p-6 text-center text-gray-500 text-sm bg-white">No pending parent verifications.</div>
                                        )}
                                    </div>
                                </div>
                                </div>
                                
                                {/* Full Student Directory Table */}
                                <div className="mt-8">
                                    <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2"><Users className="w-5 h-5 text-indigo-600" /> All Enrolled Students</h2>
                                    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Student Name</th>
                                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Email</th>
                                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Joined</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {users.filter(u => u.role === 'STUDENT').map((student) => (
                                                    <tr key={student.id} className="hover:bg-gray-50 transition">
                                                        <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{student.firstName} {student.lastName}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{student.email}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <span className={`px-2 py-1 inline-flex text-[10px] leading-5 font-black uppercase rounded-full ${student.accountStatus === 'SUSPENDED' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                                                {student.accountStatus || 'ACTIVE'}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{new Date(student.createdAt).toLocaleDateString()}</td>
                                                    </tr>
                                                ))}
                                                {users.filter(u => u.role === 'STUDENT').length === 0 && (
                                                    <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">No students found. Enroll students via MS Teams Sync or manually.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'Test & Exam Engine' && <TestEngineCreator stats={{ liveTests, pendingAssignments }} />}

                        {activeTab === 'Question Bank' && <QuestionBankStudio />}

                        {activeTab === 'Study Materials' && (
                            <div className="animate-in fade-in duration-300">
                                <div className="flex justify-between items-center mb-8">
                                    <div>
                                        <h2 className="text-2xl font-black text-gray-900">Study Materials</h2>
                                        <p className="text-gray-500 font-medium">Manage PDFs, Formulas, and Video links for your students.</p>
                                    </div>
                                    <button 
                                        onClick={() => { setEditingMaterial(null); setMaterialModalOpen(true); }}
                                        className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition flex items-center gap-2 shadow-sm"
                                    >
                                        <Plus className="w-5 h-5" /> Add Material
                                    </button>
                                </div>

                                {materials.length === 0 ? (
                                    <div className="text-center py-24 border-2 border-dashed border-gray-100 rounded-3xl">
                                        <Book className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                                        <p className="text-gray-500 font-medium italic">No materials uploaded yet. Start by adding your first PDF or Video link.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                        {materials.map((mat: any) => (
                                            <div key={mat.id} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition group">
                                                <div className="flex justify-between items-start mb-4">
                                                    <div className={`p-3 rounded-xl ${mat.type === 'VIDEO' ? 'bg-red-50 text-red-600' : mat.type === 'PDF' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                                        {mat.type === 'VIDEO' ? <Video className="w-6 h-6" /> : mat.type === 'PDF' ? <FileText className="w-6 h-6" /> : <LinkIcon className="w-6 h-6" />}
                                                    </div>
                                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                                                        <button 
                                                            onClick={() => { setEditingMaterial(mat); setMaterialModalOpen(true); }}
                                                            className="p-2 text-gray-400 hover:text-indigo-600 transition"
                                                        >
                                                            <PenSquare className="w-4 h-4" />
                                                        </button>
                                                        <button 
                                                            onClick={() => handleDeleteMaterial(mat.id)}
                                                            className="p-2 text-gray-400 hover:text-red-600 transition"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                                <h3 className="text-lg font-black text-gray-900 mb-1">{mat.title}</h3>
                                                <p className="text-gray-500 text-sm line-clamp-2 mb-4 h-10">{mat.description || "No description provided."}</p>
                                                <div className="flex flex-wrap gap-2 mb-6">
                                                    <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider">{mat.class || "All Classes"}</span>
                                                    <span className="bg-gray-100 text-gray-600 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider">{mat.subject || "General"}</span>
                                                </div>
                                                <a 
                                                    href={mat.contentUrl} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="w-full inline-flex items-center justify-center gap-2 border-2 border-gray-900 text-gray-900 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-gray-900 hover:text-white transition"
                                                >
                                                    <Download className="w-4 h-4" /> View / Download
                                                </a>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'Fee Management' && (
                            <div className="space-y-12">
                                <FeeStructureGenerator />
                                <FeeManagement payments={payments} />
                            </div>
                        )}

                        {activeTab === 'Lead CRM' && (
                            <div className="animate-in fade-in duration-300">
                                <LeadCRM leads={leads} teacherId={teacherId} />
                            </div>
                        )}

                        {activeTab === 'Reports & Export' && (
                            <div className="animate-in fade-in duration-300">
                                {/* Reports Summary Tiles */}
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                                    {[
                                        { label: 'Total Students', value: totalStudents, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
                                        { label: 'Total Revenue', value: `₹${payments.filter((p: any) => p.status === 'PAID').reduce((acc: number, p: any) => acc + (p.amount || 0), 0).toLocaleString('en-IN')}`, icon: LineChart, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
                                        { label: 'Leads Converted', value: leads.filter((l: any) => l.status?.toUpperCase() === 'CONVERTED').length, icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
                                        { label: 'Live Tests', value: liveTests, icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
                                    ].map((m, i) => (
                                        <div key={i} className={`bg-white p-5 rounded-2xl border ${m.border} shadow-sm flex items-center gap-4`}>
                                            <div className={`p-2.5 ${m.bg} ${m.color} rounded-xl shrink-0`}>
                                                <m.icon className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{m.label}</p>
                                                <p className="text-xl font-black text-gray-900 leading-none mt-1">{m.value}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <ReportsExport 
                                    stats={{ totalStudents, liveTests, activeNow, testAttempts: [], studentProgress: [] }}
                                    users={users}
                                    leads={leads}
                                    payments={payments}
                                />
                            </div>
                        )}

                        {activeTab === 'System Features' && (
                            <div className="animate-in fade-in duration-300 space-y-8">
                                {/* Notice / Announcement Creator */}
                                <div>
                                    <h2 className="text-2xl font-black text-gray-900 tracking-tight mb-1">📢 Notice & Announcement Board</h2>
                                    <p className="text-gray-500 text-sm font-medium mb-6">Post batch-specific announcements that appear prominently on your students' dashboards.</p>

                                    {/* Notice form */}
                                    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-6 mb-8">
                                        <h3 className="text-lg font-black text-indigo-900 mb-4 flex items-center gap-2">
                                            <span className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center text-sm">✏️</span>
                                            Create New Announcement
                                        </h3>
                                        <form
                                            onSubmit={async (e) => {
                                                e.preventDefault();
                                                if (!noticeBatchId) { toast.error('Please select a batch'); return; }
                                                setIsPostingNotice(true);
                                                try {
                                                    const res = await fetch('/api/teacher/notices', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({ title: noticeTitle, content: noticeContent, batchId: noticeBatchId }),
                                                    });
                                                    if (!res.ok) throw new Error((await res.json()).error);
                                                    const newNotice = await res.json();
                                                    setNotices([newNotice, ...notices]);
                                                    setNoticeTitle('');
                                                    setNoticeContent('');
                                                    setNoticeBatchId('');
                                                    toast.success('Announcement posted successfully!');
                                                } catch (err: any) {
                                                    toast.error(err.message || 'Failed to post notice');
                                                } finally {
                                                    setIsPostingNotice(false);
                                                }
                                            }}
                                            className="space-y-4"
                                        >
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-black text-gray-600 uppercase tracking-widest mb-1.5">Title</label>
                                                    <input
                                                        required
                                                        type="text"
                                                        value={noticeTitle}
                                                        onChange={(e) => setNoticeTitle(e.target.value)}
                                                        placeholder="e.g. Class postponed to Saturday"
                                                        className="w-full border border-indigo-200 rounded-xl p-3 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-black text-gray-600 uppercase tracking-widest mb-1.5">Target Batch</label>
                                                    <select
                                                        required
                                                        value={noticeBatchId}
                                                        onChange={(e) => setNoticeBatchId(e.target.value)}
                                                        className="w-full border border-indigo-200 rounded-xl p-3 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                                    >
                                                        <option value="">Select a batch...</option>
                                                        {batches.map((b: any) => (
                                                            <option key={b.id} value={b.id}>{b.course?.title || b.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-black text-gray-600 uppercase tracking-widest mb-1.5">Message</label>
                                                <textarea
                                                    required
                                                    rows={3}
                                                    value={noticeContent}
                                                    onChange={(e) => setNoticeContent(e.target.value)}
                                                    placeholder="Write your announcement here..."
                                                    className="w-full border border-indigo-200 rounded-xl p-3 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                                                />
                                            </div>
                                            <div className="flex justify-end">
                                                <button
                                                    type="submit"
                                                    disabled={isPostingNotice || !noticeTitle.trim() || !noticeContent.trim() || !noticeBatchId}
                                                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3 rounded-xl transition shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {isPostingNotice ? <><Loader2 className="w-4 h-4 animate-spin" /> Posting...</> : <><Plus className="w-4 h-4" /> Post Announcement</>}
                                                </button>
                                            </div>
                                        </form>
                                    </div>

                                    {/* Existing Notices */}
                                    <h3 className="text-lg font-black text-gray-900 mb-4">📋 Posted Announcements ({notices.length})</h3>
                                    {notices.length === 0 ? (
                                        <div className="text-center py-16 border-2 border-dashed border-gray-100 rounded-2xl">
                                            <p className="text-4xl mb-3">📭</p>
                                            <p className="text-gray-400 font-medium">No announcements posted yet. Create your first one above.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {notices.map((n: any) => (
                                                <div key={n.id} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex items-start justify-between gap-4 hover:shadow-md transition">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                                                {n.batch?.name || 'All Batches'}
                                                            </span>
                                                            <span className="text-[10px] text-gray-400 font-medium" suppressHydrationWarning>
                                                                {new Date(n.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                            </span>
                                                        </div>
                                                        <h4 className="font-black text-gray-900">{n.title}</h4>
                                                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{n.content}</p>
                                                    </div>
                                                    <button
                                                        onClick={async () => {
                                                            if (!confirm('Delete this announcement?')) return;
                                                            try {
                                                                 await fetch(`/api/teacher/notices?id=${n.id}`, { method: 'DELETE' });
                                                                 setNotices(notices.filter((x: any) => x.id !== n.id));
                                                                 toast.success('Announcement deleted');
                                                            } catch {
                                                                 toast.error('Failed to delete');
                                                            }
                                                        }}
                                                        className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition shrink-0"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'AI Training Content' && (
                            <div className="animate-in fade-in duration-300">
                                <KnowledgeBasePage />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Add Batch Right Drawer */}
            {isAddBatchModalOpen && (
                <div className="fixed inset-0 z-50 flex justify-end">
                    <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity" onClick={() => setAddBatchModalOpen(false)}></div>
                    <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                        <div className="flex justify-between items-center p-6 border-b border-gray-100">
                            <h2 className="text-xl font-bold text-gray-900">Create New Batch</h2>
                            <button onClick={() => setAddBatchModalOpen(false)} className="text-gray-400 hover:text-gray-900 transition"><XCircle className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleAddBatch} className="flex flex-col flex-1">
                            <div className="p-6 flex-1 overflow-y-auto">
                                <p className="text-sm text-gray-500 mb-6">Set up a new batch space for your students. Fees are assigned individually later.</p>
                                <div className="space-y-5">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Batch Name</label>
                                        <input required name="name" type="text" value={newCourseName} onChange={(e) => setNewCourseName(e.target.value)} placeholder="e.g. Target JEE 2026" className="w-full border-gray-300 rounded-xl shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-3 border outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Batch Code</label>
                                        <input required name="code" type="text" value={newBatchCode} onChange={(e) => setNewBatchCode(e.target.value)} placeholder="e.g. JEE26" className="w-full border-gray-300 rounded-xl shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-3 border outline-none uppercase" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Batch Start Date</label>
                                        <input required name="startDate" type="date" value={newBatchDate} onChange={(e) => setNewBatchDate(e.target.value)} className="w-full border-gray-300 rounded-xl shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-3 border outline-none text-gray-700" />
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-3 justify-end">
                                <button type="button" onClick={() => setAddBatchModalOpen(false)} className="px-5 py-2.5 rounded-xl text-gray-700 font-bold hover:bg-gray-200 transition">Cancel</button>
                                <button type="submit" disabled={!newCourseName.trim() || !newBatchCode.trim() || !newBatchDate} className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed">Generate Batch</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Material Modal (Drawer style) */}
            {isMaterialModalOpen && (
                <div className="fixed inset-0 z-50 flex justify-end">
                    <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity" onClick={() => { setMaterialModalOpen(false); setEditingMaterial(null); }}></div>
                    <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                        <div className="flex justify-between items-center p-6 border-b border-gray-100">
                            <h2 className="text-xl font-bold text-gray-900">{editingMaterial ? 'Edit Material' : 'Add Study Material'}</h2>
                            <button onClick={() => { setMaterialModalOpen(false); setEditingMaterial(null); }} className="text-gray-400 hover:text-gray-900 transition"><XCircle className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleMaterialSubmit} className="flex flex-col flex-1">
                            <div className="p-6 flex-1 overflow-y-auto">
                                <div className="space-y-5">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Title</label>
                                        <input 
                                            required name="title" type="text" 
                                            defaultValue={editingMaterial?.title}
                                            placeholder="e.g. Limit Formulas PDF" 
                                            className="w-full border-gray-300 rounded-xl shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-3 border outline-none" 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Description</label>
                                        <textarea 
                                            name="description"
                                            defaultValue={editingMaterial?.description}
                                            placeholder="Brief overview of the material..." 
                                            className="w-full border-gray-300 rounded-xl shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-3 border outline-none h-24"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">Type</label>
                                            <select 
                                                name="type" 
                                                required 
                                                defaultValue={editingMaterial?.type || 'PDF'}
                                                className="w-full border-gray-300 rounded-xl shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-3 border outline-none bg-white"
                                            >
                                                <option value="PDF">PDF Document</option>
                                                <option value="VIDEO">Video Link</option>
                                                <option value="LINK">External Link</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">Class (Target Grade)</label>
                                            <select 
                                                name="class" 
                                                required 
                                                defaultValue={editingMaterial?.class || ''}
                                                className="w-full border-gray-300 rounded-xl shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-3 border outline-none bg-white"
                                            >
                                                <option value="">Select Class...</option>
                                                <option value="Class 12">Class 12</option>
                                                <option value="Class 11">Class 11</option>
                                                <option value="Class 10">Class 10</option>
                                                <option value="Dropper">Dropper</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Content URL</label>
                                        <input 
                                            required name="contentUrl" type="url" 
                                            defaultValue={editingMaterial?.contentUrl}
                                            placeholder="https://drive.google.com/... or https://youtube.com/..." 
                                            className="w-full border-gray-300 rounded-xl shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-3 border outline-none" 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Subject</label>
                                        <input 
                                            name="subject" type="text" 
                                            defaultValue={editingMaterial?.subject}
                                            placeholder="e.g. Mathematics" 
                                            className="w-full border-gray-300 rounded-xl shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-3 border outline-none" 
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="checkbox" 
                                            name="isFree" 
                                            value="true" 
                                            defaultChecked={editingMaterial?.isFree}
                                            className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <label className="text-sm font-bold text-gray-700">Make this material FREE for all classes</label>
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-3 justify-end">
                                <button type="button" onClick={() => { setMaterialModalOpen(false); setEditingMaterial(null); }} className="px-5 py-2.5 rounded-xl text-gray-700 font-bold hover:bg-gray-200 transition">Cancel</button>
                                <button type="submit" className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-600/20">
                                    {editingMaterial ? 'Update Material' : 'Publish Material'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
