// [PROJ-F2] Default agent registry — single source of truth for agent configs.
// Config values come from each agent's package.json `gitgov.agent` field.
// The SaaS imports this instead of hardcoding agent configs.

import type { DefaultAgentConfig } from './project_module.types';

export const DEFAULT_AGENTS: DefaultAgentConfig[] = [
  {
    packageName: '@gitgov/core',
    agentId: 'agent:gitgov-audit',
    displayName: 'GitGov Audit',
    engine: { type: 'local', runtime: 'typescript', entrypoint: 'packages/core/dist/index.mjs', function: 'orchestrateAudit' },
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
    engine: { type: 'local', runtime: 'typescript', entrypoint: '@gitgov/agent-security-audit', function: 'runAgent' },
    purpose: 'audit',
    triggers: [],
    metadata: { target: 'code', outputFormat: 'sarif' },
  },
  // source: packages/agents/review-advisor/package.json → gitgov.agent
  {
    packageName: '@gitgov/agent-review-advisor',
    agentId: 'agent:review-advisor',
    displayName: 'Review Advisor',
    engine: { type: 'local', runtime: 'typescript', entrypoint: '@gitgov/agent-review-advisor', function: 'runReviewAdvisor' },
    purpose: 'review',
    triggers: [],
    metadata: { target: 'findings', outputFormat: 'feedback-review' },
  },
];
