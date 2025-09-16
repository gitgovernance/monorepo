import { RecordStore } from '../../store';
import type { TaskRecord } from '../../types/task_record';
import type { CycleRecord } from '../../types/cycle_record';
import type { FeedbackRecord } from '../../types/feedback_record';
import type { ExecutionRecord } from '../../types/execution_record';
import type { ChangelogRecord } from '../../types/changelog_record';
import type { ActorRecord } from '../../types/actor_record';

/**
 * MetricsAdapter Dependencies - Facade + Dependency Injection Pattern
 */
export type MetricsAdapterDependencies = {
  // Data Layer (Read-Only) - MVP Critical
  taskStore: RecordStore<TaskRecord>;
  cycleStore: RecordStore<CycleRecord>;

  // Optional: Additional stores for enhanced metrics (graceful degradation)
  feedbackStore?: RecordStore<FeedbackRecord>;
  executionStore?: RecordStore<ExecutionRecord>;
  changelogStore?: RecordStore<ChangelogRecord>;
  actorStore?: RecordStore<ActorRecord>;

  // Optional: Platform API for Premium metrics (Tier 4)
  platformApi?: IPlatformApi;
}

// Platform API interface (Tier 4 - Future)
interface IPlatformApi {
  getTokenConsumption(timeframe: string): Promise<TokenConsumption[]>;
}

type TokenConsumption = {
  agentId: string;
  tokens: number;
  cost: number;
  timestamp: number;
}

// Return types specific to the adapter
export type SystemStatus = {
  tasks: {
    total: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
  };
  cycles: {
    total: number;
    active: number;
    completed: number;
  };
  health: {
    overallScore: number; // 0-100
    blockedTasks: number;
    staleTasks: number;
  };
};

export type TaskHealthReport = {
  taskId: string;
  healthScore: number; // 0-100
  timeInCurrentStage: number; // días
  stalenessIndex: number; // 0-10
  blockingFeedbacks: number;
  lastActivity: number; // timestamp
  recommendations: string[];
};

export type ProductivityMetrics = {
  throughput: number; // tareas/semana
  leadTime: number; // días promedio
  cycleTime: number; // días promedio
  tasksCompleted7d: number; // count
  averageCompletionTime: number; // días
};

export type CollaborationMetrics = {
  activeAgents: number; // count
  totalAgents: number; // count
  agentUtilization: number; // percentage
  humanAgentRatio: number; // ratio
  collaborationIndex: number; // 0-100
};

/**
 * MetricsAdapter Interface - The System Analyst
 */
export interface IMetricsAdapter {
  // Public API methods
  getSystemStatus(): Promise<SystemStatus>;
  getTaskHealth(taskId: string): Promise<TaskHealthReport>;
  getProductivityMetrics(): Promise<ProductivityMetrics>;
  getCollaborationMetrics(): Promise<CollaborationMetrics>;

  // Pure calculation functions - Tier 1 (MVP Critical)
  calculateTimeInCurrentStage(task: TaskRecord): number;
  calculateStalenessIndex(tasks: TaskRecord[]): number;
  calculateBlockingFeedbackAge(feedback: FeedbackRecord[]): number;
  calculateHealth(tasks: TaskRecord[]): number;
  calculateBacklogDistribution(tasks: TaskRecord[]): Record<string, number>;
  calculateTasksCreatedToday(tasks: TaskRecord[]): number;

  // Pure calculation functions - Tier 2 (Important)
  calculateThroughput(tasks: TaskRecord[]): number;
  calculateLeadTime(tasks: TaskRecord[]): number;
  calculateCycleTime(tasks: TaskRecord[]): number;
  calculateActiveAgents(actors: ActorRecord[], executions: ExecutionRecord[]): number;
}

/**
 * MetricsAdapter - The System Analyst
 * 
 * Implements Facade + Dependency Injection Pattern for testeable and configurable orchestration.
 * Acts as Mediator between analytics system and multi-store data sources.
 */
export class MetricsAdapter implements IMetricsAdapter {
  private taskStore: RecordStore<TaskRecord>;
  private cycleStore: RecordStore<CycleRecord>;
  private feedbackStore: RecordStore<FeedbackRecord> | undefined;
  private executionStore: RecordStore<ExecutionRecord> | undefined;
  private changelogStore: RecordStore<ChangelogRecord> | undefined;
  private actorStore: RecordStore<ActorRecord> | undefined;
  private platformApi: IPlatformApi | undefined;

