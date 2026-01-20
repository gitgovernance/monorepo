import { DependencyInjectionService } from '../../services/dependency-injection';
import type { TaskRecord, FeedbackRecord, CycleRecord, ActorRecord, MetricsAdapter } from "@gitgov/core";

/**
 * Status Command Options interface
 */
export interface StatusCommandOptions {
  all?: boolean;
  health?: boolean;
  alerts?: boolean;
  cycles?: boolean;
  team?: boolean;
  fromSource?: boolean;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

/**
 * Personal Work Summary
 */
interface PersonalWorkSummary {
  assignedTasks: TaskRecord[];
  pendingFeedback: FeedbackRecord[];
  activeCycles: CycleRecord[];
  suggestedActions: string[];
}

/**
 * System Overview Summary
 */
interface SystemOverview {
  taskStats: {
    total: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
  };
  cycleStats: {
    total: number;
    byStatus: Record<string, number>;
  };
  healthScore: number;
  alerts: Array<{
    type: string;
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
}

/**
 * StatusCommand - CLI Dashboard
 * 
 * Implements intelligent dashboard CLI following the blueprint specification.
 * Orchestrates 5 adapters for complete system intelligence.
 */
export class StatusCommand {
  private dependencyService = DependencyInjectionService.getInstance();

  /**
   * [EARS-1] Main execution method with auto-indexation
   */
  async execute(options: StatusCommandOptions): Promise<void> {
    try {
      // 1. Auto-indexation strategy
      await this.ensureCacheUpToDate(options);

      // 2. Determine view type
      if (options.all) {
        await this.executeGlobalDashboard(options);
      } else {
        await this.executePersonalDashboard(options);
      }

    } catch (error) {
      this.handleError(error, options);
    }
  }

  /**
   * [EARS-5] Personal dashboard with actor-centric intelligence
   */
  private async executePersonalDashboard(options: StatusCommandOptions): Promise<void> {
    // 1. Get current actor
    const identityAdapter = await this.dependencyService.getIdentityAdapter();
    const currentActor = await identityAdapter.getCurrentActor();

    // 2. Get personal work summary
    const personalWork = await this.getPersonalWorkSummary(currentActor.id);

    // 3. Get system health overview
    const systemHealth = await this.getSystemHealthSummary();

    // 4. Output rendering
    if (options.json) {
      console.log(JSON.stringify({
        success: true,
        actor: {
          id: currentActor.id,
          displayName: currentActor.displayName
        },
        personalWork: {
          assignedTasks: personalWork.assignedTasks,
          pendingFeedback: personalWork.pendingFeedback,
          activeCycles: personalWork.activeCycles
        },
        systemHealth: {
          overallScore: systemHealth.healthScore,
          alerts: systemHealth.alerts
        },
        recommendations: personalWork.suggestedActions
      }, null, 2));
    } else {
      this.renderPersonalDashboard(currentActor, personalWork, systemHealth, options);
    }
  }

  /**
   * [EARS-9] Global dashboard with system overview
   */
  private async executeGlobalDashboard(options: StatusCommandOptions): Promise<void> {
    // 1. Get system overview
    const systemOverview = await this.getSystemOverview();

    // 2. Get additional metrics if requested
    let productivityMetrics = null;
    let collaborationMetrics = null;

    if (options.health || options.verbose) {
      const metricsAdapter = await this.dependencyService.getMetricsAdapter();
      productivityMetrics = await metricsAdapter.getProductivityMetrics();
    }

    if (options.team || options.verbose) {
      const metricsAdapter = await this.dependencyService.getMetricsAdapter();
      collaborationMetrics = await metricsAdapter.getCollaborationMetrics();
    }

    // 3. Output rendering
    if (options.json) {
      console.log(JSON.stringify({
        success: true,
        systemOverview: systemOverview,
        productivityMetrics: productivityMetrics,
        collaborationMetrics: collaborationMetrics
      }, null, 2));
    } else {
      this.renderGlobalDashboard(systemOverview, productivityMetrics, collaborationMetrics, options);
    }
  }

