import { runAgent } from './src/agent';
import { DEFAULT_CONFIG } from './src/config';

type SarifLog = {
  $schema: string;
  version: '2.1.0';
  runs: Array<{
    tool: { driver: { name: string; version: string; informationUri: string; rules: unknown[] } };
    results: unknown[];
  }>;
};

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockAuditResult = {
  findings: [
    {
      id: 'f1',
      ruleId: 'PII-001',
      category: 'pii-email' as const,
      severity: 'high' as const,
      file: 'src/app.ts',
      line: 10,
      snippet: 'const email = "user@test.com"',
      message: 'Hardcoded email address detected',
      detector: 'regex' as const,
      fingerprint: 'abc123',
      confidence: 0.95,
    },
  ],
  summary: {
    total: 1,
    bySeverity: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
    byCategory: { 'pii-email': 1 },
    byDetector: { regex: 1, heuristic: 0, llm: 0 },
  },
  scannedFiles: 5,
  scannedLines: 200,
  duration: 42,
  detectors: ['regex' as const],
  waivers: { acknowledged: 0, new: 1 },
};

const mockAuditFn = jest.fn().mockResolvedValue(mockAuditResult);

// Mock @gitgov/core
jest.mock('@gitgov/core', () => ({
  SourceAuditor: {
    SourceAuditorModule: jest.fn().mockImplementation(() => ({
      audit: mockAuditFn,
    })),
  },
  FindingDetector: {
    FindingDetectorModule: jest.fn().mockImplementation(() => ({})),
  },
  Sarif: {
    createSarifBuilder: jest.fn().mockReturnValue({
      build: jest.fn().mockImplementation(async (opts: Record<string, unknown>) => ({
        $schema: 'https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json',
        version: '2.1.0' as const,
        runs: [{
          tool: {
            driver: {
              name: opts['toolName'] as string,
              version: opts['toolVersion'] as string,
              informationUri: opts['informationUri'] as string,
              rules: [],
            },
          },
          results: [],
        }],
      })),
    }),
  },
}));

// Mock @gitgov/core/fs
jest.mock('@gitgov/core/fs', () => ({
  findProjectRoot: jest.fn().mockReturnValue('/mock/project'),
  FsFileLister: jest.fn().mockImplementation(() => ({})),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createCtx(input: Record<string, unknown>) {
  return {
    agentId: 'agent:gitgov:security-audit',
    actorId: 'actor:agent:security-audit',
    taskId: 'task-001',
    runId: 'run-001',
    input,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SecurityAuditAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('4.1. Agent Execution (AORCH-B9)', () => {
    it('[AORCH-B9] should run SourceAuditorModule.audit() with scope from ctx.input', async () => {
      const ctx = createCtx({
        scope: 'diff',
        include: ['src/**/*.ts'],
        exclude: ['**/*.test.ts'],
        taskId: 'task-001',
      });

      await runAgent(ctx);

      // Verify SourceAuditorModule was instantiated
      const { SourceAuditor } = jest.requireMock('@gitgov/core') as {
        SourceAuditor: { SourceAuditorModule: jest.Mock };
      };
      expect(SourceAuditor.SourceAuditorModule).toHaveBeenCalledTimes(1);

      // Verify audit() was called with the correct scope from input
      expect(mockAuditFn).toHaveBeenCalledTimes(1);
      const auditOptions = mockAuditFn.mock.calls[0]![0] as {
        baseDir: string;
        scope: { include: string[]; exclude: string[] };
      };
      expect(auditOptions.scope.include).toEqual(['src/**/*.ts']);
      expect(auditOptions.scope.exclude).toEqual(['**/*.test.ts']);
    });
  });

  describe('4.2. SARIF Output (AORCH-B10)', () => {
    it('[AORCH-B10] should return AgentOutput with metadata.kind sarif and valid SarifLog', async () => {
      const ctx = createCtx({
        scope: 'full',
        taskId: 'task-002',
      });

      const output = await runAgent(ctx);

      // Verify metadata shape
      expect(output.metadata).toBeDefined();
      expect(output.metadata!['kind']).toBe('sarif');
      expect(output.metadata!['version']).toBe('2.1.0');

      // Verify data is a valid SarifLog structure
      const sarifLog = output.metadata!['data'] as SarifLog;
      expect(sarifLog.version).toBe('2.1.0');
      expect(sarifLog.$schema).toContain('sarif-schema-2.1.0');
      expect(Array.isArray(sarifLog.runs)).toBe(true);
      expect(sarifLog.runs.length).toBeGreaterThan(0);

      // Verify message is present
      expect(output.message).toContain('Security audit completed');
    });
  });

  describe('4.3. Internal Configuration (AORCH-B11)', () => {
    it('[AORCH-B11] should use detectors from internal config.ts without external --detector param', async () => {
      // Input has NO detector field — only scope and taskId
      const ctx = createCtx({
        scope: 'diff',
        taskId: 'task-003',
      });

      await runAgent(ctx);

      // Verify FindingDetectorModule was created with the internal config
      const { FindingDetector } = jest.requireMock('@gitgov/core') as {
        FindingDetector: { FindingDetectorModule: jest.Mock };
      };
      expect(FindingDetector.FindingDetectorModule).toHaveBeenCalledTimes(1);
      expect(FindingDetector.FindingDetectorModule).toHaveBeenCalledWith(
        DEFAULT_CONFIG.detectorConfig
      );

      // Verify audit was still called (agent works without external detector config)
      expect(mockAuditFn).toHaveBeenCalledTimes(1);

      // Verify default include/exclude from config were used (no include/exclude in input)
      const auditOptions = mockAuditFn.mock.calls[0]![0] as {
        scope: { include: string[]; exclude: string[] };
      };
      expect(auditOptions.scope.include).toEqual(DEFAULT_CONFIG.defaultInclude);
      expect(auditOptions.scope.exclude).toEqual(DEFAULT_CONFIG.defaultExclude);
    });
  });
});
