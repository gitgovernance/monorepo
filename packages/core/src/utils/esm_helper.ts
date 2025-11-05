/**
 * ESM Helper - Provides access to import.meta for use in ESM contexts
 * 
 * This file is separated because import.meta cannot be used in Jest/CommonJS tests.
 * Jest will mock this module when running tests.
 */

/**
 * Get the current module URL (import.meta.url)
 * Returns null in non-ESM contexts (like Jest tests)
 */
export function getImportMetaUrl(): string | null {
  try {
    return import.meta.url;
  } catch {
    return null;
  }
}

