const LATEX_COMMAND_PATTERN = /\\(?:frac|sqrt|int|sum|prod|lim|log|ln|sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|coth|arcsin|arccos|arctan|deg|det|dim|exp|gcd|hom|inf|inj|ker|Pr|sup|liminf|limsup|min|max|arg|deg|bmod|pmod|choose|binom|overset|underset|stackrel|implies|iff|to|mapsto|times|div|pm|mp|cdot|circ|bullet|star|dagger|ddagger|cap|cup|vee|wedge|oplus|otimes|ominus|oslash|odot|bigcap|bigcup|bigvee|bigwedge|bigoplus|bigotimes|bigodot|leftarrow|rightarrow|Leftarrow|Rightarrow|leftrightarrow|Leftrightarrow|longleftarrow|longrightarrow|Longleftarrow|Longrightarrow|longleftrightarrow|Longleftrightarrow|uparrow|downarrow|Uparrow|Downarrow|updownarrow|Updownarrow|nearrow|searrow|swarrow|nwarrow|mapsto|longmapsto|hookleftarrow|hookrightarrow|le|ge|neq|approx|sim|cong|equiv|propto|prec|succ|preceq|succeq|subset|supset|subseteq|supseteq|cap|cup|setminus|neg|lnot|land|lor|forall|exists|nexists|top|bot|emptyset|varnothing|aleph|hbar|imath|jmath|ell|wp|Re|Im|partial|nabla|Box|Diamond|triangle|angle|measuredangle|sphericalangle|surd|prime|backprime|cancel|bcancel|xcancel|sout)\b/;

const UNICODE_MATH_REGEX = /[\u2200-\u22FF\u2A00-\u2AFF\u1D400-\u1D7FF\u2100-\u214F]/;

function isInline(text: string): boolean {
  return !text.includes('\n\n') && text.length < 200;
}

function hasDelimiters(text: string): boolean {
  return /\$[^$]+\$/.test(text) || /\$\$[^$]+\$\$/.test(text);
}

function containsLatex(text: string): boolean {
  return LATEX_COMMAND_PATTERN.test(text) || UNICODE_MATH_REGEX.test(text);
}

function isAlreadyDelimited(text: string, start: number, end: number): boolean {
  const before = text.substring(Math.max(0, start - 1), start);
  const after = text.substring(end, Math.min(text.length, end + 1));
  return before === '$' || after === '$';
}

export function sanitizeLatex(text: string | null | undefined): string {
  if (!text) return text ?? '';
  let result = text;

  // Step 1: Normalize all delimiter styles to standard $ / $$
  result = result.replace(/\\\(/g, '$').replace(/\\\)/g, '$');
  result = result.replace(/\\\[/g, '$$').replace(/\\\]/g, '$$');
  result = result.replace(/\\\(/g, '$');

  // Step 2: Fix unmatched delimiters
  const singleDollarMatches = result.match(/\$/g);
  if (singleDollarMatches && singleDollarMatches.length % 2 !== 0) {
    const positions: number[] = [];
    let idx = -1;
    while ((idx = result.indexOf('$', idx + 1)) !== -1) positions.push(idx);
    if (positions.length > 1) {
      const diff = positions[positions.length - 1] - positions[positions.length - 2];
      if (diff === 1) {
        result = result.slice(0, positions[positions.length - 2]) + '$$' + result.slice(positions[positions.length - 1] + 1);
      }
    }
  }

  const doubleDollarMatches = result.match(/\$\$/g);
  if (doubleDollarMatches && doubleDollarMatches.length % 2 !== 0) {
    result = result.replace(/\$\$$/, '');
  }

  // Step 3: Find bare LaTeX commands not wrapped in delimiters and wrap them
  const segments: string[] = [];
  let lastEnd = 0;
  const dollarRegex = /(\$\$?[^$]*\$\$?)/g;
  let dollarMatch: RegExpExecArray | null;

  while ((dollarMatch = dollarRegex.exec(result)) !== null) {
    if (dollarMatch.index > lastEnd) {
      segments.push(result.substring(lastEnd, dollarMatch.index));
    }
    segments.push(dollarMatch[0]);
    lastEnd = dollarMatch.index + dollarMatch[0].length;
  }
  if (lastEnd < result.length) {
    segments.push(result.substring(lastEnd));
  }

  const wrapped = segments.map(seg => {
    if (seg.startsWith('$')) return seg;
    if (!containsLatex(seg)) return seg;
    const trimmed = seg.trim();
    if (!trimmed) return seg;
    if (isAlreadyDelimited(result, result.indexOf(seg), result.indexOf(seg) + seg.length)) return seg;
    if (isInline(seg)) {
      return seg.replace(/^(\s*)(.*?)(\s*)$/, `$1$${trimmed}$3`);
    }
    return `$$\n${seg.trim()}\n$$`;
  });

  result = wrapped.join('');

  // Step 4: Fix common KaTeX-incompatible commands
  result = result.replace(/\\(cosec|cosec)\b/g, '\\operatorname{cosec}');
  result = result.replace(/\\(cot|cot)\b/g, '\\cot');
  result = result.replace(/\\text\s*\{/g, '\\text{');

  // Step 5: Remove stray backslashes before normal punctuation (not part of LaTeX)
  result = result.replace(/\\([.,!?;:])/g, '$1');

  return result;
}