  constructor(dependencies: MetricsAdapterDependencies) {
    this.taskStore = dependencies.taskStore;
    this.cycleStore = dependencies.cycleStore;
    this.feedbackStore = dependencies.feedbackStore; // Graceful degradation
    this.executionStore = dependencies.executionStore; // Graceful degradation
    this.changelogStore = dependencies.changelogStore; // Graceful degradation
    this.actorStore = dependencies.actorStore; // Graceful degradation
    this.platformApi = dependencies.platformApi; // Graceful degradation
  }

  // ===== PUBLIC API METHODS =====

  /**
   * [EARS-1] Gets aggregated system status using Tier 1 metrics.
   */
  async getSystemStatus(): Promise<SystemStatus> {
    // Read all tasks and cycles
    const taskIds = await this.taskStore.list();
    const tasks: TaskRecord[] = [];
    for (const id of taskIds) {
      const record = await this.taskStore.read(id);
      if (record) tasks.push(record.payload);
    }

    const cycleIds = await this.cycleStore.list();
    const cycles: CycleRecord[] = [];
    for (const id of cycleIds) {
      const record = await this.cycleStore.read(id);
      if (record) cycles.push(record.payload);
    }

    // Calculate Tier 1 metrics
    const health = this.calculateHealth(tasks);
    const backlogDistribution = this.calculateBacklogDistribution(tasks);
    const tasksCreatedToday = this.calculateTasksCreatedToday(tasks);

    // Count blocked and stale tasks
    const blockedTasks = tasks.filter(task => task.status === 'paused').length;
    const staleTasks = tasks.filter(task => {
      const staleness = this.calculateTimeInCurrentStage(task);
      return staleness > 7; // More than 7 days in current stage
    }).length;

    return {
      tasks: {
        total: tasks.length,
        byStatus: this.countTasksByStatus(tasks),
        byPriority: this.countTasksByPriority(tasks)
      },
      cycles: {
        total: cycles.length,
        active: cycles.filter(c => c.status === 'active').length,
        completed: cycles.filter(c => c.status === 'completed').length
      },
      health: {
        overallScore: health,
        blockedTasks,
        staleTasks
      }
    };
  }

  /**
   * [EARS-2] Gets task health analysis using Tier 1 metrics.
   */
  async getTaskHealth(taskId: string): Promise<TaskHealthReport> {
    // EARS-3: Validate task exists
    const taskRecord = await this.taskStore.read(taskId);
    if (!taskRecord) {
      throw new Error(`RecordNotFoundError: Task not found: ${taskId}`);
    }

    const task = taskRecord.payload;

    // Read related data for analysis
    let feedbacks: FeedbackRecord[] = [];
    let executions: ExecutionRecord[] = [];

    if (this.feedbackStore) {
      const feedbackIds = await this.feedbackStore.list();
      for (const id of feedbackIds) {
        const record = await this.feedbackStore.read(id);
        if (record && record.payload.entityId === taskId) {
          feedbacks.push(record.payload);
        }
      }
    }

    if (this.executionStore) {
      const executionIds = await this.executionStore.list();
      for (const id of executionIds) {
        const record = await this.executionStore.read(id);
        if (record && record.payload.taskId === taskId) {
          executions.push(record.payload);
        }
      }
    }

    // Calculate Tier 1 metrics
    const timeInCurrentStage = this.calculateTimeInCurrentStage(task);
    const stalenessIndex = this.calculateStalenessIndex([task]);
    const blockingFeedbacks = feedbacks.filter(f => f.type === 'blocking' && f.status === 'open').length;
    const lastActivity = executions.length > 0 ? Math.max(...executions.map(e => this.getTimestampFromId(e.id))) : this.getTimestampFromId(task.id);

    // Generate recommendations
    const recommendations: string[] = [];
    if (timeInCurrentStage > 7) recommendations.push('Task has been stagnant for over 7 days');
    if (blockingFeedbacks > 0) recommendations.push(`${blockingFeedbacks} blocking feedback(s) need attention`);
    if (stalenessIndex > 5) recommendations.push('No recent execution activity detected');

    // Calculate health score (0-100)
    let healthScore = 100;
    if (timeInCurrentStage > 7) healthScore -= 30;
    if (blockingFeedbacks > 0) healthScore -= 40;
    if (stalenessIndex > 5) healthScore -= 20;
    healthScore = Math.max(0, healthScore);

    return {
      taskId,
      healthScore,
      timeInCurrentStage,
      stalenessIndex,
      blockingFeedbacks,
      lastActivity,
      recommendations
    };
  }

