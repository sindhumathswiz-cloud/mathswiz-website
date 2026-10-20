import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import TeacherQuestionTools from './TeacherQuestionTools';

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('TeacherQuestionTools', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
  afterEach(() => vi.unstubAllGlobals());

  it('bookmarks and un-bookmarks', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<TeacherQuestionTools questionId="q1" bookmarked={false} onBookmarkChange={onChange} newTestTitle="Integrals" />);
    fetchMock.mockImplementationOnce(() => json(200, { bookmarked: true }));
    fireEvent.click(screen.getByTestId('teacher-bookmark-q1'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(true));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/teacher/favorites');

    rerender(<TeacherQuestionTools questionId="q1" bookmarked onBookmarkChange={onChange} newTestTitle="Integrals" />);
    fetchMock.mockImplementationOnce(() => json(200, { bookmarked: false }));
    fireEvent.click(screen.getByTestId('teacher-bookmark-q1'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(false));
    expect(fetchMock.mock.calls[1]).toEqual(['/api/teacher/favorites?questionId=q1', { method: 'DELETE' }]);
  });

  it('adds the question to an unpublished test, listing only those', async () => {
    fetchMock.mockImplementation((url: string) => url === '/api/teacher/tests/list'
      ? json(200, { tests: [
          { id: 't-draft', title: 'Revision 1', isPublished: false, templateType: null, questionCount: 4 },
          { id: 't-live', title: 'Weekly test', isPublished: true, templateType: null, questionCount: 10 },
          { id: 't-template', title: 'Template', isPublished: false, templateType: 'WORKSHEET', questionCount: 3 },
        ] })
      : json(200, { test: { id: 't-draft', title: 'Revision 1' }, questionCount: 5 }));
    render(<TeacherQuestionTools questionId="q1" bookmarked={false} onBookmarkChange={() => {}} newTestTitle="Integrals" />);
    fireEvent.click(screen.getByTestId('add-to-test-q1'));
    const draft = await screen.findByRole('button', { name: /Revision 1/ });
    expect(screen.queryByText('Weekly test')).toBeNull();
    expect(screen.queryByText('Template')).toBeNull();
    fireEvent.click(draft);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/teacher/tests/collect', expect.objectContaining({ body: JSON.stringify({ questionId: 'q1', testId: 't-draft' }) })));
    expect(await screen.findByRole('link', { name: /Open .Revision 1./ })).toHaveAttribute('href', '/teacher/tests/t-draft/assign');
  });

  it('starts a new test with the question', async () => {
    fetchMock.mockImplementation((url: string) => url === '/api/teacher/tests/list'
      ? json(200, { tests: [] })
      : json(201, { test: { id: 't-new', title: 'Integrals' }, questionCount: 1 }));
    render(<TeacherQuestionTools questionId="q2" bookmarked={false} onBookmarkChange={() => {}} newTestTitle="Integrals" />);
    fireEvent.click(screen.getByTestId('add-to-test-q2'));
    expect(await screen.findByText(/None yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/teacher/tests/collect', expect.objectContaining({ body: JSON.stringify({ questionId: 'q2', newTitle: 'Integrals' }) })));
  });
});
