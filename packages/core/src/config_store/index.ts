/**
 * ConfigStore - Configuration persistence abstraction
 *
 * This module provides backend-agnostic access to GitGovernance configuration
 * (config.json). For session state, see SessionStore.
 *
 * IMPORTANT: This module only exports the interface.
 * For implementations, use:
 * - @gitgov/core/fs for FsConfigStore and factories
 * - @gitgov/core/memory for MemoryConfigStore
 *
 * @example
 * ```typescript
 * // Import interface and types
 * import type { ConfigStore } from '@gitgov/core';
 *
 * // Import filesystem implementation from fs entry point
 * import { FsConfigStore, createConfigManager } from '@gitgov/core/fs';
 *
 * // Import memory implementation from memory entry point
 * import { MemoryConfigStore } from '@gitgov/core/memory';
 * ```
 */

// Interface only - NO implementation re-exports
export type { ConfigStore, ProjectRootFinder } from './config_store';
