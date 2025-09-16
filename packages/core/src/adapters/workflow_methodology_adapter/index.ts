import * as fs from 'fs/promises';
import * as path from 'path';
import type { WorkflowMethodologyRecord } from '../../types/workflow_methodology_record';
import type { TaskRecord } from '../../types/task_record';
import type { ActorRecord } from '../../types/actor_record';
import type { FeedbackRecord } from '../../types/feedback_record';
import type { CycleRecord } from '../../types/cycle_record';
import type { Signature } from '../../models/embedded.types';
import { ConfigManager } from '../../config_manager';
import { RecordStore } from '../../store';

type TaskStatus = TaskRecord['status'];

export type ValidationContext = {
  task: TaskRecord;
  actor?: ActorRecord;
  signatures?: Signature[];
  // Related records for complex rule validation
  feedbacks?: FeedbackRecord[];
  cycles?: CycleRecord[];
  // The target state for a transition, required for signature validation
  transitionTo?: TaskStatus;
}

type TransitionRule = {
  to: TaskStatus;
  conditions: NonNullable<WorkflowMethodologyRecord['state_transitions']>[string]['requires'];
}

type ViewConfig = NonNullable<WorkflowMethodologyRecord['view_configs']>[string];


/**
 * WorkflowMethodologyAdapter Dependencies - Facade + Dependency Injection Pattern
 * EXACTAMENTE como especifica el blueprint sección 6
 */
export interface WorkflowMethodologyAdapterDependencies {
  // Configuration Layer
  configPath?: string; // ✅ DISPONIBLE: Path to methodology JSON file

  // Infrastructure Layer  
  // No eventBus needed - methodology doesn't emit events

  // Optional: Cross-adapter dependencies (graceful degradation)
  feedbackStore?: RecordStore<FeedbackRecord>; // Para assignment_required validation
  cycleStore?: RecordStore<CycleRecord>; // Para sprint_capacity validation
}

export interface IWorkflowMethodology {
  getTransitionRule(from: TaskStatus, to: TaskStatus, context: ValidationContext): Promise<TransitionRule | null>;
  validateSignature(signature: Signature, context: ValidationContext): Promise<boolean>;
  validateCustomRules(rules: string[], context: ValidationContext): Promise<boolean>;
  getViewConfig(viewName: string): Promise<ViewConfig | null>;
  reloadConfig(): Promise<void>;
  loadMethodologyConfig(filePath: string): Promise<WorkflowMethodologyRecord>;
  validateMethodologyConfig(config: WorkflowMethodologyRecord): { isValid: boolean; errors?: string[] };
  getAvailableTransitions(from: TaskStatus): Promise<TransitionRule[]>;
}

/**
 * WorkflowMethodologyAdapter - The Configurable Rules Engine
 * 
 * Implements Facade + Dependency Injection Pattern for testeable and configurable orchestration.
 * Acts as Mediator between business rules and workflow validation.
 */
export class WorkflowMethodologyAdapter implements IWorkflowMethodology {
  private config: WorkflowMethodologyRecord | null = null;
  private configPath: string;
  private feedbackStore: RecordStore<FeedbackRecord> | undefined;
  private cycleStore: RecordStore<CycleRecord> | undefined;

  // Constructor siguiendo blueprint - backward compatible
  constructor(configPathOrDependencies?: string | WorkflowMethodologyAdapterDependencies) {
    // Handle both old (string) and new (dependencies) constructor patterns
    if (typeof configPathOrDependencies === 'string') {
      // Old pattern: constructor(configPath?: string)
      this.configPath = configPathOrDependencies;
    } else if (configPathOrDependencies && typeof configPathOrDependencies === 'object') {
      // New pattern: constructor(dependencies: WorkflowMethodologyAdapterDependencies)
      const deps = configPathOrDependencies;
      this.configPath = deps.configPath || this.getDefaultConfigPath();
      this.feedbackStore = deps.feedbackStore;
      this.cycleStore = deps.cycleStore;
    } else {
      // No arguments - use defaults
      this.configPath = this.getDefaultConfigPath();
    }
  }

