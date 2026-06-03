import React from 'react';
import { Hammer, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface UnderDevelopmentProps {
    featureName?: string;
}

export default function UnderDevelopment({ featureName = "This Feature" }: UnderDevelopmentProps) {
    return (
        <div className="min-h-[70vh] flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
            <div className="w-24 h-24 bg-indigo-100 rounded-full flex items-center justify-center mb-6 text-indigo-600">
                <Hammer className="w-12 h-12" />
            </div>

            <h1 className="text-3xl font-bold text-gray-900 mb-4">
                Under Construction
            </h1>

            <p className="text-lg text-gray-600 max-w-lg mb-8">
                We are currently building <span className="font-semibold text-indigo-600">{featureName}</span> for the upcoming batch.
                It will be packed with AI-powered insights and seamless features!
            </p>

            <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition shadow-sm hover:shadow-md"
            >
                <ArrowLeft className="w-5 h-5" />
                Back to Home
            </Link>
        </div>
    );
}
