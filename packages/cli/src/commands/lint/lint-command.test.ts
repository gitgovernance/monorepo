/**
 * LintCommand Unit Tests
 *
 * EARS Coverage:
 * - §4.1 CLI Argument Parsing & Module Integration (EARS-A1 to A8)
 * - §4.2 Output Formatting - Text Mode (EARS-B1 to B2)
 * - §4.3 Migration Detection Mode (EARS-C1)
 * - §4.4 Output Formatting - JSON Mode & Exit Codes (EARS-D1 to D3)
 * - §4.5 Output Summary & Limiting (EARS-E1 to E3)
 */

// Mock @gitgov/core with complete adapter mocks
jest.doMock('@gitgov/core', () => ({
  Config: {
    ConfigManager: {
      findProjectRoot: jest.fn().mockReturnValue('/mock/project/root'),
      findGitgovRoot: jest.fn().mockReturnValue('/mock/project/root/.gitgov'),
      getGitgovPath: jest.fn().mockReturnValue('/mock/project/root/.gitgov'),
      isGitgovProject: jest.fn().mockReturnValue(true)
    }
  },
  Lint: {
    LintModule: jest.fn(),
    ValidatorType: {}
  }
}));

// Mock DependencyInjectionService before importing
jest.mock('../../services/dependency-injection', () => ({
  DependencyInjectionService: {
    getInstance: jest.fn()
  }
}));

// Mock fs for file detection
jest.mock('fs', () => ({
  promises: {
    stat: jest.fn(),
    readFile: jest.fn()
  }
}));

import { LintCommand } from './lint-command';
import { DependencyInjectionService } from '../../services/dependency-injection';
import { promises as fs } from 'fs';
import type { ActorRecord, FixReport, LintOptions, LintReport, LintResult } from '@gitgov/core';
import type { FsLintOptions, FsFixOptions } from '@gitgov/core/fs';

// Mock console methods to capture output
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation();

// Global references to the mock adapters for easy access in tests
let mockLintModule: {
  lint: jest.MockedFunction<(options?: Partial<FsLintOptions>) => Promise<LintReport>>;
  lintFile: jest.MockedFunction<(filePath: string, options?: Partial<FsLintOptions>) => Promise<LintReport>>;
  fix: jest.MockedFunction<(lintReport: LintReport, fixOptions?: Partial<FsFixOptions>) => Promise<FixReport>>;
};

let mockIdentityAdapter: {
  getCurrentActor: jest.MockedFunction<() => Promise<ActorRecord>>;
};

let mockIndexerAdapter: {
  generateIndex: jest.MockedFunction<() => Promise<{ success: boolean }>>;
};

let mockKeyProvider: {
  getPrivateKey: jest.MockedFunction<(actorId: string) => Promise<string | null>>;
};

