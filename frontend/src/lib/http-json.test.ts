import { describe, expect, it } from 'vitest';
import { readJsonResponse } from './http-json';

describe('readJsonResponse', () => {
    it('parses a JSON object', async () => {
        await expect(readJsonResponse(new Response('{"success":true}'))).resolves.toEqual({ success: true });
    });

    it('returns null for an empty response', async () => {
        await expect(readJsonResponse(new Response(null, { status: 204 }))).resolves.toBeNull();
    });

    it('returns null for malformed or non-object JSON', async () => {
        await expect(readJsonResponse(new Response('<html>Error</html>'))).resolves.toBeNull();
        await expect(readJsonResponse(new Response('[]'))).resolves.toBeNull();
    });
});
