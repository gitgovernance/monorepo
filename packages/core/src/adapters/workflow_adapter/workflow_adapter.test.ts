import { WorkflowAdapter } from './index';
import type { TaskRecord } from '../../types';
import type { ActorRecord } from '../../types';
import type { FeedbackRecord } from '../../types';
import type { CycleRecord } from '../../types';
import type { Signature } from '../../types/embedded.types';
import type { ValidationContext } from './index';
import type { WorkflowRecord } from '../../types';
import type { IFeedbackAdapter } from '../feedback_adapter';

// Mock fs for file operations
jest.mock('fs/promises');

describe('WorkflowAdapter', () => {
  const mockFs = require('fs/promises');

  // Mock IFeedbackAdapter
  const mockFeedbackAdapter: IFeedbackAdapter = {
    create: jest.fn(),
    resolve: jest.fn(),
    getFeedback: jest.fn(),
    getFeedbackByEntity: jest.fn(),
    getAllFeedback: jest.fn(),
    getFeedbackThread: jest.fn(),
  };

  const createMockSignature = (role: string = 'author', keyId: string = 'human:test'): Signature => ({
    keyId,
    role,
    notes: '',
    signature: 'mock-signature',
    timestamp: 1752788100
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
  });

  describe('Configuration Management (EARS-A1 to A2)', () => {
    it('[EARS-A1] should use scrum config when specified', () => {
      const adapter = WorkflowAdapter.createScrum(mockFeedbackAdapter);
      expect(adapter).toBeDefined();
    });

    it('[EARS-A2] should accept custom config object', () => {
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

      const adapter = new WorkflowAdapter({
        config: customConfig as unknown as WorkflowRecord,
        feedbackAdapter: mockFeedbackAdapter
      });
      expect(adapter).toBeDefined();
    });
  });

  describe('Transition Rules (EARS-B1 to B8)', () => {
    let adapter: WorkflowAdapter;

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
        }
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(mockConfig));
      adapter = WorkflowAdapter.createDefault(mockFeedbackAdapter);
    });

    it('[EARS-B1] should return transition rule for draft to review', async () => {
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

    it('[EARS-B2] should return transition rule for review to ready', async () => {
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

    it('[EARS-B3] should return transition rule for ready to active', async () => {
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

    it('[EARS-B4] should return transition rule for active to done', async () => {
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

    it('[EARS-B5] should return transition rule for done to archived', async () => {
      const context: ValidationContext = { task: createMockTask() };
      const rule = await adapter.getTransitionRule('done', 'archived', context);

      expect(rule).toEqual({
        to: 'archived',
        conditions: { event: 'changelog_record_created' }
      });
    });

    it('[EARS-B6] should return transition rule for active to paused', async () => {
      const context: ValidationContext = { task: createMockTask() };
      const rule = await adapter.getTransitionRule('active', 'paused', context);

      expect(rule).toEqual({
        to: 'paused',
        conditions: {
          event: 'feedback_blocking_created'
        }
      });
    });

    it('[EARS-B7] should return transition rule for paused to active', async () => {
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

    it('[EARS-B8] should return null for invalid transition', async () => {
      const context: ValidationContext = { task: createMockTask() };
      const rule = await adapter.getTransitionRule('archived', 'draft', context);
      expect(rule).toBeNull();
    });
  });

  describe('Signature Validation (EARS-C1 to C5)', () => {
    let adapter: WorkflowAdapter;

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
        custom_rules: {}
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(mockConfig));
      adapter = WorkflowAdapter.createDefault(mockFeedbackAdapter);
    });

    it('[EARS-C1] should validate signature with required capability role', async () => {
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

    it('[EARS-C2] should reject signature without required capability role', async () => {
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

    it('[EARS-C3] should reject signature with invalid signature role', async () => {
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

    it('[EARS-C4] should validate signature with quality approver role', async () => {
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

    it('[EARS-C5] should reject signature when no actor in context', async () => {
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

  describe('Custom Rules Engine (EARS-D1 to D8)', () => {
    let adapter: WorkflowAdapter;

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
      adapter = WorkflowAdapter.createDefault(mockFeedbackAdapter);
    });

    it('[EARS-D1] should validate task assignment rule', async () => {
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

    it('[EARS-D2] should validate sprint rule', async () => {
      const taskWithCycle = createMockTask(['sprint:q4'], 'draft');
      taskWithCycle.cycleIds = ['cycle-1']; // Add cycleIds for sprint validation
      const context: ValidationContext = {
        task: taskWithCycle,
        actor: createMockActor(),
        cycles: [{
          id: 'cycle-1',
          title: 'Sprint 1',
          status: 'active',
        } as CycleRecord]
      };
      const result = await adapter.validateCustomRules(['task_must_be_in_active_sprint'], context);
      expect(result).toBe(true);
    });

    it('[EARS-D3] should reject unknown custom rule', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const context: ValidationContext = { task: createMockTask(), actor: createMockActor() };

      const result = await adapter.validateCustomRules(['unknown_rule'], context);

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('Unknown custom rule: unknown_rule');

      consoleSpy.mockRestore();
    });

    it('[EARS-D4] should validate empty rules array', async () => {
      const context: ValidationContext = { task: createMockTask(), actor: createMockActor() };
      const result = await adapter.validateCustomRules([], context);
      expect(result).toBe(true);
    });

    it('[EARS-D5] should validate multiple rules', async () => {
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
          title: 'Sprint 1',
          status: 'active',
        } as CycleRecord]
      };
      const result = await adapter.validateCustomRules([
        'task_must_have_valid_assignment_for_executor',
        'task_must_be_in_active_sprint'
      ], context);
      expect(result).toBe(true);
    });

    it('[EARS-D6] should validate epic_complexity rule for decomposed epic', async () => {
      const customAdapter = new WorkflowAdapter({
        config: {
          version: '1.0.0', name: 'Test', state_transitions: {},
          custom_rules: { 'epic_check': { description: 'Epic decomposed', validation: 'epic_complexity' } }
        } as unknown as WorkflowRecord,
        feedbackAdapter: mockFeedbackAdapter
      });
      const epicTask = createMockTask(['epic:auth'], 'paused');
      epicTask.cycleIds = ['cycle-child-1'];
      const context: ValidationContext = { task: epicTask, actor: createMockActor() };
      const result = await customAdapter.validateCustomRules(['epic_check'], context);
      expect(result).toBe(true);
    });

    it('[EARS-D7] should pass epic_complexity rule for non-epic task', async () => {
      const customAdapter = new WorkflowAdapter({
        config: {
          version: '1.0.0', name: 'Test', state_transitions: {},
          custom_rules: { 'epic_check': { description: 'Epic decomposed', validation: 'epic_complexity' } }
        } as unknown as WorkflowRecord,
        feedbackAdapter: mockFeedbackAdapter
      });
      const normalTask = createMockTask(['feature'], 'draft');
      const context: ValidationContext = { task: normalTask, actor: createMockActor() };
      const result = await customAdapter.validateCustomRules(['epic_check'], context);
      expect(result).toBe(true); // Rule doesn't apply to non-epics
    });

    it('[EARS-D8] should execute custom validation type', async () => {
      const customAdapter = new WorkflowAdapter({
        config: {
          version: '1.0.0', name: 'Test', state_transitions: {},
          custom_rules: { 'run_custom_check': { description: 'Custom check', validation: 'custom' } }
        } as unknown as WorkflowRecord,
        feedbackAdapter: mockFeedbackAdapter
      });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const context: ValidationContext = { task: createMockTask(), actor: createMockActor() };
      const result = await customAdapter.validateCustomRules(['run_custom_check'], context);
      expect(result).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith("Custom rule 'run_custom_check' executed");
      consoleSpy.mockRestore();
    });
  });

  describe('Available Transitions (EARS-E1 to E2)', () => {
    let adapter: WorkflowAdapter;

    beforeEach(() => {
      adapter = new WorkflowAdapter({
        config: {
          version: '1.0.0',
          name: 'Test Methodology',
          state_transitions: {
            review: {
              from: ['draft'],
              requires: { command: 'gitgov task submit' }
            },
            ready: {
              from: ['review'],
              requires: { command: 'gitgov task approve' }
            },
            active: {
              from: ['ready'],
              requires: { event: 'first_execution_record_created' }
            }
          },
          custom_rules: {}
        } as unknown as WorkflowRecord,
        feedbackAdapter: mockFeedbackAdapter
      });
    });

    it('[EARS-E1] should return available transitions from given state', async () => {
      const transitions = await adapter.getAvailableTransitions('draft');

      expect(transitions).toHaveLength(1);
      expect(transitions[0]).toEqual({
        to: 'review',
        conditions: { command: 'gitgov task submit' }
      });
    });

    it('[EARS-E2] should return empty array when no transitions exist', async () => {
      const transitions = await adapter.getAvailableTransitions('archived');

      expect(transitions).toEqual([]);
    });
  });

});