/**
 * SyncCommand Unit Tests
 * 
 * Tests the CLI layer for sync commands (push, pull, resolve, audit)
 * using mocks to isolate from SyncModule implementation.
 * 
 * Integration tests for actual Git operations are in packages/core/src/sync_state/fs/fs_sync_state.test.ts
 */

// Mock @gitgov/core FIRST to avoid import.meta issues in Jest
jest.mock('@gitgov/core', () => ({
  Config: {
    ConfigManager: {
      findGitgovRoot: jest.fn().mockReturnValue('/mock/project/root'),
      findProjectRoot: jest.fn().mockReturnValue('/mock/project/root'),
      getGitgovPath: jest.fn().mockReturnValue('/mock/project/root/.gitgov')
    }
  },
  Git: {},
  Sync: {},
  Records: {},
  Factories: {}
}));

// Mock DependencyInjectionService BEFORE importing SyncCommand
const mockSyncModule = {
  pushState: jest.fn(),
  pullState: jest.fn(),
  resolveConflict: jest.fn(),
  auditState: jest.fn(),
  calculateStateDelta: jest.fn().mockResolvedValue([]),
  getStateBranchName: jest.fn().mockResolvedValue('gitgov-state'),
  hasUncommittedChanges: jest.fn().mockResolvedValue(false),
  isRebaseInProgress: jest.fn().mockResolvedValue(false),
  getConflictedFiles: jest.fn().mockResolvedValue([]),
  checkConflictMarkers: jest.fn().mockResolvedValue([])
};

const mockConfigManager = {};

const mockSessionManager = {
  loadSession: jest.fn(),
  updateActorState: jest.fn().mockResolvedValue(undefined)
};

const mockGitModule = {
  getCurrentBranch: jest.fn().mockResolvedValue('main'),
  isRebaseInProgress: jest.fn().mockResolvedValue(false)
};

jest.mock('../../services/dependency-injection', () => ({
  DependencyInjectionService: {
    getInstance: jest.fn().mockReturnValue({
      getSyncStateModule: jest.fn().mockResolvedValue(mockSyncModule),
      getConfigManager: jest.fn().mockResolvedValue(mockConfigManager),
      getSessionManager: jest.fn().mockResolvedValue(mockSessionManager),
      getGitModule: jest.fn().mockResolvedValue(mockGitModule),
      wasBootstrapped: jest.fn().mockReturnValue(false)
    })
  }
}));

import { SyncCommand } from './sync-command';

// Mock console methods (igual que task-command.test.ts)
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation();

