export async function readJsonResponse<T extends Record<string, unknown> = Record<string, unknown>>(
    response: Response,
): Promise<T | null> {
    const body = await response.text();
    if (!body.trim()) return null;

    try {
        const parsed: unknown = JSON.parse(body);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as T : null;
    } catch {
        return null;
    }
}
