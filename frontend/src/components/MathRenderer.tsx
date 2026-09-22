import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { sanitizeLatex } from '@/lib/latex-sanitize';

interface MathRendererProps {
    content: string;
}

export { sanitizeLatex };

export default function MathRenderer({ content }: MathRendererProps) {
    const sanitizedContent = sanitizeLatex(content);

    return (
        <div className="math-renderer-container prose max-w-none">
            <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
            >
                {sanitizedContent}
            </ReactMarkdown>
        </div>
    );
}
