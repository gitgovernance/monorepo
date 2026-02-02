// Dynamic imports for TUI - only loaded when needed
// import React from 'react';
// import { render } from 'ink';
import * as fs from 'fs';
import * as path from 'path';
import { DependencyInjectionService } from '../../services/dependency-injection';
// import DashboardTUI from '../../components/dashboard/DashboardTUI';
import type {
  CycleRecord, FeedbackRecord, ActorRecord, TaskRecord,
  SystemStatus, ProductivityMetrics, CollaborationMetrics, EnrichedTaskRecord,
} from '@gitgov/core';
import type { ActivityEvent } from '@gitgov/core';

/**
 * Dashboard Command Options interface
 */
export interface DashboardCommandOptions {
  template?: 'row-based' | 'kanban-4col' | 'kanban-7col' | 'scrum-board';
  view?: string;
  methodology?: 'default' | 'scrum';
  refreshInterval?: number;
  noLive?: boolean; // Flag para desactivar live mode
  actor?: string;
  theme?: 'dark' | 'light';
  noCache?: boolean;
  debug?: boolean;
  config?: string;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}


/**
 * Dashboard Intelligence Data
 */
interface DashboardIntelligence {
  systemHealth: SystemStatus;
  productivityMetrics: ProductivityMetrics;
  collaborationMetrics: CollaborationMetrics;
  tasks: EnrichedTaskRecord[]; // ENHANCED - Tasks with last modification info
  cycles: CycleRecord[];
  feedback: FeedbackRecord[];
  currentActor: ActorRecord;
  activityHistory: ActivityEvent[]; // NUEVO - Activity history real
}

/**
 * View Configuration
 */
interface ViewConfig {
  name: string;
  layout: 'table' | 'columns' | 'sprint';
  columns?: Record<string, string[]>;
  theme: string;
}

/**
 * DashboardCommand - CONVERGENCIA ÉPICA
 * 
 * Implements TUI enterprise dashboard with 6-adapter orchestration,
 * multi-methodology support and real-time intelligence.
 */
export class DashboardCommand {
  private dependencyService = DependencyInjectionService.getInstance();

  /**
   * [EARS-A1] Main execution method with 6-adapter convergence
   */
  async execute(options: DashboardCommandOptions): Promise<void> {
    try {
      // Handle JSON output mode (non-TUI)
      if (options.json) {
        await this.executeJsonOutput(options);
        return;
      }

      // 1. Auto-indexation strategy
      await this.ensureCacheUpToDate(options);

      // 2. Initialize 6-adapter convergence
      const intelligence = await this.gatherDashboardIntelligence(options);

      // 3. Determine view configuration
      const viewConfig = await this.determineViewConfig(options);

      // 4. Launch TUI (live mode por defecto, --no-live para desactivar)
      await this.launchTUI(intelligence, viewConfig, options);

    } catch (error) {
      this.handleError(error, options);
    }
  }

  /**
   * [EARS-A4] Ensures cache is up to date with auto-indexation
   * [EARS-D3] Respects --quiet flag for silent operation
   */
  private async ensureCacheUpToDate(options: DashboardCommandOptions): Promise<void> {
    if (options.noCache) {
      return; // Skip cache when using direct source
    }

    const indexerAdapter = await this.dependencyService.getIndexerAdapter();
    const isUpToDate = await indexerAdapter.isIndexUpToDate();

    if (!isUpToDate) {
      if (!options.quiet) {
        console.log("🔄 Updating intelligence cache for dashboard...");
      }
      await indexerAdapter.generateIndex();
    }
  }

