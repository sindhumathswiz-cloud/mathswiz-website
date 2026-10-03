import prisma from './prisma';
import { comparePages, type PageParity } from './page-parity';

export { comparePages, describePageList, type PageParity } from './page-parity';

export async function pageParity(sourceDocumentId: string, pdfPages: number): Promise<PageParity> {
  const rows = await prisma.documentPage.findMany({
    where: { documentId: sourceDocumentId },
    select: { pageNumber: true, pageImagePath: true, textLayer: true },
  });
  return comparePages(pdfPages, rows.map(row => ({ pageNumber: row.pageNumber, hasImage: Boolean(row.pageImagePath), hasText: row.textLayer != null })));
}
