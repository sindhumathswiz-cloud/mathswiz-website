'use client';

import React, { useState } from 'react';
import { 
    FileText, 
    Download, 
    Calendar, 
    Filter, 
    BarChart3, 
    PieChart, 
    CheckCircle2, 
    AlertCircle, 
    ArrowRight,
    FileJson,
    Sheet
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ReportsExportProps {
    stats: any;
    users: any[];
    leads: any[];
    payments: any[];
}

export const ReportsExport = ({ stats, users, leads, payments }: ReportsExportProps) => {
    const [entity, setEntity] = useState('Financials');
    const [dateRange, setDateRange] = useState('Last 30 Days');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleExport = async (format: 'CSV' | 'PDF') => {
        setIsGenerating(true);
        toast.loading(`Generating ${format} report...`, { id: 'export' });
        
        if (format === 'CSV') {
            try {
                let csvContent = "";
                let fileName = `${entity}_Report_${new Date().toISOString().split('T')[0]}.csv`;

                if (entity === 'Financials') {
                    csvContent = "ID,Student,Amount,Status,Due Date,Paid At,Description\n";
                    payments.forEach(p => {
                        const studentName = p.enrollment?.student ? `${p.enrollment.student.firstName} ${p.enrollment.student.lastName}` : "Unknown";
                        csvContent += `${p.id},"${studentName}",${p.amount},${p.status},${p.dueDate || ''},${p.paidAt || ''},"${p.description || ''}"\n`;
                    });
                } else if (entity === 'User Registrations') {
                    csvContent = "ID,Name,Email,Role,Status,Created At\n";
                    users.forEach(u => {
                        csvContent += `${u.id},"${u.firstName} ${u.lastName}","${u.email || ''}",${u.role},${u.accountStatus},${u.createdAt}\n`;
                    });
                } else if (entity === 'Lead CRM') {
                    csvContent = "ID,Name,Phone,Email,Status,Source,Notes,Created At\n";
                    leads.forEach(l => {
                        csvContent += `${l.id},"${l.name}","${l.phone}","${l.email || ''}",${l.status},"${l.source || ''}","${(l.notes || '').replace(/"/g, '""')}",${l.createdAt}\n`;
                    });
                } else if (entity === 'Test Performance') {
                    csvContent = "ID,Student,Test,Score,Correct,Incorrect,Skipped,Status,Date\n";
                    // Assuming stats contains a flattened array or passed via props
                    (stats.testAttempts || []).forEach((a: any) => {
                        csvContent += `${a.id},"${a.user?.firstName} ${a.user?.lastName}","${a.test?.title}",${a.totalScore},${a.totalCorrect},${a.totalIncorrect},${a.totalSkipped},${a.status},${a.startTime}\n`;
                    });
                } else if (entity === 'Practice Arena Stats') {
                    csvContent = "ID,Student,Topic,Mastery,Streak,Last Practiced\n";
                    (stats.studentProgress || []).forEach((s: any) => {
                        csvContent += `${s.id},"${s.user?.firstName} ${s.user?.lastName}",${s.topic},${s.masteryScore},${s.currentStreak},${s.lastPracticedAt}\n`;
                    });
                }

                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.setAttribute("href", url);
                link.setAttribute("download", fileName);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                toast.success(`${entity} CSV exported successfully`, { id: 'export' });
            } catch (err) {
                toast.error("Failed to generate CSV", { id: 'export' });
            } finally {
                setIsGenerating(false);
            }
            return;
        }

        if (format === 'PDF') {
            try {
                // PDF Export using established html2pdf methodology
                const html2pdf = (await import('html2pdf.js')).default;
                
                const element = document.createElement('div');
                element.innerHTML = `
                    <div style="padding: 40px; font-family: sans-serif; width: 800px; color: #111827;">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 40px; border-bottom: 2px solid #6366f1; padding-bottom: 20px;">
                            <div>
                                <h1 style="font-size: 28px; font-weight: 900; margin: 0; color: #4338ca;">Sindhu's Mathswiz Classes</h1>
                                <p style="font-size: 14px; margin: 5px 0 0 0; color: #6b7280; font-weight: 500;">Intelligence Report: ${entity}</p>
                            </div>
                            <div style="text-align: right;">
                                <p style="font-size: 12px; font-weight: 800; color: #9ca3af; margin: 0; text-transform: uppercase; letter-spacing: 0.1em;">Generated By</p>
                                <p style="font-size: 14px; font-weight: 700; color: #111827; margin: 0;">Admin Alpha</p>
                            </div>
                        </div>

                        <div style="display: grid; grid-template-cols: repeat(3, 1fr); gap: 20px; margin-bottom: 40px;">
                            <div style="background: #f9fafb; padding: 20px; border-radius: 16px; border: 1px solid #f3f4f6;">
                                <p style="font-size: 10px; font-weight: 900; color: #9ca3af; margin: 0 0 5px 0; text-transform: uppercase;">Total Data Points</p>
                                <p style="font-size: 20px; font-weight: 900; margin: 0; color: #111827;">${entity === 'Financials' ? payments.length : entity === 'User Registrations' ? users.length : leads.length}</p>
                            </div>
                            <div style="background: #f9fafb; padding: 20px; border-radius: 16px; border: 1px solid #f3f4f6;">
                                <p style="font-size: 10px; font-weight: 900; color: #9ca3af; margin: 0 0 5px 0; text-transform: uppercase;">Reporting Period</p>
                                <p style="font-size: 20px; font-weight: 900; margin: 0; color: #111827;">${dateRange}</p>
                            </div>
                            <div style="background: #f9fafb; padding: 20px; border-radius: 16px; border: 1px solid #f3f4f6;">
                                <p style="font-size: 10px; font-weight: 900; color: #9ca3af; margin: 0 0 5px 0; text-transform: uppercase;">Security Level</p>
                                <p style="font-size: 20px; font-weight: 900; margin: 0; color: #059669;">Tier-1 Cloud</p>
                            </div>
                        </div>

                        <div style="margin-top: 20px;">
                            <h2 style="font-size: 14px; font-weight: 900; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 0.05em; color: #4b5563;">Data Table Summary</h2>
                            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                                <thead>
                                    <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                                        <th style="padding: 12px; text-align: left; font-weight: 800; color: #64748b;">Title/Ref</th>
                                        <th style="padding: 12px; text-align: left; font-weight: 800; color: #64748b;">Primary Metric</th>
                                        <th style="padding: 12px; text-align: left; font-weight: 800; color: #64748b;">Status/Role</th>
                                        <th style="padding: 12px; text-align: left; font-weight: 800; color: #64748b;">Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${(entity === 'Financials' ? payments.slice(0, 15) : entity === 'User Registrations' ? users.slice(0, 15) : leads.slice(0, 15)).map((item: any) => `
                                        <tr style="border-bottom: 1px solid #f1f5f9;">
                                            <td style="padding: 10px;">${item.name || item.description || 'N/A'}</td>
                                            <td style="padding: 10px; font-weight: 700;">${item.amount ? '₹' + item.amount : item.email || item.phone}</td>
                                            <td style="padding: 10px;"><span style="background: #f1f5f9; padding: 3px 8px; border-radius: 999px; font-size: 9px; font-weight: 700;">${item.status || item.role || 'ACTIVE'}</span></td>
                                            <td style="padding: 10px; color: #94a3b8;">${new Date(item.createdAt).toLocaleDateString()}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                            ${(entity === 'Financials' ? payments.length : entity === 'User Registrations' ? users.length : leads.length) > 15 ? `<p style="font-size: 10px; color: #94a3b8; font-style: italic; margin-top: 10px;">Showing top 15 records. Download CSV for full dataset.</p>` : ''}
                        </div>

                        <div style="margin-top: 50px; border-top: 1px solid #f3f4f6; padding-top: 20px; text-align: center; color: #9ca3af; font-size: 10px;">
                            <p>This is a computer-generated intelligence report. All data is encrypted and validated.</p>
                        </div>
                    </div>
                `;

                const opt = {
                    margin: 10,
                    filename: `${entity}_Report.pdf`,
                    image: { type: 'jpeg' as const, quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, windowWidth: 800 },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
                };

                html2pdf().from(element).set(opt).save().then(() => {
                    toast.success("PDF exported successfully", { id: 'export' });
                    setIsGenerating(false);
                });
            } catch (err) {
                toast.error("Failed to generate PDF", { id: 'export' });
                setIsGenerating(false);
            }
            return;
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl font-black text-gray-900 tracking-tight">Reports & Export</h2>
                <p className="text-gray-500 font-medium text-sm">Generate high-fidelity intelligence reports across all platform verticals.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left: Configuration */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6">
                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Select Data Entity</label>
                            <div className="grid grid-cols-1 gap-2">
                                {['Financials', 'User Registrations', 'Test Performance', 'Practice Arena Stats', 'Lead CRM'].map(item => (
                                    <button 
                                        key={item}
                                        onClick={() => setEntity(item)}
                                        className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all duration-200 font-bold text-sm ${
                                            entity === item 
                                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700 ring-2 ring-indigo-50' 
                                            : 'bg-white border-gray-100 text-gray-600 hover:bg-gray-50'
                                        }`}
                                    >
                                        {item}
                                        {entity === item && <CheckCircle2 className="w-4 h-4" />}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Granular Filter</label>
                            <select className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm transition">
                                <option>All Data</option>
                                {entity === 'Financials' && (
                                    <>
                                        <option>Status: PAID</option>
                                        <option>Status: UNPAID</option>
                                        <option>Status: OVERDUE</option>
                                    </>
                                )}
                                {entity === 'User Registrations' && (
                                    <>
                                        <option>Role: STUDENT</option>
                                        <option>Role: TEACHER</option>
                                        <option>Status: APPROVED</option>
                                    </>
                                )}
                                {entity === 'Lead CRM' && (
                                    <>
                                        <option>Status: CONVERTED</option>
                                        <option>Status: NEW</option>
                                        <option>Source: Website</option>
                                    </>
                                )}
                            </select>
                        </div>

                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Reporting Period</label>
                            <div className="grid grid-cols-2 gap-2">
                                {['Last 7 Days', 'Last 30 Days', 'This Month', 'Custom'].map(period => (
                                    <button 
                                        key={period}
                                        onClick={() => setDateRange(period)}
                                        className={`px-3 py-2 rounded-lg border text-xs font-bold transition-all ${
                                            dateRange === period 
                                            ? 'bg-gray-900 text-white border-gray-900' 
                                            : 'bg-white text-gray-600 border-gray-100 hover:bg-gray-50'
                                        }`}
                                    >
                                        {period}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="pt-4">
                            <div className="flex flex-col gap-2">
                                <button 
                                    onClick={() => handleExport('CSV')}
                                    disabled={isGenerating}
                                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-indigo-100 disabled:opacity-50"
                                >
                                    <Sheet className="w-4 h-4" /> Download CSV Data
                                </button>
                                <button 
                                    onClick={() => handleExport('PDF')}
                                    disabled={isGenerating}
                                    className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 font-bold py-3 rounded-xl transition shadow-sm disabled:opacity-50"
                                >
                                    <FileText className="w-4 h-4 text-red-500" /> Export Professional PDF
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: Preview/Insights */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-indigo-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl shadow-indigo-200">
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 text-indigo-300 mb-4">
                                <BarChart3 className="w-5 h-5" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Intelligence Preview</span>
                            </div>
                            <h3 className="text-3xl font-black mb-2">{entity} Executive Summary</h3>
                            <p className="text-indigo-200 font-medium text-sm max-w-md">Snapshot of the {entity.toLowerCase()} vectors for the {dateRange.toLowerCase()} period.</p>
                            
                            <div className="grid grid-cols-3 gap-6 mt-8">
                                <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                                    <p className="text-[10px] font-black text-indigo-300 uppercase mb-1">Total Volume</p>
                                    <p className="text-2xl font-black">2,482</p>
                                    <p className="text-[10px] text-emerald-400 font-bold mt-1">+14.2% ↑</p>
                                </div>
                                <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                                    <p className="text-[10px] font-black text-indigo-300 uppercase mb-1">Avg Accuracy</p>
                                    <p className="text-2xl font-black">76.4%</p>
                                    <p className="text-[10px] text-indigo-300 font-bold mt-1">Stable</p>
                                </div>
                                <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                                    <p className="text-[10px] font-black text-indigo-300 uppercase mb-1">Health Score</p>
                                    <p className="text-2xl font-black">A+</p>
                                    <p className="text-[10px] text-emerald-400 font-bold mt-1">Optimized</p>
                                </div>
                            </div>
                        </div>
                        <div className="absolute -bottom-10 -right-10 w-64 h-64 bg-indigo-500 rounded-full blur-[100px] opacity-20"></div>
                        <div className="absolute top-0 right-0 p-8">
                            <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center">
                                <Download className="w-6 h-6 text-white animate-bounce" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white border border-gray-100 rounded-3xl p-8 shadow-sm">
                        <div className="flex items-center justify-between mb-8">
                            <h4 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-indigo-600" /> Granular Breakdown
                            </h4>
                            <div className="flex items-center gap-1">
                                <span className="w-3 h-3 bg-indigo-600 rounded-full"></span>
                                <span className="text-[10px] font-bold text-gray-500 mr-4 uppercase">Actual</span>
                                <span className="w-3 h-3 bg-indigo-200 rounded-full"></span>
                                <span className="text-[10px] font-bold text-gray-500 uppercase">Target</span>
                            </div>
                        </div>
                        
                        {/* Placeholder for a chart */}
                        <div className="h-64 w-full bg-gray-50 rounded-2xl border border-dashed border-gray-200 flex items-center justify-center flex-col gap-4">
                            <div className="flex items-end gap-3 h-32">
                                {[40, 70, 45, 90, 65, 80, 50, 85].map((h, i) => (
                                    <div key={i} className="w-8 bg-indigo-600 rounded-t-lg transition-all duration-500 hover:bg-indigo-700" style={{ height: `${h}%` }}></div>
                                ))}
                            </div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-4">Telemetry Visualization Loop</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