  /**
   * [EARS-1] Ensures cache is up to date with auto-indexation
   */
  private async ensureCacheUpToDate(options: StatusCommandOptions): Promise<void> {
    if (options.fromSource) {
      return; // Skip cache when using direct source
    }

    const indexerAdapter = await this.dependencyService.getIndexerAdapter();
    const isUpToDate = await indexerAdapter.isIndexUpToDate();

    if (!isUpToDate) {
      if (!options.quiet) {
        console.log("🔄 Updating cache for optimal dashboard performance...");
      }
      await indexerAdapter.generateIndex();
    }
  }

  /**
   * Gets personal work summary for actor
   */
  private async getPersonalWorkSummary(actorId: string): Promise<PersonalWorkSummary> {
    const backlogAdapter = await this.dependencyService.getBacklogAdapter();
    const feedbackAdapter = await this.dependencyService.getFeedbackAdapter();

    // Get assigned tasks (graceful degradation)
    let assignedTasks: TaskRecord[] = [];
    try {
      assignedTasks = await backlogAdapter.getTasksAssignedToActor(actorId);
    } catch (error) {
      console.warn('⚠️ Could not load assigned tasks:', error instanceof Error ? error.message : 'Unknown error');
    }

    // Get pending feedback for actor (graceful degradation)
    let pendingFeedback: FeedbackRecord[] = [];
    try {
      const allFeedback = await feedbackAdapter.getAllFeedback();
      pendingFeedback = allFeedback.filter(feedback =>
        feedback.status === 'open' &&
        feedback.assignee === actorId
      );
    } catch (error) {
      console.warn('⚠️ Could not load feedback:', error instanceof Error ? error.message : 'Unknown error');
    }

    // Get active cycles (graceful degradation)
    let activeCycles: CycleRecord[] = [];
    try {
      const allCycles = await backlogAdapter.getAllCycles();
      activeCycles = allCycles.filter(cycle =>
        cycle.status === 'active' &&
        cycle.taskIds?.some(taskId => assignedTasks.find(task => task.id === taskId))
      );
    } catch (error) {
      console.warn('⚠️ Could not load cycles:', error instanceof Error ? error.message : 'Unknown error');
    }

    // Generate suggested actions
    const suggestedActions = this.generateSuggestedActions(assignedTasks, pendingFeedback);

    return {
      assignedTasks,
      pendingFeedback,
      activeCycles,
      suggestedActions
    };
  }

  /**
   * Gets system health summary
   */
  private async getSystemHealthSummary(): Promise<{ healthScore: number; alerts: Array<{ type: string; message: string; severity: 'low' | 'medium' | 'high' | 'critical' }> }> {
    try {
      const metricsAdapter = await this.dependencyService.getMetricsAdapter();
      const systemStatus = await metricsAdapter.getSystemStatus();

      // Generate alerts based on system health
      const alerts = [];

      if (systemStatus.health.staleTasks > 0) {
        alerts.push({
          type: 'stalled_tasks',
          message: `${systemStatus.health.staleTasks} tasks stalled >7 days`,
          severity: 'high' as const
        });
      }

      if (systemStatus.health.blockedTasks > 0) {
        alerts.push({
          type: 'blocked_tasks',
          message: `${systemStatus.health.blockedTasks} tasks blocked by feedback`,
          severity: 'medium' as const
        });
      }

      return {
        healthScore: systemStatus.health.overallScore,
        alerts: alerts
      };
    } catch (error) {
      // Graceful degradation if MetricsAdapter fails
      return {
        healthScore: 0,
        alerts: [{
          type: 'metrics_unavailable',
          message: 'Metrics unavailable - run gitgov indexer',
          severity: 'low' as const
        }]
      };
    }
  }

  /**
   * Gets system overview for global dashboard
   */
  private async getSystemOverview(): Promise<SystemOverview> {
    const backlogAdapter = await this.dependencyService.getBacklogAdapter();

    // Get all tasks and cycles
    const allTasks = await backlogAdapter.getAllTasks();
    const allCycles = await backlogAdapter.getAllCycles();

    // Calculate task statistics
    const taskStats = {
      total: allTasks.length,
      byStatus: this.countByStatus(allTasks),
      byPriority: this.countByPriority(allTasks)
    };

    // Calculate cycle statistics
    const cycleStats = {
      total: allCycles.length,
      byStatus: this.countByStatus(allCycles)
    };

    // Get health score
    const healthSummary = await this.getSystemHealthSummary();

    return {
      taskStats,
      cycleStats,
      healthScore: healthSummary.healthScore,
      alerts: healthSummary.alerts
    };
  }

