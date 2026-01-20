import { chunkArray } from './array_utils';

describe('Array Utils', () => {
  describe('chunkArray', () => {
    it('should split array into chunks of specified size', () => {
      expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('should return single chunk when size >= array length', () => {
      expect(chunkArray(['a', 'b', 'c'], 3)).toEqual([['a', 'b', 'c']]);
      expect(chunkArray(['a', 'b', 'c'], 5)).toEqual([['a', 'b', 'c']]);
    });

    it('should return empty array for empty input', () => {
      expect(chunkArray([], 5)).toEqual([]);
    });

    it('should handle single element array', () => {
      expect(chunkArray([1], 3)).toEqual([[1]]);
    });

    it('should throw error for size <= 0', () => {
      expect(() => chunkArray([1, 2, 3], 0)).toThrow('Chunk size must be greater than 0');
      expect(() => chunkArray([1, 2, 3], -1)).toThrow('Chunk size must be greater than 0');
    });

    it('should work with different types', () => {
      expect(chunkArray(['a', 'b', 'c', 'd'], 2)).toEqual([['a', 'b'], ['c', 'd']]);
      expect(chunkArray([{ id: 1 }, { id: 2 }, { id: 3 }], 2)).toEqual([[{ id: 1 }, { id: 2 }], [{ id: 3 }]]);
    });
  });
});
