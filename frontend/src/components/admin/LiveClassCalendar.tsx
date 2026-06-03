'use client';

import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Video, Link as LinkIcon, RefreshCw, Plus, Users, Trash2, ExternalLink, CalendarDays, Loader2, ChevronLeft, ChevronRight, Play, Settings, X, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

interface LiveClass {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    meetingUrl: string;
    recordingUrl?: string;
    batchId: string;
    batch?: { name: string };
}

export const LiveClassCalendar = ({ teacherId, batches = [] }: { teacherId: string, batches?: any[] }) => {
    const [classes, setClasses] = useState<LiveClass[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [isScheduling, setIsScheduling] = useState(false);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedClass, setSelectedClass] = useState<LiveClass | null>(null);
    const [isEditMode, setIsEditMode] = useState(false);
    
    const [scheduleForm, setScheduleForm] = useState({ 
        id: '', // For editing
        batchId: '', title: '', date: new Date().toISOString().split('T')[0], 
        startTimeStr: '10:00', endTimeStr: '11:00' 
    });
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        fetchClasses();
    }, []);

    const fetchClasses = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/teacher/live-classes?teacherId=${teacherId}`);
            if (!res.ok) throw new Error('Failed to fetch live classes');
            const data = await res.json();
            setClasses(data.liveClasses || []);
        } catch (error) {
            console.error(error);
            toast.error('Could not load live classes');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSync = async () => {
        setIsSyncing(true);
        const toastId = toast.loading('Discovery Mode: Searching for recordings & updates...');
        try {
            const res = await fetch('/api/admin/teams/sync', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ autoDiscovery: true })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Sync failed');
            
            toast.success(data.message || 'Discovery complete! Recordings and classes updated.', { id: toastId });
            fetchClasses();
        } catch (error: any) {
            toast.error(error.message || 'Sync failed. Ensure Azure AD permissions are granted.', { id: toastId });
        } finally {
            setIsSyncing(false);
        }
    };

    const handleScheduleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsScheduling(true);
        const { id, batchId, title, date, startTimeStr, endTimeStr } = scheduleForm;
        
        const startDateTime = new Date(`${date}T${startTimeStr}:00`);
        const endDateTime = new Date(`${date}T${endTimeStr}:00`);

        try {
            const res = await fetch('/api/admin/teams/schedule', {
                method: isEditMode ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: isEditMode ? id : undefined,
                    batchId,
                    title,
                    start: startDateTime.toISOString(),
                    end: endDateTime.toISOString()
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Action failed');
            
            toast.success(isEditMode ? "Class updated successfully!" : "Live class scheduled successfully!");
            setIsScheduleModalOpen(false);
            resetForm();
            fetchClasses();
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsScheduling(false);
        }
    };

    const openEditModal = (cls: LiveClass) => {
        const start = new Date(cls.startTime);
        const end = new Date(cls.endTime);
        
        setScheduleForm({
            id: cls.id,
            batchId: cls.batchId,
            title: cls.title,
            date: start.toISOString().split('T')[0],
            startTimeStr: start.toTimeString().substring(0, 5),
            endTimeStr: end.toTimeString().substring(0, 5)
        });
        setIsEditMode(true);
        setIsScheduleModalOpen(true);
        setSelectedClass(null);
    };

    const handleDelete = async (classId: string) => {
        if (!confirm("Are you sure you want to permanently delete this session? It will be removed from your Microsoft Calendar and student dashboards.")) return;
        
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/admin/teams/schedule?id=${classId}`, {
                method: 'DELETE'
            });
            if (!res.ok) throw new Error('Failed to delete class');
            
            toast.success("Meeting deleted successfully");
            setSelectedClass(null);
            fetchClasses();
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsDeleting(false);
        }
    };

    const resetForm = () => {
        setScheduleForm({ id: '', batchId: '', title: '', date: new Date().toISOString().split('T')[0], startTimeStr: '10:00', endTimeStr: '11:00' });
        setIsEditMode(false);
    };

    const formatTime = (dateStr: string) => {
        return new Intl.DateTimeFormat('en-IN', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
        }).format(new Date(dateStr));
    };

    const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

    const renderCalendar = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const totalDays = daysInMonth(year, month);
        const startDay = firstDayOfMonth(year, month);
        const calendarDays = [];

        for (let i = 0; i < startDay; i++) calendarDays.push(null);
        for (let i = 1; i <= totalDays; i++) calendarDays.push(i);

        return (
            <div className="grid grid-cols-7 gap-px bg-gray-100 border border-gray-200 rounded-3xl overflow-hidden shadow-inner">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <div key={d} className="bg-gray-50 py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">{d}</div>
                ))}
                {calendarDays.map((day, idx) => {
                    if (!day) return <div key={`empty-${idx}`} className="bg-white/50 h-32 md:h-44" />;
                    
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const dayClasses = classes.filter(c => c.startTime.startsWith(dateStr));
                    const isToday = new Date().toISOString().split('T')[0] === dateStr;

                    return (
                        <div 
                            key={day} 
                            onClick={() => {
                                setScheduleForm({ ...scheduleForm, date: dateStr, id: '' });
                                setIsEditMode(false);
                                setIsScheduleModalOpen(true);
                            }}
                            className={`bg-white h-32 md:h-44 p-3 transition-all hover:bg-gray-50 cursor-pointer group relative ${isToday ? 'bg-indigo-50/10' : ''}`}
                        >
                            <span className={`text-sm font-black ${isToday ? 'text-indigo-600' : 'text-gray-400'}`}>{day}</span>
                            <div className="mt-2 space-y-1">
                                {dayClasses.map(c => {
                                    const isStartingSoon = new Date(c.startTime) > new Date() && new Date(c.startTime).getTime() - new Date().getTime() < 1800000;
                                    const isLive = new Date() >= new Date(c.startTime) && new Date() <= new Date(c.endTime);
                                    const isPast = new Date() > new Date(c.endTime);

                                    return (
                                        <div 
                                            key={c.id} 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedClass(c);
                                            }}
                                            className={`text-[9px] font-bold px-1.5 py-1 rounded truncate flex items-center gap-1 transition-transform hover:scale-105 shadow-sm active:scale-95 ${
                                                isLive ? 'bg-green-600 text-white animate-pulse' : 
                                                isStartingSoon ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                                isPast ? 'bg-gray-100 text-gray-500 opacity-70' :
                                                'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                            }`}
                                        >
                                            {isLive && <div className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />}
                                            {c.recordingUrl && <Play className="w-2 h-2 shrink-0 text-purple-600" />}
                                            {formatTime(c.startTime)} - {c.title}
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition">
                                <Plus className="w-4 h-4 text-indigo-300" />
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-indigo-600" />
                <div>
                    <h2 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                        <CalendarDays className="w-8 h-8 text-indigo-600" />
                        Live Classes Command Center
                    </h2>
                    <p className="text-gray-500 font-medium mt-1">Manage schedules, start live sessions, and access recordings.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                    <div className="flex bg-gray-100 p-1.5 rounded-2xl">
                        <button 
                            onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}
                            className="p-2 hover:bg-white rounded-xl transition shadow-sm text-gray-600"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div className="px-6 py-2 text-sm font-black text-gray-900 min-w-[180px] text-center uppercase tracking-tighter">
                            {currentDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                        </div>
                        <button 
                            onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}
                            className="p-2 hover:bg-white rounded-xl transition shadow-sm text-gray-600"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                    <button 
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="flex-1 lg:flex-none flex items-center justify-center gap-2 bg-indigo-50 text-indigo-700 px-6 py-3 rounded-2xl font-black hover:bg-indigo-100 transition disabled:opacity-50 text-sm"
                    >
                        <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                        {isSyncing ? 'Discovering...' : 'Sync & Discover Recordings'}
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="bg-white rounded-[2.5rem] border border-gray-100 p-20 flex flex-col items-center justify-center gap-5 shadow-sm min-h-[600px]">
                    <div className="relative">
                        <div className="w-20 h-20 border-4 border-indigo-50 border-t-indigo-600 rounded-full animate-spin" />
                        <Video className="w-8 h-8 text-indigo-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                    </div>
                    <div className="text-center">
                        <p className="text-gray-900 font-black text-xl">Loading Universe...</p>
                        <p className="text-gray-400 font-bold">Synchronizing your live classes</p>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-[2.5rem] border border-gray-100 p-4 lg:p-8 shadow-sm">
                    {renderCalendar()}
                </div>
            )}

            {/* Class Detail Popover/Modal */}
            <AnimatePresence>
                {selectedClass && (
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-[0_32px_64px_-12px_rgba(0,0,0,0.2)] border border-gray-100 overflow-hidden"
                        >
                            <div className="p-8 pb-0 flex justify-between items-start">
                                <div className="space-y-1">
                                    <div className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] bg-indigo-50 w-fit px-3 py-1 rounded-full">
                                        Session Details
                                    </div>
                                    <h3 className="text-3xl font-black text-gray-900 leading-tight">{selectedClass.title}</h3>
                                    <p className="text-gray-500 font-bold flex items-center gap-2">
                                        <Users className="w-4 h-4" /> {selectedClass.batch?.name || "Unassigned Batch"}
                                    </p>
                                </div>
                                <button onClick={() => setSelectedClass(null)} className="p-3 bg-gray-50 text-gray-400 hover:text-gray-900 rounded-2xl transition">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="p-8 space-y-8">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-gray-50 p-6 rounded-[2rem]">
                                        <Clock className="w-6 h-6 text-indigo-600 mb-3" />
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Start Time</p>
                                        <p className="text-lg font-black text-gray-900">{formatTime(selectedClass.startTime)}</p>
                                    </div>
                                    <div className="bg-gray-50 p-6 rounded-[2rem]">
                                        <Calendar className="w-6 h-6 text-indigo-600 mb-3" />
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">End Time</p>
                                        <p className="text-lg font-black text-gray-900">{formatTime(selectedClass.endTime)}</p>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-3">
                                    {new Date() <= new Date(selectedClass.endTime) && (
                                        <a 
                                            href={selectedClass.meetingUrl} target="_blank" rel="noopener noreferrer"
                                            className="flex items-center justify-center gap-3 py-5 bg-green-600 hover:bg-green-700 text-white font-black rounded-[2rem] shadow-xl shadow-green-100 transition-all text-lg group"
                                        >
                                            <Video className="w-6 h-6 group-hover:scale-110 transition" />
                                            {new Date() >= new Date(selectedClass.startTime) ? "Join Meeting Now" : "Start Meeting Environment"}
                                        </a>
                                    )}

                                    {selectedClass.recordingUrl && (
                                        <a 
                                            href={selectedClass.recordingUrl} target="_blank" rel="noopener noreferrer"
                                            className="flex items-center justify-center gap-3 py-5 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-[2rem] shadow-xl shadow-purple-100 transition-all text-lg"
                                        >
                                            <Play className="w-6 h-6" />
                                            Watch Session Recording
                                        </a>
                                    )}
                                    
                                    <div className="flex gap-3">
                                        <button 
                                            onClick={() => openEditModal(selectedClass)}
                                            className="flex-1 flex items-center justify-center gap-2 py-4 bg-indigo-50 text-indigo-700 font-black rounded-[1.5rem] hover:bg-indigo-100 transition-colors"
                                        >
                                            <Settings className="w-5 h-5" />
                                            Edit Details
                                        </button>
                                        <button 
                                            disabled={isDeleting}
                                            className="px-6 py-4 bg-rose-50 text-rose-600 font-black rounded-[1.5rem] hover:bg-rose-100 transition-all disabled:opacity-50"
                                            onClick={() => handleDelete(selectedClass.id)}
                                        >
                                            {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Schedule / Edit Modal */}
            {isScheduleModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[120] flex items-center justify-center p-4">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="bg-white rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl border border-gray-100 relative overflow-hidden"
                    >
                        <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600" />
                        
                        <div className="flex justify-between items-center mb-8">
                            <div className="bg-indigo-50 p-3 rounded-2xl">
                                {isEditMode ? <Settings className="w-6 h-6 text-indigo-600" /> : <Plus className="w-6 h-6 text-indigo-600" />}
                            </div>
                            <button onClick={() => setIsScheduleModalOpen(false)} className="p-2 text-gray-400 hover:text-rose-500 transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="mb-8">
                            <h3 className="text-2xl font-black text-gray-900 tracking-tight">{isEditMode ? 'Update Session' : 'New Live Class'}</h3>
                            <p className="text-gray-500 font-medium">For {new Date(scheduleForm.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                        </div>

                        <form onSubmit={handleScheduleSubmit} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Assigned Batch</label>
                                <select 
                                    required 
                                    disabled={isEditMode}
                                    value={scheduleForm.batchId} 
                                    onChange={e => setScheduleForm({ ...scheduleForm, batchId: e.target.value })} 
                                    className="w-full px-5 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-600 rounded-[1.5rem] outline-none font-bold transition-all appearance-none disabled:opacity-50"
                                >
                                    <option value="" disabled>Choose a batch...</option>
                                    {batches.map(b => (
                                        <option key={b.id} value={b.id}>{b.course?.title || b.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Class Topic / Subject</label>
                                <input 
                                    required type="text" 
                                    value={scheduleForm.title} 
                                    onChange={e => setScheduleForm({ ...scheduleForm, title: e.target.value })} 
                                    className="w-full px-5 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-600 rounded-[1.5rem] outline-none font-bold transition-all" 
                                    placeholder="e.g. Calculus Integration Introduction" 
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Starts At</label>
                                    <input 
                                        required type="time" 
                                        value={scheduleForm.startTimeStr} 
                                        onChange={e => setScheduleForm({ ...scheduleForm, startTimeStr: e.target.value })} 
                                        className="w-full px-5 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-600 rounded-[1.5rem] outline-none font-bold transition-all" 
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Ends At</label>
                                    <input 
                                        required type="time" 
                                        value={scheduleForm.endTimeStr} 
                                        onChange={e => setScheduleForm({ ...scheduleForm, endTimeStr: e.target.value })} 
                                        className="w-full px-5 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-600 rounded-[1.5rem] outline-none font-bold transition-all" 
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button type="button" onClick={() => setIsScheduleModalOpen(false)} className="flex-1 py-4 text-sm text-gray-400 font-black hover:text-gray-900 transition-colors">Cancel</button>
                                <button type="submit" disabled={isScheduling} className="flex-[2] flex items-center justify-center gap-3 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-[1.5rem] shadow-xl shadow-indigo-200 transition-all disabled:opacity-50">
                                    {isScheduling ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                                    {isEditMode ? 'Save Changes' : 'Finalize Class'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </div>
    );
};
