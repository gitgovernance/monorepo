// [PROJ-F2] Default agent registry — single source of truth for agent configs.
// purpose, function and metadata come from each agent's package.json `gitgov.agent` field (the
// PROJ-F2 test compares them); displayName and triggers are this registry's own — no package declares them.
// The SaaS imports this instead of hardcoding agent configs.

import type { DefaultAgentConfig } from './project_module.types';

export const DEFAULT_AGENTS: DefaultAgentConfig[] = [
  {
    packageName: '@gitgov/core',
    agentId: 'agent:gitgov-audit',
    displayName: 'GitGov Audit',
    // Runtime-only engine, ON PURPOSE (schema: only `type` is required; ARUN-M1: local
    // without entrypoint is valid-not-locally-verifiable). This agent is never dispatched:
    // AuditOrchestrator discovers purpose 'audit' only, and the orchestration this record
    // names is implemented by scan_orchestrator (SaaS) and audit-command (CLI). The record
    // is the signing IDENTITY for automated scans (SCAN-J1, G21). It used to declare
    // entrypoint 'packages/core/dist/index.mjs' + function 'orchestrateAudit' — a file and
    // a function that never existed — which made every `gitgov init` warn that the
    // product's own agent was not runnable (PROJ-B6).
    engine: { type: 'local', runtime: 'typescript' },
    purpose: 'orchestration',
    triggers: [
      { type: 'manual', command: 'gitgov audit' },
      { type: 'webhook', event: 'pull_request.opened' },
      { type: 'webhook', event: 'pull_request.synchronize' },
    ],
    metadata: { description: 'Product agent — signs automated TaskRecords' },
  },
  // source: packages/agents/security-audit/package.json → gitgov.agent
  {
    packageName: '@gitgov/agent-security-audit',
    agentId: 'agent:security-audit',
    displayName: 'Security Audit',
    // [PROJ-F2] No `runtime`: LocalBackend runs it before the entrypoint, and no RuntimeHandler is
    // registered in production, so the agent never ran (0 findings on init → audit, 2026-09-13).
    engine: { type: 'local', entrypoint: '@gitgov/agent-security-audit', function: 'runAgent' },
    purpose: 'audit',
    triggers: [],
    metadata: { target: 'code', outputFormat: 'sarif' },
  },
  // source: packages/agents/review-advisor/package.json → gitgov.agent
  {
    packageName: '@gitgov/agent-review-advisor',
    agentId: 'agent:review-advisor',
    displayName: 'Review Advisor',
    // [PROJ-F2] No `runtime`, same reason as security-audit above.
    engine: { type: 'local', entrypoint: '@gitgov/agent-review-advisor', function: 'runReviewAdvisor' },
    purpose: 'review',
    triggers: [],
    // [PROJ-F2] Mirrors the package.json. `{ target: 'findings', outputFormat: 'feedback-review' }`
    // lived here from 2026-05-04 and was never in the package; nothing read either field.
    metadata: { defaultModel: 'anthropic/claude-sonnet-4-6' },
  },
];
