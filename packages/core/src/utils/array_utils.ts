/**
 * Array Utility Functions
 *
 * Generic helpers for array manipulation.
 *
 * @module utils/array_utils
 */

/**
 * Splits an array into chunks of a specified size.
 *
 * @param array - The array to split
 * @param size - Maximum size of each chunk
 * @returns Array of chunks
 *
 * @example
 * chunkArray([1, 2, 3, 4, 5], 2) // [[1, 2], [3, 4], [5]]
 * chunkArray(['a', 'b', 'c'], 3) // [['a', 'b', 'c']]
 * chunkArray([], 5) // []
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error('Chunk size must be greater than 0');
  }

  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
