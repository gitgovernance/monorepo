import type { RecordStores } from '../record_store';
import type { TaskRecord, FeedbackRecord, ExecutionRecord, ActorRecord } from '../record_types';

/**
 * RecordMetrics Dependencies - Facade + Dependency Injection Pattern
 */
export type RecordMetricsDependencies = {
  // Data Layer (Read-Only)
  stores: Required<Pick<RecordStores, 'tasks' | 'cycles' | 'feedbacks' | 'executions' | 'actors'>>;
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
  timeInCurrentStage: number; // days
  stalenessIndex: number; // 0-10
  blockingFeedbacks: number;
  lastActivity: number; // timestamp
  recommendations: string[];
};

export type ProductivityMetrics = {
  throughput: number; // tasks/week
  leadTime: number; // average days
  cycleTime: number; // average days
  tasksCompleted7d: number; // count
  averageCompletionTime: number; // days
};

export type CollaborationMetrics = {
  activeAgents: number; // count
  totalAgents: number; // count
  agentUtilization: number; // percentage
  humanAgentRatio: number; // ratio
  collaborationIndex: number; // 0-100
};

/**
 * RecordMetrics Interface - The System Analyst
 */
export interface IRecordMetrics {
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
