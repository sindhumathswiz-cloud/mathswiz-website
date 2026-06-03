'use client';

import React, { useState } from 'react';
import { 
    Search, 
    Filter, 
    Download, 
    CheckCircle2, 
    Clock, 
    AlertCircle, 
    MoreHorizontal, 
    FileText, 
    Printer,
    DollarSign,
    User,
    ArrowUpRight,
    Calendar
} from 'lucide-react';
import toast from 'react-hot-toast';
// Dynamic import for html2pdf.js to avoid SSR 'self is not defined' error
// @ts-ignore
const html2pdfPromise = typeof window !== 'undefined' ? import('html2pdf.js') : null;

interface FeeManagementProps {
    payments: any[];
}

export const FeeManagement = ({ payments: initialPayments }: FeeManagementProps) => {
    const [payments, setPayments] = useState(initialPayments || []);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('ALL');

    const handleMarkPaid = async (paymentId: string) => {
        try {
            const res = await fetch(`/api/admin/payments/${paymentId}/mark-paid`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paidAt: new Date() })
            });
            if (res.ok) {
                const updatedPayment = await res.json();
                setPayments(payments.map(p => p.id === paymentId ? updatedPayment : p));
                toast.success("Payment marked as PAID");
                generateReceipt(updatedPayment);
            }
        } catch (error) {
            toast.error("Failed to update payment status");
        }
    };

    const generateReceipt = async (payment: any) => {
        const studentName = `${payment.enrollment?.student?.firstName || 'Student'} ${payment.enrollment?.student?.lastName || ''}`;
        const element = document.createElement('div');
        element.innerHTML = `
            <div style="padding: 40px; font-family: 'Inter', sans-serif; color: #1e293b; max-width: 800px; margin: auto; border: 1px solid #e2e8f0; border-radius: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 40px; border-bottom: 2px solid #4f46e5; padding-bottom: 20px;">
                    <div>
                        <h1 style="margin: 0; color: #4f46e5; font-size: 28px; font-weight: 900;">SINDHU'S MATHSWIZ</h1>
                        <p style="margin: 4px 0 0 0; font-size: 12px; font-weight: 700; color: #64748b; letter-spacing: 1px; text-transform: uppercase;">Official Fee Receipt</p>
                    </div>
                    <div style="text-align: right;">
                        <p style="margin: 0; font-size: 12px; font-weight: 800; color: #94a3b8;">RECEIPT NO</p>
                        <p style="margin: 2px 0 0 0; font-size: 16px; font-weight: 900; color: #1e291b;">#${payment.id.slice(-8).toUpperCase()}</p>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px;">
                    <div>
                        <p style="margin: 0; font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">Billed To</p>
                        <p style="margin: 8px 0 0 0; font-size: 18px; font-weight: 800; color: #0f172a;">${studentName}</p>
                        <p style="margin: 4px 0 0 0; font-size: 12px; font-weight: 500; color: #64748b;">${payment.enrollment?.batch?.name || 'Standard Batch'}</p>
                    </div>
                    <div style="text-align: right;">
                        <p style="margin: 0; font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">Payment Date</p>
                        <p style="margin: 8px 0 0 0; font-size: 14px; font-weight: 800; color: #0f172a;">${new Date(payment.paidAt || Date.now()).toLocaleDateString('en-IN', { dateStyle: 'long' })}</p>
                    </div>
                </div>

                <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px;">
                    <thead>
                        <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                            <th style="padding: 16px; text-align: left; font-size: 10px; font-weight: 900; color: #64748b; text-transform: uppercase;">Description</th>
                            <th style="padding: 16px; text-align: right; font-size: 10px; font-weight: 900; color: #64748b; text-transform: uppercase;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 16px; font-size: 14px; font-weight: 600; color: #334155;">${payment.description || 'Course Tuition Fee'}</td>
                            <td style="padding: 16px; text-align: right; font-size: 14px; font-weight: 800; color: #0f172a;">₹${payment.amount.toLocaleString()}</td>
                        </tr>
                    </tbody>
                </table>

                <div style="background: #f4f4f5; border-radius: 12px; padding: 24px; display: flex; justify-content: space-between; align-items: center;">
                    <p style="margin: 0; font-size: 14px; font-weight: 900; color: #71717a; text-transform: uppercase;">Total Received</p>
                    <p style="margin: 0; font-size: 24px; font-weight: 900; color: #1e293b;">₹${payment.amount.toLocaleString()}</p>
                </div>

                <div style="margin-top: 60px; text-align: center; border-top: 1px dashed #e2e8f0; pt-20">
                    <p style="margin: 0; font-size: 10px; color: #94a3b8; font-weight: 500;">This is a computer-generated receipt and does not require a physical signature.</p>
                </div>
            </div>
        `;

        const opt = {
            margin: 10,
            filename: `Receipt_${payment.id.slice(-8)}.pdf`,
            image: { type: 'jpeg' as const, quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, windowWidth: 800 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
        };

        if (!html2pdfPromise) return;
        const html2pdf = (await html2pdfPromise).default;

        html2pdf().from(element).set(opt).save().then(() => {
            toast.success("Receipt downloaded!");
        });
    };

    const filteredPayments = payments.filter((p: any) => {
        const matchesSearch = p.enrollment?.student?.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             p.enrollment?.student?.mobileNumber?.includes(searchQuery);
        const matchesStatus = filterStatus === 'ALL' || p.status === filterStatus;
        return matchesSearch && matchesStatus;
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Fee Management Ledger</h2>
                    <p className="text-gray-500 font-medium text-sm">Monitor student financial vectors and generate verified tax receipts.</p>
                </div>
            </div>

            {/* Fee Management Summary Tiles */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                    { label: 'Total Paid (Realized)', value: payments.filter(p => p.status === 'PAID').reduce((sum, p) => sum + p.amount, 0), icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
                    { label: 'Total Unpaid (Upcoming)', value: payments.filter(p => p.status === 'UPCOMING').reduce((sum, p) => sum + p.amount, 0), icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
                    { label: 'Overdue Amount', value: payments.filter(p => p.status === 'UNPAID').reduce((sum, p) => sum + p.amount, 0), icon: AlertCircle, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100' },
                ].map((m, i) => (
                    <div key={i} className={`bg-white p-5 rounded-2xl border ${m.border} shadow-sm flex items-center gap-4`}>
                        <div className={`p-3 ${m.bg} ${m.color} rounded-xl shrink-0`}>
                            <m.icon className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-xs font-black text-gray-500 uppercase tracking-widest">{m.label}</p>
                            <p className="text-3xl font-black text-gray-900 leading-none mt-1">₹{m.value.toLocaleString('en-IN')}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Search by student name or mobile..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-xs"
                        />
                    </div>
                    <div className="flex gap-2">
                        {filterStatus !== 'ALL' && (
                            <button 
                                onClick={() => setFilterStatus('ALL')}
                                className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-gray-100 text-gray-500 hover:bg-gray-200 transition-all font-bold"
                            >
                                Clear
                            </button>
                        )}
                        {['ALL', 'PAID', 'UPCOMING', 'UNPAID'].map(status => (
                            <button 
                                key={status}
                                onClick={() => setFilterStatus(status)}
                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                    filterStatus === status 
                                    ? 'bg-gray-900 text-white shadow-md' 
                                    : 'bg-white text-gray-500 border border-gray-100 hover:bg-gray-50'
                                }`}
                            >
                                {status === 'UNPAID' ? 'Overdue' : status}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Student & Batch</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Amount</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Due Date</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredPayments.map((p: any) => (
                                <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-black">
                                                {p.enrollment?.student?.firstName?.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-gray-900">{p.enrollment?.student?.firstName} {p.enrollment?.student?.lastName}</p>
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">{p.enrollment?.batch?.name}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5 text-right">
                                        <p className="text-sm font-black text-gray-900">₹{p.amount.toLocaleString()}</p>
                                        <p className="text-[10px] text-gray-400 font-bold">{p.description}</p>
                                    </td>
                                    <td className="px-6 py-5">
                                        <div className="flex items-center gap-1 text-xs font-bold text-gray-600" suppressHydrationWarning>
                                            <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                            {new Date(p.dueDate).toLocaleDateString()}
                                        </div>
                                    </td>
                                    <td className="px-6 py-5">
                                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border uppercase tracking-widest ${
                                            p.status === 'PAID' ? 'bg-emerald-50 border-emerald-100 text-emerald-600 shadow-emerald-50' :
                                            p.status === 'UNPAID' ? 'bg-rose-50 border-rose-100 text-rose-600 animate-pulse' :
                                            'bg-amber-50 border-amber-100 text-amber-600'
                                        }`}>
                                            {p.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-5 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            {p.status !== 'PAID' && (
                                                <button 
                                                    onClick={() => handleMarkPaid(p.id)}
                                                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-[10px] font-black hover:bg-indigo-700 transition shadow-lg shadow-indigo-100"
                                                >
                                                    <CheckCircle2 className="w-3.5 h-3.5" /> MARK PAID
                                                </button>
                                            )}
                                            {p.status === 'PAID' && (
                                                <button 
                                                    onClick={() => generateReceipt(p)}
                                                    className="p-2 text-indigo-600 hover:bg-white rounded-xl transition shadow-sm border border-transparent hover:border-indigo-100"
                                                    title="Download Receipt"
                                                >
                                                    <Printer className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
