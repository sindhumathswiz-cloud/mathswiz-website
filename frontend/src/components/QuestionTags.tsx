interface QuestionTagsProps {
    tags?: string[] | null;
    className?: string;
}

/**
 * Renders a question's provenance/topic tags (e.g. "CBSE 2016", "PYQ") as small
 * badges, shown right after the question content. Returns null when there are no
 * tags. Shared across every surface that displays a question.
 */
export default function QuestionTags({ tags, className = '' }: QuestionTagsProps) {
    const list = (tags || []).map(t => String(t).trim()).filter(Boolean);
    if (list.length === 0) return null;

    return (
        <div className={`flex flex-wrap gap-1.5 mt-3 ${className}`}>
            {list.map((tag, i) => (
                <span
                    key={`${tag}-${i}`}
                    className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-[11px] font-semibold border border-indigo-100"
                >
                    {tag}
                </span>
            ))}
        </div>
    );
}
