'use client';

import React, { useState } from 'react';
import { 
    User as UserIcon, 
    Mail, 
    Phone, 
    GraduationCap, 
    Activity, 
    DollarSign, 
    Trash2, 
    ShieldAlert, 
    Key, 
    ChevronLeft,
    CheckCircle2,
    Clock,
    XCircle,
    Save,
    Calendar,
    FileText,
    ArrowUpRight
} from 'lucide-react';
import Link from 'next/link';
import { updateUserDetailsAction, deleteUserAction, toggleUserBlockAction, toggleEnrollmentStatusAction } from '@/actions/userActions';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

interface UserProfileClientProps {
    user: any;
}

export default function UserProfileClient({ user }: UserProfileClientProps) {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'details' | 'enrollments' | 'financial' | 'academic' | 'actions'>('details');
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        mobileNumber: user.mobileNumber || '',
        phone: user.phone || '',
        class: user.class || '',
        role: user.role || 'STUDENT'
    });


    const handleUpdateDetails = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        const res = await updateUserDetailsAction(user.id, formData);
        setIsSaving(false);
        if (res.success) {
            toast.success("User details updated successfully!");
        } else {
            toast.error(res.error || "Failed to update user.");
        }
    };

    const handleDeleteUser = async () => {
        if (confirm("Are you SURE you want to permanently delete this user? This action CANNOT be undone and will delete all their history.")) {
            const res = await deleteUserAction(user.id);
            if (res.success) {
                toast.success("User deleted.");
                router.push('/admin/dashboard');
            } else {
                toast.error(res.error || "Failed to delete user.");
            }
        }
    };

    const handleToggleBlock = async () => {
        const isBlocked = user.accountStatus === 'BLOCKED';
        const res = await toggleUserBlockAction(user.id, !isBlocked);
        if (res.success) {
            toast.success(isBlocked ? "User Unblocked" : "User Blocked");
        } else {
            toast.error(res.error || "Action failed.");
        }
    };
    const handleToggleEnrollmentStatus = async (enrollmentId: string, currentStatus: string) => {
        const newStatus = currentStatus === 'SUSPENDED' ? 'APPROVED' : 'SUSPENDED';
        const res = await toggleEnrollmentStatusAction(enrollmentId, newStatus);
        if (res.success) {
            toast.success(`Enrollment ${newStatus === 'SUSPENDED' ? 'Suspended' : 'Restored'}`);
            router.refresh();
        } else {
            toast.error(res.error || "Action failed.");
        }
    };

    // Financial Stats
    const totalFees = user.enrollments.reduce((acc: number, en: any) => acc + (en.feeStructure?.totalAmount || 0), 0);
    const totalPaid = user.enrollments.reduce((acc: number, en: any) => {
        return acc + en.payments.filter((p: any) => p.status === 'PAID').reduce((sum: number, p: any) => sum + p.amount, 0);
    }, 0);
    const outstanding = totalFees - totalPaid;

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header Section */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center gap-4">
                        <Link href="/admin/dashboard" className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                            <ChevronLeft className="w-5 h-5 text-gray-500" />
                        </Link>
                        <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-xl uppercase">
                            {user.firstName?.[0]}{user.lastName?.[0]}
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">{user.firstName} {user.lastName}</h1>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                    user.accountStatus === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : 
                                    user.accountStatus === 'BLOCKED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                                }`}>
                                    {user.accountStatus}
                                </span>
                                <span className="text-xs text-gray-400" suppressHydrationWarning>&bull; {user.role} &bull; Joined {new Date(user.createdAt).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    
                    {/* Left Sidebar: Nav & Stats */}
                    <div className="lg:col-span-1 space-y-6">
                        <nav className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                            {[
                                { id: 'details', label: 'Personal Details', icon: UserIcon },
                                { id: 'financial', label: 'Financial History', icon: DollarSign },
                                { id: 'academic', label: 'Academic Usage', icon: Activity },
                                { id: 'actions', label: 'Actions & Safety', icon: ShieldAlert },
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`w-full flex items-center gap-3 px-6 py-4 text-sm font-bold transition-all border-l-4 ${
                                        activeTab === tab.id 
                                            ? 'bg-indigo-50 text-indigo-700 border-indigo-600' 
                                            : 'text-gray-500 border-transparent hover:bg-gray-50'
                                    }`}
                                >
                                    <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-indigo-600' : 'text-gray-400'}`} />
                                    {tab.label}
                                </button>
                            ))}
                        </nav>

                        {/* Quick Metrics */}
                        <div className="bg-indigo-900 rounded-2xl p-6 text-white shadow-lg overflow-hidden relative">
                            <div className="absolute top-0 right-0 p-4 opacity-10"><Activity className="w-20 h-20" /></div>
                            <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-widest mb-4">Lifecycle Stats</h3>
                            <div className="space-y-4 relative z-10">
                                <div>
                                    <p className="text-2xl font-black">{user.testAttempts.length}</p>
                                    <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-tighter">Tests Taken</p>
                                </div>
                                <div className="h-px bg-white/10"></div>
                                <div>
                                    <p className="text-2xl font-black" suppressHydrationWarning>₹ {totalPaid.toLocaleString('en-IN')}</p>
                                    <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-tighter">Total Contributed</p>
                                </div>
                                <div className="h-px bg-white/10"></div>
                                <div>
                                    <p className="text-2xl font-black">{user.enrollments.length}</p>
                                    <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-tighter">Active Batches</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Main Content Area */}
                    <div className="lg:col-span-3">
                        
                        {/* Tab Content: Details */}
                        {activeTab === 'details' && (
                            <form onSubmit={handleUpdateDetails} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
                                <div className="p-8 border-b border-gray-100 flex justify-between items-center">
                                    <h2 className="text-xl font-bold text-gray-900">Personal Details</h2>
                                    <button 
                                        type="submit" 
                                        disabled={isSaving}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-bold text-sm shadow-md transition flex items-center gap-2 disabled:opacity-50"
                                    >
                                        {isSaving ? 'Saving...' : <><Save className="w-4 h-4" /> Save Changes</>}
                                    </button>
                                </div>
                                <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2"><UserIcon className="w-3 h-3" /> First Name</label>
                                        <input 
                                            type="text" 
                                            value={formData.firstName} 
                                            onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium transition" 
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2"><UserIcon className="w-3 h-3" /> Last Name</label>
                                        <input 
                                            type="text" 
                                            value={formData.lastName} 
                                            onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium transition" 
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2"><Mail className="w-3 h-3" /> Email Address</label>
                                        <input 
                                            type="email" 
                                            value={formData.email} 
                                            onChange={(e) => setFormData({...formData, email: e.target.value})}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium transition" 
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2"><Phone className="w-3 h-3" /> WhatsApp / Phone</label>
                                        <input 
                                            type="text" 
                                            value={formData.phone} 
                                            onChange={(e) => setFormData({...formData, phone: e.target.value})}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium transition" 
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2"><GraduationCap className="w-3 h-3" /> Class / Level</label>
                                        <select 
                                            value={formData.class} 
                                            onChange={(e) => setFormData({...formData, class: e.target.value})}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium transition"
                                        >
                                            <option value="">Select Class</option>
                                            <option value="Class 10">Class 10</option>
                                            <option value="Class 11">Class 11</option>
                                            <option value="Class 12">Class 12</option>
                                            <option value="Dropper">Dropper</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2"><ShieldAlert className="w-3 h-3" /> Account Role</label>
                                        <select 
                                            value={formData.role} 
                                            onChange={(e) => setFormData({...formData, role: e.target.value})}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium transition"
                                        >
                                            <option value="STUDENT">STUDENT</option>
                                            <option value="TEACHER">TEACHER</option>
                                            <option value="PARENT">PARENT</option>
                                            <option value="ADMIN">ADMIN</option>
                                        </select>
                                    </div>
                                </div>
                            </form>
                        )}
                        {/* Tab Content: Enrollments */}
                        {activeTab === 'enrollments' && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                                <h2 className="text-xl font-bold text-gray-900 mb-4 px-2">Manage Active Enrollments</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {user.enrollments.map((en: any) => (
                                        <div key={en.id} className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition group">
                                            <div className="flex justify-between items-start mb-6">
                                                <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg text-[10px] font-black tracking-widest border border-indigo-100 uppercase">
                                                    {en.batch.code}
                                                </div>
                                                <div className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                                                    en.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                    en.status === 'SUSPENDED' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                                    'bg-amber-50 text-amber-600 border-amber-100'
                                                }`}>
                                                    {en.status}
                                                </div>
                                            </div>
                                            <h3 className="text-lg font-black text-gray-900 mb-1">{en.batch.name}</h3>
                                            <p className="text-xs text-gray-500 font-medium mb-6" suppressHydrationWarning>Joined on {new Date(en.createdAt).toLocaleDateString()}</p>
                                            
                                            <div className="flex items-center gap-3">
                                                <button 
                                                    onClick={() => handleToggleEnrollmentStatus(en.id, en.status)}
                                                    className={`flex-1 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition flex items-center justify-center gap-2 ${
                                                        en.status === 'SUSPENDED' 
                                                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-100' 
                                                        : 'bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-100'
                                                    }`}
                                                >
                                                    {en.status === 'SUSPENDED' ? <><CheckCircle2 className="w-3.5 h-3.5" /> Restore Access</> : <><XCircle className="w-3.5 h-3.5" /> Suspend Student</>}
                                                </button>
                                                <Link 
                                                    href={`/admin/batches/${en.batch.id}`}
                                                    className="p-3 bg-gray-50 border border-gray-100 text-gray-400 hover:text-indigo-600 hover:bg-white hover:border-indigo-100 rounded-2xl transition"
                                                >
                                                    <ArrowUpRight className="w-4 h-4" />
                                                </Link>
                                            </div>
                                        </div>
                                    ))}
                                    {user.enrollments.length === 0 && (
                                        <div className="col-span-full py-16 text-center bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                                            <GraduationCap className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                            <p className="text-gray-500 font-bold">No batch enrollments found.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Tab Content: Financial */}
                        {activeTab === 'financial' && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Total Fee Ledger</p>
                                        <p className="text-3xl font-black text-gray-900" suppressHydrationWarning>₹ {totalFees.toLocaleString('en-IN')}</p>
                                    </div>
                                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-100 bg-emerald-50/30">
                                        <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-1">Total Received</p>
                                        <p className="text-3xl font-black text-emerald-700" suppressHydrationWarning>₹ {totalPaid.toLocaleString('en-IN')}</p>
                                    </div>
                                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-rose-100 bg-rose-50/30">
                                        <p className="text-xs font-bold text-rose-500 uppercase tracking-widest mb-1">Outstanding</p>
                                        <p className="text-3xl font-black text-rose-700" suppressHydrationWarning>₹ {outstanding.toLocaleString('en-IN')}</p>
                                    </div>
                                </div>

                                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                                    <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                                        <h3 className="text-lg font-bold text-gray-900">Consolidated Fee History</h3>
                                        <button className="text-xs font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-lg hover:bg-indigo-100 transition flex items-center gap-2">
                                            <ArrowUpRight className="w-3 h-3" /> Download Full Statement
                                        </button>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                                <tr>
                                                    <th className="px-6 py-4 text-left">Batch / Description</th>
                                                    <th className="px-6 py-4 text-left">Amount</th>
                                                    <th className="px-6 py-4 text-left">Status</th>
                                                    <th className="px-6 py-4 text-left">Paid At & Mode</th>
                                                    <th className="px-6 py-4 text-right">Receipt</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 bg-white">
                                                {user.enrollments.flatMap((en: any) => 
                                                    en.payments.map((p: any) => (
                                                        <tr key={p.id} className="hover:bg-gray-50 transition">
                                                            <td className="px-6 py-4">
                                                                <div className="text-sm font-bold text-gray-900">{en.batch.name}</div>
                                                                <div className="text-[10px] text-gray-400 font-medium italic">{p.description}</div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-black text-gray-900" suppressHydrationWarning>₹ {p.amount.toLocaleString('en-IN')}</td>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                {p.status === 'PAID' ? (
                                                                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black tracking-widest flex items-center gap-1 w-fit"><CheckCircle2 className="w-3 h-3" /> PAID</span>
                                                                ) : p.status === 'UPCOMING' ? (
                                                                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-[10px] font-black tracking-widest flex items-center gap-1 w-fit"><Clock className="w-3 h-3" /> UPCOMING</span>
                                                                ) : (
                                                                    <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[10px] font-black tracking-widest flex items-center gap-1 w-fit"><Clock className="w-3 h-3" /> OVERDUE</span>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                {p.paidAt ? (
                                                                    <div className="flex flex-col">
                                                                        <span className="text-xs font-bold text-gray-700" suppressHydrationWarning>{new Date(p.paidAt).toLocaleDateString()}</span>
                                                                        <span className="text-[10px] text-gray-400 italic">via {p.paymentMode || 'N/A'}</span>
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-xs text-gray-400 font-medium italic">Pending</span>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-4 text-right">
                                                                {p.status === 'PAID' && (
                                                                    <button className="text-[10px] font-bold text-indigo-600 hover:underline">Download</button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                                {user.enrollments.length === 0 && (
                                                    <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500 font-medium">No financial records found.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Tab Content: Academic */}
                        {activeTab === 'academic' && (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
                                <div className="p-8 border-b border-gray-100 flex justify-between items-center">
                                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                                        <Activity className="w-6 h-6 text-emerald-500" /> Academic Performance Ledger
                                    </h2>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                                            <tr>
                                                <th className="px-6 py-4 text-left">Test Title</th>
                                                <th className="px-6 py-4 text-left">Date & Time</th>
                                                <th className="px-6 py-4 text-left">Score Analysis</th>
                                                <th className="px-6 py-4 text-left">Accuracy</th>
                                                <th className="px-6 py-4 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 bg-white">
                                            {user.testAttempts.map((attempt: any) => (
                                                <tr key={attempt.id} className="hover:bg-gray-50 transition">
                                                    <td className="px-6 py-4">
                                                        <div className="text-sm font-bold text-gray-900">{attempt.test?.title || (attempt.isPracticeArena ? 'Adaptive Practice session' : 'Unknown Test')}</div>
                                                        <div className="text-[10px] text-gray-400 flex items-center gap-1">
                                                            {attempt.isPracticeArena ? <span className="text-emerald-500 font-bold">PRACTICE ARENA</span> : <span className="text-indigo-500 font-bold">FORMAL TEST</span>}
                                                            &bull; {attempt.status}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-bold text-gray-700 flex items-center gap-1" suppressHydrationWarning><Calendar className="w-3 h-3 text-gray-400" /> {new Date(attempt.startTime).toLocaleDateString()}</span>
                                                            <span className="text-[10px] text-gray-400 italic" suppressHydrationWarning>{new Date(attempt.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col">
                                                            <div className="text-sm font-black text-gray-900">{attempt.totalScore} <span className="text-xs text-gray-400 font-medium italic">Marks</span></div>
                                                            <div className="flex items-center gap-1 text-[10px]">
                                                                <span className="text-emerald-600 font-bold">+{attempt.totalCorrect}</span>
                                                                <span className="text-red-500 font-bold">-{attempt.totalIncorrect}</span>
                                                                <span className="text-gray-400">skipped {attempt.totalSkipped}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {attempt.totalCorrect + attempt.totalIncorrect > 0 ? (
                                                            <div className="flex flex-col gap-1 w-24">
                                                                <div className="flex justify-between text-[10px] font-bold">
                                                                    <span className="text-gray-500">ACCURACY</span>
                                                                    <span className="text-indigo-600">{Math.round((attempt.totalCorrect / (attempt.totalCorrect + attempt.totalIncorrect)) * 100)}%</span>
                                                                </div>
                                                                <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                                                                    <div 
                                                                        className="h-full bg-indigo-500 rounded-full" 
                                                                        style={{ width: `${(attempt.totalCorrect / (attempt.totalCorrect + attempt.totalIncorrect)) * 100}%` }}
                                                                    ></div>
                                                                </div>
                                                            </div>
                                                        ) : <span className="text-xs text-gray-400 font-medium italic">N/A</span>}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <Link href={`/student/performance/${attempt.id}`} className="p-2 text-gray-400 hover:text-indigo-600 transition inline-block">
                                                            <FileText className="w-4 h-4" />
                                                        </Link>
                                                    </td>
                                                </tr>
                                            ))}
                                            {user.testAttempts.length === 0 && (
                                                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500 font-medium">No test attempts recorded.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Tab Content: Actions */}
                        {activeTab === 'actions' && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                                    <div className="p-8 border-b border-gray-100 bg-red-50/30">
                                        <h2 className="text-xl font-black text-red-900 flex items-center gap-2">
                                            <ShieldAlert className="w-6 h-6" /> Danger Zone & Platform Access
                                        </h2>
                                        <p className="text-sm text-red-700 mt-1">Critical account management operations. Use with caution.</p>
                                    </div>
                                    <div className="p-8 space-y-6">
                                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50 p-6 rounded-2xl border border-gray-100">
                                            <div>
                                                <h3 className="font-bold text-gray-900 flex items-center gap-2"><Key className="w-4 h-4 text-amber-500" /> Force Password Reset</h3>
                                                <p className="text-xs text-gray-500 mt-1">This will immediately update their password to <code className="bg-amber-100 px-1 rounded text-amber-800">Mathswiz@123</code></p>
                                            </div>
                                            <button onClick={() => updateUserDetailsAction(user.id, { password: 'Mathswiz@123' }).then(() => toast.success("Password Reset!"))} className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs transition shadow-sm">Reset Password</button>
                                        </div>

                                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50 p-6 rounded-2xl border border-gray-100">
                                            <div>
                                                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                                    {user.accountStatus === 'BLOCKED' ? <><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Unblock Account Access</> : <><XCircle className="w-4 h-4 text-red-500" /> Suspend Platform Access</>}
                                                </h3>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {user.accountStatus === 'BLOCKED' ? "Restore full platform access for this user." : "Prevents the user from logging in or accessing any content."}
                                                </p>
                                            </div>
                                            <button 
                                                onClick={handleToggleBlock}
                                                className={`px-6 py-2.5 font-bold rounded-xl text-xs transition shadow-sm ${
                                                    user.accountStatus === 'BLOCKED' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'
                                                }`}
                                            >
                                                {user.accountStatus === 'BLOCKED' ? 'Restore Access' : 'Suspend Access'}
                                            </button>
                                        </div>

                                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-red-50/50 p-6 rounded-2xl border border-red-100">
                                            <div>
                                                <h3 className="font-bold text-red-900 flex items-center gap-2"><Trash2 className="w-4 h-4" /> Permanently Delete Account</h3>
                                                <p className="text-xs text-red-700 mt-1">This will scrub all personal data, financial history, and performance logs. This is IRREVERSIBLE.</p>
                                            </div>
                                            <button onClick={handleDeleteUser} className="px-6 py-2.5 bg-red-800 hover:bg-red-900 text-white font-bold rounded-xl text-xs transition shadow-sm">Delete Forever</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
