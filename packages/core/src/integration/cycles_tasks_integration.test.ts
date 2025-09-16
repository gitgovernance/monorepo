import type { TaskRecord } from '../types/task_record';
import type { CycleRecord } from '../types/cycle_record';
import { createTaskRecord } from '../factories/task_factory';
import { createCycleRecord } from '../factories/cycle_factory';
import { validateTaskRecordDetailed } from '../validation/task_validator';
import { validateCycleRecordDetailed } from '../validation/cycle_validator';

describe('Cycles ↔ Tasks Integration', () => {
  describe('Bidirectional Relationship Validation', () => {
    it('[EARS-1] should create valid cycle with taskIds referencing existing tasks', async () => {
      // Create tasks first
      const task1 = await createTaskRecord({
        title: 'Implement Authentication',
        description: 'Create user authentication system with JWT tokens',
        priority: 'high',
        tags: ['skill:typescript', 'area:backend']
      });

      const task2 = await createTaskRecord({
        title: 'Create Login UI',
        description: 'Build login form with React components',
        priority: 'medium',
        tags: ['skill:react', 'area:frontend']
      });

      // Create cycle referencing the tasks
      const cycle = await createCycleRecord({
        title: 'Authentication Sprint',
        status: 'planning',
        taskIds: [task1.id, task2.id],
        tags: ['sprint:q4', 'epic:auth']
      });

      // Verify cycle structure
      expect(cycle.taskIds).toContain(task1.id);
      expect(cycle.taskIds).toContain(task2.id);
      expect(cycle.taskIds).toHaveLength(2);
      expect(cycle.status).toBe('planning');
    });

    it('[EARS-2] should create valid tasks with cycleIds referencing existing cycles', async () => {
      // Create cycle first
      const cycle = await createCycleRecord({
        title: 'API Performance Sprint',
        status: 'active',
        tags: ['sprint:q4', 'team:backend']
      });

      // Create tasks referencing the cycle
      const task1 = await createTaskRecord({
        title: 'Optimize Database Queries',
        description: 'Improve query performance for user endpoints',
        priority: 'high',
        cycleIds: [cycle.id],
        tags: ['skill:sql', 'area:database']
      });

      const task2 = await createTaskRecord({
        title: 'Add Redis Caching',
        description: 'Implement caching layer for frequently accessed data',
        priority: 'medium',
        cycleIds: [cycle.id],
        tags: ['skill:redis', 'area:backend']
      });

      // Verify task structure
      expect(task1.cycleIds).toContain(cycle.id);
      expect(task2.cycleIds).toContain(cycle.id);
      expect(task1.cycleIds).toHaveLength(1);
      expect(task2.cycleIds).toHaveLength(1);
    });

    it('[EARS-3] should support tasks belonging to multiple cycles', async () => {
      // Create multiple cycles
      const sprintCycle = await createCycleRecord({
        title: 'Sprint Q4 2024',
        status: 'active',
        tags: ['sprint:q4-2024']
      });

      const epicCycle = await createCycleRecord({
        title: 'User Management Epic',
        status: 'planning',
        tags: ['epic:user-mgmt']
      });

      // Create task that belongs to both cycles
      const sharedTask = await createTaskRecord({
        title: 'Implement User Roles',
        description: 'Create role-based access control system',
        priority: 'critical',
        cycleIds: [sprintCycle.id, epicCycle.id],
        tags: ['skill:typescript', 'area:auth']
      });

      // Verify multi-cycle relationship
      expect(sharedTask.cycleIds).toContain(sprintCycle.id);
      expect(sharedTask.cycleIds).toContain(epicCycle.id);
      expect(sharedTask.cycleIds).toHaveLength(2);
    });

    it('[EARS-4] should support cycles with child cycles (hierarchy)', async () => {
      // Create parent cycle (epic)
      const parentCycle = await createCycleRecord({
        title: 'Q4 Platform Overhaul',
        status: 'planning',
        tags: ['epic:platform', 'quarter:q4']
      });

      // Create child cycles (phases)
      const phase1Cycle = await createCycleRecord({
        title: 'Phase 1: Core Infrastructure',
        status: 'active',
        tags: ['phase:1', 'area:infrastructure']
      });

      const phase2Cycle = await createCycleRecord({
        title: 'Phase 2: User Experience',
        status: 'planning',
        tags: ['phase:2', 'area:frontend']
      });

      // Update parent cycle with child cycles
      const parentWithChildren = await createCycleRecord({
        ...parentCycle,
        childCycleIds: [phase1Cycle.id, phase2Cycle.id]
      });

      // Verify hierarchical structure
      expect(parentWithChildren.childCycleIds).toContain(phase1Cycle.id);
      expect(parentWithChildren.childCycleIds).toContain(phase2Cycle.id);
      expect(parentWithChildren.childCycleIds).toHaveLength(2);
    });
  });

  describe('Protocol Compliance Validation', () => {
    it('[EARS-5] should validate TaskRecord ID format according to task_protocol', async () => {
      const task = await createTaskRecord({
        title: 'Test Task for ID Validation',
        description: 'Testing that task IDs follow the protocol format',
        priority: 'low',
        tags: ['test']
      });

      // Verify ID follows timestamp-task-slug pattern
      expect(task.id).toMatch(/^\d{10}-task-[a-z0-9-]+$/);

      // Verify validation passes
      const validation = validateTaskRecordDetailed(task);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('[EARS-6] should validate CycleRecord ID format according to cycle_protocol', async () => {
      const cycle = await createCycleRecord({
        title: 'Test Cycle for ID Validation',
        status: 'planning',
        tags: ['test']
      });

      // Verify ID follows timestamp-cycle-slug pattern
      expect(cycle.id).toMatch(/^\d{10}-cycle-[a-z0-9-]+$/);

      // Verify validation passes
      const validation = validateCycleRecordDetailed(cycle);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('[EARS-7] should validate task status follows canonical states from task_protocol', async () => {
      const validStatuses: TaskRecord['status'][] = ['draft', 'review', 'ready', 'active', 'done', 'archived', 'paused', 'discarded'];

      for (const status of validStatuses) {
        const task = await createTaskRecord({
          title: `Task with ${status} status`,
          description: `Testing task with ${status} status according to protocol`,
          status,
          priority: 'medium',
          tags: ['test']
        });

        expect(task.status).toBe(status);

        const validation = validateTaskRecordDetailed(task);
        expect(validation.isValid).toBe(true);
      }
    });

    it('[EARS-8] should validate cycle status follows canonical states from cycle_protocol', async () => {
      const validStatuses: CycleRecord['status'][] = ['planning', 'active', 'completed', 'archived'];

      for (const status of validStatuses) {
        const cycle = await createCycleRecord({
          title: `Cycle with ${status} status`,
          status,
          tags: ['test']
        });

        expect(cycle.status).toBe(status);

        const validation = validateCycleRecordDetailed(cycle);
        expect(validation.isValid).toBe(true);
      }
    });
  });

  describe('Epic Promotion Workflow Validation', () => {
    it('[EARS-9] should support epic task promotion pattern from task_protocol_appendix', async () => {
      // Create original epic task
      const epicTask = await createTaskRecord({
        title: 'Implement Complete User Management System',
        description: 'Build comprehensive user management with authentication, authorization, and profile management',
        priority: 'critical',
        tags: ['epic:user-management', 'complexity:high']
      });

      // Verify epic task structure
      expect(epicTask.tags).toContain('epic:user-management');
      expect(epicTask.priority).toBe('critical');

      // Create cycle to contain the epic breakdown
      const epicCycle = await createCycleRecord({
        title: 'User Management Epic Implementation',
        status: 'planning',
        taskIds: [epicTask.id], // Epic task is referenced in cycle
        tags: ['epic:user-management', 'derived-from:' + epicTask.id]
      });

      // Create atomic tasks derived from the epic
      const atomicTask1 = await createTaskRecord({
        title: 'Implement User Authentication',
        description: 'Create JWT-based authentication system',
        priority: 'high',
        cycleIds: [epicCycle.id],
        tags: ['derived-from:' + epicTask.id, 'skill:auth']
      });

      const atomicTask2 = await createTaskRecord({
        title: 'Implement User Authorization',
        description: 'Create role-based permission system',
        priority: 'high',
        cycleIds: [epicCycle.id], // Reference the cycle, not another task
        tags: ['derived-from:' + epicTask.id, 'skill:auth']
      });

      // Verify epic promotion structure
      expect(epicCycle.taskIds).toContain(epicTask.id);
      expect(atomicTask1.cycleIds).toContain(epicCycle.id);
      expect(atomicTask1.tags.some(tag => tag.startsWith('derived-from:'))).toBe(true);
      expect(atomicTask2.tags.some(tag => tag.startsWith('derived-from:'))).toBe(true);
    });
  });

  describe('Cross-Module Foundation Validation', () => {
    it('[EARS-10] should create complete task workflow using all modules', async () => {
      // Test the complete pipeline: factory → validator → crypto → store

      // 1. Factory creates valid task
      const task = await createTaskRecord({
        title: 'End-to-End Integration Test Task',
        description: 'This task tests the complete workflow across all modules',
        priority: 'medium',
        tags: ['integration', 'test', 'cross-module']
      });

      // 2. Validator confirms it's valid
      const validation = validateTaskRecordDetailed(task);
      expect(validation.isValid).toBe(true);

      // 3. Crypto can calculate checksum
      const { calculatePayloadChecksum } = require('../crypto/checksum');
      const checksum = calculatePayloadChecksum(task);
      expect(checksum).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex format

      // 4. Store can persist and retrieve (simulated)
      // Note: This would require actual RecordStore instance, 
      // but we're validating the data structure compatibility
      expect(task.id).toMatch(/^\d{10}-task-[a-z0-9-]+$/);
      expect(typeof task.id).toBe('string');
    });

    it('[EARS-11] should create complete cycle workflow using all modules', async () => {
      // Test the complete pipeline: factory → validator → crypto → store

      // 1. Factory creates valid cycle
      const cycle = await createCycleRecord({
        title: 'End-to-End Integration Test Cycle',
        status: 'planning',
        tags: ['integration', 'test', 'cross-module']
      });

      // 2. Validator confirms it's valid
      const validation = validateCycleRecordDetailed(cycle);
      expect(validation.isValid).toBe(true);

      // 3. Crypto can calculate checksum
      const { calculatePayloadChecksum } = require('../crypto/checksum');
      const checksum = calculatePayloadChecksum(cycle);
      expect(checksum).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex format

      // 4. Store compatibility validation
      expect(cycle.id).toMatch(/^\d{10}-cycle-[a-z0-9-]+$/);
      expect(typeof cycle.id).toBe('string');
    });
  });
});
