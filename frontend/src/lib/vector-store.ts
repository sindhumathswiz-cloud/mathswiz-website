import prisma from './prisma';

export interface ChunkRecord {
  id: string;
  folderId: string;
  content: string;
  tags: string[];
  createdAt: Date;
}

export interface QuestionEmbeddingRecord {
  id: string;
  questionId: string;
  content: string;
  tags: string[];
  createdAt: Date;
}

export async function insertChunk(
  folderId: string,
  content: string,
  embedding: number[],
  tags: string[] = []
): Promise<string> {
  const id = crypto.randomUUID();
  const embeddingStr = `[${embedding.join(',')}]`;

  await prisma.$executeRawUnsafe(
    `INSERT INTO "DocumentChunk" (id, "folderId", content, tags, embedding, "createdAt")
     VALUES ($1, $2, $3, $4, $5::vector, NOW())`,
    id,
    folderId,
    content,
    tags,
    embeddingStr
  );

  return id;
}

export async function searchSimilar(
  embedding: number[],
  limit: number = 10,
  folderIds?: string[],
  tags?: string[]
): Promise<ChunkRecord[]> {
  const embeddingStr = `[${embedding.join(',')}]`;

  let query = `SELECT id, "folderId", content, tags, "createdAt"
               FROM "DocumentChunk"
               WHERE embedding IS NOT NULL`;

  if (folderIds && folderIds.length > 0) {
    const folderList = folderIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
    query += ` AND "folderId" IN (${folderList})`;
  }

  if (tags && tags.length > 0) {
    const tagConditions = tags.map(t => `'${t.replace(/'/g, "''")}' = ANY(tags)`).join(' OR ');
    query += ` AND (${tagConditions})`;
  }

  query += ` ORDER BY embedding <=> $1::vector LIMIT ${Math.min(limit, 100)}`;

  const results = await prisma.$queryRawUnsafe<ChunkRecord[]>(query, embeddingStr);
  return results;
}

export async function searchSimilarQuestions(
  embedding: number[],
  limit: number = 10,
  tags?: string[]
): Promise<QuestionEmbeddingRecord[]> {
  const embeddingStr = `[${embedding.join(',')}]`;

  let query = `SELECT id, "questionId", content, tags, "createdAt"
               FROM "QuestionEmbedding"
               WHERE embedding IS NOT NULL`;

  if (tags && tags.length > 0) {
    const tagConditions = tags.map(t => `'${t.replace(/'/g, "''")}' = ANY(tags)`).join(' OR ');
    query += ` AND (${tagConditions})`;
  }

  query += ` ORDER BY embedding <=> $1::vector LIMIT ${Math.min(limit, 100)}`;

  const results = await prisma.$queryRawUnsafe<QuestionEmbeddingRecord[]>(query, embeddingStr);
  return results;
}

export async function searchByTopic(
  topicName: string,
  limit: number = 10,
  folderIds?: string[]
): Promise<ChunkRecord[]> {
  const emb = (await import('./embeddings')).generateEmbedding;
  const embedding = await emb(topicName);
  return searchSimilar(embedding, limit, folderIds);
}

export async function getChunkCount(folderId: string): Promise<number> {
  const result = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*) as count FROM "DocumentChunk" WHERE "folderId" = $1`,
    folderId
  );
  return Number(result[0]?.count || 0);
}

export async function getQuestionEmbeddingCount(): Promise<number> {
  const result = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*) as count FROM "QuestionEmbedding"`
  );
  return Number(result[0]?.count || 0);
}

export async function deleteChunksForDocument(documentId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `DELETE FROM "DocumentChunk" WHERE "folderId" IN (
       SELECT id FROM "KnowledgeFolder"
       WHERE id IN (SELECT "folderId" FROM "KnowledgeDocument" WHERE id = $1)
     )`,
    documentId
  );
}
