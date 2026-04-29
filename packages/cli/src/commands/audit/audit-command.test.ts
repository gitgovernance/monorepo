/**
 * AuditCommand Unit Tests — AuditOrchestrator integration
 *
 * EARS Coverage:
 * - §4.1 CLI -> Orchestrator Integration (AORCH-C1 to C6)
 * - §4.5 Waiver Management (EARS-E1 to E5)
 */

// Mock @gitgov/core/audit
const mockFormatAuditResult = jest.fn();
jest.mock('@gitgov/core/audit', () => ({
  formatAuditResult: (...args: unknown[]) => mockFormatAuditResult(...args),
  severityBadge: jest.fn((s: string) => ({ critical: '🔴', high: '🟠', medium: '🟡', low: '🔵' })[s] ?? '⚪'),
}));

// Mock @gitgov/core/github — CLI uses GitHubCiReporter.fromToken() (no Octokit import)
const mockPostOrUpdateComment = jest.fn().mockResolvedValue(undefined);
jest.mock('@gitgov/core/github', () => ({
  GitHubCiReporter: {
    fromToken: jest.fn().mockReturnValue({
      postOrUpdateComment: mockPostOrUpdateComment,
    }),
  },
  GitHubApiError: class extends Error { code = 'UNKNOWN'; },
  isOctokitRequestError: jest.fn(() => false),
  mapOctokitError: jest.fn(),
}));

// Mock @gitgov/core
jest.doMock('@gitgov/core', () => {
  const actual = jest.requireActual('@gitgov/core');
  return {
    Config: {
      ConfigManager: {
        findProjectRoot: jest.fn().mockReturnValue('/mock/project/root'),
        findGitgovRoot: jest.fn().mockReturnValue('/mock/project/root/.gitgov'),
      }
    },
    SourceAuditor: {
      SourceAuditorModule: jest.fn(),
      WaiverReader: jest.fn(),
      WaiverWriter: jest.fn(),
    },
    AuditOrchestrator: {
      createAuditOrchestrator: jest.fn(),
    },
    PolicyEvaluator: {
      createPolicyEvaluator: jest.fn(),
    },
    FindingDetector: {
      FindingDetectorModule: jest.fn(),
    },
    Sarif: actual.Sarif,
    generateExecutionId: actual.generateExecutionId ?? ((title: string, ts: number) => `${ts}-exec-${title}`),
  };
});

