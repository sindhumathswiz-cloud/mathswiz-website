'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Search, Check } from 'lucide-react';

const SYMBOLS = [
    { label: 'Fraction', latex: '\\frac{num}{den}', tags: ['fraction', 'frac', 'divide', 'ratio'] },
    { label: 'Square Root', latex: '\\sqrt{x}', tags: ['sqrt', 'root', 'radical'] },
    { label: 'Nth Root', latex: '\\sqrt[n]{x}', tags: ['root', 'nth', 'radical'] },
    { label: 'Power / Exponent', latex: 'x^{n}', tags: ['power', 'exponent', 'superscript'] },
    { label: 'Subscript', latex: 'x_{n}', tags: ['subscript', 'base', 'index'] },
    { label: 'Integral', latex: '\\int_{a}^{b} f(x)\\,dx', tags: ['integral', 'calculus', 'area'] },
    { label: 'Sum (Sigma)', latex: '\\sum_{i=1}^{n}', tags: ['sum', 'sigma', 'series'] },
    { label: 'Product (Pi)', latex: '\\prod_{i=1}^{n}', tags: ['product', 'pi', 'prod'] },
    { label: 'Limit', latex: '\\lim_{x \\to \\infty}', tags: ['limit', 'lim', 'calculus'] },
    { label: 'Derivative d/dx', latex: '\\frac{d}{dx}', tags: ['derivative', 'calculus', 'rate', 'ddx'] },
    { label: 'Partial Derivative', latex: '\\frac{\\partial f}{\\partial x}', tags: ['partial', 'derivative', 'multi'] },
    { label: 'Matrix 2x2', latex: '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}', tags: ['matrix', 'bmatrix', 'grid', 'array'] },
    { label: 'Determinant', latex: '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}', tags: ['determinant', 'vmatrix', 'det'] },
    { label: 'Left-Right Brackets', latex: '\\left( x \\right)', tags: ['bracket', 'parenthesis', 'group'] },
    { label: 'Aligned Equations', latex: '\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}', tags: ['align', 'aligned', 'system', 'equations'] },
    { label: 'Vector Arrow', latex: '\\vec{v}', tags: ['vector', 'arrow', 'vec', 'direction'] },
    { label: 'Pi (π)', latex: '\\pi', tags: ['pi', 'constant', 'circle'] },
    { label: 'Alpha (α)', latex: '\\alpha', tags: ['alpha', 'greek', 'angle'] },
    { label: 'Beta (β)', latex: '\\beta', tags: ['beta', 'greek', 'angle'] },
    { label: 'Gamma (γ)', latex: '\\gamma', tags: ['gamma', 'greek'] },
    { label: 'Delta (Δ)', latex: '\\Delta', tags: ['delta', 'greek', 'change'] },
    { label: 'Theta (θ)', latex: '\\theta', tags: ['theta', 'greek', 'angle', 'trig'] },
    { label: 'Lambda (λ)', latex: '\\lambda', tags: ['lambda', 'greek', 'eigenvalue'] },
    { label: 'Mu (μ)', latex: '\\mu', tags: ['mu', 'greek', 'mean'] },
    { label: 'Sigma (σ)', latex: '\\sigma', tags: ['sigma', 'greek', 'stddev', 'std'] },
    { label: 'Omega (ω)', latex: '\\omega', tags: ['omega', 'greek', 'angular'] },
    { label: 'Infinity (∞)', latex: '\\infty', tags: ['infinity', 'inf', 'endless'] },
    { label: 'Degree (°)', latex: '^{\\circ}', tags: ['degree', 'angle', 'temperature'] },
    { label: 'Approx (≈)', latex: '\\approx', tags: ['approx', 'approximately', 'similar'] },
    { label: 'Not Equal (≠)', latex: '\\neq', tags: ['neq', 'not equal', 'ne'] },
    { label: 'Less Equal (≤)', latex: '\\leq', tags: ['leq', 'less equal'] },
    { label: 'Greater Equal (≥)', latex: '\\geq', tags: ['geq', 'greater equal'] },
    { label: 'In Set (∈)', latex: '\\in', tags: ['in', 'element', 'set'] },
    { label: 'Not In (∉)', latex: '\\notin', tags: ['notin', 'not in', 'set'] },
    { label: 'Subset (⊂)', latex: '\\subset', tags: ['subset', 'set'] },
    { label: 'Union (∪)', latex: '\\cup', tags: ['union', 'cup', 'set'] },
    { label: 'Intersection (∩)', latex: '\\cap', tags: ['intersection', 'cap', 'set'] },
    { label: 'Implies (⇒)', latex: '\\Rightarrow', tags: ['implies', 'rightarrow', 'logic'] },
    { label: 'For All (∀)', latex: '\\forall', tags: ['forall', 'all', 'logic'] },
    { label: 'There Exists (∃)', latex: '\\exists', tags: ['exists', 'there exists', 'logic'] },
    { label: 'Sine', latex: '\\sin(x)', tags: ['sin', 'sine', 'trig'] },
    { label: 'Cosine', latex: '\\cos(x)', tags: ['cos', 'cosine', 'trig'] },
    { label: 'Tangent', latex: '\\tan(x)', tags: ['tan', 'tangent', 'trig'] },
    { label: 'Log', latex: '\\log_{a}(x)', tags: ['log', 'logarithm'] },
    { label: 'Natural Log', latex: '\\ln(x)', tags: ['ln', 'natural log'] },
    { label: 'Combination nCr', latex: '\\binom{n}{r}', tags: ['binom', 'combination', 'ncr', 'choose'] },
    { label: 'Sum Ellipsis', latex: 'a_1 + a_2 + \\cdots + a_n', tags: ['ellipsis', 'cdots', 'series dots'] },
];