  private getDefaultConfigPath(): string {
    const projectRoot = ConfigManager.findProjectRoot();
    if (!projectRoot) {
      throw new Error('Project root not found. Please run from within a Git repository.');
    }
    return path.join(
      projectRoot,
      'packages/blueprints/03_products/core/specs/adapters/workflow_methodology_adapter/workflow_methodology_default.json'
    );
  }

  /**
   * Loads the methodology configuration from JSON file
   */
  private async loadConfig(): Promise<WorkflowMethodologyRecord> {
    if (this.config) {
      return this.config;
    }

    try {
      const configData = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(configData) as WorkflowMethodologyRecord;
      return this.config!;
    } catch (error) {
      throw new Error(`Failed to load methodology config from ${this.configPath}: ${error}`);
    }
  }

  /**
   * Gets the guild tag from a task's tags array
   */
  private getTaskGuild(context: ValidationContext): string {
    const guildTag = context.task.tags?.find(tag => tag.startsWith('guild:'));
    return guildTag ? guildTag.replace('guild:', '') : '__default__';
  }

  /**
   * Determines if a state transition is legal according to the methodology
   */
  async getTransitionRule(from: TaskStatus, to: TaskStatus, context: ValidationContext): Promise<TransitionRule | null> {
    const config = await this.loadConfig();

    // Look for transition rule in configuration
    const transitionConfig = config.state_transitions?.[to];

    if (!transitionConfig) {
      return null;
    }

    // Check if 'from' state is valid for this transition
    if (!transitionConfig.from.includes(from)) {
      return null;
    }

    return {
      to,
      conditions: transitionConfig.requires
    };
  }

  /**
   * Validates if an actor's signature meets the requirements for a transition
   */
  async validateSignature(signature: Signature, context: ValidationContext): Promise<boolean> {
    const config = await this.loadConfig();
    const guild = this.getTaskGuild(context);

    if (!context.transitionTo) {
      throw new Error('ValidationContext must include "transitionTo" for signature validation.');
    }
    const targetState = context.transitionTo;

    const actor = context.actor;
    if (!actor) {
      return false;
    }

    const transitionConfig = config.state_transitions?.[targetState];
    if (!transitionConfig) return false;

    // A transition must be possible from the current task state
    if (!transitionConfig.from.includes(context.task.status)) {
      return false;
    }

    const signatureRules = transitionConfig.requires.signatures;
    if (!signatureRules) return true; // No signature required for this transition

    const ruleSet = signatureRules[guild] || signatureRules['__default__'];
    if (!ruleSet) return false;

    // 1. Check if the signature role matches the required role
    if (signature.role !== ruleSet.role) {
      return false;
    }

    // 2. Check if the actor has at least one of the required capability roles
    const hasRequiredCapability = actor.roles?.some(role => ruleSet.capability_roles.includes(role));
    if (!hasRequiredCapability) {
      return false;
    }

    // 3. Check for min_approvals (requires context.signatures)
    const allSignaturesForGate = context.signatures || [signature];
    const relevantSignatures = allSignaturesForGate.filter(s => {
      // This is a simplified check for actor capability. A real implementation
      // would need to fetch each signing actor's record. Here we assume
      // the provided actor in the context is the one signing.
      return s.role === ruleSet.role && hasRequiredCapability;
    });


    if (relevantSignatures.length < ruleSet.min_approvals) {
      return false;
    }

    return true;
  }

  /**
   * Gets view configuration for mapping states to visual columns
   */
  async getViewConfig(viewName: string): Promise<ViewConfig | null> {
    const config = await this.loadConfig();
    return config.view_configs?.[viewName] || null;
  }

