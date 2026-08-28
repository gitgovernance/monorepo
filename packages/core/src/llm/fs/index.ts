/**
 * LLM provider — Node-only implementations.
 *
 * Spec: fs_llm_provider_module.md
 *
 * Everything here reaches `node:child_process`, directly (CliLlmProvider) or by
 * constructing something that does (resolveLlmProvider). That is why it ships from
 * `@gitgov/core/fs` and not from the root entrypoint: the root must stay importable
 * by runtime-agnostic consumers, and the EARS-CI02 guardrail enforces it.
 *
 * @example
 * ```typescript
 * // Contract and runtime-agnostic implementation from the root
 * import type { ILlmProvider } from '@gitgov/core';
 *
 * // Resolver and CLI implementation from this subpath
 * import { resolveLlmProvider, CliLlmProvider } from '@gitgov/core/fs';
 * ```
 */

export { resolveLlmProvider } from './resolve';
export { CliLlmProvider } from './cli_llm_provider';
export type { CliLlmProviderConfig, AgentJsonResult } from './cli_llm_provider';
