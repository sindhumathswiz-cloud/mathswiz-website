import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { analyseAttempt, type AnalysisResponse } from '@/lib/exam-analysis';
import ExamQualityPanel from './ExamQualityPanel';

const sections = (negativeMarks: number) => [{ id: 's', title: 'Section A', marksPerQuestion: 4, negativeMarks, attemptLimit: null, questions: ['a', 'b', 'c', 'd'].map((questionId) => ({ questionId, choiceGroup: null })) }];
const row = (questionId: string, over: Partial<AnalysisResponse> = {}): AnalysisResponse => ({
  questionId, status: 'ANSWERED', isCorrect: true, marksAwarded: 4, timeSpent: 60, topic: 'Algebra', difficulty: 'EASY', isWritten: false, errorType: null, ...over,
});

describe('ExamQualityPanel', () => {
  it('shows the cost of negative marking, the break-even accuracy, guesses and marks within reach', () => {
    const analysis = analyseAttempt({
      sections: sections(1),
      responses: [
        row('a'),
        row('b', { isCorrect: false, marksAwarded: -1, timeSpent: 5, errorType: 'CARELESS' }),
        row('c', { isCorrect: false, marksAwarded: -1, timeSpent: 5, errorType: 'CARELESS' }),
        row('d', { status: 'SKIPPED', isCorrect: false, marksAwarded: 0, timeSpent: 0 }),
      ],
      medianTime: 60,
    });
    render(<ExamQualityPanel analysis={analysis} />);

    expect(screen.getByTestId('marks-deducted')).toHaveTextContent('−2');
    const negative = screen.getByTestId('negative-marking-card');
    expect(within(negative).getByRole('row', { name: /Section A/ })).toHaveTextContent('above 20%');
    expect(within(screen.getByTestId('guess-card')).getByText(/cost you 2 marks net/)).toBeInTheDocument();
    expect(screen.getByTestId('recoverable-total')).toHaveTextContent('14'); // 5 + 5 wrong easy, 4 for the blank
    expect(screen.getByRole('img', { name: 'Easy questions: 33% correct' })).toBeInTheDocument();
  });

  it('leaves out the negative-marking card when the paper has no penalty', () => {
    const analysis = analyseAttempt({ sections: sections(0), responses: [row('a'), row('b', { isCorrect: false, marksAwarded: 0, timeSpent: 60 })], medianTime: 60 });
    render(<ExamQualityPanel analysis={analysis} />);
    expect(screen.queryByTestId('negative-marking-card')).toBeNull();
    expect(screen.getByTestId('difficulty-card')).toBeInTheDocument();
  });

  it('renders nothing when there is nothing to analyse', () => {
    const analysis = analyseAttempt({ sections: [], responses: [], medianTime: 60 });
    const { container } = render(<ExamQualityPanel analysis={analysis} />);
    expect(container).toBeEmptyDOMElement();
  });
});
