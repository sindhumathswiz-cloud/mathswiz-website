import { ImportsOnStagingNotice } from '@/components/admin/ContentRoleNotice';
import BookCatalogClient from './BookCatalogClient';

export const dynamic = 'force-dynamic';

export default function BookCatalogPage() {
  return (
    <>
      <ImportsOnStagingNotice />
      <BookCatalogClient />
    </>
  );
}