  /**
   * [EARS-21] Gets productivity metrics using Tier 2 calculations.
   */
  async getProductivityMetrics(): Promise<ProductivityMetrics> {
    // Read all tasks
    const taskIds = await this.taskStore.list();
    const tasks: TaskRecord[] = [];
    for (const id of taskIds) {
      const record = await this.taskStore.read(id);
      if (record) tasks.push(record.payload);
    }

    // Calculate Tier 2 metrics
    const throughput = this.calculateThroughput(tasks);
    const leadTime = this.calculateLeadTime(tasks);
    const cycleTime = this.calculateCycleTime(tasks);
    const tasksCompleted7d = tasks.filter(task => {
      if (task.status !== 'done') return false;
      const completedTime = this.getTimestampFromId(task.id);
      const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
      return completedTime >= sevenDaysAgo;
    }).length;

    return {
      throughput,
      leadTime,
      cycleTime,
      tasksCompleted7d,
      averageCompletionTime: leadTime // Alias for leadTime
    };
  }

  /**
   * [EARS-22] Gets collaboration metrics with agent activity analysis.
   */
  async getCollaborationMetrics(): Promise<CollaborationMetrics> {
    // EARS-24: Graceful degradation if stores not available
    if (!this.actorStore || !this.executionStore) {
      return {
        activeAgents: 0,
        totalAgents: 0,
        agentUtilization: 0,
        humanAgentRatio: 0,
        collaborationIndex: 0
      };
    }

    // Read actors and executions
    const actorIds = await this.actorStore.list();
    const actors: ActorRecord[] = [];
    for (const id of actorIds) {
      const record = await this.actorStore.read(id);
      if (record) actors.push(record.payload);
    }

    const executionIds = await this.executionStore.list();
    const executions: ExecutionRecord[] = [];
    for (const id of executionIds) {
      const record = await this.executionStore.read(id);
      if (record) executions.push(record.payload);
    }

    // Calculate Tier 2 metrics
    const activeAgents = this.calculateActiveAgents(actors, executions);
    const totalAgents = actors.filter(actor => actor.type === 'agent').length;
    const totalHumans = actors.filter(actor => actor.type === 'human').length;
    const agentUtilization = totalAgents > 0 ? (activeAgents / totalAgents) * 100 : 0;
    const humanAgentRatio = totalHumans > 0 ? totalAgents / totalHumans : 0;
    const collaborationIndex = Math.min(100, (activeAgents * 10) + (agentUtilization / 2));

    return {
      activeAgents,
      totalAgents,
      agentUtilization,
      humanAgentRatio,
      collaborationIndex
    };
  }

  // ===== TIER 1: PURE CALCULATION FUNCTIONS (MVP CRITICAL) =====

  /**
   * [EARS-5] Calculates exact days since last state change.
   */
  calculateTimeInCurrentStage(task: TaskRecord): number {
    try {
      // EARS-25: Use creation timestamp as fallback if no signatures
      const currentTime = Math.floor(Date.now() / 1000);
      const taskCreationTime = this.getTimestampFromId(task.id);

      // TODO: In a complete implementation, we would look at signatures to find last state change
      // For MVP, we use creation time as approximation
      const lastStateChange = taskCreationTime;

      const diffSeconds = currentTime - lastStateChange;
      const diffDays = diffSeconds / (24 * 60 * 60);

      return Math.max(0, diffDays);
    } catch (error) {
      // EARS-28: Validate timestamps
      throw new Error(`InvalidDataError: Invalid timestamp data for task ${task.id}`);
    }
  }

  /**
   * [EARS-6] Calculates days since last ExecutionRecord.
   */
  calculateStalenessIndex(tasks: TaskRecord[]): number {
    // EARS-13: Graceful degradation without executionStore
    if (!this.executionStore) {
      return 0;
    }

    // EARS-11: Validate input
    if (!Array.isArray(tasks)) {
      throw new Error('InvalidDataError: tasks must be an array');
    }

    // EARS-12: Handle empty datasets
    if (tasks.length === 0) {
      return 0;
    }

    try {
      // For MVP, calculate based on task creation time
      // In complete implementation, would check actual ExecutionRecords
      const currentTime = Math.floor(Date.now() / 1000);
      const staleDays = tasks.map(task => {
        const taskTime = this.getTimestampFromId(task.id);
        return (currentTime - taskTime) / (24 * 60 * 60);
      });

      return Math.max(0, Math.max(...staleDays));
    } catch (error) {
      throw new Error('InvalidDataError: Invalid data in staleness calculation');
    }
  }

