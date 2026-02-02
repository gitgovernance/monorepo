/**
 * In-memory implementations (no filesystem required)
 *
 * This module exports all implementations that work without filesystem access.
 * Suitable for serverless environments, testing, and CI/CD.
 */

// Store
export { MemoryRecordStore } from './record_store/memory';

// ConfigStore
export { MemoryConfigStore } from './config_store/memory';

// SessionStore
export { MemorySessionStore } from './session_store/memory';

// KeyProvider
export { EnvKeyProvider, MockKeyProvider } from './key_provider/memory';
export type { EnvKeyProviderOptions, MockKeyProviderOptions } from './key_provider/memory';

// FileLister
export { MemoryFileLister } from './file_lister/memory';
export type { MemoryFileListerOptions } from './file_lister/memory';

// GitModule
export { MemoryGitModule } from './git/memory';
