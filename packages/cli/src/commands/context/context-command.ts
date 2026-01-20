import { DependencyInjectionService } from '../../services/dependency-injection';
import { Config } from '@gitgov/core';

/**
 * Context Command Options interface
 */
export interface ContextCommandOptions {
  json?: boolean;
  actor?: string;
}

/**
 * ContextCommand - Query Working Context
 * 
 * Provides context information for agents and automation tools.
 * Returns information from config.json (project-level) and .session.json (actor-level).
 * 
 * This is different from `gitgov status` which shows dashboards and metrics.
 * This command is specifically for querying the current working context.
 */
export class ContextCommand {
  private dependencyService = DependencyInjectionService.getInstance();

  /**
   * Main execution method
   */
  async execute(options: ContextCommandOptions): Promise<void> {
    try {
      // 1. Determine which actor to query
      let actorId: string;
      if (options.actor) {
        // Use explicitly provided actor ID
        actorId = options.actor;
      } else {
        // Use current actor
        const identityAdapter = await this.dependencyService.getIdentityAdapter();
        const currentActor = await identityAdapter.getCurrentActor();
        actorId = currentActor.id;
      }

      // 2. Get context from ConfigManager
      const configManager = Config.createConfigManager();
      const context = await configManager.getActorContext(actorId);

      // 3. Output based on format
      if (options.json) {
        console.log(JSON.stringify(context, null, 2));
      } else {
        // Human-readable output
        console.log(`👤 Actor: ${context.actorId}`);
        if (context.projectInfo) {
          console.log(`📁 Project: ${context.projectInfo.name} (${context.projectInfo.id})`);
        }
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
   */
  private handleError(error: unknown, options: ContextCommandOptions): void {
    if (error instanceof Error) {
      if (options.json) {
        console.error(JSON.stringify({
          success: false,
          error: error.message
        }, null, 2));
      } else {
        console.error(`❌ Error: ${error.message}`);
      }
      process.exit(1);
    } else {
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

