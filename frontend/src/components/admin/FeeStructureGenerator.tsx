'use client';

import React, { useState } from 'react';
import { 
    Plus, 
    Trash2, 
    DollarSign, 
    Calendar, 
    Save, 
    Calculator,
    ChevronRight,
    Info,
    CheckCircle2
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Installment {
    amount: number;
    description: string;
    dueOffsetDays: number;
}

export const FeeStructureGenerator = () => {
    const [name, setName] = useState('');
    const [totalAmount, setTotalAmount] = useState<number>(0);
    const [installments, setInstallments] = useState<Installment[]>([
        { amount: 0, description: 'First Installment (Admission)', dueOffsetDays: 0 }
    ]);

    const addInstallment = () => {
        setInstallments([...installments, { amount: 0, description: `Installment ${installments.length + 1}`, dueOffsetDays: 30 * installments.length }]);
    };

    const removeInstallment = (index: number) => {
        setInstallments(installments.filter((_, i) => i !== index));
    };

    const updateInstallment = (index: number, field: keyof Installment, value: any) => {
        const newInstallments = [...installments];
        newInstallments[index] = { ...newInstallments[index], [field]: value };
        setInstallments(newInstallments);
        
        // Update total if amounts changed
        if (field === 'amount') {
            const newTotal = newInstallments.reduce((sum, inst) => sum + Number(inst.amount), 0);
            setTotalAmount(newTotal);
        }
    };

    const handleSave = async () => {
        if (!name) return toast.error("Please enter a name for this fee structure");
        if (totalAmount <= 0) return toast.error("Total amount must be greater than zero");
        
        const sum = installments.reduce((acc, curr) => acc + Number(curr.amount), 0);
        if (Math.abs(sum - totalAmount) > 0.01) {
            return toast.error(`Installment sum (₹${sum}) does not match Total Amount (₹${totalAmount})`);
        }

        try {
            const res = await fetch('/api/admin/fee-structures', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, totalAmount, installments })
            });
            if (res.ok) {
                toast.success("Fee Structure saved successfully!");
                setName('');
                setTotalAmount(0);
                setInstallments([{ amount: 0, description: 'First Installment (Admission)', dueOffsetDays: 0 }]);
            }
        } catch (error) {
            toast.error("Failed to save fee structure");
        }
    };

    return (
        <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-gray-50 bg-gray-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h3 className="text-xl font-black text-gray-900 tracking-tight">Smart Fee Architect</h3>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Design Custom Installment Blueprints</p>
                </div>
                <div className="flex bg-white rounded-2xl p-2 border border-gray-200 items-center gap-4">
                    <div className="pl-4">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Valuation</p>
                        <p className="text-lg font-black text-indigo-600">₹{totalAmount.toLocaleString()}</p>
                    </div>
                    <button 
                        onClick={handleSave}
                        className="bg-gray-900 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-600 transition shadow-lg shadow-gray-200"
                    >
                        <Save className="w-4 h-4" /> Deploy Blueprint
                    </button>
                </div>
            </div>

            <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-12">
                {/* Configuration */}
                <div className="space-y-8">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Blueprint Name</label>
                        <input 
                            type="text" 
                            placeholder="e.g. JEE Intensive 2026 - Standard Plan"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold transition text-gray-900 shadow-inner"
                        />
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between mb-4">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Installment Sequence</label>
                            <button 
                                onClick={addInstallment}
                                className="text-[10px] font-extrabold text-indigo-600 flex items-center gap-1 hover:underline"
                            >
                                <Plus className="w-3 h-3" /> Append Slab
                            </button>
                        </div>

                        <div className="space-y-4">
                            {installments.map((inst, idx) => (
                                <div key={idx} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col gap-4 relative group">
                                    <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-white border-2 border-indigo-600 rounded-full flex items-center justify-center text-[10px] font-black text-indigo-600 z-10 shadow-sm">
                                        {idx + 1}
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div className="md:col-span-2">
                                            <input 
                                                type="text" 
                                                placeholder="Slab Name (e.g. Registration)"
                                                value={inst.description}
                                                onChange={(e) => updateInstallment(idx, 'description', e.target.value)}
                                                className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-xs"
                                            />
                                        </div>
                                        <div>
                                            <input 
                                                type="number" 
                                                placeholder="Amount"
                                                value={inst.amount || ''}
                                                onChange={(e) => updateInstallment(idx, 'amount', Number(e.target.value))}
                                                className="w-full px-4 py-2 bg-indigo-50/30 border border-indigo-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-black text-indigo-700 text-xs"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="number" 
                                                placeholder="Days"
                                                value={inst.dueOffsetDays}
                                                onChange={(e) => updateInstallment(idx, 'dueOffsetDays', Number(e.target.value))}
                                                className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-xs"
                                            />
                                            <button 
                                                onClick={() => removeInstallment(idx)}
                                                disabled={installments.length === 1}
                                                className="p-2 text-rose-300 hover:text-rose-600 transition disabled:opacity-0"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Preview / Intelligence */}
                <div className="bg-indigo-900 rounded-[32px] p-10 text-white relative overflow-hidden shadow-2xl shadow-indigo-100">
                    <div className="relative z-10 h-full flex flex-col">
                        <div className="flex items-center gap-2 text-indigo-300 mb-8">
                            <Calculator className="w-5 h-5" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Projection Vectors</span>
                        </div>

                        <div className="flex-1 space-y-12">
                            <div>
                                <h4 className="text-4xl font-black mb-2 leading-tight">Financial Timeline Projection</h4>
                                <p className="text-indigo-200/70 text-sm font-medium">Automatic due-date triggering model for {name || 'New Blueprint'}.</p>
                            </div>

                            <div className="space-y-6 relative ml-4">
                                <div className="absolute left-0 top-0 bottom-0 w-px bg-white/10 ml-2"></div>
                                {installments.map((inst, idx) => (
                                    <div key={idx} className="flex gap-6 relative">
                                        <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0 z-10 border-4 border-indigo-900 mt-1"></div>
                                        <div className="space-y-1">
                                            <p className="text-sm font-black flex items-center gap-2">
                                                {inst.description || `Slab ${idx + 1}`}
                                                <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full text-indigo-300 font-black">+{inst.dueOffsetDays}d</span>
                                            </p>
                                            <p className="text-2xl font-black text-emerald-400">₹{Number(inst.amount).toLocaleString()}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="mt-12 pt-8 border-t border-white/10 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center">
                                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-indigo-300 uppercase">Status</p>
                                    <p className="text-sm font-bold">Verified Blueprint</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">Yield Velocity</p>
                                <p className="text-xl font-black">HIGH</p>
                            </div>
                        </div>
                    </div>
                    
                    {/* Abstract Shapes */}
                    <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-indigo-500 rounded-full blur-[120px] opacity-20"></div>
                    <div className="absolute -top-20 -left-20 w-64 h-64 bg-purple-500 rounded-full blur-[100px] opacity-10"></div>
                </div>
            </div>
        </div>
    );
};
