/**
 * LLM provider abstraction (G18).
 *
 * Spec: llm_provider_module.md
 *
 * This barrel only exports what is runtime-agnostic: the interface, its types, and
 * `AnthropicLlmProvider`, whose single value import is `await import('@anthropic-ai/sdk')`
 * and therefore never enters the static graph.
 *
 * NOTE: Node-only implementations are exported via subpath:
 * - @gitgov/core/fs -> resolveLlmProvider, CliLlmProvider, CliLlmProviderConfig, AgentJsonResult
 *
 * `resolveLlmProvider` lives there — not here — because it constructs `CliLlmProvider`
 * with a static import, so exporting it from the root dragged `node:child_process` into
 * `dist/src/index.js`. That was one of the violations reported by the EARS-CI02 guardrail
 * (`integration/guardrails/clean_exports.test.ts`).
 *
 * There is deliberately no `@gitgov/core/llm` subpath: subpaths in this package are named
 * after the backend/runtime they require (`/fs`, `/github`, `/prisma`, `/memory`), never
 * after a domain. `/fs` means Node-only, which is what a consumer needs to know.
 */

export type {
  ILlmProvider,
  LlmMessage,
  LlmTool,
  LlmResponse,
  LlmProviderConfig,
} from './llm_provider';
export { AnthropicLlmProvider } from './anthropic/anthropic_llm_provider';
