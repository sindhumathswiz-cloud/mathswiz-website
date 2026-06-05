import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface MathRendererProps {
    content: string;
}

export function sanitizeLatex(text: string): string {
    let result = text;

    // Step 1: Convert Mathpix delimiters to remark-math compatible ones
    // \( ... \) → $ ... $   and   \[ ... \] → $$ ... $$
    result = result.replace(/\\\(/g, '$').replace(/\\\)/g, '$');
    result = result.replace(/\\\[/g, '$$').replace(/\\\]/g, '$$');

    // Step 2: Replace pmatrix with bmatrix (KaTeX supports bmatrix)
    result = result.replace(/\\begin{pmatrix}/g, '\\begin{bmatrix}');
    result = result.replace(/\\end{pmatrix}/g, '\\end{bmatrix}');

    // Step 2a: Fix bare column-spec environments. Mathpix/LLM sometimes drop the
    // 'array' and use the column spec as the env name (\begin{ccc}, \begin{l}),
    // or mismatch \begin{ccc}...\end{array}. KaTeX errors ("No such environment").
    // [lcr|]+ only matches column specs, never a real env (array, cases, matrix…).
    result = result.replace(/\\begin\{([lcr|]+)\}/g, '\\begin{array}{$1}');
    result = result.replace(/\\end\{([lcr|]+)\}/g, '\\end{array}');

    // Step 2b: Wrap bare aligned/gathered environments in display math
    result = result.replace(/(?<!\$\$)\s*\\begin{aligned}([\s\S]*?)\\end{aligned}(?!\s*\$\$)/g, '\n$$\\begin{aligned}$1\\end{aligned}$$\n');
    result = result.replace(/(?<!\$\$)\s*\\begin{gathered}([\s\S]*?)\\end{gathered}(?!\s*\$\$)/g, '\n$$\\begin{gathered}$1\\end{gathered}$$\n');
    result = result.replace(/(?<!\$\$)\s*\\begin{align}([\s\S]*?)\\end{align}(?!\s*\$\$)/g, '\n$$\\begin{aligned}$1\\end{aligned}$$\n');
    result = result.replace(/(?<!\$\$)\s*\\begin{align\*}([\s\S]*?)\\end{align\*}(?!\s*\$\$)/g, '\n$$\\begin{aligned}$1\\end{aligned}$$\n');

    // Step 2c: Normalize display math. remark-math only treats $$...$$ as a
    // display block when the $$ are on their OWN lines — inline
    // "$$\begin{aligned}...\end{aligned}$$" silently fails to render (KaTeX gets
    // the body without its wrapper → red error). Put every $$ on its own line.
    // Also wrap bare &-alignment in an aligned env so KaTeX accepts it.
    result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_full: string, innerRaw: string) => {
      let inner = innerRaw.trim();
      if (inner.includes('&') && !/\\begin\{/.test(inner)) {
        inner = `\\begin{aligned}${inner}\\end{aligned}`;
      }
      return `\n\n$$\n${inner}\n$$\n\n`;
    });

    // Step 3: Add \limits to common operators for vertical alignment
    result = result.replace(/\\lim_\{/g, '\\lim\\limits_{');
    result = result.replace(/\\sum_\{/g, '\\sum\\limits_{');
    result = result.replace(/\\int_\{/g, '\\int\\limits_{');
    result = result.replace(/\\prod_\{/g, '\\prod\\limits_{');

    // Step 4: Fix Mathpix \\n artifact — OCR reads \\ + newline as \\n
    result = result.replace(/\\\\n/g, '\\\\');

    // Step 5: Convert piecewise functions: \left\{\begin{array}{ll}...\end{array}\right. → \begin{cases}...\end{cases}
    // Handle with and without \right. at the end
    result = result.replace(
      /\\left\\\{\s*\\begin\{array\}\{[lrc]+\}([\s\S]*?)\\end\{array\}\s*\\right\./g,
      '\\begin{cases}$1\\end{cases}'
    );
    result = result.replace(
      /\\left\\\{\s*\\begin\{array\}\{[lrc]+\}([\s\S]*?)\\end\{array\}/g,
      '\\begin{cases}$1\\end{cases}'
    );

    // Step 6: Remove stray \left. or \right. that KaTeX sometimes chokes on
    result = result.replace(/\\left\./g, '').replace(/\\right\./g, '');

    // Step 7: Fix common Mathpix LaTeX issues
    // \cosec → \operatorname{cosec} (KaTeX doesn't have \cosec)
    result = result.replace(/\\cosec/g, '\\operatorname{cosec}');
    // \text { with space before brace → \text{ (KaTeX requires no space)
    result = result.replace(/\\text\s+\{/g, '\\text{');
    result = result.replace(/\\textbf\s+\{/g, '\\textbf{');
    result = result.replace(/\\textit\s+\{/g, '\\textit{');
    result = result.replace(/\\mathrm\s+\{/g, '\\mathrm{');
    result = result.replace(/\\displaystyle\s+\{/g, '\\displaystyle{');
    // Remove \, followed by nothing useful
    result = result.replace(/\\,\s*(?=[^a-zA-Z])/g, ' ');
    // Fix \, \! \; \: at end of math
    result = result.replace(/(\\[,;:\!])\s+([}\])])/g, '$1$2');

    return result;
}

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
