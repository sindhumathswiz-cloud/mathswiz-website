'use client';

import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle, Calendar, CreditCard, IndianRupee } from 'lucide-react';

interface Installment {
  description: string;
  amount: number;
  status: string;
  dueDate: string | null;
  isOverdue: boolean;
  paidAt: string | null;
}

interface FeeStatus {
  batchName: string;
  hasFeeStructure: boolean;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  installments: Installment[];
}

export default function FeeReminders() {
  const [feeStatus, setFeeStatus] = useState<FeeStatus[]>([]);
  const [summary, setSummary] = useState({ totalPending: 0, overdueCount: 0, batchesWithFees: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/student/fees')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setFeeStatus(data.feeStatus);
          setSummary(data.summary);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-4">
      {/* Overdue Alert */}
      {summary.overdueCount > 0 && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-800">Payment Overdue!</h3>
              <p className="text-sm text-red-700">
                You have {summary.overdueCount} overdue installment{summary.overdueCount !== 1 ? 's' : ''}. Please clear them at the earliest.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white p-4 rounded-xl border">
          <div className="flex items-center gap-2">
            <IndianRupee className="w-5 h-5 text-amber-600" />
            <div>
              <div className="text-lg font-bold text-slate-800">₹{summary.totalPending.toLocaleString('en-IN')}</div>
              <div className="text-xs text-slate-500">Pending Amount</div>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-600" />
            <div>
              <div className="text-lg font-bold text-slate-800">{summary.batchesWithFees}</div>
              <div className="text-xs text-slate-500">Active Batches</div>
            </div>
          </div>
        </div>
      </div>

      {/* Fee Status by Batch */}
      {feeStatus.length === 0 ? (
        <div className="text-center p-8 text-slate-500">
          <CreditCard className="w-12 h-12 mx-auto mb-2 text-slate-300" />
          <p>No fee information available</p>
        </div>
      ) : (
        feeStatus.map((fee, idx) => (
          <div key={idx} className="bg-white rounded-xl border overflow-hidden">
            <div className="p-4 border-b bg-slate-50">
              <h3 className="font-semibold text-slate-800">{fee.batchName}</h3>
            </div>

            {fee.hasFeeStructure ? (
              <div className="p-4 space-y-3">
                {/* Progress Bar */}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600">Payment Progress</span>
                    <span className="font-medium">
                      ₹{fee.paidAmount.toLocaleString('en-IN')} / ₹{fee.totalAmount.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div
                      className="bg-emerald-500 h-2 rounded-full transition-all"
                      style={{ width: `${(fee.paidAmount / fee.totalAmount) * 100}%` }}
                    ></div>
                  </div>
                </div>

                {/* Installments */}
                <div className="space-y-2">
                  {fee.installments.map((inst, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-lg border flex items-center justify-between ${
                        inst.isOverdue
                          ? 'border-red-300 bg-red-50'
                          : inst.status === 'PAID'
                          ? 'border-emerald-200 bg-emerald-50'
                          : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {inst.status === 'PAID' ? (
                          <CheckCircle className="w-5 h-5 text-emerald-600" />
                        ) : inst.isOverdue ? (
                          <AlertTriangle className="w-5 h-5 text-red-600" />
                        ) : (
                          <Calendar className="w-5 h-5 text-slate-400" />
                        )}
                        <div>
                          <div className="text-sm font-medium text-slate-800">{inst.description}</div>
                          <div className="text-xs text-slate-500">
                            Due: {formatDate(inst.dueDate)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-slate-800">₹{inst.amount.toLocaleString('en-IN')}</div>
                        <div className={`text-xs ${
                          inst.status === 'PAID' ? 'text-emerald-600' :
                          inst.isOverdue ? 'text-red-600' : 'text-slate-500'
                        }`}>
                          {inst.status === 'PAID' ? 'Paid' : inst.isOverdue ? 'Overdue' : inst.status}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-4 text-sm text-slate-500 text-center">
                No fee structure configured for this batch
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