interface GlobalMathToolbarProps {
    /** Optional className overrides for the wrapper */
    className?: string;
}

export default function GlobalMathToolbar({ className = '' }: GlobalMathToolbarProps) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const results = query.trim()
        ? SYMBOLS.filter(s =>
            s.label.toLowerCase().includes(query.toLowerCase()) ||
            s.tags.some(t => t.includes(query.toLowerCase())) ||
            s.latex.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 12)
        : [];

    // Close popover on click outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleCopy = (latex: string, label: string) => {
        navigator.clipboard.writeText(latex).catch(() => { });
        setCopied(label);
        setTimeout(() => setCopied(null), 1800);
        setOpen(false);
        setQuery('');
    };

    return (
        <div ref={wrapperRef} className={`relative ${className}`}>
            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 focus-within:border-indigo-500 transition-colors">
                <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={e => { setQuery(e.target.value); setOpen(true); }}
                    onFocus={() => query && setOpen(true)}
                    placeholder="Search math symbols (e.g. alpha, frac…)"
                    className="bg-transparent text-xs text-slate-200 placeholder-slate-500 outline-none w-44 md:w-56"
                />
                {copied && (
                    <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 shrink-0">
                        <Check className="w-3 h-3" /> Copied!
                    </div>
                )}
            </div>

            {open && results.length > 0 && (
                <div className="absolute top-full left-0 mt-1.5 z-[9999] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden w-80 animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="p-1.5 max-h-60 overflow-y-auto custom-scrollbar">
                        {results.map(sym => (
                            <button
                                key={sym.label}
                                onMouseDown={e => { e.preventDefault(); handleCopy(sym.latex, sym.label); }}
                                className="w-full flex items-center justify-between gap-3 px-3 py-2 hover:bg-indigo-600/20 rounded-lg text-left transition-colors group"
                            >
                                <div className="flex flex-col gap-0.5 min-w-0">
                                    <span className="text-xs font-semibold text-slate-200 group-hover:text-white truncate">{sym.label}</span>
                                    <span className="text-[10px] text-slate-500 font-mono truncate">{sym.latex}</span>
                                </div>
                                <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded shrink-0 group-hover:bg-indigo-500/20">copy</span>
                            </button>
                        ))}
                    </div>
                    <div className="px-3 py-1.5 border-t border-slate-800 text-[10px] text-slate-600 font-medium">
                        Click any symbol to copy LaTeX to clipboard
                    </div>
                </div>
            )}
        </div>
    );
}