  /**
   * [EARS-7] Calculates days of oldest active blocking feedback.
   */
  calculateBlockingFeedbackAge(feedback: FeedbackRecord[]): number {
    // EARS-14: Graceful degradation without feedbackStore
    if (!this.feedbackStore) {
      return 0;
    }

    // EARS-11: Validate input
    if (!Array.isArray(feedback)) {
      throw new Error('InvalidDataError: feedback must be an array');
    }

    // Filter blocking and open feedbacks
    const blockingFeedbacks = feedback.filter(f => f.type === 'blocking' && f.status === 'open');

    // EARS-12: Handle empty datasets
    if (blockingFeedbacks.length === 0) {
      return 0;
    }

    try {
      const currentTime = Math.floor(Date.now() / 1000);
      const ages = blockingFeedbacks.map(f => {
        const feedbackTime = this.getTimestampFromId(f.id);
        return (currentTime - feedbackTime) / (24 * 60 * 60);
      });

      return Math.max(...ages);
    } catch (error) {
      throw new Error('InvalidDataError: Invalid timestamp in blocking feedback calculation');
    }
  }

  /**
   * [EARS-8] Calculates health percentage using improved protocol formula.
   */
  calculateHealth(tasks: TaskRecord[]): number {
    // EARS-11: Validate input
    if (!Array.isArray(tasks)) {
      throw new Error('InvalidDataError: tasks must be an array');
    }

    // EARS-12: Handle empty datasets
    if (tasks.length === 0) {
      return 0;
    }

    try {
      // Count tasks by status
      const activeTasks = tasks.filter(task => task.status === 'active').length;
      const doneTasks = tasks.filter(task => task.status === 'done').length;
      const readyTasks = tasks.filter(task => task.status === 'ready').length;
      const reviewTasks = tasks.filter(task => task.status === 'review').length;
      const pausedTasks = tasks.filter(task => task.status === 'paused').length;
      const draftTasks = tasks.filter(task => task.status === 'draft').length;

      // Calculate health based on workflow progress and blockers
      // Healthy tasks: done (100%), active (80%), ready (60%), review (40%)
      // Neutral tasks: draft (20%)
      // Problematic tasks: paused (0%)
      const healthyScore = (doneTasks * 100) + (activeTasks * 80) + (readyTasks * 60) + (reviewTasks * 40) + (draftTasks * 20) + (pausedTasks * 0);
      
      const maxPossibleScore = tasks.length * 100;

      if (maxPossibleScore === 0) {
        return 0;
      }

      return Math.round((healthyScore / maxPossibleScore) * 100);
    } catch (error) {
      throw new Error('InvalidDataError: Invalid data in health calculation');
    }
  }

  /**
   * [EARS-9] Returns status distribution with percentages.
   */
  calculateBacklogDistribution(tasks: TaskRecord[]): Record<string, number> {
    // EARS-11: Validate input
    if (!Array.isArray(tasks)) {
      throw new Error('InvalidDataError: tasks must be an array');
    }

    // EARS-12: Handle empty datasets
    if (tasks.length === 0) {
      return {};
    }

    const validStatuses = ['draft', 'review', 'ready', 'active', 'done', 'archived', 'paused'];
    const distribution: Record<string, number> = {};

    // EARS-29: Ignore tasks with invalid status
    const validTasks = tasks.filter(task => validStatuses.includes(task.status));

    // EARS-30: Handle division by zero
    if (validTasks.length === 0) {
      return {};
    }

    for (const status of validStatuses) {
      const count = validTasks.filter(task => task.status === status).length;
      distribution[status] = (count / validTasks.length) * 100;
    }

    return distribution;
  }

  /**
   * [EARS-10] Counts tasks created in last 24 hours.
   */
  calculateTasksCreatedToday(tasks: TaskRecord[]): number {
    // EARS-11: Validate input
    if (!Array.isArray(tasks)) {
      throw new Error('InvalidDataError: tasks must be an array');
    }

    try {
      const currentTime = Math.floor(Date.now() / 1000);
      const twentyFourHoursAgo = currentTime - (24 * 60 * 60);

      return tasks.filter(task => {
        const creationTime = this.getTimestampFromId(task.id);
        return creationTime >= twentyFourHoursAgo;
      }).length;
    } catch (error) {
      throw new Error('InvalidDataError: Invalid timestamp in tasks created today calculation');
    }
  }