  /**
   * Generates suggested actions based on work state
   */
  private generateSuggestedActions(assignedTasks: TaskRecord[], pendingFeedback: FeedbackRecord[]): string[] {
    const suggestions: string[] = [];

    // Blocking feedback suggestions
    const blockingFeedback = pendingFeedback.filter(f => f.type === 'blocking');
    if (blockingFeedback.length > 0) {
      suggestions.push(`Review ${blockingFeedback.length} blocking feedback(s) requiring your attention`);
    }

    // Ready tasks suggestions
    const readyTasks = assignedTasks.filter(task => task.status === 'ready');
    if (readyTasks.length > 0) {
      suggestions.push(`${readyTasks.length} task(s) ready for execution`);
    }

    // Stalled tasks (simplified detection)
    const activeTasks = assignedTasks.filter(task => task.status === 'active');
    if (activeTasks.length > 0) {
      suggestions.push(`Monitor ${activeTasks.length} active task(s) for progress`);
    }

    return suggestions;
  }

  /**
   * Renders personal dashboard view
   */
  private renderPersonalDashboard(
    actor: ActorRecord,
    personalWork: PersonalWorkSummary,
    systemHealth: { healthScore: number; alerts: Array<{ type: string; message: string; severity: string }> },
    options: StatusCommandOptions
  ): void {
    console.log(`👤 Actor: ${actor.displayName} (${actor.id})`);
    console.log('');

    // My Work section
    console.log(`✅ My Work (${personalWork.assignedTasks.length} tasks)`);
    if (personalWork.assignedTasks.length > 0) {
      personalWork.assignedTasks.forEach(task => {
        const statusIcon = this.getStatusIcon(task.status);
        const priorityFlag = task.priority === 'critical' ? '🔴' : task.priority === 'high' ? '🟠' : '';
        console.log(`  ${statusIcon} [${task.status}] ${task.id} - ${task.title} ${priorityFlag}`);
        if (options.verbose) {
          console.log(`    Priority: ${task.priority}, Tags: ${task.tags?.join(', ') || 'none'}`);
        }
      });
    } else {
      console.log('  No tasks assigned');
    }
    console.log('');

    // Pending Feedback section
    if (personalWork.pendingFeedback.length > 0) {
      console.log(`❗️ Pending Feedback (${personalWork.pendingFeedback.length})`);
      personalWork.pendingFeedback.forEach(feedback => {
        const typeIcon = feedback.type === 'blocking' ? '🔴' : feedback.type === 'question' ? '🟡' : '🔵';
        console.log(`  ${typeIcon} [${feedback.type}] ${feedback.id} - ${feedback.content}`);
      });
      console.log('');
    }

    // Active Cycles section
    if (personalWork.activeCycles.length > 0 && (options.cycles || options.verbose)) {
      console.log(`🚀 Active Cycles (${personalWork.activeCycles.length})`);
      personalWork.activeCycles.forEach(cycle => {
        const taskCount = cycle.taskIds?.length || 0;
        console.log(`  📊 ${cycle.title}: ${taskCount} tasks - Status: ${cycle.status}`);
      });
      console.log('');
    }

    // System Health section
    const healthIcon = systemHealth.healthScore >= 80 ? '🟢' : systemHealth.healthScore >= 60 ? '🟡' : '🔴';
    console.log(`⚡ System Health: ${healthIcon} ${systemHealth.healthScore}%`);

    if (systemHealth.alerts.length > 0) {
      console.log('🚨 Alerts:');
      systemHealth.alerts.forEach(alert => {
        const alertIcon = alert.severity === 'critical' ? '🔴' : alert.severity === 'high' ? '🟠' : '🔵';
        console.log(`  ${alertIcon} ${alert.message}`);
      });
    }
    console.log('');

    // Suggested Actions
    if (personalWork.suggestedActions.length > 0) {
      console.log('💡 Suggested Actions:');
      personalWork.suggestedActions.forEach(action => {
        console.log(`  • ${action}`);
      });
    }
  }

