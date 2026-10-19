import { describe, expect, it } from 'vitest';
import { answersAgree, composeDraft, normaliseAnswer, notDraftableReason, parseSolverReply, solverPrompts } from './solution-draft';

const mcq = { type: 'SINGLE_CHOICE', content: 'The principal value of $\\sin^{-1}\\left(-\\frac{1}{2}\\right)$ is', options: ['$-\\frac{\\pi}{6}$', '$\\frac{\\pi}{6}$', '$\\frac{\\pi}{3}$', '$-\\frac{\\pi}{3}$'], correctAnswer: '', explanation: '' };
const SOLUTION = 'Since $\\sin\\left(-\\frac{\\pi}{6}\\right)=-\\frac{1}{2}$ and $-\\frac{\\pi}{6}$ lies in $\\left[-\\frac{\\pi}{2},\\frac{\\pi}{2}\\right]$, the principal value is $-\\frac{\\pi}{6}$.';
const reply = (finalAnswer: string, solution = SOLUTION) => ({ finalAnswer, solution });

describe('parseSolverReply', () => {
  it('reads the tagged plain-text format, which is what the models are asked for', () => {
    const raw = 'FINAL_ANSWER: $\\tan x + C$\nSOLUTION:\nSimplify first.\n\\[\\int \\sec^2 x \\, dx = \\tan x + C\\]\nSo the answer is \\(\\tan x + C\\).';
    const parsed = parseSolverReply(raw)!;
    expect(parsed.finalAnswer).toBe('$\\tan x + C$');
    // \[ \] and \( \) become the $$ and $ the question bank uses, so the solution renders everywhere.
    expect(parsed.solution).toContain('$$\n\\int \\sec^2 x \\, dx = \\tan x + C\n$$');
    expect(parsed.solution).toContain('$\\tan x + C$.');
    expect(parsed.solution).not.toContain('\\[');
    expect(parseSolverReply('final_answer: B\n\nsolution:\n')).toEqual({ finalAnswer: 'B', solution: '' });
    expect(parseSolverReply('FINAL_ANSWER: **12**')).toEqual({ finalAnswer: '12', solution: '' });
  });

  it('reads JSON, including fenced JSON and a numeric answer, and refuses anything else', () => {
    expect(parseSolverReply('{"final_answer":"B","solution":"x"}')).toEqual({ finalAnswer: 'B', solution: 'x' });
    expect(parseSolverReply('```json\n{"final_answer": 12, "solution": ""}\n```')).toEqual({ finalAnswer: '12', solution: '' });
    expect(parseSolverReply('not json')).toBeNull();
    expect(parseSolverReply('{"final_answer":"  "}')).toBeNull();
    expect(parseSolverReply(null)).toBeNull();
  });
});

describe('normaliseAnswer and answersAgree', () => {
  it('turns a multiple-choice answer into a letter whether it was given as a letter or the option text', () => {
    expect(normaliseAnswer('SINGLE_CHOICE', 'a', mcq.options)).toBe('A');
    expect(normaliseAnswer('SINGLE_CHOICE', '(C)', mcq.options)).toBe('C');
    expect(normaliseAnswer('SINGLE_CHOICE', '$\\frac{\\pi}{6}$', mcq.options)).toBe('B');
    expect(normaliseAnswer('SINGLE_CHOICE', 'E', mcq.options)).toBeNull();
    expect(normaliseAnswer('SINGLE_CHOICE', 'UNANSWERABLE', mcq.options)).toBeNull();
  });

  it('compares numbers as numbers, and refuses a numerical answer that is not a number', () => {
    expect(answersAgree('INTEGER', '12', '12.0', null)).toBe(true);
    expect(answersAgree('INTEGER', '-3.5', ' -3.50 ', null)).toBe(true);
    expect(answersAgree('INTEGER', '12', '13', null)).toBe(false);
    expect(normaliseAnswer('INTEGER', 'about 12', null)).toBeNull();
    expect(normaliseAnswer('INTEGER', '\\frac{1}{2}', null)).toBeNull();
  });

  it('compares True/False and written results by compact form', () => {
    expect(answersAgree('TRUE_FALSE', 'true', 'T', null)).toBe(true);
    expect(answersAgree('TRUE_FALSE', 'true', 'false', null)).toBe(false);
    expect(answersAgree('SHORT_ANSWER', '$\\frac{1}{2}$', '\\frac{1}{2}', null)).toBe(true);
    expect(answersAgree('SHORT_ANSWER', '\\frac{1}{2}', '\\frac{1}{3}', null)).toBe(false);
  });
});

