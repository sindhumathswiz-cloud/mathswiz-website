'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Printer, ArrowUpRight, Ban, RefreshCw, Users, CreditCard, Receipt, Tag, Plus, Bell, CheckCircle2, ChevronRight, Loader2, X, Check, DollarSign, ClipboardList, Calendar, Trash2, Edit2, BarChart3, Clock } from 'lucide-react';
import { assignTestToBatchAction } from '@/actions/testActions';
import { assignFeeToStudentAction, assignCustomFeeToStudentAction, markPaymentPaidAction, deleteFeeStructureAction, updateFeeStructureAction, updatePaymentDueDateAction, suspendStudentAccessAction, reinstateStudentAccessAction } from '@/actions/feeActions';
import PrintLetterhead from '@/components/PrintLetterhead';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Cell } from 'recharts';
export default function ManageBatchClient({ batch, availableTests, initialAttempts }: { batch: any, availableTests: any[], initialAttempts: any[] }) {
    const { data: session } = useSession();
    const [activeTab, setActiveTab] = useState<'students' | 'fees' | 'ledger' | 'discounts' | 'assignments' | 'analytics'>('students');
    
    // Server-fetched relations available directly on `batch`
    const enrollments = batch.enrollments || [];
    const assignments = batch.assignments || [];
    const [attempts, setAttempts] = useState<any[]>(initialAttempts || []);

    const [feeStructures, setFeeStructures] = useState<any[]>([]);
    const [paymentLedger, setPaymentLedger] = useState<any[]>([]);
    const [activePaymentForPDF, setActivePaymentForPDF] = useState<any>(null);
    const [activeStudentForPDF, setActiveStudentForPDF] = useState<any>(null);

    const handleDownloadPDF = async (elementId: string, filename: string) => {
        const html2pdf = (await import('html2pdf.js')).default;
        const element = document.getElementById(elementId);
        if (!element) return;
        const opt = {
            margin:       10, // 10mm margin strictly applied
            filename:     filename,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, windowWidth: 800 }, // Lock width to prevent squishing
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        } as const;
        html2pdf().set(opt).from(element).save();
    };
    const [coupons, setCoupons] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Create Fee Structure form state
    const [showFeeForm, setShowFeeForm] = useState(false);
    const [editingFee, setEditingFee] = useState<any>(null); // Track fee being edited
    const [feeFormData, setFeeFormData] = useState<{name: string, totalAmount: string, installments: {amount: string, description: string, relativeDaysFromJoin: number}[]}>({ 
        name: '', totalAmount: '', installments: [{ amount: '', description: 'Installment 1', relativeDaysFromJoin: 0 }] 
    });
    
    // Coupons UI State
    const [showCouponForm, setShowCouponForm] = useState(false);
    const [couponCode, setCouponCode] = useState('');
    const [couponPct, setCouponPct] = useState('');
    const [couponAmt, setCouponAmt] = useState('');

    // Assignments UI State
    const [showAssignmentForm, setShowAssignmentForm] = useState(false);

    // Ledger Filters
    const [filterStart, setFilterStart] = useState('');
    const [filterEnd, setFilterEnd] = useState('');

    // Smart Fee & Custom Assignment State
    const [feeNumInstallments, setFeeNumInstallments] = useState('1');
    const [feeIntervalDays, setFeeIntervalDays] = useState('30');
    const [showCustomAssignModal, setShowCustomAssignModal] = useState(false);
    const [selectedEnrollmentForFee, setSelectedEnrollmentForFee] = useState<any>(null);
    const [customInstallments, setCustomInstallments] = useState<any[]>([]);
    
    // Mark Paid Modal State
    const [showMarkPaidModal, setShowMarkPaidModal] = useState(false);
    const [selectedPaymentForMark, setSelectedPaymentForMark] = useState<any>(null);
    const [markPaidData, setMarkPaidData] = useState({ paymentMode: 'UPI', paidAt: new Date().toISOString().split('T')[0] });

    // Ledger Tabs, Profile Drill-down & Printing
    const [activeTabFilter, setActiveTabFilter] = useState<'all' | 'suspended'>('all');
    const [selectedStudentForProfile, setSelectedStudentForProfile] = useState<any>(null);
    const [showStudentProfileModal, setShowStudentProfileModal] = useState<string | null>(null); // EnrollmentId

    // Analytics Filters
    const [selectedAnalyticsTest, setSelectedAnalyticsTest] = useState<string>('all');

    // Profile Modal Tabs
    const [activeProfileTab, setActiveProfileTab] = useState<'financial' | 'performance'>('financial');

    const fetchFeeStructures = useCallback(async () => {
        try {
            const res = await fetch('/api/teacher/fee-structures');
            if (res.ok) {
                const data = await res.json();
                setFeeStructures(data.feeStructures || []);
            }
        } catch (e) { console.error(e); }
    }, []);

    const fetchLedger = useCallback(async () => {
        try {
            const res = await fetch('/api/teacher/payments/ledger');
            if (res.ok) {
                const data = await res.json();
                setPaymentLedger((data.payments || []).filter((p: any) => p.enrollment?.batch?.id === batch.id));
            }
        } catch (e) { console.error(e); }
    }, [batch.id]);

    const fetchCoupons = useCallback(async () => {
        try {
            const res = await fetch('/api/teacher/coupons');
            if (res.ok) {
                const data = await res.json();
                setCoupons(data.coupons || []);
            }
        } catch (e) { console.error(e); }
    }, []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        await Promise.all([fetchFeeStructures(), fetchLedger(), fetchCoupons()]);
        setLoading(false);
    }, [fetchFeeStructures, fetchLedger, fetchCoupons]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        setAttempts(initialAttempts || []);
    }, [initialAttempts]);

    const sendReminder = async (recordId: string) => {
        const res = await fetch('/api/teacher/payments/remind', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId: recordId })
        });
        if (res.ok) toast.success('Reminder sent successfully!');
        else toast.error('Failed to send reminder');
    };

    const markPaidManually = async (recordId: string) => {
        const res = await fetch('/api/teacher/payments/manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId: recordId, recordedMode: 'CASH' })
        });
        if (res.ok) {
            toast.success('Payment recorded!');
            fetchLedger();
        } else toast.error('Failed to record payment');
    };

    const handleCreateFeeStructure = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const sum = feeFormData.installments.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
            const total = parseFloat(feeFormData.totalAmount);

            if (Math.abs(sum - total) > 0.01) {
                alert(`STRICT VALIDATION: Installment sum (₹${sum}) must equal Total Amount (₹${total})!`);
                return;
            }

            const installmentsToSave = feeFormData.installments.map((inst, idx) => ({
                amount: parseFloat(inst.amount),
                description: inst.description || `Installment ${idx + 1}`,
                relativeDaysFromJoin: inst.relativeDaysFromJoin || (idx * 30) // Fallback if manually added
            }));

            if (editingFee) {
                await updateFeeStructureAction(editingFee.id, {
                    name: feeFormData.name,
                    totalAmount: total,
                    installments: installmentsToSave
                });
                toast.success('Fee Structure updated!');
            } else {
                const res = await fetch('/api/teacher/fee-structures', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: feeFormData.name,
                        totalAmount: total,
                        installments: installmentsToSave
                    })
                });
                if (!res.ok) throw new Error('Failed to create structure');
                toast.success('Fee Structure saved!');
            }
            setShowFeeForm(false);
            setEditingFee(null);
            fetchData();
        } catch (err: any) {
            toast.error(err.message || 'Error saving fee structure');
        }
    };

    const autoGenerateInstallments = () => {
        const total = parseFloat(feeFormData.totalAmount) || 0;
        const num = parseInt(feeNumInstallments) || 1;
        const interval = parseInt(feeIntervalDays) || 30;

        const baseAmount = Math.floor(total / num);
        const remainder = total % num;

        const generated = Array.from({ length: num }).map((_, i) => ({
            amount: (i === 0 ? baseAmount + remainder : baseAmount).toString(),
            description: `Installment ${i + 1}`,
            relativeDaysFromJoin: (i * interval)
        }));

        setFeeFormData({ ...feeFormData, installments: generated });
    };

    const handleEditFee = (fee: any) => {
        setEditingFee(fee);
        setFeeFormData({
            name: fee.name,
            totalAmount: fee.totalAmount.toString(),
            installments: fee.installments.map((inst: any, idx: number) => ({
                amount: inst.amount.toString(),
                description: inst.description || `Installment ${idx + 1}`,
                relativeDaysFromJoin: inst.relativeDaysFromJoin || (idx * 30)
            }))
        });
        setFeeNumInstallments(fee.installments.length.toString());
        setShowFeeForm(true);
    };

    const handleCreateCoupon = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await fetch('/api/teacher/coupons', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: couponCode, discountPct: couponPct, discountAmt: couponAmt, batchId: batch.id })
        });
        if (res.ok) {
            toast.success('Coupon created!');
            fetchCoupons();
            setShowCouponForm(false);
            setCouponCode(''); setCouponPct(''); setCouponAmt('');
        } else toast.error('Failed to create coupon');
    };

    const handleAssignTest = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        formData.append("batchId", batch.id);

        try {
            await assignTestToBatchAction(formData);
            toast.success("Test assigned to batch successfully!");
            setShowAssignmentForm(false);
        } catch (err: any) {
            toast.error(err.message || "Failed to assign test");
        }
    };

    // Dynamic Overdue Logic & Filtering (Task 17 Refinement)
    const now = new Date();
    const processedLedger = paymentLedger.map(p => {
        const isOverdue = p.status === 'UPCOMING' && p.dueDate && new Date(p.dueDate) < now;
        return { ...p, displayStatus: isOverdue ? 'UNPAID' : p.status };
    });

    const filteredLedger = processedLedger.filter(p => {
        return true;
        if (!p.dueDate) return true;
        const d = new Date(p.dueDate);
        if (filterStart && d < new Date(filterStart)) return false;
        if (filterEnd && d > new Date(filterEnd)) return false;
        return true;
    });

    const totalPaid = filteredLedger.filter(p => p.displayStatus === 'PAID').reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const totalUpcoming = filteredLedger.filter(p => p.displayStatus === 'UPCOMING').reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const totalUnpaid = filteredLedger.filter(p => p.displayStatus === 'UNPAID').reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-7xl mx-auto">
                {/* Breadcrumb */}
                <div className="mb-8 flex items-center gap-2 text-sm text-gray-500 font-medium print:hidden">
                    <a href="/teacher/dashboard" className="hover:text-indigo-600">Dashboard</a>
                    <ChevronRight className="w-4 h-4" />
                    <span className="text-gray-900">{batch.name || 'Batch Management'}</span>
                </div>

                {/* Header Card */}
                <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 text-white rounded-2xl shadow-lg p-8 mb-8 print:hidden">
                    <h1 className="text-3xl font-extrabold tracking-tight mb-2">{batch.name}</h1>
                    <div className="flex items-center gap-4">
                        <span className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-white/20 backdrop-blur-sm text-white font-mono font-bold text-sm border border-white/30">
                            Code: {batch.code}
                        </span>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(batch.code);
                                toast.success("Batch code copied!");
                            }}
                            className="text-xs text-indigo-100 hover:text-white transition"
                        >
                            Copy Code
                        </button>
                        <span className="text-indigo-200 text-sm">{enrollments.length} students enrolled</span>
                    </div>
                </div>

                {/* Navigation Tabs */}
                <div className="flex space-x-2 mb-8 overflow-x-auto pb-2 scrollbar-none print:hidden">
                    {[
                        { id: 'students', label: 'Students', icon: Users },
                        { id: 'fees', label: 'Fee Structures', icon: CreditCard },
                        { id: 'ledger', label: 'Payment Ledger', icon: Receipt },
                        { id: 'discounts', label: 'Discounts', icon: Tag },
                        { id: 'assignments', label: 'Assignments', icon: ClipboardList },
                        { id: 'analytics', label: 'Analytics', icon: BarChart3 }
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-sm whitespace-nowrap transition-all duration-200 border ${
                                activeTab === tab.id
                                    ? 'bg-indigo-900 text-white border-indigo-900 shadow-md'
                                    : 'bg-white text-gray-600 hover:bg-gray-100 border-gray-200'
                            }`}
                        >
                            <tab.icon className="w-4 h-4" /> {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content Panel */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 min-h-[500px]">

                    {/* STUDENTS TAB */}
                    {activeTab === 'students' && (() => {
                        const activeStudents = enrollments.filter((e: any) => e.status === 'APPROVED');
                        const suspendedStudents = enrollments.filter((e: any) => e.status === 'SUSPENDED');

                        return (
                            <div className="animate-in fade-in duration-300">
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Users className="w-5 h-5 text-indigo-500" /> Batch Roster</h2>
                                </div>

                                {activeStudents.length === 0 && suspendedStudents.length === 0 ? (
                                    <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
                                        <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                        <p className="text-gray-500 font-medium">No students enrolled or suspended yet.</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-10">
                                        {/* SECTION 1: ACTIVE STUDENTS */}
                                        {activeStudents.length > 0 && (
                                            <div>
                                                <h3 className="font-bold text-sm text-green-700 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                                    Active Students ({activeStudents.length})
                                                </h3>
                                                <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm bg-white">
                                                    <table className="min-w-full divide-y divide-gray-200">
                                                        <thead className="bg-gray-50">
                                                            <tr>
                                                                <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase">Student</th>
                                                                <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase">Fee Structure</th>
                                                                <th className="px-6 py-3 text-right text-[10px] font-bold text-gray-400 uppercase">Management</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="bg-white divide-y divide-gray-200">
                                                            {activeStudents.map((enr: any) => (
                                                                <tr key={enr.id} className="hover:bg-gray-50/50 transition">
                                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                                        <div className="flex items-center gap-3">
                                                                            <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xs uppercase border border-indigo-200">
                                                                                {enr.student?.firstName?.[0] || '?'}{enr.student?.lastName?.[0] || '?'}
                                                                            </div>
                                                                            <div>
                                                                                <button 
                                                                                    onClick={() => {
                                                                                        setSelectedStudentForProfile(enr.student);
                                                                                        setActiveProfileTab('financial');
                                                                                        setShowStudentProfileModal(enr.id);
                                                                                    }}
                                                                                    className="font-bold text-gray-900 hover:text-indigo-600 transition block text-sm text-left"
                                                                                >
                                                                                    {enr.student?.firstName} {enr.student?.lastName}
                                                                                </button>
                                                                                <p className="text-[10px] text-gray-400 font-medium">{enr.student?.email} • {enr.student?.phone || "No Phone"}</p>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                                        {enr.feeStructure?.name ? (
                                                                            <span className="font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded-md text-xs">{enr.feeStructure.name}</span>
                                                                        ) : (
                                                                            <span className="text-gray-300 italic text-xs">Unassigned</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                                                        <div className="flex items-center gap-2 justify-end">
                                                                            <form action={async (formData) => {
                                                                                const feeId = formData.get('feeStructureId') as string;
                                                                                if (!feeId) return;
                                                                                try {
                                                                                    await assignFeeToStudentAction(formData);
                                                                                    toast.success('Fee assigned!');
                                                                                    window.location.reload();
                                                                                } catch (err: any) { toast.error(err.message); }
                                                                            }} className="flex items-center gap-2">
                                                                                <input type="hidden" name="enrollmentId" value={enr.id} />
                                                                                <select name="feeStructureId" className="text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg p-1.5 outline-none cursor-pointer">
                                                                                    <option value="">Quick Assign Fee</option>
                                                                                    {feeStructures.map(fs => <option key={fs.id} value={fs.id}>{fs.name}</option>)}
                                                                                </select>
                                                                                <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase hover:bg-indigo-700 transition">Assign</button>
                                                                            </form>
                                                                            <div className="h-4 w-[1px] bg-gray-200 mx-1" />
                                                                            <button 
                                                                                onClick={() => { 
                                                                                    setSelectedStudentForProfile(enr.student); 
                                                                                    setActiveProfileTab('performance');
                                                                                    setShowStudentProfileModal(enr.id); 
                                                                                }} 
                                                                                className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition" 
                                                                                title="View Progress Analytics"
                                                                            >
                                                                                <BarChart3 className="w-3.5 h-3.5" />
                                                                            </button>
                                                                            <div className="h-4 w-[1px] bg-gray-200 mx-1" />
                                                                            <button onClick={() => { setSelectedEnrollmentForFee(enr); setCustomInstallments(enr.feeStructure?.installments || []); setShowCustomAssignModal(true); }} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition" title="Manual Override"><Edit2 className="w-3.5 h-3.5" /></button>
                                                                            <button 
                                                                                onClick={async () => {
                                                                                    if(confirm('Suspend student access?')) {
                                                                                        await suspendStudentAccessAction(enr.id);
                                                                                        toast.success('Student suspended');
                                                                                        window.location.reload();
                                                                                    }
                                                                                }}
                                                                                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                                                                title="Suspend Access"
                                                                            >
                                                                                <Ban className="w-3.5 h-3.5" />
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}

                                        {/* SECTION 2: SUSPENDED STUDENTS */}
                                        {suspendedStudents.length > 0 && (
                                            <div>
                                                <h3 className="font-bold text-sm text-red-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                    <Ban className="w-4 h-4" />
                                                    Suspended Enrollments ({suspendedStudents.length})
                                                </h3>
                                                <div className="overflow-hidden rounded-xl border border-red-200 shadow-sm bg-red-50/30">
                                                    <div className="divide-y divide-red-100">
                                                        {suspendedStudents.map((enr: any) => (
                                                            <div key={enr.id} className="p-4 flex justify-between items-center bg-white/50">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-9 h-9 rounded-full bg-red-100 text-red-700 flex items-center justify-center font-black text-xs uppercase border border-red-200">
                                                                        {enr.student?.firstName?.[0] || '?'}{enr.student?.lastName?.[0] || '?'}
                                                                    </div>
                                                                    <div>
                                                                        <button 
                                                                            onClick={() => setShowStudentProfileModal(enr.id)}
                                                                            className="font-bold text-gray-900 hover:text-red-600 transition block text-sm text-left"
                                                                        >
                                                                            {enr.student?.firstName} {enr.student?.lastName}
                                                                        </button>
                                                                        <p className="text-[10px] text-red-600 font-bold uppercase tracking-tight">Access Revoked (Overdue Fees)</p>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <button 
                                                                        onClick={() => setShowStudentProfileModal(enr.id)}
                                                                        className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:text-gray-900 transition"
                                                                    >
                                                                        View Statement
                                                                    </button>
                                                                    <button 
                                                                        onClick={async () => {
                                                                            if(confirm('Reinstate access?')) {
                                                                                await reinstateStudentAccessAction(enr.id);
                                                                                toast.success('Access reinstated');
                                                                                window.location.reload();
                                                                            }
                                                                        }}
                                                                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-black uppercase shadow-lg shadow-emerald-200 transition"
                                                                    >
                                                                        Revoke Suspension
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* FEE STRUCTURES TAB */}
                    {activeTab === 'fees' && (
                        <div className="animate-in fade-in duration-300">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2"><CreditCard className="w-5 h-5 text-emerald-500" /> Fee Structures</h2>
                                <button 
                                    onClick={() => { setEditingFee(null); setFeeFormData({name: '', totalAmount: '', installments: [{ amount: '', description: 'Installment 1', relativeDaysFromJoin: 0 }] }); setShowFeeForm(true); }}
                                    className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg font-medium hover:bg-emerald-100 transition text-sm"
                                >
                                    <Plus className="w-4 h-4" /> Create Structure
                                </button>
                            </div>

                            {/* Fee structures grid below */}

                            {feeStructures.length === 0 && !showFeeForm ? (
                                <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
                                    <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-500 font-medium">No fee structures created yet</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {feeStructures.map((fs: any) => (
                                        <div key={fs.id} className="border border-gray-200 rounded-2xl p-6 hover:shadow-md transition relative group">
                                            <div className="absolute top-4 right-4 flex gap-2">
                                                <button 
                                                    onClick={() => handleEditFee(fs)}
                                                    className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                                    title="Edit Plan"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button 
                                                    onClick={async () => {
                                                        if (!window.confirm(`Delete "${fs.name}"? This cannot be undone.`)) return;
                                                        try {
                                                            await deleteFeeStructureAction(fs.id);
                                                            setFeeStructures(prev => prev.filter(f => f.id !== fs.id));
                                                            toast.success('Fee structure deleted.');
                                                        } catch (err: any) {
                                                            toast.error(err.message || 'Failed to delete.');
                                                        }
                                                    }}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                                    title="Delete Plan"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <h3 className="font-bold text-gray-900 mb-1 pr-8">{fs.name}</h3>
                                            <p className="text-3xl font-black text-emerald-600 mb-2">₹ {fs.totalAmount.toLocaleString('en-IN')}</p>
                                            <div className="space-y-1 mb-4">
                                                {Array.isArray(fs.installments) && fs.installments.map((inst: any, i: number) => (
                                                    <div key={i} className="flex justify-between text-xs text-gray-600 bg-gray-50 px-3 py-1.5 rounded-lg">
                                                        <span>{inst.description}</span>
                                                        <div className="flex items-center gap-3 text-right">
                                                            <span className="font-bold">₹{inst.amount?.toLocaleString('en-IN')}</span>
                                                            <span className="text-gray-400">+{inst.relativeDaysFromJoin || 0}d</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* PAYMENT LEDGER TAB */}
                    {activeTab === 'ledger' && (
                        <div className="animate-in fade-in duration-300">
                            <div className="flex justify-between items-center mb-6 print:hidden">
                                <div className="flex gap-4 items-center">
                                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Receipt className="w-5 h-5 text-purple-500" /> Payment Ledger</h2>
                                    <div className="flex bg-gray-100 p-1 rounded-xl">
                                        <button onClick={() => setActiveTabFilter('all')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${activeTabFilter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>All Payments</button>
                                        <button onClick={() => setActiveTabFilter('suspended')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 ${activeTabFilter === 'suspended' ? 'bg-red-600 text-white shadow-sm' : 'text-red-600 hover:bg-red-50'}`}>
                                            <Ban className="w-3 h-3" /> Suspended Students
                                        </button>
                                    </div>
                                </div>
                                <div className="flex gap-2 items-center">
                                    <div className="flex gap-1 items-center bg-white border border-gray-200 rounded-lg px-2 py-1">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase">From</label>
                                        <input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} className="text-xs focus:outline-none" />
                                        <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">To</label>
                                        <input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} className="text-xs focus:outline-none" />
                                    </div>
                                    <button onClick={() => window.print()} className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg font-bold hover:bg-black transition text-sm shadow-lg shadow-gray-200">
                                        <Printer className="w-4 h-4" /> Quick Print View
                                    </button>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-4 mb-6">
                                {[
                                    { label: 'Total Paid', val: totalPaid, color: 'emerald' },
                                    { label: 'Total Upcoming', val: totalUpcoming, color: 'blue' },
                                    { label: 'Total Unpaid', val: totalUnpaid, color: 'red' }
                                ].map(s => (
                                    <div key={s.label} className={`p-4 rounded-xl border text-center ${s.color === 'emerald' ? 'bg-emerald-50 border-emerald-200' : s.color === 'blue' ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'}`}>
                                        <p className={`text-2xl font-black ${s.color === 'emerald' ? 'text-emerald-700' : s.color === 'blue' ? 'text-blue-700' : 'text-red-700'}`}>
                                            ₹ {s.val.toLocaleString('en-IN')}
                                        </p>
                                        <p className={`text-xs font-bold uppercase tracking-wider ${s.color === 'emerald' ? 'text-emerald-600' : s.color === 'blue' ? 'text-blue-600' : 'text-red-600'}`}>{s.label}</p>
                                    </div>
                                ))}
                            </div>

                            <div className="overflow-hidden rounded-xl border border-gray-200">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Student</th>
                                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Due Date</th>
                                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {paymentLedger.filter(row => {
                                            if (activeTabFilter === 'suspended') return row.enrollment?.status === 'SUSPENDED';
                                            return true;
                                        }).map((row: any) => (
                                            <tr key={row.id} className="hover:bg-gray-50 transition">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                    <button 
                                                        onClick={() => { setSelectedStudentForProfile(row.enrollment?.student); setShowStudentProfileModal(row.enrollmentId); }}
                                                        className="hover:text-indigo-600 hover:underline text-left"
                                                    >
                                                        <span className="font-bold flex items-center gap-2">
                                                        {row.enrollment?.student?.firstName} {row.enrollment?.student?.lastName}
                                                        {row.enrollment?.status === 'SUSPENDED' && (
                                                            <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-black uppercase tracking-tighter border border-rose-200">Suspended</span>
                                                        )}
                                                    </span>
                                                    </button>
                                                    <div className="text-xs text-gray-500 mt-0.5">{row.description}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">₹ {row.amount?.toLocaleString('en-IN')}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                    {row.status === 'PAID' || row.status?.toUpperCase() === 'PAID' ? (
                                                        <div className="flex flex-col gap-1">
                                                            <span className="bg-green-100 text-green-800 text-[10px] font-black px-2 py-1 rounded-lg border border-green-300 w-max flex items-center gap-1">
                                                                <CheckCircle2 className="w-3 h-3" /> PAID
                                                            </span>
                                                            <div className="text-[10px] text-gray-500 font-bold uppercase leading-tight">
                                                                {row.paymentMode} • {row.paidAt ? new Date(row.paidAt).toLocaleDateString('en-IN') : 'N/A'}
                                                            </div>
                                                            <div className="text-[10px] font-black text-indigo-500 uppercase flex items-center gap-1">
                                                                REC-{row.id.slice(-6).toUpperCase()}
                                                                <button 
                                                                    onClick={() => { setActivePaymentForPDF(row); setTimeout(() => { handleDownloadPDF('receipt-pdf-template', `Receipt_${row.id.slice(-6)}.pdf`); setTimeout(() => setActivePaymentForPDF(null), 1000); }, 200); }}
                                                                    className="text-indigo-600 hover:text-indigo-800 underline ml-2"
                                                                >
                                                                    Download
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${row.displayStatus === 'UPCOMING' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                                                            {row.displayStatus}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {row.dueDate ? new Date(row.dueDate).toLocaleDateString('en-IN') : '—'}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                                    <div className="flex items-center justify-end gap-2">
                                                        {(row.status !== 'PAID' && row.status?.toUpperCase() !== 'PAID') && (
                                                            <>
                                                                <button onClick={() => sendReminder(row.id)} className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 px-3 py-1.5 rounded-lg font-medium transition text-xs print:hidden">
                                                                    <Bell className="w-3.5 h-3.5" /> Remind
                                                                </button>
                                                                <button 
                                                                    onClick={() => { setSelectedPaymentForMark(row); setShowMarkPaidModal(true); }}
                                                                    className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg font-medium transition text-xs print:hidden"
                                                                >
                                                                    <DollarSign className="w-3.5 h-3.5" /> Mark Paid
                                                                </button>
                                                                <button 
                                                                    onClick={() => {
                                                                        const date = prompt('Enter new due date (YYYY-MM-DD):');
                                                                        if (date) {
                                                                            updatePaymentDueDateAction(row.id, date)
                                                                                .then(() => { toast.success('Extension granted!'); fetchData(); })
                                                                                .catch(e => toast.error(e.message));
                                                                        }
                                                                    }}
                                                                    className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition print:hidden"
                                                                    title="Grant Extension"
                                                                >
                                                                    <Calendar className="w-4 h-4" />
                                                                </button>
                                                            </>
                                                        )}
                                                        <button 
                                                            onClick={async () => {
                                                                const student = enrollments.find((e: any) => e.id === row.enrollmentId)?.student;
                                                                setActiveStudentForPDF(student ? { ...student, enrollmentId: row.enrollmentId } : null);
                                                                setTimeout(() => {
                                                                    handleDownloadPDF('statement-pdf-template', `Statement_${student?.firstName || 'Student'}.pdf`);
                                                                    setTimeout(() => setActiveStudentForPDF(null), 1000);
                                                                }, 200);
                                                            }}
                                                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                                            title="Download Statement PDF"
                                                        >
                                                            <Receipt className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {loading && paymentLedger.length === 0 && (
                                            <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500"><Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-200" /></td></tr>
                                        )}
                                        {!loading && paymentLedger.length === 0 && (
                                            <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500">No payment records yet.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* DISCOUNTS TAB */}
                    {activeTab === 'discounts' && (
                        <div className="animate-in fade-in duration-300">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Tag className="w-5 h-5 text-purple-500" /> Discount Coupons</h2>
                                <button onClick={() => setShowCouponForm(true)} className="flex items-center gap-2 bg-purple-50 text-purple-700 px-4 py-2 rounded-lg font-medium hover:bg-purple-100 transition text-sm">
                                    <Plus className="w-4 h-4" /> Create Coupon
                                </button>
                            </div>

                            {showCouponForm && (
                                <div className="mb-6 border border-purple-200 bg-purple-50/30 rounded-2xl p-6">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="font-bold text-gray-900">New Discount Coupon</h3>
                                        <button onClick={() => setShowCouponForm(false)}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
                                    </div>
                                    <form onSubmit={handleCreateCoupon} className="space-y-4">
                                        <div className="grid grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Coupon Code</label>
                                                <input value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())} required placeholder="SAVE20" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none uppercase" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Discount (%)</label>
                                                <input type="number" value={couponPct} onChange={e => { setCouponPct(e.target.value); setCouponAmt(''); }} placeholder="20" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Flat Amount (₹)</label>
                                                <input type="number" value={couponAmt} onChange={e => { setCouponAmt(e.target.value); setCouponPct(''); }} placeholder="500" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none" />
                                            </div>
                                        </div>
                                        <button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-6 py-2.5 rounded-lg transition text-sm">
                                            Save Coupon
                                        </button>
                                    </form>
                                </div>
                            )}

                            {coupons.length === 0 && !showCouponForm ? (
                                <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
                                    <Tag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-500 font-medium">No active discount coupons</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {coupons.map((c: any) => (
                                        <div key={c.id} className="border border-gray-200 rounded-2xl p-6 bg-purple-50/10 hover:border-purple-300 transition">
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="font-mono font-bold text-lg text-purple-700">{c.code}</span>
                                                <span className="text-xs font-bold text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">ACTIVE</span>
                                            </div>
                                            <p className="text-2xl font-black text-gray-900">
                                                {c.discountPct ? `${c.discountPct}% OFF` : `₹${c.discountAmt} OFF`}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ASSIGNMENTS TAB */}
                    {activeTab === 'assignments' && (
                        <div className="animate-in fade-in duration-300">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                                    <ClipboardList className="w-5 h-5 text-indigo-500" /> Test Assignments
                                </h2>
                                <button 
                                    onClick={() => setShowAssignmentForm(!showAssignmentForm)} 
                                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-indigo-700 transition text-sm shadow-md"
                                >
                                    <Plus className="w-4 h-4" /> {showAssignmentForm ? 'Cancel' : 'Assign New Test'}
                                </button>
                            </div>

                            {showAssignmentForm && (
                                <div className="mb-8 border border-indigo-100 bg-indigo-50/30 rounded-2xl p-6 shadow-sm">
                                    <form onSubmit={handleAssignTest} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                        <div className="md:col-span-1">
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Select Test</label>
                                            <select name="testId" required className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition">
                                                <option value="">-- Choose Test --</option>
                                                {availableTests.map((t: any) => (
                                                    <option key={t.id} value={t.id}>{t.title}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Scheduled For</label>
                                            <input type="datetime-local" name="scheduledFor" className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Deadline</label>
                                            <input type="datetime-local" name="deadline" className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition" />
                                        </div>
                                        <div className="flex gap-2">
                                            <div className="flex-1">
                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Max Attempts</label>
                                                <input type="number" min="1" name="maxAttempts" defaultValue="1" className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition" />
                                            </div>
                                            <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-xl transition shadow-lg shadow-indigo-100 text-sm">
                                                Assign
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            )}

                            {batch.assignments.length === 0 ? (
                                <div className="text-center py-20 bg-white border-2 border-dashed border-gray-100 rounded-3xl">
                                    <ClipboardList className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                                    <p className="text-gray-400 font-bold">No tests assigned to this batch yet.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {batch.assignments.map((assignment: any) => (
                                        <div key={assignment.id} className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition group overflow-hidden relative">
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl group-hover:scale-110 transition-transform">
                                                    <ClipboardList className="w-6 h-6" />
                                                </div>
                                                <span className={`text-[10px] font-black px-2 py-1 rounded-full border uppercase tracking-widest ${assignment.test?.mode === 'STRICT' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
                                                    {assignment.test?.mode || 'STRICT'}
                                                </span>
                                            </div>
                                            <h3 className="text-lg font-black text-gray-900 mb-2">{assignment.test?.title}</h3>
                                            <div className="space-y-2 text-xs font-bold text-gray-500">
                                                <div className="flex justify-between border-b border-gray-50 pb-1">
                                                    <span>Scheduled:</span>
                                                    <span className="text-gray-900">{assignment.scheduledFor ? new Date(assignment.scheduledFor).toLocaleString() : 'Immediate'}</span>
                                                </div>
                                                <div className="flex justify-between border-b border-gray-50 pb-1">
                                                    <span>Deadline:</span>
                                                    <span className="text-gray-900">{assignment.deadline ? new Date(assignment.deadline).toLocaleString() : 'No Limit'}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>Max Attempts:</span>
                                                    <span className="text-indigo-600 bg-indigo-50 px-2 rounded-full">{assignment.maxAttempts}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ANALYTICS TAB */}
                    {activeTab === 'analytics' && (
                        <div className="animate-in fade-in duration-300">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                                <div>
                                    <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                                        <BarChart3 className="w-5 h-5 text-indigo-500" /> Batch Performance Analytics
                                    </h2>
                                    <p className="text-xs text-gray-500 font-medium">Track student results and filter for Entrance Exams.</p>
                                </div>
                                <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl w-full md:w-auto">
                                    <select 
                                        value={selectedAnalyticsTest}
                                        onChange={(e) => setSelectedAnalyticsTest(e.target.value)}
                                        className="bg-white text-gray-900 text-xs font-bold px-3 py-2 rounded-lg border-none focus:ring-2 focus:ring-indigo-500 outline-none min-w-[200px]"
                                    >
                                        <option value="all">Check All Test Results</option>
                                        {assignments.map((a: any) => (
                                            <option key={a.testId} value={a.testId}>
                                                {a.test?.mode === 'STRICT' ? '🏆 ' : '📝 '}
                                                {a.test?.title}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Aggregated Stats Overview */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                                <div className="bg-indigo-50 p-6 rounded-3xl border border-indigo-100">
                                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Total Attempts</p>
                                    <p className="text-3xl font-black text-indigo-700">{attempts.length}</p>
                                </div>
                                <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100">
                                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Avg Score %</p>
                                    <p className="text-3xl font-black text-emerald-700">
                                        {attempts.length > 0
                                            ? Math.round(attempts.reduce((acc, curr) => acc + (curr.totalScore / (curr.test?.totalMarks || 100)) * 100, 0) / attempts.length)
                                            : 0}%
                                    </p>
                                </div>
                                <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100">
                                    <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-1">Assigned Tests</p>
                                    <p className="text-3xl font-black text-amber-700">{assignments.length}</p>
                                </div>
                                <div className="bg-purple-50 p-6 rounded-3xl border border-purple-100">
                                    <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1">Top Score</p>
                                    <p className="text-3xl font-black text-purple-700">
                                        {attempts.length > 0 ? Math.max(...attempts.map(a => a.totalScore)) : 0}
                                    </p>
                                </div>
                            </div>

                            <div className="border border-gray-100 rounded-3xl overflow-hidden shadow-sm">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Student</th>
                                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Test Title</th>
                                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Mode</th>
                                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Score</th>
                                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Accuracy</th>
                                            <th className="px-6 py-4 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Date</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-50">
                                        {attempts
                                            .filter(a => selectedAnalyticsTest === 'all' || a.testId === selectedAnalyticsTest)
                                            .map((attempt: any) => {
                                                const totalQuestions = attempt.totalCorrect + attempt.totalIncorrect + attempt.totalSkipped;
                                                const accuracy = totalQuestions > 0 ? Math.round((attempt.totalCorrect / (attempt.totalCorrect + attempt.totalIncorrect)) * 100) : 0;
                                                return (
                                                    <tr key={attempt.id} className="hover:bg-gray-50/50 transition duration-200">
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                                                {attempt.user?.firstName} {attempt.user?.lastName}
                                                                {batch.enrollments.find((e: any) => e.studentId === attempt.userId)?.status === 'SUSPENDED' && (
                                                                    <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-black uppercase tracking-tighter border border-rose-200">Suspended</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="text-sm font-medium text-gray-700">{attempt.test?.title}</div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg ${attempt.test?.mode === 'STRICT' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                                {attempt.test?.mode}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="text-sm font-black text-indigo-600">{attempt.totalScore} <span className="text-gray-400 font-medium">/ {attempt.test?.totalMarks}</span></div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-16 bg-gray-100 h-1.5 rounded-full overflow-hidden">
                                                                    <div className={`h-full rounded-full ${accuracy > 80 ? 'bg-emerald-500' : accuracy > 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${accuracy}%` }}></div>
                                                                </div>
                                                                <span className="text-xs font-bold text-gray-700">{accuracy}%</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-right text-xs font-medium text-gray-500">
                                                            {attempt.endTime ? new Date(attempt.endTime).toLocaleDateString('en-IN') : 'N/A'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        {attempts.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="px-6 py-12 text-center text-gray-400 italic font-medium">No results recorded for this batch yet.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* MARK PAID MODAL */}
            {showMarkPaidModal && selectedPaymentForMark && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 animate-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900">Mark Payment as Paid</h3>
                            <button onClick={() => setShowMarkPaidModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
                        </div>
                        
                        <div className="bg-emerald-50 p-4 rounded-2xl mb-6">
                            <p className="text-xs font-bold text-emerald-600 uppercase mb-1">Payment Detail</p>
                            <p className="text-lg font-black text-emerald-900">₹ {selectedPaymentForMark.amount?.toLocaleString('en-IN')}</p>
                            <p className="text-sm text-emerald-700">{selectedPaymentForMark.description}</p>
                        </div>

                        <form action={async (formData) => {
                            try {
                                await markPaymentPaidAction(formData);
                                toast.success('Payment recorded! Generating receipt...');
                                setShowMarkPaidModal(false);
                                // Trigger PDF logic
                                setActivePaymentForPDF(selectedPaymentForMark);
                                setTimeout(() => {
                                    handleDownloadPDF('receipt-pdf-template', `Receipt_${selectedPaymentForMark.id.slice(-6)}.pdf`);
                                    setTimeout(() => setActivePaymentForPDF(null), 1000);
                                    fetchData();
                                }, 500);
                            } catch (err: any) {
                                toast.error(err.message || 'Failed to record payment');
                            }
                        }} className="space-y-4">
                            <input type="hidden" name="paymentId" value={selectedPaymentForMark.id} />
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Amount Received (₹)</label>
                                <input type="number" name="amountReceived" defaultValue={selectedPaymentForMark.amount} required className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-lg" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode</label>
                                <select name="paymentMode" required className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 outline-none">
                                    <option value="UPI">UPI (GPay / PhonePe / Paytm)</option>
                                    <option value="Cash">Cash</option>
                                    <option value="Bank Transfer">Bank Transfer (NEFT/IMPS)</option>
                                    <option value="Cheque">Cheque</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
                                <input type="date" name="paidAt" defaultValue={new Date().toISOString().split('T')[0]} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 outline-none" />
                            </div>
                            <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-2xl transition shadow-lg shadow-emerald-200 mt-4">
                                Confirm & Mark Paid
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* STUDENT PROFILE MODAL (FINANCIAL DRILL-DOWN) */}
            {showStudentProfileModal && selectedStudentForProfile && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col p-8 animate-in slide-in-from-bottom duration-300">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-2xl font-black text-gray-900">{selectedStudentForProfile.firstName} {selectedStudentForProfile.lastName}</h3>
                                <div className="flex bg-gray-100 p-1 rounded-xl mt-2 w-fit">
                                    <button 
                                        onClick={() => setActiveProfileTab('financial')}
                                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${activeProfileTab === 'financial' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                        Financials
                                    </button>
                                    <button 
                                        onClick={() => setActiveProfileTab('performance')}
                                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 ${activeProfileTab === 'performance' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                        <BarChart3 className="w-3 h-3" /> Performance
                                    </button>
                                </div>
                            </div>
                            <button onClick={() => setShowStudentProfileModal(null)}><X className="w-6 h-6 text-gray-400" /></button>
                        </div>

                        <div className="overflow-y-auto pr-2 space-y-6 flex-1">
                            {activeProfileTab === 'financial' ? (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-indigo-50 p-4 rounded-2xl">
                                            <p className="text-[10px] font-bold text-indigo-400 uppercase">Total Paid</p>
                                            <p className="text-xl font-black text-indigo-700">₹ {paymentLedger.filter(p => p.enrollmentId === showStudentProfileModal && p.status === 'PAID').reduce((acc, curr) => acc + curr.amount, 0).toLocaleString('en-IN')}</p>
                                        </div>
                                        <div className="bg-red-50 p-4 rounded-2xl">
                                            <p className="text-[10px] font-bold text-red-400 uppercase">Total Outstanding</p>
                                            <p className="text-xl font-black text-red-700">₹ {paymentLedger.filter(p => p.enrollmentId === showStudentProfileModal && p.status !== 'PAID').reduce((acc, curr) => acc + curr.amount, 0).toLocaleString('en-IN')}</p>
                                        </div>
                                    </div>

                                    <div className="border border-gray-100 rounded-2xl overflow-hidden">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase">Installment</th>
                                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase">Process</th>
                                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase">Status</th>
                                                    <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-400 uppercase">Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-100">
                                                {paymentLedger.filter(p => p.enrollmentId === showStudentProfileModal).map((p: any) => (
                                                    <tr key={p.id} className="hover:bg-gray-50 transition">
                                                        <td className="px-4 py-4 whitespace-nowrap">
                                                            <div className="text-sm font-bold text-gray-900">{p.description}</div>
                                                            {p.status === 'PAID' && <div className="text-[10px] font-black text-indigo-500 uppercase">REC-{p.id.slice(-6).toUpperCase()}</div>}
                                                        </td>
                                                        <td className="px-4 py-4 whitespace-nowrap">
                                                            <div className="text-xs font-black text-gray-700">{p.status === 'PAID' ? 'PAID ON' : 'DUE BY'}</div>
                                                            <div className="text-[10px] text-gray-500 font-medium">{(p.status === 'PAID' ? p.paidAt : p.dueDate) ? new Date(p.status === 'PAID' ? p.paidAt : p.dueDate).toLocaleDateString('en-IN') : '—'}</div>
                                                        </td>
                                                        <td className="px-4 py-4 whitespace-nowrap">
                                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${p.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                                {p.status}
                                                            </span>
                                                            {p.status === 'PAID' && <div className="text-[8px] text-gray-400 font-bold uppercase mt-1">{p.paymentMode}</div>}
                                                        </td>
                                                        <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-black text-gray-900">₹ {p.amount?.toLocaleString('en-IN')}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : (() => {
                                const studentAttempts = attempts.filter((a: any) => a.userId === selectedStudentForProfile.id);
                                const studentAvg = studentAttempts.length > 0 
                                    ? (studentAttempts.reduce((acc, curr) => acc + curr.totalScore, 0) / studentAttempts.length)
                                    : 0;
                                const batchAvg = attempts.length > 0
                                    ? (attempts.reduce((acc, curr) => acc + curr.totalScore, 0) / attempts.length)
                                    : 0;
                                const topperScore = attempts.length > 0
                                    ? Math.max(...attempts.map(a => a.totalScore))
                                    : 0;

                                return (
                                    <div className="space-y-6">
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="bg-indigo-50 p-4 rounded-2xl text-center">
                                                <p className="text-[10px] font-bold text-indigo-400 uppercase">Avg Score</p>
                                                <p className="text-xl font-black text-indigo-700">{studentAvg.toFixed(1)}</p>
                                            </div>
                                            <div className="bg-gray-50 p-4 rounded-2xl text-center">
                                                <p className="text-[10px] font-bold text-gray-400 uppercase">Batch Avg</p>
                                                <p className="text-xl font-black text-gray-700">{batchAvg.toFixed(1)}</p>
                                            </div>
                                            <div className="bg-emerald-50 p-4 rounded-2xl text-center">
                                                <p className="text-[10px] font-bold text-emerald-400 uppercase">Batch Top</p>
                                                <p className="text-xl font-black text-emerald-700">{topperScore}</p>
                                            </div>
                                        </div>

                                        <div className="h-48 w-full bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Benchmarking Comparison</p>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={[
                                                    { name: 'Student', score: studentAvg },
                                                    { name: 'Batch Avg', score: batchAvg },
                                                    { name: 'Batch Top', score: topperScore }
                                                ]}>
                                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                                                    <YAxis hide />
                                                    <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                                    <Bar dataKey="score" radius={[4, 4, 0, 0]} barSize={30}>
                                                        {[0,1,2].map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={index === 0 ? '#6366f1' : index === 1 ? '#94a3b8' : '#10b981'} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>

                                        <div>
                                            <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                                                <Clock className="w-4 h-4 text-indigo-500" /> Recent Attempts (Top 5)
                                            </h4>
                                            <div className="space-y-3">
                                                {studentAttempts.slice(0, 5).map((a: any) => (
                                                    <div key={a.id} className="bg-white border border-gray-100 p-3 rounded-xl flex items-center justify-between hover:shadow-sm transition">
                                                        <div>
                                                            <p className="text-xs font-bold text-gray-900">{a.test?.title}</p>
                                                            <p className="text-[10px] text-gray-400 font-medium">{new Date(a.endTime).toLocaleDateString('en-IN')}</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-sm font-black text-indigo-600">{a.totalScore} <span className="text-gray-300">/ {a.test?.totalMarks}</span></p>
                                                        </div>
                                                    </div>
                                                ))}
                                                {studentAttempts.length === 0 && <p className="text-xs text-gray-400 italic text-center py-4">No attempts recorded yet.</p>}
                                            </div>
                                        </div>
                                    </div>
                                )})()}
                        </div>

                        <div className="pt-6 border-t mt-6 flex gap-3">
                            <button 
                                onClick={() => {
                                    const enrollment = enrollments.find((e: any) => e.id === showStudentProfileModal);
                                    setActiveStudentForPDF(enrollment?.student ? { ...enrollment.student, enrollmentId: enrollment.id } : null);
                                    setTimeout(() => {
                                        handleDownloadPDF('statement-pdf-template', `Statement_${enrollment?.student?.firstName || 'Student'}.pdf`);
                                        setTimeout(() => setActiveStudentForPDF(null), 1000);
                                    }, 200);
                                }}
                                className="flex-1 bg-indigo-600 text-white font-bold py-3 rounded-2xl hover:bg-indigo-700 transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                            >
                                <Receipt className="w-5 h-5" /> Download Statement PDF
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CUSTOM ASSIGNMENT MODAL (OVERRIDE) */}
            {showCustomAssignModal && selectedEnrollmentForFee && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col p-8 animate-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Custom Fee Override</h3>
                                <p className="text-sm text-gray-500">Student: {selectedEnrollmentForFee.student?.firstName} {selectedEnrollmentForFee.student?.lastName}</p>
                            </div>
                            <button onClick={() => setShowCustomAssignModal(false)}><X className="w-5 h-5 text-gray-400" /></button>
                        </div>

                        <div className="overflow-y-auto pr-2 flex-1 space-y-6">
                            <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex gap-3 italic">
                                <span className="text-amber-600">⚠️</span>
                                <p className="text-xs text-amber-700">Assigning a custom fee will wipe out all existing upcoming/unpaid invoices for this student and replace them with these new installments.</p>
                            </div>

                            <div className="space-y-4">
                                {customInstallments.map((inst: any, idx: number) => (
                                    <div key={idx} className="flex gap-3 items-center bg-gray-50 p-3 rounded-xl border border-gray-100">
                                        <div className="flex-1">
                                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Description</label>
                                            <input value={inst.description} onChange={e => {
                                                const newInst = [...customInstallments];
                                                newInst[idx].description = e.target.value;
                                                setCustomInstallments(newInst);
                                            }} className="w-full border-none bg-transparent p-0 text-sm font-bold focus:ring-0" />
                                        </div>
                                        <div className="w-24">
                                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Amount (₹)</label>
                                            <input type="number" value={inst.amount} onChange={e => {
                                                const newInst = [...customInstallments];
                                                newInst[idx].amount = e.target.value;
                                                setCustomInstallments(newInst);
                                            }} className="w-full border-none bg-transparent p-0 text-sm font-black text-indigo-700 focus:ring-0" />
                                        </div>
                                        <div className="w-24">
                                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Offset (Days)</label>
                                            <input type="number" value={inst.relativeDaysFromJoin} onChange={e => {
                                                const newInst = [...customInstallments];
                                                newInst[idx].relativeDaysFromJoin = parseInt(e.target.value) || 0;
                                                setCustomInstallments(newInst);
                                            }} className="w-full border-none bg-transparent p-0 text-sm focus:ring-0" />
                                        </div>
                                        <button onClick={() => setCustomInstallments(customInstallments.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 mt-4"><X className="w-4 h-4" /></button>
                                    </div>
                                ))}
                                <button onClick={() => setCustomInstallments([...customInstallments, { description: `New Installment ${customInstallments.length+1}`, amount: '0', relativeDaysFromJoin: 30 }])} className="w-full border-2 border-dashed border-gray-100 rounded-xl py-3 text-xs font-bold text-gray-400 hover:border-indigo-200 hover:text-indigo-500 transition">+ Add Manual Override</button>
                            </div>
                        </div>

                        <div className="pt-6 border-t mt-6">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase">Total Customized Amount</p>
                                    <p className="text-xl font-black text-gray-900">₹ {customInstallments.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0).toLocaleString('en-IN')}</p>
                                </div>
                                <button 
                                    onClick={async () => {
                                        try {
                                            const total = customInstallments.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
                                            if (total <= 0) return toast.error('Total amount must be greater than 0');
                                            
                                            // Call Server Action
                                            await assignCustomFeeToStudentAction({
                                                enrollmentId: selectedEnrollmentForFee.id,
                                                installments: customInstallments
                                            });
                                            
                                            toast.success('Custom plan assigned successfully!');
                                            setShowCustomAssignModal(false);
                                            fetchData();
                                        } catch (err: any) {
                                            toast.error(err.message || 'Failed to assign custom plan');
                                        }
                                    }}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 py-3 rounded-2xl transition shadow-lg shadow-indigo-200"
                                >
                                    Confirm Override
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* FEE STRUCTURE DRAWER */}
            {showFeeForm && (
                <div className="fixed inset-0 z-50 flex justify-end no-print">
                    <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity" onClick={() => { setShowFeeForm(false); setEditingFee(null); }}></div>
                    <div className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                        <div className="flex justify-between items-center p-6 border-b border-gray-100">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">{editingFee ? 'Edit Fee Structure' : 'Create Fee Structure'}</h2>
                                <p className="text-xs text-gray-500 font-medium">Define smart installments for your students.</p>
                            </div>
                            <button onClick={() => { setShowFeeForm(false); setEditingFee(null); }} className="text-gray-400 hover:text-gray-900 transition"><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleCreateFeeStructure} className="flex flex-col flex-1 overflow-hidden">
                            <div className="p-6 flex-1 overflow-y-auto space-y-6">
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Structure Name</label>
                                        <input required value={feeFormData.name} onChange={e => setFeeFormData({...feeFormData, name: e.target.value})} placeholder="e.g. Standard 12th PCM" className="w-full border border-gray-300 rounded-xl shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-3 outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Total amount (₹)</label>
                                        <input type="number" required value={feeFormData.totalAmount} onChange={e => setFeeFormData({...feeFormData, totalAmount: e.target.value})} placeholder="60000" className="w-full border border-gray-300 rounded-xl shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-3 outline-none font-black text-xl text-emerald-600" />
                                    </div>
                                </div>

                                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 space-y-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <RefreshCw className="w-4 h-4 text-indigo-500" />
                                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Smart Fee Generator</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Installments</label>
                                            <input type="number" value={feeNumInstallments} onChange={e => setFeeNumInstallments(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Interval (Days)</label>
                                            <input type="number" value={feeIntervalDays} onChange={e => setFeeIntervalDays(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => { setFeeNumInstallments('1'); setFeeIntervalDays('0'); }} className="flex-1 bg-white border border-gray-200 py-1.5 rounded-lg text-[10px] font-black hover:bg-gray-50 transition uppercase tracking-tighter">One-time</button>
                                        <button type="button" onClick={() => { setFeeNumInstallments('3'); setFeeIntervalDays('90'); }} className="flex-1 bg-white border border-gray-200 py-1.5 rounded-lg text-[10px] font-black hover:bg-gray-50 transition uppercase tracking-tighter">Quarterly</button>
                                        <button type="button" onClick={() => { setFeeNumInstallments('12'); setFeeIntervalDays('30'); }} className="flex-1 bg-white border border-gray-200 py-1.5 rounded-lg text-[10px] font-black hover:bg-gray-50 transition uppercase tracking-tighter">Monthly</button>
                                    </div>
                                    <button 
                                        type="button" 
                                        onClick={autoGenerateInstallments}
                                        className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl text-xs hover:bg-indigo-700 transition shadow-lg shadow-indigo-100"
                                    >
                                        Auto-Generate Installment Plan
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Installment Breakdown</label>
                                        <button type="button" onClick={() => setFeeFormData({...feeFormData, installments: [...feeFormData.installments, {amount: '', description: `Installment ${feeFormData.installments.length + 1}`, relativeDaysFromJoin: (feeFormData.installments.length * 30)}]})} className="text-xs text-indigo-600 font-bold hover:underline">+ Add Manual Row</button>
                                    </div>
                                    {feeFormData.installments.map((inst, idx) => (
                                        <div key={idx} className="flex gap-3 items-center bg-white p-3 rounded-xl border border-gray-100 shadow-sm animate-in fade-in slide-in-from-left duration-200" style={{ animationDelay: `${idx * 50}ms` }}>
                                            <input value={inst.description} onChange={e => {
                                                const newInst = [...feeFormData.installments];
                                                newInst[idx].description = e.target.value;
                                                setFeeFormData({...feeFormData, installments: newInst});
                                            }} placeholder="Description" className="flex-1 border-none focus:ring-0 text-sm font-medium text-gray-800 p-0 outline-none" />
                                            <div className="flex items-center gap-2 border-l pl-3">
                                                <span className="text-xs font-bold text-gray-400">₹</span>
                                                <input value={inst.amount} onChange={e => {
                                                    const newInst = [...feeFormData.installments];
                                                    newInst[idx].amount = e.target.value;
                                                    setFeeFormData({...feeFormData, installments: newInst});
                                                }} type="number" required placeholder="0" className="w-20 border-none focus:ring-0 text-sm font-bold text-emerald-600 p-0 outline-none" />
                                            </div>
                                            <div className="flex items-center gap-2 border-l pl-3">
                                                <span className="text-[10px] font-bold text-gray-400">D+</span>
                                                <input value={inst.relativeDaysFromJoin} onChange={e => {
                                                    const newInst = [...feeFormData.installments];
                                                    newInst[idx].relativeDaysFromJoin = parseInt(e.target.value) || 0;
                                                    setFeeFormData({...feeFormData, installments: newInst});
                                                }} type="number" required className="w-12 border-none focus:ring-0 text-sm font-bold text-gray-500 p-0 outline-none" />
                                            </div>
                                            {idx > 0 && <button type="button" onClick={() => {
                                                const newInst = feeFormData.installments.filter((_, i) => i !== idx);
                                                setFeeFormData({...feeFormData, installments: newInst});
                                            }} className="text-red-400 hover:text-red-600 p-1"><X className="w-4 h-4" /></button>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-3 justify-end items-center">
                                <div className="flex-1">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase">Calculated Sum</p>
                                    <p className={`text-sm font-black ${Math.abs(feeFormData.installments.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0) - parseFloat(feeFormData.totalAmount)) < 0.01 ? 'text-emerald-600' : 'text-red-500 underline'}`}>
                                        ₹ {feeFormData.installments.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0).toLocaleString('en-IN')} / {parseFloat(feeFormData.totalAmount || "0").toLocaleString('en-IN')}
                                    </p>
                                </div>
                                <button type="button" onClick={() => { setShowFeeForm(false); setEditingFee(null); }} className="px-5 py-2.5 rounded-xl text-gray-700 font-bold hover:bg-gray-200 transition">Cancel</button>
                                <button type="submit" className="px-8 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200">
                                    {editingFee ? 'Update Plan' : 'Generate Plan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* THE OFF-SCREEN PDF TEMPLATE (NUCLEAR FIX FOR PRINT BUGS) */}
            <div style={{ position: 'absolute', left: '-9999px', top: 0, opacity: 0, pointerEvents: 'none', colorScheme: 'light' }}>
                <div id="receipt-pdf-template" className="w-[800px] bg-white p-12 text-black font-sans" style={{ color: '#000000', backgroundColor: '#ffffff' }}>
                    <div className="flex justify-between items-center border-b-4 pb-6 mb-8" style={{ borderBottomColor: '#4f46e5' }}>
                        <img src="/logo.png" className="h-20 object-contain" alt="Logo" />
                        <div className="text-right">
                            <h1 className="text-3xl font-black" style={{ color: '#312e81' }}>Sindhu's Mathswiz Classes</h1>
                            <p className="text-sm font-bold mt-1 uppercase tracking-widest" style={{ color: '#6b7280' }}>Premium Mathematics Coaching</p>
                        </div>
                    </div>

                    <h2 className="text-2xl font-black mb-8 text-center border-b pb-2" style={{ color: '#111827', borderBottomColor: '#e5e7eb' }}>OFFICIAL FEE RECEIPT</h2>

                    <div className="grid grid-cols-2 gap-12 mb-10">
                        <div className="space-y-2">
                            <p className="text-xs font-bold uppercase tracking-tighter" style={{ color: '#9ca3af' }}>Receipt Details</p>
                            <p className="text-sm"><strong>Receipt No:</strong> <span className="font-bold" style={{ color: '#4f46e5' }}>REC-{activePaymentForPDF?.id?.slice(-6).toUpperCase()}</span></p>
                            <p className="text-sm"><strong>Date Paid:</strong> {activePaymentForPDF?.paidAt ? new Date(activePaymentForPDF.paidAt).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN')}</p>
                            <p className="text-sm"><strong>Payment Mode:</strong> <span className="font-bold">{activePaymentForPDF?.paymentMode}</span></p>
                        </div>
                        <div className="space-y-2 text-right">
                            <p className="text-xs font-bold uppercase tracking-tighter" style={{ color: '#9ca3af' }}>Student Details</p>
                            <p className="text-lg font-black" style={{ color: '#111827' }}>{activePaymentForPDF?.enrollment?.student?.firstName} {activePaymentForPDF?.enrollment?.student?.lastName}</p>
                            <p className="text-sm font-medium" style={{ color: '#6b7280' }}>{activePaymentForPDF?.enrollment?.batch?.name}</p>
                        </div>
                    </div>

                    <table className="w-full text-left border-collapse mb-12">
                        <thead>
                            <tr className="border-t-2 border-b-2" style={{ backgroundColor: '#f3f4f6', borderColor: '#e5e7eb' }}>
                                <th className="p-4 font-black uppercase text-xs">Description</th>
                                <th className="p-4 font-black uppercase text-xs text-right">Amount Received</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr style={{ borderBottomColor: '#f3f4f6' }} className="border-b">
                                <td className="p-4 text-sm font-bold" style={{ color: '#1f2937' }}>{activePaymentForPDF?.description}</td>
                                <td className="p-4 text-xl font-black text-right" style={{ color: '#4338ca' }}>₹ {activePaymentForPDF?.amount?.toLocaleString('en-IN')}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div className="flex justify-between items-end mt-20 pt-10 border-t border-dashed" style={{ borderTopColor: '#e5e7eb' }}>
                        <div className="text-[10px] font-medium" style={{ color: '#9ca3af' }}>
                            <p>This is a computer-generated receipt.</p>
                            <p>© {new Date().getFullYear()} Sindhu's Mathswiz Classes. All rights reserved.</p>
                        </div>
                        <div className="text-right">
                            <div className="w-40 h-16 border-b-2 mb-2" style={{ borderBottomColor: '#e5e7eb' }}></div>
                            <p className="text-xs font-black uppercase" style={{ color: '#111827' }}>Authorized Signatory</p>
                        </div>
                    </div>
                </div>

                {/* CONSOLIDATED STATEMENT TEMPLATE */}
                <div id="statement-pdf-template" className="w-[800px] bg-white p-12 text-black font-sans" style={{ color: '#000000', backgroundColor: '#ffffff' }}>
                    <div className="flex justify-between items-center border-b-4 pb-6 mb-8" style={{ borderBottomColor: '#4f46e5' }}>
                        <img src="/logo.png" className="h-20 object-contain" alt="Logo" />
                        <div className="text-right">
                            <h1 className="text-3xl font-black" style={{ color: '#312e81' }}>Sindhu's Mathswiz Classes</h1>
                            <p className="text-sm font-bold mt-1 uppercase tracking-widest" style={{ color: '#6b7280' }}>Financial Statement</p>
                        </div>
                    </div>

                    <div className="flex justify-between items-end mb-10">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-tighter mb-1" style={{ color: '#9ca3af' }}>Student</p>
                            <h2 className="text-2xl font-black" style={{ color: '#111827' }}>{activeStudentForPDF?.firstName} {activeStudentForPDF?.lastName}</h2>
                            <p className="text-sm font-medium" style={{ color: '#6b7280' }}>{batch.name}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs font-bold uppercase tracking-tighter mb-1" style={{ color: '#9ca3af' }}>Generated On</p>
                            <p className="text-sm font-bold" style={{ color: '#111827' }}>{new Date().toLocaleDateString('en-IN')}</p>
                        </div>
                    </div>

                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-t-2 border-b-2" style={{ backgroundColor: '#f3f4f6', borderColor: '#e5e7eb' }}>
                                <th className="p-4 font-black uppercase text-[10px]">Description</th>
                                <th className="p-4 font-black uppercase text-[10px]">Due Date</th>
                                <th className="p-4 font-black uppercase text-[10px]">Status</th>
                                <th className="p-4 font-black uppercase text-[10px] text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y" style={{ borderTopColor: '#f3f4f6' }}>
                            {paymentLedger.filter(p => p.enrollmentId === activeStudentForPDF?.enrollmentId).map((p: any) => (
                                <tr key={p.id}>
                                    <td className="p-4 text-xs font-bold" style={{ color: '#1f2937' }}>
                                        {p.description}
                                        {p.status === 'PAID' && <div className="text-[8px] mt-0.5" style={{ color: '#6366f1' }}>REC-{p.id.slice(-6).toUpperCase()} via {p.paymentMode}</div>}
                                    </td>
                                    <td className="p-4 text-xs font-medium" style={{ color: '#6b7280' }}>
                                        {p.status === 'PAID' ? `Paid: ${new Date(p.paidAt).toLocaleDateString('en-IN')}` : `Due: ${new Date(p.dueDate).toLocaleDateString('en-IN')}`}
                                    </td>
                                    <td className="p-4">
                                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full`} style={{ backgroundColor: p.status === 'PAID' ? '#d1fae5' : '#fee2e2', color: p.status === 'PAID' ? '#047857' : '#b91c1c' }}>
                                            {p.status}
                                        </span>
                                    </td>
                                    <td className="p-4 text-sm font-black text-right" style={{ color: '#111827' }}>₹ {p.amount?.toLocaleString('en-IN')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="mt-12 pt-6 border-t flex justify-between items-start" style={{ borderTopColor: '#e5e7eb' }}>
                        <div className="grid grid-cols-2 gap-8 w-full max-w-sm">
                            <div className="p-4 rounded-2xl border" style={{ backgroundColor: '#ecfdf5', borderColor: '#d1fae5' }}>
                                <p className="text-[10px] font-bold uppercase mb-1" style={{ color: '#059669' }}>Total Paid</p>
                                <p className="text-xl font-black" style={{ color: '#064e3b' }}>₹ {paymentLedger.filter(p => p.enrollmentId === activeStudentForPDF?.enrollmentId && p.status === 'PAID').reduce((acc, curr) => acc + curr.amount, 0).toLocaleString('en-IN')}</p>
                            </div>
                            <div className="p-4 rounded-2xl border" style={{ backgroundColor: '#fef2f2', borderColor: '#fee2e2' }}>
                                <p className="text-[10px] font-bold uppercase mb-1" style={{ color: '#dc2626' }}>Balance</p>
                                <p className="text-xl font-black" style={{ color: '#7f1d1d' }}>₹ {paymentLedger.filter(p => p.enrollmentId === activeStudentForPDF?.enrollmentId && p.status !== 'PAID').reduce((acc, curr) => acc + curr.amount, 0).toLocaleString('en-IN')}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
