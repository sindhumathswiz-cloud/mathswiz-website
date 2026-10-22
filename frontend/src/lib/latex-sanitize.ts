/**
 * Pure LaTeX cleanup, extracted from components/MathRenderer.tsx so it can
 * be imported without pulling in that file's CSS side-effect import
 * ('katex/dist/katex.min.css') and React/remark/rehype dependencies --
 * question-qa.ts needs this logic for its own deterministic checks, and a
 * plain Node script (e.g. scripts/sweep-approved-gates.ts) needs to import
 * question-qa.ts without a bundler in the loop to resolve the CSS import.
 */
// A backslash command whose "\r", "\t", "\f", "\b" or "\v" was turned into a control character on its way through
// JSON ("\right" stored as a carriage return + "ight"): the control character and the letters that follow it.
const BROKEN_ESCAPES: Array<[RegExp, string]> = [
    [/\r(?=(?:ight|ho|angle|ceil|floor|brace|brack)\b|ight[([{|.\\])/g, '\\r'],
    [/\t(?=(?:imes|heta|an|anh|ext|extbf|extit|o|au|riangle|frac|ilde|op|herefore)\b|ext\{|frac\{)/g, '\\t'],
    [/\f(?=(?:rac|orall)\b|rac\{)/g, '\\f'],
    [/\x08(?=(?:eta|egin|ar|inom|ig|igg|mod|oldsymbol|ot|ox|ullet|ecause|eta)\b|egin\{|inom\{|oldsymbol\{|ar\{)/g, '\\b'],
    [/\v(?=(?:ec|ee|arphi|ert|dots|arepsilon|arrho|artheta)\b|ec\{)/g, '\\v'],
];

/**
 * Inline maths that closes and opens again with nothing between ("so $x = 1$$\begin{aligned}...$") reads as a
 * display-math "$$" and pairs every later "$" wrongly. Only a "$$" met while an inline formula is open is split into
 * "$ $"; a real "$$ ... $$" display block is left alone.
 */
function splitTouchingInlineMath(text: string): string {
    return text.split('\n').map((line) => {
        let inInline = false;
        let inDisplay = false;
        return line.replace(/\$\$|\$/g, (mark) => {
            if (mark === '$$') {
                if (inInline) return '$ $';
                inDisplay = !inDisplay;
                return mark;
            }
            if (!inDisplay) inInline = !inInline;
            return mark;
        });
    }).join('\n');
}

/**
 * Wraps a bare aligned/gathered/align environment in maths ("$$" in a replacement string is one "$") -- only outside
 * any $...$ or $$...$$. (A bare matrix, array or cases environment is left to step 6c, which wraps the whole run of
 * text it sits in, so "\frac{1}{24}\left[\begin{array}...\end{array}\right]" stays one formula.)
 */
function wrapBareEnvironments(text: string): string {
    return text.split(/(\$\$[\s\S]*?\$\$|\$[^$]*?\$)/g).map((seg) => {
        if (seg.startsWith('$')) return seg;
        return seg
            .replace(/\s*\\begin{aligned}([\s\S]*?)\\end{aligned}/g, '\n$$\\begin{aligned}$1\\end{aligned}$$\n')
            .replace(/\s*\\begin{gathered}([\s\S]*?)\\end{gathered}/g, '\n$$\\begin{gathered}$1\\end{gathered}$$\n')
            .replace(/\s*\\begin{align}([\s\S]*?)\\end{align}/g, '\n$$\\begin{aligned}$1\\end{aligned}$$\n')
            .replace(/\s*\\begin{align\*}([\s\S]*?)\\end{align\*}/g, '\n$$\\begin{aligned}$1\\end{aligned}$$\n');
    }).join('');
}

export function sanitizeLatex(text: string): string {
    let result = text;

    // Step 0: Restore backslash commands a broken escape turned into control characters, and split inline formulas
    // that touch ("$x$$y$"), before any step below reads the $ delimiters.
    for (const [re, fix] of BROKEN_ESCAPES) result = result.replace(re, fix);
    result = splitTouchingInlineMath(result);

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

    // Step 2b: Wrap bare aligned/gathered environments in display math.
    // Guard against ANY enclosing $ (single or double), not just $$ --
    // Mathpix snip OCR (PageSnipTool's extraction) commonly wraps each
    // \begin{aligned}...\end{aligned} block in single-$ inline delimiters
    // (e.g. "(i)$\begin{aligned}...\end{aligned}$(ii)$..."), which is
    // already valid (KaTeX supports aligned inline). The old $$-only
    // lookbehind/lookahead didn't recognize that as "already wrapped" and
    // injected a redundant $$...$$ around it, corrupting the delimiter
    // nesting ("(i)$\n$$\begin{aligned}...\end{aligned}$$\n$(ii)$...") and
    // producing a KaTeX parse error / red error text. Deciding "enclosed" by
    // the character right before \begin also missed the standard layout
    // "$$\n\begin{aligned}...\end{aligned}\n$$" (a line break in between), and
    // wrapped those blocks again; whether a block is enclosed is now read from
    // the text's own $ / $$ runs.
    result = wrapBareEnvironments(result);

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

    // Step 6b: Convert literal \n (backslash + n) to actual newlines
    result = result.replace(/\\n/g, '\n');

    // Step 6c: Auto-wrap bare LaTeX commands not already inside $...$ or $$...$$
    const LATEX_CMD = /\\(?:frac|dfrac|tfrac|cfrac|sqrt|int|sum|prod|lim|log|ln|sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|coth|arcsin|arccos|arctan|deg|det|dim|exp|gcd|hom|inf|inj|ker|Pr|sup|liminf|limsup|min|max|arg|bmod|pmod|choose|binom|overset|underset|stackrel|implies|iff|to|mapsto|times|div|pm|mp|cdot|circ|bullet|cap|cup|vee|wedge|oplus|otimes|ominus|oslash|odot|bigcap|bigcup|bigvee|bigwedge|bigoplus|bigotimes|bigodot|leftarrow|rightarrow|Leftarrow|Rightarrow|leftrightarrow|Leftrightarrow|longleftarrow|longrightarrow|Longleftarrow|Longrightarrow|longleftrightarrow|Longleftrightarrow|uparrow|downarrow|Uparrow|Downarrow|updownarrow|Updownarrow|mapsto|longmapsto|hookleftarrow|hookrightarrow|le|ge|neq|approx|sim|cong|equiv|propto|prec|succ|preceq|succeq|subset|supset|subseteq|supseteq|setminus|neg|lnot|land|lor|forall|exists|nexists|top|bot|emptyset|varnothing|aleph|hbar|imath|jmath|ell|wp|Re|Im|partial|nabla|triangle|angle|measuredangle|sphericalangle|surd|prime|backprime|cancel|bcancel|xcancel|sout|vec|hat|bar|dot|ddot|tilde|check|breve|acute|grave|widehat|widetilde|overrightarrow|overleftarrow|overleftrightarrow|underrightarrow|underleftarrow|underleftrightarrow|overline|underline|underbrace|overbrace|boxed|operatorname|text|textbf|textit|mathrm|displaystyle|limits|left|right|begin|end|bigl|bigr|Bigl|Bigr|biggl|biggr|Biggl|Biggr)\b/;
    const segments = result.split(/(\$\$[\s\S]*?\$\$|\$[^$]*?\$)/g);
    result = segments.map(seg => {
      if (seg.startsWith('$')) return seg;
      // Unicode symbols such as ∩ are valid text in Markdown.  Wrapping an
      // entire prose sentence just because it includes one of them turns any
      // percent sign in that sentence into a TeX comment (for example,
      // "P(A ∩ B) = 70% and P(B) = 85%" rendered only through "70").
      // Only actual LaTeX commands need an automatic math wrapper.
      if (LATEX_CMD.test(seg)) {
        return '$' + seg.trim() + '$';
      }
      return seg;
    }).join('');

    // Step 7: Fix common Mathpix LaTeX issues
    // \begin{matrix} → \begin{bmatrix} (KaTeX doesn't support matrix without amsmath)
    result = result.replace(/\\begin{matrix}/g, '\\begin{bmatrix}');
    result = result.replace(/\\end{matrix}/g, '\\end{bmatrix}');
    // Ensure \\ before \end{aligned}, \end{cases}, \end{array}, etc.
    result = result.replace(/([^\\])\\end\{(aligned|cases|array|bmatrix|matrix|gathered|align|align\*)\}/g, '$1\\\\\\end{$2}');
    // Remove stray empty display math $$ $$
    result = result.replace(/\$\$\s*\$\$/g, '');
    // \cosec → \operatorname{cosec} (KaTeX doesn't have \cosec)
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

    // Step 8: Balance braces — if there are more { than }, add missing } at end
    let open = 0;
    for (const ch of result) { if (ch === '{') open++; else if (ch === '}') open--; }
    if (open > 0) result += '}'.repeat(open);

    // Step 9: Second pass of auto-wrap (step 6c) for any bare LaTeX commands
    // that might have been exposed after delimiter conversion / environmental fixes.
    const segs2 = result.split(/(\$\$[\s\S]*?\$\$|\$[^$]*?\$)/g);
    result = segs2.map(seg => {
      if (seg.startsWith('$')) return seg;
      if (LATEX_CMD.test(seg)) {
        return '$' + seg.trim() + '$';
      }
      return seg;
    }).join('');

    // Step 10: Inside an inline $...$ formula that spans lines, join a line that
    // starts like a Markdown list item, quote or heading ("+ ", "- ", "* ",
    // "1. ", "> ", "#") to the line before: Markdown reads it as one even in
    // the middle of a formula ("...\\\n+ \vec{b} + \vec{c}"), which splits the
    // formula, so it shows as raw text. TeX ignores the line break ("\\" row
    // breaks stay); other lines and display $$ blocks are left as they are.
    result = result.split(/(\$\$[\s\S]*?\$\$)/g).map((seg) =>
      seg.startsWith('$$') ? seg : seg.replace(/\$[^$]+\$/g, (math) => math.replace(/[ \t]*\n[ \t]*(?=[-+*>#]\s|#|\d+[.)]\s)/g, ' '))
    ).join('');

    return result;
}
