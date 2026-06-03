'use client';

import React, { useState } from 'react';
import { 
    Search, 
    Filter, 
    Plus, 
    MoreHorizontal, 
    Mail, 
    Phone, 
    Calendar, 
    UserPlus, 
    MessageSquare,
    CheckCircle2,
    Clock,
    XCircle,
    ChevronRight,
    ArrowUpRight
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Lead {
    id: string;
    name: string;
    email?: string;
    phone: string;
    source?: string;
    courseInterest?: string;
    status: string;
    notes?: string;
    createdAt: string;
}

interface LeadCRMProps {
    leads: Lead[];
    teacherId?: string;
}

export const LeadCRM = ({ leads: initialLeads, teacherId }: LeadCRMProps) => {
    const [leads, setLeads] = useState(initialLeads);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('ALL');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newLead, setNewLead] = useState({ name: '', email: '', phone: '', source: 'Website', courseInterest: '', notes: '', teacherId: teacherId || '' });

    const handleUpdateStatus = async (id: string, newStatus: string, newNotes?: string) => {
        try {
            const body: any = { id };
            if (newStatus) body.status = newStatus;
            if (newNotes !== undefined) body.notes = newNotes;

            const res = await fetch(`/api/admin/leads`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                setLeads(leads.map(l => l.id === id ? { ...l, status: newStatus, notes: newNotes ?? l.notes } : l));
                toast.success(newNotes !== undefined ? 'Notes updated' : `Status updated to ${newStatus}`);
            }
        } catch (error) {
            toast.error('Failed to update lead');
        }
    };

    const handleAddLead = async (e: React.FormEvent) => {
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
                setIsAddModalOpen(false);
                setNewLead({ name: '', email: '', phone: '', source: 'Website', courseInterest: '', notes: '', teacherId: teacherId || '' });
                toast.success('Lead added successfully!');
            }
        } catch (error) {
            toast.error('Failed to add lead');
        }
    };

    const filteredLeads = leads.filter(l => {
        const matchesSearch = l.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             l.phone.includes(searchQuery) ||
                             l.email?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = filterStatus === 'ALL' || l.status.toUpperCase() === filterStatus;
        return matchesSearch && matchesStatus;
    });

    const getStatusColor = (status: string) => {
        switch (status.toUpperCase()) {
            case 'NEW': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'CONTACTED': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'CONVERTED': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'LOST': return 'bg-rose-100 text-rose-700 border-rose-200';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    return (
        <div className="space-y-6">
            {/* Header & Stats */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Lead CRM</h2>
                    <p className="text-gray-500 font-medium text-sm">Nurture and track prospective students through the enrollment funnel.</p>
                </div>
                <button 
                    onClick={() => setIsAddModalOpen(true)}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold transition shadow-lg shadow-indigo-100"
                >
                    <UserPlus className="w-4 h-4" /> Add New Lead
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Total Leads', count: leads.length, icon: UserPlus, color: 'text-indigo-600', bg: 'bg-indigo-50', status: 'ALL' },
                    { label: 'In Pipeline', count: leads.filter(l => ['NEW', 'CONTACTED'].includes(l.status.toUpperCase())).length, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', status: 'CONTACTED' },
                    { label: 'Converted', count: leads.filter(l => l.status.toUpperCase() === 'CONVERTED').length, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', status: 'CONVERTED' },
                    { label: 'Success Rate', count: leads.length ? `${Math.round((leads.filter(l => l.status.toUpperCase() === 'CONVERTED').length / leads.length) * 100)}%` : '0%', icon: ArrowUpRight, color: 'text-blue-600', bg: 'bg-blue-50', status: 'CONVERTED' },
                ].map((stat, i) => (
                    <button 
                        key={i} 
                        onClick={() => setFilterStatus(stat.status)}
                        className={`bg-white p-4 rounded-2xl border transition-all text-left flex items-center gap-4 hover:shadow-md hover:scale-[1.02] active:scale-100 ${filterStatus === stat.status ? 'border-indigo-600 ring-2 ring-indigo-50' : 'border-gray-100'}`}
                    >
                        <div className={`p-3 ${stat.bg} ${stat.color} rounded-xl`}>
                            <stat.icon className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{stat.label}</p>
                            <p className="text-xl font-black text-gray-900">{stat.count}</p>
                        </div>
                    </button>
                ))}
            </div>

            {/* Filters & Search */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Search leads..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm transition"
                        />
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                        {filterStatus !== 'ALL' && (
                            <button 
                                onClick={() => setFilterStatus('ALL')}
                                className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-gray-100 text-gray-500 hover:bg-gray-200 transition-all shrink-0"
                            >
                                Clear
                            </button>
                        )}
                        {['NEW', 'CONTACTED', 'CONVERTED', 'LOST'].map(status => (
                            <button 
                                key={status}
                                onClick={() => setFilterStatus(status)}
                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 ${
                                    filterStatus === status 
                                    ? 'bg-indigo-900 text-white shadow-md' 
                                    : 'bg-white text-gray-500 border border-gray-100 hover:bg-gray-50'
                                }`}
                            >
                                {status}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50">
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Lead Details</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Source</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Notes</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Created At</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredLeads.map((lead) => (
                                <tr key={lead.id} className="hover:bg-gray-50/50 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-indigo-600 font-bold">
                                                {lead.name.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-gray-900">{lead.name}</div>
                                                <div className="flex items-center gap-3 mt-0.5">
                                                    <div className="flex items-center gap-1 text-[10px] text-gray-500">
                                                        <Phone className="w-3 h-3" /> {lead.phone}
                                                    </div>
                                                    {lead.email && (
                                                        <div className="flex items-center gap-1 text-[10px] text-gray-500">
                                                            <Mail className="w-3 h-3" /> {lead.email}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded-lg">{lead.source || 'Direct'}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="relative inline-block text-left group/status">
                                            <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${getStatusColor(lead.status)} uppercase tracking-tighter`}>
                                                {lead.status}
                                            </span>
                                            <div className="absolute left-0 bottom-full mb-2 hidden group-hover/status:block z-20">
                                                <div className="bg-white border border-gray-100 rounded-xl shadow-xl py-2 w-40 overflow-hidden">
                                                    {['NEW', 'CONTACTED', 'CONVERTED', 'LOST'].map(s => (
                                                        <button 
                                                            key={s}
                                                            onClick={() => handleUpdateStatus(lead.id, s)}
                                                            className={`block w-full text-left px-4 py-2 text-xs font-bold hover:bg-gray-50 ${lead.status.toUpperCase() === s ? 'text-indigo-600' : 'text-gray-600'}`}
                                                        >
                                                            Mark as {s}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="max-w-[200px]">
                                            <input 
                                                type="text"
                                                defaultValue={lead.notes || ''}
                                                onBlur={(e) => {
                                                    if (e.target.value !== lead.notes) {
                                                        handleUpdateStatus(lead.id, lead.status, e.target.value);
                                                    }
                                                }}
                                                placeholder="Add note..."
                                                className="w-full bg-transparent border-none text-[10px] font-medium text-gray-500 focus:ring-0 placeholder:italic p-0"
                                            />
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium" suppressHydrationWarning>
                                            <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                            {new Date(lead.createdAt).toLocaleDateString()}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <button className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-all shadow-sm border border-transparent hover:border-indigo-50">
                                                <MessageSquare className="w-4 h-4" />
                                            </button>
                                            <button className="p-2 text-gray-400 hover:text-rose-600 hover:bg-white rounded-lg transition-all shadow-sm border border-transparent hover:border-rose-50">
                                                <MoreHorizontal className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal: Add Lead */}
            {isAddModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-gray-100 animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900 tracking-tight">Add New Live Lead</h3>
                            <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-900 transition"><XCircle className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleAddLead} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Full Name</label>
                                <input required type="text" value={newLead.name} onChange={e => setNewLead({ ...newLead, name: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold transition" placeholder="e.g. Rahul Sharma" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Phone</label>
                                    <input required type="text" value={newLead.phone} onChange={e => setNewLead({ ...newLead, phone: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold transition" placeholder="WhatsApp No" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Source</label>
                                    <select value={newLead.source} onChange={e => setNewLead({ ...newLead, source: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold transition">
                                        <option>Website</option>
                                        <option>Instagram</option>
                                        <option>Referral</option>
                                        <option>Walk-in</option>
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Email Address</label>
                                <input type="email" value={newLead.email} onChange={e => setNewLead({ ...newLead, email: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold transition" placeholder="optional@email.com" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Course/Batch Interest</label>
                                <input type="text" value={newLead.courseInterest} onChange={e => setNewLead({ ...newLead, courseInterest: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold transition" placeholder="e.g. NDA 2026" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Initial Notes</label>
                                <textarea rows={2} value={newLead.notes} onChange={e => setNewLead({ ...newLead, notes: e.target.value })} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold transition" placeholder="Add any specific interest or context..." />
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-6 py-2.5 text-sm text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition">Cancel</button>
                                <button type="submit" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-xl shadow-indigo-100 transition">Create Lead</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