describe('notDraftableReason', () => {
  it('only drafts questions whose sole problem is the missing answer or explanation', () => {
    expect(notDraftableReason(['MISSING_ANSWER', 'MISSING_EXPLANATION'], mcq)).toBeNull();
    expect(notDraftableReason(['MISSING_DATA'], mcq)).toMatch(/other problems/);
    expect(notDraftableReason(['LATEX_RENDER'], mcq)).toMatch(/other problems/);
    expect(notDraftableReason([], { ...mcq, options: [] })).toBe('no options');
    expect(notDraftableReason([], { ...mcq, content: 'Find x' })).toMatch(/too short/);
  });
});

describe('composeDraft', () => {
  it('accepts an answer and a solution when two models independently agree', () => {
    const { draft } = composeDraft(mcq, reply('A'), reply('$-\\frac{\\pi}{6}$', ''));
    expect(draft).toMatchObject({ tier: 'VERIFIED', answer: 'A', explanation: SOLUTION });
  });

  it('keeps nothing when the models disagree, or there is no second opinion, or the model says it cannot answer', () => {
    expect(composeDraft(mcq, reply('A'), reply('B')).skipped).toBe('the two models disagree');
    expect(composeDraft(mcq, reply('A'), null).skipped).toMatch(/second opinion/);
    expect(composeDraft(mcq, reply('UNANSWERABLE'), reply('A')).skipped).toMatch(/cannot be answered/);
    expect(composeDraft(mcq, null, null).skipped).toMatch(/no usable reply/);
  });

  it('adds a solution to a question that already has an answer only if the solution reaches that answer', () => {
    const withAnswer = { ...mcq, correctAnswer: 'A' };
    expect(composeDraft(withAnswer, reply('A'), null).draft).toMatchObject({ tier: 'VERIFIED', explanation: SOLUTION });
    expect(composeDraft(withAnswer, reply('A'), null).draft?.answer).toBeUndefined();
    expect(composeDraft(withAnswer, reply('C'), null).skipped).toMatch(/stored answer may be wrong/);
  });

  it('never overwrites an explanation that is already there', () => {
    const complete = { ...mcq, correctAnswer: 'A', explanation: 'Already a real worked solution here.' };
    expect(composeDraft(complete, reply('A'), null).skipped).toBe('nothing to add');
  });

  it('drafts a written question with no stored answer, labelled as a single model\'s work', () => {
    const written = { type: 'SHORT_ANSWER', content: 'Find the derivative of $x^{2}$ with respect to $x$ and explain each step.', options: null, correctAnswer: '', explanation: '' };
    const { draft } = composeDraft(written, reply('2x', 'Using the power rule, $\\frac{d}{dx}x^{2}=2x$, because the exponent comes down and reduces by one. So the derivative is $2x$.'), null);
    expect(draft?.tier).toBe('SINGLE_MODEL');
    expect(draft?.explanation).toContain('power rule');
    expect(draft?.answer).toBeUndefined();
  });

  it('refuses a written solution whose result cannot be matched to the stored answer', () => {
    const written = { type: 'SHORT_ANSWER', content: 'Find the derivative of $x^{2}$ with respect to $x$ and explain each step.', options: null, correctAnswer: '2x', explanation: '' };
    expect(composeDraft(written, reply('3x', 'A long enough worked solution that ends at the wrong result, three x, for certain.'), null).skipped).toMatch(/could not be checked/);
  });

  it('keeps a verified answer but drops a solution that will not render', () => {
    const { draft } = composeDraft(mcq, reply('A', 'So the value is $\\undefinedcmd{x}$ and this goes on for a while to be long enough to count as a solution.'), reply('A'));
    expect(draft).toMatchObject({ tier: 'VERIFIED', answer: 'A' });
    expect(draft?.explanation).toBeUndefined();
    expect(draft?.notes.join(' ')).toMatch(/did not render/);
  });
});

describe('solverPrompts', () => {
  it('asks for an option letter on multiple choice and lists the options, and for a bare number on numerical questions', () => {
    const m = solverPrompts(mcq, { withSolution: true });
    expect(m.system).toContain('letter of the correct option');
    expect(m.system).toContain('FINAL_ANSWER:');
    expect(m.user).toContain('A. $-\\frac{\\pi}{6}$');
    const n = solverPrompts({ ...mcq, type: 'INTEGER', options: null }, { withSolution: false });
    expect(n.system).toContain('single number');
    expect(n.system).toContain('leave the SOLUTION section empty');
  });
});
