import { DependencyInjectionService } from '../../services/dependency-injection';
import type { Session } from '@gitgov/core';

// Re-export type from Session namespace
type SyncStatus = Session.SyncStatus;

/**
 * Context Command Options interface
 */
export interface ContextCommandOptions {
  json?: boolean;
  actor?: string;
}

/**
 * Actor context combining config and session data
 */
interface ActorContext {
  actorId: string;
  projectInfo: { id: string; name: string } | null;
  rootCycle: string | null;
  activeCycleId: string | null;
  activeTaskId: string | null;
  syncStatus: SyncStatus | null;
}

/**
 * ContextCommand - Query Working Context
 *
 * Blueprint: packages/blueprints/03_products/cli/specs/context_command.md
 *
 * Provides context information for agents and automation tools.
 * Returns information from config.json (project-level) and .session.json (actor-level).
 *
 * This is different from `gitgov status` which shows dashboards and metrics.
 * This command is specifically for querying the current working context.
 *
 * EARS Coverage:
 * - §4.1 Consulta de Contexto Básica (EARS-A1 to A4)
 * - §4.2 Manejo de Valores Nulos y Edge Cases (EARS-B1 to B3)
 * - §4.3 Manejo de Errores (EARS-C1 to C5)
 * - §4.4 Edge Cases Adicionales (EARS-D1)
 */
export class ContextCommand {
  private dependencyService = DependencyInjectionService.getInstance();

  /**
   * [EARS-A1] Main execution method - query context for current actor
   * [EARS-A2] JSON output with --json flag
   * [EARS-A3] Query specific actor with --actor flag
   * [EARS-A4] Specific actor with JSON output
   */
  async execute(options: ContextCommandOptions): Promise<void> {
    try {
      // 1. Determine which actor to query
      // [EARS-A3] Use explicitly provided actor ID if --actor flag
      // [EARS-A1] Otherwise use current actor
      let actorId: string;
      if (options.actor) {
        actorId = options.actor;
      } else {
        const identityAdapter = await this.dependencyService.getIdentityAdapter();
        const currentActor = await identityAdapter.getCurrentActor();
        actorId = currentActor.id;
      }

      // 2. Build context from ConfigManager and SessionManager
      const context = await this.buildActorContext(actorId);

      // 3. Output based on format
      // [EARS-A2] [EARS-A4] JSON output when --json flag is provided
      if (options.json) {
        console.log(JSON.stringify(context, null, 2));
      } else {
        // Human-readable output
        // [EARS-A1] Show actor, project, rootCycle, activeCycleId, activeTaskId
        console.log(`👤 Actor: ${context.actorId}`);
        // [EARS-B2] Omit projectInfo line if null
        if (context.projectInfo) {
          console.log(`📁 Project: ${context.projectInfo.name} (${context.projectInfo.id})`);
        }
        // [EARS-B1] [EARS-B3] Show "none" for null values
        console.log(`🔗 Root Cycle: ${context.rootCycle || 'none'}`);
        console.log(`⚡ Active Cycle: ${context.activeCycleId || 'none'}`);
        console.log(`📋 Active Task: ${context.activeTaskId || 'none'}`);

        // Sync Status section
        if (context.syncStatus) {
          console.log(`\n🔄 Sync Status:`);

          // Last push
          if (context.syncStatus.lastSyncPush) {
            const pushTime = this.formatRelativeTime(context.syncStatus.lastSyncPush);
            console.log(`  • Last push: ${context.syncStatus.lastSyncPush} (${pushTime})`);
          }

          // Last pull
          if (context.syncStatus.lastSyncPull) {
            const pullTime = this.formatRelativeTime(context.syncStatus.lastSyncPull);
            console.log(`  • Last pull: ${context.syncStatus.lastSyncPull} (${pullTime})`);
          }

          // Status
          if (context.syncStatus.status) {
            const statusIcon = this.getStatusIcon(context.syncStatus.status);
            console.log(`  • Status: ${statusIcon} ${context.syncStatus.status}`);
          }

          // Last error (if any)
          if (context.syncStatus.lastError) {
            console.log(`  • Last error: ${context.syncStatus.lastError}`);
          }
        }
      }

    } catch (error) {
      this.handleError(error, options);
    }
  }

  /**
   * Build actor context from ConfigManager and SessionManager
   * [EARS-D1] Handle empty actor state (null activeCycleId/activeTaskId)
   * [EARS-C2] Throws if getActorState fails
   */
  private async buildActorContext(actorId: string): Promise<ActorContext> {
    const configManager = await this.dependencyService.getConfigManager();
    const sessionManager = await this.dependencyService.getSessionManager();

    // Get data from both managers in parallel
    const [projectInfo, rootCycle, actorState] = await Promise.all([
      configManager.getProjectInfo(),
      configManager.getRootCycle(),
      sessionManager.getActorState(actorId),
    ]);

    return {
      actorId,
      projectInfo,
      rootCycle,
      activeCycleId: actorState?.activeCycleId || null,
      activeTaskId: actorState?.activeTaskId || null,
      syncStatus: actorState?.syncStatus || null,
    };
  }

  /**
   * Format ISO timestamp to relative time (e.g., "2h ago")
   */
  private formatRelativeTime(isoTimestamp: string): string {
    try {
      const now = Date.now();
      const then = new Date(isoTimestamp).getTime();
      const diffMs = now - then;

      const seconds = Math.floor(diffMs / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (days > 0) return `${days}d ago`;
      if (hours > 0) return `${hours}h ago`;
      if (minutes > 0) return `${minutes}m ago`;
      return `${seconds}s ago`;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get icon for sync status
   */
  private getStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      'synced': '✓',
      'pending': '↑',
      'pulling': '↓',
      'pushing': '⬆',
      'conflict': '⚠'
    };
    return icons[status] || '•';
  }

  /**
   * Error handling
   * [EARS-C1] Handle getCurrentActor failures
   * [EARS-C2] Handle getActorState failures
   * [EARS-C3] JSON error format when --json flag is provided
   * [EARS-C4] Handle unknown error types
   * [EARS-C5] Handle actor not found errors
   */
  private handleError(error: unknown, options: ContextCommandOptions): void {
    if (error instanceof Error) {
      // [EARS-C3] JSON error format
      if (options.json) {
        console.error(JSON.stringify({
          success: false,
          error: error.message
        }, null, 2));
      } else {
        // [EARS-C1] [EARS-C2] [EARS-C5] Error message for humans
        console.error(`❌ Error: ${error.message}`);
      }
      process.exit(1);
    } else {
      // [EARS-C4] Unknown error type
      if (options.json) {
        console.error(JSON.stringify({
          success: false,
          error: 'Unknown error'
        }, null, 2));
      } else {
        console.error('❌ Unknown error occurred');
      }
      process.exit(1);
    }
  }
}

