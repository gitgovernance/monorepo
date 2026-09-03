/**
 * AuditCommand Unit Tests — AuditOrchestrator integration
 *
 * EARS Coverage:
 * - §4.1 CLI -> Orchestrator Integration (AORCH-C1 to C8)
 * - §4.5 Waiver Management (AORCH-E1 to E5)
 * - §4.8 CI Mode + LLM Config (AORCH-D1 to D7)
 * - §4.9-4.13 Persistence (AORCH-P1 to P7)
 */

// vi.hoisted ensures variables exist when vi.mock factory runs (hoisted to top)
const { mockFormatAuditResult, mockPostOrUpdateComment, mockAuditFsProjectionPersist, mockAuditFsProjectionReadLatest } = vi.hoisted(() => ({
  mockFormatAuditResult: vi.fn(),
  mockPostOrUpdateComment: vi.fn().mockResolvedValue(undefined),
  mockAuditFsProjectionPersist: vi.fn().mockResolvedValue(undefined),
  mockAuditFsProjectionReadLatest: vi.fn().mockResolvedValue(null),
}));

vi.mock('@gitgov/core/audit', () => ({
  formatAuditResult: (...args: unknown[]) => mockFormatAuditResult(...args),
  severityBadge: vi.fn((s: string) => ({ critical: '🔴', high: '🟠', medium: '🟡', low: '🔵' })[s] ?? '⚪'),
}));

// Mock @gitgov/core/fs — AuditFsProjection now comes from DI (AORCH-P4c), not direct construction
vi.mock('@gitgov/core/fs', () => ({
  findProjectRoot: vi.fn().mockReturnValue('/mock/project/root'),
  getWorktreeBasePath: vi.fn().mockReturnValue('/mock/worktree'),
  // [AORCH-P9] discoverInstalledAgents moved from '@gitgov/core' to this subpath — it reads
  // node_modules/ from disk (DISC-A1..A3). Without it here the import resolves to undefined,
  // the try/catch in audit-command swallows the TypeError, and AORCH-P9 stays green while
  // never exercising discovery at all.
  discoverInstalledAgents: vi.fn().mockReturnValue([]),
}));

// Mock child_process for AORCH-C8 (branch + commit resolution)
vi.mock('child_process', () => ({
  execSync: vi.fn().mockImplementation((cmd: string) => {
    if (cmd === 'git branch --show-current') return 'main\n';
    if (cmd === 'git rev-parse HEAD') return 'abc123def456\n';
    return '';
  }),
}));

// GitHubCiReporter mock: spy on fromToken after import (vi.mock doesn't intercept this subpath export)
import type { Mock } from 'vitest';
import { GitHubCiReporter } from '@gitgov/core/github';

// Mock @gitgov/core
vi.mock('@gitgov/core', async () => {
  // Typed importActual: without the generic, `actual` is an index signature and every property
  // read is an error under noPropertyAccessFromIndexSignature — and worse, a typo in a property
  // name would silently produce `undefined` instead of failing to compile.
  const actual = await vi.importActual<typeof import('@gitgov/core')>('@gitgov/core');
  return {
    Config: {
      ConfigManager: {
        findProjectRoot: vi.fn().mockReturnValue('/mock/project/root'),
        findGitgovRoot: vi.fn().mockReturnValue('/mock/project/root/.gitgov'),
      }
    },
    SourceAuditor: {
      SourceAuditorModule: vi.fn(),
      WaiverReader: vi.fn(),
      WaiverWriter: vi.fn(),
    },
    AuditOrchestrator: {
      createAuditOrchestrator: vi.fn(),
    },
    PolicyEvaluator: {
      createPolicyEvaluator: vi.fn(),
    },
    FindingDetector: {
      FindingDetectorModule: vi.fn(),
    },
    Sarif: actual.Sarif,
    generateExecutionId: actual.generateExecutionId ?? ((title: string, ts: number) => `${ts}-exec-${title}`),
  };
});

// Mock DependencyInjectionService
vi.mock('../../services/dependency-injection', () => ({
  DependencyInjectionService: {
    getInstance: vi.fn()
  }
}));

import { AuditCommand, type AuditCommandOptions } from './audit-command';
import { DependencyInjectionService } from '../../services/dependency-injection';
import type {
  AuditOrchestrationOptions,
  AuditOrchestrationResult,
  PolicyDecision,
  Finding,
  FeedbackRecord,
  ActorRecord,
  Waiver,
} from '@gitgov/core';

// Mock console methods
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => { });
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => { });
// `process.exit` is typed `(code?) => never`; the stub returns, so the cast states that gap
// explicitly rather than throwing and changing control flow the tests do not expect.
const mockProcessExit = vi.spyOn(process, 'exit').mockImplementation((() => { }) as unknown as never);

