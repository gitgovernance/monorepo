import type { FindingDetector } from '@gitgov/core';

type FindingDetectorConfig = FindingDetector.FindingDetectorConfig;

/**
 * Internal detector configuration for the security-audit agent.
 * Defines which detectors are enabled and their settings.
 *
 * This config is NOT received as an external parameter.
 * The agent always uses this internal config (AORCH-B11).
 */

export type DetectorStage = {
  detector: 'regex' | 'heuristic' | 'llm';
  conditional: boolean;
};

export type SecurityAuditConfig = {
  /** Ordered pipeline of detector stages */
  pipeline: DetectorStage[];
  /** FindingDetectorConfig for SourceAuditorModule */
  detectorConfig: FindingDetectorConfig;
  /** Default exclude patterns for file scanning */
  defaultExclude: string[];
  /** Default include patterns for file scanning */
  defaultInclude: string[];
};

/**
 * Default configuration for MVP.
 * Only regex detector enabled — heuristic and llm stages come in Epic 3.
 */
export const DEFAULT_CONFIG: SecurityAuditConfig = {
  pipeline: [
    { detector: 'regex', conditional: false },
  ],
  detectorConfig: {
    regex: { enabled: true },
  },
  defaultExclude: [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/*.min.js',
    '**/package-lock.json',
    '**/pnpm-lock.yaml',
  ],
  defaultInclude: ['**/*'],
};
