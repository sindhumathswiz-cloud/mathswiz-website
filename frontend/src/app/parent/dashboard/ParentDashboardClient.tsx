'use client';

import React, { useState } from 'react';
import { Users, TrendingUp, CreditCard, Target, Plus, XCircle, LogOut } from 'lucide-react';
import { linkStudentAction, unlinkStudentAction } from "@/actions/parentActions";
import { toast } from "react-hot-toast";
import { useSession } from 'next-auth/react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function ParentDashboardClient({ initialStudents = [] }: { initialStudents: any[] }) {
    const { data: session } = useSession();
    const [students, setStudents] = useState(initialStudents);
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
    const [studentEmail, setStudentEmail] = useState('');

    const handleLinkStudent = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await linkStudentAction((session?.user as any).id, studentEmail);
            toast.success("Student linked successfully!");
            setIsLinkModalOpen(false);
            setStudentEmail('');
            // Optional: Reload or fetch data if not handled by revalidatePath
            window.location.reload();
        } catch (error: any) {
            toast.error(error.message);
        }
    };

    const handleUnlink = async (id: string) => {
        if (window.confirm("Are you sure you want to unlink this student account?")) {
            try {
                await unlinkStudentAction(id);
                toast.success("Student unlinked.");
                window.location.reload();
            } catch (error: any) {
                toast.error(error.message);
            }
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-12">
                    <div>
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight">Parent Portal</h1>
                        <p className="text-lg text-gray-500 font-medium">Monitoring track for {(session?.user as any)?.firstName || 'Guardian'}</p>
                    </div>
                    <button 
                        onClick={() => setIsLinkModalOpen(true)}
                        className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-indigo-700 transition shadow-lg shadow-indigo-600/20"
                    >
                        <Plus className="w-5 h-5" /> Link Student
                    </button>
                </div>

                {students.length === 0 ? (
                    <div className="bg-white rounded-3xl border-2 border-dashed border-gray-200 p-20 text-center">
                        <Users className="w-20 h-20 text-gray-100 mx-auto mb-6" />
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">No Students Linked</h2>
                        <p className="text-gray-500 mb-8 max-w-sm mx-auto">Link your child's account using their registered email to start monitoring their progress.</p>
                        <button 
                            onClick={() => setIsLinkModalOpen(true)}
                            className="text-indigo-600 font-black hover:underline"
                        >
                            Get Started &rarr;
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {students.map((student: any) => {
                            const chartData = student.testAttempts.map((att: any) => ({
                                date: new Date(att.endTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
                                score: att.totalScore
                            }));

                            const outstandingFee = student.enrollments.reduce((sum: number, enr: any) => {
                                return sum + enr.payments.filter((p: any) => p.status !== 'PAID').reduce((s: number, p: any) => s + p.amount, 0);
                            }, 0);

                            return (
                                <div key={student.id} className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-xl transition-shadow duration-300">
                                    <div className="p-8 border-b border-gray-50 flex justify-between items-start">
                                        <div>
                                            <h2 className="text-2xl font-black text-gray-900">{student.firstName} {student.lastName}</h2>
                                            <p className="text-indigo-600 font-bold text-sm tracking-wider uppercase">{student.class || 'No Class Assigned'}</p>
                                        </div>
                                        <button onClick={() => handleUnlink(student.id)} title="Unlink Student" className="text-gray-300 hover:text-red-500 transition">
                                            <LogOut className="w-5 h-5" />
                                        </button>
                                    </div>

                                    <div className="p-8 space-y-8">
                                        {/* Performance Section */}
                                        <div>
                                            <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                                <TrendingUp className="w-4 h-4 text-emerald-500" /> Recent Performance
                                            </h3>
                                            {chartData.length > 0 ? (
                                                <div className="h-48">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <LineChart data={chartData}>
                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F9FAFB" />
                                                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                                                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                                                            <Tooltip 
                                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                                            />
                                                            <Line type="monotone" dataKey="score" stroke="#4F46E5" strokeWidth={3} dot={{ r: 4, fill: '#4F46E5' }} activeDot={{ r: 6 }} />
                                                        </LineChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            ) : (
                                                <p className="text-gray-400 text-sm italic">No test attempts recorded yet.</p>
                                            )}
                                        </div>

                                        {/* Stats Row */}
                                        <div className="grid grid-cols-2 gap-6">
                                            <div className="bg-gray-50 rounded-2xl p-6">
                                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                                    <CreditCard className="w-3.5 h-3.5 text-blue-500" /> Fees Due
                                                </h4>
                                                <p className={`text-2xl font-black ${outstandingFee > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                    ₹ {outstandingFee.toLocaleString('en-IN')}
                                                </p>
                                            </div>
                                            <div className="bg-gray-50 rounded-2xl p-6">
                                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                                    <Target className="w-3.5 h-3.5 text-purple-500" /> Target
                                                </h4>
                                                <p className="text-xl font-black text-gray-900 truncate">
                                                    {student.studentGoal?.targetExam || 'Not Set'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Link Modal */}
            {isLinkModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setIsLinkModalOpen(false)}></div>
                    <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-black text-gray-900">Link Student</h2>
                            <button onClick={() => setIsLinkModalOpen(false)} className="text-gray-400 hover:text-gray-900"><XCircle className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleLinkStudent}>
                            <p className="text-gray-500 text-sm mb-6 font-medium">Enter the registered email of your child to establish a link. They must already have a student account.</p>
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Student Email Address</label>
                            <input 
                                required 
                                type="email" 
                                value={studentEmail}
                                onChange={(e) => setStudentEmail(e.target.value)}
                                placeholder="child@example.com"
                                className="w-full bg-gray-50 border-gray-100 rounded-2xl p-4 mb-8 outline-none focus:ring-2 focus:ring-indigo-500 transition"
                            />
                            <button 
                                type="submit"
                                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-indigo-700 transition"
                            >
                                Link Account
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
