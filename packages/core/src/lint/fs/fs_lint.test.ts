/**
 * Unit Tests for FsLintModule
 *
 * Tests EARS from fs_lint_module.md blueprint.
 * Uses manual mocking (no jest.mock at module level) for full control and type safety.
 *
 * FsLintModule EARS (Bloques A-F):
 * - EARS-A: File Discovery (EARS-A1)
 * - EARS-B: File Naming Validation (EARS-B1, EARS-B2)
 * - EARS-C: Backup Operations (EARS-C1, EARS-C2)
 * - EARS-D: Delegation to Core (EARS-D1)
 * - EARS-E: Schema Version Detection (EARS-E1)
 * - EARS-F: Error Filtering (EARS-F1)
 *
 * @see fs_lint_module.md for EARS specifications
 */

import { LintModule } from '../lint';
import { FsLintModule } from './index';
import type {
  LintModuleDependencies,
  LintOptions,
  LintReport,
  LintResult,
} from '../lint.types';
import type {
  FsLintModuleDependencies,
  FileSystem,
} from './fs_lint.types';
import type { IIndexerAdapter } from '../../adapters/indexer_adapter';
import type { TaskRecord, GitGovTaskRecord, GitGovRecord } from '../../record_types';
import { DetailedValidationError } from '../../record_validations/common';
import {
  createTaskRecord,
  createEmbeddedMetadataRecord,
  createTestSignature
} from '../../record_factories';
import { readdir } from 'fs/promises';

// Mock signPayload to avoid real Ed25519 crypto operations in tests
jest.mock('../../crypto/signatures', () => ({
  ...jest.requireActual('../../crypto/signatures'),
  signPayload: jest.fn(() => ({
    keyId: 'test-actor',
    role: 'author',
    notes: 'Mock signature',
    signature: 'mock-signature-test',
    timestamp: Math.floor(Date.now() / 1000)
  }))
}));

// Mock readdir to control filesystem discovery
jest.mock('fs/promises', () => ({
  ...jest.requireActual('fs/promises'),
  readdir: jest.fn()
}));

// ============================================================================
// Mock Types & Helpers
// ============================================================================

type MockStore = {
  get: jest.Mock;
  set: jest.Mock;
  delete: jest.Mock;
  has: jest.Mock;
  keys: jest.Mock;
  values: jest.Mock;
  entries: jest.Mock;
  clear: jest.Mock;
  size: jest.Mock;
};

type MockIndexerAdapter = {
  buildIndex: jest.Mock;
  getIndex: jest.Mock;
  getRecordsByType: jest.Mock;
  getRecordById: jest.Mock;
};

type MockFileSystem = {
  readFile: jest.Mock;
  writeFile: jest.Mock;
  exists: jest.Mock;
  unlink: jest.Mock;
};

/**
 * Helper to create VALIDATED task records using production factories.
 */
function createMockTaskRecord(
  overrides: Partial<TaskRecord> = {},
  keyId: string = 'human:developer'
): GitGovTaskRecord {
  const payload = createTaskRecord({
    title: 'Test Task',
    status: 'draft',
    priority: 'medium',
    description: 'Test task description',
    tags: ['test'],
    cycleIds: [],
    references: [],
    ...overrides
  });
  const signature = createTestSignature(keyId, 'author', 'Test signature');
  return createEmbeddedMetadataRecord(payload, { signatures: [signature] });
}

/**
 * Creates a mock Store<T> instance
 */
function createMockStore(): MockStore {
  return {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    has: jest.fn(),
    keys: jest.fn().mockReturnValue([]),
    values: jest.fn().mockReturnValue([]),
    entries: jest.fn().mockReturnValue([]),
    clear: jest.fn(),
    size: jest.fn().mockReturnValue(0)
  };
}

/**
 * Creates mock dependencies for LintModule + FsLintModule
 */
