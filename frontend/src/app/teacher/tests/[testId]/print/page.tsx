import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import MathRenderer from '@/components/MathRenderer';
import { requireTeacherPremium, requireTeacherSession } from '@/lib/teacher-guard';
import { buildExamSections, examMaxFromSections, instructionRows } from '@/lib/exam-view';
import { findExamPattern, markingLabel } from '@/lib/exam-patterns';
import { answerKeyLines, answerLinesFor, optionList, paperShapeOf, printedNumbering } from '@/lib/paper-layout';
import PrintControls from './PrintControls';

export const dynamic = 'force-dynamic';

const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 14mm; }
  body * { visibility: hidden !important; }
  .paper, .paper * { visibility: visible !important; }
  .paper { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; padding: 0 !important; background: #fff !important; color: #000 !important; }
  .no-print { display: none !important; }
  .keep-together { break-inside: avoid; }
  .page-break { break-before: page; }
}
`;

/**
 * A printable question paper for a test the teacher owns: sections, marks and
 * instructions as the student sees them on screen, room to write where the answer
 * is written, and (only on request) an answer key on its own page.
 */
export default async function PrintPaperPage({ params, searchParams }: { params: Promise<{ testId: string }>; searchParams: Promise<{ key?: string }> }) {
  const locked = await requireTeacherPremium('Printed papers are locked', 'Premium teachers can print any test they have built.');
  if (locked) return <div className="min-h-screen bg-slate-50 dark:bg-background p-8">{locked}</div>;
  const session = await requireTeacherSession();
  const { testId } = await params;
  const { key } = await searchParams;
  const withKey = key === '1';

  const test = await prisma.test.findFirst({
    where: { id: testId, createdById: (session.user as any).id },
    include: {
      sections: {
        include: {
          questions: {
            orderBy: { orderIndex: 'asc' },
            include: { question: { select: { id: true, content: true, options: true, type: true, correctAnswer: true } } },
          },
        },
      },
    },
  });
  if (!test) notFound();

  const sections = buildExamSections(test.sections);
  const rows = instructionRows(sections);
  const pattern = findExamPattern(test.examPattern);
  const maxMarks = examMaxFromSections(sections);
  const keyLines = withKey ? answerKeyLines(test.sections.map((s) => ({ title: s.title, questions: s.questions.map((q) => ({ ...q.question, choiceGroup: q.choiceGroup })) }))) : [];

  return (
    <div className="mx-auto max-w-4xl p-6 md:p-10">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <PrintControls testId={test.id} withKey={withKey} />

      <article className="paper bg-white p-8 text-slate-900 shadow-sm md:p-12 dark:bg-white">
        <header className="mb-6 border-b-2 border-slate-900 pb-4 text-center">
          <h1 className="font-display text-2xl font-black">{test.title}{withKey ? ' (teacher copy)' : ''}</h1>
          {pattern && <p className="mt-1 text-sm font-semibold text-slate-600">{pattern.name}</p>}
          <p className="mt-2 flex flex-wrap justify-center gap-x-8 text-sm font-bold">
            <span>Time: {test.duration} minutes</span>
            <span>Maximum marks: {maxMarks}</span>
          </p>
          {!withKey && <p className="mt-3 flex justify-between text-sm"><span>Name: ______________________________</span><span>Date: ______________</span></p>}
        </header>

        <section className="keep-together mb-8 text-sm">
          <h2 className="mb-2 font-black uppercase tracking-wider">General instructions</h2>
          <ul className="list-disc space-y-1 pl-5">
            {rows.map((row) => (
              <li key={row.title}>
                <b>{row.title}</b>: {row.questions} question{row.questions === 1 ? '' : 's'}{row.rule ? ` (${row.rule.toLowerCase()})` : ''}, {row.marking}; {row.maxMarks} marks.
              </li>
            ))}
          </ul>
        </section>

        {test.sections.map((section, sectionIndex) => {
          const built = sections[sectionIndex];
          const numbering = printedNumbering(section.questions);
          return (
            <section key={section.id} className="mb-10">
              <h2 className="mb-1 border-b border-slate-400 pb-1 font-display text-lg font-black">{section.title}</h2>
              <p className="mb-4 text-xs font-semibold text-slate-600">
                {markingLabel(built)}{built.attemptLimit ? ` · attempt any ${built.attemptLimit} of ${built.questionIds.length}` : ''}
                {section.instructions ? ` · ${section.instructions}` : ''}
              </p>
              <ol className="space-y-6">
                {section.questions.map(({ question }, index) => {
                  const shape = paperShapeOf(question.type);
                  const options = optionList(question.options);
                  const printed = numbering[index];
                  return (
                    <li key={question.id} className="keep-together">
                      {printed.orBefore && <p className="mb-4 text-center text-sm font-black tracking-[0.3em]">OR</p>}
                      <div className="flex gap-3">
                      <span className="w-8 shrink-0 text-sm font-black">{printed.orBefore ? '' : printed.number}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] leading-relaxed"><MathRenderer content={question.content} /></div>
                        <span className="mt-1 block text-right text-xs font-bold text-slate-500">[{built.marksPerQuestion} mark{built.marksPerQuestion === 1 ? '' : 's'}]</span>
                        {shape === 'CHOICE' && options.length > 0 && (
                          <ol className="mt-2 grid grid-cols-1 gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
                            {options.map((option, i) => (
                              <li key={i} className="flex gap-2"><span className="font-black">({String.fromCharCode(65 + i)})</span><MathRenderer content={option} /></li>
                            ))}
                          </ol>
                        )}
                        {shape === 'NUMERICAL' && <p className="mt-3 text-sm">Answer: ______________________</p>}
                        {shape === 'WRITTEN' && (
                          <div className="mt-3" aria-hidden>
                            {Array.from({ length: answerLinesFor(built.marksPerQuestion) }).map((_, i) => <div key={i} className="h-7 border-b border-slate-300" />)}
                          </div>
                        )}
                      </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}

        {withKey && (
          <section className="page-break">
            <h2 className="mb-3 font-display text-lg font-black">Answer key</h2>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-400 text-left text-xs uppercase tracking-wider"><th className="py-1">Section</th><th>Question</th><th>Answer</th></tr></thead>
              <tbody>
                {keyLines.map((line, i) => (
                  <tr key={i} className="border-b border-slate-200"><td className="py-1">{line.section}</td><td>{line.number}</td><td className="font-bold">{line.answer}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </article>
    </div>
  );
}
