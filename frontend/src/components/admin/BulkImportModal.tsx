'use client';

import React, { useState } from 'react';
import { X, Upload, FileSpreadsheet, Download, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

interface BulkImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImportComplete: () => void;
}

export function BulkImportModal({ isOpen, onClose, onImportComplete }: BulkImportModalProps) {
    const [file, setFile] = useState<File | null>(null);
    const [isParsing, setIsParsing] = useState(false);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [isUploading, setIsUploading] = useState(false);

    const handleDownloadTemplate = () => {
        const template = [
            {
                content: "If $f(x) = x^2$, then $f'(x)$ is:",
                option_a: "$2x$",
                option_b: "$x^2$",
                option_c: "$2$",
                option_d: "$0$",
                correct_answer: "A",
                explanation: "Power rule: $\\frac{d}{dx}(x^n) = nx^{n-1}$.",
                subject: "Mathematics",
                class: "12",
                difficulty: "EASY",
                topic: "Differentiation"
            }
        ];
        
        const ws = XLSX.utils.json_to_sheet(template);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Questions Template");
        XLSX.writeFile(wb, "Mathswiz_Question_Template.xlsx");
        toast.success("Template downloaded!");
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            parseFile(selectedFile);
        }
    };

    const sanitizeLatex = (str: string | number | undefined | null): string => {
        if (str === null || str === undefined) return '';
        let content = String(str).trim();
        if (!content) return '';

        // Simple heuristic: if it contains math symbols but no $, wrap it
        // symbols: ^, _, \, {, }, [ ], =, +, - (if followed by digits/letters), etc.
        const mathRegex = /[\^\\_{}\[\]]|(\d+[\+\-\*\/=])|([\+\-\*\/=]\d+)/;
        
        // If it looks like math and doesn't have $, wrap it once
        if (mathRegex.test(content) && !content.includes('$')) {
            return `$${content}$`;
        }
        
        return content;
    };

    const parseFile = async (file: File) => {
        setIsParsing(true);
        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(worksheet);

            const mappedData = json.map((row: any) => {
                // Determine options - support A,B,C,D or option_a, option_b...
                const options = [
                    row.option_a || row.A || row.a || "",
                    row.option_b || row.B || row.b || "",
                    row.option_c || row.C || row.c || "",
                    row.option_d || row.D || row.d || ""
                ].map(opt => sanitizeLatex(opt));

                return {
                    content: sanitizeLatex(row.content || row.question || row.Question || ""),
                    options,
                    correctAnswer: String(row.correct_answer || row.answer || row.Answer || "").toUpperCase().trim(),
                    explanation: sanitizeLatex(row.explanation || row.Explanation || ""),
                    subject: row.subject || row.Subject || "Mathematics",
                    class: String(row.class || row.Class || "12"),
                    difficulty: (row.difficulty || row.Difficulty || "MEDIUM").toUpperCase(),
                    topic: row.topic || row.Topic || "",
                    status: 'PENDING_REVIEW'
                };
            });

            setPreviewData(mappedData.filter(q => q.content));
            toast.success(`Parsed ${mappedData.length} records. Ready for review.`);
        } catch (err: any) {
            console.error("Excel Read Error:", err);
            toast.error(`Error: ${err.message || "Failed to read file"}`);
        } finally {
            setIsParsing(false);
        }
    };

    const handleBatchUpload = async () => {
        if (previewData.length === 0) return;
        setIsUploading(true);
        const toastId = toast.loading(`Uploading ${previewData.length} questions to review queue...`);

        try {
            const res = await fetch('/api/questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(previewData)
            });

            if (!res.ok) throw new Error("Upload failed");
            
            toast.success(`Successfully imported ${previewData.length} questions!`, { id: toastId });
            onImportComplete();
            onClose();
        } catch (err) {
            toast.error("Failed to upload questions. Please try again.", { id: toastId });
        } finally {
            setIsUploading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" 
                    onClick={onClose}
                />
                
                <motion.div 
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                >
                    {/* Header */}
                    <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 p-6 text-white flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md">
                                <FileSpreadsheet className="w-6 h-6" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold">Bulk Question Import</h2>
                                <p className="text-indigo-100 text-xs font-medium uppercase tracking-widest">Excel / CSV Multi-Upload Studio</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8">
                        {/* Step 1: Upload / Template */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                            <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl p-8 flex flex-col items-center justify-center text-center group hover:border-indigo-400 transition cursor-pointer relative">
                                <input 
                                    type="file" 
                                    accept=".xlsx, .xls, .csv" 
                                    onChange={handleFileChange}
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                />
                                <div className="bg-indigo-100 text-indigo-600 p-4 rounded-2xl mb-4 group-hover:scale-110 transition">
                                    <Upload className="w-8 h-8" />
                                </div>
                                <h3 className="font-bold text-gray-900 mb-1">Click to Upload</h3>
                                <p className="text-sm text-gray-500">or drag and drop Excel/CSV files</p>
                                {file && <p className="mt-3 text-indigo-600 font-bold text-xs uppercase">{file.name} selected</p>}
                            </div>

                            <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
                                <div className="bg-emerald-100 text-emerald-600 p-4 rounded-2xl mb-4">
                                    <Download className="w-8 h-8" />
                                </div>
                                <h3 className="font-bold text-gray-900 mb-1">Download Template</h3>
                                <p className="text-sm text-gray-500 mb-4">Use our predefined structure for best results</p>
                                <button 
                                    onClick={handleDownloadTemplate}
                                    className="bg-white text-indigo-600 border border-indigo-200 px-6 py-2.5 rounded-xl font-bold text-sm hover:shadow-md transition flex items-center gap-2"
                                >
                                    <Download className="w-4 h-4" /> Get Template (.xlsx)
                                </button>
                            </div>
                        </div>

                        {/* Step 2: Preview Area */}
                        {previewData.length > 0 && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                        <CheckCircle className="w-5 h-5 text-emerald-500" /> 
                                        Review Drafts ({previewData.length})
                                    </h3>
                                    <span className="text-[10px] bg-amber-100 text-amber-700 font-black px-2 py-1 rounded uppercase tracking-widest">Questions will be added to REVIEW QUEUE</span>
                                </div>
                                
                                <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-inner bg-gray-50">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-gray-100 text-[10px] font-black uppercase text-gray-400 tracking-widest">
                                            <tr>
                                                <th className="px-6 py-3">Content Preview</th>
                                                <th className="px-6 py-3">Options</th>
                                                <th className="px-6 py-3">Subject / Class</th>
                                                <th className="px-6 py-3 text-right">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 text-sm">
                                            {previewData.slice(0, 5).map((q, i) => (
                                                <tr key={i} className="hover:bg-white transition">
                                                    <td className="px-6 py-4 max-w-xs">
                                                        <p className="font-medium text-gray-900 line-clamp-2">{q.content}</p>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <p className="text-xs text-gray-500">Correct: <span className="font-bold text-indigo-600">{q.correctAnswer}</span></p>
                                                        <p className="text-[10px] text-gray-400">Total Opts: {q.options.filter(Boolean).length}</p>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-bold">{q.subject}</span>
                                                        <span className="ml-1 bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px] font-bold">Class {q.class}</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <button className="text-red-400 hover:text-red-600 p-1"><X className="w-4 h-4" /></button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {previewData.length > 5 && (
                                                <tr>
                                                    <td colSpan={4} className="px-6 py-3 text-center text-gray-400 italic text-xs">
                                                        + {previewData.length - 5} more questions in this batch
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {previewData.length === 0 && !isParsing && (
                            <div className="py-20 text-center text-gray-300">
                                <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                <p className="font-medium italic">No questions ready for import yet.</p>
                            </div>
                        )}

                        {isParsing && (
                            <div className="py-20 text-center text-indigo-400">
                                <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin" />
                                <p className="font-bold animate-pulse">Scanning Excel rows and parsing LaTeX strings...</p>
                            </div>
                        )}
                    </div>

                    {/* Footer Actions */}
                    <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-4">
                        <button 
                            onClick={onClose}
                            className="px-6 py-3 rounded-2xl font-bold text-gray-500 hover:bg-gray-200 transition"
                        >
                            Discard
                        </button>
                        <button 
                            disabled={previewData.length === 0 || isUploading}
                            onClick={handleBatchUpload}
                            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-2xl font-black shadow-lg shadow-indigo-200 transition flex items-center gap-2"
                        >
                            {isUploading ? (
                                <><Loader2 className="w-5 h-5 animate-spin" /> Finalizing...</>
                            ) : (
                                <><CheckCircle className="w-5 h-5" /> Push to Review Queue</>
                            )}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
