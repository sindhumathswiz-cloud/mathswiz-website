'use client';

import React, { useEffect, useRef, useState } from 'react';

interface GraphRendererProps {
    expression: string;
}

export default function GraphRenderer({ expression }: GraphRendererProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [loaded, setLoaded] = useState(false);
    const plotRef = useRef<((options: unknown) => void) | null>(null);

    useEffect(() => {
        let cancelled = false;
        import('function-plot').then((mod) => {
            if (!cancelled) {
                plotRef.current = () => mod.default;
                setLoaded(true);
            }
        });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (containerRef.current && loaded && plotRef.current) {
            containerRef.current.innerHTML = '';
            try {
                import('function-plot').then((mod) => {
                    if (containerRef.current) {
                        mod.default({
                            target: containerRef.current,
                            width: 500,
                            height: 300,
                            grid: true,
                            data: [{ fn: expression }],
                        });
                    }
                });
            } catch (e) {
                console.error("Error rendering graph:", e);
            }
        }
    }, [expression, loaded]);

    return <div ref={containerRef} className="graph-container flex justify-center py-4">{!loaded && <div className="text-sm text-muted-foreground">Loading graph...</div>}</div>;
}
