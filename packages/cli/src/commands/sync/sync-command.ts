import { Command } from 'commander';
import { BaseCommand } from '../../base/base-command';
import type { BaseCommandOptions } from '../../interfaces/command';
import type { Sync, Config } from '@gitgov/core';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * SyncCommand Options - CLI flags and arguments for sync subcommands
 */
export interface SyncBaseOptions extends BaseCommandOptions {
  format?: 'text' | 'json';
}

export interface SyncPushOptions extends SyncBaseOptions {
  dryRun?: boolean;
  force?: boolean;
}

export interface SyncPullOptions extends SyncBaseOptions {
  reindex?: boolean;
  force?: boolean;  // [EARS-62] Force pull even if local changes would be overwritten
}

export interface SyncResolveOptions extends SyncBaseOptions {
  reason: string;
  actor?: string;
}

export interface SyncAuditOptions extends SyncBaseOptions {
  noSignatures?: boolean;
  noChecksums?: boolean;
  noFiles?: boolean;
  scope?: 'current' | 'state-branch' | 'all';
  filesScope?: 'head' | 'all-commits';
}

/**
 * SyncCommand - State Synchronization CLI Interface
 * 
 * Pure CLI implementation (NO Ink) that delegates all business logic
 * to the SyncModule from @gitgov/core.
 * 
 * Responsibilities:
 * - Parse CLI flags and validate combinations
 * - Delegate to SyncModule methods
 * - Format output (text/JSON) for user consumption
 * - Handle errors with user-friendly messages
 * - Update session state via ConfigManager
 * 
 * Architecture:
 * - CLI acts as presentation layer
 * - SyncModule handles all business logic (including indexation)
 * - No direct calls to IndexerAdapter (handled internally by SyncModule)
 */
export class SyncCommand extends BaseCommand {

  /**
   * Register is not used here since we use registerSyncCommands in sync.ts
   */
  register(program: Command): void {
    // Not used - registration handled in sync.ts
  }

