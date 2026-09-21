import ReconciliationReportClient from './ReconciliationReportClient';

export default async function BookReconciliationPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  return <ReconciliationReportClient bookId={bookId} />;
}
