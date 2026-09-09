function comparable(value: unknown): string {
    return String(value ?? '').toLowerCase().replace(/[\s$\\{}]/g, '');
}

export function parseQuestionOptions(value: unknown): string[] {
    let parsed = value;
    if (typeof value === 'string') {
        if (!value.trim()) return [];
        try {
            parsed = JSON.parse(value);
        } catch {
            return [];
        }
    }

    if (!Array.isArray(parsed)) return [];
    return parsed
        .map(option => {
            if (typeof option === 'string' || typeof option === 'number') return String(option).trim();
            if (option && typeof option === 'object') {
                const item = option as Record<string, unknown>;
                return String(item.text ?? item.value ?? item.label ?? '').trim();
            }
            return '';
        })
        .filter(Boolean);
}

export function resolveCorrectOptionIndex(correctAnswer: unknown, options: unknown[]): number {
    const answer = String(correctAnswer ?? '').trim();
    const letter = answer.match(/^\(?([A-Da-d])\)?[.):]?$/);
    if (letter) {
        const index = letter[1].toUpperCase().charCodeAt(0) - 65;
        return index < options.length ? index : -1;
    }

    const normalizedAnswer = comparable(answer);
    return options.findIndex(option => comparable(option) === normalizedAnswer);
}

export function extractClaimedAnswerIndex(explanation: unknown): number | null {
    const text = String(explanation ?? '');
    const patterns = [
        /(?:correct|right)\s+option\s+(?:is\s+)?\(?([A-D])\)?/i,
        /(?:correct|right)\s+answer\s+(?:is\s+)?option\s+\(?([A-D])\)?/i,
        /(?:correct|right)\s+answer\s+(?:is\s+)?\(?([A-D])\)?(?=\s*(?:[.):,;]|$))/i,
        /option\s+\(?([A-D])\)?\s+is\s+(?:the\s+)?correct/i,
        /hence\b[^.]{0,120}?\boption\s+\(?([A-D])\)?/i,
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return match[1].toUpperCase().charCodeAt(0) - 65;
    }
    return null;
}
