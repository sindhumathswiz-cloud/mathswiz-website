import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardState } from './DashboardState';

describe('DashboardState', () => {
    it('announces loading states without exposing decorative icons', () => {
        render(<DashboardState loading title="Preparing dashboard" description="Loading current information." />);

        expect(screen.getByRole('status')).toHaveTextContent('Preparing dashboard');
        expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    });

    it('renders a clear empty state', () => {
        render(<DashboardState title="No recent results" description="Results will appear here." />);

        expect(screen.getByRole('heading', { name: 'No recent results' })).toBeInTheDocument();
        expect(screen.getByText('Results will appear here.')).toBeInTheDocument();
    });
});
