import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QuestionFigures, { resetQuestionFigures } from './QuestionFigures';

describe('QuestionFigures', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    resetQuestionFigures();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('asks once for every question on the page and shows each its own figures', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ figures: { q1: [{ url: '/api/figures/page/f1', caption: null }], q2: [{ url: 'https://cdn.example/a.png', caption: 'Figure 2' }] } }) });
    render(<><QuestionFigures questionId="q1" /><QuestionFigures questionId="q2" /><QuestionFigures questionId="q3" /></>);
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/figures?questionIds=${encodeURIComponent('q1,q2,q3')}`);
    expect(screen.getByAltText('Figure 1 for this question')).toHaveAttribute('src', '/api/figures/page/f1');
    expect(screen.getByText('Figure 2')).toBeInTheDocument();
  });

  it('shows nothing when there are no figures or the request fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const { container } = render(<QuestionFigures questionId="q9" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="question-figures"]')).toBeNull();
  });
});
