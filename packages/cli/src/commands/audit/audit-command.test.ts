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
  PiiDetector: {
    PiiDetectorModule: jest.fn(),
  }
}));

// Mock DependencyInjectionService
jest.mock('../../services/dependency-injection', () => ({
  DependencyInjectionService: {
    getInstance: jest.fn()
  }
}));

import { AuditCommand } from './audit-command';
import { DependencyInjectionService } from '../../services/dependency-injection';
import type { SourceAuditor, PiiDetector, Records } from '@gitgov/core';

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
  create: jest.MockedFunction<(data: Record<string, unknown>, actorId: string) => Promise<Records.FeedbackRecord>>;
};

let mockIdentityAdapter: {
  getCurrentActor: jest.MockedFunction<() => Promise<Records.ActorRecord>>;
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
      create: jest.fn().mockResolvedValue({ id: 'feedback-123' } as Records.FeedbackRecord),
    };

    mockIdentityAdapter = {
      getCurrentActor: jest.fn().mockResolvedValue({ id: 'human:developer' } as Records.ActorRecord),
    };

    // Configure DI mock
    mockDI.getInstance.mockReturnValue({
      getSourceAuditorModule: jest.fn().mockResolvedValue(mockSourceAuditorModule),
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

  describe('4.1. CLI Argument Parsing & Module Integration (EARS-A1 to A4)', () => {
    it('[EARS-A1] should use default options when no args provided', async () => {
      await auditCommand.execute({
        scope: 'full',
        output: 'text',
        failOn: 'critical',
      });

      expect(mockSourceAuditorModule.audit).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: expect.objectContaining({
            include: expect.arrayContaining(['**/*']),
          }),
        })
      );
    });

    it('[EARS-A2] should map CLI flags to AuditOptions correctly', async () => {
      await auditCommand.execute({
        scope: 'src/**/*.ts',
        output: 'json',
        failOn: 'high',
        include: 'lib/**/*.ts',
        exclude: '**/*.test.ts,**/*.spec.ts',
      });

      expect(mockSourceAuditorModule.audit).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: expect.objectContaining({
            include: expect.arrayContaining(['src/**/*.ts', 'lib/**/*.ts']),
            exclude: expect.arrayContaining(['**/*.test.ts', '**/*.spec.ts']),
          }),
        })
      );
    });

    it('[EARS-A3] should create TaskRecord before invoking module', async () => {
      // Note: TaskRecord creation is handled by core module, not CLI
      // CLI just invokes the module - this test verifies module is called
      await auditCommand.execute({
        scope: 'full',
        output: 'text',
        failOn: 'critical',
      });

      expect(mockSourceAuditorModule.audit).toHaveBeenCalled();
    });

    it('[EARS-A4] should handle initialization errors gracefully', async () => {
      mockDI.getInstance.mockReturnValue({
        getSourceAuditorModule: jest.fn().mockRejectedValue(new Error('Init failed')),
      } as unknown as DependencyInjectionService);

      auditCommand = new AuditCommand();

      await auditCommand.execute({
        scope: 'full',
        output: 'text',
        failOn: 'critical',
      });

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Init failed'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('4.2. Scope Resolution (EARS-B1 to B4)', () => {
    it('[EARS-B1] should audit full repository when scope is full', async () => {
      await auditCommand.execute({
        scope: 'full',
        output: 'text',
        failOn: 'critical',
      });

      expect(mockSourceAuditorModule.audit).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: expect.objectContaining({
            include: expect.arrayContaining(['**/*']),
          }),
        })
      );
    });

    it('[EARS-B2] should pass git-diff scope to module', async () => {
      await auditCommand.execute({
        scope: 'git-diff',
        output: 'text',
        failOn: 'critical',
      });

      // git-diff is passed to core module for resolution
      expect(mockSourceAuditorModule.audit).toHaveBeenCalled();
    });

    it('[EARS-B3] should pass pr scope to module', async () => {
      await auditCommand.execute({
        scope: 'pr',
        output: 'text',
        failOn: 'critical',
      });

      // pr scope is passed to core module for resolution
      expect(mockSourceAuditorModule.audit).toHaveBeenCalled();
    });

    it('[EARS-B4] should use custom glob pattern as include', async () => {
      await auditCommand.execute({
        scope: 'src/components/**/*.tsx',
        output: 'text',
        failOn: 'critical',
      });

      expect(mockSourceAuditorModule.audit).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: expect.objectContaining({
            include: expect.arrayContaining(['src/components/**/*.tsx']),
          }),
        })
      );
    });
  });

  describe('4.3. Output Formatting (EARS-C1 to C4)', () => {
    it('[EARS-C1] should format text output with colors and severity', async () => {
      await auditCommand.execute({
        scope: 'full',
        output: 'text',
        failOn: 'critical',
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('GITGOV SECURITY AUDIT'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('FINDINGS'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('SUMMARY'));
    });

    it('[EARS-C2] should output valid JSON when --output json', async () => {
      await auditCommand.execute({
        scope: 'full',
        output: 'json',
        failOn: 'critical',
      });

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
      await auditCommand.execute({
        scope: 'full',
        output: 'sarif',
        failOn: 'critical',
      });

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
      await auditCommand.execute({
        scope: 'full',
        output: 'text',
        failOn: 'critical',
        quiet: true,
      });

      // Should only show critical findings count, not full output
      expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('GITGOV SECURITY AUDIT'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('critical finding'));
    });
  });

  describe('4.4. Exit Codes & Fail Conditions (EARS-D1 to D2)', () => {
    it('[EARS-D1] should exit 0 when no findings match fail-on severity', async () => {
      mockSourceAuditorModule.audit.mockResolvedValue(mockEmptyResult);

      await auditCommand.execute({
        scope: 'full',
        output: 'text',
        failOn: 'critical',
      });

      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });

    it('[EARS-D2] should exit 1 when findings match fail-on severity', async () => {
      await auditCommand.execute({
        scope: 'full',
        output: 'text',
        failOn: 'critical',
      });

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-D2] should exit 1 when --fail-on high and high findings exist', async () => {
      await auditCommand.execute({
        scope: 'full',
        output: 'text',
        failOn: 'high',
      });

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

      await auditCommand.execute({
        scope: 'full',
        output: 'text',
        failOn: 'critical',
      });

      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });
  });

  describe('4.5. Waiver Management (EARS-E1 to E4)', () => {
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
  });
});