  /**
   * [EARS-A2] Gathers intelligence from all 6 adapters including activity history
   * [EARS-A3] Uses pre-calculated metrics from IndexerAdapter cache
   * [EARS-E1] Returns enrichedTasks with lastUpdated metadata from IndexerAdapter
   */
  private async gatherDashboardIntelligence(options: DashboardCommandOptions): Promise<DashboardIntelligence> {
    // Get all adapters (6-adapter convergence)
    const backlogAdapter = await this.dependencyService.getBacklogAdapter();
    const metricsAdapter = await this.dependencyService.getMetricsAdapter();
    const feedbackAdapter = await this.dependencyService.getFeedbackAdapter();
    const identityAdapter = await this.dependencyService.getIdentityAdapter();
    const indexerAdapter = await this.dependencyService.getIndexerAdapter();

    // Get index data with immediate regeneration if missing (DEMO OPTIMIZATION)
    let indexData = await indexerAdapter.getIndexData();
    if (!indexData) {
      // Immediate regeneration for demo - keeps activity stream alive (~100ms)
      await indexerAdapter.generateIndex();
      indexData = await indexerAdapter.getIndexData();
    }

    // Gather data from all adapters simultaneously
    const [
      systemHealth,
      productivityMetrics,
      collaborationMetrics,
      tasks,
      cycles,
      feedback,
      currentActor
    ] = await Promise.all([
      metricsAdapter.getSystemStatus(),
      metricsAdapter.getProductivityMetrics(),
      metricsAdapter.getCollaborationMetrics(),
      backlogAdapter.getAllTasks(),
      backlogAdapter.getAllCycles(),
      feedbackAdapter.getAllFeedback(),
      identityAdapter.getCurrentActor()
    ]);

    // NUEVO - Use enriched tasks from IndexerAdapter (with lastUpdated metadata)
    const enhancedTasks = indexData?.enrichedTasks || [];

    return {
      systemHealth,
      productivityMetrics,
      collaborationMetrics,
      tasks: enhancedTasks,
      cycles,
      feedback,
      currentActor,
      activityHistory: indexData?.activityHistory || [] // NUEVO - Activity history real, nunca vacío
    };
  }

  /**
   * [EARS-B1] [EARS-B2] [EARS-B3] [EARS-B4] [EARS-B5] Determines view configuration based on methodology and options
   */
  private async determineViewConfig(options: DashboardCommandOptions): Promise<ViewConfig> {
    // Default view configurations (usando workflow_default.json)
    const defaultViews: Record<string, ViewConfig> = {
      'row-based': {
        name: 'GitGovernancet',
        layout: 'table',
        theme: 'ai-native'
      },
      'kanban-4col': {
        name: 'Kanban Executive',
        layout: 'columns',
        columns: {
          'Draft': ['draft'],
          'In Progress': ['review', 'ready', 'active'],
          'Review': ['done'],
          'Done': ['archived']
        },
        theme: 'minimal'
      },
      'kanban-7col': {
        name: 'Kanban Developer',
        layout: 'columns',
        columns: {
          'Draft': ['draft'],
          'Review': ['review'],
          'Ready': ['ready'],
          'Active': ['active'],
          'Done': ['done'],
          'Archived': ['archived'],
          'Blocked': ['paused']
        },
        theme: 'corporate'
      },
      'scrum-board': {
        name: 'Scrum Sprint Board',
        layout: 'sprint',
        columns: {
          'Product Backlog': ['draft'],
          'Sprint Backlog': ['review', 'ready'],
          'In Progress': ['active'],
          'Done': ['done'],
          'Demo Ready': ['archived']
        },
        theme: 'scrum'
      }
    };

    // Use explicit template if provided
    if (options.template && options.template in defaultViews) {
      return defaultViews[options.template] as ViewConfig;
    }

    // Use methodology to determine default template
    const methodology = options.methodology || 'default';
    if (methodology === 'scrum') {
      return defaultViews['scrum-board'] as ViewConfig;
    }

    // Default to row-based (the foundational vision)
    return defaultViews['row-based'] as ViewConfig;
  }

