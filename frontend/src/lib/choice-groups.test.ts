import { describe, expect, it } from 'vitest';
import { hasChoiceGroups, normalizeChoiceGroups, sanitizeChoiceGroups, slotCountOf, slotKeyOf, toggleAlternative } from './choice-groups';

const q = (id: string, choiceGroup: string | null = null) => ({ id, choiceGroup });
const groups = (items: Array<{ choiceGroup?: string | null }>) => items.map(i => i.choiceGroup ?? '-').join(',');

describe('choice groups', () => {
  it('counts a group of alternatives as one question slot', () => {
    const list = [q('a'), q('b', 'g1'), q('c', 'g1'), q('d')];
    expect(slotCountOf(list)).toBe(3);
    expect(slotKeyOf(q('b', 'g1'))).toBe(slotKeyOf(q('c', 'g1')));
    expect(slotKeyOf(q('a'))).not.toBe(slotKeyOf(q('d')));
    expect(hasChoiceGroups(list)).toBe(true);
    expect(hasChoiceGroups([q('a')])).toBe(false);
  });

  it('links a question to the one before it, and unlinks it again', () => {
    const linked = toggleAlternative([q('a'), q('b'), q('c')], 1, 'g1');
    expect(groups(linked)).toBe('g1,g1,-');
    expect(groups(toggleAlternative(linked, 1, 'g2'))).toBe('-,-,-');
  });

  it('extends an existing group, and unlinking the last member leaves a pair', () => {
    const pair = toggleAlternative([q('a'), q('b'), q('c')], 1, 'g1');
    const triple = toggleAlternative(pair, 2, 'g9');
    expect(groups(triple)).toBe('g1,g1,g1');
    expect(groups(toggleAlternative(triple, 2, 'x'))).toBe('g1,g1,-');
  });

  it('ignores the first question and out-of-range indexes', () => {
    const list = [q('a'), q('b')];
    expect(toggleAlternative(list, 0, 'g')).toBe(list);
    expect(toggleAlternative(list, 5, 'g')).toBe(list);
  });

  it('drops a group that a reorder split or a removal left alone', () => {
    expect(groups(normalizeChoiceGroups([q('a', 'g'), q('b'), q('c', 'g')]))).toBe('-,-,-');
    expect(groups(normalizeChoiceGroups([q('a', 'g'), q('b')]))).toBe('-,-');
    expect(groups(normalizeChoiceGroups([q('a', 'g'), q('b', 'g'), q('c')]))).toBe('g,g,-');
  });

  it('on the server, keeps only well-formed labels in runs of two or more', () => {
    const cleaned = sanitizeChoiceGroups([q('a', 'ok-1'), q('b', 'ok-1'), q('c', '<script>'), q('d', ' '), q('e', 'x'.repeat(50))]);
    expect(groups(cleaned)).toBe('ok-1,ok-1,-,-,-');
    expect(sanitizeChoiceGroups([{ id: 'a' }, { id: 'b', choiceGroup: 42 as unknown as string }]).map(x => x.choiceGroup)).toEqual([null, null]);
  });
});
