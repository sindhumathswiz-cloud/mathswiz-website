'use client';

import React, { useRef } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import MathRenderer from '@/components/MathRenderer';

interface ExportQuestion {
    id: string;
    markdown_content: string;
}

interface PDFGeneratorProps {
    questions: ExportQuestion[];
}

export default function PDFGenerator({ questions }: PDFGeneratorProps) {
    const contentRef = useRef<HTMLDivElement>(null);

    const generatePDF = async () => {
        if (!contentRef.current) return;

        try {
            // Create a canvas from the referenced HTML element
            const canvas = await html2canvas(contentRef.current, { scale: 2 });
            const imgData = canvas.toDataURL('image/png');

            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
            });

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save('mathswiz-question-paper.pdf');
        } catch (error) {
            console.error('Failed to generate PDF:', error);
        }
    };

    return (
        <div>
            <button
                onClick={generatePDF}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
            >
                Generate PDF
            </button>

            {/* Hidden element designed exactly for PDF layout */}
            <div className="hidden">
                <div ref={contentRef} className="p-10 w-[800px] bg-white text-black">
                    <div className="text-center mb-8 border-b-2 border-indigo-600 pb-4">
                        <h1 className="text-3xl font-bold text-indigo-800">Sindhu's Mathswiz Classes</h1>
                        <p className="text-lg text-gray-600">Generated Practice Paper</p>
                    </div>

                    <div className="space-y-6">
                        {questions.map((q, idx) => (
                            <div key={q.id} className="mb-6 flex">
                                <span className="font-bold mr-4 text-lg">Q{idx + 1}.</span>
                                <div className="flex-1">
                                    <MathRenderer content={q.markdown_content} />
                                </div>
                            </div>
                        ))}
                        {questions.length === 0 && (
                            <p>No questions selected for this paper.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
