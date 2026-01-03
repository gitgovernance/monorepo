/**
 * Filesystem-dependent implementations
 *
 * This module exports all implementations that require filesystem access.
 * Use @gitgov/core/memory for serverless/in-memory alternatives.
 */

// Store
export { FsStore } from './store/fs';

// KeyProvider
export { FsKeyProvider } from './key_provider/fs';
export type { FsKeyProviderOptions } from './key_provider/fs';