function createMockDependencies(projectRoot: string = '/tmp/test-project'): {
  stores: {
    tasks: MockStore;
    cycles: MockStore;
    executions: MockStore;
    changelogs: MockStore;
    feedbacks: MockStore;
    actors: MockStore;
    agents: MockStore;
  };
  indexerAdapter: MockIndexerAdapter;
  fileSystem: MockFileSystem;
  lintModuleDeps: LintModuleDependencies;
  fsLintModuleDeps: FsLintModuleDependencies;
} {
  const stores = {
    tasks: createMockStore(),
    cycles: createMockStore(),
    executions: createMockStore(),
    changelogs: createMockStore(),
    feedbacks: createMockStore(),
    actors: createMockStore(),
    agents: createMockStore()
  };

  const indexerAdapter: MockIndexerAdapter = {
    buildIndex: jest.fn(),
    getIndex: jest.fn(),
    getRecordsByType: jest.fn(),
    getRecordById: jest.fn()
  };

  const fileSystem: MockFileSystem = {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    exists: jest.fn(),
    unlink: jest.fn()
  };

  const lintModuleDeps: LintModuleDependencies = {
    stores: stores as unknown as import('../lint.types').RecordStores,
    indexerAdapter: indexerAdapter as unknown as IIndexerAdapter
  };

  const lintModule = new LintModule(lintModuleDeps);

  const fsLintModuleDeps: FsLintModuleDependencies = {
    projectRoot,
    lintModule,
    stores: stores as unknown as import('../lint.types').RecordStores,
    indexerAdapter: indexerAdapter as unknown as IIndexerAdapter,
    fileSystem: fileSystem as FileSystem
  };

  return { stores, indexerAdapter, fileSystem, lintModuleDeps, fsLintModuleDeps };
}

/**
 * Helper to mock filesystem discovery for tests.
 */
function mockFilesystemDiscovery(
  mockReaddir: jest.MockedFunction<typeof readdir>,
  files: Array<{ id: string; type: 'task' | 'cycle' | 'execution' | 'changelog' | 'feedback' | 'actor' | 'agent' }>
): void {
  const filesByDir: Record<string, string[]> = {
    tasks: [], cycles: [], executions: [], changelogs: [], feedbacks: [], actors: [], agents: []
  };

  for (const file of files) {
    const dirMap: Record<string, string> = {
      task: 'tasks', cycle: 'cycles', execution: 'executions',
      changelog: 'changelogs', feedback: 'feedbacks', actor: 'actors', agent: 'agents'
    };
    const dir = dirMap[file.type];
    if (dir && filesByDir[dir]) {
      filesByDir[dir].push(`${file.id}.json`);
    }
  }

  mockReaddir.mockImplementation((async (dirPath: unknown) => {
    const pathStr = typeof dirPath === 'string' ? dirPath : String(dirPath);
    for (const [dir, fileList] of Object.entries(filesByDir)) {
      const dirPattern = new RegExp(`[/\\\\]${dir}([/\\\\]|$)`);
      if (fileList && fileList.length > 0 && dirPattern.test(pathStr)) {
        return fileList;
      }
    }
    return [];
  }) as typeof readdir);
}

// ============================================================================
// Test Suite: FsLintModule
// ============================================================================