  /**
   * [EARS-C1] [EARS-C2] Launches interactive TUI dashboard with Ink/React (DEFAULT)
   * [EARS-C3] [EARS-C4] Keyboard shortcuts and manual refresh
   * [EARS-C5] Error overlay handling
   * [EARS-D3] Respects --quiet flag for silent operation
   */
  private async launchTUI(
    intelligence: DashboardIntelligence,
    viewConfig: ViewConfig,
    options: DashboardCommandOptions
  ): Promise<void> {
    if (!options.quiet) {
      console.log("🚀 Launching Interactive TUI Dashboard...");
    }

    try {
      // Static imports - bundle everything
      const { render } = await import('ink');
      const React = await import('react');
      const { default: DashboardTUI } = await import('../../components/dashboard/DashboardTUI');

      // Skip actual TUI execution in test environment, but allow render call for testing
      if (process.env['NODE_ENV'] === 'test') {
        // Call render for test verification, but don't wait for exit
        render(React.createElement(DashboardTUI, {
          intelligence,
          viewConfig,
          template: options.template || 'row-based',
          refreshInterval: parseInt(String(options.refreshInterval || '1')),
          live: !options.noLive,
          onRefresh: async () => intelligence // Mock refresh
        }));
        return; // Exit early in test environment
      }

      // Launch Ink TUI with real-time capabilities y re-fetch callback
      const { waitUntilExit } = render(
        React.createElement(DashboardTUI, {
          intelligence,
          viewConfig,
          template: options.template || 'row-based',
          refreshInterval: parseInt(String(options.refreshInterval || '1')), // DEMO: 1 segundo para respuesta inmediata
          live: !options.noLive, // Live mode por defecto, --no-live para desactivar
          onRefresh: async () => {
            // Re-fetch REAL data from adapters
            return await this.gatherDashboardIntelligence(options);
          },
          themeName: options.theme ?? 'dark'
        })
      );

      // Wait for user to exit
      await waitUntilExit();
    } catch (error) {
      console.error('❌ TUI failed to launch:', error instanceof Error ? error.message : String(error));
      console.error('💡 Try using --json for headless mode');
      process.exit(1);
    }
  }



  /**
   * [EARS-D1] Executes JSON output mode for automation
   */
  private async executeJsonOutput(options: DashboardCommandOptions): Promise<void> {
    const intelligence = await this.gatherDashboardIntelligence(options);
    const viewConfig = await this.determineViewConfig(options);

    console.log(JSON.stringify({
      success: true,
      dashboard: {
        actor: {
          id: intelligence.currentActor.id,
          displayName: intelligence.currentActor.displayName
        },
        view: {
          template: options.template || 'row-based',
          methodology: options.methodology || 'default',
          config: viewConfig
        },
        intelligence: {
          systemHealth: intelligence.systemHealth,
          productivityMetrics: intelligence.productivityMetrics,
          collaborationMetrics: intelligence.collaborationMetrics
        },
        data: {
          tasksCount: intelligence.tasks.length,
          cyclesCount: intelligence.cycles.length,
          feedbackCount: intelligence.feedback.length
        }
      }
    }, null, 2));
  }

  // ===== TASK ENHANCEMENT FOR DYNAMIC ORDERING (EARS-E) =====


  /**
   * [EARS-E4] Extracts timestamp from GitGovernance ID format (timestamp-type-slug)
   */
  private extractTimestampFromId(id: string): number {
    const parts = id.split('-');
    if (parts.length >= 1 && parts[0]) {
      const timestampPart = parts[0];
      const timestamp = parseInt(timestampPart, 10);
      if (!isNaN(timestamp) && timestamp > 1000000000) { // Valid Unix timestamp
        return timestamp * 1000; // Convert to milliseconds
      }
    }
    return Date.now(); // Fallback to current time
  }

  /**
   * [EARS-E2] Formats activity description for display in dashboard
   */
  private formatActivityDescription(activity: ActivityEvent): string {
    const timeAgo = this.getTimeAgo(activity.timestamp);

    switch (activity.type) {
      case 'task_created':
        return `Created ${timeAgo}`;
      case 'feedback_created':
        if (activity.metadata?.type === 'assignment') {
          return `Assigned ${timeAgo}`;
        }
        return `Feedback ${timeAgo}`;
      case 'execution_created':
        return `Progress ${timeAgo}`;
      case 'changelog_created':
        return `Updated ${timeAgo}`;
      default:
        return `Activity ${timeAgo}`;
    }
  }