  /**
   * Loads methodology configuration from specific file path
   */
  async loadMethodologyConfig(filePath: string): Promise<WorkflowMethodologyRecord> {
    try {
      const configData = await fs.readFile(filePath, 'utf-8');
      const config = JSON.parse(configData) as WorkflowMethodologyRecord;

      // Validate against basic requirements
      const validation = this.validateMethodologyConfig(config);
      if (!validation.isValid) {
        throw new Error(`Invalid methodology config: ${validation.errors?.join(', ')}`);
      }

      return config;
    } catch (error) {
      throw new Error(`Failed to load methodology config from ${filePath}: ${error}`);
    }
  }

  /**
   * Validates methodology configuration against schema requirements
   */
  validateMethodologyConfig(config: WorkflowMethodologyRecord): { isValid: boolean; errors?: string[] } {
    const errors: string[] = [];

    // Check required fields
    if (!config.version) errors.push('version is required');
    if (!config.name) errors.push('name is required');
    if (!config.state_transitions) errors.push('state_transitions is required');

    if (errors.length > 0) {
      return { isValid: false, errors };
    }

    return { isValid: true };
  }





  /**
   * Validates custom rules for a given context
   */
  async validateCustomRules(rules: string[], context: ValidationContext): Promise<boolean> {
    const config = await this.loadConfig();

    for (const ruleId of rules) {
      const customRule = config.custom_rules?.[ruleId];

      if (!customRule) {
        console.warn(`Unknown custom rule: ${ruleId}`);
        return false;
      }

      let isRuleValid = false;

      // Validate based on rule type
      switch (customRule.validation) {
        case 'assignment_required':
          // Validate that task has a resolved assignment feedback record
          const assignment = context.feedbacks?.find(f =>
            f.type === 'assignment' && f.status === 'resolved'
          );
          isRuleValid = !!assignment;
          break;

        case 'sprint_capacity':
          // Validate that task is in an active sprint (cycle)
          if (!context.task.cycleIds || context.task.cycleIds.length === 0) {
            isRuleValid = false;
            break;
          }
          const activeCycles = context.cycles?.filter(c => c.status === 'active');
          if (!activeCycles || activeCycles.length === 0) {
            isRuleValid = false;
            break;
          }
          // Check if the task's cycles overlap with any active cycles
          isRuleValid = context.task.cycleIds.some(tcId => activeCycles.some(ac => ac.id === tcId));
          break;

        case 'epic_complexity':
          // Validate epic promotion requirements
          const isEpic = context.task.tags?.some(tag => tag.startsWith('epic:'));
          if (!isEpic) {
            isRuleValid = true; // Rule doesn't apply to non-epics
            break;
          }
          // Decomposed epics are paused and have child cycles.
          isRuleValid = context.task.status === 'paused' && (context.task.cycleIds?.length || 0) > 0;
          break;

        case 'custom':
          // For now, custom rules just log and return true
          // Future: could be extended for specific use cases
          console.log(`Custom rule '${ruleId}' executed`);
          isRuleValid = true;
          break;

        default:
          console.warn(`Unknown validation type: ${customRule.validation}`);
          isRuleValid = false;
          break;
      }

      // If any rule fails, the entire validation fails
      if (!isRuleValid) {
        return false;
      }
    }

    return true; // All rules passed
  }

  /**
   * Reloads the methodology configuration from disk
   */
  async reloadConfig(): Promise<void> {
    this.config = null;
    await this.loadConfig();
  }

  async getAvailableTransitions(from: TaskStatus): Promise<TransitionRule[]> {
    const config = await this.loadConfig();
    if (!config.state_transitions) {
      return [];
    }

    const available: TransitionRule[] = [];
    for (const toState in config.state_transitions) {
      const transitionConfig = config.state_transitions[toState];
      if (transitionConfig && transitionConfig.from.includes(from)) {
        available.push({
          to: toState as TaskStatus,
          conditions: transitionConfig.requires,
        });
      }
    }
    return available;
  }
}

