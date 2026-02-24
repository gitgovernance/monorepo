import { SchemaValidationCache } from './schema_cache';
import { Schemas } from './index';

describe('SchemaValidationCache', () => {

  beforeEach(() => {
    // Clear cache before each test
    SchemaValidationCache.clearCache();
  });

  afterEach(() => {
    // Clean up after tests
    SchemaValidationCache.clearCache();
  });

  // Schema Access API Tests (EARS 1-6)
  describe('Schema Access API', () => {
    it('[EARS-1] should return JSON schema for valid schema name', () => {
      // Test with Schemas object (direct access)
      expect(Schemas.ActorRecord).toBeDefined();
      expect(Schemas.ActorRecord.$schema).toBe('http://json-schema.org/draft-07/schema#');
      expect(Schemas.ActorRecord.type).toBe('object');

      expect(Schemas.ExecutionRecord).toBeDefined();
      expect(Schemas.ExecutionRecord.$schema).toBe('http://json-schema.org/draft-07/schema#');
      expect(Schemas.ExecutionRecord.type).toBe('object');
    });

    it('[EARS-2] should handle invalid schema access gracefully', () => {
      // TypeScript prevents invalid access at compile time
      // This test verifies runtime behavior for dynamic access
      const invalidSchemaName = 'NonExistentSchema' as keyof typeof Schemas;
      expect((Schemas as any)[invalidSchemaName]).toBeUndefined();
    });

    it('[EARS-3] should provide access to all available schema names', () => {
      const schemaNames = Object.keys(Schemas);

      // Verify all expected schemas are present
      expect(schemaNames).toContain('ActorRecord');
      expect(schemaNames).toContain('AgentRecord');
      expect(schemaNames).toContain('TaskRecord');
      expect(schemaNames).toContain('ExecutionRecord');
      expect(schemaNames).toContain('ChangelogRecord');
      expect(schemaNames).toContain('FeedbackRecord');
      expect(schemaNames).toContain('CycleRecord');
      expect(schemaNames).toContain('WorkflowRecord');
      expect(schemaNames).toContain('EmbeddedMetadata');

      // Verify minimum number of schemas
      expect(schemaNames.length).toBeGreaterThanOrEqual(9);
    });

    it('[EARS-4] should verify schema existence with type safety', () => {
      // Verify schemas exist and are objects
      expect(typeof Schemas.ActorRecord).toBe('object');
      expect(typeof Schemas.AgentRecord).toBe('object');
      expect(typeof Schemas.TaskRecord).toBe('object');
      expect(typeof Schemas.ExecutionRecord).toBe('object');

      // Verify each schema has required JSON Schema properties
      expect(Schemas.ActorRecord).toHaveProperty('$schema');
      expect(Schemas.ActorRecord).toHaveProperty('type');
      expect(Schemas.ActorRecord).toHaveProperty('properties');
    });

    it('[EARS-5] should return false for non-existent schema names', () => {
      // Test dynamic access for non-existent schemas
      const nonExistentSchemas = ['InvalidSchema', 'FakeRecord', 'NotARealSchema'];

      nonExistentSchemas.forEach(name => {
        expect((Schemas as any)[name]).toBeUndefined();
      });
    });

    it('[EARS-6] should provide direct access to all schemas as JSON objects', () => {
      // Verify Schemas object provides direct access
      expect(Schemas).toBeDefined();
      expect(typeof Schemas).toBe('object');

      // Verify each schema is a valid JSON Schema object
      const schemaKeys = Object.keys(Schemas);
      schemaKeys.forEach(key => {
        const schema = (Schemas as any)[key];
        expect(schema).toBeDefined();
        expect(typeof schema).toBe('object');
        expect(schema.$schema).toBeDefined();
      });
    });
  });

  // Schema Validation Cache Tests (EARS 7-11)
  describe('Schema Validation Cache', () => {
    it('[EARS-7] should cache validators and avoid recompilation', () => {
      // First call should compile and cache
      const validator1 = SchemaValidationCache.getValidatorFromSchema(Schemas.ActorRecord);
      expect(validator1).toBeDefined();
      expect(typeof validator1).toBe('function');

      // Second call should return cached validator (same reference)
      const validator2 = SchemaValidationCache.getValidatorFromSchema(Schemas.ActorRecord);
      expect(validator2).toBe(validator1); // Same reference = cached
    });

    it('[EARS-8] should handle multiple different schemas', () => {
      const actorValidator = SchemaValidationCache.getValidatorFromSchema(Schemas.ActorRecord);
      const agentValidator = SchemaValidationCache.getValidatorFromSchema(Schemas.AgentRecord);

      expect(actorValidator).toBeDefined();
      expect(agentValidator).toBeDefined();
      expect(actorValidator).not.toBe(agentValidator); // Different validators

      // Verify cache maintains separate validators
      const stats = SchemaValidationCache.getCacheStats();
      expect(stats.cachedSchemas).toBe(2);
    });

    it('[EARS-9] should validate all record types correctly using cached validators', () => {
      const testCases = [
        {
          schema: Schemas.ActorRecord,
          valid: {
            id: 'human:test-user',
            type: 'human',
            displayName: 'Test User',
            publicKey: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF==',
            roles: ['developer:backend']
          },
          invalid: { id: 'invalid' }
        },
        {
          schema: Schemas.AgentRecord,
          valid: {
            id: 'agent:test-agent',
            engine: { type: 'api', url: 'https://api.example.com/agent' },
            status: 'active',
            triggers: []
          },
          invalid: { id: 'invalid' }
        },
        {
          schema: Schemas.TaskRecord,
          valid: {
            id: '1234567890-task-test-implementation',
            title: 'Test Implementation Task',
            status: 'draft',
            priority: 'medium',
            description: 'This is a test task for integration testing purposes.',
            tags: ['test', 'integration']
          },
          invalid: { id: 'invalid' }
        },
        {
          schema: Schemas.ExecutionRecord,
          valid: {
            id: '1234567890-exec-test-execution',
            taskId: '1234567890-task-test-implementation',
            type: 'progress',
            title: 'Test Execution',
            result: 'Test execution completed successfully with all requirements met.'
          },
          invalid: { id: 'invalid' }
        },
        {
          schema: Schemas.ChangelogRecord,
          valid: {
            id: '1234567890-changelog-test-entry',
            title: 'Task Completion',
            description: 'Successfully completed task implementation with all requirements',
            relatedTasks: ['1234567890-task-test-implementation'],
            completedAt: 1234567890,
            version: 'v1.0.0'
          },
          invalid: { id: 'invalid' }
        },
        {
          schema: Schemas.FeedbackRecord,
          valid: {
            id: '1234567890-feedback-test-comment',
            entityType: 'task',
            entityId: '1234567890-task-test-implementation',
            type: 'suggestion',
            status: 'open',
            content: 'This is a test feedback comment for integration testing.'
          },
          invalid: { id: 'invalid' }
        },
        {
          schema: Schemas.CycleRecord,
          valid: {
            id: '1234567890-cycle-test-sprint',
            status: 'active',
            title: 'Test Sprint Cycle',
            taskIds: []
          },
          invalid: { id: 'invalid' }
        },
        {
          schema: Schemas.WorkflowRecord,
          valid: {
            id: '1234567890-workflow-test-workflow',
            name: 'Test Workflow',
            state_transitions: {
              'submit': {
                from: ['draft'],
                to: 'ready',
                requires: { command: 'gitgov task submit' }
              }
            }
          },
          invalid: { id: 'invalid' }
        }
      ];

      testCases.forEach(({ schema, valid, invalid }) => {
        const validator = SchemaValidationCache.getValidatorFromSchema(schema);
        expect(validator(valid)).toBe(true);
        expect(validator(invalid)).toBe(false);
      });
    });

    // NOTE: EmbeddedMetadata test skipped due to unresolved $ref dependencies
    // This will be handled when we create embedded_metadata_validator.ts

    it('[EARS-10] should clear cache completely', () => {
      // Load some validators
      SchemaValidationCache.getValidatorFromSchema(Schemas.ActorRecord);
      SchemaValidationCache.getValidatorFromSchema(Schemas.AgentRecord);

      expect(SchemaValidationCache.getCacheStats().cachedSchemas).toBe(2);

      // Clear cache
      SchemaValidationCache.clearCache();

      const stats = SchemaValidationCache.getCacheStats();
      expect(stats.cachedSchemas).toBe(0);
    });

    it('[EARS-11] should return accurate cache statistics', () => {
      // Initial state: empty cache
      let stats = SchemaValidationCache.getCacheStats();
      expect(stats.cachedSchemas).toBe(0);

      // Load 3 validators
      SchemaValidationCache.getValidatorFromSchema(Schemas.ActorRecord);
      SchemaValidationCache.getValidatorFromSchema(Schemas.TaskRecord);
      SchemaValidationCache.getValidatorFromSchema(Schemas.ExecutionRecord);

      // Verify stats reflect all 3 cached schemas
      stats = SchemaValidationCache.getCacheStats();
      expect(stats.cachedSchemas).toBe(3);

      // Load same schema again - should not increase count
      SchemaValidationCache.getValidatorFromSchema(Schemas.ActorRecord);
      stats = SchemaValidationCache.getCacheStats();
      expect(stats.cachedSchemas).toBe(3); // Still 3, not 4
    });
  });
});
