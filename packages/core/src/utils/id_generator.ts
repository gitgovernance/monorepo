/**
 * Sanitizes a string to be used in a GitGovernance ID slug.
 * Converts to lower-case, replaces spaces with hyphens, and removes invalid characters.
 */
function sanitizeForId(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 50); // Ensure slug is not too long
}

/**
 * Generates an Actor ID (e.g., 'human:camilo-velandia').
 */
export function generateActorId(type: 'human' | 'agent', displayName: string): string {
  const slug = sanitizeForId(displayName);
  return `${type}:${slug}`;
}

/**
 * Generates an Agent ID (e.g., 'agent:code-reviewer').
 * Convenience wrapper over generateActorId for agent-specific use cases.
 */
export function generateAgentId(displayName: string): string {
  return generateActorId('agent', displayName);
}

/**
 * Generates a Task ID (e.g., '12345-task-implement-auth').
 */
export function generateTaskId(title: string, timestamp: number): string {
  const slug = sanitizeForId(title);
  return `${timestamp}-task-${slug}`;
}

/**
 * Generates a Cycle ID (e.g., '12345-cycle-release-v1').
 */
export function generateCycleId(title: string, timestamp: number): string {
  const slug = sanitizeForId(title);
  return `${timestamp}-cycle-${slug}`;
}

/**
 * Generates an Execution ID (e.g., '12345-exec-commit-changes').
 */
export function generateExecutionId(title: string, timestamp: number): string {
  const slug = sanitizeForId(title);
  return `${timestamp}-exec-${slug}`;
}

/**
 * Generates a Changelog ID from title (Protocol v2.0.0).
 * 
 * Pattern: {timestamp}-changelog-{slug}
 * Example: '1752707800-changelog-sistema-autenticacion-v1'
 * 
 * This follows the official changelog_record_schema.yaml pattern for
 * Release Notes System that aggregates N tasks into 1 deliverable.
 */
export function generateChangelogId(title: string, timestamp: number): string {
  const slug = sanitizeForId(title);
  return `${timestamp}-changelog-${slug}`;
}

/**
 * Generates a Feedback ID (e.g., '12345-feedback-code-review').
 */
export function generateFeedbackId(title: string, timestamp: number): string {
  const slug = sanitizeForId(title);
  return `${timestamp}-feedback-${slug}`;
}