  /**
   * [EARS-E4] Converts timestamp to human-readable "time ago" format
   */
  private getTimeAgo(timestamp: number): string {
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return 'now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 7)}w ago`;
  }

  // ===== HELPER METHODS =====

  /**
   * Gets health icon based on score
   */
  private getHealthIcon(score: number): string {
    if (score >= 80) return '🟢';
    if (score >= 60) return '🟡';
    return '🔴';
  }

  /**
   * Gets status icon for visual output
   */
  private getStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      'draft': '📝',
      'review': '👀',
      'ready': '🟢',
      'active': '⚡',
      'done': '✅',
      'paused': '⏸️',
      'archived': '📦'
    };
    return icons[status] || '❓';
  }

  /**
   * Gets priority flag for visual output
   */
  private getPriorityFlag(priority: string): string {
    const flags: Record<string, string> = {
      'critical': '🔴',
      'high': '🟠',
      'medium': '🔵',
      'low': '⚪'
    };
    return flags[priority] || '⚪';
  }

  // ===== HELPER METHODS USANDO ADAPTERS (NO DUPLICAR LÓGICA) =====

  /**
   * Gets tasks created today using MetricsAdapter
   */
  private async getTasksToday(tasks: TaskRecord[]): Promise<number> {
    const metricsAdapter = await this.dependencyService.getMetricsAdapter();
    return metricsAdapter.calculateTasksCreatedToday(tasks);
  }

  /**
   * Gets derived state for task using MetricsAdapter logic
   */
  private async getDerivedState(task: TaskRecord): Promise<string | null> {
    const metricsAdapter = await this.dependencyService.getMetricsAdapter();
    const timeInStage = metricsAdapter.calculateTimeInCurrentStage(task);

    if (task.status === 'paused') return '💤';
    if (task.status === 'active' && timeInStage > 7) return '⚡';
    if (task.priority === 'critical' && task.status !== 'done') return '🔥';
    if (timeInStage > 14 && task.status !== 'done') return 'stalled';

    return null;
  }

  /**
   * Gets task actor from assignments
   */
  private getTaskActor(task: TaskRecord, feedback: FeedbackRecord[]): string {
    const assignment = feedback.find(f =>
      f.entityId === task.id &&
      f.type === 'assignment' &&
      f.status === 'open'
    );

    if (assignment?.assignee) {
      if (assignment.assignee.startsWith('agent:')) {
        return `agent:${assignment.assignee.split(':')[1]?.slice(0, 8)}`;
      }
      return assignment.assignee.replace('human:', '');
    }

    return '—';
  }


  /**
   * [EARS-A5] [EARS-C5] Handles errors with user-friendly messages and graceful degradation
   * [EARS-D2] Shows technical details with --verbose flag
   */
  private handleError(error: unknown, options: DashboardCommandOptions): void {
    let message: string;
    let exitCode = 1;

    if (error instanceof Error) {
      if (error.message.includes('GitGovernance not initialized')) {
        message = "❌ GitGovernance not initialized. Run 'gitgov init' first.";
      } else if (error.message.includes('No active actors')) {
        message = "❌ No current actor configured. Run 'gitgov actor create' first.";
      } else if (error.message.includes('Terminal too small')) {
        message = "❌ Terminal too small for dashboard. Minimum 80x24 required.";
      } else {
        message = `❌ Dashboard launch failed: ${error.message}`;
      }
    } else {
      message = "❌ Unknown error occurred during dashboard launch.";
    }

    if (options.json) {
      console.log(JSON.stringify({
        success: false,
        error: message,
        exitCode,
        suggestion: "Try 'gitgov status' for text alternative or resize terminal"
      }, null, 2));
    } else {
      console.error(message);
      if (options.verbose && error instanceof Error) {
        console.error(`🔍 Technical details: ${error.stack}`);
      }
      console.error("💡 Suggestion: Try 'gitgov status' for text alternative");
    }

    process.exit(exitCode);
  }
}
