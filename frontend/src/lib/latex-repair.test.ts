import { describe, expect, it } from 'vitest';
import { dropUnmatchedLeftRight, fieldRenders, fixDoubledBackslashes, fixSwallowedBackslashes, readingSkeleton, removeStrayDollars, repairLatexField } from './latex-repair';

describe('fieldRenders', () => {
  it('accepts sound math and plain text, and rejects odd delimiters and unknown commands', () => {
    expect(fieldRenders('')).toBe(true);
    expect(fieldRenders('No maths here.')).toBe(true);
    expect(fieldRenders('Find $\\frac{d y}{d x}$ if $y=x^2$.')).toBe(true);
    expect(fieldRenders('Find $\\frac{d y}{d x}$ if $y=x^2.')).toBe(false);
    expect(fieldRenders('$\\undefinedcmd{x}$')).toBe(false);
  });
});

describe('removeStrayDollars', () => {
  it('removes the extra $ left around a display block, and nothing else', () => {
    const broken = 'Show that\n$$\n\\begin{aligned}\nx&=1\n\\end{aligned}\n$$$ done';
    const fixed = removeStrayDollars(broken);
    expect(fixed).not.toBeNull();
    expect(fieldRenders(fixed!)).toBe(true);
    expect(fixed!.replace(/\$/g, '')).toBe(broken.replace(/\$/g, ''));
  });

  it('repairs the "inline close, display open" run of four dollars by removing the fewest', () => {
    const broken = 'Given $a=b$$$$\\begin{aligned}x&=1\\end{aligned}$$$Integrating';
    const fixed = removeStrayDollars(broken);
    expect(fixed).not.toBeNull();
    expect(fieldRenders(fixed!)).toBe(true);
    expect(broken.length - fixed!.length).toBeLessThanOrEqual(2);
  });

  it('returns null rather than guess when no deletion helps', () => {
    expect(removeStrayDollars('$\\undefinedcmd{x}$$')).toBeNull();
    expect(removeStrayDollars('plain text')).toBeNull();
  });
});

describe('escape fixes', () => {
  it('restores a backslash that a form feed swallowed in front of "rac"', () => {
    expect(fixSwallowedBackslashes('$\\left(\frac{1}{x}\\right)$')).toBe('$\\left(\\frac{1}{x}\\right)$');
    expect(fixSwallowedBackslashes('$\\left(rac{1}{x}\\right)$')).toBe('$\\left(\\frac{1}{x}\\right)$');
    // A real \frac and an ordinary word are left alone.
    expect(fixSwallowedBackslashes('$\\frac{1}{x}$ and the word brac{')).toBe('$\\frac{1}{x}$ and the word brac{');
  });

  it('collapses a doubled backslash in front of a command, but not a real line break', () => {
    expect(fixDoubledBackslashes('A=\\\\int_0^1 \\\\frac{1}{2}dx')).toBe('A=\\int_0^1 \\frac{1}{2}dx');
    expect(fixDoubledBackslashes('a=1 \\\\\nb=2')).toBe('a=1 \\\\\nb=2');
  });
});

describe('dropUnmatchedLeftRight', () => {
  it('pairs what the renderer leaves after it drops an invisible bracket', () => {
    const out = dropUnmatchedLeftRight('\\left. \\frac{d y}{d x}\\right]_{x=1}');
    expect(out).toBe(' \\frac{d y}{d x}]_{x=1}');
  });

  it('keeps a matched pair and drops a lone one, keeping its bracket', () => {
    expect(dropUnmatchedLeftRight('\\left( a \\right)')).toBe('\\left( a \\right)');
    expect(dropUnmatchedLeftRight('a \\right) b')).toBe('a ) b');
    expect(dropUnmatchedLeftRight('\\left[ a b')).toBe('[ a b');
  });
});

describe('repairLatexField', () => {
  it('leaves a field that already renders exactly as it is', () => {
    const ok = 'Find $\\frac{d y}{d x}$.';
    expect(repairLatexField(ok)).toEqual({ text: ok, changed: false, fixes: [], stillBroken: false });
  });

  it('repairs a closing bracket left without its opener', () => {
    const broken = 'Evaluate $$\\left. \\frac{d y}{d x}\\right]_{x=1}$$ at the point.';
    const result = repairLatexField(broken);
    expect(result.stillBroken).toBe(false);
    expect(result.changed).toBe(true);
    expect(fieldRenders(result.text)).toBe(true);
    expect(result.fixes).toContain('removed unmatched \\left/\\right');
  });

  it('reports stray-delimiter repairs by name, and changes nothing but delimiters', () => {
    const broken = 'Show\n$$\n\\begin{aligned}x&=1\\end{aligned}\n$$$ done';
    const result = repairLatexField(broken);
    expect(result.stillBroken).toBe(false);
    expect(result.fixes).toContain('removed stray $ delimiters');
    expect(readingSkeleton(result.text)).toBe(readingSkeleton(broken));
  });

  it('gives back the original, flagged as still broken, when it cannot be fixed safely', () => {
    const hopeless = 'Let $\\undefinedcmd{x}$ be given.';
    expect(repairLatexField(hopeless)).toEqual({ text: hopeless, changed: false, fixes: [], stillBroken: true });
  });

  it('never invents or rewords: the reading skeleton is unchanged by any accepted repair', () => {
    const samples = [
      'Given $a=b$$$$\\begin{aligned}x&=1\\end{aligned}$$$Integrating',
      '$$A=\\\\int_0^1 \\\\frac{1}{2}dx$$',
      'Evaluate $$\\left. \\frac{d y}{d x}\\right]_{x=1}$$',
    ];
    for (const sample of samples) {
      const result = repairLatexField(sample);
      if (!result.stillBroken) expect(readingSkeleton(result.text)).toBe(readingSkeleton(sample));
    }
  });
});
