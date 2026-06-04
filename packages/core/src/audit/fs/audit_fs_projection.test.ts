import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { AuditFsProjection } from './audit_fs_projection';
import type { AuditOrchestrationResult, Finding, AuditSummary } from '../types';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    fingerprint: 'sha256:abc123',
    ruleId: 'SEC-001',
    file: 'src/config.ts',
    line: 3,
    message: 'Hardcoded secret detected',
    category: 'hardcoded-secret',
    severity: 'critical',
    detector: 'regex',
    confidence: 1.0,
    executionId: 'exec-001',
    reportedBy: ['agent:security-audit'],
    isWaived: false,
    ...overrides,
  };
}

function makeResult(overrides: {
  findings?: Finding[];
  decision?: 'pass' | 'block';
  summary?: Partial<AuditSummary>;
} = {}): AuditOrchestrationResult {
  const findings = overrides.findings ?? [makeFinding()];
  const decision = overrides.decision ?? 'block';
  return {
    findings,
    agentResults: [],
    l1AgentResults: [],
    policyDecision: {
      decision,
      reason: 'critical findings present',
      executionId: 'exec-policy-001',
      blockingFindings: decision === 'block' ? findings.filter(f => !f.isWaived) : [],
      waivedFindings: findings.filter(f => f.isWaived),
      summary: { critical: 0, high: 0, medium: 0, low: 0 },
      rulesEvaluated: [],
      evaluatedAt: '2026-04-26T00:00:00.000Z',
    },
    summary: {
      total: findings.length,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      suppressed: 0,
      agentsRun: 1,
      agentsFailed: 0,
      ...overrides.summary,
    },
    executionIds: { scans: ['exec-scan-001'], policy: 'exec-policy-001' },
  };
}

let testDir: string;

beforeEach(async () => {
  testDir = await fs.mkdtemp(path.join(tmpdir(), 'afrp-test-'));
});

afterEach(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

describe('AuditFsProjection', () => {
  describe('4.1. Persist & Read (AFRP-A1 to A4)', () => {
    it('[AFRP-A1] should serialize AuditOrchestrationResult to audit-index.json', async () => {
      const projection = new AuditFsProjection({ basePath: testDir });
      const result = makeResult();

      await projection.persist(result);

      const raw = await fs.readFile(path.join(testDir, 'audit-index.json'), 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.findings).toHaveLength(1);
      expect(parsed.findings[0].fingerprint).toBe('sha256:abc123');
      expect(parsed.policyDecision.decision).toBe('block');
      expect(parsed.summary.total).toBe(1);
    });

    it('[AFRP-A2] should read and return AuditOrchestrationResult from audit-index.json', async () => {
      const projection = new AuditFsProjection({ basePath: testDir });
      const original = makeResult({ findings: [makeFinding(), makeFinding({ fingerprint: 'sha256:def456', ruleId: 'SEC-002' })] });

      await projection.persist(original);
      const loaded = await projection.readLatest();

      expect(loaded).not.toBeNull();
      const loadedResult = loaded!;
      expect(loadedResult.findings).toHaveLength(2);
      expect(loadedResult.findings[0]!.fingerprint).toBe('sha256:abc123');
      expect(loadedResult.findings[1]!.fingerprint).toBe('sha256:def456');
      expect(loadedResult.policyDecision.decision).toBe('block');
    });

    it('[AFRP-A3] should return null when audit-index.json does not exist', async () => {
      const projection = new AuditFsProjection({ basePath: testDir });

      const result = await projection.readLatest();

      expect(result).toBeNull();
    });

    it('[AFRP-A4] should write to audit/scans/{timestamp}.json when keepHistory is true', async () => {
      const projection = new AuditFsProjection({ basePath: testDir, keepHistory: true });
      const result = makeResult();

      await projection.persist(result);

      const indexExists = await fs.stat(path.join(testDir, 'audit-index.json')).then(() => true).catch(() => false);
      expect(indexExists).toBe(true);

      const scansDir = path.join(testDir, 'audit', 'scans');
      const entries = await fs.readdir(scansDir);
      expect(entries).toHaveLength(1);
      const firstEntry = entries[0]!;
      expect(firstEntry).toMatch(/^\d+\.json$/);

      const scanContent = await fs.readFile(path.join(scansDir, firstEntry), 'utf-8');
      const parsed = JSON.parse(scanContent);
      expect(parsed.findings).toHaveLength(1);
    });
  });

  describe('4.2. History & List (AFRP-B1 to B4)', () => {
    it('[AFRP-B1] should return scan timestamps sorted descending', async () => {
      const scansDir = path.join(testDir, 'audit', 'scans');
      await fs.mkdir(scansDir, { recursive: true });

      const result = makeResult();
      const timestamps = ['1752276000', '1752278000', '1752277000'];
      for (const ts of timestamps) {
        await fs.writeFile(path.join(scansDir, `${ts}.json`), JSON.stringify(result));
      }

      const projection = new AuditFsProjection({ basePath: testDir });
      const ids = await projection.list();

      expect(ids).toEqual(['1752278000', '1752277000', '1752276000']);
    });

    it('[AFRP-B2] should return empty array when no scan history exists', async () => {
      const projection = new AuditFsProjection({ basePath: testDir });

      const ids = await projection.list();

      expect(ids).toEqual([]);
    });

    it('[AFRP-B3] should read specific scan by timestamp ID', async () => {
      const scansDir = path.join(testDir, 'audit', 'scans');
      await fs.mkdir(scansDir, { recursive: true });

      const result = makeResult({ decision: 'pass' });
      await fs.writeFile(path.join(scansDir, '1752276000.json'), JSON.stringify(result));

      const projection = new AuditFsProjection({ basePath: testDir });
      const scan = await projection.read('1752276000');

      expect(scan).not.toBeNull();
      expect(scan!.policyDecision.decision).toBe('pass');
      expect(scan!.findings).toHaveLength(1);
    });

    it('[AFRP-B4] should return null for non-existent scan ID', async () => {
      const projection = new AuditFsProjection({ basePath: testDir });

      const scan = await projection.read('9999999999');

      expect(scan).toBeNull();
    });
  });
});
