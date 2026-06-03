'use client';

import React, { useState } from 'react';
import { LayoutDashboard, Activity, Clock, Eye, Filter, Download, Plus, Trash2, X, Loader2 } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';

interface UserDirectoryTableProps {
    users: any[];
    searchQuery: string;
    onSearchChange: (value: string) => void;
    onUserAdded?: () => void;
    onUserDeleted?: () => void;
}

const StatusBadge = ({ status }: { status: string }) => {
    const styles: any = {
        'APPROVED': 'bg-emerald-100 text-emerald-700 border-emerald-200',
        'PENDING': 'bg-amber-100 text-amber-700 border-amber-200',
        'BLOCKED': 'bg-red-100 text-red-700 border-red-200',
        'STUDENT': 'bg-blue-100 text-blue-700 border-blue-200',
        'TEACHER': 'bg-purple-100 text-purple-700 border-purple-200',
        'ADMIN': 'bg-indigo-100 text-indigo-700 border-indigo-200',
        'REJECTED': 'bg-gray-100 text-gray-700 border-gray-200',
    };
    return (
        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${styles[status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
            {status}
        </span>
    );
};

function AddUserModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        role: 'STUDENT',
        accountStatus: 'APPROVED',
        class: '',
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (data.success) {
                toast.success('User created successfully!');
                onSuccess();
                onClose();
            } else {
                toast.error(data.error || 'Failed to create user');
            }
        } catch (err: any) {
            toast.error('Failed to create user: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
                <div className="px-6 py-4 border-b flex items-center justify-between">
                    <h3 className="text-lg font-bold">Add New User</h3>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">First Name *</label>
                            <input
                                required
                                value={form.firstName}
                                onChange={e => setForm(prev => ({ ...prev, firstName: e.target.value }))}
                                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Last Name *</label>
                            <input
                                required
                                value={form.lastName}
                                onChange={e => setForm(prev => ({ ...prev, lastName: e.target.value }))}
                                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email *</label>
                        <input
                            type="email"
                            required
                            value={form.email}
                            onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                            className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone</label>
                        <input
                            value={form.phone}
                            onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))}
                            className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Role *</label>
                            <select
                                value={form.role}
                                onChange={e => setForm(prev => ({ ...prev, role: e.target.value }))}
                                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="STUDENT">Student</option>
                                <option value="TEACHER">Teacher</option>
                                <option value="PARENT">Parent</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Status *</label>
                            <select
                                value={form.accountStatus}
                                onChange={e => setForm(prev => ({ ...prev, accountStatus: e.target.value }))}
                                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="APPROVED">Approved</option>
                                <option value="PENDING">Pending</option>
                                <option value="BLOCKED">Blocked</option>
                            </select>
                        </div>
                    </div>
                    {form.role === 'STUDENT' && (
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Class</label>
                            <input
                                value={form.class}
                                onChange={e => setForm(prev => ({ ...prev, class: e.target.value }))}
                                placeholder="e.g., Class 12"
                                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    )}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            Create User
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export function UserDirectoryTable({ users, searchQuery, onSearchChange, onUserAdded, onUserDeleted }: UserDirectoryTableProps) {
    const [filterRole, setFilterRole] = React.useState('ALL');
    const [showAddModal, setShowAddModal] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const filteredUsers = users.filter((user: any) => {
        const matchesSearch = user.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             user.lastName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             user.mobileNumber?.includes(searchQuery);
        const matchesRole = filterRole === 'ALL' || user.role === filterRole;
        return matchesSearch && matchesRole;
    });

    const handleDelete = async (userId: string, userName: string) => {
        if (!confirm(`Are you sure you want to delete ${userName}? This action cannot be undone.`)) return;
        setDeletingId(userId);
        try {
            const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                toast.success('User deleted successfully');
                onUserDeleted?.();
            } else {
                toast.error(data.error || 'Failed to delete user');
            }
        } catch (err: any) {
            toast.error('Delete failed: ' + err.message);
        } finally {
            setDeletingId(null);
        }
    };

    const stats = {
        total: users.length,
        students: users.filter(u => u.role === 'STUDENT').length,
        teachers: users.filter(u => u.role === 'TEACHER').length,
        admins: users.filter(u => u.role === 'ADMIN').length
    };

    return (
        <div className="space-y-6">
            {/* Quick Filter Tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total Users', count: stats.total, role: 'ALL', color: 'text-indigo-600', bg: 'bg-indigo-50' },
                    { label: 'Students', count: stats.students, role: 'STUDENT', color: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: 'Teachers', count: stats.teachers, role: 'TEACHER', color: 'text-purple-600', bg: 'bg-purple-50' },
                    { label: 'Admins', count: stats.admins, role: 'ADMIN', color: 'text-rose-600', bg: 'bg-rose-50' },
                ].map((stat) => (
                    <button 
                        key={stat.role}
                        onClick={() => setFilterRole(stat.role)}
                        className={`p-4 rounded-2xl border transition-all text-left flex flex-col gap-1 hover:shadow-md hover:scale-[1.02] active:scale-100 bg-white ${filterRole === stat.role ? 'border-indigo-600 ring-2 ring-indigo-50' : 'border-gray-100'}`}
                    >
                        <p className={`text-[10px] font-black uppercase tracking-widest ${stat.color}`}>{stat.label}</p>
                        <p className="text-2xl font-black text-gray-900 leading-none">{stat.count}</p>
                    </button>
                ))}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-bold text-gray-900">User Directory</h2>
                            {filterRole !== 'ALL' && (
                                <button 
                                    onClick={() => setFilterRole('ALL')}
                                    className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px] font-bold uppercase tracking-widest hover:bg-gray-200"
                                >
                                    Clear Filter: {filterRole}
                                </button>
                            )}
                        </div>
                        <p className="text-sm text-gray-500 font-medium">Manage students, teachers, and account verified status.</p>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setShowAddModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg transition-colors"
                        >
                            <Plus className="w-4 h-4" /> Add User
                        </button>
                        <button className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600">
                            <Filter className="w-4 h-4" />
                        </button>
                        <button className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600">
                            <Download className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50/50 text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-100">
                            <th className="px-6 py-4">User Details</th>
                            <th className="px-6 py-4">Status & Role</th>
                            <th className="px-6 py-4">Engagement</th>
                            <th className="px-6 py-4">Activity</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredUsers.map((user: any) => (
                            <tr key={user.id} className="hover:bg-indigo-50/30 transition-colors group">
                                <td className="px-6 py-5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold uppercase ring-2 ring-white">
                                            {user.firstName?.[0]}{user.lastName?.[0]}
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-gray-900 group-hover:text-indigo-700 transition-colors">{user.firstName} {user.lastName}</div>
                                            <div className="text-xs text-gray-400 font-medium">{user.email || 'No Email'}</div>
                                            <div className="text-[10px] text-gray-400 font-bold">{user.phone || 'No phone'}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-5">
                                    <div className="flex flex-col gap-1.5">
                                        <StatusBadge status={user.accountStatus} />
                                        <StatusBadge status={user.role} />
                                    </div>
                                </td>
                                <td className="px-6 py-5">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs font-bold text-gray-700 flex items-center gap-2">
                                            <LayoutDashboard className="w-3 h-3 text-indigo-400" /> 
                                            {user._count?.enrollments || 0} Batches
                                        </span>
                                        <span className="text-xs font-bold text-gray-700 flex items-center gap-2">
                                            <Activity className="w-3 h-3 text-emerald-400" /> 
                                            {user._count?.testAttempts || 0} Attempts
                                        </span>
                                    </div>
                                </td>
                                <td className="px-6 py-5">
                                    <div className="text-xs font-bold text-gray-700 flex items-center gap-2" suppressHydrationWarning>
                                        <Clock className="w-3 h-3 text-gray-400" />
                                        {user.lastActiveAt ? new Date(user.lastActiveAt).toLocaleDateString() : 'Never'}
                                    </div>
                                    <div className="text-[10px] text-gray-400 font-medium ml-5 italic">
                                        {user.loginDevice?.slice(0, 15) || 'Unknown Device'}...
                                    </div>
                                </td>
                                <td className="px-6 py-5 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <Link 
                                            href={`/admin/users/${user.id}`}
                                            className="px-3 py-1.5 bg-white border border-gray-200 text-xs font-bold text-indigo-600 rounded-lg shadow-sm hover:border-indigo-600 hover:bg-indigo-50 transition-all inline-flex items-center gap-2"
                                        >
                                            <Eye className="w-3 h-3" /> Profile
                                        </Link>
                                        <button
                                            onClick={() => handleDelete(user.id, `${user.firstName} ${user.lastName}`)}
                                            disabled={deletingId === user.id}
                                            className="p-1.5 bg-white border border-gray-200 text-red-500 rounded-lg hover:bg-red-50 hover:border-red-300 transition-all disabled:opacity-50"
                                            title="Delete User"
                                        >
                                            {deletingId === user.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {filteredUsers.length === 0 && (
                            <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500 font-medium italic">No users matching search criteria.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {showAddModal && (
                <AddUserModal 
                    onClose={() => setShowAddModal(false)} 
                    onSuccess={onUserAdded || (() => {})} 
                />
            )}
        </div>
    );
}
