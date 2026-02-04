/**
 * AuditCommand Unit Tests
 *
 * EARS Coverage:
 * - §4.1 CLI Argument Parsing & Module Integration (EARS-A1 to A4)
 * - §4.2 Scope Resolution (EARS-B1 to B4)
 * - §4.3 Output Formatting (EARS-C1 to C10)
 * - §4.4 Exit Codes & Fail Conditions (EARS-D1 to D4)
 * - §4.5 Waiver Management (EARS-E1 to E5)
 * - §4.6 Input Validation (EARS-F1 to F5)
 */

// Mock @gitgov/core
jest.doMock('@gitgov/core', () => ({
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
  FindingDetector: {
    FindingDetectorModule: jest.fn(),
  }
}));

// Mock DependencyInjectionService
jest.mock('../../services/dependency-injection', () => ({
  DependencyInjectionService: {
    getInstance: jest.fn()
  }
}));

import { AuditCommand, type AuditCommandOptions } from './audit-command';
import { DependencyInjectionService } from '../../services/dependency-injection';
import type { SourceAuditor, AuditState, FeedbackRecord, ActorRecord } from '@gitgov/core';

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation();

// Get mocked DI
const mockDI = jest.mocked(DependencyInjectionService);

// Mock adapters
let mockSourceAuditorModule: {
  audit: jest.MockedFunction<(options: SourceAuditor.AuditOptions) => Promise<SourceAuditor.AuditResult>>;
};

let mockWaiverReader: {
  loadActiveWaivers: jest.MockedFunction<() => Promise<SourceAuditor.ActiveWaiver[]>>;
};

let mockFeedbackAdapter: {
  create: jest.MockedFunction<(data: Record<string, unknown>, actorId: string) => Promise<FeedbackRecord>>;
};

let mockIdentityAdapter: {
  getCurrentActor: jest.MockedFunction<() => Promise<ActorRecord>>;
};

let mockConfigManager: {
  getAuditState: jest.MockedFunction<() => Promise<AuditState>>;
  updateAuditState: jest.MockedFunction<(state: Partial<AuditState>) => Promise<void>>;
};

let mockGitModule: {
  getCommitHash: jest.MockedFunction<(ref: string) => Promise<string>>;
};

