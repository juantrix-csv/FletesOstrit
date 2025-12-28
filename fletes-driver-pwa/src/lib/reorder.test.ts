import { describe, it, expect } from 'vitest';
import { reorderList } from './reorder';

describe('reorderList', () => {
  it('moves item forward', () => {
    const result = reorderList(['a', 'b', 'c', 'd'], 1, 3);
    expect(result).toEqual(['a', 'c', 'd', 'b']);
  });

  it('moves item backward', () => {
    const result = reorderList([1, 2, 3, 4], 3, 0);
    expect(result).toEqual([4, 1, 2, 3]);
  });

  it('returns a copy when indices are equal', () => {
    const input = ['x', 'y'];
    const result = reorderList(input, 0, 0);
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
  });
});
