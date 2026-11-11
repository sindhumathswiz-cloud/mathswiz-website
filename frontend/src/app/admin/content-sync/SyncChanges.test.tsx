import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Change } from '@/lib/content-sync/changes';
import SyncChanges from './SyncChanges';

const base = { questionLabel: null, changedFields: [] as string[] };
const changes: Change[] = [
  {
    ...base, table: 'Question', id: 'q1', direction: 'up', kind: 'updated', label: 'Evaluate the integral', questionId: 'q1', questionLabel: 'Evaluate the integral',
    changedFields: ['explanation', 'status'],
    fields: [
      { field: 'explanation', before: 'Old working', after: 'New working with $x^2$' },
      { field: 'status', before: 'REPORTED', after: 'APPROVED' },
    ],
  },
  { ...base, table: 'QuestionTag', id: 't1', direction: 'up', kind: 'new', label: '', questionId: 'q1', questionLabel: 'Evaluate the integral' },
  { ...base, table: 'PageFigure', id: 'f1', direction: 'up', kind: 'new', label: '', questionId: 'q1', questionLabel: 'Evaluate the integral' },
  {
    ...base, table: 'Question', id: 'q2', direction: 'up', kind: 'new', label: 'A brand new question', questionId: 'q2',
    fields: [{ field: 'content', before: null, after: 'A brand new question' }, { field: 'options', before: null, after: '["one","two"]' }],
  },
  { ...base, table: 'BookChapter', id: 'c1', direction: 'up', kind: 'updated', label: 'Chapter 3: Matrices', questionId: null, changedFields: ['orderIndex'] },
  { ...base, table: 'Question', id: 'q3', direction: 'down', kind: 'new', label: 'A teacher question', questionId: 'q3', fields: [] },
];

describe('SyncChanges', () => {
  it('lists the questions going live with what changed and what goes with them', () => {
    render(<SyncChanges changes={changes} applied={false} truncated={false} />);
    expect(screen.getByRole('tab', { name: /Going to live 5/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Evaluate the integral')).toBeInTheDocument();
    expect(screen.getByText('Changed: Solution, Status · with 1 tag, 1 figure')).toBeInTheDocument();
    expect(screen.getByText('reported → approved')).toBeInTheDocument();
    expect(screen.getByText('A brand new question')).toBeInTheDocument();
    expect(screen.queryByText('A teacher question')).not.toBeInTheDocument();
  });

  it('opens a question to compare it with what is live now', () => {
    render(<SyncChanges changes={changes} applied={false} truncated={false} />);
    fireEvent.click(screen.getByText('Evaluate the integral'));
    expect(screen.getByText('Live now')).toBeInTheDocument();
    expect(screen.getByText('After publishing')).toBeInTheDocument();
    expect(screen.getByText('Old working')).toBeInTheDocument();
    expect(screen.getByText(/New working with/)).toBeInTheDocument();
  });

  it('shows a new question without a before side, with its options listed', () => {
    render(<SyncChanges changes={changes} applied={false} truncated={false} />);
    fireEvent.click(screen.getAllByText('A brand new question')[0]);
    expect(screen.queryByText('Live now')).not.toBeInTheDocument();
    expect(screen.getByText('one')).toBeInTheDocument();
    expect(screen.getByText('two')).toBeInTheDocument();
  });

  it('lists books and other content, filters by search, and switches to what comes down', () => {
    render(<SyncChanges changes={changes} applied={false} truncated={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Books, pages and other content 1/ }));
    const row = screen.getByText('Chapter 3: Matrices').closest('tr')!;
    expect(within(row).getByText('Chapter')).toBeInTheDocument();
    expect(within(row).getByText('order index')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Questions/ }));
    fireEvent.change(screen.getByPlaceholderText('Search text or id'), { target: { value: 'integral' } });
    expect(screen.queryByText('A brand new question')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Coming down from live 1/ }));
    fireEvent.change(screen.getByPlaceholderText('Search text or id'), { target: { value: '' } });
    expect(screen.getByText('A teacher question')).toBeInTheDocument();
  });
});
