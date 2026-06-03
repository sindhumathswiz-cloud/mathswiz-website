'use client';

import React from 'react';
import {
    Sigma, Divide, Square as SquareRadical, Parentheses,
    FunctionSquare, LayoutGrid, ChevronDown,
    ChevronUp, Pi, Percent, Equal,
    DivideIcon, ArrowRight, Infinity
} from 'lucide-react';

interface MathToolbarProps {
    onInsert: (latex: string) => void;
    isOpen: boolean;
    onToggle: () => void;
}

const groups = [
    {
        name: 'Basic',
        items: [
            { label: 'Fraction', latex: '\\frac{num}{den}', icon: <Divide className="w-4 h-4" /> },
            { label: 'Square Root', latex: '\\sqrt{x}', icon: <SquareRadical className="w-4 h-4" /> },
            { label: 'Exponent', latex: 'x^{n}', icon: <Sigma className="w-4 h-4" /> },
            { label: 'Subscript', latex: 'x_{n}', icon: <Sigma className="w-4 h-4" /> },
        ]
    },
    {
        name: 'Calculus',
        items: [
            { label: 'Integral', latex: '\\int_{a}^{b} f(x) dx', icon: <Sigma className="w-4 h-4" /> },
            { label: 'Sum', latex: '\\sum_{i=1}^{n}', icon: <Sigma className="w-4 h-4" /> },
            { label: 'Limit', latex: '\\lim_{x \\to \\infty}', icon: <Infinity className="w-4 h-4" /> },
            { label: 'Derivative', latex: '\\frac{d}{dx}', icon: <DivideIcon className="w-4 h-4" /> },
        ]
    },
    {
        name: 'Structure',
        items: [
            { label: 'Matrix', latex: '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}', icon: <LayoutGrid className="w-4 h-4" /> },
            { label: 'Brackets', latex: '\\left( x \\right)', icon: <Parentheses className="w-4 h-4" /> },
            { label: 'Aligned', latex: '\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}', icon: <Equal className="w-4 h-4" /> },
            { label: 'Vector', latex: '\\vec{v}', icon: <ArrowRight className="w-4 h-4" /> },
        ]
    },
    {
        name: 'Symbols',
        items: [
            { label: 'Pi', latex: '\\pi', icon: <Pi className="w-4 h-4" /> },
            { label: 'Theta', latex: '\\theta', icon: <Sigma className="w-4 h-4" /> },
            { label: 'Infinity', latex: '\\infty', icon: <Infinity className="w-4 h-4" /> },
            { label: 'Degree', latex: '^{\\circ}', icon: <Percent className="w-4 h-4" /> },
        ]
    }
];

export default function MathToolbar({ onInsert, isOpen, onToggle }: MathToolbarProps) {
    return (
        <div className="border border-slate-700 rounded-xl overflow-hidden bg-slate-800/50 backdrop-blur-sm">
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between px-4 py-2 hover:bg-slate-700/50 transition-colors border-b border-slate-700"
            >
                <div className="flex items-center gap-2">
                    <Sigma className="w-4 h-4 text-indigo-400" />
                    <span className="text-sm font-semibold text-slate-200">Math Editor Toolbar</span>
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {isOpen && (
                <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in slide-in-from-top-2 duration-200">
                    {groups.map((group) => (
                        <div key={group.name} className="space-y-2">
                            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1">
                                {group.name}
                            </h4>
                            <div className="grid grid-cols-2 gap-1.5">
                                {group.items.map((item) => (
                                    <button
                                        key={item.label}
                                        onClick={() => onInsert(item.latex)}
                                        className="flex items-center gap-2 px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700/50 transition-all group"
                                    >
                                        <div className="text-indigo-400 group-hover:text-indigo-300 transition-colors shrink-0">
                                            {item.icon}
                                        </div>
                                        <span className="text-[10px] text-slate-300 truncate">{item.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
