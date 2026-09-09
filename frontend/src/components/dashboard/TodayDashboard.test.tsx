import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookOpen, Users } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { TodayDashboard } from './TodayDashboard';

const dashboardProps = {
    role: 'Teacher',
    title: 'Your teaching day',
    description: 'The work that needs attention.',
    metrics: [{ label: 'Students', value: 24, hint: 'active learners', icon: Users }],
    priorities: [{ title: 'Two requests', detail: 'Review learners.', tone: 'attention' as const }],
    actions: [{ label: 'Open materials', href: '/teacher/materials', icon: BookOpen }],
};

describe('TodayDashboard', () => {
    it('renders the shared hierarchy and working actions', async () => {
        const onAction = vi.fn();
        const user = userEvent.setup();

        render(
            <TodayDashboard
                role="Teacher"
                title="Your teaching day"
                description="The work that needs attention."
                metrics={[{ label: 'Students', value: 24, icon: Users }]}
                priorities={[{ title: 'Two requests', detail: 'Review learners.', tone: 'attention' }]}
                actions={[
                    { label: 'Open materials', href: '/teacher/materials', icon: BookOpen },
                    { label: 'Review students', onClick: onAction, icon: Users },
                ]}
            />,
        );

        expect(screen.getByRole('heading', { name: 'Your teaching day' })).toBeInTheDocument();
        expect(screen.getByText('24')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /open materials/i })).toHaveAttribute('href', '/teacher/materials');

        await user.click(screen.getByRole('button', { name: /review students/i }));
        expect(onAction).toHaveBeenCalledOnce();
    });

    it('exposes a clear landmark and heading hierarchy without naming decorative icons', () => {
        const { container } = render(<TodayDashboard {...dashboardProps} />);

        const dashboard = screen.getByRole('region', { name: 'Your teaching day' });
        expect(dashboard).toContainElement(screen.getByRole('heading', { level: 1, name: 'Your teaching day' }));
        expect(screen.getByRole('heading', { level: 2, name: 'Your priorities' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 2, name: 'Quick actions' })).toBeInTheDocument();
        expect(screen.getByRole('article')).toHaveAccessibleName('Students: 24');
        expect(container.querySelectorAll('svg:not([aria-hidden="true"])')).toHaveLength(0);
    });

    it('keeps the responsive visual layout contract stable', () => {
        const { container } = render(<TodayDashboard {...dashboardProps} />);

        expect(container.querySelector('.today-hero')).toHaveClass('today-hero');
        expect(container.querySelector('.today-metrics')).toHaveClass('today-metrics');
        expect(screen.getByRole('article')).toHaveClass('today-card');
        expect(screen.getByRole('link', { name: /open materials/i })).toHaveClass('today-action');
        expect(container.querySelector('.grid.gap-5')).toHaveClass('lg:grid-cols-[1.35fr_1fr]');
    });
});