  /**
   * Renders global dashboard view
   */
  private renderGlobalDashboard(
    overview: SystemOverview,
    productivityMetrics: MetricsAdapter.ProductivityMetrics | null,
    collaborationMetrics: MetricsAdapter.CollaborationMetrics | null,
    options: StatusCommandOptions
  ): void {
    console.log('📊 GitGovernance Project Status');
    console.log('');

    // Tasks Overview
    console.log('📋 Tasks Overview');
    console.log(`  Total: ${overview.taskStats.total} tasks`);
    const statusCounts = Object.entries(overview.taskStats.byStatus)
      .map(([status, count]) => `${this.getStatusIcon(status)} ${status}: ${count}`)
      .join('    ');
    console.log(`  ${statusCounts}`);
    console.log('');

    // Cycles Overview
    console.log('🔄 Cycles Overview');
    console.log(`  Total: ${overview.cycleStats.total} cycles`);
    const cycleStatusCounts = Object.entries(overview.cycleStats.byStatus)
      .map(([status, count]) => `${this.getStatusIcon(status)} ${status}: ${count}`)
      .join('    ');
    console.log(`  ${cycleStatusCounts}`);
    console.log('');

    // System Health
    const healthIcon = overview.healthScore >= 80 ? '🟢' : overview.healthScore >= 60 ? '🟡' : '🔴';
    console.log(`⚡ System Health: ${healthIcon} ${overview.healthScore}%`);

    // Productivity Metrics
    if (productivityMetrics && (options.health || options.verbose)) {
      console.log('📈 Productivity Metrics:');
      console.log(`  • Throughput: ${productivityMetrics.throughput} tasks/week`);
      console.log(`  • Lead Time: ${productivityMetrics.leadTime.toFixed(1)} days`);
      console.log(`  • Cycle Time: ${productivityMetrics.cycleTime.toFixed(1)} days`);
    }

    // Collaboration Metrics
    if (collaborationMetrics && (options.team || options.verbose)) {
      console.log('🤖 Collaboration Metrics:');
      console.log(`  • Active Agents: ${collaborationMetrics.activeAgents}/${collaborationMetrics.totalAgents}`);
      console.log(`  • Agent Utilization: ${collaborationMetrics.agentUtilization.toFixed(1)}%`);
      console.log(`  • Collaboration Index: ${collaborationMetrics.collaborationIndex.toFixed(0)}%`);
    }

    // Alerts & Warnings
    if (overview.alerts.length > 0) {
      console.log('');
      console.log('🚨 Alerts & Warnings');
      overview.alerts.forEach(alert => {
        const alertIcon = alert.severity === 'critical' ? '🔴' : alert.severity === 'high' ? '🟠' : '🔵';
        console.log(`  ${alertIcon} ${alert.message}`);
      });
    }
  }

  // ===== HELPER METHODS =====

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
      'archived': '📦',
      'planning': '📝',
      'completed': '✅'
    };
    return icons[status] || '❓';
  }

  /**
   * Counts records by status
   */
  private countByStatus(records: Array<{ status: string }>): Record<string, number> {
    const counts: Record<string, number> = {};
    records.forEach(record => {
      counts[record.status] = (counts[record.status] || 0) + 1;
    });
    return counts;
  }

  /**
   * Counts tasks by priority
   */
  private countByPriority(tasks: TaskRecord[]): Record<string, number> {
    const counts: Record<string, number> = {};
    tasks.forEach(task => {
      counts[task.priority] = (counts[task.priority] || 0) + 1;
    });
    return counts;
  }


  /**
   * Handles errors with user-friendly messages
   */
  private handleError(error: unknown, options: StatusCommandOptions): void {
    let message: string;
    let exitCode = 1;

    if (error instanceof Error) {
      if (error.message.includes('RecordNotFoundError')) {
        message = error.message;
      } else if (error.message.includes('not initialized')) {
        message = "❌ GitGovernance not initialized. Run 'gitgov init' first.";
      } else if (error.message.includes('No active actors')) {
        message = "❌ No current actor configured. Run 'gitgov actor create' first.";
      } else {
        message = `❌ Dashboard generation failed: ${error.message}`;
      }
    } else {
      message = "❌ Unknown error occurred during dashboard generation.";
    }

    if (options.json) {
      console.log(JSON.stringify({
        success: false,
        error: message,
        exitCode
      }, null, 2));
    } else {
      console.error(message);
      if (options.verbose && error instanceof Error) {
        console.error(`🔍 Technical details: ${error.stack}`);
      }
    }

    process.exit(exitCode);
  }
}
