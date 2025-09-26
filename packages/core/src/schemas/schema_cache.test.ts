import { SchemaValidationCache } from './schema_cache';
import { Schemas } from './index';
import type { ActorRecord } from '../types';
import type { AgentRecord } from '../types';
import type { TaskRecord } from '../types';
import type { ExecutionRecord } from '../types';
import type { ChangelogRecord } from '../types';
import type { FeedbackRecord } from '../types';
import type { CycleRecord } from '../types';
import type { WorkflowMethodologyRecord } from '../types';

describe('SchemaValidationCache', () => {

  beforeEach(() => {
    // Clear cache before each test
    SchemaValidationCache.clearCache();
  });

  afterEach(() => {
    // Clean up after tests
    SchemaValidationCache.clearCache();
  });

  it('[EARS-1] should cache validators and avoid recompilation', () => {
    // First call should compile and cache
    const validator1 = SchemaValidationCache.getValidatorFromSchema(Schemas.ActorRecord);
    expect(validator1).toBeDefined();
    expect(typeof validator1).toBe('function');

    // Second call should return cached validator (same reference)
    const validator2 = SchemaValidationCache.getValidatorFromSchema(Schemas.ActorRecord);
    expect(validator2).toBe(validator1); // Same reference = cached
  });

  it('[EARS-2] should handle multiple different schemas', () => {
    const actorValidator = SchemaValidationCache.getValidatorFromSchema(Schemas.ActorRecord);
    const agentValidator = SchemaValidationCache.getValidatorFromSchema(Schemas.AgentRecord);

    expect(actorValidator).toBeDefined();
    expect(agentValidator).toBeDefined();
    expect(actorValidator).not.toBe(agentValidator); // Different validators

    // Note: getCacheStats() needs to be updated for schema objects
    const stats = SchemaValidationCache.getCacheStats();
    expect(stats.cachedSchemas).toBe(2);
  });

  it('[EARS-3] should validate ActorRecord correctly using cached validator', () => {
    const validator = SchemaValidationCache.getValidatorFromSchema<ActorRecord>(Schemas.ActorRecord);

    const validActor = {
      id: 'human:test-user',
      type: 'human',
      displayName: 'Test User',
      publicKey: 'test-public-key-base64',
      roles: ['developer:backend']
    };

    const invalidActor = { id: 'invalid' }; // Missing required fields

    expect(validator(validActor)).toBe(true);
    expect(validator(invalidActor)).toBe(false);
  });

  it('[EARS-4] should validate AgentRecord correctly using cached validator', () => {
    const validator = SchemaValidationCache.getValidatorFromSchema<AgentRecord>(Schemas.AgentRecord);

    const validAgent = {
      id: 'agent:test-agent',
      guild: 'design',
      engine: {
        type: 'api',
        model: 'gpt-4',
        version: '1.0.0'
      },
      status: 'active',
      triggers: []
    };

    const invalidAgent = { id: 'invalid' }; // Missing required fields

    expect(validator(validAgent)).toBe(true);
    expect(validator(invalidAgent)).toBe(false);
  });

  it('[EARS-6] should validate TaskRecord correctly using cached validator', () => {
    const validator = SchemaValidationCache.getValidatorFromSchema<TaskRecord>(Schemas.TaskRecord);

    const validTask = {
      id: '1234567890-task-test-implementation',
      title: 'Test Implementation Task',
      status: 'draft',
      priority: 'medium',
      description: 'This is a test task for integration testing purposes.',
      tags: ['test', 'integration']
    };

    const invalidTask = { id: 'invalid' }; // Missing required fields

    expect(validator(validTask)).toBe(true);
    expect(validator(invalidTask)).toBe(false);
  });

  it('[EARS-7] should validate ExecutionRecord correctly using cached validator', () => {
    const validator = SchemaValidationCache.getValidatorFromSchema<ExecutionRecord>(Schemas.ExecutionRecord);

    const validExecution = {
      id: '1234567890-exec-test-execution',
      taskId: '1234567890-task-test-implementation',
      result: 'Test execution completed successfully with all requirements met.'
    };

    const invalidExecution = { id: 'invalid' }; // Missing required fields

    expect(validator(validExecution)).toBe(true);
    expect(validator(invalidExecution)).toBe(false);
  });

  it('[EARS-8] should validate ChangelogRecord correctly using cached validator', () => {
    const validator = SchemaValidationCache.getValidatorFromSchema<ChangelogRecord>(Schemas.ChangelogRecord);

    const validChangelog = {
      id: '1234567890-changelog-test-entry',
      entityType: 'task',
      entityId: '1234567890-task-test-implementation',
      changeType: 'completion',
      title: 'Task Completion',
      description: 'Task status changed from draft to review',
      timestamp: 1234567890,
      trigger: 'manual',
      triggeredBy: 'human:test-user',
      reason: 'Task completed successfully',
      riskLevel: 'low'
    };

    const invalidChangelog = { id: 'invalid' }; // Missing required fields

    expect(validator(validChangelog)).toBe(true);
    expect(validator(invalidChangelog)).toBe(false);
  });

  it('[EARS-9] should validate FeedbackRecord correctly using cached validator', () => {
    const validator = SchemaValidationCache.getValidatorFromSchema<FeedbackRecord>(Schemas.FeedbackRecord);

    const validFeedback = {
      id: '1234567890-feedback-test-comment',
      entityType: 'task',
      entityId: '1234567890-task-test-implementation',
      type: 'suggestion',
      status: 'open',
      content: 'This is a test feedback comment for integration testing.'
    };

    const invalidFeedback = { id: 'invalid' }; // Missing required fields

    expect(validator(validFeedback)).toBe(true);
    expect(validator(invalidFeedback)).toBe(false);
  });

  it('[EARS-10] should validate CycleRecord correctly using cached validator', () => {
    const validator = SchemaValidationCache.getValidatorFromSchema<CycleRecord>(Schemas.CycleRecord);

    const validCycle = {
      id: '1234567890-cycle-test-sprint',
      status: 'active',
      title: 'Test Sprint Cycle',
      taskIds: []
    };

    const invalidCycle = { id: 'invalid' }; // Missing required fields

    expect(validator(validCycle)).toBe(true);
    expect(validator(invalidCycle)).toBe(false);
  });

  it('[EARS-11] should validate WorkflowMethodology correctly using cached validator', () => {
    const validator = SchemaValidationCache.getValidatorFromSchema<WorkflowMethodologyRecord>(Schemas.WorkflowMethodologyRecord);

    const validWorkflow = {
      version: '1.0.0',
      name: 'Test Workflow',
      state_transitions: {
        'draft': {
          from: ['draft'],
          requires: {
            command: 'gitgov task submit'
          }
        }
      }
    };

    const invalidWorkflow = { version: 'invalid' }; // Missing required fields

    expect(validator(validWorkflow)).toBe(true);
    expect(validator(invalidWorkflow)).toBe(false);
  });

  // NOTE: EmbeddedMetadata test skipped due to unresolved $ref dependencies
  // This will be handled when we create embedded_metadata_validator.ts

  it('[EARS-5] should clear cache completely', () => {
    // Load some validators
    SchemaValidationCache.getValidatorFromSchema(Schemas.ActorRecord);
    SchemaValidationCache.getValidatorFromSchema(Schemas.AgentRecord);

    expect(SchemaValidationCache.getCacheStats().cachedSchemas).toBe(2);

    // Clear cache
    SchemaValidationCache.clearCache();

    const stats = SchemaValidationCache.getCacheStats();
    expect(stats.cachedSchemas).toBe(0);
    expect(stats.schemasLoaded).toEqual([]);
  });
});
