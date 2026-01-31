import type { WorkflowMethodologyRecord } from '../../types';
import type { TaskRecord } from '../../types';
import type { ActorRecord } from '../../types';
import type { FeedbackRecord } from '../../types';
import type { CycleRecord } from '../../types';
import type { Signature } from '../../types/embedded.types';
import { Schemas } from '../../schemas';
import { SchemaValidationCache } from '../../schemas/schema_cache';
import type { IFeedbackAdapter } from '../feedback_adapter';
import defaultConfig from './generated/kanban_workflow.json';
import scrumConfig from './generated/scrum_workflow.json';

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
  conditions: NonNullable<NonNullable<WorkflowMethodologyRecord['state_transitions']>[string]>['requires'] | undefined;
}

export interface IWorkflowMethodology {
  getTransitionRule(from: TaskStatus, to: TaskStatus, context: ValidationContext): Promise<TransitionRule | null>;
  validateSignature(signature: Signature, context: ValidationContext): Promise<boolean>;
  validateCustomRules(rules: string[], context: ValidationContext): Promise<boolean>;
  getAvailableTransitions(from: TaskStatus): Promise<TransitionRule[]>;
}

/**
 * WorkflowMethodologyAdapter Dependencies - Facade + Dependency Injection Pattern
 */
export interface WorkflowMethodologyAdapterDependencies {
  // Configuration Layer
  config: WorkflowMethodologyRecord; // ✅ Direct config object (validated)

  // Required: Cross-adapter dependencies (critical for custom rules)
  feedbackAdapter: IFeedbackAdapter; // Para assignment_required validation
}

/**
 * WorkflowMethodologyAdapter - The Configurable Rules Engine
 * 
 * Implements Facade + Dependency Injection Pattern for testeable and configurable orchestration.
 * Acts as Mediator between business rules and workflow validation.
 */
export class WorkflowMethodologyAdapter implements IWorkflowMethodology {
  private config: WorkflowMethodologyRecord;

  constructor(dependencies: WorkflowMethodologyAdapterDependencies) {
    this.validateConfig(dependencies.config, dependencies.config.name || 'custom');
    this.config = dependencies.config;
  }

  // Factory methods para configuraciones predefinidas
  static createDefault(feedbackAdapter: IFeedbackAdapter): WorkflowMethodologyAdapter {
    return new WorkflowMethodologyAdapter({
      config: defaultConfig as unknown as WorkflowMethodologyRecord,
      feedbackAdapter
    });
  }

  static createScrum(feedbackAdapter: IFeedbackAdapter): WorkflowMethodologyAdapter {
    return new WorkflowMethodologyAdapter({
      config: scrumConfig as unknown as WorkflowMethodologyRecord,
      feedbackAdapter
    });
  }

  private validateConfig(config: WorkflowMethodologyRecord, configName: string): void {
    const validator = SchemaValidationCache.getValidatorFromSchema(Schemas.WorkflowMethodologyRecord);
    const isValid = validator(config);

    if (!isValid) {
      const errors = validator.errors?.map(err => `${err.instancePath}: ${err.message}`).join(', ') || 'Unknown validation error';
      throw new Error(`Invalid ${configName} configuration: ${errors}`);
    }
  }

  /**
   * Gets the current configuration (already loaded and validated)
   */
  private getConfig(): WorkflowMethodologyRecord {
    return this.config;
  }

  /**
   * Determines which signature group to use for validation.
   * Checks all available signature groups and returns the first one where
   * the actor has matching capability roles.
   */
  private getApplicableSignatureGroup(signatureRules: Record<string, any>, actor: ActorRecord): string {
    // Try to find a signature group where the actor has matching roles
    for (const [groupName, ruleSet] of Object.entries(signatureRules)) {
      if (groupName === '__default__') continue; // Check __default__ last

      const hasMatchingRole = actor.roles?.some(role => ruleSet.capability_roles?.includes(role));
      if (hasMatchingRole) {
        return groupName;
      }
    }

    // Fallback to __default__
    return '__default__';
  }

  /**
   * Determines if a state transition is legal according to the methodology
   */
  async getTransitionRule(from: TaskStatus, to: TaskStatus, _context: ValidationContext): Promise<TransitionRule | null> {
    const config = this.getConfig();

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
    const config = this.getConfig();

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

    // Determine which signature group applies based on actor's roles
    const signatureGroup = this.getApplicableSignatureGroup(signatureRules, actor);
    const ruleSet = signatureRules[signatureGroup];
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
   * Validates custom rules for a given context
   */
  async validateCustomRules(rules: string[], context: ValidationContext): Promise<boolean> {
    const config = this.getConfig();

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


  async getAvailableTransitions(from: TaskStatus): Promise<TransitionRule[]> {
    const config = this.getConfig();
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


