/**
 * SessionStore - Session state persistence abstraction
 *
 * This module provides backend-agnostic access to GitGovernance session state
 * (.session.json). Session state is ephemeral, machine-local, and NOT versioned.
 *
 * IMPORTANT: This module only exports the interface.
 * For implementations, use:
 * - @gitgov/core/fs for FsSessionStore
 * - @gitgov/core/memory for MemorySessionStore
 *
 * @example
 * ```typescript
 * // Import interface and types
 * import type { SessionStore } from '@gitgov/core/session_store';
 *
 * // Import filesystem implementation from fs entry point
 * import { FsSessionStore } from '@gitgov/core/fs';
 *
 * // Import memory implementation from memory entry point
 * import { MemorySessionStore } from '@gitgov/core/memory';
 * ```
 */

// Interface only - NO implementation re-exports
export type { SessionStore } from './session_store';
