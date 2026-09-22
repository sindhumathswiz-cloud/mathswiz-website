'use client';

import { useEffect, useState } from 'react';
import { Check, X, Loader2, Users, UserCheck, UserX } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function AdminApprovalsPage() {
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('ALL');

  useEffect(() => {
    fetchPendingUsers();
  }, []);

  const fetchPendingUsers = async () => {
    try {
      const res = await fetch('/api/admin/users/pending');
      const data = await res.json();
      if (data.users) setPendingUsers(data.users);
    } catch (e) {
      toast.error('Failed to load pending users');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (userId: string, status: 'APPROVED' | 'BLOCKED') => {
    setProcessing(userId);
    try {
      const res = await fetch('/api/admin/users/pending', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, status }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(status === 'APPROVED' ? 'User approved' : 'User rejected');
        fetchPendingUsers();
      } else {
        toast.error('Action failed');
      }
    } catch (e) {
      toast.error('Network error');
    } finally {
      setProcessing(null);
    }
  };

  const filteredUsers = filter === 'ALL' 
    ? pendingUsers 
    : pendingUsers.filter(u => u.role === filter);

  const roleCounts = {
    ALL: pendingUsers.length,
    STUDENT: pendingUsers.filter(u => u.role === 'STUDENT').length,
    TEACHER: pendingUsers.filter(u => u.role === 'TEACHER').length,
    PARENT: pendingUsers.filter(u => u.role === 'PARENT').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600 dark:text-brand" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="font-display text-3xl font-bold text-slate-900 dark:text-white">Account Approvals</h1>
        <p className="text-slate-500 mt-1 dark:text-slate-400">Review and approve pending user registrations</p>
      </div>

      <div className="flex gap-2">
        {['ALL', 'STUDENT', 'TEACHER', 'PARENT'].map((role) => (
          <button
            key={role}
            onClick={() => setFilter(role)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === role
                ? 'bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet text-white'
                : 'bg-white dark:bg-surface dark:border-white/10 text-slate-700 dark:text-slate-300 border hover:bg-slate-50 dark:hover:bg-white/5'
            }`}
          >
            {role === 'ALL' ? 'All' : `${role}s`} ({roleCounts[role as keyof typeof roleCounts]})
          </button>
        ))}
      </div>

      {filteredUsers.length === 0 ? (
        <div className="bg-white p-12 rounded-xl border dark:border-white/10 text-center dark:bg-surface">
          <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="font-display text-lg font-semibold text-slate-700 dark:text-slate-300">No pending approvals</h3>
          <p className="text-slate-500 mt-1 dark:text-slate-400">All user accounts have been reviewed</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredUsers.map((user) => (
            <div
              key={user.id}
              className="bg-white p-6 rounded-xl border dark:border-white/10 shadow-sm hover:shadow-md transition-shadow dark:bg-surface"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center dark:bg-brand/15">
                    <span className="text-lg font-bold text-indigo-600 dark:text-brand">
                      {(user.firstName || user.email || '?')[0].toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-display font-semibold text-slate-900 dark:text-white">
                      {user.firstName && user.lastName
                        ? `${user.firstName} ${user.lastName}`
                        : user.email || 'Unnamed User'}
                    </h3>
                    <div className="flex items-center gap-3 text-sm text-slate-500 mt-1 dark:text-slate-400">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        user.role === 'TEACHER' ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400' :
                        user.role === 'PARENT' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' :
                        'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400'
                      }`}>
                        {user.role}
                      </span>
                      {user.mobileNumber && <span>{user.mobileNumber}</span>}
                      {user.class && <span>• {user.class}</span>}
                      <span>• Registered {new Date(user.createdAt).toLocaleDateString('en-IN')}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAction(user.id, 'APPROVED')}
                    disabled={processing === user.id}
                    className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    {processing === user.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    Approve
                  </button>
                  <button
                    onClick={() => handleAction(user.id, 'BLOCKED')}
                    disabled={processing === user.id}
                    className="flex items-center gap-2 bg-rose-600 text-white px-4 py-2 rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
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
}