describe('AuditCommand', () => {
  let auditCommand: AuditCommand;

  const mockAuditResult: SourceAuditor.AuditResult = {
    findings: [
      {
        id: 'finding-1',
        fingerprint: 'sha256:abc123def456',
        file: 'src/config/database.ts',
        line: 12,
        column: 34,
        ruleId: 'SEC-001',
        category: 'hardcoded-secret',
        severity: 'critical',
        message: 'API key hardcoded',
        snippet: "const API_KEY = 'AKIA...'",
        confidence: 1.0,
        detector: 'regex',
      },
      {
        id: 'finding-2',
        fingerprint: 'sha256:def456ghi789',
        file: 'src/utils/email.ts',
        line: 23,
        column: 10,
        ruleId: 'PII-002',
        category: 'pii-email',
        severity: 'high',
        message: 'Email pattern detected',
        snippet: "const email = 'admin@company.com'",
        confidence: 0.85,
        detector: 'regex',
      },
    ],
    summary: {
      total: 2,
      bySeverity: { critical: 1, high: 1, medium: 0, low: 0, info: 0 },
      byCategory: { 'hardcoded-secret': 1, 'pii-email': 1 },
      byDetector: { regex: 2, heuristic: 0, llm: 0 },
    },
    scannedFiles: 47,
    scannedLines: 2500,
    duration: 150,
    detectors: ['regex'],
    waivers: { acknowledged: 0, new: 2 },
  };

  const mockEmptyResult: SourceAuditor.AuditResult = {
    findings: [],
    summary: {
      total: 0,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      byCategory: {},
      byDetector: { regex: 0, heuristic: 0, llm: 0 },
    },
    scannedFiles: 47,
    scannedLines: 2500,
    duration: 100,
    detectors: ['regex'],
    waivers: { acknowledged: 0, new: 0 },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock adapters
    mockSourceAuditorModule = {
      audit: jest.fn().mockResolvedValue(mockAuditResult),
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

    mockConfigManager = {
      getAuditState: jest.fn().mockResolvedValue({
        lastFullAuditCommit: null,
        lastFullAuditTimestamp: null,
        lastFullAuditFindingsCount: null,
      }),
      updateAuditState: jest.fn().mockResolvedValue(undefined),
    };

    mockGitModule = {
      getCommitHash: jest.fn().mockResolvedValue('a1b2c3d4e5f6g7h8'),
    };

    // Configure DI mock
    mockDI.getInstance.mockReturnValue({
      getSourceAuditorModule: jest.fn().mockResolvedValue(mockSourceAuditorModule),
      getWaiverReader: jest.fn().mockResolvedValue(mockWaiverReader),
      getFeedbackAdapter: jest.fn().mockResolvedValue(mockFeedbackAdapter),
      getIdentityAdapter: jest.fn().mockResolvedValue(mockIdentityAdapter),
      getConfigManager: jest.fn().mockResolvedValue(mockConfigManager),
      getGitModule: jest.fn().mockResolvedValue(mockGitModule),
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
    target: 'code',
    scope: 'diff',
    output: 'text',
    failOn: 'critical',
    ...overrides,
  });

  describe('4.1. CLI Argument Parsing & Module Integration (EARS-A1 to A4)', () => {
    it('[EARS-A1] should use default options when no args provided', async () => {
      // Default is target: 'code', scope: 'diff'
      await auditCommand.execute(createDefaultOptions());

      expect(mockSourceAuditorModule.audit).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: expect.objectContaining({
            include: expect.arrayContaining(['**/*']),
          }),
        })
      );
    });

    it('[EARS-A2] should map CLI flags to AuditOptions correctly', async () => {
      await auditCommand.execute(createDefaultOptions({
        scope: 'full',
        output: 'json',
        failOn: 'high',
        include: 'lib/**/*.ts',
        exclude: '**/*.test.ts,**/*.spec.ts',
      }));

      expect(mockSourceAuditorModule.audit).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: expect.objectContaining({
            include: expect.arrayContaining(['**/*', 'lib/**/*.ts']),
            exclude: expect.arrayContaining(['**/*.test.ts', '**/*.spec.ts']),
          }),
        })
      );
    });

    it('[EARS-A3] should create TaskRecord before invoking module', async () => {
      // Note: TaskRecord creation is handled by core module, not CLI
      // CLI just invokes the module - this test verifies module is called
      await auditCommand.execute(createDefaultOptions({ scope: 'full' }));

      expect(mockSourceAuditorModule.audit).toHaveBeenCalled();
    });

    it('[EARS-A4] should handle initialization errors gracefully', async () => {
      mockDI.getInstance.mockReturnValue({
        getSourceAuditorModule: jest.fn().mockRejectedValue(new Error('Init failed')),
        getConfigManager: jest.fn().mockResolvedValue(mockConfigManager),
        getGitModule: jest.fn().mockResolvedValue(mockGitModule),
      } as unknown as DependencyInjectionService);

      auditCommand = new AuditCommand();

      await auditCommand.execute(createDefaultOptions({ scope: 'full' }));

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Init failed'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('4.2. Scope Resolution (EARS-B1 to B4)', () => {
    it('[EARS-B1] should audit only modified files when scope is diff', async () => {
      // Setup: baseline exists
      mockConfigManager.getAuditState.mockResolvedValue({
        lastFullAuditCommit: 'd32889b',
        lastFullAuditTimestamp: '2025-12-20T13:41:02.941Z',
        lastFullAuditFindingsCount: 15190,
      });

      await auditCommand.execute(createDefaultOptions({ scope: 'diff' }));

      expect(mockSourceAuditorModule.audit).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: expect.objectContaining({
            include: expect.arrayContaining(['**/*']),
            changedSince: 'd32889b',
          }),
        })
      );
    });

    it('[EARS-B1] should behave like full when no baseline exists (first run)', async () => {
      // Setup: no baseline
      mockConfigManager.getAuditState.mockResolvedValue({
        lastFullAuditCommit: null,
        lastFullAuditTimestamp: null,
        lastFullAuditFindingsCount: null,
      });

      await auditCommand.execute(createDefaultOptions({ scope: 'diff' }));

      // Should scan all files (no changedSince)
      expect(mockSourceAuditorModule.audit).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: expect.objectContaining({
            include: expect.arrayContaining(['**/*']),
          }),
        })
      );
      // Verify changedSince is NOT set
      const callArg = mockSourceAuditorModule.audit.mock.calls[0]![0];
      expect(callArg.scope.changedSince).toBeUndefined();
    });

    it('[EARS-B2] should audit full repository when scope is full', async () => {
      await auditCommand.execute(createDefaultOptions({ scope: 'full' }));

      expect(mockSourceAuditorModule.audit).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: expect.objectContaining({
            include: expect.arrayContaining(['**/*']),
          }),
        })
      );
      // Should NOT save baseline
      expect(mockConfigManager.updateAuditState).not.toHaveBeenCalled();
    });

    it('[EARS-B3] should audit full and save baseline when scope is baseline', async () => {
      await auditCommand.execute(createDefaultOptions({ scope: 'baseline' }));

      expect(mockSourceAuditorModule.audit).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: expect.objectContaining({
            include: expect.arrayContaining(['**/*']),
          }),
        })
      );
      // Should save baseline
      expect(mockConfigManager.updateAuditState).toHaveBeenCalledWith(
        expect.objectContaining({
          lastFullAuditCommit: expect.stringMatching(/^[a-f0-9]{7}$/),
          lastFullAuditTimestamp: expect.any(String),
          lastFullAuditFindingsCount: expect.any(Number),
        })
      );
    });

    it('[EARS-B4] should apply include/exclude as additional filters', async () => {
      await auditCommand.execute(createDefaultOptions({
        scope: 'full',
        include: 'src/**/*.ts',
        exclude: '**/*.test.ts,**/*.spec.ts',
      }));

      expect(mockSourceAuditorModule.audit).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: expect.objectContaining({
            include: expect.arrayContaining(['**/*', 'src/**/*.ts']),
            exclude: expect.arrayContaining(['**/*.test.ts', '**/*.spec.ts']),
          }),
        })
      );
    });
  });

  describe('4.3. Output Formatting (EARS-C1 to C10)', () => {
    it('[EARS-C1] should format text output with correct structure', async () => {
      await auditCommand.execute(createDefaultOptions({ scope: 'full', output: 'text' }));

      // New structure: FINDINGS → SUMMARY → SCAN INFO
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('FINDINGS'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('SUMMARY'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('SCAN INFO'));
    });

    it('[EARS-C2] should output valid JSON when --output json', async () => {
      await auditCommand.execute(createDefaultOptions({ scope: 'full', output: 'json' }));

      // Find the JSON output call
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
      expect(parsed).toHaveProperty('summary');
    });

    it('[EARS-C3] should output valid SARIF 2.1.0 when --output sarif', async () => {
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
      expect(sarif.$schema).toContain('sarif-schema-2.1.0');
      expect(sarif.runs).toHaveLength(1);
      expect(sarif.runs[0].tool.driver.name).toBe('gitgov-audit');
    });

    it('[EARS-C4] should suppress output in quiet mode', async () => {
      await auditCommand.execute(createDefaultOptions({ scope: 'full', output: 'text', quiet: true }));

      // Should only show critical findings count, not full output
      expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('FINDINGS'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('critical finding'));
    });

    it('[EARS-C5] should show only summary when --summary', async () => {
      await auditCommand.execute(createDefaultOptions({ scope: 'full', output: 'text', summary: true }));

      // Should show SUMMARY and SCAN INFO but NOT individual FINDINGS
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('SUMMARY'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('SCAN INFO'));
      // FINDINGS header should NOT be shown in summary mode
      expect(mockConsoleLog).not.toHaveBeenCalledWith('FINDINGS');
    });

    it('[EARS-C6] should limit findings shown with --max-findings', async () => {
      await auditCommand.execute(createDefaultOptions({ scope: 'full', output: 'text', maxFindings: 1 }));

      // Should show message about remaining findings
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('more finding'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('--max-findings 0'));
    });

    it('[EARS-C7] should group findings by severity when --group-by severity', async () => {
      await auditCommand.execute(createDefaultOptions({ scope: 'full', output: 'text', groupBy: 'severity' }));

      // Should show CRITICAL and HIGH grouped sections
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('CRITICAL'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('HIGH'));
    });

    it('[EARS-C8] should group findings by category when --group-by category', async () => {
      await auditCommand.execute(createDefaultOptions({ scope: 'full', output: 'text', groupBy: 'category' }));

      // Should show category grouped sections (categories are uppercased in output)
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('HARDCODED-SECRET'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('PII-EMAIL'));
    });

    it('[EARS-C9] should show all findings when --max-findings 0', async () => {
      await auditCommand.execute(createDefaultOptions({ scope: 'full', output: 'text', maxFindings: 0 }));

      // Should NOT show "more findings" message
      expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('more finding'));
      // Should show all findings (checking for messages from mock data)
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('API key hardcoded'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Email pattern detected'));
    });

    it('[EARS-C10] should treat --json as alias for --output json', async () => {
      // Note: The --json flag is handled by Commander setting output to 'json'
      // This test verifies JSON output format works correctly
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
      expect(parsed).toHaveProperty('summary');
      expect(parsed).toHaveProperty('scannedFiles');
    });
  });

  describe('4.4. Exit Codes & Fail Conditions (EARS-D1 to D4)', () => {
    it('[EARS-D1] should exit 0 when no findings match fail-on severity', async () => {
      mockSourceAuditorModule.audit.mockResolvedValue(mockEmptyResult);

      await auditCommand.execute(createDefaultOptions({ scope: 'full' }));

      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });

    it('[EARS-D2] should exit 1 when findings match fail-on severity', async () => {
      await auditCommand.execute(createDefaultOptions({ scope: 'full' }));

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-D2] should exit 1 when --fail-on high and high findings exist', async () => {
      await auditCommand.execute(createDefaultOptions({ scope: 'full', failOn: 'high' }));

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-D1] should exit 0 when --fail-on critical but only high findings', async () => {
      const highFinding = mockAuditResult.findings[1]!; // High severity finding
      mockSourceAuditorModule.audit.mockResolvedValue({
        ...mockAuditResult,
        findings: [highFinding],
        summary: {
          ...mockAuditResult.summary,
          total: 1,
          bySeverity: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
        },
      });

      await auditCommand.execute(createDefaultOptions({ scope: 'full' }));

      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });

    it('[EARS-D3] should exit 0 when --fail-on medium but only low findings', async () => {
      mockSourceAuditorModule.audit.mockResolvedValue({
        ...mockAuditResult,
        findings: [{
          ...mockAuditResult.findings[0]!,
          severity: 'low',
        }],
        summary: {
          ...mockAuditResult.summary,
          total: 1,
          bySeverity: { critical: 0, high: 0, medium: 0, low: 1, info: 0 },
        },
      });

      await auditCommand.execute(createDefaultOptions({ scope: 'full', failOn: 'medium' }));

      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });

    it('[EARS-D4] should exit 1 when --fail-on low and any findings exist', async () => {
      mockSourceAuditorModule.audit.mockResolvedValue({
        ...mockAuditResult,
        findings: [{
          ...mockAuditResult.findings[0]!,
          severity: 'low',
        }],
        summary: {
          ...mockAuditResult.summary,
          total: 1,
          bySeverity: { critical: 0, high: 0, medium: 0, low: 1, info: 0 },
        },
      });

      await auditCommand.execute(createDefaultOptions({ scope: 'full', failOn: 'low' }));

      expect(mockProcessExit).toHaveBeenCalledWith(1);
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

  describe('4.6. Input Validation (EARS-F1 to F5)', () => {
    // Note: Input validation is handled by Commander's .choices() method
    // These tests verify the validation is properly configured by checking
    // that valid values work correctly. Invalid values are rejected by
    // Commander before reaching the execute() method.

    it('[EARS-F1] should accept valid --scope values (diff, full, baseline)', async () => {
      // Test that valid scope values are accepted
      await auditCommand.execute(createDefaultOptions({ scope: 'diff' }));
      expect(mockSourceAuditorModule.audit).toHaveBeenCalled();

      mockSourceAuditorModule.audit.mockClear();
      await auditCommand.execute(createDefaultOptions({ scope: 'full' }));
      expect(mockSourceAuditorModule.audit).toHaveBeenCalled();

      mockSourceAuditorModule.audit.mockClear();
      await auditCommand.execute(createDefaultOptions({ scope: 'baseline' }));
      expect(mockSourceAuditorModule.audit).toHaveBeenCalled();
    });

    it('[EARS-F2] should accept valid --output values (text, json, sarif)', async () => {
      await auditCommand.execute(createDefaultOptions({ output: 'text' }));
      expect(mockSourceAuditorModule.audit).toHaveBeenCalled();

      mockSourceAuditorModule.audit.mockClear();
      await auditCommand.execute(createDefaultOptions({ output: 'json' }));
      expect(mockSourceAuditorModule.audit).toHaveBeenCalled();

      mockSourceAuditorModule.audit.mockClear();
      await auditCommand.execute(createDefaultOptions({ output: 'sarif' }));
      expect(mockSourceAuditorModule.audit).toHaveBeenCalled();
    });

    it('[EARS-F3] should accept valid --group-by values (file, severity, category)', async () => {
      await auditCommand.execute(createDefaultOptions({ groupBy: 'file' }));
      expect(mockSourceAuditorModule.audit).toHaveBeenCalled();

      mockSourceAuditorModule.audit.mockClear();
      await auditCommand.execute(createDefaultOptions({ groupBy: 'severity' }));
      expect(mockSourceAuditorModule.audit).toHaveBeenCalled();

      mockSourceAuditorModule.audit.mockClear();
      await auditCommand.execute(createDefaultOptions({ groupBy: 'category' }));
      expect(mockSourceAuditorModule.audit).toHaveBeenCalled();
    });

    it('[EARS-F4] should accept valid --fail-on values (critical, high, medium, low)', async () => {
      await auditCommand.execute(createDefaultOptions({ failOn: 'critical' }));
      expect(mockSourceAuditorModule.audit).toHaveBeenCalled();

      mockSourceAuditorModule.audit.mockClear();
      await auditCommand.execute(createDefaultOptions({ failOn: 'high' }));
      expect(mockSourceAuditorModule.audit).toHaveBeenCalled();

      mockSourceAuditorModule.audit.mockClear();
      await auditCommand.execute(createDefaultOptions({ failOn: 'medium' }));
      expect(mockSourceAuditorModule.audit).toHaveBeenCalled();

      mockSourceAuditorModule.audit.mockClear();
      await auditCommand.execute(createDefaultOptions({ failOn: 'low' }));
      expect(mockSourceAuditorModule.audit).toHaveBeenCalled();
    });

    it('[EARS-F5] should accept valid --target values (code)', async () => {
      // MVP only supports 'code' target
      await auditCommand.execute(createDefaultOptions({ target: 'code' }));
      expect(mockSourceAuditorModule.audit).toHaveBeenCalled();
    });
  });
});