// Mock DependencyInjectionService
jest.mock('../../services/dependency-injection', () => ({
  DependencyInjectionService: {
    getInstance: jest.fn()
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
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation();

// Get mocked DI
const mockDI = jest.mocked(DependencyInjectionService);

// Mock orchestrator
let mockOrchestrator: {
  run: jest.MockedFunction<(options: AuditOrchestrationOptions) => Promise<AuditOrchestrationResult>>;
};

let mockWaiverReader: {
  loadWaivers: jest.MockedFunction<() => Promise<Waiver[]>>;
};

let mockFeedbackAdapter: {
  create: jest.MockedFunction<(data: Partial<FeedbackRecord>, actorId: string) => Promise<FeedbackRecord>>;
};

let mockIdentityAdapter: {
  getCurrentActor: jest.MockedFunction<() => Promise<ActorRecord>>;
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
    findings: [
      {
        fingerprint: 'sha256:abc123def456',
        ruleId: 'SEC-001',
        message: 'API key hardcoded',
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
    jest.clearAllMocks();

    // Setup mock orchestrator
    mockOrchestrator = {
      run: jest.fn().mockResolvedValue(mockResultWithFindings),
    };

    mockWaiverReader = {
      loadWaivers: jest.fn().mockResolvedValue([]),
    };

    mockFeedbackAdapter = {
      create: jest.fn().mockResolvedValue({ id: 'feedback-123' } as FeedbackRecord),
    };

    mockIdentityAdapter = {
      getCurrentActor: jest.fn().mockResolvedValue({ id: 'human:developer' } as ActorRecord),
    };

    // Mock backlog adapter for TaskRecord creation (AORCH-C1)
    const mockBacklogAdapter = {
      createTask: jest.fn().mockResolvedValue({
        id: '1774524476-task-audit-full-scan',
        title: 'Audit: diff scan',
        status: 'active',
      }),
    };

    // Configure DI mock
    mockDI.getInstance.mockReturnValue({
      getAuditOrchestrator: jest.fn().mockResolvedValue(mockOrchestrator),
      getBacklogAdapter: jest.fn().mockResolvedValue(mockBacklogAdapter),
      getWaiverReader: jest.fn().mockResolvedValue(mockWaiverReader),
      getFeedbackAdapter: jest.fn().mockResolvedValue(mockFeedbackAdapter),
      getIdentityAdapter: jest.fn().mockResolvedValue(mockIdentityAdapter),
      getSessionManager: jest.fn().mockResolvedValue({
        getState: jest.fn().mockReturnValue({ actorId: 'human:developer' }),
      }),
    } as unknown as DependencyInjectionService);

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

  describe('4.1. CLI -> Orchestrator Integration (AORCH-C1 to C6)', () => {
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

    it('[AORCH-C6] should not accept --detector, --target, --max-findings, --group-by flags', () => {
      // Verify these options are not in AuditCommandOptions type
      // This is a type-level test enforced by the interface.
      // At runtime, we verify the register method does not add these options.
      const program = new (jest.requireActual('commander').Command)();
      auditCommand.register(program);

      const auditCmd = program.commands.find((c: { name: () => string }) => c.name() === 'audit');
      expect(auditCmd).toBeDefined();

      const optionNames = auditCmd.options.map((o: { long: string }) => o.long);
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
      const createTaskArgs = (backlogAdapter.createTask as jest.Mock).mock.calls[0];
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

    it('should handle initialization errors gracefully', async () => {
      mockDI.getInstance.mockReturnValue({
        getAuditOrchestrator: jest.fn().mockRejectedValue(new Error('Init failed')),
      } as unknown as DependencyInjectionService);

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

  describe('4.5. Waiver Management (EARS-E1 to E5)', () => {
    it('[EARS-E1] should create FeedbackRecord with waiver metadata', async () => {
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

    it('[EARS-E2] should require --justification for waive command', async () => {
      await auditCommand.executeWaive('sha256:abc123', {});

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Justification required'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-E3] should list active waivers with --list', async () => {
      mockWaiverReader.loadWaivers.mockResolvedValue([
        {
          fingerprint: 'sha256:waiver1',
          ruleId: 'SEC-001',
          feedback: {
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
          } as Waiver['feedback'],
        },
      ]);

      await auditCommand.executeWaive(undefined, { list: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Active Waivers'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('sha256:waiver1'));
    });

    it('[EARS-E4] should show confirmation when waiver created', async () => {
      await auditCommand.executeWaive('sha256:abc123', {
        justification: 'False positive',
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Waiver created successfully'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('sha256:abc123'));
    });

    it('[EARS-E5] should show empty message when no active waivers', async () => {
      mockWaiverReader.loadWaivers.mockResolvedValue([]);

      await auditCommand.executeWaive(undefined, { list: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('No active waivers'));
    });
  });

  // ==========================================================================
  // 4.8. CI Mode + LLM Config (AORCH-D1 to D7) — Cycle 1 gate_product
  // ==========================================================================

  describe('4.8. CI Mode + LLM Config (AORCH-D1 to D7)', () => {
    const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation();
    const eventFixture = JSON.stringify({ pull_request: { number: 42 } });

    beforeEach(() => {
      jest.clearAllMocks();
      mockOrchestrator.run.mockResolvedValue(mockResultWithFindings);
      mockFormatAuditResult.mockReturnValue('## 🔴 GitGov Gate: 2 findings');
      mockPostOrUpdateComment.mockResolvedValue(undefined);
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
        '## 🔴 GitGov Gate: 2 findings',
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
      jest.doMock('@gitgov/core/github', () => { throw new Error('module load failed'); });

      await auditCommand.execute(createDefaultOptions({ ci: true }));

      // Exit code should still be based on policy (block → 1), not on comment failure
      expect(mockProcessExit).toHaveBeenCalledWith(1);

      // Restore mock
      jest.doMock('@gitgov/core/github', () => ({
        GitHubCiReporter: jest.fn().mockImplementation(() => ({
          postOrUpdateComment: mockPostOrUpdateComment,
        })),
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
});