  /**
   * [EARS-8, EARS-11, EARS-12, EARS-27, EARS-29, EARS-30]
   * Execute gitgov sync push - Publish local state changes to gitgov-state
   */
  async executePush(options: SyncPushOptions): Promise<void> {
    try {
      // Get dependencies
      const syncModule = await this.dependencyService.getSyncModule();
      const configManager = await this.dependencyService.getConfigManager();

      // Get actor ID from session
      const session = await configManager.loadSession();
      if (!session || !session.lastSession?.actorId) {
        this.handleError('No active actor in session. Please initialize session first.', options);
        return;
      }
      const actorId = session.lastSession.actorId;

      // Get GitModule to obtain current branch
      const gitModule = await this.dependencyService.getGitModule();
      const currentBranch = await gitModule.getCurrentBranch();

      // [EARS-2] Verify not on gitgov-state branch
      const stateBranchName = await syncModule.getStateBranchName();
      if (currentBranch === stateBranchName) {
        this.handleError(
          `Cannot push from '${stateBranchName}' branch. Please checkout a feature branch.`,
          options
        );
        return;
      }

      // [EARS-8, EARS-9, EARS-10, EARS-11, EARS-12]
      // Execute push (audit runs internally in pushState)
      const pushResult = await syncModule.pushState({
        sourceBranch: currentBranch,
        actorId,
        dryRun: options.dryRun || false,
        force: options.force || false
      });

      // [EARS-10] Handle conflict detection
      if (pushResult.conflictDetected) {
        // [EARS-29] Update session status to conflict
        await configManager.updateActorState(actorId, {
          syncStatus: { status: 'conflict' }
        });

        this.handleError(
          this.formatConflictMessage(pushResult),
          options
        );
        return;
      }

      // [EARS-44] Handle actual errors (not just "no changes")
      if (!pushResult.success && pushResult.error) {
        this.handleError(pushResult.error, options);
        return;
      }

      // [EARS-9] No changes (success=false without error means nothing to sync)
      if (!pushResult.success && !pushResult.conflictDetected && !pushResult.error) {
        if (!options.quiet) {
          console.log('ℹ️  No changes to push');
        }
        return;
      }

      // [EARS-27] Success - update session
      if (pushResult.success) {
        await configManager.updateActorState(actorId, {
          syncStatus: {
            lastSyncPush: new Date().toISOString(),
            status: 'synced'
          }
        });
      }

      // [EARS-30] Check if there are pending local changes
      const hasPendingChanges = await this.checkPendingChanges(syncModule, currentBranch);
      if (hasPendingChanges) {
        await configManager.updateActorState(actorId, {
          syncStatus: { status: 'pending' }
        });
      }

      // Format output
      this.formatPushOutput(pushResult, options);

    } catch (error) {
      // [EARS-32] Update lastError in syncStatus
      try {
        const configManager = await this.dependencyService.getConfigManager();
        const session = await configManager.loadSession();
        if (session?.lastSession?.actorId) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const timestamp = new Date().toISOString();
          await configManager.updateActorState(session.lastSession.actorId, {
            syncStatus: {
              lastError: `[${timestamp}] sync push: ${errorMessage}`
            }
          });
        }
      } catch (sessionError) {
        // Ignore session update errors to avoid masking original error
      }

      this.handleError(
        `Push failed: ${error instanceof Error ? error.message : String(error)}`,
        options,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * [EARS-13, EARS-14, EARS-15, EARS-16, EARS-28, EARS-29]
   * Execute gitgov sync pull - Pull remote state changes from gitgov-state
   */
  async executePull(options: SyncPullOptions): Promise<void> {
    try {
      // Get dependencies
      const syncModule = await this.dependencyService.getSyncModule();
      const configManager = await this.dependencyService.getConfigManager();

      // NOTE: Pull does NOT require an active actor (it's a read operation)
      // Only push requires an actor (for commit authorship)

      if (!options.quiet) {
        console.log('🔄 Pulling state changes from gitgov-state...');
      }

      // [EARS-13, EARS-15, EARS-16, EARS-62] Execute pull
      // SyncModule.pullState() handles indexation internally
      const pullResult = await syncModule.pullState({
        forceReindex: options.reindex || false,
        force: options.force || false  // [EARS-62] Force overwrite of local changes
      });

      // [EARS-14, EARS-61] Handle conflict detection FIRST (before generic errors)
      // This ensures we show detailed conflict info with affected files
      if (pullResult.conflictDetected) {
        // [EARS-29] Update session status to conflict (if actor exists)
        const session = await configManager.loadSession();
        if (session?.lastSession?.actorId) {
          await configManager.updateActorState(session.lastSession.actorId, {
            syncStatus: { status: 'conflict' }
          });
        }

        this.handleError(
          this.formatConflictMessage(pullResult),
          options
        );
        return;
      }

      // [EARS-44] Handle actual errors (not just "no changes")
      if (!pullResult.success && pullResult.error) {
        this.handleError(pullResult.error, options);
        return;
      }

      // [EARS-28] Success - update session (if actor exists)
      if (pullResult.success) {
        const session = await configManager.loadSession();
        if (session?.lastSession?.actorId) {
          await configManager.updateActorState(session.lastSession.actorId, {
            syncStatus: {
              lastSyncPull: new Date().toISOString(),
              status: 'synced'
            }
          });
        }
      }

      // Format output
      this.formatPullOutput(pullResult, options);

    } catch (error) {
      // [EARS-32] Update lastError in syncStatus
      try {
        const configManager = await this.dependencyService.getConfigManager();
        const session = await configManager.loadSession();
        if (session?.lastSession?.actorId) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const timestamp = new Date().toISOString();
          await configManager.updateActorState(session.lastSession.actorId, {
            syncStatus: {
              lastError: `[${timestamp}] sync pull: ${errorMessage}`
            }
          });
        }
      } catch (sessionError) {
        // Ignore session update errors to avoid masking original error
      }

      this.handleError(
        `Pull failed: ${error instanceof Error ? error.message : String(error)}`,
        options,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * [EARS-17, EARS-18, EARS-19, EARS-20, EARS-31]
   * Execute gitgov sync resolve - Resolve state conflicts in a governed manner
   */
  async executeResolve(options: SyncResolveOptions): Promise<void> {
    try {
      // Get dependencies
      const syncModule = await this.dependencyService.getSyncModule();
      const configManager = await this.dependencyService.getConfigManager();

      // Get actor ID (use provided or current session)
      let actorId = options.actor;
      if (!actorId) {
        const session = await configManager.loadSession();
        if (!session || !session.lastSession?.actorId) {
          this.handleError('No active actor in session. Use --actor flag or initialize session first.', options);
          return;
        }
        actorId = session.lastSession.actorId;
      }

      // [EARS-4] Verify rebase is in progress
      const gitModule = await this.dependencyService.getGitModule();
      const isRebaseInProgress = await gitModule.isRebaseInProgress();

      if (!isRebaseInProgress) {
        this.handleError(
          'No rebase in progress. Run "gitgov sync pull" or "gitgov sync push" to start synchronization.',
          options
        );
        return;
      }

      // [EARS-17] Check for conflict markers
      const hasConflictMarkers = await this.checkConflictMarkers();
      if (hasConflictMarkers) {
        this.handleError(
          'Conflict markers detected in .gitgov/ files. Please resolve conflicts manually before running resolve.',
          options
        );
        return;
      }

      if (!options.quiet) {
        console.log('🔧 Resolving conflict...');
      }

      // [EARS-18, EARS-19, EARS-20] Execute resolve
      // SyncModule.resolveConflict() handles indexation internally
      const resolveResult = await syncModule.resolveConflict({
        actorId,
        reason: options.reason
      });

      // [EARS-31] Success - update session (status only, not timestamps)
      if (resolveResult.success) {
        await configManager.updateActorState(actorId, {
          syncStatus: { status: 'synced' }
        });
      }

      // Format output
      this.formatResolveOutput(resolveResult, options);

    } catch (error) {
      // [EARS-32] Update lastError in syncStatus
      try {
        const configManager = await this.dependencyService.getConfigManager();
        const session = await configManager.loadSession();
        if (session?.lastSession?.actorId) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const timestamp = new Date().toISOString();
          await configManager.updateActorState(session.lastSession.actorId, {
            syncStatus: {
              lastError: `[${timestamp}] sync resolve: ${errorMessage}`
            }
          });
        }
      } catch (sessionError) {
        // Ignore session update errors to avoid masking original error
      }

      this.handleError(
        `Resolve failed: ${error instanceof Error ? error.message : String(error)}`,
        options,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * [EARS-21, EARS-22, EARS-23, EARS-24, EARS-25, EARS-26]
   * Execute gitgov sync audit - Execute complete audit of gitgov-state
   */
  async executeAudit(options: SyncAuditOptions): Promise<void> {
    try {
      // Get dependencies
      const syncModule = await this.dependencyService.getSyncModule();

      if (!options.quiet) {
        console.log('🔍 Running state audit...');
      }

      // [EARS-21, EARS-24, EARS-25, EARS-26] Execute audit with options
      const auditResult = await syncModule.auditState({
        scope: options.scope || 'all',
        verifySignatures: !options.noSignatures,
        verifyChecksums: !options.noChecksums,
        verifyExpectedFiles: !options.noFiles,
        expectedFilesScope: options.filesScope || 'head'
      });

      // [EARS-22, EARS-23] Format output and exit
      this.formatAuditOutput(auditResult, options);

      // Exit with appropriate code
      if (!auditResult.passed) {
        process.exit(1);
      }

    } catch (error) {
      // [EARS-32] Update lastError in syncStatus
      try {
        const configManager = await this.dependencyService.getConfigManager();
        const session = await configManager.loadSession();
        if (session?.lastSession?.actorId) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const timestamp = new Date().toISOString();
          await configManager.updateActorState(session.lastSession.actorId, {
            syncStatus: {
              lastError: `[${timestamp}] sync audit: ${errorMessage}`
            }
          });
        }
      } catch (sessionError) {
        // Ignore session update errors to avoid masking original error
      }

      this.handleError(
        `Audit failed: ${error instanceof Error ? error.message : String(error)}`,
        options,
        error instanceof Error ? error : undefined
      );
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * [EARS-30] Check if there are pending local changes not published
   */
  private async checkPendingChanges(
    syncModule: Sync.SyncModule,
    sourceBranch: string
  ): Promise<boolean> {
    const delta = await syncModule.calculateStateDelta(sourceBranch);
    return delta.length > 0;
  }

  /**
   * [EARS-17] Check for conflict markers in .gitgov/ files
   */
  private async checkConflictMarkers(): Promise<boolean> {
    const gitgovDir = path.join(process.cwd(), '.gitgov');

    try {
      const files = await this.getAllFilesRecursively(gitgovDir);

      for (const file of files) {
        const content = await fs.readFile(file, 'utf-8');
        if (
          content.includes('<<<<<<<') ||
          content.includes('=======') ||
          content.includes('>>>>>>>')
        ) {
          return true;
        }
      }

      return false;
    } catch (error) {
      // If directory doesn't exist or can't be read, assume no conflicts
      return false;
    }
  }

  /**
   * Recursively get all files in a directory
   */
  private async getAllFilesRecursively(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.getAllFilesRecursively(fullPath));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * [EARS-10] Format conflict message for user guidance
   */
  private formatConflictMessage(result: Sync.SyncPushResult | Sync.SyncPullResult): string {
    if (!result.conflictInfo) {
      return 'Conflict detected during synchronization.';
    }

    const steps = result.conflictInfo.resolutionSteps || [
      '1. Run: gitgov sync pull',
      '2. Resolve conflicts manually in .gitgov/ files',
      '3. Run: gitgov sync resolve --reason "..."',
      '4. Try again: gitgov sync push'
    ];

    return `
⚠️  Conflict detected in gitgov-state

${result.conflictInfo.message}

Affected files:
${result.conflictInfo.affectedFiles.map(f => `  - ${f}`).join('\n')}

To resolve:
${steps.join('\n')}
    `.trim();
  }

  /**
   * Format push output
   */
  private formatPushOutput(result: Sync.SyncPushResult, options: SyncBaseOptions): void {
    const isJson = options.json || options.format === 'json';

    if (isJson) {
      console.log(JSON.stringify({
        success: result.success,
        filesSynced: result.filesSynced,
        sourceBranch: result.sourceBranch,
        commitHash: result.commitHash,
        commitMessage: result.commitMessage,
        conflictDetected: result.conflictDetected,
        implicitPull: result.implicitPull // [EARS-54] Include implicit pull results
      }, null, 2));
      return;
    }

    if (!options.quiet) {
      // [EARS-54] Show implicit pull results first (if any changes were pulled)
      if (result.implicitPull?.hasChanges) {
        console.log(`🔄 Pulled ${result.implicitPull.filesUpdated} files from remote during reconciliation`);
        if (result.implicitPull.reindexed) {
          console.log('🔄 Index regenerated');
        }
      }

      // [EARS-9] Handle "no changes" case (can be success=true with 0 files or success=false without conflict)
      if (result.filesSynced === 0) {
        console.log('ℹ️  No local changes to push');
      } else if (result.success) {
        console.log(`✅ ${result.filesSynced} files synced to gitgov-state`);
        if (result.commitHash) {
          console.log(`📝 Commit: ${result.commitHash.substring(0, 8)}`);
        }
      }
    }
  }

  /**
   * Format pull output
   */
  private formatPullOutput(result: Sync.SyncPullResult, options: SyncBaseOptions): void {
    const isJson = options.json || options.format === 'json';

    if (isJson) {
      console.log(JSON.stringify({
        success: result.success,
        filesUpdated: result.filesUpdated,
        hasChanges: result.hasChanges,
        reindexed: result.reindexed,
        conflictDetected: result.conflictDetected
      }, null, 2));
      return;
    }

    if (!options.quiet) {
      if (result.hasChanges) {
        console.log(`✅ ${result.filesUpdated} files updated from gitgov-state`);
        if (result.reindexed) {
          console.log('🔄 Index regenerated');
        }
      } else {
        console.log('✅ Already up to date');
      }
    }
  }

  /**
   * Format resolve output
   */
  private formatResolveOutput(result: Sync.SyncResolveResult, options: SyncBaseOptions): void {
    const isJson = options.json || options.format === 'json';

    if (isJson) {
      console.log(JSON.stringify({
        success: result.success,
        rebaseCommitHash: result.rebaseCommitHash,
        resolutionCommitHash: result.resolutionCommitHash,
        conflictsResolved: result.conflictsResolved,
        resolvedBy: result.resolvedBy,
        reason: result.reason
      }, null, 2));
      return;
    }

    if (!options.quiet) {
      if (result.success) {
        console.log(`✅ Conflict resolved by ${result.resolvedBy}`);
        console.log(`📝 Resolution commit: ${result.resolutionCommitHash.substring(0, 8)}`);
        console.log(`🔄 ${result.conflictsResolved} conflicts resolved and indexed`);
      }
    }
  }

  /**
   * [EARS-22, EARS-23] Format audit output
   */
  private formatAuditOutput(result: Sync.AuditStateReport, options: SyncBaseOptions): void {
    const isJson = options.json || options.format === 'json';

    if (isJson) {
      console.log(JSON.stringify({
        passed: result.passed,
        scope: result.scope,
        totalCommits: result.totalCommits,
        rebaseCommits: result.rebaseCommits,
        resolutionCommits: result.resolutionCommits,
        integrityViolations: result.integrityViolations,
        lintReport: result.lintReport
      }, null, 2));
      return;
    }

    // Text format
    if (!options.quiet) {
      console.log('✓ Audit complete\n');
      console.log('Summary:');
      console.log(`  • Total commits: ${result.totalCommits}`);
      console.log(`  • Rebase commits: ${result.rebaseCommits}`);
      console.log(`  • Resolution commits: ${result.resolutionCommits}`);
      console.log(`  • Integrity violations: ${result.integrityViolations.length}`);

      // Show lint report summary if available
      const lintReport = result.lintReport;
      if (lintReport) {
        console.log(`  • Lint errors: ${lintReport.summary.errors}`);
        console.log(`  • Lint warnings: ${lintReport.summary.warnings}`);
      }
      console.log('');
    }

    if (result.passed) {
      console.log('✅ State integrity verified: All checks passed');
    } else {
      console.log('❌ State integrity compromised: Violations detected\n');

      // Show integrity violations
      if (result.integrityViolations.length > 0) {
        console.log('Integrity Violations:');
        for (const violation of result.integrityViolations) {
          console.log(`  • Rebase commit ${violation.rebaseCommitHash.substring(0, 8)} by ${violation.author} has no resolution commit`);
        }
        console.log('');
      }

      // Show lint errors
      const lintReport = result.lintReport;
      if (lintReport && lintReport.results && lintReport.results.length > 0) {
        const errors = lintReport.results.filter(r => r.level === 'error');
        if (errors.length > 0) {
          console.log('Lint Errors:');
          for (const error of errors) {
            console.log(`  • ${error.message} (${error.filePath})`);
          }
        }
      }
    }
  }
}

