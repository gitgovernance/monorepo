/**
 * ID Parsing Utilities for GitGov Records
 *
 * Functions for extracting information from record IDs and file paths.
 * Complements id_generator.ts (which creates IDs).
 *
 * @module utils/id_parser
 */

import type { GitGovRecordType } from '../record_types';

/**
 * Mapping from directory names to entity types.
 */
const DIR_TO_TYPE: Record<string, Exclude<GitGovRecordType, 'custom'>> = {
  'tasks': 'task',
  'cycles': 'cycle',
  'executions': 'execution',
  'feedbacks': 'feedback',
  'actors': 'actor',
  'agents': 'agent'
};

/**
 * Valid directory names for GitGov records.
 */
const VALID_DIRS = Object.keys(DIR_TO_TYPE);

/**
 * Extracts the record ID from a file path.
 *
 * @param filePath - Path to a record file (e.g., '.gitgov/tasks/123-task-foo.json')
 * @returns The record ID without extension (e.g., '123-task-foo')
 *
 * @example
 * extractRecordIdFromPath('.gitgov/tasks/123-task-foo.json') // '123-task-foo'
 * extractRecordIdFromPath('/abs/path/.gitgov/actors/human_dev.json') // 'human_dev'
 */
export function extractRecordIdFromPath(filePath: string): string {
  const parts = filePath.split('/');
  const filename = parts[parts.length - 1] || '';
  return filename.replace('.json', '');
}

/**
 * Extracts the entity type from a file path based on directory name.
 *
 * @param filePath - Path to a record file (e.g., '.gitgov/tasks/123.json')
 * @returns The entity type or null if not found
 *
 * @example
 * getEntityTypeFromPath('.gitgov/tasks/123.json') // 'task'
 * getEntityTypeFromPath('.gitgov/actors/human_dev.json') // 'actor'
 * getEntityTypeFromPath('/some/other/path.json') // null
 */
export function getEntityTypeFromPath(filePath: string): Exclude<GitGovRecordType, 'custom'> | null {
  const pathParts = filePath.split('/');
  const typeDirIndex = pathParts.findIndex(part => VALID_DIRS.includes(part));

  if (typeDirIndex >= 0) {
    const dirName = pathParts[typeDirIndex];
    return dirName ? DIR_TO_TYPE[dirName] || null : null;
  }

  return null;
}

/**
 * Infers the entity type from a record ID pattern.
 *
 * Uses ID naming conventions:
 * - `{timestamp}-exec-*` or `*-execution-*` → execution
 * - `{timestamp}-feedback-*` → feedback
 * - `{timestamp}-cycle-*` or `cycle:*` → cycle
 * - `{timestamp}-task-*` or `task:*` → task
 * - `human:*` or `human_*` → actor
 * - `agent:*` or `agent_*` → agent
 *
 * @param recordId - The record ID to analyze
 * @returns The inferred entity type (defaults to 'task' if unknown)
 *
 * @example
 * inferEntityTypeFromId('1234567890-exec-commit') // 'execution'
 * inferEntityTypeFromId('human:developer') // 'actor'
 * inferEntityTypeFromId('agent:code-reviewer') // 'agent'
 * inferEntityTypeFromId('1234567890-task-implement-auth') // 'task'
 */
export function inferEntityTypeFromId(recordId: string): Exclude<GitGovRecordType, 'custom'> {
  // Execution patterns
  if (recordId.match(/^\d+-exec-/) || recordId.includes('-execution-')) {
    return 'execution';
  }

  // Feedback pattern
  if (recordId.match(/^\d+-feedback-/)) {
    return 'feedback';
  }

  // Cycle patterns
  if (recordId.match(/^\d+-cycle-/) || recordId.startsWith('cycle:')) {
    return 'cycle';
  }

  // Task patterns
  if (recordId.match(/^\d+-task-/) || recordId.startsWith('task:')) {
    return 'task';
  }

  // Actor patterns (human)
  if (recordId.startsWith('human:') || recordId.startsWith('human_')) {
    return 'actor';
  }

  // Agent patterns
  if (recordId.startsWith('agent:') || recordId.startsWith('agent_')) {
    return 'agent';
  }

  // Default to task
  return 'task';
}

/**
 * Valid prefixes for timestamp-based record IDs.
 */
const VALID_PREFIXES = ['task', 'cycle', 'exec', 'feedback'] as const;

/**
 * Parses a timestamp-based record ID (e.g., '12345-task-slug') into its components.
 *
 * @param id - The record ID to parse
 * @returns Parsed components or null if invalid format
 *
 * @example
 * parseTimestampedId('1234567890-task-implement-auth')
 * // { timestamp: 1234567890, prefix: 'task', slug: 'implement-auth' }
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
 *
 * @param id - The actor ID to parse
 * @returns Parsed components or null if invalid format
 *
 * @example
 * parseActorId('human:camilo-velandia') // { type: 'human', slug: 'camilo-velandia' }
 * parseActorId('agent:code-reviewer') // { type: 'agent', slug: 'code-reviewer' }
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
 * Validates the format of a timestamp-based record ID.
 *
 * @param id - The record ID to validate
 * @returns True if valid format, false otherwise
 *
 * @example
 * isValidTimestampedId('12345-task-valid-slug') // true
 * isValidTimestampedId('123-badprefix-slug') // false
 */
export function isValidTimestampedId(id: string): boolean {
  const parsed = parseTimestampedId(id);
  if (!parsed) return false;

  // Check if prefix is valid and slug is not empty
  return VALID_PREFIXES.includes(parsed.prefix as typeof VALID_PREFIXES[number]) && parsed.slug.length > 0;
}
