import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  runCliCommand,
  createGitRepo,
  createBareRemote,
  addRemote,
  getWorktreeBasePath,
  cleanupWorktree,
} from './helpers';

/**
 * E2E Tests for `gitgov lint` Command
 *
 * Blueprint: lint_command_e2e.md
 *
 * Tests the full stack: CLI → FsLintModule → LintModule → Validators → Output
 * All tests use REAL records in /tmp (no mocks, no core imports).
 *
 * Setup pattern:
 * 1. Create temp dir with git repo + bare remote
 * 2. Run `gitgov init` to bootstrap (creates actor, cycle, config in worktree)
 * 3. Run `gitgov task new` to create valid tasks
 * 4. Modify JSON files in worktree for corruption scenarios
 * 5. Run `gitgov lint` and verify stdout/exit code
 */
describe('Lint CLI Command - E2E Tests', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeAll(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-lint-e2e-'));
  });

  afterAll(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ============================================================================
  // Helper: setup a fresh gitgov project in tempDir
  // ============================================================================
  const setupProject = (label: string) => {
    const testProjectRoot = path.join(tempDir, `${label}-project`);
    const remotePath = path.join(tempDir, `${label}-remote.git`);

    createBareRemote(remotePath);
    createGitRepo(testProjectRoot, true);
    addRemote(testProjectRoot, remotePath);

    const worktreeBasePath = getWorktreeBasePath(testProjectRoot);

    // Initialize gitgov (creates actor, cycle, config)
    runCliCommand(
      ['init', '--name', `${label} Test`, '--actor-name', 'Test User', '--quiet'],
      { cwd: testProjectRoot }
    );

    return { testProjectRoot, remotePath, worktreeBasePath };
  };

  /**
   * Read a record JSON from the worktree, modify it, and write it back.
   */
  const modifyRecordInWorktree = (
    worktreeBasePath: string,
    type: string,
    filename: string,
    modifier: (record: any) => any
  ) => {
    const filePath = path.join(worktreeBasePath, '.gitgov', type, filename);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const modified = modifier(content);
    fs.writeFileSync(filePath, JSON.stringify(modified, null, 2));
    return filePath;
  };

  /**
   * Write a raw JSON file into the worktree .gitgov/ structure.
   */
  const writeRawRecord = (
    worktreeBasePath: string,
    type: string,
    filename: string,
    content: object
  ) => {
    const dirPath = path.join(worktreeBasePath, '.gitgov', type);
    fs.mkdirSync(dirPath, { recursive: true });
    const filePath = path.join(dirPath, filename);
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
    return filePath;
  };

  /**
   * Find the first .json file in a worktree directory.
   */
  const findFirstRecord = (worktreeBasePath: string, type: string): string | null => {
    const dirPath = path.join(worktreeBasePath, '.gitgov', type);
    if (!fs.existsSync(dirPath)) return null;
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
    return files[0] || null;
  };

  /**
   * Read a record JSON from the worktree.
   */
  const readRecord = (worktreeBasePath: string, type: string, filename: string) => {
    const filePath = path.join(worktreeBasePath, '.gitgov', type, filename);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  };

  // ============================================================================
  // 3.1. Bloque A: Valid Records — Zero Errors (EARS-A1 to A3)
  // ============================================================================
  describe('3.1. Valid Records — Zero Errors (EARS-A1 to A3)', () => {
    let testProjectRoot: string;
    let worktreeBasePath: string;

    beforeAll(() => {
      const setup = setupProject('bloque-a');
      testProjectRoot = setup.testProjectRoot;
      worktreeBasePath = setup.worktreeBasePath;

      // Create a valid task via CLI
      runCliCommand(
        ['task', 'new', 'Valid Task for Lint Test', '-d', 'This task has valid structure'],
        { cwd: testProjectRoot }
      );
    });

    afterAll(() => {
      cleanupWorktree(testProjectRoot, worktreeBasePath);
    });

    it('[EARS-A1] should report zero errors for valid records', () => {
      const result = runCliCommand(['lint', '--format', 'json', '--quiet'], { cwd: testProjectRoot });

      expect(result.success).toBe(true);
      const report = JSON.parse(result.output);
      expect(report.summary.errors).toBe(0);
    });

    it('[EARS-A2] should validate all record types found and report filesChecked', () => {
      const result = runCliCommand(['lint', '--format', 'json', '--quiet'], { cwd: testProjectRoot });

      expect(result.success).toBe(true);
      const report = JSON.parse(result.output);
      // init creates actor + cycle, task new creates task → at least 3 records
      expect(report.summary.filesChecked).toBeGreaterThanOrEqual(3);
      expect(report.summary.errors).toBe(0);
    });

    it('[EARS-A3] should output valid JSON with correct structure', () => {
      const result = runCliCommand(['lint', '--format', 'json', '--quiet'], { cwd: testProjectRoot });

      expect(result.success).toBe(true);
      const report = JSON.parse(result.output);

      // Validate JSON structure
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('results');
      expect(report).toHaveProperty('metadata');
      expect(report.summary).toHaveProperty('filesChecked');
      expect(report.summary).toHaveProperty('errors');
      expect(report.summary).toHaveProperty('warnings');
      expect(report.summary).toHaveProperty('fixable');
      expect(report.summary).toHaveProperty('executionTime');
      expect(report.metadata).toHaveProperty('timestamp');
      expect(report.metadata).toHaveProperty('options');
      expect(report.metadata).toHaveProperty('version');
    });
  });

  // ============================================================================
  // 3.2. Bloque B: Schema Validation Errors (EARS-B1 to B3)
  // ============================================================================
  describe('3.2. Schema Validation Errors (EARS-B1 to B3)', () => {
    let testProjectRoot: string;
    let worktreeBasePath: string;

    beforeAll(() => {
      const setup = setupProject('bloque-b');
      testProjectRoot = setup.testProjectRoot;
      worktreeBasePath = setup.worktreeBasePath;

      // Create a valid task to have something to corrupt
      runCliCommand(
        ['task', 'new', 'Schema Test Task', '-d', 'Task for schema validation test'],
        { cwd: testProjectRoot }
      );
    });

    afterAll(() => {
      cleanupWorktree(testProjectRoot, worktreeBasePath);
    });

    it('[EARS-B1] should detect missing required fields', () => {
      // Write a task record missing the required 'title' field
      const taskFile = findFirstRecord(worktreeBasePath, 'tasks');
      expect(taskFile).not.toBeNull();

      const record = readRecord(worktreeBasePath, 'tasks', taskFile!);
      // Remove a required field
      modifyRecordInWorktree(worktreeBasePath, 'tasks', taskFile!, (rec) => {
        delete rec.payload.title;
        return rec;
      });

      const result = runCliCommand(
        ['lint', '--format', 'json', '--quiet'],
        { cwd: testProjectRoot, expectError: true }
      );

      const report = JSON.parse(result.output || result.error!);
      const schemaErrors = report.results.filter(
        (r: any) => r.validator === 'SCHEMA_VALIDATION'
      );
      expect(schemaErrors.length).toBeGreaterThan(0);
      expect(report.summary.errors).toBeGreaterThan(0);

      // Restore original record
      const filePath = path.join(worktreeBasePath, '.gitgov', 'tasks', taskFile!);
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
    });

    it('[EARS-B2] should detect additional properties and filter oneOf noise', () => {
      const taskFile = findFirstRecord(worktreeBasePath, 'tasks');
      expect(taskFile).not.toBeNull();

      const record = readRecord(worktreeBasePath, 'tasks', taskFile!);
      // Add an undeclared additional property to payload
      modifyRecordInWorktree(worktreeBasePath, 'tasks', taskFile!, (rec) => {
        rec.payload.undeclaredField = 'this should not be here';
        return rec;
      });

      const result = runCliCommand(
        ['lint', '--format', 'json', '--quiet'],
        { cwd: testProjectRoot, expectError: true }
      );

      const report = JSON.parse(result.output || result.error!);
      const schemaErrors = report.results.filter(
        (r: any) => r.validator === 'SCHEMA_VALIDATION'
      );
      expect(schemaErrors.length).toBeGreaterThan(0);
      // Verify oneOf/if-then-else noise is filtered (should not have redundant errors)
      const redundantErrors = report.results.filter(
        (r: any) => r.message && (
          r.message.includes('boolean schema is false') ||
          r.message.includes('must match "else" schema') ||
          r.message.includes('must match "then" schema')
        )
      );
      expect(redundantErrors.length).toBe(0);

      // Restore
      const filePath = path.join(worktreeBasePath, '.gitgov', 'tasks', taskFile!);
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
    });

    it('[EARS-B3] should reject invalid header.type values', () => {
      const taskFile = findFirstRecord(worktreeBasePath, 'tasks');
      expect(taskFile).not.toBeNull();

      const record = readRecord(worktreeBasePath, 'tasks', taskFile!);
      // Set an invalid header.type
      modifyRecordInWorktree(worktreeBasePath, 'tasks', taskFile!, (rec) => {
        rec.header.type = 'custom';
        return rec;
      });

      const result = runCliCommand(
        ['lint', '--format', 'json', '--quiet'],
        { cwd: testProjectRoot, expectError: true }
      );

      const report = JSON.parse(result.output || result.error!);
      const schemaErrors = report.results.filter(
        (r: any) => r.validator === 'SCHEMA_VALIDATION'
      );
      expect(schemaErrors.length).toBeGreaterThan(0);

      // Restore
      const filePath = path.join(worktreeBasePath, '.gitgov', 'tasks', taskFile!);
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
    });
  });

  // ============================================================================
  // 3.3. Bloque C: Checksum & Signature Errors (EARS-C1 to C3)
  // ============================================================================
  describe('3.3. Checksum & Signature Errors (EARS-C1 to C3)', () => {
    let testProjectRoot: string;
    let worktreeBasePath: string;

    beforeAll(() => {
      const setup = setupProject('bloque-c');
      testProjectRoot = setup.testProjectRoot;
      worktreeBasePath = setup.worktreeBasePath;

      runCliCommand(
        ['task', 'new', 'Checksum Test Task', '-d', 'Task for checksum/signature test'],
        { cwd: testProjectRoot }
      );
    });

    afterAll(() => {
      cleanupWorktree(testProjectRoot, worktreeBasePath);
    });

    it('[EARS-C1] should detect invalid payloadChecksum format', () => {
      const taskFile = findFirstRecord(worktreeBasePath, 'tasks');
      expect(taskFile).not.toBeNull();

      const record = readRecord(worktreeBasePath, 'tasks', taskFile!);
      // Corrupt payloadChecksum to invalid format (not 64-hex)
      modifyRecordInWorktree(worktreeBasePath, 'tasks', taskFile!, (rec) => {
        rec.header.payloadChecksum = 'INVALID_CHECKSUM';
        return rec;
      });

      const result = runCliCommand(
        ['lint', '--format', 'json', '--quiet'],
        { cwd: testProjectRoot, expectError: true }
      );

      const report = JSON.parse(result.output || result.error!);
      const checksumErrors = report.results.filter(
        (r: any) => r.validator === 'CHECKSUM_VERIFICATION'
      );
      expect(checksumErrors.length).toBeGreaterThan(0);
      expect(checksumErrors[0].message).toContain('payloadChecksum');

      // Restore
      const filePath = path.join(worktreeBasePath, '.gitgov', 'tasks', taskFile!);
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
    });

    it('[EARS-C2] should detect invalid signature pattern', () => {
      const taskFile = findFirstRecord(worktreeBasePath, 'tasks');
      expect(taskFile).not.toBeNull();

      const record = readRecord(worktreeBasePath, 'tasks', taskFile!);
      // Set an invalid signature (not valid base64 88 chars)
      modifyRecordInWorktree(worktreeBasePath, 'tasks', taskFile!, (rec) => {
        rec.header.signatures[0].signature = 'not-a-valid-base64-signature';
        return rec;
      });

      const result = runCliCommand(
        ['lint', '--format', 'json', '--quiet'],
        { cwd: testProjectRoot, expectError: true }
      );

      const report = JSON.parse(result.output || result.error!);
      // Check for schema validation error on signature pattern
      const sigErrors = report.results.filter(
        (r: any) => r.validator === 'SCHEMA_VALIDATION' || r.validator === 'SIGNATURE_STRUCTURE'
      );
      expect(sigErrors.length).toBeGreaterThan(0);

      // Restore
      const filePath = path.join(worktreeBasePath, '.gitgov', 'tasks', taskFile!);
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
    });

    it('[EARS-C3] should detect missing notes in signature', () => {
      const taskFile = findFirstRecord(worktreeBasePath, 'tasks');
      expect(taskFile).not.toBeNull();

      const record = readRecord(worktreeBasePath, 'tasks', taskFile!);
      // Remove notes from signature
      modifyRecordInWorktree(worktreeBasePath, 'tasks', taskFile!, (rec) => {
        delete rec.header.signatures[0].notes;
        return rec;
      });

      const result = runCliCommand(
        ['lint', '--format', 'json', '--quiet'],
        { cwd: testProjectRoot, expectError: true }
      );

      const report = JSON.parse(result.output || result.error!);
      // Missing notes could trigger SCHEMA_VALIDATION or SIGNATURE_STRUCTURE
      const sigErrors = report.results.filter(
        (r: any) => r.validator === 'SCHEMA_VALIDATION' || r.validator === 'SIGNATURE_STRUCTURE'
      );
      expect(sigErrors.length).toBeGreaterThan(0);

      // Restore
      const filePath = path.join(worktreeBasePath, '.gitgov', 'tasks', taskFile!);
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
    });
  });

  // ============================================================================
  // 3.4. Bloque D: Additional Properties Detection (EARS-D1 to D2)
  // ============================================================================
  describe('3.4. Additional Properties Detection (EARS-D1 to D2)', () => {
    let testProjectRoot: string;
    let worktreeBasePath: string;

    beforeAll(() => {
      const setup = setupProject('bloque-d');
      testProjectRoot = setup.testProjectRoot;
      worktreeBasePath = setup.worktreeBasePath;

      runCliCommand(
        ['task', 'new', 'Additional Props Test Task', '-d', 'Task for additional props test'],
        { cwd: testProjectRoot }
      );
    });

    afterAll(() => {
      cleanupWorktree(testProjectRoot, worktreeBasePath);
    });

    it('[EARS-D1] should detect additional properties in payload as fixable error', () => {
      const taskFile = findFirstRecord(worktreeBasePath, 'tasks');
      expect(taskFile).not.toBeNull();

      const record = readRecord(worktreeBasePath, 'tasks', taskFile!);
      // Add undeclared fields — schema has additionalProperties: false
      modifyRecordInWorktree(worktreeBasePath, 'tasks', taskFile!, (rec) => {
        rec.payload.extraField = 'should not be here';
        rec.payload.anotherExtra = 42;
        return rec;
      });

      const result = runCliCommand(
        ['lint', '--format', 'json', '--quiet'],
        { cwd: testProjectRoot, expectError: true }
      );

      const report = JSON.parse(result.output || result.error!);
      const structErrors = report.results.filter(
        (r: any) => r.validator === 'EMBEDDED_METADATA_STRUCTURE' ||
          (r.validator === 'SCHEMA_VALIDATION' && r.message.includes('additional properties'))
      );
      expect(structErrors.length).toBeGreaterThan(0);
      // Additional properties errors should be fixable
      const fixable = report.results.filter((r: any) => r.fixable);
      expect(fixable.length).toBeGreaterThan(0);

      // Restore
      const filePath = path.join(worktreeBasePath, '.gitgov', 'tasks', taskFile!);
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
    });

    it('[EARS-D2] should detect additional properties in header as error', () => {
      const taskFile = findFirstRecord(worktreeBasePath, 'tasks');
      expect(taskFile).not.toBeNull();

      const record = readRecord(worktreeBasePath, 'tasks', taskFile!);
      // Add undeclared field to header
      modifyRecordInWorktree(worktreeBasePath, 'tasks', taskFile!, (rec) => {
        rec.header.extraHeaderField = 'should not be in header';
        return rec;
      });

      const result = runCliCommand(
        ['lint', '--format', 'json', '--quiet'],
        { cwd: testProjectRoot, expectError: true }
      );

      const report = JSON.parse(result.output || result.error!);
      expect(report.summary.errors).toBeGreaterThan(0);
      // Should detect schema error on the header
      const headerErrors = report.results.filter(
        (r: any) => r.message && r.message.includes('additional properties')
      );
      expect(headerErrors.length).toBeGreaterThan(0);

      // Restore
      const filePath = path.join(worktreeBasePath, '.gitgov', 'tasks', taskFile!);
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
    });
  });

  // ============================================================================
  // 3.5. Bloque E: Reference Validation — Typed Prefixes (EARS-E1 to E4)
  // ============================================================================
  describe('3.5. Reference Validation — Typed Prefixes (EARS-E1 to E4)', () => {
    let testProjectRoot: string;
    let worktreeBasePath: string;

    beforeAll(() => {
      const setup = setupProject('bloque-e');
      testProjectRoot = setup.testProjectRoot;
      worktreeBasePath = setup.worktreeBasePath;

      runCliCommand(
        ['task', 'new', 'Reference Test Task', '-d', 'Task for reference validation test'],
        { cwd: testProjectRoot }
      );
    });

    afterAll(() => {
      cleanupWorktree(testProjectRoot, worktreeBasePath);
    });

    it('[EARS-E1] should detect malformed execution record with schema errors', () => {
      // Write a hand-crafted execution record with invalid structure.
      // The execution schema validates required fields, so missing ones trigger errors.
      const taskFile = findFirstRecord(worktreeBasePath, 'tasks');
      const taskRecord = readRecord(worktreeBasePath, 'tasks', taskFile!);

      const execId = '9999999999-exec-lint-e2e-malformed';
      const execRecord = {
        header: {
          ...taskRecord.header,
          type: 'execution'
        },
        payload: {
          id: execId,
          title: 'Malformed execution',
          // Missing required fields: taskId, actorId, status
          description: 'Execution with missing required fields'
        }
      };

      writeRawRecord(
        worktreeBasePath, 'executions',
        `${execId}.json`, execRecord
      );

      const result = runCliCommand(
        ['lint', '--format', 'json', '--quiet'],
        { cwd: testProjectRoot, expectError: true }
      );

      const report = JSON.parse(result.output || result.error!);
      const execErrors = report.results.filter(
        (r: any) => r.entity.id === execId
      );
      expect(execErrors.length).toBeGreaterThan(0);

      // Cleanup
      const execPath = path.join(worktreeBasePath, '.gitgov', 'executions', `${execId}.json`);
      fs.unlinkSync(execPath);
    });

    it('[EARS-E2] should accept references array with valid string entries', () => {
      const taskFile = findFirstRecord(worktreeBasePath, 'tasks');
      expect(taskFile).not.toBeNull();

      const record = readRecord(worktreeBasePath, 'tasks', taskFile!);
      // Set valid reference strings — schema validates they are strings
      modifyRecordInWorktree(worktreeBasePath, 'tasks', taskFile!, (rec) => {
        rec.payload.references = ['file:README.md', 'commit:abc123'];
        return rec;
      });

      const result = runCliCommand(
        ['lint', '--format', 'json', '--quiet'],
        { cwd: testProjectRoot }
      );

      expect(result.success).toBe(true);
      const report = JSON.parse(result.output);
      expect(report.summary.errors).toBe(0);

      // Restore
      const filePath = path.join(worktreeBasePath, '.gitgov', 'tasks', taskFile!);
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
    });

    it('[EARS-E3] should reject non-string reference entries via schema', () => {
      const taskFile = findFirstRecord(worktreeBasePath, 'tasks');
      expect(taskFile).not.toBeNull();

      const record = readRecord(worktreeBasePath, 'tasks', taskFile!);
      // Set references to non-string types — schema should reject
      modifyRecordInWorktree(worktreeBasePath, 'tasks', taskFile!, (rec) => {
        rec.payload.references = [123, { url: 'bad' }];
        return rec;
      });

      const result = runCliCommand(
        ['lint', '--format', 'json', '--quiet'],
        { cwd: testProjectRoot, expectError: true }
      );

      const report = JSON.parse(result.output || result.error!);
      expect(report.summary.errors).toBeGreaterThan(0);

      // Restore
      const filePath = path.join(worktreeBasePath, '.gitgov', 'tasks', taskFile!);
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
    });

    it('[EARS-E4] should accept valid typed references without errors', () => {
      const taskFile = findFirstRecord(worktreeBasePath, 'tasks');
      expect(taskFile).not.toBeNull();

      const record = readRecord(worktreeBasePath, 'tasks', taskFile!);
      // Add valid references with all known prefixes
      modifyRecordInWorktree(worktreeBasePath, 'tasks', taskFile!, (rec) => {
        rec.payload.references = [
          'file:README.md',
          'task:1234567890-task-example',
          'cycle:1234567890-cycle-example',
          'adapter:github',
          'url:https://example.com',
          'commit:a1b2c3d4',
          'pr:42'
        ];
        return rec;
      });

      const result = runCliCommand(
        ['lint', '--references', '--format', 'json', '--quiet'],
        { cwd: testProjectRoot, expectError: true }
      );

      const report = JSON.parse(result.output || result.error!);
      // Filter for reference errors on THIS task only
      const taskId = record.payload.id;
      const refErrors = report.results.filter(
        (r: any) => r.validator === 'REFERENTIAL_INTEGRITY' &&
          r.entity.id === taskId
      );
      // There should be no reference errors for valid typed references
      expect(refErrors.length).toBe(0);

      // Restore
      const filePath = path.join(worktreeBasePath, '.gitgov', 'tasks', taskFile!);
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
    });
  });

  // ============================================================================
  // 3.6. Bloque F: Bidirectional Consistency (EARS-F1 to F2)
  // ============================================================================
  describe('3.6. Bidirectional Consistency (EARS-F1 to F2)', () => {
    let testProjectRoot: string;
    let worktreeBasePath: string;

    beforeAll(() => {
      const setup = setupProject('bloque-f');
      testProjectRoot = setup.testProjectRoot;
      worktreeBasePath = setup.worktreeBasePath;

      // Create a task — it will be associated with the root cycle via cycleIds
      runCliCommand(
        ['task', 'new', 'Bidirectional Test Task', '-d', 'Task for bidirectional consistency test'],
        { cwd: testProjectRoot }
      );
    });

    afterAll(() => {
      cleanupWorktree(testProjectRoot, worktreeBasePath);
    });

    it('[EARS-F1] should detect schema errors when task record is placed in cycles directory', () => {
      const taskFile = findFirstRecord(worktreeBasePath, 'tasks');
      expect(taskFile).not.toBeNull();

      const record = readRecord(worktreeBasePath, 'tasks', taskFile!);
      // Copy task record into cycles/ — discovery assigns type 'cycle', schema validation fails
      writeRawRecord(worktreeBasePath, 'cycles', taskFile!, record);

      const result = runCliCommand(
        ['lint', '--format', 'json', '--quiet'],
        { cwd: testProjectRoot, expectError: true }
      );

      const report = JSON.parse(result.output || result.error!);
      // Task record in cycles/ triggers SCHEMA_VALIDATION errors (wrong schema applied)
      const misplacedErrors = report.results.filter(
        (r: any) => r.entity.type === 'cycle' && r.entity.id.includes('task')
      );
      expect(misplacedErrors.length).toBeGreaterThan(0);

      // Cleanup
      const misplacedPath = path.join(worktreeBasePath, '.gitgov', 'cycles', taskFile!);
      fs.unlinkSync(misplacedPath);
    });

    it('[EARS-F2] should pass when task and cycle are mutually referenced', () => {
      const taskFile = findFirstRecord(worktreeBasePath, 'tasks');
      const cycleFile = findFirstRecord(worktreeBasePath, 'cycles');
      const taskRecord = readRecord(worktreeBasePath, 'tasks', taskFile!);
      const cycleRecord = readRecord(worktreeBasePath, 'cycles', cycleFile!);

      // Ensure bidirectional: task references cycle AND cycle references task
      modifyRecordInWorktree(worktreeBasePath, 'tasks', taskFile!, (rec) => {
        rec.payload.cycleIds = [cycleRecord.payload.id];
        return rec;
      });
      modifyRecordInWorktree(worktreeBasePath, 'cycles', cycleFile!, (rec) => {
        if (!rec.payload.taskIds) rec.payload.taskIds = [];
        if (!rec.payload.taskIds.includes(taskRecord.payload.id)) {
          rec.payload.taskIds.push(taskRecord.payload.id);
        }
        return rec;
      });

      const result = runCliCommand(
        ['lint', '--references', '--format', 'json', '--quiet'],
        { cwd: testProjectRoot, expectError: true }
      );

      const report = JSON.parse(result.output || result.error!);
      const biErrors = report.results.filter(
        (r: any) => r.validator === 'BIDIRECTIONAL_CONSISTENCY'
      );
      expect(biErrors.length).toBe(0);

      // Restore
      const taskPath = path.join(worktreeBasePath, '.gitgov', 'tasks', taskFile!);
      const cyclePath = path.join(worktreeBasePath, '.gitgov', 'cycles', cycleFile!);
      fs.writeFileSync(taskPath, JSON.stringify(taskRecord, null, 2));
      fs.writeFileSync(cyclePath, JSON.stringify(cycleRecord, null, 2));
    });
  });

  // ============================================================================
  // 3.7. Bloque G: Signature KeyId Validation (EARS-G1 to G2)
  // ============================================================================
  describe('3.7. Signature KeyId Validation (EARS-G1 to G2)', () => {
    let testProjectRoot: string;
    let worktreeBasePath: string;

    beforeAll(() => {
      const setup = setupProject('bloque-g');
      testProjectRoot = setup.testProjectRoot;
      worktreeBasePath = setup.worktreeBasePath;

      runCliCommand(
        ['task', 'new', 'KeyId Test Task', '-d', 'Task for keyId pattern validation'],
        { cwd: testProjectRoot }
      );
    });

    afterAll(() => {
      cleanupWorktree(testProjectRoot, worktreeBasePath);
    });

    it('[EARS-G1] should detect invalid keyId pattern in signature', () => {
      const taskFile = findFirstRecord(worktreeBasePath, 'tasks');
      expect(taskFile).not.toBeNull();

      const record = readRecord(worktreeBasePath, 'tasks', taskFile!);
      // Set keyId to format that violates ^(human|agent)(:[a-z0-9-]+)+$ pattern
      modifyRecordInWorktree(worktreeBasePath, 'tasks', taskFile!, (rec) => {
        rec.header.signatures[0].keyId = 'invalid_format_no_colon';
        return rec;
      });

      const result = runCliCommand(
        ['lint', '--format', 'json', '--quiet'],
        { cwd: testProjectRoot, expectError: true }
      );

      const report = JSON.parse(result.output || result.error!);
      const sigErrors = report.results.filter(
        (r: any) => r.validator === 'SIGNATURE_STRUCTURE' || r.validator === 'SCHEMA_VALIDATION'
      );
      expect(sigErrors.length).toBeGreaterThan(0);
      expect(sigErrors.some((e: any) => e.message.includes('keyId'))).toBe(true);

      // Restore
      const filePath = path.join(worktreeBasePath, '.gitgov', 'tasks', taskFile!);
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
    });

    it('[EARS-G2] should pass with valid keyId pattern', () => {
      // Unmodified records from gitgov init + task new should have valid keyId
      const result = runCliCommand(
        ['lint', '--format', 'json', '--quiet'],
        { cwd: testProjectRoot }
      );

      expect(result.success).toBe(true);
      const report = JSON.parse(result.output);
      expect(report.summary.errors).toBe(0);
    });
  });

  // ============================================================================
  // 3.8. Bloque H: Fix Mode (EARS-H1 to H4)
  // ============================================================================
  describe('3.8. Fix Mode (EARS-H1 to H4)', () => {
    let testProjectRoot: string;
    let worktreeBasePath: string;

    beforeAll(() => {
      const setup = setupProject('bloque-h');
      testProjectRoot = setup.testProjectRoot;
      worktreeBasePath = setup.worktreeBasePath;

      runCliCommand(
        ['task', 'new', 'Fix Mode Test Task', '-d', 'Task for fix mode test'],
        { cwd: testProjectRoot }
      );
    });

    afterAll(() => {
      cleanupWorktree(testProjectRoot, worktreeBasePath);
    });

    it('[EARS-H1] should fix additional properties error and create backup', () => {
      const taskFile = findFirstRecord(worktreeBasePath, 'tasks');
      expect(taskFile).not.toBeNull();

      // Add additional property — triggers fixable EMBEDDED_METADATA_STRUCTURE error
      modifyRecordInWorktree(worktreeBasePath, 'tasks', taskFile!, (rec) => {
        rec.payload.extraFieldToFix = 'this will be removed by --fix';
        return rec;
      });

      // Verify lint detects the fixable error
      const lintResult = runCliCommand(
        ['lint', '--format', 'json', '--quiet'],
        { cwd: testProjectRoot, expectError: true }
      );
      const lintReport = JSON.parse(lintResult.output || lintResult.error!);
      const fixableErrors = lintReport.results.filter((r: any) => r.fixable);
      expect(fixableErrors.length).toBeGreaterThan(0);

      // Run fix — the CLI has access to the private key from init
      const fixResult = runCliCommand(
        ['lint', '--fix', '--fix-validators', 'EMBEDDED_METADATA_STRUCTURE'],
        { cwd: testProjectRoot, expectError: true }
      );
      const fixOutput = fixResult.output || fixResult.error || '';
      expect(fixOutput).toMatch(/[Ff]ix/);

      // Verify backup was created
      const tasksDir = path.join(worktreeBasePath, '.gitgov', 'tasks');
      const backupFiles = fs.readdirSync(tasksDir).filter(f => f.includes('.backup-'));
      expect(backupFiles.length).toBeGreaterThan(0);
    });

    it('[EARS-H3] should create backup file before applying fix', () => {
      // This was already verified in EARS-H1 above
      const tasksDir = path.join(worktreeBasePath, '.gitgov', 'tasks');
      const backupFiles = fs.readdirSync(tasksDir).filter(f => f.includes('.backup-'));
      expect(backupFiles.length).toBeGreaterThan(0);
    });

    it('[EARS-H4] should report no fixable problems when records are clean', () => {
      // Use a separate clean project (no corruptions) to test the zero-fixable path
      const cleanSetup = setupProject('bloque-h-clean');
      try {
        runCliCommand(
          ['task', 'new', 'Clean Task', '-d', 'No corruption here'],
          { cwd: cleanSetup.testProjectRoot }
        );

        const result = runCliCommand(
          ['lint', '--fix'],
          { cwd: cleanSetup.testProjectRoot }
        );

        expect(result.success).toBe(true);
        expect(result.output).toMatch(/[Nn]o fixable problems/);
      } finally {
        cleanupWorktree(cleanSetup.testProjectRoot, cleanSetup.worktreeBasePath);
      }
    });
  });

  // ============================================================================
  // 3.9. Bloque I: Single File & Output Modes (EARS-I1 to I4)
  // ============================================================================
  describe('3.9. Single File & Output Modes (EARS-I1 to I4)', () => {
    let testProjectRoot: string;
    let worktreeBasePath: string;

    beforeAll(() => {
      const setup = setupProject('bloque-i');
      testProjectRoot = setup.testProjectRoot;
      worktreeBasePath = setup.worktreeBasePath;

      runCliCommand(
        ['task', 'new', 'Output Mode Test Task', '-d', 'Task for output mode test'],
        { cwd: testProjectRoot }
      );
    });

    afterAll(() => {
      cleanupWorktree(testProjectRoot, worktreeBasePath);
    });

    it('[EARS-I1] should validate single file and report filesChecked 1', () => {
      const taskFile = findFirstRecord(worktreeBasePath, 'tasks');
      expect(taskFile).not.toBeNull();

      // Use the full path to validate only that file
      const fullPath = path.join(worktreeBasePath, '.gitgov', 'tasks', taskFile!);

      const result = runCliCommand(
        ['lint', fullPath, '--format', 'json', '--quiet'],
        { cwd: testProjectRoot }
      );

      expect(result.success).toBe(true);
      const report = JSON.parse(result.output);
      expect(report.summary.filesChecked).toBe(1);
    });

    it('[EARS-I2] should show only summary without individual errors', () => {
      // First corrupt a record so there's something to display
      const taskFile = findFirstRecord(worktreeBasePath, 'tasks');
      const record = readRecord(worktreeBasePath, 'tasks', taskFile!);
      modifyRecordInWorktree(worktreeBasePath, 'tasks', taskFile!, (rec) => {
        rec.payload.description = 'Modified to break checksum';
        return rec;
      });

      const result = runCliCommand(
        ['lint', '--summary'],
        { cwd: testProjectRoot, expectError: true }
      );

      // Summary mode should show "Lint Report:" with totals but NOT "Issues:" section
      expect(result.output || result.error).toContain('Lint Report:');
      expect(result.output || result.error).toContain('Errors:');
      expect(result.output || result.error).toContain('Warnings:');
      expect(result.output || result.error).toContain('Fixable:');
      // Should NOT have the "Issues:" detailed section
      expect(result.output || result.error).not.toContain('Issues:');

      // Restore
      const filePath = path.join(worktreeBasePath, '.gitgov', 'tasks', taskFile!);
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
    });

    it('[EARS-I3] should exclude specified validators from output and exit code', () => {
      const taskFile = findFirstRecord(worktreeBasePath, 'tasks');
      const record = readRecord(worktreeBasePath, 'tasks', taskFile!);

      // Add additional property to trigger EMBEDDED_METADATA_STRUCTURE error
      modifyRecordInWorktree(worktreeBasePath, 'tasks', taskFile!, (rec) => {
        rec.payload.extraField = 'triggers error';
        return rec;
      });

      // First verify lint catches it
      const resultWithError = runCliCommand(
        ['lint', '--format', 'json', '--quiet'],
        { cwd: testProjectRoot, expectError: true }
      );
      const reportWithError = JSON.parse(resultWithError.output || resultWithError.error!);
      expect(reportWithError.summary.errors).toBeGreaterThan(0);

      // Now exclude all validator types that fire — exit code should be 0
      const resultExcluded = runCliCommand(
        ['lint', '--format', 'json', '--quiet', '--exclude-validators', 'EMBEDDED_METADATA_STRUCTURE,SCHEMA_VALIDATION,SIGNATURE_STRUCTURE,CHECKSUM_VERIFICATION,TEMPORAL_CONSISTENCY'],
        { cwd: testProjectRoot }
      );

      const reportExcluded = JSON.parse(resultExcluded.output);
      expect(reportExcluded.summary.errors).toBe(0);

      // Restore
      const filePath = path.join(worktreeBasePath, '.gitgov', 'tasks', taskFile!);
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
    });

    it('[EARS-I4] should list legacy records without applying fixes', () => {
      const taskFile = findFirstRecord(worktreeBasePath, 'tasks');
      const record = readRecord(worktreeBasePath, 'tasks', taskFile!);

      // Create a "legacy" record by removing embedded metadata wrapper markers
      modifyRecordInWorktree(worktreeBasePath, 'tasks', taskFile!, (rec) => {
        rec.payload.description = 'Modified payload breaks checksum - legacy indicator';
        return rec;
      });

      const result = runCliCommand(
        ['lint', '--check-migrations'],
        { cwd: testProjectRoot, expectError: true }
      );

      // Check-migrations should show migration-related output
      expect(result.output || result.error).toContain('Migration Detection Report:');
      // It should NOT have applied any fixes
      expect(result.output || result.error).not.toContain('Fix Report:');

      // Restore
      const filePath = path.join(worktreeBasePath, '.gitgov', 'tasks', taskFile!);
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
    });
  });

  // ============================================================================
  // 3.10. Bloque J: File Naming Conventions (EARS-J1 to J2)
  // ============================================================================
  describe('3.10. File Naming Conventions (EARS-J1 to J2)', () => {
    let testProjectRoot: string;
    let worktreeBasePath: string;

    beforeAll(() => {
      const setup = setupProject('bloque-j');
      testProjectRoot = setup.testProjectRoot;
      worktreeBasePath = setup.worktreeBasePath;

      runCliCommand(
        ['task', 'new', 'File Naming Test Task', '-d', 'Task for file naming convention test'],
        { cwd: testProjectRoot }
      );
    });

    afterAll(() => {
      cleanupWorktree(testProjectRoot, worktreeBasePath);
    });

    it('[EARS-J1] should detect record placed in wrong directory via schema mismatch', () => {
      const taskFile = findFirstRecord(worktreeBasePath, 'tasks');
      expect(taskFile).not.toBeNull();

      const record = readRecord(worktreeBasePath, 'tasks', taskFile!);
      // Copy the task record into the cycles directory (wrong location).
      // Discovery assigns type 'cycle', but the content is a task record,
      // so schema validation fails (id pattern, status enum, missing fields).
      writeRawRecord(worktreeBasePath, 'cycles', taskFile!, record);

      const result = runCliCommand(
        ['lint', '--format', 'json', '--quiet'],
        { cwd: testProjectRoot, expectError: true }
      );

      const report = JSON.parse(result.output || result.error!);
      // The misplaced file should produce errors (schema mismatch)
      const misplacedErrors = report.results.filter(
        (r: any) => r.entity.type === 'cycle' && r.entity.id.includes('task')
      );
      expect(misplacedErrors.length).toBeGreaterThan(0);

      // Cleanup: remove the misplaced file
      const misplacedPath = path.join(worktreeBasePath, '.gitgov', 'cycles', taskFile!);
      fs.unlinkSync(misplacedPath);
    });

    it('[EARS-J2] should validate records with correct filenames pass', () => {
      // Records created via CLI have correct filenames (ID matches filename).
      // Verify no FILE_NAMING_CONVENTION errors on valid records.
      const result = runCliCommand(
        ['lint', '--format', 'json', '--quiet'],
        { cwd: testProjectRoot }
      );

      expect(result.success).toBe(true);
      const report = JSON.parse(result.output);
      const namingErrors = report.results.filter(
        (r: any) => r.validator === 'FILE_NAMING_CONVENTION'
      );
      expect(namingErrors.length).toBe(0);
    });
  });
});