  // ===== TIER 2: PURE CALCULATION FUNCTIONS (IMPORTANT) =====

  /**
   * [EARS-17] Counts tasks moved to 'done' in last 7 days.
   */
  calculateThroughput(tasks: TaskRecord[]): number {
    // EARS-11: Validate input
    if (!Array.isArray(tasks)) {
      throw new Error('InvalidDataError: tasks must be an array');
    }

    try {
      const currentTime = Math.floor(Date.now() / 1000);
      const sevenDaysAgo = currentTime - (7 * 24 * 60 * 60);

      return tasks.filter(task => {
        if (task.status !== 'done') return false;
        // For MVP, use creation time as approximation of completion time
        const completionTime = this.getTimestampFromId(task.id);
        return completionTime >= sevenDaysAgo;
      }).length;
    } catch (error) {
      throw new Error('InvalidDataError: Invalid data in throughput calculation');
    }
  }

  /**
   * [EARS-18] Calculates average done-draft time for lead time.
   */
  calculateLeadTime(tasks: TaskRecord[]): number {
    // EARS-11: Validate input
    if (!Array.isArray(tasks)) {
      throw new Error('InvalidDataError: tasks must be an array');
    }

    // EARS-26: Filter only completed tasks
    const completedTasks = tasks.filter(task => task.status === 'done');

    // EARS-30: Handle division by zero
    if (completedTasks.length === 0) {
      return 0;
    }

    try {
      // For MVP, calculate based on creation time
      // In complete implementation, would use actual state change timestamps
      const currentTime = Math.floor(Date.now() / 1000);
      const leadTimes = completedTasks.map(task => {
        const creationTime = this.getTimestampFromId(task.id);
        return (currentTime - creationTime) / (24 * 60 * 60); // Convert to days
      });

      return leadTimes.reduce((sum, time) => sum + time, 0) / leadTimes.length;
    } catch (error) {
      throw new Error('InvalidDataError: Invalid timestamp in lead time calculation');
    }
  }

  /**
   * [EARS-19] Calculates average done-active time for cycle time.
   */
  calculateCycleTime(tasks: TaskRecord[]): number {
    // EARS-11: Validate input
    if (!Array.isArray(tasks)) {
      throw new Error('InvalidDataError: tasks must be an array');
    }

    // Filter completed tasks that were active
    const activeTasks = tasks.filter(task => task.status === 'done');

    // EARS-27: Return 0 for tasks that were never active
    if (activeTasks.length === 0) {
      return 0;
    }

    try {
      // For MVP, use approximation based on creation time
      // In complete implementation, would track actual active → done transitions
      const cycleTimes = activeTasks.map(task => {
        // Approximate cycle time as 30% of total time (active phase)
        const creationTime = this.getTimestampFromId(task.id);
        const currentTime = Math.floor(Date.now() / 1000);
        const totalTime = (currentTime - creationTime) / (24 * 60 * 60);
        return totalTime * 0.3; // Approximate active time
      });

      return cycleTimes.reduce((sum, time) => sum + time, 0) / cycleTimes.length;
    } catch (error) {
      throw new Error('InvalidDataError: Invalid data in cycle time calculation');
    }
  }

  /**
   * [EARS-20] Counts unique agents with executions in 24h.
   */
  calculateActiveAgents(actors: ActorRecord[], executions: ExecutionRecord[]): number {
    // EARS-11: Validate input
    if (!Array.isArray(actors) || !Array.isArray(executions)) {
      throw new Error('InvalidDataError: actors and executions must be arrays');
    }

    try {
      const currentTime = Math.floor(Date.now() / 1000);
      const twentyFourHoursAgo = currentTime - (24 * 60 * 60);

      // Get recent executions
      const recentExecutions = executions.filter(execution => {
        const executionTime = this.getTimestampFromId(execution.id);
        return executionTime >= twentyFourHoursAgo;
      });

      // Get unique agent IDs from recent executions
      const activeAgentIds = new Set<string>();

      for (const execution of recentExecutions) {
        // Cross-reference executions with agent actors to find active agents
        const agentActors = actors.filter(actor => actor.type === 'agent');
        for (const agent of agentActors) {
          // In a complete implementation, we would track execution authorship
          // For now, if there are recent executions and agent actors, count them as active
          if (recentExecutions.length > 0) {
            activeAgentIds.add(agent.id);
          }
        }
      }

      return activeAgentIds.size;
    } catch (error) {
      throw new Error('InvalidDataError: Invalid data in active agents calculation');
    }
  }

