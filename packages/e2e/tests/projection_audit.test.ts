/**
 * Block BA: Audit Record Projection — 6 EARS (CBA1-CBA6)
 * Blueprint: e2e/specs/projection_audit.md
 *
 * Validates that `gitgov audit` results project correctly to PostgreSQL
 * audit tables (Finding, Waiver, Scan). Uses real DB, real CLI, real fixtures.
 * Core is single-tenant — no tenant fields in queries.
 *
 * Requires: PostgreSQL (DATABASE_URL), CLI build (gitgov global)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import {
  runGitgovCli,
  createTempGitRepo,
  createAuditPrisma,
  cleanupAudit,
  cleanupWorktree,
  listRecordIds,
  readRecord,
  SKIP_CLEANUP,
  getGitgovDir,
} from './helpers';
import type { AuditClient } from './helpers';

// Resolve absolute path to agent entrypoint.
// In worktrees, __dirname resolves to the worktree path which may not have agent builds.
// Use the real monorepo root (resolving through symlinks and worktree paths).
const MONOREPO_ROOT = (() => {
  const candidate = path.resolve(__dirname, '../../..');
  const agentDist = path.join(candidate, 'packages/agents/security-audit/dist/index.mjs');
  if (fs.existsSync(agentDist)) return candidate;
  // Fallback: try the main monorepo (not worktree)
  const mainRoot = path.resolve(__dirname, '../../../../../..');
  return mainRoot;
})();
const SECURITY_AUDIT_ENTRYPOINT = path.join(MONOREPO_ROOT, 'packages/agents/security-audit/dist/index.mjs');

// ─── Fixtures ───────────────────────────────────────────────────────────────

const FIXTURE_CONFIG_TS = `// src/config.ts — hardcoded credentials
const password = "SuperSecret123!";
const DB_HOST = "prod-db.internal";
`;

const FIXTURE_CHECKOUT_TS = `// src/checkout.ts — PII to analytics
analytics.track("purchase", {
  email: user.email,
  phone: user.phone,
  amount: order.total
});
`;

const POLICY_YML = `# .gitgov/policy.yml
blocking:
  severity:
    threshold: critical
  categories:
    - hardcoded-secret
`;

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Block BA: Audit Record Projection (CBA1-CBA6)', () => {
  let prisma: AuditClient;
  let tmpDir: string;
  let repoDir: string;
  let auditOutput: string;
  let auditResult: Record<string, unknown>;

  beforeAll(async () => {
    prisma = createAuditPrisma();
    ({ tmpDir, repoDir } = createTempGitRepo());

    // 1. Init project + register agent
    runGitgovCli('init --name "Audit Projection Test" --actor-name "Dev BA" --quiet', { cwd: repoDir });
    const agentConfig = JSON.stringify({
      metadata: { purpose: 'audit', audit: { target: 'code', outputFormat: 'sarif' } },
      engine: { type: 'local', entrypoint: SECURITY_AUDIT_ENTRYPOINT, function: 'runAgent' },
    });
    runGitgovCli(`agent new agent:security-audit --config '${agentConfig}'`, { cwd: repoDir });

    // 2. Write fixtures (files that trigger detections)
    fs.mkdirSync(path.join(repoDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'src', 'config.ts'), FIXTURE_CONFIG_TS);
    fs.writeFileSync(path.join(repoDir, 'src', 'checkout.ts'), FIXTURE_CHECKOUT_TS);

    // 2b. Commit fixtures so FileLister can find them
    const { execSync: exec } = require('child_process');
    exec('git add -A && git commit -m "add fixtures"', { cwd: repoDir, stdio: 'pipe' });

    // 3. Write policy
    const gitgovDir = getGitgovDir(repoDir);
    fs.writeFileSync(path.join(gitgovDir, 'policy.yml'), POLICY_YML);

    // 4. Run audit
    // expectError: true because policy may BLOCK (exit 1) when critical findings exist — that's expected
    const cliResult = runGitgovCli('audit --scope full --output json', { cwd: repoDir, timeout: 60000, expectError: true });
    auditOutput = cliResult.output;
    // CLI may print text before JSON (e.g., "Scanning repository...") — find first {
    const jsonStart = auditOutput.indexOf('{');
    const jsonStr = jsonStart >= 0 ? auditOutput.substring(jsonStart) : '{}';
    auditResult = JSON.parse(jsonStr);

    // DEBUG: verify audit produced findings
    const findingsArray = (auditResult as any).findings ?? [];
    if (findingsArray.length === 0) {
      console.log('WARNING: audit produced 0 findings.');
      console.log('CLI success:', cliResult.success);
      // Run again with spawnSync to capture stderr (agent debug log)
      const { spawnSync } = require('child_process');
      const debugRun = spawnSync('gitgov', ['audit', '--scope', 'full', '--output', 'json'], { cwd: repoDir, encoding: 'utf8', timeout: 60000 });
      console.log('debug stderr:', debugRun.stderr?.substring(0, 500));
      console.log('Output length:', auditOutput.length);
      console.log('repoDir:', repoDir);
      console.log('config.ts exists:', fs.existsSync(path.join(repoDir, 'src', 'config.ts')));
      const { execSync: ex } = require('child_process');
      console.log('git log:', ex('git log --oneline', { cwd: repoDir, encoding: 'utf8' }).trim());
      console.log('ls src:', ex('ls -la src/', { cwd: repoDir, encoding: 'utf8' }).trim());
      // Check what scope the agent saw
      const agentResult = (auditResult as any).agentResults?.[0];
      console.log('agent status:', agentResult?.status, 'durationMs:', agentResult?.durationMs);
      console.log('sarif runs:', agentResult?.sarif?.runs?.length);
      if (agentResult?.sarif?.runs?.length > 0) {
        console.log('sarif results:', agentResult.sarif.runs[0].results?.length);
      }
      console.log('auditResult keys:', Object.keys(auditResult));
    } else {
      console.log(`Audit produced ${findingsArray.length} findings`);
    }

    // 5. Project findings to DB
    // Read executions from .gitgov/ and write findings directly to audit tables
    const executionIds = await listRecordIds(repoDir, 'executions');
    const findings = (auditResult as any).findings ?? [];
    const policyDecision = (auditResult as any).policyDecision ?? {};
    const summary = (auditResult as any).summary ?? {};

    // Clean DB before projecting
    await cleanupAudit(prisma);

    // Project findings to Finding table
    for (const finding of findings) {
      await prisma.finding.upsert({
        where: { fingerprint: finding.fingerprint },
        create: {
          fingerprint: finding.fingerprint,
          ruleId: finding.ruleId,
          file: finding.file,
          line: finding.line,
          column: finding.column ?? null,
          message: finding.message,
          snippet: finding.snippet ?? null,
          category: finding.category.replace(/-/g, '_'),
          severity: finding.severity,
          detector: finding.detector,
          confidence: finding.confidence,
          fixes: finding.fixes ?? [],
          legalReference: finding.legalReference ?? null,
          executionId: finding.executionId || executionIds[0] || 'unknown',
          reportedBy: finding.reportedBy ?? [],
          isWaived: finding.isWaived ?? false,
          findingId: finding.fingerprint,
          detectionCount: 1,
          detectionScanIds: [],
          firstDetectedAt: new Date(),
          lastDetectedAt: new Date(),
        },
        update: {
          detectionCount: { increment: 1 },
          lastDetectedAt: new Date(),
        },
      });
    }

    // Project scan
    await prisma.scan.create({
      data: {
        scope: 'full',
        triggeredBy: 'e2e-test',
        executionRecordIds: executionIds,
        policyExecutionId: (auditResult as any).executionIds?.policy ?? null,
        policyDecisionJson: policyDecision,
        displayStatus: policyDecision.decision === 'block' ? 'blocked' : 'success',
        findingsCount: summary.total ?? findings.length,
        criticalCount: summary.critical ?? 0,
        highCount: summary.high ?? 0,
        mediumCount: summary.medium ?? 0,
        lowCount: summary.low ?? 0,
        waivedCount: summary.suppressed ?? 0,
        scanNumber: 1,
        status: 'completed',
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    cleanupWorktree(repoDir);
    await cleanupAudit(prisma);
    await prisma.$disconnect();
    if (!SKIP_CLEANUP) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // §3.1 Finding Projection (CBA1-CBA4)

  it('[CBA1] should project findings with fingerprint, severity, category, detector, executionId', async () => {
    const findings = await prisma.finding.findMany({});
    expect(findings.length).toBeGreaterThan(0);

    const finding = findings[0]!;
    expect(finding.fingerprint).toBeDefined();
    expect(finding.ruleId).toBeDefined();
    expect(finding.severity).toBeDefined();
    expect(finding.category).toBeDefined();
    expect(finding.detector).toBeDefined();
    expect(finding.executionId).toBeDefined();
    expect(finding.file).toBeDefined();
    expect(finding.line).toBeGreaterThan(0);
    expect(finding.confidence).toBeGreaterThan(0);
  });

  it('[CBA2] should use FindingSeverity, FindingCategory, DetectorName Prisma enums', async () => {
    const findings = await prisma.finding.findMany({});
    expect(findings.length).toBeGreaterThan(0);

    for (const finding of findings) {
      expect(['critical', 'high', 'medium', 'low']).toContain(finding.severity);
      expect(['regex', 'heuristic', 'llm']).toContain(finding.detector);
      // Category uses underscore in Prisma enum
      expect(finding.category).toMatch(/^[a-z_]+$/);
    }
  });

  it('[CBA3] should upsert findings by fingerprint on repeated audit', async () => {
    const findingsBefore = await prisma.finding.findMany({});
    const countBefore = findingsBefore.length;

    // Re-project same findings (simulate second scan)
    const findings = (auditResult as any).findings ?? [];
    for (const finding of findings) {
      await prisma.finding.upsert({
        where: { fingerprint: finding.fingerprint },
        create: {
          fingerprint: finding.fingerprint,
          ruleId: finding.ruleId,
          file: finding.file,
          line: finding.line,
          message: finding.message,
          category: finding.category.replace(/-/g, '_'),
          severity: finding.severity,
          detector: finding.detector,
          confidence: finding.confidence,
          executionId: finding.executionId || 'unknown',
          reportedBy: finding.reportedBy ?? [],
          isWaived: false,
          findingId: finding.fingerprint,
          detectionCount: 1,
          detectionScanIds: [],
          firstDetectedAt: new Date(),
          lastDetectedAt: new Date(),
        },
        update: {
          detectionCount: { increment: 1 },
          lastDetectedAt: new Date(),
        },
      });
    }

    const findingsAfter = await prisma.finding.findMany({});
    // Same count (upserted, not duplicated)
    expect(findingsAfter.length).toBe(countBefore);
    // Detection count incremented
    const updated = findingsAfter[0]!;
    expect(updated.detectionCount).toBeGreaterThanOrEqual(2);
  });

  it('[CBA4] should project Scan with scope, triggeredBy, executionRecordIds, policyDecisionJson', async () => {
    const scans = await prisma.scan.findMany({});
    expect(scans.length).toBeGreaterThanOrEqual(1);

    const scan = scans[0]!;
    expect(scan.scope).toBe('full');
    expect(scan.triggeredBy).toBe('e2e-test');
    expect(Array.isArray(scan.executionRecordIds)).toBe(true);
    expect(scan.policyDecisionJson).toBeDefined();
    expect(scan.displayStatus).toBeDefined();
    expect(scan.scanNumber).toBe(1);
    expect(scan.status).toBe('completed');
    expect(scan.findingsCount).toBeGreaterThanOrEqual(0);
  });

  // §3.2 Waiver Projection (CBA5-CBA6)

  it('[CBA5] should project waiver with fingerprint, ruleId, justification, approvedBy, status active', async () => {
    // Get a finding fingerprint to waive
    const findings = await prisma.finding.findMany({});
    expect(findings.length).toBeGreaterThan(0);
    const targetFingerprint = findings[0]!.fingerprint;
    const targetRuleId = findings[0]!.ruleId;

    // Create waiver via CLI
    runGitgovCli(`audit waive ${targetFingerprint} -j "Test fixture, accepted for E2E"`, { cwd: repoDir });

    // Read the feedback record created by CLI
    const feedbackIds = await listRecordIds(repoDir, 'feedbacks');
    expect(feedbackIds.length).toBeGreaterThan(0);

    const feedbackRecord = await readRecord(repoDir, 'feedbacks', feedbackIds[feedbackIds.length - 1]!);
    const metadata = feedbackRecord.payload?.metadata as Record<string, unknown> | undefined;
    const signatures = feedbackRecord.header?.signatures as Array<{ keyId: string }> | undefined;

    // Project waiver to DB
    await prisma.waiver.upsert({
      where: { fingerprint: targetFingerprint },
      create: {
        fingerprint: targetFingerprint,
        ruleId: targetRuleId,
        justification: feedbackRecord.payload?.content ?? 'Test fixture, accepted for E2E',
        approvedBy: signatures?.[0]?.keyId ?? 'unknown',
        file: (metadata?.file as string) ?? null,
        line: (metadata?.line as number) ?? null,
        relatedTaskId: (metadata?.relatedTaskId as string) ?? null,
        gitRecordId: feedbackRecord.payload?.id ?? null,
        status: 'active',
      },
      update: {
        justification: feedbackRecord.payload?.content ?? null,
      },
    });

    // Verify
    const waiver = await prisma.waiver.findFirst({ where: { fingerprint: targetFingerprint } });
    expect(waiver).not.toBeNull();
    expect(waiver!.fingerprint).toBe(targetFingerprint);
    expect(waiver!.ruleId).toBeDefined();
    expect(waiver!.justification).toContain('E2E');
    expect(waiver!.status).toBe('active');
  });

  it('[CBA6] should mark finding isWaived true when matching waiver exists', async () => {
    // Get active waivers
    const waivers = await prisma.waiver.findMany({ where: { status: 'active' } });
    expect(waivers.length).toBeGreaterThan(0);

    const waiverFingerprints = waivers.map(w => w.fingerprint);

    // Recalculate isWaived
    await prisma.finding.updateMany({
      where: {},
      data: { isWaived: false },
    });

    if (waiverFingerprints.length > 0) {
      await prisma.finding.updateMany({
        where: { fingerprint: { in: waiverFingerprints } },
        data: { isWaived: true },
      });
    }

    // Verify
    const waivedFindings = await prisma.finding.findMany({ where: { isWaived: true } });
    expect(waivedFindings.length).toBeGreaterThan(0);

    for (const finding of waivedFindings) {
      expect(waiverFingerprints).toContain(finding.fingerprint);
    }
  });
});
