'use client';

import React, { useEffect } from 'react';

export default function ContentProtector({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            // Optional: Show a toast warning the student
            console.warn("Right-click disabled to protect course content.");
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            // Prevent Ctrl+S, Ctrl+P, Mac Cmd+S, Cmd+P
            if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'p')) {
                e.preventDefault();
                console.warn("Saving and printing are disabled to protect course content.");
            }
        };

        document.addEventListener('contextmenu', handleContextMenu);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('contextmenu', handleContextMenu);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    return <>{children}</>;
}