  // ===== HELPER METHODS =====

  /**
   * Extracts timestamp from ID (format: {timestamp}-{type}-{slug})
   */
  private getTimestampFromId(id: string): number {
    try {
      const parts = id.split('-');
      const timestamp = parseInt(parts[0] || '0', 10);

      // EARS-28: Validate timestamps
      if (isNaN(timestamp) || timestamp <= 0) {
        throw new Error(`Invalid timestamp in ID: ${id}`);
      }

      return timestamp;
    } catch (error) {
      throw new Error(`InvalidDataError: Cannot extract timestamp from ID: ${id}`);
    }
  }

  /**
   * Counts tasks by status
   */
  private countTasksByStatus(tasks: TaskRecord[]): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const task of tasks) {
      const status = task.status;
      counts[status] = (counts[status] || 0) + 1;
    }

    return counts;
  }

  /**
   * Counts tasks by priority
   */
  private countTasksByPriority(tasks: TaskRecord[]): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const task of tasks) {
      const priority = task.priority;
      counts[priority] = (counts[priority] || 0) + 1;
    }

    return counts;
  }

  // ===== TIER 3-4: NOT IMPLEMENTED (FUTURE) =====

  /**
   * [EARS-15] Throws NotImplementedError for Tier 3 functions.
   */
  calculateQuality(tasks: TaskRecord[]): number {
    throw new Error('NotImplementedError: Tier 3 metrics not implemented yet');
  }

  calculateReworkRate(tasks: TaskRecord[]): number {
    throw new Error('NotImplementedError: Tier 3 metrics not implemented yet');
  }

  calculateCompletionRate(tasks: TaskRecord[]): number {
    throw new Error('NotImplementedError: Tier 3 metrics not implemented yet');
  }

  calculateAuditScoreDistribution(tasks: TaskRecord[]): Record<string, number> {
    throw new Error('NotImplementedError: Tier 3 metrics not implemented yet');
  }

  calculateEpicPromotionRate(tasks: TaskRecord[]): number {
    throw new Error('NotImplementedError: Tier 3 metrics not implemented yet');
  }

  calculateTaskRefinementRate(tasks: TaskRecord[]): number {
    throw new Error('NotImplementedError: Tier 3 metrics not implemented yet');
  }

  calculatePlanningAccuracy(tasks: TaskRecord[]): number {
    throw new Error('NotImplementedError: Tier 3 metrics not implemented yet');
  }

  calculateDependencyDiscoveryRate(tasks: TaskRecord[]): number {
    throw new Error('NotImplementedError: Tier 3 metrics not implemented yet');
  }

  /**
   * [EARS-16] Returns null for Premium metrics without Platform API.
   */
  calculateCostBurnRate(consumption: TokenConsumption[]): number {
    if (!this.platformApi) {
      console.warn('Platform API not available for premium metrics');
      return 0;
    }
    throw new Error('NotImplementedError: Tier 4 premium metrics not implemented yet');
  }

  calculateTokenConsumption(consumption: TokenConsumption[]): number {
    if (!this.platformApi) {
      console.warn('Platform API not available for premium metrics');
      return 0;
    }
    throw new Error('NotImplementedError: Tier 4 premium metrics not implemented yet');
  }

  calculateTokenConsumptionByAgent(consumption: TokenConsumption[]): Record<string, number> {
    if (!this.platformApi) {
      console.warn('Platform API not available for premium metrics');
      return {};
    }
    throw new Error('NotImplementedError: Tier 4 premium metrics not implemented yet');
  }

  calculateAiAccuracyRate(tasks: TaskRecord[], feedback: FeedbackRecord[]): number {
    if (!this.platformApi) {
      console.warn('Platform API not available for premium metrics');
      return 0;
    }
    throw new Error('NotImplementedError: Tier 4 premium metrics not implemented yet');
  }

  calculateAgentExecutionTime(executions: ExecutionRecord[]): number {
    if (!this.platformApi) {
      console.warn('Platform API not available for premium metrics');
      return 0;
    }
    throw new Error('NotImplementedError: Tier 4 premium metrics not implemented yet');
  }
}
