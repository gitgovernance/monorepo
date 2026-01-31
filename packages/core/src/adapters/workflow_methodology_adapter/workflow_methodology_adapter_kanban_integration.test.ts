import { WorkflowMethodologyAdapter } from './index';
import type { TaskRecord } from '../../types';
import type { ActorRecord } from '../../types';
import type { ValidationContext } from './index';
import type { CycleRecord } from '../../types';
import type { FeedbackRecord } from '../../types';
import type { IFeedbackAdapter } from '../feedback_adapter';

describe('WorkflowMethodologyAdapter - DEFAULT Methodology Integration Tests', () => {
  // Mock IFeedbackAdapter
  const mockFeedbackAdapter: IFeedbackAdapter = {
    create: jest.fn(),
    resolve: jest.fn(),
    getFeedback: jest.fn(),
    getFeedbackByEntity: jest.fn(),
    getAllFeedback: jest.fn(),
    getFeedbackThread: jest.fn(),
  };
  const createMockTask = (tags: string[] = [], status: TaskRecord['status'] = 'draft'): TaskRecord => ({
    id: '1752274500-task-test-task',
    title: 'Test Task',
    status,
    priority: 'medium',
    description: 'A test task',
    tags
    // Optional fields are omitted, not set to undefined
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

  // Shared adapter for all DEFAULT methodology tests
  let adapter: WorkflowMethodologyAdapter;

  beforeEach(() => {
    // Use real default config for integration tests
    adapter = WorkflowMethodologyAdapter.createDefault(mockFeedbackAdapter);
  });

  describe('Factory & Configuration (EARS-A1)', () => {
    it('[EARS-A1] should initialize with default config when none provided', () => {
      expect(adapter).toBeDefined();
    });
  });

  describe('Integration Real Config (EARS-B1 to B3)', () => {

    it('[EARS-B1] should work with real kanban_workflow.json', async () => {
      const context: ValidationContext = { task: createMockTask() };
      const rule = await adapter.getTransitionRule('draft', 'review', context);

      expect(rule).toBeDefined();
      expect(rule?.to).toBe('review');
      expect(rule?.conditions?.command).toBe('gitgov task submit');
    });

    it('[EARS-B2] should validate custom rules from real config', async () => {
      const context: ValidationContext = {
        task: createMockTask(),
        actor: createMockActor(['author', 'executor']),
        feedbacks: [{
          id: 'fb-assign',
          entityId: '1752274500-task-test-task',
          entityType: 'task',
          type: 'assignment',
          status: 'resolved'
        } as FeedbackRecord]
      };

      const result = await adapter.validateCustomRules(
        ['task_must_have_valid_assignment_for_executor'],
        context
      );

      expect(result).toBe(true);
    });

    it('[EARS-B3] should validate role-specific signatures from real config', async () => {
      const task = createMockTask([], 'review');
      const designActor = createMockActor(['approver:design']);
      const context: ValidationContext = {
        task,
        actor: designActor,
        transitionTo: 'ready'
      };

      const signature = {
        keyId: designActor.id,
        role: 'approver',
        notes: '',
        signature: 'mock-signature',
        timestamp: 1752788100
      };

      const result = await adapter.validateSignature(signature, context);
      expect(result).toBe(true);
    });

  });

  describe('DEFAULT METHODOLOGY - Ciclo de Vida Completo', () => {
    // Reutilizar el mismo adapter de "Real Configuration Tests"

    describe('Kanban Lifecycle (EARS-C1 to C7)', () => {
      it('[EARS-C1] should complete draft to review transition with default methodology', async () => {
        const task = createMockTask([], 'draft');
        const author = createMockActor(['author']);
        const context: ValidationContext = {
          task,
          actor: author,
          transitionTo: 'review'
        };

        const rule = await adapter.getTransitionRule('draft', 'review', context);

        expect(rule).toBeDefined();
        expect(rule?.to).toBe('review');
        expect(rule?.conditions?.command).toBe('gitgov task submit');
        expect(rule?.conditions?.signatures?.['__default__']?.role).toBe('submitter');
        expect(rule?.conditions?.signatures?.['__default__']?.capability_roles).toContain('author');
      });

      it('[EARS-C2] should complete review to ready transition with default methodology', async () => {
        const task = createMockTask([], 'review');
        const approver = createMockActor(['approver:product']);
        const context: ValidationContext = {
          task,
          actor: approver,
          transitionTo: 'ready'
        };

        const rule = await adapter.getTransitionRule('review', 'ready', context);

        expect(rule).toBeDefined();
        expect(rule?.to).toBe('ready');
        expect(rule?.conditions?.command).toBe('gitgov task approve');
        expect(rule?.conditions?.signatures?.['__default__']?.capability_roles).toContain('approver:product');

        // Validate approver signature
        const signature = {
          keyId: approver.id,
          role: 'approver',
          notes: '',
          signature: 'mock-signature',
          timestamp: Date.now()
        };
        const signatureResult = await adapter.validateSignature(signature, context);
        expect(signatureResult).toBe(true);
      });

      it('[EARS-C3] should complete ready to active transition with default methodology', async () => {
        const task = createMockTask([], 'ready');
        const executor = createMockActor(['executor']);
        const context: ValidationContext = {
          task,
          actor: executor,
          feedbacks: [{
            id: 'fb-assign',
            entityId: task.id,
            entityType: 'task',
            type: 'assignment',
            status: 'resolved',
            content: 'Assigned to executor',
            assignee: executor.id
          } as FeedbackRecord],
          transitionTo: 'active'
        };

        const rule = await adapter.getTransitionRule('ready', 'active', context);

        expect(rule).toBeDefined();
        expect(rule?.to).toBe('active');
        expect(rule?.conditions?.event).toBe('first_execution_record_created');
        expect(rule?.conditions?.custom_rules).toContain('task_must_have_valid_assignment_for_executor');

        // Validate assignment required rule
        const customRuleResult = await adapter.validateCustomRules(['task_must_have_valid_assignment_for_executor'], context);
        expect(customRuleResult).toBe(true);
      });

      it('[EARS-C4] should complete active to done transition with default methodology', async () => {
        const task = createMockTask([], 'active');
        const qualityApprover = createMockActor(['approver:quality']);
        const context: ValidationContext = {
          task,
          actor: qualityApprover,
          transitionTo: 'done'
        };

        const rule = await adapter.getTransitionRule('active', 'done', context);

        expect(rule).toBeDefined();
        expect(rule?.to).toBe('done');
        expect(rule?.conditions?.command).toBe('gitgov task complete');
        expect(rule?.conditions?.signatures?.['__default__']?.capability_roles).toContain('approver:quality');

        // Validate quality approver signature
        const signature = {
          keyId: qualityApprover.id,
          role: 'approver',
          notes: '',
          signature: 'mock-signature',
          timestamp: Date.now()
        };
        const signatureResult = await adapter.validateSignature(signature, context);
        expect(signatureResult).toBe(true);
      });

      it('[EARS-C5] should complete done to archived transition with default methodology', async () => {
        const task = createMockTask([], 'done');
        const context: ValidationContext = { task, transitionTo: 'archived' };

        const rule = await adapter.getTransitionRule('done', 'archived', context);

        expect(rule).toBeDefined();
        expect(rule?.to).toBe('archived');
        expect(rule?.conditions?.event).toBe('changelog_record_created');
      });

      it('[EARS-C6] should complete active to paused transition with default methodology', async () => {
        const task = createMockTask([], 'active');
        const context: ValidationContext = { task, transitionTo: 'paused' };

        const rule = await adapter.getTransitionRule('active', 'paused', context);

        expect(rule).toBeDefined();
        expect(rule?.to).toBe('paused');
        expect(rule?.conditions?.event).toBe('feedback_blocking_created');
      });

      it('[EARS-C7] should complete paused to active transition with default methodology', async () => {
        const task = createMockTask([], 'paused');
        const context: ValidationContext = { task, transitionTo: 'active' };

        const rule = await adapter.getTransitionRule('paused', 'active', context);

        expect(rule).toBeDefined();
        expect(rule?.to).toBe('active');
        expect(rule?.conditions?.event).toBe('first_execution_record_created');
        expect(rule?.conditions?.custom_rules).toContain('task_must_have_valid_assignment_for_executor');
      });
    });

    describe('Kanban Roles (EARS-D1 to D3)', () => {
      it('[EARS-D1] should handle design signature validation with default methodology', async () => {
        const task = createMockTask([], 'review');
        const designApprover = createMockActor(['approver:design']);
        const context: ValidationContext = {
          task,
          actor: designApprover,
          transitionTo: 'ready'
        };

        const rule = await adapter.getTransitionRule('review', 'ready', context);
        expect(rule).toBeDefined();
        expect(rule?.conditions?.signatures?.['design']?.capability_roles).toContain('approver:design');

        // Validate design signature
        const signature = {
          keyId: designApprover.id,
          role: 'approver',
          notes: '',
          signature: 'mock-signature',
          timestamp: Date.now()
        };
        const signatureResult = await adapter.validateSignature(signature, context);
        expect(signatureResult).toBe(true);
      });

      it('[EARS-D2] should handle quality signature validation with default methodology', async () => {
        const task = createMockTask([], 'review');
        const qualityApprover = createMockActor(['approver:quality']);
        const context: ValidationContext = {
          task,
          actor: qualityApprover,
          transitionTo: 'ready'
        };

        const rule = await adapter.getTransitionRule('review', 'ready', context);
        expect(rule).toBeDefined();
        expect(rule?.conditions?.signatures?.['quality']?.capability_roles).toContain('approver:quality');
      });

      it('[EARS-D3] should handle default signature validation with default methodology', async () => {
        const task = createMockTask([], 'review');
        const productApprover = createMockActor(['approver:product']);
        const context: ValidationContext = {
          task,
          actor: productApprover,
          transitionTo: 'ready'
        };

        const rule = await adapter.getTransitionRule('review', 'ready', context);
        expect(rule).toBeDefined();
        expect(rule?.conditions?.signatures?.['__default__']?.capability_roles).toContain('approver:product');
      });
    });

    describe('Kanban Custom Rules (EARS-E1 to E3)', () => {
      it('[EARS-E1] should validate assignment_required rule with default methodology', async () => {
        const task = createMockTask([], 'ready');
        const executor = createMockActor(['executor']);
        const context: ValidationContext = {
          task,
          actor: executor,
          feedbacks: [{
            id: 'fb-assign',
            entityId: task.id,
            entityType: 'task',
            type: 'assignment',
            status: 'resolved',
            assignee: executor.id
          } as FeedbackRecord]
        };

        const result = await adapter.validateCustomRules(['task_must_have_valid_assignment_for_executor'], context);
        expect(result).toBe(true);
      });

      it('[EARS-E2] should validate sprint_capacity rule with default methodology', async () => {
        const task = createMockTask(['sprint:current'], 'review');
        task.cycleIds = ['1752274500-cycle-active-sprint'];
        const context: ValidationContext = {
          task,
          cycles: [{
            id: '1752274500-cycle-active-sprint',
            title: 'Active Sprint',
            status: 'active'
          } as CycleRecord]
        };

        const result = await adapter.validateCustomRules(['task_must_be_in_active_sprint'], context);
        expect(result).toBe(true);
      });

      it('[EARS-E3] should validate epic_complexity rule with default methodology', async () => {
        const epicTask = createMockTask(['epic:user-auth'], 'paused');
        epicTask.cycleIds = ['1752274500-cycle-epic-decomposition'];
        const context: ValidationContext = {
          task: epicTask,
          cycles: [{
            id: '1752274500-cycle-epic-decomposition',
            title: 'Epic Decomposition',
            status: 'planning'
          } as CycleRecord]
        };

        const result = await adapter.validateCustomRules(['epic_promotion_required'], context);
        expect(result).toBe(true);
      });
    });
  });

});