// Get mocked DI
const mockDI = vi.mocked(DependencyInjectionService);

// Mock orchestrator
let mockOrchestrator: {
  run: Mock<(options: AuditOrchestrationOptions) => Promise<AuditOrchestrationResult>>;
};

let mockWaiverReader: {
  loadWaivers: Mock<() => Promise<Waiver[]>>;
};

let mockFeedbackAdapter: {
  create: Mock<(data: Partial<FeedbackRecord>, actorId: string) => Promise<FeedbackRecord>>;
};

let mockIdentityAdapter: {
  getCurrentActor: Mock<() => Promise<ActorRecord>>;
};

let mockDIInstance: {
  getAuditOrchestrator: Mock;
  getBacklogAdapter: Mock;
  getWaiverReader: Mock;
  getFeedbackAdapter: Mock;
  getExecutionAdapter: Mock;
  getIdentityAdapter: Mock;
  getCurrentActor: Mock;
  // Both exist in the real container and the command calls them (audit-command.ts:175/524,
  // dependency-injection.ts:262/958). The mock always provided them — only this annotation
  // omitted them, so the tests that reassigned or asserted on them did not typecheck.
  getAuditFsProjection: Mock;
  getGitModule: Mock;
  getProjectRoot: Mock;
  getSessionManager: Mock;
};

