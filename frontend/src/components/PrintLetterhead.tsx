import React from 'react';

export default function PrintLetterhead({ title }: { title: string }) {
    return (
        <div className="flex justify-between items-start mb-8 border-b-2 border-gray-900 pb-6 w-full">
            <div className="flex items-center gap-6">
                <div className="w-20 h-20 bg-gray-900 rounded-xl flex items-center justify-center shrink-0">
                    <img src="/logo.png" alt="Logo" className="w-16 h-16 object-contain invert" />
                </div>
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter leading-none mb-1">Sindhu's Mathswiz Classes</h1>
                    <p className="text-sm font-bold text-gray-600 italic mb-2">Excellence in Mathematics & Competitive Exams</p>
                    <div className="text-[10px] text-gray-400 font-bold uppercase space-y-0.5">
                        <p>Address: Greenwood Residency, Yapral, Secunderabad, Telangana - 500087</p>
                        <p>Contact: +91 8919057248, 9434289963 | sindhu.mathswiz@gmail.com</p>
                    </div>
                </div>
            </div>
            <div className="text-right">
                <h2 className="text-xl font-black bg-gray-900 text-white px-5 py-2 inline-block rounded-lg shadow-sm">{title}</h2>
                <p className="text-[10px] font-black text-gray-400 uppercase mt-2 tracking-widest leading-none">Date: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
            </div>
        </div>
    );
}
