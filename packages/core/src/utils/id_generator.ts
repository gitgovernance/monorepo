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
 * Generates a Changelog ID with entity type and slug (e.g., '12345-changelog-task-implement-auth').
 */
export function generateChangelogId(entityType: 'task' | 'cycle' | 'agent' | 'system' | 'configuration', entityId: string, timestamp: number): string {
  let entitySlug: string;

  // For system and configuration, use the entityId directly as slug
  if (entityType === 'system' || entityType === 'configuration') {
    entitySlug = sanitizeForId(entityId);
  } else {
    // For task, cycle, exec - extract slug from timestamped ID
    const parsed = parseTimestampedId(entityId);
    entitySlug = parsed ? parsed.slug : sanitizeForId(entityId);
  }

  return `${timestamp}-changelog-${entityType}-${entitySlug}`;
}

/**
 * Generates a Feedback ID (e.g., '12345-feedback-code-review').
 */
export function generateFeedbackId(title: string, timestamp: number): string {
  const slug = sanitizeForId(title);
  return `${timestamp}-feedback-${slug}`;
}

/**
 * Parses a timestamp-based record ID (e.g., '12345-task-slug') into its components.
 */
export function parseTimestampedId(id: string): { timestamp: number; prefix: string; slug: string } | null {
  if (typeof id !== 'string') return null;
  const match = id.match(/^(\d+)-(\w+)-(.+)$/);
  if (!match || !match[1] || !match[2] || !match[3]) {
    return null;
  }
  return {
    timestamp: parseInt(match[1], 10),
    prefix: match[2],
    slug: match[3],
  };
}

/**
 * Parses an Actor ID (e.g., 'human:camilo') into its components.
 */
export function parseActorId(id: string): { type: 'human' | 'agent'; slug: string } | null {
  if (typeof id !== 'string') return null;
  const parts = id.split(':');
  if (parts.length < 2 || (parts[0] !== 'human' && parts[0] !== 'agent')) {
    return null;
  }
  const type = parts[0] as 'human' | 'agent';
  const slug = parts.slice(1).join(':'); // Re-join in case slug contains ':'
  return { type, slug };
}

/**
 * Valid prefixes for timestamp-based record IDs.
 */
const VALID_PREFIXES = ['task', 'cycle', 'exec', 'changelog', 'feedback'] as const;

/**
 * Validates the format of a timestamp-based record ID.
 */
export function isValidTimestampedId(id: string): boolean {
  const parsed = parseTimestampedId(id);
  if (!parsed) return false;

  // Check if prefix is valid and slug is not empty
  return VALID_PREFIXES.includes(parsed.prefix as any) && parsed.slug.length > 0;
}
