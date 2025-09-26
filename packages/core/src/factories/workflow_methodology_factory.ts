import type { WorkflowMethodologyRecord } from "../types";
import {
  validateWorkflowMethodologyConfigDetailed,
  validateWorkflowMethodologyConfigBusinessRules
} from "../validation/workflow_methodology_validator";
import { DetailedValidationError } from "../validation/common";

/**
 * Creates a new, fully-formed WorkflowMethodologyConfig with validation.
 * Follows the same pattern as createTaskRecord, createActorRecord, etc.
 */
export async function createWorkflowMethodologyConfig(
  payload: Partial<WorkflowMethodologyRecord>
): Promise<WorkflowMethodologyRecord> {

  // Build config with defaults for optional fields
  const config: WorkflowMethodologyRecord = {
    version: payload.version || '1.0.0',
    name: payload.name || 'Custom Methodology',
    description: payload.description,
    state_transitions: payload.state_transitions || {
      review: {
        from: ['draft'],
        requires: {
          command: 'gitgov task submit',
          signatures: {
            '__default__': {
              role: 'submitter',
              capability_roles: ['author'],
              min_approvals: 1
            }
          }
        }
      }
    },
    custom_rules: payload.custom_rules,
    view_configs: payload.view_configs || {
      'kanban-4col': {
        columns: {
          'Draft': ['draft'],
          'In Progress': ['review', 'ready', 'active'],
          'Done': ['done', 'archived']
        },
        theme: 'minimal',
        layout: 'horizontal'
      }
    },
    ...payload,
  } as WorkflowMethodologyRecord;

  // Use validator to check schema compliance with detailed errors
  const schemaValidation = validateWorkflowMethodologyConfigDetailed(config);
  if (!schemaValidation.isValid) {
    throw new DetailedValidationError('WorkflowMethodologyConfig', schemaValidation.errors);
  }

  // Use business rules validator for additional validation
  const businessRulesValidation = validateWorkflowMethodologyConfigBusinessRules(config);
  if (!businessRulesValidation.isValid) {
    throw new DetailedValidationError('WorkflowMethodologyConfig (Business Rules)', businessRulesValidation.errors);
  }

  return config;
}

/**
 * Creates a default GitGovernance workflow methodology configuration
 */
export async function createDefaultWorkflowMethodologyConfig(): Promise<WorkflowMethodologyRecord> {
  return createWorkflowMethodologyConfig({
    version: '1.0.0',
    name: 'GitGovernance Default Methodology',
    description: 'Standard GitGovernance workflow with quality gates and agent collaboration',
    state_transitions: {
      review: {
        from: ['draft'],
        requires: {
          command: 'gitgov task submit',
          signatures: {
            '__default__': {
              role: 'submitter',
              capability_roles: ['author'],
              min_approvals: 1
            }
          }
        }
      },
      ready: {
        from: ['review'],
        requires: {
          command: 'gitgov task approve',
          signatures: {
            '__default__': {
              role: 'approver',
              capability_roles: ['approver:product'],
              min_approvals: 1
            },
            'design': {
              role: 'approver',
              capability_roles: ['approver:design'],
              min_approvals: 1
            },
            'quality': {
              role: 'approver',
              capability_roles: ['approver:quality'],
              min_approvals: 1
            }
          }
        }
      },
      active: {
        from: ['ready'],
        requires: {
          event: 'first_execution_record_created',
          custom_rules: ['task_must_have_valid_assignment_for_executor']
        }
      },
      done: {
        from: ['active'],
        requires: {
          command: 'gitgov task complete',
          signatures: {
            '__default__': {
              role: 'approver',
              capability_roles: ['approver:quality'],
              min_approvals: 1
            }
          }
        }
      },
      archived: {
        from: ['done'],
        requires: {
          event: 'changelog_record_created'
        }
      },
      paused: {
        from: ['active', 'review'],
        requires: {
          event: 'feedback_blocking_created'
        }
      }
    },
    custom_rules: {
      'task_must_have_valid_assignment_for_executor': {
        description: 'Task must have a valid assignment before execution can begin',
        validation: 'assignment_required'
      },
      'task_must_be_in_active_sprint': {
        description: 'Task must belong to an active sprint cycle',
        validation: 'sprint_capacity'
      },
      'epic_promotion_required': {
        description: 'Complex tasks must be promoted to epic with child cycles',
        validation: 'epic_complexity'
      }
    },
    view_configs: {
      'kanban-4col': {
        columns: {
          'Draft': ['draft'],
          'In Progress': ['review', 'ready', 'active'],
          'Review': ['done'],
          'Done': ['archived']
        },
        theme: 'minimal',
        layout: 'horizontal'
      },
      'kanban-7col': {
        columns: {
          'Draft': ['draft'],
          'Review': ['review'],
          'Ready': ['ready'],
          'Active': ['active'],
          'Done': ['done'],
          'Archived': ['archived'],
          'Blocked': ['paused']
        },
        theme: 'corporate',
        layout: 'vertical'
      }
    }
  });
}
