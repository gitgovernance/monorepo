import { createFinding } from '@gitgov/core';
import type { Sarif, Finding, FindingSeverity, FindingCategory, Runner } from '@gitgov/core';
import type { SemgrepAgentDeps, SemgrepInput, SemgrepMetadata, SemgrepSummary } from './types';
import { SEMGREP_SEVERITY_MAP, SEMGREP_CATEGORY_MAP } from './types';

type SarifLog = Sarif.SarifLog;
type SarifResult = Sarif.SarifResult;
type AgentOutput = Runner.AgentOutput;

/**
 * Semgrep agent — processes semgrep CLI SARIF output, maps to gitgov Finding[],
 * rebuilds via SarifBuilder for stable fingerprints.
 */
export class SemgrepAgent {
  constructor(private readonly deps: SemgrepAgentDeps) {}

  // [SGP-A3] [SGP-E1] Returns AgentOutput with metadata.kind='sarif' and version='2.1.0'
  // [SGP-B1] [SGP-B2] [SGP-B4] [SGP-B5] [SGP-E2] Errors propagate to AgentRunner
  async run(input: SemgrepInput, semgrepSarif: SarifLog | null, error?: string): Promise<AgentOutput> {
    // [SGP-B2] Prerequisite check
    if (error && /command not found|not found/i.test(error)) {
      throw new Error(
        'semgrep not found. Install: pip install semgrep (or brew install semgrep). ' +
        'See: https://semgrep.dev/docs/getting-started/',
      );
    }

    // [SGP-B5] Timeout
    if (error === 'TIMEOUT') {
      throw new Error('semgrep timed out after scan. Increase timeout or reduce scope.');
    }

    // [SGP-B4] Real error
    if (error) {
      throw new Error(`semgrep error: ${error}`);
    }

    if (!semgrepSarif) {
      throw new Error('semgrep produced no SARIF output');
    }

    // [SGP-C1] [SGP-C5] Parse SARIF results and map to Finding[] (empty array if no results)
    const results = semgrepSarif.runs?.[0]?.results ?? [];
    const findings = this.mapResultsToFindings(results);

    // [SGP-C4] Rebuild SARIF via SarifBuilder with getLineContent for stable fingerprints
    const sarifLog = await this.deps.sarifBuilder.build({
      toolName: 'semgrep',
      toolVersion: '1.0.0',
      informationUri: 'https://semgrep.dev',
      findings,
      getLineContent: this.deps.getLineContent,
    });

    const summary = this.buildSummary(findings, results);

    const metadata: SemgrepMetadata = {
      kind: 'sarif',
      version: '2.1.0',
      data: sarifLog,
      summary,
    };

    return {
      message: `Semgrep scan completed: ${findings.length} findings`,
      metadata,
    };
  }

  // [SGP-C1] [SGP-C2] [SGP-C3] [SGP-C6]
  private mapResultsToFindings(results: SarifResult[]): Finding[] {
    return results.map((result, index) => {
      const location = result.locations?.[0]?.physicalLocation;
      const file = location?.artifactLocation?.uri ?? 'unknown';
      const line = location?.region?.startLine ?? 0;
      const snippet = location?.region?.snippet?.text ?? '';
      const column = location?.region?.startColumn;

      // [SGP-C2] Map severity
      const severity = this.mapSeverity(result.level ?? 'warning');

      // [SGP-C3] Map category from CWE
      const category = this.mapCategory(result);

      // [SGP-C6] Extract fixes if present
      const fixes = result.fixes
        ?.map(f => ({ description: f.description?.text ?? '' }))
        .filter(f => f.description.length > 0);

      return createFinding({
        ruleId: result.ruleId ?? `semgrep-${index}`,
        category,
        severity,
        file,
        line,
        column,
        snippet,
        message: result.message?.text ?? '',
        fixes: fixes?.length ? fixes : undefined,
        detector: 'regex' as Finding['detector'],
        fingerprint: '',
        confidence: 1.0,
        executionId: '',
        reportedBy: ['semgrep'],
        isWaived: false,
      });
    });
  }

  // [SGP-C2]
  private mapSeverity(level: string): FindingSeverity {
    return SEMGREP_SEVERITY_MAP[level.toUpperCase()] ?? 'medium';
  }

  // [SGP-C3]
  private mapCategory(result: SarifResult): FindingCategory {
    const props = result.properties as Record<string, unknown> | undefined;
    const metadata = props?.['metadata'] as Record<string, unknown> | undefined;
    const cwes = metadata?.['cwe'] as string[] | undefined;

    if (cwes && cwes.length > 0) {
      for (const cwe of cwes) {
        const mapped = SEMGREP_CATEGORY_MAP[cwe];
        if (mapped) return mapped;
      }
    }

    return 'unknown-risk' as FindingCategory;
  }

  private buildSummary(findings: Finding[], results: SarifResult[]): SemgrepSummary {
    const bySeverity: Record<string, number> = {};
    for (const f of findings) {
      bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    }

    return {
      totalFindings: findings.length,
      bySeverity,
      rulesMatched: new Set(results.map(r => r.ruleId).filter(Boolean)).size,
      filesScanned: new Set(findings.map(f => f.file)).size,
    };
  }
}
