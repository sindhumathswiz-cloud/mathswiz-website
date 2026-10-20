/**
 * Size of each chunk of a resumable book PDF upload (api/admin/books/[id]/upload-sessions). Each HTTP request for a
 * chunked upload should be small and fast -- the whole point of chunking large PDFs instead of one giant POST. 4MB
 * comfortably clears every platform request-body ceiling this app might run behind (Vercel's historical
 * serverless-function limit is far smaller than the app's own 250MB PDF cap), while keeping the chunk count
 * reasonable for a 250MB file (~63 chunks). Kept out of the route file: a route may only export its handlers.
 */
export const CHUNK_SIZE_BYTES = 4 * 1024 * 1024;
