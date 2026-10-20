import { ImportsOnStagingNotice } from '@/components/admin/ContentRoleNotice';

export const dynamic = 'force-dynamic';

export default function BulkImportLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ImportsOnStagingNotice />
      {children}
    </>
  );
}
