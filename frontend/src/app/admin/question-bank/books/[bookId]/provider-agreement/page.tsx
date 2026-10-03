import ProviderAgreementClient from './ProviderAgreementClient';

export default async function ProviderAgreementPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  return <ProviderAgreementClient bookId={bookId} />;
}