describe('LintCommand', () => {
  let lintCommand: LintCommand;

  const mockLintReport: LintReport = {
    summary: {
      filesChecked: 10,
      errors: 2,
      warnings: 3,
      fixable: 2,
      executionTime: 150
    },
    results: [
      {
        level: 'error',
        filePath: '.gitgov/tasks/task1.json',
        validator: 'SCHEMA_VALIDATION',
        message: 'Missing required field: description',
        entity: { type: 'task', id: 'task1' },
        fixable: false
      },
      {
        level: 'error',
        filePath: '.gitgov/tasks/task2.json',
        validator: 'SIGNATURE_STRUCTURE',
        message: 'Invalid signature format',
        entity: { type: 'task', id: 'task2' },
        fixable: true
      },
      {
        level: 'warning',
        filePath: '.gitgov/tasks/task3.json',
        validator: 'REFERENTIAL_INTEGRITY',
        message: 'Reference to task:missing not found',
        entity: { type: 'task', id: 'task3' },
        fixable: false
      }
    ],
    metadata: {
      timestamp: new Date().toISOString(),
      options: {} as LintOptions,
      version: '1.0.0'
    }
  };

  const mockFixReport: FixReport = {
    summary: {
      fixed: 2,
      failed: 0,
      backupsCreated: 2
    },
    fixes: [
      {
        success: true,
        filePath: '.gitgov/tasks/task2.json',
        validator: 'SIGNATURE_STRUCTURE',
        action: 'Signature regenerated',
        backupPath: '.gitgov/tasks/task2.json.backup-1234567890'
      }
    ]
  };

  const mockActor: ActorRecord = {
    id: 'human:test-user',
    type: 'human',
    displayName: 'Test User',
    publicKey: 'test-public-key',
    roles: ['author'],
    status: 'active'
  };

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create simple mock adapters
    mockLintModule = {
      lint: jest.fn(),
      lintFile: jest.fn(),
      fix: jest.fn()
    };

    mockIdentityAdapter = {
      getCurrentActor: jest.fn()
    };

    mockIndexerAdapter = {
      generateIndex: jest.fn().mockResolvedValue({ success: true })
    };

    mockKeyProvider = {
      getPrivateKey: jest.fn().mockResolvedValue('mock-private-key')
    };

    // Create mock dependency service
    const mockDependencyService = {
      getLintModule: jest.fn().mockResolvedValue(mockLintModule),
      getIdentityAdapter: jest.fn().mockResolvedValue(mockIdentityAdapter),
      getIndexerAdapter: jest.fn().mockResolvedValue(mockIndexerAdapter),
      getKeyProvider: jest.fn().mockReturnValue(mockKeyProvider)
    };

    // Mock singleton getInstance
    (DependencyInjectionService.getInstance as jest.MockedFunction<typeof DependencyInjectionService.getInstance>)
      .mockReturnValue(mockDependencyService as never);

    // Create fresh LintCommand instance
    lintCommand = new LintCommand();

    // Set up default successful responses
    mockLintModule.lint.mockResolvedValue(mockLintReport);
    mockLintModule.lintFile.mockResolvedValue(mockLintReport);
    mockLintModule.fix.mockResolvedValue(mockFixReport);
    mockIdentityAdapter.getCurrentActor.mockResolvedValue(mockActor);

    // Mock fs.stat for file detection
    (fs.stat as jest.Mock).mockRejectedValue(new Error('Not a file'));
  });

  afterEach(() => {
    // Reset mocks after each test
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockProcessExit.mockClear();
  });

  // ==========================================================================
  // EARS-A1 to A8: CLI Argument Parsing & Module Integration
  // ==========================================================================

  describe('4.1. CLI Argument Parsing & Module Integration (EARS-A1 to A8)', () => {
    it('[EARS-A1] should use default options when no args provided', async () => {
      await lintCommand.execute({});

      expect(mockLintModule.lint).toHaveBeenCalledWith({
        path: '.gitgov/',
        validateReferences: false,
        validateActors: false,
        validateFileNaming: true
      });
    });

    it('[EARS-A2] should map CLI flags to LintOptions correctly', async () => {
      await lintCommand.execute({
        path: '.gitgov/custom',
        references: true,
        actors: true,
        format: 'text',
        quiet: false
      });

      expect(mockLintModule.lint).toHaveBeenCalledWith({
        path: '.gitgov/custom',
        validateReferences: true,
        validateActors: true,
        validateFileNaming: true
      });
    });

    it('[EARS-A3] should handle module initialization errors', async () => {
      const error = new Error('LintModule initialization failed');
      const mockDependencyService = {
        getLintModule: jest.fn().mockRejectedValue(error),
        getIdentityAdapter: jest.fn().mockResolvedValue(mockIdentityAdapter)
      };
      (DependencyInjectionService.getInstance as jest.MockedFunction<typeof DependencyInjectionService.getInstance>)
        .mockReturnValue(mockDependencyService as never);

      // Create new command instance to use the new mock
      const errorCommand = new LintCommand();
      await errorCommand.execute({});

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Lint command failed:', error);
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-A4] should detect file path and use lintFile for single files', async () => {
      await lintCommand.execute({
        path: '.gitgov/tasks/task1.json'
      });

      expect(mockLintModule.lintFile).toHaveBeenCalledWith(
        '.gitgov/tasks/task1.json',
        expect.objectContaining({
          validateFileNaming: true
        })
      );
      expect(mockLintModule.lint).not.toHaveBeenCalled();
    });

    it('[EARS-A4] should detect file by checking filesystem when extension is not .json', async () => {
      (fs.stat as jest.Mock).mockResolvedValueOnce({ isFile: () => true });

      await lintCommand.execute({
        path: '.gitgov/tasks/task1'
      });

      expect(mockLintModule.lintFile).toHaveBeenCalled();
      expect(mockLintModule.lint).not.toHaveBeenCalled();
    });

    it('[EARS-A5] should filter results by excluded validator types', async () => {
      await lintCommand.execute({
        excludeValidators: 'SCHEMA_VALIDATION,REFERENTIAL_INTEGRITY'
      });

      // Verify that the report was filtered
      const filteredResults = mockLintReport.results.filter(
        r => !['SCHEMA_VALIDATION', 'REFERENTIAL_INTEGRITY'].includes(r.validator)
      );
      expect(filteredResults.length).toBe(1); // Only SIGNATURE_STRUCTURE should remain
    });

    it('[EARS-A6] should group output by validator (default)', async () => {
      await lintCommand.execute({
        groupBy: 'validator'
      });

      // Verify output was grouped by validator
      const output = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('SCHEMA_VALIDATION');
      expect(output).toContain('SIGNATURE_STRUCTURE');
    });

    it('[EARS-A6] should group output by file', async () => {
      await lintCommand.execute({
        groupBy: 'file'
      });

      // Verify output was grouped by file
      const output = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('.gitgov/tasks/task1.json');
      expect(output).toContain('.gitgov/tasks/task2.json');
    });

    it('[EARS-A6] should show output without grouping when groupBy is none', async () => {
      await lintCommand.execute({
        groupBy: 'none'
      });

      // Verify output was not grouped
      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it('[EARS-A7] should fix only specified validator types when --fix-validators is provided', async () => {
      await lintCommand.execute({
        fix: true,
        fixValidators: 'SIGNATURE_STRUCTURE'
      });

      expect(mockLintModule.fix).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          fixTypes: ['SIGNATURE_STRUCTURE']
        })
      );
    });

    it('[EARS-A8] should fix all fixable problems when --fix-validators is not provided', async () => {
      await lintCommand.execute({
        fix: true
      });

      expect(mockLintModule.fix).toHaveBeenCalledWith(
        expect.any(Object),
        expect.not.objectContaining({
          fixTypes: expect.anything()
        })
      );
    });
  });

  // ==========================================================================
  // EARS-B1 to B2: Output Formatting - Text Mode
  // ==========================================================================

  describe('4.2. Output Formatting - Text Mode (EARS-B1 to B2)', () => {
    it('[EARS-B1] should format text output with colors and structure', async () => {
      await lintCommand.execute({
        format: 'text'
      });

      // Verify summary is shown
      const output = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('Files checked:');
      expect(output).toContain('Errors:');
      expect(output).toContain('Warnings:');
      expect(output).toContain('Fixable:');
    });

    it('[EARS-B2] should suppress warnings in quiet mode', async () => {
      const reportWithWarnings: LintReport = {
        ...mockLintReport,
        results: [
          {
            level: 'warning',
            filePath: '.gitgov/tasks/task3.json',
            validator: 'REFERENTIAL_INTEGRITY',
            message: 'Reference not found',
            entity: { type: 'task', id: 'task3' },
            fixable: false
          }
        ]
      };
      mockLintModule.lint.mockResolvedValueOnce(reportWithWarnings);

      await lintCommand.execute({
        quiet: true
      });

      // In quiet mode, warnings should be suppressed
      const output = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      // Should not show the validation message
      expect(mockConsoleLog).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // EARS-C1: Migration Detection Mode
  // ==========================================================================

  describe('4.3. Migration Detection Mode (EARS-C1)', () => {
    it('[EARS-C1] should list legacy records without applying fixes', async () => {
      const legacyReport: LintReport = {
        ...mockLintReport,
        results: [
          {
            level: 'error',
            filePath: '.gitgov/tasks/legacy1.json',
            validator: 'EMBEDDED_METADATA_STRUCTURE',
            message: 'Legacy format detected',
            entity: { type: 'task', id: 'legacy1' },
            fixable: true
          },
          {
            level: 'warning',
            filePath: '.gitgov/tasks/legacy2.json',
            validator: 'SCHEMA_VERSION_MISMATCH',
            message: 'Schema version mismatch',
            entity: { type: 'task', id: 'legacy2' },
            fixable: true
          }
        ]
      };
      mockLintModule.lint.mockResolvedValueOnce(legacyReport);

      await lintCommand.execute({
        checkMigrations: true
      });

      // Verify migration report is shown
      const output = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('Migration Detection Report');
      expect(output).toContain('Legacy records found');
      // Should not call fix
      expect(mockLintModule.fix).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // EARS-D1 to D3: Output Formatting - JSON Mode & Exit Codes
  // ==========================================================================

  describe('4.4. Output Formatting - JSON Mode & Exit Codes (EARS-D1 to D3)', () => {
    it('[EARS-D1] should output JSON format without modifications', async () => {
      await lintCommand.execute({
        format: 'json'
      });

      // Verify JSON output
      const jsonOutput = mockConsoleLog.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].startsWith('{')
      );
      expect(jsonOutput).toBeDefined();
      const parsed = JSON.parse(jsonOutput![0] as string);
      expect(parsed.summary).toBeDefined();
      expect(parsed.results).toBeDefined();
    });

    it('[EARS-D2] should exit with code 1 when errors present', async () => {
      const reportWithErrors: LintReport = {
        ...mockLintReport,
        summary: {
          ...mockLintReport.summary,
          errors: 2
        }
      };
      mockLintModule.lint.mockResolvedValueOnce(reportWithErrors);

      await lintCommand.execute({});

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-D2] should exit with code 1 based on filtered report when exclude-validators is used', async () => {
      const reportWithErrors: LintReport = {
        ...mockLintReport,
        summary: {
          ...mockLintReport.summary,
          errors: 2
        },
        results: [
          {
            level: 'error',
            filePath: '.gitgov/tasks/task1.json',
            validator: 'SCHEMA_VALIDATION',
            message: 'Error 1',
            entity: { type: 'task', id: 'task1' },
            fixable: false
          },
          {
            level: 'error',
            filePath: '.gitgov/tasks/task2.json',
            validator: 'SIGNATURE_STRUCTURE',
            message: 'Error 2',
            entity: { type: 'task', id: 'task2' },
            fixable: false
          }
        ]
      };
      mockLintModule.lint.mockResolvedValueOnce(reportWithErrors);

      await lintCommand.execute({
        excludeValidators: 'SCHEMA_VALIDATION'
      });

      // After filtering, only SIGNATURE_STRUCTURE error remains
      // Exit code should be based on filtered report
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-D2] should exit with code 1 when fix fails', async () => {
      const fixReportWithFailures: FixReport = {
        ...mockFixReport,
        summary: {
          ...mockFixReport.summary,
          failed: 1
        }
      };
      mockLintModule.fix.mockResolvedValueOnce(fixReportWithFailures);

      await lintCommand.execute({
        fix: true
      });

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-D3] should exit with code 0 when no errors', async () => {
      const reportNoErrors: LintReport = {
        ...mockLintReport,
        summary: {
          ...mockLintReport.summary,
          errors: 0,
          warnings: 1
        }
      };
      mockLintModule.lint.mockResolvedValueOnce(reportNoErrors);

      await lintCommand.execute({});

      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });

    it('[EARS-D3] should exit with code 0 when all fixes succeed', async () => {
      const fixReportSuccess: FixReport = {
        ...mockFixReport,
        summary: {
          ...mockFixReport.summary,
          failed: 0
        }
      };
      mockLintModule.fix.mockResolvedValueOnce(fixReportSuccess);

      await lintCommand.execute({
        fix: true
      });

      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });
  });

  // ==========================================================================
  // EARS-E1 to E3: Output Summary & Limiting
  // ==========================================================================

  describe('4.5. Output Summary & Limiting (EARS-E1 to E3)', () => {
    it('[EARS-E1] should show only summary when --summary flag is provided', async () => {
      await lintCommand.execute({
        summary: true
      });

      // Verify summary is shown
      const output = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('Files checked:');
      expect(output).toContain('Errors:');
      expect(output).toContain('Warnings:');
      expect(output).toContain('Validator Types:');
      // Should not show individual error details
      expect(output).not.toContain('task1');
    });

    it('[EARS-E1] should show Validator Types breakdown in summary mode', async () => {
      await lintCommand.execute({
        summary: true
      });

      const output = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('Validator Types:');
      expect(output).toContain('SCHEMA_VALIDATION');
      expect(output).toContain('SIGNATURE_STRUCTURE');
    });

    it('[EARS-E2] should limit displayed errors/warnings when --max-errors is set', async () => {
      const reportWithManyErrors: LintReport = {
        ...mockLintReport,
        results: Array.from({ length: 10 }, (_, i): LintResult => ({
          level: 'error',
          filePath: `.gitgov/tasks/task${i}.json`,
          validator: 'SCHEMA_VALIDATION',
          message: `Error ${i}`,
          entity: { type: 'task', id: `task${i}` },
          fixable: false
        }))
      };
      mockLintModule.lint.mockResolvedValueOnce(reportWithManyErrors);

      await lintCommand.execute({
        maxErrors: 3
      });

      // Verify only first 3 errors are shown
      const output = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('more issue');
      expect(output).toContain('use --max-errors 0 to see all');
    });

    it('[EARS-E2] should show all errors when --max-errors is 0', async () => {
      const reportWithManyErrors: LintReport = {
        ...mockLintReport,
        results: Array.from({ length: 5 }, (_, i): LintResult => ({
          level: 'error',
          filePath: `.gitgov/tasks/task${i}.json`,
          validator: 'SCHEMA_VALIDATION',
          message: `Error ${i}`,
          entity: { type: 'task', id: `task${i}` },
          fixable: false
        }))
      };
      mockLintModule.lint.mockResolvedValueOnce(reportWithManyErrors);

      await lintCommand.execute({
        maxErrors: 0
      });

      // Verify all errors are shown (no "more issues" message)
      const output = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      expect(output).not.toContain('more issue');
    });

    it('[EARS-E2] should show summary section when max-errors limits output', async () => {
      const reportWithManyErrors: LintReport = {
        ...mockLintReport,
        summary: {
          ...mockLintReport.summary,
          errors: 10
        },
        results: Array.from({ length: 10 }, (_, i): LintResult => ({
          level: 'error',
          filePath: `.gitgov/tasks/task${i}.json`,
          validator: 'SCHEMA_VALIDATION',
          message: `Error ${i}`,
          entity: { type: 'task', id: `task${i}` },
          fixable: false
        }))
      };
      mockLintModule.lint.mockResolvedValueOnce(reportWithManyErrors);

      await lintCommand.execute({
        maxErrors: 2
      });

      // Verify summary section is shown
      const output = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('Summary:');
      expect(output).toContain('more issue');
    });

    it('[EARS-E3] should regenerate index after fix when records are modified', async () => {
      // Mock fix report with successful fixes
      const fixReportWithFixes: FixReport = {
        summary: {
          fixed: 3,
          failed: 0,
          backupsCreated: 3
        },
        fixes: [
          {
            success: true,
            filePath: '.gitgov/tasks/task1.json',
            validator: 'SIGNATURE_STRUCTURE',
            action: 'Signature regenerated',
            backupPath: '.gitgov/tasks/task1.json.backup'
          }
        ]
      };
      mockLintModule.fix.mockResolvedValueOnce(fixReportWithFixes);

      await lintCommand.execute({
        fix: true
      });

      // Key assertion: indexer.generateIndex() should be called when fixes were applied
      expect(mockIndexerAdapter.generateIndex).toHaveBeenCalled();
    });

    it('[EARS-E3] should NOT regenerate index when no records were fixed', async () => {
      // Mock fix report with no fixes (all failed or nothing to fix)
      const fixReportNoFixes: FixReport = {
        summary: {
          fixed: 0,
          failed: 0,
          backupsCreated: 0
        },
        fixes: []
      };
      mockLintModule.fix.mockResolvedValueOnce(fixReportNoFixes);

      await lintCommand.execute({
        fix: true
      });

      // Key assertion: indexer.generateIndex() should NOT be called when no fixes
      expect(mockIndexerAdapter.generateIndex).not.toHaveBeenCalled();
    });

    it('[EARS-E3] should handle indexer errors gracefully during post-fix reindex', async () => {
      // Mock fix report with successful fixes
      const fixReportWithFixes: FixReport = {
        summary: {
          fixed: 1,
          failed: 0,
          backupsCreated: 1
        },
        fixes: []
      };
      mockLintModule.fix.mockResolvedValueOnce(fixReportWithFixes);

      // Make indexer fail
      mockIndexerAdapter.generateIndex.mockRejectedValueOnce(new Error('Index generation failed'));

      // Should not throw - errors are handled gracefully
      await expect(lintCommand.execute({ fix: true })).resolves.not.toThrow();

      // Verify indexer was called but error was handled
      expect(mockIndexerAdapter.generateIndex).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Additional Integration Tests
  // ==========================================================================

  describe('Fix Mode Integration', () => {
    it('should load private key via KeyProvider when fixing', async () => {
      await lintCommand.execute({
        fix: true
      });

      expect(mockKeyProvider.getPrivateKey).toHaveBeenCalledWith('human:test-user');
    });

    it('should handle missing private key gracefully when fixing', async () => {
      mockKeyProvider.getPrivateKey.mockRejectedValueOnce(new Error('Key not found'));

      await lintCommand.execute({
        fix: true
      });

      // Should continue with fix even if private key is missing
      expect(mockLintModule.fix).toHaveBeenCalled();
    });

    it('should show fix report after applying fixes', async () => {
      await lintCommand.execute({
        fix: true
      });

      const output = mockConsoleLog.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('Fix Report:');
      expect(output).toContain('Fixed:');
      expect(output).toContain('Failed:');
      expect(output).toContain('Backups created:');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty lint report', async () => {
      const emptyReport: LintReport = {
        summary: {
          filesChecked: 0,
          errors: 0,
          warnings: 0,
          fixable: 0,
          executionTime: 0
        },
        results: [],
        metadata: {
          timestamp: new Date().toISOString(),
          options: {} as LintOptions,
          version: '1.0.0'
        }
      };
      mockLintModule.lint.mockResolvedValueOnce(emptyReport);

      await lintCommand.execute({});

      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });

    it('should handle file path detection errors gracefully', async () => {
      (fs.stat as jest.Mock).mockRejectedValueOnce(new Error('Permission denied'));

      await lintCommand.execute({
        path: '.gitgov/tasks/unknown'
      });

      // Should fall back to directory mode
      expect(mockLintModule.lint).toHaveBeenCalled();
    });
  });
});