describe('AuditCommand', () => {
  let auditCommand: AuditCommand;

  const mockPolicyDecisionPass: PolicyDecision = {
    decision: 'pass',
    reason: 'No findings exceed configured thresholds.',
    blockingFindings: [],
    waivedFindings: [],
    summary: { critical: 0, high: 0, medium: 0, low: 0 },
    rulesEvaluated: [],
    evaluatedAt: '2026-03-18T00:00:00.000Z',
    executionId: 'exec-mock-policy-001',
  };

  const mockPolicyDecisionBlock: PolicyDecision = {
    decision: 'block',
    reason: '1 finding(s) at or above critical threshold.',
    blockingFindings: [
      {
        fingerprint: 'sha256:abc123def456',
        ruleId: 'SEC-001',
        message: 'API key hardcoded',
        // Real digest of the snippet — `snippet`/`snippetHash` are REQUIRED on Finding
        // ("every detector MUST produce snippet", core/src/audit/types.ts). These fixtures
        // predate that contract and only compiled because this file was never typechecked.
        snippet: 'const apiKey = "sk-live-abc123";',
        snippetHash: '4ac0433fdbdfed730501371e316d25c95097711e327967272990f695b8c0f8dc',
        severity: 'critical',
        category: 'hardcoded-secret',
        file: 'src/config/database.ts',
        line: 12,
        column: 34,
        detector: 'regex',
        confidence: 1.0,
        executionId: 'exec-mock-scan-001',
        reportedBy: ['agent:security-auditor'],
        isWaived: false,
      },
    ],
    waivedFindings: [],
    summary: { critical: 1, high: 1, medium: 0, low: 0 },
    rulesEvaluated: [{ ruleName: 'severityThreshold', passed: false, reason: '1 finding(s) at or above critical threshold.' }],
    evaluatedAt: '2026-03-18T00:00:00.000Z',
    executionId: 'exec-mock-policy-002',
  };

  const mockResultWithFindings: AuditOrchestrationResult = {
    // Required since the redactor became a mandatory orchestrator dependency — both return
    // paths of `run()` include it (audit_orchestrator.ts:345/456). This fixture omitted it and
    // only compiled because the file was excluded from every typecheck.
    l1AgentResults: [],
    findings: [
      {
        fingerprint: 'sha256:abc123def456',
        ruleId: 'SEC-001',
        message: 'API key hardcoded',
        // Real digest of the snippet — `snippet`/`snippetHash` are REQUIRED on Finding
        // ("every detector MUST produce snippet", core/src/audit/types.ts). These fixtures
        // predate that contract and only compiled because this file was never typechecked.
        snippet: 'const apiKey = "sk-live-abc123";',
        snippetHash: '4ac0433fdbdfed730501371e316d25c95097711e327967272990f695b8c0f8dc',
        severity: 'critical',
        category: 'hardcoded-secret',
        file: 'src/config/database.ts',
        line: 12,
        column: 34,
        detector: 'regex',
        confidence: 1.0,
        executionId: 'exec-mock-scan-001',
        reportedBy: ['agent:security-auditor'],
        isWaived: false,
      },
      {
        fingerprint: 'sha256:def456ghi789',
        ruleId: 'PII-002',
        message: 'Email pattern detected',
        snippet: 'const email = "user@example.com";',
        snippetHash: '8c705a96737ed163312bb0b5109bdc5335749e06f9a315b34fde3076b30847c7',
        severity: 'high',
        category: 'pii-email',
        file: 'src/utils/email.ts',
        line: 23,
        column: 10,
        detector: 'regex',
        confidence: 0.95,
        executionId: 'exec-mock-scan-001',
        reportedBy: ['agent:security-auditor'],
        isWaived: false,
      },
    ],
    agentResults: [
      {
        agentId: 'agent:security-auditor',
        sarif: { $schema: '', version: '2.1.0', runs: [] },
        executionId: 'exec-scan-1',
        status: 'success',
        durationMs: 150,
      },
    ],
    policyDecision: mockPolicyDecisionBlock,
    summary: {
      total: 2,
      critical: 1,
      high: 1,
      medium: 0,
      low: 0,
      suppressed: 0,
      agentsRun: 1,
      agentsFailed: 0,
    },
    executionIds: {
      scans: ['exec-scan-1'],
      policy: 'exec-policy-1',
    },
  };

  const mockEmptyResult: AuditOrchestrationResult = {
    findings: [],
    agentResults: [],
    l1AgentResults: [],
    policyDecision: mockPolicyDecisionPass,
    summary: {
      total: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      suppressed: 0,
      agentsRun: 0,
      agentsFailed: 0,
    },
    executionIds: {
      scans: [],
      policy: 'exec-policy-empty',
    },
    warning: 'No audit agents found',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock orchestrator
    mockOrchestrator = {
      run: vi.fn().mockResolvedValue(mockResultWithFindings),
    };

    mockWaiverReader = {
      loadWaivers: vi.fn().mockResolvedValue([]),
    };

    mockFeedbackAdapter = {
      create: vi.fn().mockResolvedValue({ id: 'feedback-123' } as FeedbackRecord),
    };

    mockIdentityAdapter = {
      getCurrentActor: vi.fn().mockResolvedValue({ id: 'human:developer' } as ActorRecord),
    };

    // Mock backlog adapter for TaskRecord creation (AORCH-C1)
    const mockBacklogAdapter = {
      createTask: vi.fn().mockResolvedValue({
        id: '1774524476-task-audit-full-scan',
        title: 'Audit: diff scan',
        status: 'active',
      }),
    };

    // Configure DI mock
    mockDIInstance = {
      getAuditOrchestrator: vi.fn().mockResolvedValue(mockOrchestrator),
      getBacklogAdapter: vi.fn().mockResolvedValue(mockBacklogAdapter),
      getWaiverReader: vi.fn().mockResolvedValue(mockWaiverReader),
      getFeedbackAdapter: vi.fn().mockResolvedValue(mockFeedbackAdapter),
      getExecutionAdapter: vi.fn().mockResolvedValue({ create: vi.fn().mockResolvedValue({ id: 'exec-l1-test' }) }),
      getIdentityAdapter: vi.fn().mockResolvedValue(mockIdentityAdapter),
      getCurrentActor: vi.fn().mockResolvedValue({ id: 'human:developer' }),
      getAuditFsProjection: vi.fn().mockResolvedValue({ persist: mockAuditFsProjectionPersist, readLatest: mockAuditFsProjectionReadLatest }),
      getProjectRoot: vi.fn().mockResolvedValue('/mock/project/root'),
      getGitModule: vi.fn().mockResolvedValue({ getCommitHash: vi.fn().mockResolvedValue('abc123'), getRepoRoot: vi.fn().mockResolvedValue('/mock/repo') }),
      getSessionManager: vi.fn().mockResolvedValue({
        getState: vi.fn().mockReturnValue({ actorId: 'human:developer' }),
      }),
    };
    (DependencyInjectionService.getInstance as Mock).mockReturnValue(mockDIInstance);

    auditCommand = new AuditCommand();
  });

  afterEach(() => {
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockProcessExit.mockClear();
  });

  // Helper to create default options
  const createDefaultOptions = (overrides: Partial<AuditCommandOptions> = {}): AuditCommandOptions => ({
    scope: 'diff',
    output: 'text',
    failOn: 'critical',
    ...overrides,
  });

  describe('4.1. CLI -> Orchestrator Integration (AORCH-C1 to C8)', () => {
    it('[AORCH-C1] should pass scope to orchestrator', async () => {
      await auditCommand.execute(createDefaultOptions({ scope: 'full' }));

      expect(mockOrchestrator.run).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'full',
        })
      );
    });

    it('[AORCH-C1] should pass include/exclude to orchestrator', async () => {
      await auditCommand.execute(createDefaultOptions({
        scope: 'full',
        include: 'src/**/*.ts,lib/**/*.ts',
        exclude: '**/*.test.ts',
      }));

      expect(mockOrchestrator.run).toHaveBeenCalledWith(
        expect.objectContaining({
          include: ['src/**/*.ts', 'lib/**/*.ts'],
          exclude: ['**/*.test.ts'],
        })
      );
    });

    it('[AORCH-C2] should exit 1 when policy decision is block', async () => {
      await auditCommand.execute(createDefaultOptions({ scope: 'full' }));

      expect(mockOrchestrator.run).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[AORCH-C2] should exit 0 when policy decision is pass', async () => {
      mockOrchestrator.run.mockResolvedValue(mockEmptyResult);

      await auditCommand.execute(createDefaultOptions({ scope: 'full' }));

      expect(mockOrchestrator.run).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });

    it('[AORCH-C2] should pass failOn to orchestrator for threshold evaluation', async () => {
      await auditCommand.execute(createDefaultOptions({ scope: 'full', failOn: 'high' }));

      expect(mockOrchestrator.run).toHaveBeenCalledWith(
        expect.objectContaining({
          failOn: 'high',
        })
      );
    });

    it('[AORCH-C3] should pass --agent to orchestrator as agentId', async () => {
      await auditCommand.execute(createDefaultOptions({
        scope: 'full',
        agent: 'agent:security-auditor',
      }));

      expect(mockOrchestrator.run).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent:security-auditor',
        })
      );
    });

    it('[AORCH-C4] should output valid SARIF 2.1.0 when --output sarif', async () => {
      await auditCommand.execute(createDefaultOptions({ scope: 'full', output: 'sarif' }));

      const sarifCall = mockConsoleLog.mock.calls.find(call => {
        try {
          const parsed = JSON.parse(call[0]);
          return parsed.version === '2.1.0';
        } catch {
          return false;
        }
      });

      expect(sarifCall).toBeDefined();
      const sarif = JSON.parse(sarifCall![0]);
      expect(sarif.$schema).toBe(
        'https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json'
      );
      expect(sarif.runs).toHaveLength(1);
      expect(sarif.runs[0].tool.driver.name).toBe('gitgov-audit');
    });

    it('[AORCH-C4] should output valid JSON when --output json', async () => {
      await auditCommand.execute(createDefaultOptions({ scope: 'full', output: 'json' }));

      const jsonCall = mockConsoleLog.mock.calls.find(call => {
        try {
          JSON.parse(call[0]);
          return true;
        } catch {
          return false;
        }
      });

      expect(jsonCall).toBeDefined();
      const parsed = JSON.parse(jsonCall![0]);
      expect(parsed).toHaveProperty('findings');
      expect(parsed).toHaveProperty('policyDecision');
      expect(parsed).toHaveProperty('summary');
    });

    it('[AORCH-C7] should emit only JSON to stdout when --output json (no progress text)', async () => {
      await auditCommand.execute(createDefaultOptions({ scope: 'full', output: 'json' }));

      // ALL console.log calls should be valid JSON — no progress text
      for (const call of mockConsoleLog.mock.calls) {
        const output = call[0] as string;
        expect(() => JSON.parse(output)).not.toThrow();
      }
    });

    it('[AORCH-C5] should not set agentId when --agent is not provided', async () => {
      await auditCommand.execute(createDefaultOptions({ scope: 'full' }));

      const callArg = mockOrchestrator.run.mock.calls[0]![0];
      expect(callArg.agentId).toBeUndefined();
    });

    it('[AORCH-C6] should not accept --detector, --target, --max-findings, --group-by flags', async () => {
      // Verify these options are not in AuditCommandOptions type
      // This is a type-level test enforced by the interface.
      // At runtime, we verify the register method does not add these options.
      const { Command } = await vi.importActual<typeof import('commander')>('commander');
      const program = new Command();
      auditCommand.register(program);

      // Throw, not just expect: `expect(...).toBeDefined()` does not narrow the type, and a
      // missing command should fail loudly here rather than as a property read on undefined.
      const auditCmd = program.commands.find((c) => c.name() === 'audit');
      if (!auditCmd) throw new Error('audit command was not registered on the program');

      const optionNames = auditCmd.options.map((o) => o.long);
      expect(optionNames).not.toContain('--detector');
      expect(optionNames).not.toContain('--target');
      expect(optionNames).not.toContain('--max-findings');
      expect(optionNames).not.toContain('--group-by');
      expect(optionNames).not.toContain('--summary');
    });

    it('[AORCH-C1] should create TaskRecord via backlogAdapter and pass its ID', async () => {
      await auditCommand.execute(createDefaultOptions({ scope: 'full' }));

      // Verify backlogAdapter.createTask was called with correct params
      const diInstance = mockDI.getInstance();
      const backlogAdapter = await diInstance.getBacklogAdapter();
      expect(backlogAdapter.createTask).toHaveBeenCalledTimes(1);
      // Non-null: `toHaveBeenCalledTimes(1)` above (or the execute in this test) guarantees
      // the call exists; under noUncheckedIndexedAccess the index alone cannot prove it.
      const createTaskArgs = (backlogAdapter.createTask as Mock).mock.calls[0]!;
      expect(createTaskArgs[0]).toMatchObject({
        title: expect.stringContaining('Audit:'),
        status: 'active',
        priority: 'high',
        tags: expect.arrayContaining(['audit', 'automated']),
      });

      // Verify taskId from createTask is passed to orchestrator
      const callArg = mockOrchestrator.run.mock.calls[0]![0];
      expect(callArg.taskId).toBe('1774524476-task-audit-full-scan');
    });

    it('[AORCH-C8] should include branch and commit references in TaskRecord', async () => {
      await auditCommand.execute(createDefaultOptions({ scope: 'full' }));

      const diInstance = mockDI.getInstance();
      const backlogAdapter = await diInstance.getBacklogAdapter();
      // Non-null: `toHaveBeenCalledTimes(1)` above (or the execute in this test) guarantees
      // the call exists; under noUncheckedIndexedAccess the index alone cannot prove it.
      const createTaskArgs = (backlogAdapter.createTask as Mock).mock.calls[0]!;
      expect(createTaskArgs[0].references).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^branch:/),
          expect.stringMatching(/^commit:/),
        ]),
      );
    });

    it('should handle initialization errors gracefully', async () => {
      (DependencyInjectionService.getInstance as Mock).mockReturnValue({
        getAuditOrchestrator: vi.fn().mockRejectedValue(new Error('Init failed')),
      });

      auditCommand = new AuditCommand();

      await auditCommand.execute(createDefaultOptions({ scope: 'full' }));

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Init failed'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should format text output with correct structure', async () => {
      await auditCommand.execute(createDefaultOptions({ scope: 'full', output: 'text' }));

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('FINDINGS'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('SUMMARY'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('POLICY DECISION'));
    });

    it('should suppress output in quiet mode except criticals', async () => {
      await auditCommand.execute(createDefaultOptions({ scope: 'full', output: 'text', quiet: true }));

      // Should only show critical findings count, not full output
      expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('FINDINGS'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('critical finding'));
    });
  });

  describe('4.5. Waiver Management (AORCH-E1 to E5)', () => {
    it('[AORCH-E1] should create FeedbackRecord with waiver metadata', async () => {
      await auditCommand.executeWaive('sha256:abc123', {
        justification: 'Test data for unit tests',
      });

      expect(mockFeedbackAdapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'approval',
          entityType: 'execution',
          content: 'Test data for unit tests',
          metadata: expect.objectContaining({
            fingerprint: 'sha256:abc123',
          }),
        }),
        'human:developer'
      );
    });

    it('[AORCH-E2] should require --justification for waive command', async () => {
      await auditCommand.executeWaive('sha256:abc123', {});

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Justification required'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[AORCH-E3] should list active waivers with --list', async () => {
      mockWaiverReader.loadWaivers.mockResolvedValue([
        {
          fingerprint: 'sha256:waiver1',
          ruleId: 'SEC-001',
          feedback: {
            header: { version: '1.0' as const, type: 'feedback' as const, payloadChecksum: 'mock', signatures: [{ keyId: 'human:test', role: 'author', notes: 'test', signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==', timestamp: 1700000000 }] },
            payload: {
              id: 'feedback-123',
              content: 'Test fixture data',
              createdAt: '2024-01-15T10:00:00Z',
              type: 'approval',
              entityType: 'execution',
              entityId: 'exec-123',
              status: 'resolved',
              metadata: {
                fingerprint: 'sha256:waiver1',
                ruleId: 'SEC-001',
                file: 'test.ts',
                line: 10,
              },
            },
          } as Waiver['feedback'],
        },
      ]);

      await auditCommand.executeWaive(undefined, { list: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Active Waivers'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('sha256:waiver1'));
    });

    it('[AORCH-E4] should show confirmation when waiver created', async () => {
      await auditCommand.executeWaive('sha256:abc123', {
        justification: 'False positive',
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Waiver created successfully'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('sha256:abc123'));
    });

    it('[AORCH-E5] should show empty message when no active waivers', async () => {
      mockWaiverReader.loadWaivers.mockResolvedValue([]);

      await auditCommand.executeWaive(undefined, { list: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('No active waivers'));
    });
  });

  // ==========================================================================
  // 4.8. CI Mode + LLM Config (AORCH-D1 to D7) — Cycle 1 gate_product
  // ==========================================================================

  describe('4.8. CI Mode + LLM Config (AORCH-D1 to D7)', () => {
    const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => { });
    const eventFixture = JSON.stringify({ pull_request: { number: 42 } });

    beforeEach(() => {
      vi.clearAllMocks();
      mockOrchestrator.run.mockResolvedValue(mockResultWithFindings);
      mockFormatAuditResult.mockReturnValue('## 🔴 GitGov Audit: 2 findings');
      mockPostOrUpdateComment.mockResolvedValue(undefined);
      // Override fromToken to return mock reporter (vi.mock can't intercept @gitgov/core/github subpath)
      GitHubCiReporter.fromToken = vi.fn().mockResolvedValue({
        postOrUpdateComment: mockPostOrUpdateComment,
      });
      // Reset env
      delete process.env['GITHUB_ACTIONS'];
      delete process.env['GITHUB_TOKEN'];
      delete process.env['GITHUB_EVENT_PATH'];
      delete process.env['GITHUB_REPOSITORY'];
      delete process.env['LLM_MODEL'];
      delete process.env['LLM_API_KEY'];
    });

    // [AORCH-D1]
    it('[AORCH-D1] should post PR comment when --ci in GitHub Actions', async () => {
      const fs = require('node:fs/promises');
      const tmpEvent = '/tmp/gci-event-d1.json';
      await fs.writeFile(tmpEvent, eventFixture);

      process.env['GITHUB_ACTIONS'] = 'true';
      process.env['GITHUB_TOKEN'] = 'ghp_test123';
      process.env['GITHUB_EVENT_PATH'] = tmpEvent;
      process.env['GITHUB_REPOSITORY'] = 'myorg/myrepo';

      await auditCommand.execute(createDefaultOptions({ ci: true }));

      expect(mockFormatAuditResult).toHaveBeenCalledWith(mockResultWithFindings);
      expect(mockPostOrUpdateComment).toHaveBeenCalledWith(
        '## 🔴 GitGov Audit: 2 findings',
        { owner: 'myorg', repo: 'myrepo', prNumber: 42 },
      );
      await fs.unlink(tmpEvent).catch(() => {});
    });

    // [AORCH-D2]
    it('[AORCH-D2] should update existing comment instead of creating new', async () => {
      const fs = require('node:fs/promises');
      const tmpEvent = '/tmp/gci-event-d2.json';
      await fs.writeFile(tmpEvent, eventFixture);

      process.env['GITHUB_ACTIONS'] = 'true';
      process.env['GITHUB_TOKEN'] = 'ghp_test123';
      process.env['GITHUB_EVENT_PATH'] = tmpEvent;
      process.env['GITHUB_REPOSITORY'] = 'myorg/myrepo';

      await auditCommand.execute(createDefaultOptions({ ci: true }));

      // postOrUpdateComment handles marker-based update internally (CIREP-A2)
      expect(mockPostOrUpdateComment).toHaveBeenCalledTimes(1);
      await fs.unlink(tmpEvent).catch(() => {});
    });

    // [AORCH-D3]
    it('[AORCH-D3] should not post comment when formatAuditResult returns null', async () => {
      const fs = require('node:fs/promises');
      const tmpEvent = '/tmp/gci-event-d3.json';
      await fs.writeFile(tmpEvent, eventFixture);

      process.env['GITHUB_ACTIONS'] = 'true';
      process.env['GITHUB_TOKEN'] = 'ghp_test123';
      process.env['GITHUB_EVENT_PATH'] = tmpEvent;
      process.env['GITHUB_REPOSITORY'] = 'myorg/myrepo';

      mockFormatAuditResult.mockReturnValue(null);
      mockOrchestrator.run.mockResolvedValue(mockEmptyResult);

      await auditCommand.execute(createDefaultOptions({ ci: true }));

      expect(mockPostOrUpdateComment).not.toHaveBeenCalled();
      await fs.unlink(tmpEvent).catch(() => {});
    });

    // [AORCH-D4]
    it('[AORCH-D4] should warn and skip PR comment when not in GitHub Actions', async () => {
      // No GITHUB_ACTIONS env var set
      await auditCommand.execute(createDefaultOptions({ ci: true }));

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('requires GitHub Actions'),
      );
      expect(mockPostOrUpdateComment).not.toHaveBeenCalled();
    });

    // [AORCH-D5]
    it('[AORCH-D5] should log warning on GitHub API error without changing exit code', async () => {
      const fs = require('node:fs/promises');
      const tmpEvent = '/tmp/gci-event-d5.json';
      await fs.writeFile(tmpEvent, eventFixture);

      process.env['GITHUB_ACTIONS'] = 'true';
      process.env['GITHUB_TOKEN'] = 'ghp_test123';
      process.env['GITHUB_EVENT_PATH'] = tmpEvent;
      process.env['GITHUB_REPOSITORY'] = 'myorg/myrepo';

      // Make dynamic require fail to simulate import error
      vi.mock('@gitgov/core/github', () => { throw new Error('module load failed'); });

      await auditCommand.execute(createDefaultOptions({ ci: true }));

      // Exit code should still be based on policy (block → 1), not on comment failure
      expect(mockProcessExit).toHaveBeenCalledWith(1);

      // Restore mock
      vi.mock('@gitgov/core/github', () => ({
        GitHubCiReporter: vi.fn().mockImplementation(function() { return {
          postOrUpdateComment: mockPostOrUpdateComment,
        }; }),
      }));
      await fs.unlink(tmpEvent).catch(() => {});
    });

    // [AORCH-D6]
    it('[AORCH-D6] should set LLM_MODEL env var from --llm-model flag', async () => {
      await auditCommand.execute(createDefaultOptions({ llmModel: 'anthropic/claude-sonnet-4-6' }));

      expect(process.env['LLM_MODEL']).toBe('anthropic/claude-sonnet-4-6');
      expect(mockOrchestrator.run).toHaveBeenCalled();
    });

    // [AORCH-D7]
    it('[AORCH-D7] should set LLM_API_KEY env var from --llm-key flag', async () => {
      await auditCommand.execute(createDefaultOptions({ llmKey: 'sk-ant-test-123' }));

      expect(process.env['LLM_API_KEY']).toBe('sk-ant-test-123');
      expect(mockOrchestrator.run).toHaveBeenCalled();
    });
  });

  // 4.9. L1 Record Persistence (AORCH-P1 to P3)
  describe('4.9. L1 Record Persistence (AORCH-P1 to P3)', () => {
    it('[AORCH-P1] should write redacted ExecutionRecords to git after orchestrator.run', async () => {
      const resultWithL1: AuditOrchestrationResult = {
        ...mockResultWithFindings,
        l1AgentResults: [{
          agentId: 'agent:security-audit',
          executionId: 'exec-scan-1',
          sarif: { $schema: 'https://sarif.spec', version: '2.1.0', runs: [] },
          status: 'success' as const,
          durationMs: 100,
        }],
      };

      mockOrchestrator.run.mockResolvedValueOnce(resultWithL1);

      await auditCommand.execute({ scope: 'full', output: 'text', failOn: 'critical' } as AuditCommandOptions);

      // The container's executionAdapter.create was called for L1 write
      const execAdapter = await mockDIInstance.getExecutionAdapter();
      expect(execAdapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'completion',
          title: expect.stringContaining('agent:security-audit'),
          metadata: expect.objectContaining({ kind: 'sarif' }),
        }),
        expect.any(String),
      );
    });

    it('[AORCH-P2] should write review FeedbackRecords to git after orchestrator.run', async () => {
      const mockFbCreate = vi.fn().mockResolvedValue({ id: 'fb-review-1' });
      mockDIInstance.getFeedbackAdapter = vi.fn().mockResolvedValue({ create: mockFbCreate });

      const resultWithReviews: AuditOrchestrationResult = {
        ...mockResultWithFindings,
        reviewResults: [{
          agentId: 'agent:review-advisor',
          status: 'success' as const,
          durationMs: 200,
          feedbackRecordId: 'exec-review-1',
        }],
      };

      mockOrchestrator.run.mockResolvedValueOnce(resultWithReviews);

      await auditCommand.execute({ scope: 'full', output: 'text', failOn: 'critical' } as AuditCommandOptions);

      expect(mockFbCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'execution',
          type: 'suggestion',
          metadata: expect.objectContaining({ agentId: 'agent:review-advisor' }),
        }),
        'agent:review-advisor',
      );
    });

    it('[AORCH-P3] should write no L1 ExecutionRecords when l1AgentResults is empty', async () => {
      // This test was named "when l1AgentResults is undefined" and relied on the fixture
      // silently omitting the field — a state the current orchestrator cannot produce: the
      // redactor is a required dependency and both return paths of `run()` include
      // `l1AgentResults` (audit_orchestrator.ts:345/456). Absence is unrepresentable in the
      // type, so what AORCH-P3 now guards is the empty case: no L1 results → no records.
      mockOrchestrator.run.mockResolvedValueOnce({ ...mockResultWithFindings, l1AgentResults: [] });

      const mockExecCreate = vi.fn();
      mockDIInstance.getExecutionAdapter = vi.fn().mockResolvedValue({ create: mockExecCreate });

      await auditCommand.execute({ scope: 'full', output: 'text', failOn: 'critical' } as AuditCommandOptions);

      expect(mockExecCreate).not.toHaveBeenCalled();
    });
  });

  // 4.11. Project Guard (AORCH-P5)
  describe('4.11. Project Guard (AORCH-P5)', () => {
    it('[AORCH-P5] should exit with error when project not initialized', async () => {
      // getWorktreeBasePath returns /mock/worktree, existsSync('/mock/worktree/.gitgov') = false
      // → requireProject detects no .gitgov/ and exits
      await auditCommand.execute(createDefaultOptions());

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Project not initialized'),
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  // 4.12. Working Repo Guard (AORCH-P6)
  describe('4.12. Working Repo Guard (AORCH-P6)', () => {
    it('[AORCH-P6] should exit with error when repo has no commits', async () => {
      // Bypass requireProject so we reach requireWorkingRepo. A subclass override is the
      // cast-free way to reach the protected method: `vi.spyOn(cmd as any, ...)` silenced the
      // visibility instead of respecting it, and `as any` is prohibited by the preset.
      class AuditCommandWithProjectBypass extends AuditCommand {
        protected override async requireProject(): Promise<void> { /* project exists */ }
      }
      const bypassedCommand = new AuditCommandWithProjectBypass();
      mockDIInstance.getGitModule = vi.fn().mockResolvedValue({
        getCommitHash: vi.fn().mockRejectedValue(new Error('fatal: ambiguous argument HEAD')),
      });

      await bypassedCommand.execute(createDefaultOptions());

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('No commits found'),
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  // 4.13. Orchestrator Warnings Display (AORCH-P7)
  describe('4.13. Orchestrator Warnings Display (AORCH-P7)', () => {
    it('[AORCH-P7] should display orchestrator warnings before summary', async () => {
      const resultWithWarning = {
        ...mockResultWithFindings,
        warning: 'All audit agents failed to load:\n  agent:security-audit: entrypoint not found',
      };
      mockOrchestrator.run.mockResolvedValueOnce(resultWithWarning);
      const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => { });

      await auditCommand.execute(createDefaultOptions());

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('All audit agents failed'),
      );
      mockConsoleWarn.mockRestore();
    });
  });

  // 4.10. FS Audit Projection (AORCH-P4 to AORCH-P4c)
  describe('4.10. FS Audit Projection (AORCH-P4 to AORCH-P4c)', () => {
    it('[AORCH-P4] should persist audit result to .gitgov/audit-index.json after orchestrator.run', async () => {
      mockOrchestrator.run.mockResolvedValueOnce(mockResultWithFindings);

      await auditCommand.execute(createDefaultOptions({ scope: 'full' }));

      expect(mockAuditFsProjectionPersist).toHaveBeenCalledTimes(1);
      expect(mockAuditFsProjectionPersist).toHaveBeenCalledWith(mockResultWithFindings);
    });

    it('[AORCH-P4c] should obtain AuditFsProjection from DI container', async () => {
      mockOrchestrator.run.mockResolvedValueOnce(mockResultWithFindings);

      await auditCommand.execute(createDefaultOptions({ scope: 'full' }));

      expect(mockDIInstance.getAuditFsProjection).toHaveBeenCalled();
    });
  });

  // 4.14. Agent Auto-Discovery Integration (AORCH-P8 to P9)
  describe('4.14. Agent Auto-Discovery (AORCH-P8 to P9)', () => {
    it('[AORCH-P8] should suggest npm install for each agent not found in warning', async () => {
      const resultWithMultipleFailures = {
        ...mockResultWithFindings,
        warning: 'All audit agents failed to load:\n  agent:security-audit — @gitgov/agent-security-audit not found (MODULE_NOT_FOUND)\n  agent:semgrep — @gitgov/agent-semgrep not found (Cannot find module)',
      };
      mockOrchestrator.run.mockResolvedValueOnce(resultWithMultipleFailures);
      const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => { });

      await auditCommand.execute(createDefaultOptions());

      const warnCalls = mockConsoleWarn.mock.calls.map(c => c[0]).join('\n');
      expect(warnCalls).toContain('npm install @gitgov/agent-security-audit');
      expect(warnCalls).toContain('npm install @gitgov/agent-semgrep');
      mockConsoleWarn.mockRestore();
    });

    it('[AORCH-P9] should list unregistered agents as available and suggest gitgov agent new', async () => {
      // Mock orchestrator returns result with one agent executed
      const resultWithAgent = {
        ...mockResultWithFindings,
        agentResults: [{ agentId: 'agent:security-audit', status: 'success' as const, durationMs: 100, executionId: 'exec-1', sarif: { $schema: '', version: '2.1.0' as const, runs: [] } }],
      };
      mockOrchestrator.run.mockResolvedValueOnce(resultWithAgent);

      // discoverInstalledAgents runs against process.cwd() which in test context
      // has node_modules/@gitgov/agent-security-audit (real package).
      // We verify the output behavior: if unregistered agents exist, they're listed.
      // Since security-audit IS in agentResults, it won't be listed as unregistered.
      const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => { });

      await auditCommand.execute(createDefaultOptions());

      // The discovery runs but security-audit is registered+executed → not listed
      // No unregistered agents in test env → no "Available but not registered" message
      // This validates that the code path runs without error
      const logCalls = mockConsoleLog.mock.calls.map(c => String(c[0])).join('\n');
      expect(logCalls).not.toContain('Available but not registered');

      mockConsoleLog.mockRestore();
    });
  });
});