describe('SyncCommand - Unit Tests', () => {
  let syncCommand: SyncCommand;

  beforeEach(() => {
    jest.clearAllMocks();
    syncCommand = new SyncCommand();

    // Reset all mocks to default values
    mockGitModule.getCurrentBranch.mockResolvedValue('main');
    mockGitModule.isRebaseInProgress.mockResolvedValue(false);
    mockSyncModule.getStateBranchName.mockResolvedValue('gitgov-state');
    mockSyncModule.hasUncommittedChanges.mockResolvedValue(false);
    mockSyncModule.isRebaseInProgress.mockResolvedValue(false);
    mockSyncModule.getConflictedFiles.mockResolvedValue([]);
    mockSyncModule.checkConflictMarkers.mockResolvedValue([]);
    mockSyncModule.auditState.mockResolvedValue({
      passed: true,
      scope: 'all',
      totalCommits: 1,
      rebaseCommits: 0,
      resolutionCommits: 0,
      integrityViolations: [],
      summary: 'All checks passed',
      lintReport: {
        summary: { errors: 0, warnings: 0, filesChecked: 0, fixable: 0, executionTime: 0 },
        results: [],
        metadata: { timestamp: '', options: {}, version: '' }
      }
    });

    // Setup default session mock
    mockSessionManager.loadSession.mockResolvedValue({
      lastSession: {
        actorId: 'human:test-user',
        timestamp: new Date().toISOString()
      }
    });
  });

  afterEach(() => {
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockProcessExit.mockClear();
  });

  // =====================================================================
  // EARS-A1 a A4: Verificación de Integridad y Pre-condiciones
  // =====================================================================

  describe('Pre-conditions (EARS-A1 a A4)', () => {
    it('[EARS-A1] should delegate push to pushState (audit runs internally)', async () => {
      // Setup: pushState handles audit internally and returns success
      mockSyncModule.pushState.mockResolvedValue({
        success: true,
        filesSynced: 3,
        sourceBranch: 'main',
        commitHash: 'abc123',
        commitMessage: 'state: Sync from main',
        conflictDetected: false
      });

      // Execute
      await syncCommand.executePush({});

      // Verify pushState was called (audit runs internally in pushState)
      expect(mockSyncModule.pushState).toHaveBeenCalledWith({
        sourceBranch: 'main',
        actorId: 'human:test-user',
        dryRun: false,
        force: false
      });
    });

    it('[EARS-A1] should handle audit failure returned by pushState', async () => {
      // Setup: pushState returns error when internal audit fails
      mockSyncModule.pushState.mockResolvedValue({
        success: false,
        filesSynced: 0,
        sourceBranch: 'main',
        commitHash: '',
        commitMessage: '',
        conflictDetected: false,
        error: 'Pre-push audit failed: 3 integrity violation(s) detected'
      });

      // Execute
      await syncCommand.executePush({});

      // Verify pushState was called
      expect(mockSyncModule.pushState).toHaveBeenCalled();

      // Verify error handling
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Pre-push audit failed')
      );
    });

    it('[EARS-A2] should abort push if executed from gitgov-state branch', async () => {
      // Setup: Mock GitModule to return gitgov-state as current branch
      mockGitModule.getCurrentBranch.mockResolvedValue('gitgov-state');
      mockSyncModule.getStateBranchName.mockResolvedValue('gitgov-state');

      // Execute
      await syncCommand.executePush({});

      // Verify error handling - branch check aborts before pushState is called
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      expect(mockSyncModule.pushState).not.toHaveBeenCalled();
    });

    it('[EARS-A3] should verify no uncommitted changes before push or pull', async () => {
      // This is verified by SyncModule internally
      // CLI just needs to handle the error if thrown

      const UncommittedError = class extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'UncommittedChangesError';
        }
      };

      mockSyncModule.pushState.mockRejectedValue(
        new UncommittedError('Uncommitted changes detected in .gitgov/')
      );

      // Execute
      await syncCommand.executePush({});

      // Verify error handling
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-A4] should verify rebase in progress before resolve', async () => {
      // Setup: Mock GitModule to indicate no rebase
      mockGitModule.isRebaseInProgress.mockResolvedValue(false);
      mockSyncModule.isRebaseInProgress.mockResolvedValue(false);

      // Execute
      await syncCommand.executeResolve({ reason: 'Test resolution' });

      // Verify error handling
      expect(mockProcessExit).toHaveBeenCalledWith(1);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('No rebase in progress')
      );
    });
  });

  // =====================================================================
  // EARS 5-7 (sync_state_module): Gestión de Rama gitgov-state (handled by SyncModule)
  // =====================================================================
  // Note: EARS 5-7 are tested in sync_module.test.ts (not part of this triada)
  // CLI layer doesn't directly test branch management

  // =====================================================================
  // EARS-B1 a B9: Operación Push
  // =====================================================================

  describe('Push Operation (EARS-B1 a B9)', () => {
    // Note: Audit is now handled internally by pushState, not by CLI

    it('[EARS-B1] should calculate delta of files before push', async () => {
      // Setup
      mockSyncModule.pushState.mockResolvedValue({
        success: true,
        filesSynced: 3,
        sourceBranch: 'main',
        commitHash: 'abc123',
        commitMessage: 'state: Sync from main',
        conflictDetected: false
      });

      // Execute
      await syncCommand.executePush({});

      // Verify pushState was called (delta calculation is internal)
      expect(mockSyncModule.pushState).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceBranch: 'main',
          actorId: 'human:test-user'
        })
      );
    });

    it('[EARS-B2] should inform and exit without commit if no changes', async () => {
      // Setup
      mockSyncModule.pushState.mockResolvedValue({
        success: true,
        filesSynced: 0,
        sourceBranch: 'main',
        commitHash: null,
        commitMessage: null,
        conflictDetected: false
      });

      // Execute
      await syncCommand.executePush({});

      // Verify output - [EARS-B5] message updated to clarify "local" changes
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('No local changes to push')
      );
    });

    it('[EARS-B3] should abort rebase and guide user if conflicts detected', async () => {
      // Setup
      mockSyncModule.pushState.mockResolvedValue({
        success: false,
        filesSynced: 0,
        sourceBranch: 'main',
        commitHash: null,
        commitMessage: null,
        conflictDetected: true,
        conflictInfo: {
          type: 'rebase_conflict',
          affectedFiles: ['.gitgov/tasks/task-001.json'],
          message: 'Conflict during reconciliation',
          resolutionSteps: [
            '1. Run: gitgov sync pull',
            '2. Resolve conflicts manually',
            '3. Run: gitgov sync resolve --reason "..."',
            '4. Try again: gitgov sync push'
          ]
        }
      });

      // Execute
      await syncCommand.executePush({});

      // Verify error handling
      expect(mockProcessExit).toHaveBeenCalledWith(1);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Conflict detected')
      );
    });

    it('[EARS-B4] should create commit and push to origin/gitgov-state', async () => {
      // Setup
      mockSyncModule.pushState.mockResolvedValue({
        success: true,
        filesSynced: 5,
        sourceBranch: 'main',
        commitHash: 'def456',
        commitMessage: 'state: Sync from main\n\nActor: human:test-user',
        conflictDetected: false
      });

      // Execute
      await syncCommand.executePush({});

      // Verify
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('5 files synced')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('def456'.substring(0, 8))
      );
    });

    it('[EARS-B5] should display implicit pull results when push reconciles with remote', async () => {
      // Setup - push result includes implicit pull results
      mockSyncModule.pushState.mockResolvedValue({
        success: true,
        filesSynced: 3,
        sourceBranch: 'main',
        commitHash: 'abc123',
        commitMessage: 'state: Sync from main',
        conflictDetected: false,
        implicitPull: {
          hasChanges: true,
          filesUpdated: 7,
          reindexed: true
        }
      });

      // Execute
      await syncCommand.executePush({});

      // Verify implicit pull results are displayed
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Pulled 7 files from remote during reconciliation')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Index regenerated')
      );
      // Also verify normal push results are displayed
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('3 files synced')
      );
    });

    it('[EARS-B6] should simulate operation without changes when --dry-run is used', async () => {
      // Setup
      mockSyncModule.pushState.mockResolvedValue({
        success: true,
        filesSynced: 3,
        sourceBranch: 'main',
        commitHash: null, // No actual commit in dry-run
        commitMessage: 'state: Sync from main\n\nActor: human:test-user',
        conflictDetected: false
      });

      // Execute
      await syncCommand.executePush({ dryRun: true });

      // Verify dryRun was passed
      expect(mockSyncModule.pushState).toHaveBeenCalledWith(
        expect.objectContaining({
          dryRun: true
        })
      );

      // Verify output shows simulation
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('3 files synced')
      );
    });

    it('[EARS-B7] should update lastSyncPush and status synced after successful push', async () => {
      // Setup
      mockSyncModule.pushState.mockResolvedValue({
        success: true,
        filesSynced: 2,
        sourceBranch: 'main',
        commitHash: 'xyz789',
        commitMessage: 'state: Sync from main',
        conflictDetected: false
      });

      mockSyncModule.calculateStateDelta.mockResolvedValue([]); // No pending changes

      // Execute
      await syncCommand.executePush({});

      // Verify session update
      expect(mockSessionManager.updateActorState).toHaveBeenCalledWith(
        'human:test-user',
        expect.objectContaining({
          syncStatus: expect.objectContaining({
            lastSyncPush: expect.any(String),
            status: 'synced'
          })
        })
      );
    });

    it('[EARS-B8] should update status conflict when conflict is detected', async () => {
      // Setup
      mockSyncModule.pushState.mockResolvedValue({
        success: false,
        filesSynced: 0,
        sourceBranch: 'main',
        commitHash: null,
        commitMessage: null,
        conflictDetected: true,
        conflictInfo: {
          type: 'rebase_conflict',
          affectedFiles: ['.gitgov/tasks/task-001.json'],
          message: 'Conflict',
          resolutionSteps: []
        }
      });

      // Execute
      await syncCommand.executePush({});

      // Verify session update to conflict status
      expect(mockSessionManager.updateActorState).toHaveBeenCalledWith(
        'human:test-user',
        expect.objectContaining({
          syncStatus: expect.objectContaining({
            status: 'conflict'
          })
        })
      );
    });

    it('[EARS-B9] should update status pending when there are local changes not published', async () => {
      // Setup
      mockSyncModule.pushState.mockResolvedValue({
        success: true,
        filesSynced: 2,
        sourceBranch: 'main',
        commitHash: 'commit123',
        commitMessage: 'state: Sync from main',
        conflictDetected: false
      });

      // Mock delta to show pending changes
      mockSyncModule.calculateStateDelta.mockResolvedValue([
        { status: 'M', file: '.gitgov/tasks/task-pending.json' }
      ]);

      // Execute
      await syncCommand.executePush({});

      // Verify pending status was set
      expect(mockSessionManager.updateActorState).toHaveBeenCalledWith(
        'human:test-user',
        expect.objectContaining({
          syncStatus: expect.objectContaining({
            status: 'pending'
          })
        })
      );
    });
  });

  // =====================================================================
  // EARS-C1 a C11: Operación Pull
  // =====================================================================

  describe('Pull Operation (EARS-C1 a C11)', () => {
    it('[EARS-C1] should update local branch with remote changes using rebase', async () => {
      // Setup
      mockSyncModule.pullState.mockResolvedValue({
        success: true,
        hasChanges: true,
        filesUpdated: 4,
        reindexed: true,
        conflictDetected: false
      });

      // Execute
      await syncCommand.executePull({});

      // Verify
      expect(mockSyncModule.pullState).toHaveBeenCalledWith(
        expect.objectContaining({
          forceReindex: false
        })
      );

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('4 files updated')
      );
    });

    it('[EARS-C2] should pause rebase and guide user if conflicts detected', async () => {
      // Setup
      mockSyncModule.pullState.mockResolvedValue({
        success: false,
        hasChanges: false,
        filesUpdated: 0,
        reindexed: false,
        conflictDetected: true,
        conflictInfo: {
          type: 'rebase_conflict',
          affectedFiles: ['.gitgov/tasks/task-002.json'],
          message: 'Conflict during pull',
          resolutionSteps: [
            '1. Resolve conflicts manually',
            '2. Run: gitgov sync resolve --reason "..."'
          ]
        }
      });

      // Execute
      await syncCommand.executePull({});

      // Verify error handling
      expect(mockProcessExit).toHaveBeenCalledWith(1);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Conflict detected')
      );
    });

    it('[EARS-C3] should invoke syncModule.pullState() which auto-reindexes', async () => {
      // Setup
      mockSyncModule.pullState.mockResolvedValue({
        success: true,
        hasChanges: true,
        filesUpdated: 3,
        reindexed: true, // SyncModule auto-reindexed
        conflictDetected: false
      });

      // Execute
      await syncCommand.executePull({});

      // Verify
      expect(mockSyncModule.pullState).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Index regenerated')
      );
    });

    it('[EARS-C4] should invoke syncModule.pullState() with forceReindex flag', async () => {
      // Setup
      mockSyncModule.pullState.mockResolvedValue({
        success: true,
        hasChanges: false, // No changes, but forced reindex
        filesUpdated: 0,
        reindexed: true,
        conflictDetected: false
      });

      // Execute
      await syncCommand.executePull({ reindex: true });

      // Verify forceReindex was passed
      expect(mockSyncModule.pullState).toHaveBeenCalledWith(
        expect.objectContaining({
          forceReindex: true
        })
      );
    });

    it('[EARS-C5] should update lastSyncPull and status synced after successful pull', async () => {
      // Setup
      mockSyncModule.pullState.mockResolvedValue({
        success: true,
        hasChanges: true,
        filesUpdated: 2,
        reindexed: true,
        conflictDetected: false
      });

      // Execute
      await syncCommand.executePull({});

      // Verify session update
      expect(mockSessionManager.updateActorState).toHaveBeenCalledWith(
        'human:test-user',
        expect.objectContaining({
          syncStatus: expect.objectContaining({
            lastSyncPull: expect.any(String),
            status: 'synced'
          })
        })
      );
    });

    it('[EARS-C6] should complete pull successfully without updating session when no actor', async () => {
      // Setup: Pull succeeds but no actor in session
      mockSyncModule.pullState.mockResolvedValue({
        success: true,
        hasChanges: true,
        filesUpdated: 3,
        reindexed: true,
        conflictDetected: false
      });

      // Mock session without actor
      mockSessionManager.loadSession.mockResolvedValue({
        lastSession: null,
        actorState: {}
      });

      // Execute
      await syncCommand.executePull({});

      // Verify pull completed successfully
      expect(mockSyncModule.pullState).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('3 files updated')
      );

      // Verify session was NOT updated (graceful degradation)
      expect(mockSessionManager.updateActorState).not.toHaveBeenCalled();
      expect(mockProcessExit).not.toHaveBeenCalled();
    });

    it('[EARS-C7] should update status conflict when conflict is detected during pull', async () => {
      // Setup
      mockSyncModule.pullState.mockResolvedValue({
        success: false,
        hasChanges: false,
        filesUpdated: 0,
        reindexed: false,
        conflictDetected: true,
        conflictInfo: {
          type: 'rebase_conflict',
          affectedFiles: ['.gitgov/tasks/conflict.json'],
          message: 'Conflict',
          resolutionSteps: []
        }
      });

      // Execute
      await syncCommand.executePull({});

      // Verify session update
      expect(mockSessionManager.updateActorState).toHaveBeenCalledWith(
        'human:test-user',
        expect.objectContaining({
          syncStatus: expect.objectContaining({
            status: 'conflict'
          })
        })
      );
    });

    it('[EARS-C9] should handle error from pullState and show clear message', async () => {
      // Setup: Pull returns error (e.g., no remote configured)
      mockSyncModule.pullState.mockResolvedValue({
        success: false,
        hasChanges: false,
        filesUpdated: 0,
        reindexed: false,
        conflictDetected: false,
        error: 'No remote \'origin\' configured. Pull requires a remote repository. Add a remote with: git remote add origin <url>'
      });

      // Execute
      await syncCommand.executePull({});

      // Verify error was shown to user
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('No remote')
      );
    });

    it('[EARS-C8] should handle conflict without updating session when no actor', async () => {
      // Setup: Conflict detected but no actor in session
      mockSyncModule.pullState.mockResolvedValue({
        success: false,
        hasChanges: false,
        filesUpdated: 0,
        reindexed: false,
        conflictDetected: true,
        conflictInfo: {
          type: 'rebase_conflict',
          affectedFiles: ['.gitgov/tasks/conflict.json'],
          message: 'Conflict during pull',
          resolutionSteps: [
            '1. Resolve conflicts manually',
            '2. Run: gitgov sync resolve --reason "..."'
          ]
        }
      });

      // Mock session without actor
      mockSessionManager.loadSession.mockResolvedValue({
        lastSession: null,
        actorState: {}
      });

      // Execute
      await syncCommand.executePull({});

      // Verify conflict was handled (error shown)
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Conflict')
      );

      // Verify session was NOT updated (graceful degradation)
      expect(mockSessionManager.updateActorState).not.toHaveBeenCalled();
    });

    it('[EARS-C10] should detect local changes conflict and show affected files during pull', async () => {
      // Setup: Pull returns local_changes_conflict
      mockSyncModule.pullState.mockResolvedValue({
        success: false,
        hasChanges: false,
        filesUpdated: 0,
        reindexed: false,
        conflictDetected: true,
        conflictInfo: {
          type: 'local_changes_conflict',
          affectedFiles: ['.gitgov/tasks/task-123.json'],
          message: 'Local changes would be overwritten by pull',
          resolutionSteps: [
            "Run 'gitgov sync push' to push your local changes first",
            "Or run 'gitgov sync pull --force' to overwrite local changes"
          ]
        }
      });

      // Execute
      await syncCommand.executePull({});

      // Verify conflict was detected and error shown
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Conflict')
      );
    });

    it('[EARS-C11] should pass force flag to pullState when --force is used', async () => {
      // Setup
      mockSyncModule.pullState.mockResolvedValue({
        success: true,
        hasChanges: true,
        filesUpdated: 2,
        reindexed: true,
        conflictDetected: false,
        forcedOverwrites: ['.gitgov/tasks/task-123.json']
      });

      // Execute with force flag
      await syncCommand.executePull({ force: true } as any);

      // Verify force was passed to pullState
      expect(mockSyncModule.pullState).toHaveBeenCalledWith(
        expect.objectContaining({
          force: true
        })
      );
    });
  });

  // =====================================================================
  // EARS-D1 a D5: Operación Resolve
  // =====================================================================

  describe('Resolve Operation (EARS-D1 a D5)', () => {
    beforeEach(() => {
      // Configure GitModule mock to indicate rebase in progress
      mockGitModule.isRebaseInProgress.mockResolvedValue(true);
      mockSyncModule.isRebaseInProgress.mockResolvedValue(true);
    });

    it('[EARS-D1] should abort if conflict markers are present', async () => {
      // Setup: Mock file system to simulate conflict markers
      // Note: checkConflictMarkers is called internally by SyncModule
      const ConflictMarkersError = class extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'ConflictMarkersPresentError';
        }
      };

      mockSyncModule.resolveConflict.mockRejectedValue(
        new ConflictMarkersError('Conflict markers detected')
      );

      // Execute
      await syncCommand.executeResolve({ reason: 'Test resolution' });

      // Verify error handling
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-D2] should create rebase commit and signed resolution commit', async () => {
      // Setup
      mockSyncModule.resolveConflict.mockResolvedValue({
        success: true,
        rebaseCommitHash: 'rebase123',
        resolutionCommitHash: 'resolution456',
        conflictsResolved: 2,
        resolvedBy: 'human:test-user',
        reason: 'Manual resolution'
      });

      // Execute
      await syncCommand.executeResolve({ reason: 'Manual resolution' });

      // Verify
      expect(mockSyncModule.resolveConflict).toHaveBeenCalledWith({
        actorId: 'human:test-user',
        reason: 'Manual resolution'
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Conflict resolved')
      );
    });

    it('[EARS-D3] should include actor-id and reason in signed resolution commit', async () => {
      // Setup
      const actorId = 'human:camilo';
      const reason = 'Kept our version because X reason';

      mockSyncModule.resolveConflict.mockResolvedValue({
        success: true,
        rebaseCommitHash: 'rebase789',
        resolutionCommitHash: 'resolution999',
        conflictsResolved: 1,
        resolvedBy: actorId,
        reason
      });

      // Execute
      await syncCommand.executeResolve({ reason, actor: actorId });

      // Verify correct parameters passed
      expect(mockSyncModule.resolveConflict).toHaveBeenCalledWith({
        actorId,
        reason
      });

      // Verify output shows actor and reason
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining(actorId)
      );
    });

    it('[EARS-D4] should invoke syncModule.resolveConflict() which auto-reindexes', async () => {
      // Setup
      mockSyncModule.resolveConflict.mockResolvedValue({
        success: true,
        rebaseCommitHash: 'rebase111',
        resolutionCommitHash: 'resolution222',
        conflictsResolved: 3,
        resolvedBy: 'human:test-user',
        reason: 'Resolved'
      });

      // Execute
      await syncCommand.executeResolve({ reason: 'Resolved' });

      // Verify resolveConflict was called (re-indexing is internal)
      expect(mockSyncModule.resolveConflict).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('conflicts resolved and indexed')
      );
    });

    it('[EARS-D5] should update status synced after resolve without modifying timestamps', async () => {
      // Setup
      mockSyncModule.resolveConflict.mockResolvedValue({
        success: true,
        rebaseCommitHash: 'rebase333',
        resolutionCommitHash: 'resolution444',
        conflictsResolved: 1,
        resolvedBy: 'human:test-user',
        reason: 'Resolved'
      });

      // Execute
      await syncCommand.executeResolve({ reason: 'Resolved' });

      // Verify session update (status only, no timestamps)
      expect(mockSessionManager.updateActorState).toHaveBeenCalledWith(
        'human:test-user',
        expect.objectContaining({
          syncStatus: expect.objectContaining({
            status: 'synced'
          })
        })
      );

      // Verify lastSyncPush and lastSyncPull are NOT set
      const callArgs = mockSessionManager.updateActorState.mock.calls[0][1];
      expect(callArgs.syncStatus).not.toHaveProperty('lastSyncPush');
      expect(callArgs.syncStatus).not.toHaveProperty('lastSyncPull');
    });
  });

  // =====================================================================
  // EARS-E1 a E6: Operación Audit
  // =====================================================================

  describe('Audit Operation (EARS-E1 a E6)', () => {
    it('[EARS-E1] should invoke auditState with options based on flags', async () => {
      // Setup
      mockSyncModule.auditState.mockResolvedValue({
        passed: true,
        scope: 'all',
        totalCommits: 50,
        rebaseCommits: 5,
        resolutionCommits: 5,
        integrityViolations: [],
        summary: 'All checks passed'
      });

      // Execute with custom flags
      await syncCommand.executeAudit({
        noSignatures: true,
        scope: 'state-branch',
        filesScope: 'all-commits'
      });

      // Verify
      expect(mockSyncModule.auditState).toHaveBeenCalledWith({
        scope: 'state-branch',
        verifySignatures: false, // noSignatures = true
        verifyChecksums: true,
        verifyExpectedFiles: true,
        expectedFilesScope: 'all-commits'
      });
    });

    it('[EARS-E2] should show success and exit code 0 if passed is true', async () => {
      // Setup
      mockSyncModule.auditState.mockResolvedValue({
        passed: true,
        scope: 'all',
        totalCommits: 30,
        rebaseCommits: 3,
        resolutionCommits: 3,
        integrityViolations: [],
        summary: 'All checks passed'
      });

      // Execute
      await syncCommand.executeAudit({});

      // Verify
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('All checks passed')
      );
      expect(mockProcessExit).not.toHaveBeenCalled(); // Exit 0 (success)
    });

    it('[EARS-E3] should show detailed report and exit code 1 if failed', async () => {
      // Setup
      mockSyncModule.auditState.mockResolvedValue({
        passed: false,
        scope: 'all',
        totalCommits: 40,
        rebaseCommits: 6,
        resolutionCommits: 5,
        integrityViolations: [
          {
            rebaseCommitHash: 'abc123',
            commitMessage: 'Rebase without resolution',
            timestamp: new Date().toISOString(),
            author: 'test-user'
          }
        ],
        summary: 'Violations detected',
        lintReport: {
          summary: { filesChecked: 10, errors: 2, warnings: 1, fixable: 0, executionTime: 100 },
          results: [
            {
              level: 'error',
              filePath: '.gitgov/tasks/invalid.json',
              validator: 'SIGNATURE_STRUCTURE',
              message: 'Invalid signature',
              entity: { type: 'task', id: '123-task-invalid' },
              fixable: false
            }
          ],
          metadata: { timestamp: new Date().toISOString(), options: {}, version: '1.0.0' }
        }
      });

      // Execute
      await syncCommand.executeAudit({});

      // Verify error handling
      expect(mockProcessExit).toHaveBeenCalledWith(1);

      // Verify
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Violations detected')
      );
    });

    it('[EARS-E4] should skip verifications based on flags', async () => {
      // Setup
      mockSyncModule.auditState.mockResolvedValue({
        passed: true,
        scope: 'current',
        totalCommits: 20,
        rebaseCommits: 2,
        resolutionCommits: 2,
        integrityViolations: [],
        summary: 'Partial audit passed'
      });

      // Execute with all verification flags disabled
      await syncCommand.executeAudit({
        noSignatures: true,
        noChecksums: true,
        noFiles: true
      });

      // Verify
      expect(mockSyncModule.auditState).toHaveBeenCalledWith({
        scope: 'all',
        verifySignatures: false,
        verifyChecksums: false,
        verifyExpectedFiles: false,
        expectedFilesScope: 'head'
      });
    });

    it('[EARS-E5] should map --scope flag to scope option in auditState', async () => {
      // Setup
      mockSyncModule.auditState.mockResolvedValue({
        passed: true,
        scope: 'current',
        totalCommits: 10,
        rebaseCommits: 1,
        resolutionCommits: 1,
        integrityViolations: [],
        summary: 'Current branch audit passed'
      });

      // Execute with scope flag
      await syncCommand.executeAudit({ scope: 'current' });

      // Verify
      expect(mockSyncModule.auditState).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'current'
        })
      );
    });

    it('[EARS-E6] should map --files-scope flag to expectedFilesScope', async () => {
      // Setup
      mockSyncModule.auditState.mockResolvedValue({
        passed: true,
        scope: 'all',
        totalCommits: 25,
        rebaseCommits: 2,
        resolutionCommits: 2,
        integrityViolations: [],
        summary: 'All commits audit passed'
      });

      // Execute with filesScope flag
      await syncCommand.executeAudit({ filesScope: 'all-commits' });

      // Verify
      expect(mockSyncModule.auditState).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedFilesScope: 'all-commits'
        })
      );
    });
  });

  // =====================================================================
  // EARS-F1 a F2: Actualización de lastError en syncStatus
  // =====================================================================

  describe('Error Tracking (EARS-F1 a F2)', () => {
    beforeEach(() => {
      mockSyncModule.auditState.mockResolvedValue({
        passed: true,
        scope: 'current',
        totalCommits: 10,
        rebaseCommits: 0,
        resolutionCommits: 0,
        integrityViolations: [],
        summary: 'All checks passed'
      });
    });

    it('[EARS-F1] should update lastError in syncStatus when push fails', async () => {
      // Setup
      mockSyncModule.pushState.mockRejectedValue(new Error('Network error during push'));

      // Execute
      await syncCommand.executePush({});

      // Verify error was logged to session
      expect(mockSessionManager.updateActorState).toHaveBeenCalledWith(
        'human:test-user',
        expect.objectContaining({
          syncStatus: expect.objectContaining({
            lastError: expect.stringMatching(/\[.*\] sync push: Network error during push/)
          })
        })
      );
    });

    it('[EARS-F1] should update lastError in syncStatus when pull fails', async () => {
      // Setup
      mockSyncModule.pullState.mockRejectedValue(new Error('Git operation failed'));

      // Execute
      await syncCommand.executePull({});

      // Verify error was logged to session
      expect(mockSessionManager.updateActorState).toHaveBeenCalledWith(
        'human:test-user',
        expect.objectContaining({
          syncStatus: expect.objectContaining({
            lastError: expect.stringMatching(/\[.*\] sync pull: Git operation failed/)
          })
        })
      );
    });

    it('[EARS-F1] should update lastError in syncStatus when resolve fails', async () => {
      // Setup: Mock rebase in progress
      mockGitModule.isRebaseInProgress.mockResolvedValue(true);
      mockSyncModule.isRebaseInProgress.mockResolvedValue(true);
      mockSyncModule.resolveConflict.mockRejectedValue(new Error('Conflict markers detected'));

      // Execute
      await syncCommand.executeResolve({ reason: 'Test resolution' });

      // Verify error was logged to session
      expect(mockSessionManager.updateActorState).toHaveBeenCalledWith(
        'human:test-user',
        expect.objectContaining({
          syncStatus: expect.objectContaining({
            lastError: expect.stringMatching(/\[.*\] sync resolve: Conflict markers detected/)
          })
        })
      );
    });

    it('[EARS-F1] should update lastError in syncStatus when audit fails', async () => {
      // Setup
      mockSyncModule.auditState.mockRejectedValue(new Error('Unable to read state branch'));

      // Execute
      await syncCommand.executeAudit({});

      // Verify error was logged to session
      expect(mockSessionManager.updateActorState).toHaveBeenCalledWith(
        'human:test-user',
        expect.objectContaining({
          syncStatus: expect.objectContaining({
            lastError: expect.stringMatching(/\[.*\] sync audit: Unable to read state branch/)
          })
        })
      );
    });

    it('[EARS-F2] should ignore session update errors and propagate original error', async () => {
      // Setup: Push fails with network error
      mockSyncModule.auditState.mockResolvedValue({
        passed: true,
        scope: 'current',
        totalCommits: 10,
        rebaseCommits: 0,
        resolutionCommits: 0,
        integrityViolations: [],
        summary: 'All checks passed'
      });

      const originalError = new Error('Network error during push');
      mockSyncModule.pushState.mockRejectedValue(originalError);

      // Mock updateActorState to fail (simulating session update error)
      mockSessionManager.updateActorState.mockRejectedValue(
        new Error('Failed to update session')
      );

      // Execute
      await syncCommand.executePush({});

      // Verify original error is propagated (not masked by session update error)
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Push failed: Network error during push')
      );

      // Verify session update was attempted (but failed gracefully)
      expect(mockSessionManager.updateActorState).toHaveBeenCalled();

      // Verify original error message is preserved (not session update error)
      const errorCalls = mockConsoleError.mock.calls;
      const hasOriginalError = errorCalls.some(call =>
        call[0].includes('Network error during push')
      );
      expect(hasOriginalError).toBe(true);
    });
  });

  // =====================================================================
  // Format Tests (JSON output)
  // =====================================================================

  describe('Output Formatting', () => {
    beforeEach(() => {
      mockSyncModule.auditState.mockResolvedValue({
        passed: true,
        scope: 'current',
        totalCommits: 10,
        rebaseCommits: 0,
        resolutionCommits: 0,
        integrityViolations: [],
        summary: 'All checks passed'
      });
    });

    it('should output JSON format when --json flag is used', async () => {
      // Setup
      mockSyncModule.pushState.mockResolvedValue({
        success: true,
        filesSynced: 3,
        sourceBranch: 'main',
        commitHash: 'abc123',
        commitMessage: 'state: Sync from main',
        conflictDetected: false
      });

      // Execute
      await syncCommand.executePush({ json: true });

      // Verify JSON output
      const jsonOutput = mockConsoleLog.mock.calls.find(call =>
        call[0].includes('"success"')
      );
      expect(jsonOutput).toBeDefined();
      expect(() => JSON.parse(jsonOutput![0])).not.toThrow();
    });

    it('should suppress output when --quiet flag is used', async () => {
      // Setup
      mockSyncModule.pushState.mockResolvedValue({
        success: true,
        filesSynced: 2,
        sourceBranch: 'main',
        commitHash: 'def456',
        commitMessage: 'state: Sync from main',
        conflictDetected: false
      });

      mockConsoleLog.mockClear();

      // Execute
      await syncCommand.executePush({ quiet: true });

      // Verify minimal output (only final result, not progress messages)
      const progressMessages = mockConsoleLog.mock.calls.filter(call =>
        call[0].includes('Running') || call[0].includes('Pre-push')
      );
      expect(progressMessages.length).toBe(0);
    });
  });

  // =====================================================================
  // Error Handling Tests
  // =====================================================================

  describe('Error Handling', () => {
    it('should handle missing session gracefully', async () => {
      // Setup: No session
      mockSessionManager.loadSession.mockResolvedValue(null);

      // Execute
      await syncCommand.executePush({});

      // Verify error handling
      expect(mockProcessExit).toHaveBeenCalledWith(1);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('No active identity')
      );
    });

    it('should handle SyncModule errors gracefully', async () => {
      // Setup
      mockSyncModule.auditState.mockResolvedValue({
        passed: true,
        scope: 'current',
        totalCommits: 10,
        rebaseCommits: 0,
        resolutionCommits: 0,
        integrityViolations: [],
        summary: 'All checks passed'
      });

      mockSyncModule.pushState.mockRejectedValue(new Error('Network error'));

      // Execute
      await syncCommand.executePush({});

      // Verify error handling
      expect(mockProcessExit).toHaveBeenCalledWith(1);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Push failed')
      );
    });
  });
});

