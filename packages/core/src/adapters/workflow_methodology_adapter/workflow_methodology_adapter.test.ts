import { WorkflowMethodologyAdapter } from './index';
import type { TaskRecord } from '../../types';
import type { ActorRecord } from '../../types';
import type { FeedbackRecord } from '../../types';
import type { CycleRecord } from '../../types';
import type { Signature } from '../../types/embedded.types';
import type { ValidationContext } from './index';
import type { WorkflowMethodologyRecord } from '../../types';
import type { IFeedbackAdapter } from '../feedback_adapter';

// Mock fs and ConfigManager
jest.mock('fs/promises');
jest.mock('../../config_manager');

describe('WorkflowMethodologyAdapter', () => {
  const mockFs = require('fs/promises');
  const mockConfigManager = require('../../config_manager').ConfigManager;

  // Mock IFeedbackAdapter
  const mockFeedbackAdapter: IFeedbackAdapter = {
    create: jest.fn(),
    resolve: jest.fn(),
    getFeedback: jest.fn(),
    getFeedbackByEntity: jest.fn(),
    getAllFeedback: jest.fn(),
  };

  const createMockSignature = (role: string = 'author', keyId: string = 'human:test'): Signature => ({
    keyId,
    role,
    signature: 'mock-signature',
    timestamp: 1752788100,
    timestamp_iso: '2025-07-31T10:15:00Z'
  });

  const createMockActor = (roles: [string, ...string[]] = ['author']): ActorRecord => ({
    id: 'human:test',
    type: 'human',
    displayName: 'Test User',
    status: 'active',
    publicKey: 'mock-public-key',
    roles,
    // Optional fields omitted
  });

  const createMockTask = (tags: string[] = [], status: TaskRecord['status'] = 'draft'): TaskRecord => ({
    id: '1752274500-task-test-task',
    title: 'Test Task',
    status,
    priority: 'medium',
    description: 'A test task',
    tags
    // Optional fields are omitted, not set to undefined
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfigManager.findProjectRoot.mockReturnValue('/test/project');
  });

  describe('Constructor', () => {
    it('[EARS-1] should initialize with default config when none provided', () => {
      const adapter = WorkflowMethodologyAdapter.createDefault(mockFeedbackAdapter);
      expect(adapter).toBeDefined();
      // Should use default config without calling ConfigManager
      expect(mockConfigManager.findProjectRoot).not.toHaveBeenCalled();
    });

    it('[EARS-2] should use scrum config when specified', () => {
      const adapter = WorkflowMethodologyAdapter.createScrum(mockFeedbackAdapter);
      expect(adapter).toBeDefined();
      // Should not call ConfigManager for predefined configs
      expect(mockConfigManager.findProjectRoot).not.toHaveBeenCalled();
    });

    it('[EARS-3] should accept custom config object', () => {
      const customConfig = {
        version: '1.0.0',
        name: 'Custom Methodology',
        state_transitions: {
          'draft': {
            from: ['draft'],
            requires: { command: 'gitgov task submit' }
          }
        }
      };

      const adapter = new WorkflowMethodologyAdapter({
        config: customConfig as unknown as WorkflowMethodologyRecord,
        feedbackAdapter: mockFeedbackAdapter
      });
      expect(adapter).toBeDefined();
      expect(mockConfigManager.findProjectRoot).not.toHaveBeenCalled();
    });
  });

  describe('getTransitionRule', () => {
    let adapter: WorkflowMethodologyAdapter;

    beforeEach(() => {
      // Mock config for unit tests
      const mockConfig = {
        version: '1.0.0',
        name: 'Test Methodology',
        description: 'Test methodology config',
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
          }
        },
        custom_rules: {
          'task_must_have_valid_assignment_for_executor': {
            description: 'Task must have valid assignment',
            validation: 'assignment_required'
          }
        },
        view_configs: {
          'kanban-7col': {
            columns: {
              'Active': ['active'],
              'Done': ['done']
            },
            theme: 'corporate',
            layout: 'vertical'
          }
        }
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(mockConfig));
      adapter = WorkflowMethodologyAdapter.createDefault(mockFeedbackAdapter);
    });

    it('[EARS-4] should return transition rule for draft to review', async () => {
      const context: ValidationContext = { task: createMockTask() };
      const rule = await adapter.getTransitionRule('draft', 'review', context);

      expect(rule).toEqual({
        to: 'review',
        conditions: {
          command: 'gitgov task submit',
          signatures: {
            '__default__': {
              role: 'submitter',
              capability_roles: ['author'],
              min_approvals: 1
            }
          }
        }
      });
    });

    it('[EARS-5] should return transition rule for review to ready', async () => {
      const context: ValidationContext = { task: createMockTask() };
      const rule = await adapter.getTransitionRule('review', 'ready', context);

      expect(rule).toEqual({
        to: 'ready',
        conditions: {
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
      });
    });

    it('[EARS-6] should return transition rule for ready to active', async () => {
      const context: ValidationContext = { task: createMockTask() };
      const rule = await adapter.getTransitionRule('ready', 'active', context);

      expect(rule).toEqual({
        to: 'active',
        conditions: {
          event: 'first_execution_record_created',
          custom_rules: ['task_must_have_valid_assignment_for_executor']
        }
      });
    });

    it('[EARS-7] should return transition rule for active to done', async () => {
      const context: ValidationContext = { task: createMockTask() };
      const rule = await adapter.getTransitionRule('active', 'done', context);

      expect(rule).toEqual({
        to: 'done',
        conditions: {
          command: 'gitgov task complete',
          signatures: {
            '__default__': {
              role: 'approver',
              capability_roles: ['approver:quality'],
              min_approvals: 1
            }
          }
        }
      });
    });

    it('[EARS-8] should return transition rule for done to archived', async () => {
      const context: ValidationContext = { task: createMockTask() };
      const rule = await adapter.getTransitionRule('done', 'archived', context);

      expect(rule).toEqual({
        to: 'archived',
        conditions: { event: 'changelog_record_created' }
      });
    });

    it('[EARS-8A] should return transition rule for active to paused', async () => {
      const context: ValidationContext = { task: createMockTask() };
      const rule = await adapter.getTransitionRule('active', 'paused', context);

      expect(rule).toEqual({
        to: 'paused',
        conditions: {
          event: 'feedback_blocking_created'
        }
      });
    });

    it('[EARS-8B] should return transition rule for paused to active (resume)', async () => {
      const context: ValidationContext = { task: createMockTask() };
      const rule = await adapter.getTransitionRule('paused', 'active', context);

      expect(rule).toEqual({
        to: 'active',
        conditions: {
          event: 'first_execution_record_created',
          custom_rules: ['task_must_have_valid_assignment_for_executor']
        }
      });
    });

    it('[EARS-9] should return null for invalid transition', async () => {
      const context: ValidationContext = { task: createMockTask() };
      const rule = await adapter.getTransitionRule('archived', 'draft', context);
      expect(rule).toBeNull();
    });
  });

  describe('validateSignature', () => {
    let adapter: WorkflowMethodologyAdapter;

    beforeEach(() => {
      const mockConfig = {
        version: '1.0.0',
        name: 'Test Methodology',
        description: 'Test methodology config',
        state_transitions: {
          ready: {
            from: ['review'],
            requires: {
              signatures: {
                __default__: {
                  role: 'approver',
                  capability_roles: ['approver:product'],
                  min_approvals: 1
                }
              }
            }
          },
          done: {
            from: ['active'],
            requires: {
              signatures: {
                __default__: {
                  role: 'approver',
                  capability_roles: ['approver:quality'],
                  min_approvals: 1
                }
              }
            }
          }
        },
        custom_rules: {},
        view_configs: {}
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(mockConfig));
      adapter = WorkflowMethodologyAdapter.createDefault(mockFeedbackAdapter);
    });

    it('[EARS-10] should validate signature with required capability role', async () => {
      const signature = createMockSignature('approver');
      const actor = createMockActor(['approver:product']);
      const context: ValidationContext = {
        task: createMockTask(undefined, 'review'),
        actor,
        signatures: [signature],
        transitionTo: 'ready'
      };

      const result = await adapter.validateSignature(signature, context);
      expect(result).toBe(true);
    });

    it('[EARS-11] should reject signature without required capability role', async () => {
      const signature = createMockSignature('approver');
      const actor = createMockActor(['invalid']); // Missing approver:* role
      const context: ValidationContext = {
        task: createMockTask(undefined, 'review'),
        actor,
        signatures: [signature],
        transitionTo: 'ready'
      };

      const result = await adapter.validateSignature(signature, context);
      expect(result).toBe(false);
    });

    it('[EARS-12] should reject signature with invalid signature role', async () => {
      const signature = createMockSignature('invalid-role');
      const actor = createMockActor(['approver:product']);
      const context: ValidationContext = {
        task: createMockTask(undefined, 'review'),
        actor,
        signatures: [signature],
        transitionTo: 'ready'
      };

      const result = await adapter.validateSignature(signature, context);
      expect(result).toBe(false);
    });

    it('[EARS-13] should validate signature with quality approver role', async () => {
      const signature = createMockSignature('approver');
      const actor = createMockActor(['approver:quality']);
      const context: ValidationContext = {
        task: createMockTask(undefined, 'active'),
        actor,
        signatures: [signature],
        transitionTo: 'done' // Add missing transitionTo
      };

      const result = await adapter.validateSignature(signature, context);
      expect(result).toBe(true);
    });

    it('[EARS-21] should reject signature when no actor in context', async () => {
      const signature = createMockSignature('approver');
      const context: ValidationContext = {
        task: createMockTask(undefined, 'review'),
        signatures: [signature],
        transitionTo: 'ready' // Add missing transitionTo
      }; // No actor

      const result = await adapter.validateSignature(signature, context);
      expect(result).toBe(false);
    });
  });

  describe('validateCustomRules', () => {
    let adapter: WorkflowMethodologyAdapter;

    beforeEach(() => {
      // Mock config loading for validateCustomRules tests
      const mockConfig = {
        version: '1.0.0',
        name: 'Test Methodology',
        description: 'Test methodology for custom rules',
        state_transitions: {},
        custom_rules: {
          'task_must_have_valid_assignment_for_executor': {
            description: 'Task must have valid assignment',
            validation: 'assignment_required'
          },
          'task_must_be_in_active_sprint': {
            description: 'Task must be in active sprint',
            validation: 'sprint_capacity'
          }
        }
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(mockConfig));
      adapter = WorkflowMethodologyAdapter.createDefault(mockFeedbackAdapter);
    });

    it('[EARS-14] should validate task assignment rule', async () => {
      const context: ValidationContext = {
        task: createMockTask(),
        actor: createMockActor(),
        feedbacks: [{
          id: 'feedback-1',
          entityId: 'task-1',
          entityType: 'task',
          type: 'assignment',
          status: 'resolved',
          // ... other required fields
        } as FeedbackRecord]
      };
      const result = await adapter.validateCustomRules(['task_must_have_valid_assignment_for_executor'], context);
      expect(result).toBe(true);
    });

    it('[EARS-15] should validate sprint rule', async () => {
      const taskWithCycle = createMockTask(['sprint:q4'], 'draft');
      taskWithCycle.cycleIds = ['cycle-1']; // Add cycleIds for sprint validation
      const context: ValidationContext = {
        task: taskWithCycle,
        actor: createMockActor(),
        cycles: [{
          id: 'cycle-1',
          status: 'active',
          // ... other required fields
        } as any]
      };
      const result = await adapter.validateCustomRules(['task_must_be_in_active_sprint'], context);
      expect(result).toBe(true);
    });

    it('[EARS-16] should reject unknown custom rule', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const context: ValidationContext = { task: createMockTask(), actor: createMockActor() };

      const result = await adapter.validateCustomRules(['unknown_rule'], context);

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('Unknown custom rule: unknown_rule');

      consoleSpy.mockRestore();
    });

    it('[EARS-17] should validate empty rules array', async () => {
      const context: ValidationContext = { task: createMockTask(), actor: createMockActor() };
      const result = await adapter.validateCustomRules([], context);
      expect(result).toBe(true);
    });

    it('[EARS-18] should validate multiple rules', async () => {
      const taskWithCycle = createMockTask(['sprint:q4'], 'draft');
      taskWithCycle.cycleIds = ['cycle-1']; // Add cycleIds for sprint validation
      const context: ValidationContext = {
        task: taskWithCycle,
        actor: createMockActor(),
        feedbacks: [{
          id: 'feedback-1',
          entityId: 'task-1',
          entityType: 'task',
          type: 'assignment',
          status: 'resolved',
        } as FeedbackRecord],
        cycles: [{
          id: 'cycle-1',
          status: 'active',
        } as CycleRecord]
      };
      const result = await adapter.validateCustomRules([
        'task_must_have_valid_assignment_for_executor',
        'task_must_be_in_active_sprint'
      ], context);
      expect(result).toBe(true);
    });
  });


  describe('getViewConfig', () => {
    let adapter: WorkflowMethodologyAdapter;

    beforeEach(() => {
      adapter = WorkflowMethodologyAdapter.createDefault(mockFeedbackAdapter); // Uses default config
    });

    it('[EARS-19] should return view config for valid view name', async () => {
      const viewConfig = await adapter.getViewConfig('kanban-7col');

      expect(viewConfig).toEqual({
        columns: {
          'Draft': ['draft'],
          'Review': ['review'],
          'Ready': ['ready'],
          'Active': ['active'],
          'Done': ['done'],
          'Archived': ['archived'],
          'Blocked': ['paused'],
          'Cancelled': ['discarded']
        },
        theme: 'corporate',
        layout: 'vertical'
      });
    });

    it('[EARS-20] should return null for non-existent view', async () => {
      const viewConfig = await adapter.getViewConfig('non-existent-view');
      expect(viewConfig).toBeNull();
    });
  });

});