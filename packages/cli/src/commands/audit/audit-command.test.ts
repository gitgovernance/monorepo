/**
 * AuditCommand Unit Tests — AuditOrchestrator integration
 *
 * EARS Coverage:
 * - §4.1 CLI -> Orchestrator Integration (AORCH-C1 to C6)
 * - §4.2 Waiver Management (EARS-E1 to E5)
 */

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
import type { AuditOrchestrator, SourceAuditor, FeedbackRecord, ActorRecord } from '@gitgov/core';

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation();

// Get mocked DI
const mockDI = jest.mocked(DependencyInjectionService);

// Mock orchestrator
let mockOrchestrator: {
  run: jest.MockedFunction<(options: AuditOrchestrator.AuditOrchestrationOptions) => Promise<AuditOrchestrator.AuditOrchestrationResult>>;
};

let mockWaiverReader: {
  loadActiveWaivers: jest.MockedFunction<() => Promise<SourceAuditor.ActiveWaiver[]>>;
};

let mockFeedbackAdapter: {
  create: jest.MockedFunction<(data: Partial<FeedbackRecord>, actorId: string) => Promise<FeedbackRecord>>;
};

let mockIdentityAdapter: {
  getCurrentActor: jest.MockedFunction<() => Promise<ActorRecord>>;
};

describe('AuditCommand', () => {
  let auditCommand: AuditCommand;

  const mockPolicyDecisionPass: AuditOrchestrator.PolicyDecision = {
    decision: 'pass',
    reason: 'No findings exceed configured thresholds.',
    blockingFindings: [],
    waivedFindings: [],
    summary: { critical: 0, high: 0, medium: 0, low: 0 },
    rulesEvaluated: [],
    evaluatedAt: '2026-03-18T00:00:00.000Z',
  };

  const mockPolicyDecisionBlock: AuditOrchestrator.PolicyDecision = {
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
        reportedBy: ['agent:security-auditor'],
        isWaived: false,
      },
    ],
    waivedFindings: [],
    summary: { critical: 1, high: 1, medium: 0, low: 0 },
    rulesEvaluated: [{ ruleName: 'severityThreshold', passed: false, reason: '1 finding(s) at or above critical threshold.' }],
    evaluatedAt: '2026-03-18T00:00:00.000Z',
  };

  const mockResultWithFindings: AuditOrchestrator.AuditOrchestrationResult = {
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

  const mockEmptyResult: AuditOrchestrator.AuditOrchestrationResult = {
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
      loadActiveWaivers: jest.fn().mockResolvedValue([]),
    };

    mockFeedbackAdapter = {
      create: jest.fn().mockResolvedValue({ id: 'feedback-123' } as FeedbackRecord),
    };

    mockIdentityAdapter = {
      getCurrentActor: jest.fn().mockResolvedValue({ id: 'human:developer' } as ActorRecord),
    };

    // Configure DI mock
    mockDI.getInstance.mockReturnValue({
      getAuditOrchestrator: jest.fn().mockResolvedValue(mockOrchestrator),
      getWaiverReader: jest.fn().mockResolvedValue(mockWaiverReader),
      getFeedbackAdapter: jest.fn().mockResolvedValue(mockFeedbackAdapter),
      getIdentityAdapter: jest.fn().mockResolvedValue(mockIdentityAdapter),
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

    it('[AORCH-C1] should generate a taskId for each run', async () => {
      await auditCommand.execute(createDefaultOptions({ scope: 'full' }));

      const callArg = mockOrchestrator.run.mock.calls[0]![0];
      expect(callArg.taskId).toBeDefined();
      expect(callArg.taskId).toMatch(/^task-audit-/);
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

  describe('4.2. Waiver Management (EARS-E1 to E5)', () => {
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
      mockWaiverReader.loadActiveWaivers.mockResolvedValue([
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
          } as SourceAuditor.ActiveWaiver['feedback'],
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
      mockWaiverReader.loadActiveWaivers.mockResolvedValue([]);

      await auditCommand.executeWaive(undefined, { list: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('No active waivers'));
    });
  });
});
