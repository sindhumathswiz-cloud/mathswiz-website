import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/MathRenderer', () => ({ default: ({ content }: { content: string }) => <span>{content}</span> }));

import SmartbookPlayer, { answerKind, type PlayerQuestion } from './SmartbookPlayer';

const mcq: PlayerQuestion = { id: 'q1', content: 'What is 2+2?', type: 'SINGLE_CHOICE', options: ['3', '4', '5', '6'], printedNumber: '1', sourcePageStart: 238 };
const proof: PlayerQuestion = { id: 'q2', content: 'Prove that x = x.', type: 'SUBJECTIVE', options: [], printedNumber: '2', sourcePageStart: 239 };

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

const renderPlayer = (mode: 'student' | 'teacher', questions = [mcq, proof], extra = {}) => render(
  <SmartbookPlayer mode={mode} backHref="/back" backLabel="Xam Idea" eyebrow="Integrals" title="Multiple choice" pages={[238, 239]}
    pageImageUrl={(p) => `/img/${p}`} questions={questions} storageKey="test:index" defaultView="practice" {...extra} />,
);

describe('SmartbookPlayer (student)', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); window.localStorage.clear(); });
  afterEach(() => vi.unstubAllGlobals());

  it('shows one question at a time, checks the answer on the server, and puts the solution right below', async () => {
    renderPlayer('student');
    expect(screen.getByText('What is 2+2?')).toBeInTheDocument();
    expect(screen.queryByText('Prove that x = x.')).toBeNull();

    fetchMock
      .mockImplementationOnce(() => json(200, { isCorrect: false }))
      .mockImplementationOnce(() => json(200, { correctAnswer: 'B', explanation: 'Because 2+2 is 4.' }));
    fireEvent.click(screen.getByTestId('option-A'));
    fireEvent.click(screen.getByTestId('submit-answer'));

    const solution = await screen.findByTestId('smartbook-solution-q1');
    expect(solution).toHaveTextContent('(B) 4');
    expect(solution).toHaveTextContent('Because 2+2 is 4.');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/student/practice/submit');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ questionId: 'q1', selectedOption: 'A' });
    expect(screen.getByTestId('smartbook-progress')).toHaveTextContent('1 answered · 0 right');
    // The palette marks it wrong.
    expect(within(screen.getByRole('navigation', { name: 'Questions' })).getByRole('button', { name: 'Question 1' }).className).toContain('bg-rose-500');

    fireEvent.click(screen.getByTestId('next-question'));
    expect(screen.getByText('Prove that x = x.')).toBeInTheDocument();
  });

  it('shows a written question\'s solution on request, for self-checking', async () => {
    renderPlayer('student', [proof]);
    fetchMock.mockImplementationOnce(() => json(200, { correctAnswer: null, explanation: 'Reflexivity.' }));
    fireEvent.click(screen.getByTestId('show-solution'));
    expect(await screen.findByTestId('smartbook-solution-q2')).toHaveTextContent('Reflexivity.');
    expect(fetchMock).toHaveBeenCalledWith('/api/student/smartbook/questions/q2/solution');
  });

  it('moves with the palette, and shows the printed page on request', () => {
    renderPlayer('student');
    fireEvent.click(screen.getByRole('button', { name: 'Question 2' }));
    expect(screen.getByText('Prove that x = x.')).toBeInTheDocument();
    expect(screen.queryByAltText('Page 239')).toBeNull();
    fireEvent.click(screen.getByTestId('toggle-page'));
    expect(screen.getByAltText('Page 239')).toHaveAttribute('src', '/img/239');
  });

  it('remembers where the student stopped', () => {
    window.localStorage.setItem('test:index', '1');
    renderPlayer('student');
    expect(screen.getByText('Prove that x = x.')).toBeInTheDocument();
  });
});

describe('SmartbookPlayer (teacher)', () => {
  it('shows the answer and solution at once, with the teacher\'s own tools', () => {
    renderPlayer('teacher', [{ ...mcq, correctAnswer: 'B', explanation: 'Four.' }], { renderTeacherTools: (q: PlayerQuestion) => <button type="button">Bookmark {q.id}</button> });
    expect(screen.getByTestId('smartbook-solution-q1')).toHaveTextContent('Four.');
    expect(screen.getByRole('button', { name: 'Bookmark q1' })).toBeInTheDocument();
    expect(screen.queryByTestId('submit-answer')).toBeNull();
  });
});

describe('SmartbookPlayer (reader view)', () => {
  // jsdom has no canvas drawing.
  beforeEach(() => { window.localStorage.clear(); vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
  const renderReader = () => render(
    <SmartbookPlayer mode="student" backHref="/back" backLabel="Xam Idea" eyebrow="Integrals" title="Multiple choice" pages={[238, 239]}
      readerPages={[236, 237, 238, 239, 240, 241]} pageImageUrl={(p) => `/img/${p}`} questions={[mcq, { ...proof, sourcePageStart: 240 }]} storageKey="test:index" />,
  );

  it("shows every page of the chapter one below another, at the question's page, with a blank whiteboard beside", () => {
    renderReader();
    const pages = screen.getByTestId('reader-pages');
    expect(within(pages).getAllByRole('img').map((img) => img.getAttribute('src'))).toEqual(['/img/236', '/img/237', '/img/238', '/img/239', '/img/240', '/img/241']);
    expect(screen.getByTestId('reader-page')).toHaveTextContent('Page 238');
    expect(screen.getByTestId('reader-page')).toHaveTextContent('pp. 236–241');
    expect(screen.getByTestId('whiteboard')).toHaveAttribute('data-strokes', '0');
    expect(screen.getByTestId('tab-board')).toHaveAttribute('aria-selected', 'true');
  });

  it("lists the questions in a tab, and picking one goes to its page", () => {
    renderReader();
    fireEvent.click(screen.getByTestId('tab-questions'));
    expect(screen.queryByTestId('whiteboard')).toBeNull();
    expect(screen.getByText('What is 2+2?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Question 2' }));
    expect(screen.getByText('Prove that x = x.')).toBeInTheDocument();
    expect(screen.getByTestId('reader-page')).toHaveTextContent('Page 240');
    fireEvent.click(screen.getByTestId('tab-board'));
    expect(screen.getByTestId('whiteboard')).toBeInTheDocument();
  });

  it('zooms the pages, and remembers practice view on this device', () => {
    renderReader();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('125%')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('view-practice'));
    expect(screen.getByTestId('toggle-page')).toBeInTheDocument();
    expect(window.localStorage.getItem('smartbook:view')).toBe('practice');
  });

  it("reads the exercise's own pages when no chapter pages are given", () => {
    render(<SmartbookPlayer mode="student" backHref="/back" backLabel="Xam Idea" eyebrow="Integrals" title="Multiple choice" pages={[238, 239]}
      pageImageUrl={(p) => `/img/${p}`} questions={[mcq]} storageKey="test:index" />);
    expect(within(screen.getByTestId('reader-pages')).getAllByRole('img')).toHaveLength(2);
  });
});

describe('answerKind', () => {
  it('tells choice, numerical and written questions apart', () => {
    expect(answerKind(mcq)).toBe('choice');
    expect(answerKind({ type: 'INTEGER', options: [] })).toBe('number');
    expect(answerKind(proof)).toBe('written');
  });
});