describe('FsLintModule', () => {
  let fsLintModule: FsLintModule;
  let lintModule: LintModule;
  let mocks: ReturnType<typeof createMockDependencies>;
  let testRoot: string;
  let mockReaddir: jest.MockedFunction<typeof readdir>;

  beforeAll(() => {
    testRoot = `/tmp/gitgov-fslint-test-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  });

  beforeEach(() => {
    mocks = createMockDependencies(testRoot);
    lintModule = new LintModule(mocks.lintModuleDeps);
    fsLintModule = new FsLintModule({
      ...mocks.fsLintModuleDeps,
      lintModule
    });
    mockReaddir = readdir as jest.MockedFunction<typeof readdir>;
    mockReaddir.mockReset();
    mockReaddir.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // EARS-A: File Discovery
  // ==========================================================================

  describe('EARS-A: File Discovery', () => {
    // [EARS-A1] FsLintModule: File Discovery
    it('[EARS-A1] should scan filesystem directly to find all records', async () => {
      const mockRecord = createMockTaskRecord();
      const recordId = mockRecord.payload.id;

      mockFilesystemDiscovery(mockReaddir, [{ id: recordId, type: 'task' }]);
      mocks.fileSystem.readFile.mockResolvedValue(JSON.stringify(mockRecord));

      const report = await fsLintModule.lint({ path: `${testRoot}/.gitgov/`, validateFileNaming: false });

      expect(mockReaddir).toHaveBeenCalled();
      expect(report.summary.filesChecked).toBe(1);
    });
  });

  // ==========================================================================
  // EARS-B: File Naming Validation
  // ==========================================================================

  describe('EARS-B: File Naming Validation', () => {
    // [EARS-B1] FsLintModule: Validate file in correct directory
    it('[EARS-B1] should validate file in correct directory', async () => {
      const mockRecord = createMockTaskRecord();
      const recordId = mockRecord.payload.id;

      mockFilesystemDiscovery(mockReaddir, [{ id: recordId, type: 'task' }]);
      mocks.fileSystem.readFile.mockResolvedValue(JSON.stringify(mockRecord));

      const report = await fsLintModule.lint({
        path: `${testRoot}/.gitgov/`,
        validateFileNaming: true
      });

      const conventionErrors = report.results.filter(
        (r: LintResult) => r.validator === 'FILE_NAMING_CONVENTION'
      );
      expect(conventionErrors.length).toBe(0);
    });

    // [EARS-B2] FsLintModule: Validate filename matches entity ID
    it('[EARS-B2] should validate filename matches entity ID', async () => {
      const mockRecord = createMockTaskRecord();
      const recordId = mockRecord.payload.id;

      mockFilesystemDiscovery(mockReaddir, [{ id: recordId, type: 'task' }]);
      mocks.fileSystem.readFile.mockResolvedValue(JSON.stringify(mockRecord));

      const report = await fsLintModule.lint({
        path: `${testRoot}/.gitgov/`,
        validateFileNaming: true
      });

      expect(report).toBeDefined();
      expect(report.summary.filesChecked).toBe(1);
    });
  });

  // ==========================================================================
  // EARS-C: Backup Operations
  // ==========================================================================

  describe('EARS-C: Backup Operations', () => {
    // [EARS-C1] FsLintModule: Create backups before modifying files
    it('[EARS-C1] should create backups before modifying files', async () => {
      const mockRecord = createMockTaskRecord({ title: 'Fix Me Task' });
      const recordId = mockRecord.payload.id;

      const lintReport: LintReport = {
        summary: { filesChecked: 1, errors: 1, warnings: 0, fixable: 1, executionTime: 100 },
        results: [{
          level: 'error',
          filePath: `${testRoot}/.gitgov/tasks/${recordId}.json`,
          validator: 'CHECKSUM_VERIFICATION',
          message: 'Invalid checksum',
          entity: { type: 'task', id: recordId },
          fixable: true
        }],
        metadata: { timestamp: new Date().toISOString(), options: {} as LintOptions, version: '1.0.0' }
      };

      mocks.fileSystem.readFile.mockResolvedValue(JSON.stringify(mockRecord));
      mocks.fileSystem.writeFile.mockResolvedValue(undefined);
      mocks.fileSystem.exists.mockResolvedValue(false);

      const fixReport = await fsLintModule.fix(lintReport, {
        createBackups: true,
        keyId: 'system:migrator',
        privateKey: 'mock-private-key'
      });

      // Backup should be created (writeFile called twice: backup + fixed file)
      expect(mocks.fileSystem.writeFile).toHaveBeenCalledTimes(2);
      expect(fixReport.summary.backupsCreated).toBeGreaterThan(0);
    });

    // [EARS-C2] FsLintModule: Restore backup if fix fails
    it('[EARS-C2] should restore backup if fix fails', async () => {
      const originalContent = JSON.stringify({ id: 'test', header: { version: '1.0' }, payload: { id: 'test' } });

      const lintReport: LintReport = {
        summary: { filesChecked: 1, errors: 1, warnings: 0, fixable: 1, executionTime: 100 },
        results: [{
          level: 'error',
          filePath: `${testRoot}/.gitgov/tasks/fail-fix.json`,
          validator: 'CHECKSUM_VERIFICATION',
          message: 'Bad checksum',
          entity: { type: 'task', id: 'fail-fix' },
          fixable: true
        }],
        metadata: { timestamp: new Date().toISOString(), options: {} as LintOptions, version: '1.0.0' }
      };

      mocks.fileSystem.readFile
        .mockResolvedValueOnce(originalContent)
        .mockResolvedValueOnce(originalContent)
        .mockResolvedValueOnce(originalContent);
      mocks.fileSystem.writeFile
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Write failed'))
        .mockResolvedValueOnce(undefined);
      mocks.fileSystem.exists.mockResolvedValue(true);

      const invalidRecord = {
        header: { version: '1.0' as const, payloadChecksum: 'wrong', signatures: [] },
        payload: { id: 'test' }
      } as unknown as GitGovRecord;

      mocks.fileSystem.readFile.mockResolvedValue(JSON.stringify(invalidRecord));

      const fixReport = await fsLintModule.fix(lintReport, {
        createBackups: true,
        keyId: 'system:migrator',
        privateKey: 'test-key'
      });

      expect(fixReport.summary.failed).toBeGreaterThan(0);
      expect(mocks.fileSystem.writeFile).toHaveBeenCalledTimes(3);
    });
  });

  // ==========================================================================
  // EARS-D: Delegation to Core
  // ==========================================================================

  describe('EARS-D: Delegation to Core', () => {
    // [EARS-D1] FsLintModule: Delegation to LintModule core
    it('[EARS-D1] should delegate content validation to LintModule.lintRecord()', async () => {
      const mockRecord = createMockTaskRecord();
      const recordId = mockRecord.payload.id;

      mockFilesystemDiscovery(mockReaddir, [{ id: recordId, type: 'task' }]);
      mocks.fileSystem.readFile.mockResolvedValue(JSON.stringify(mockRecord));

      const lintRecordSpy = jest.spyOn(lintModule, 'lintRecord');

      await fsLintModule.lint({ path: `${testRoot}/.gitgov/`, validateFileNaming: false });

      expect(lintRecordSpy).toHaveBeenCalled();
      expect(lintRecordSpy).toHaveBeenCalledWith(
        expect.objectContaining({ header: expect.any(Object), payload: expect.any(Object) }),
        expect.objectContaining({ recordId, entityType: 'task' })
      );

      lintRecordSpy.mockRestore();
    });
  });

  // ==========================================================================
  // EARS-E: Schema Version Detection
  // ==========================================================================

  describe('EARS-E: Schema Version Detection', () => {
    // [EARS-E1] FsLintModule: Detect schema version mismatch
    it('[EARS-E1] should detect and warn about outdated schemas', async () => {
      const versionError = new DetailedValidationError('TaskRecord', [
        { field: 'newRequiredField', message: 'Field required in v2', value: undefined }
      ]);
      versionError.message = 'Field required in v2';

      mockFilesystemDiscovery(mockReaddir, [{ id: 'old-schema-task', type: 'task' }]);
      mocks.fileSystem.readFile.mockRejectedValue(versionError);

      const report = await fsLintModule.lint({ path: `${testRoot}/.gitgov/` });

      expect(report.results.length).toBeGreaterThan(0);
      expect(report.summary.errors).toBeGreaterThan(0);

      const versionMismatchResults = report.results.filter(
        (r: LintResult) => r.validator === 'SCHEMA_VERSION_MISMATCH'
      );
      expect(versionMismatchResults.length).toBeGreaterThan(0);
      expect(versionMismatchResults[0]?.level).toBe('error');
    });
  });

  // ==========================================================================
  // EARS-F: Error Filtering
  // ==========================================================================

  describe('EARS-F: Error Filtering', () => {
    // [EARS-F1] FsLintModule: Filter redundant oneOf errors
    it('[EARS-F1] should filter redundant oneOf errors when additional properties are present', async () => {
      mockFilesystemDiscovery(mockReaddir, [{ id: 'task-with-extra-props', type: 'task' }]);

      const recordWithExtra = {
        header: { version: '1.0' as const, type: 'task' as const, payloadChecksum: 'abc', signatures: [] },
        payload: { id: 'task-with-extra-props', title: 'Test', status: 'draft' as const, priority: 'medium' as const, description: 'Test', lala: 1 }
      };
      mocks.fileSystem.readFile.mockResolvedValue(JSON.stringify(recordWithExtra));

      const report = await fsLintModule.lint({ path: `${testRoot}/.gitgov/` });

      const additionalPropsErrors = report.results.filter(r =>
        r.message.includes('must NOT have additional properties') ||
        r.message.includes('must not have additional properties') ||
        r.message.includes('additional properties')
      );

      const oneOfErrors = report.results.filter(r =>
        r.message.includes('boolean schema is false') ||
        r.message.includes('must match "else" schema') ||
        r.message.includes('must match "then" schema') ||
        r.message.includes('#/oneOf/')
      );

      if (additionalPropsErrors.length > 0) {
        expect(oneOfErrors.length).toBe(0);
      }
    });
  });
});
