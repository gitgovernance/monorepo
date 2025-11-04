import { WorkflowMethodologyAdapter } from './index';
import type { TaskRecord } from '../../types';
import type { ActorRecord } from '../../types';
import type { ValidationContext } from './index';
import type { CycleRecord } from '../../types';
import type { FeedbackRecord } from '../../types';
import type { IFeedbackAdapter } from '../feedback_adapter';

describe('WorkflowMethodologyAdapter - SCRUM Methodology Integration Tests', () => {
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

  describe('SCRUM METHODOLOGY - Ciclo de Vida Completo', () => {
    let scrumAdapter: WorkflowMethodologyAdapter;

    beforeEach(() => {
      // Use scrum methodology for integration tests
      scrumAdapter = WorkflowMethodologyAdapter.createScrum(mockFeedbackAdapter);
    });

    describe('Complete Scrum Lifecycle - Canonical States', () => {
      it('[EARS-61] should complete draft to review transition with scrum methodology', async () => {
        const task = createMockTask([], 'draft');
        const productOwner = createMockActor(['product:owner']);
        const context: ValidationContext = {
          task,
          actor: productOwner,
          transitionTo: 'review'
        };

        const rule = await scrumAdapter.getTransitionRule('draft', 'review', context);

        expect(rule).toBeDefined();
        expect(rule?.to).toBe('review');
        expect(rule?.conditions?.command).toBe('gitgov task submit');
        expect(rule?.conditions?.signatures?.['__default__']?.role).toBe('product_owner');
        expect(rule?.conditions?.signatures?.['__default__']?.capability_roles).toContain('product:owner');
      });

      it('[EARS-62] should complete review to ready transition with scrum methodology', async () => {
        const task = createMockTask(['sprint:current'], 'review');
        task.cycleIds = ['1752274500-cycle-sprint-current'];
        const context: ValidationContext = {
          task,
          cycles: [{
            id: '1752274500-cycle-sprint-current',
            status: 'active'
          } as CycleRecord],
          transitionTo: 'ready'
        };

        const rule = await scrumAdapter.getTransitionRule('review', 'ready', context);

        expect(rule).toBeDefined();
        expect(rule?.to).toBe('ready');
        expect(rule?.conditions?.command).toBe('gitgov task approve');
        expect(rule?.conditions?.custom_rules).toContain('task_fits_in_sprint_capacity');

        // Validate custom rule
        const customRuleResult = await scrumAdapter.validateCustomRules(['task_fits_in_sprint_capacity'], context);
        expect(customRuleResult).toBe(true);
      });

      it('[EARS-63] should complete ready to active transition with scrum methodology', async () => {
        const task = createMockTask(['sprint:current'], 'ready');
        const developer = createMockActor(['scrum:developer']);
        const context: ValidationContext = {
          task,
          actor: developer,
          feedbacks: [{
            id: 'fb-assign',
            entityId: task.id,
            entityType: 'task',
            type: 'assignment',
            status: 'resolved',
            content: 'Assigned to developer',
            assignee: developer.id
          } as FeedbackRecord],
          transitionTo: 'active'
        };

        const rule = await scrumAdapter.getTransitionRule('ready', 'active', context);

        expect(rule).toBeDefined();
        expect(rule?.to).toBe('active');
        expect(rule?.conditions?.event).toBe('sprint_started');
        expect(rule?.conditions?.custom_rules).toContain('task_assigned_to_team_member');

        // Validate assignment rule
        const customRuleResult = await scrumAdapter.validateCustomRules(['task_assigned_to_team_member'], context);
        expect(customRuleResult).toBe(true);
      });

      it('[EARS-64] should complete active to done transition with scrum methodology', async () => {
        const task = createMockTask([], 'active');
        const scrumMaster = createMockActor(['scrum:master']);
        const context: ValidationContext = {
          task,
          actor: scrumMaster,
          transitionTo: 'done'
        };

        const rule = await scrumAdapter.getTransitionRule('active', 'done', context);

        expect(rule).toBeDefined();
        expect(rule?.to).toBe('done');
        expect(rule?.conditions?.command).toBe('gitgov task complete');
        expect(rule?.conditions?.signatures?.['__default__']?.role).toBe('scrum_master');
        expect(rule?.conditions?.signatures?.['__default__']?.capability_roles).toContain('scrum:master');

        // Validate signature
        const signature = {
          keyId: scrumMaster.id,
          role: 'scrum_master',
          notes: '',
          signature: 'mock-signature',
          timestamp: Date.now()
        };
        const signatureResult = await scrumAdapter.validateSignature(signature, context);
        expect(signatureResult).toBe(true);
      });

      it('[EARS-65] should complete done to archived transition with scrum methodology', async () => {
        const task = createMockTask([], 'done');
        const context: ValidationContext = { task, transitionTo: 'archived' };

        const rule = await scrumAdapter.getTransitionRule('done', 'archived', context);

        expect(rule).toBeDefined();
        expect(rule?.to).toBe('archived');
        expect(rule?.conditions?.event).toBe('changelog_record_created');
      });
    });

    describe('Scrum Role-Specific Workflows', () => {
      it('[EARS-66] should handle product owner workflow with scrum methodology', async () => {
        const task = createMockTask([], 'draft');
        const productOwner = createMockActor(['product:owner']);
        const context: ValidationContext = {
          task,
          actor: productOwner,
          transitionTo: 'review'
        };

        // Product Owner can groom tasks (draft → review)
        const rule = await scrumAdapter.getTransitionRule('draft', 'review', context);
        expect(rule).toBeDefined();
        expect(rule?.conditions?.signatures?.['__default__']?.capability_roles).toContain('product:owner');

        // Validate product owner signature
        const signature = {
          keyId: productOwner.id,
          role: 'product_owner',
          notes: '',
          signature: 'mock-signature',
          timestamp: Date.now()
        };
        const signatureResult = await scrumAdapter.validateSignature(signature, context);
        expect(signatureResult).toBe(true);
      });

      it('[EARS-67] should handle scrum master workflow with scrum methodology', async () => {
        const task = createMockTask([], 'active');
        const scrumMaster = createMockActor(['scrum:master']);
        const context: ValidationContext = {
          task,
          actor: scrumMaster,
          transitionTo: 'done'
        };

        // Scrum Master can approve demos (active → done)
        const rule = await scrumAdapter.getTransitionRule('active', 'done', context);
        expect(rule).toBeDefined();
        expect(rule?.conditions?.signatures?.['__default__']?.capability_roles).toContain('scrum:master');

        // Validate scrum master signature
        const signature = {
          keyId: scrumMaster.id,
          role: 'scrum_master',
          notes: '',
          signature: 'mock-signature',
          timestamp: Date.now()
        };
        const signatureResult = await scrumAdapter.validateSignature(signature, context);
        expect(signatureResult).toBe(true);
      });

      it('[EARS-68] should handle developer workflow with scrum methodology', async () => {
        const task = createMockTask(['sprint:current'], 'ready');
        const developer = createMockActor(['scrum:developer']);
        const context: ValidationContext = {
          task,
          actor: developer,
          feedbacks: [{
            id: 'fb-assign',
            entityId: task.id,
            entityType: 'task',
            type: 'assignment',
            status: 'resolved',
            content: 'Assigned to developer',
            assignee: developer.id
          } as FeedbackRecord]
        };

        // Developer can be assigned tasks
        const customRuleResult = await scrumAdapter.validateCustomRules(['task_assigned_to_team_member'], context);
        expect(customRuleResult).toBe(true);
      });

      it('[EARS-68A] should handle task pause transition with scrum methodology', async () => {
        const task = createMockTask(['sprint:current'], 'active');
        const context: ValidationContext = { task, transitionTo: 'paused' };

        // Task can be paused from active state
        const rule = await scrumAdapter.getTransitionRule('active', 'paused', context);
        expect(rule).toBeDefined();
        expect(rule?.to).toBe('paused');
        expect(rule?.conditions?.event).toBe('feedback_blocking_created');
      });

      it('[EARS-68B] should handle task resume transition with scrum methodology', async () => {
        const task = createMockTask(['sprint:current'], 'paused');
        const context: ValidationContext = { task, transitionTo: 'active' };

        // Task can be resumed from paused to active
        const rule = await scrumAdapter.getTransitionRule('paused', 'active', context);
        expect(rule).toBeDefined();
        expect(rule?.to).toBe('active');
        expect(rule?.conditions?.event).toBe('sprint_started');
        expect(rule?.conditions?.custom_rules).toContain('task_assigned_to_team_member');
      });
    });

    describe('Scrum Custom Rules Validation', () => {
      it('[EARS-69] should validate sprint capacity rule with scrum methodology', async () => {
        const taskInSprint = createMockTask(['sprint:current'], 'review');
        taskInSprint.cycleIds = ['1752274500-cycle-sprint-current'];
        const context: ValidationContext = {
          task: taskInSprint,
          cycles: [{
            id: '1752274500-cycle-sprint-current',
            status: 'active'
          } as CycleRecord]
        };

        const result = await scrumAdapter.validateCustomRules(['task_fits_in_sprint_capacity'], context);
        expect(result).toBe(true);
      });

      it('[EARS-70] should validate team assignment rule with scrum methodology', async () => {
        const task = createMockTask([], 'ready');
        const developer = createMockActor(['scrum:developer']);
        const context: ValidationContext = {
          task,
          actor: developer,
          feedbacks: [{
            id: 'fb-assign',
            entityId: task.id,
            entityType: 'task',
            type: 'assignment',
            status: 'resolved',
            content: 'Assigned to team member',
            assignee: developer.id
          } as FeedbackRecord]
        };

        const result = await scrumAdapter.validateCustomRules(['task_assigned_to_team_member'], context);
        expect(result).toBe(true);
      });
    });

    describe('Scrum View Configs Integration', () => {
      it('[EARS-71] should render scrum-board view with real sprint data', async () => {
        const viewConfig = await scrumAdapter.getViewConfig('scrum-board');

        expect(viewConfig).toBeDefined();
        expect(viewConfig?.columns).toBeDefined();
        expect(viewConfig?.columns['Product Backlog']).toEqual(['draft']);
        expect(viewConfig?.columns['Sprint Backlog']).toEqual(['review', 'ready']);
        expect(viewConfig?.columns['In Progress']).toEqual(['active']);
        expect(viewConfig?.columns['Done']).toEqual(['done']);
        expect(viewConfig?.columns['Retrospective']).toEqual(['archived']);
      });

      it('[EARS-72] should render product-owner view with backlog data', async () => {
        const viewConfig = await scrumAdapter.getViewConfig('scrum-product-owner');

        expect(viewConfig).toBeDefined();
        expect(viewConfig?.columns['Backlog Items']).toEqual(['draft']);
        expect(viewConfig?.columns['Ready for Sprint']).toEqual(['review']);
        expect(viewConfig?.columns['Sprint Committed']).toEqual(['ready']);
        expect(viewConfig?.theme).toBe('minimal');
        expect(viewConfig?.layout).toBe('grid');
      });

      it('[EARS-73] should render developer view with assigned tasks', async () => {
        const viewConfig = await scrumAdapter.getViewConfig('scrum-developer');

        expect(viewConfig).toBeDefined();
        expect(viewConfig?.columns['To Do']).toEqual(['ready']);
        expect(viewConfig?.columns['In Progress']).toEqual(['active']);
        expect(viewConfig?.columns['Code Review']).toEqual(['done']);
        expect(viewConfig?.columns['Done']).toEqual(['archived']);
        expect(viewConfig?.columns['Blocked']).toEqual(['paused']);
        expect(viewConfig?.theme).toBe('dark');
        expect(viewConfig?.layout).toBe('horizontal');
      });

      it('[EARS-74] should render scrum-master dashboard with impediments', async () => {
        const viewConfig = await scrumAdapter.getViewConfig('scrum-master-dashboard');

        expect(viewConfig).toBeDefined();
        expect(viewConfig?.columns['Sprint Planning']).toEqual(['draft', 'review']);
        expect(viewConfig?.columns['Active Sprint']).toEqual(['ready', 'active']);
        expect(viewConfig?.columns['Sprint Review']).toEqual(['done']);
        expect(viewConfig?.columns['Retrospective']).toEqual(['archived']);
        expect(viewConfig?.columns['Impediments']).toEqual(['paused', 'discarded']);
        expect(viewConfig?.theme).toBe('corporate');
        expect(viewConfig?.layout).toBe('grid');
      });
    });
  });
});
