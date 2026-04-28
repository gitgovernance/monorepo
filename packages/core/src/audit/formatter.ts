import type {
  AuditOrchestrationResult,
  FindingSeverity,
} from './types';

type SeverityBadgeMap = Record<FindingSeverity, string>;

const SEVERITY_BADGES: SeverityBadgeMap = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🔵',
};

// [AFMT-C1] [AFMT-C2] [AFMT-C3] [AFMT-C4]
export function severityBadge(severity: FindingSeverity): string {
  return SEVERITY_BADGES[severity] ?? '⚪';
}

export function formatAuditResult(result: AuditOrchestrationResult): string | null {
  const { findings, policyDecision, summary } = result;

  // [AFMT-A3]
  const active = findings.filter((f) => !f.isWaived);

  // [AFMT-A2]
  if (active.length === 0) return null;

  const decision = policyDecision.decision;
  const statusLabel = decision === 'block' ? 'blocked' : 'passed';
  const headerBadge = decision === 'block' ? '🔴' : '✅';

  // [AFMT-A4]
  let md = `## ${headerBadge} GitGov Gate: ${active.length} findings — ${statusLabel}\n\n`;

  // [AFMT-A1]
  md += '| # | Severity | Category | File | Line | Message |\n';
  md += '|---|----------|----------|------|------|---------|\n';

  for (let i = 0; i < active.length; i++) {
    const f = active[i]!;
    const badge = severityBadge(f.severity);
    md += `| ${i + 1} | ${badge} ${f.severity} | ${f.category} | ${f.file} | ${f.line} | ${f.message} |\n`;
  }

  // [AFMT-B1] [AFMT-B2]
  const policyLabel = decision === 'block' ? 'BLOCKED' : 'PASSED';
  md += `\n**Policy:** ${policyLabel} — ${policyDecision.reason}\n`;

  // [AFMT-B4]
  md += `**Summary:** ${summary.critical} critical, ${summary.high} high, ${summary.medium} medium, ${summary.low} low (${summary.suppressed} suppressed)\n`;

  // [AFMT-B3]
  md += '\n> 💡 To waive: `gitgov audit waive <fingerprint> -j "reason"`\n';

  md += '\n---\n*GitGov Gate v1*\n';

  return md;
}
