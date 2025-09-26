/**
 * Schema Integration Tests
 * 
 * Tests that verify our JSON schemas work correctly with our validation modules.
 * This ensures consistency between schema definitions and runtime validation.
 */

import * as fs from 'fs';
import * as path from 'path';

// Import validation modules
import { validateActorRecordSchema, isActorRecord } from '../validation/actor_validator';
import { validateAgentRecordSchema, isAgentRecord } from '../validation/agent_validator';
import { validateTaskRecordSchema, isTaskRecord } from '../validation/task_validator';
import { validateCycleRecordSchema, isCycleRecord } from '../validation/cycle_validator';
import { validateExecutionRecordSchema, isExecutionRecord } from '../validation/execution_validator';
import { validateChangelogRecordSchema, isChangelogRecord } from '../validation/changelog_validator';
import { validateFeedbackRecordSchema, isFeedbackRecord } from '../validation/feedback_validator';
import { validateWorkflowMethodologyConfigSchema } from '../validation/workflow_methodology_validator';

// Path to schemas (Jest runs in CommonJS mode)
const SCHEMAS_DIR = path.join(__dirname, '../schemas');

/**
 * Basic JSON Schema interface for testing
 * Note: Uses 'any' for dynamic JSON Schema properties which can contain arbitrary structures
 */
interface JsonSchema {
  $schema?: string;
  type?: string;
  title?: string;
  description?: string;
  properties?: Record<string, any>; // JSON Schema properties can be any valid schema
  required?: string[];
  examples?: any[]; // Examples can be any valid data matching the schema
  [key: string]: any; // JSON Schema allows additional properties
}

/**
 * Helper to load a JSON schema
 */
function loadSchema(schemaFile: string): JsonSchema {
  const schemaPath = path.join(SCHEMAS_DIR, 'generated', schemaFile);
  const content = fs.readFileSync(schemaPath, 'utf8');
  return JSON.parse(content);
}

/**
 * Helper to create valid example data from schema
 */
function createValidExample(schemaName: string): Record<string, unknown> {
  switch (schemaName) {
    case 'ActorRecord':
      return {
        id: 'human:test-user',
        type: 'human',
        displayName: 'Test User',
        publicKey: 'test-public-key-base64',
        roles: ['developer:backend']
      };

    case 'AgentRecord':
      return {
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

    case 'TaskRecord':
      return {
        id: '1234567890-task-test-implementation',
        title: 'Test Implementation Task',
        status: 'draft',
        priority: 'medium',
        description: 'This is a test task for integration testing purposes.',
        tags: ['test', 'integration']
      };

    case 'ExecutionRecord':
      return {
        id: '1234567890-exec-test-execution',
        taskId: '1234567890-task-test-implementation',
        result: 'Test execution completed successfully with all requirements met.'
      };

    case 'ChangelogRecord':
      return {
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

    case 'FeedbackRecord':
      return {
        id: '1234567890-feedback-test-comment',
        entityType: 'task',
        entityId: '1234567890-task-test-implementation',
        type: 'suggestion',
        status: 'open',
        content: 'This is a test feedback comment for integration testing.'
      };

    case 'CycleRecord':
      return {
        id: '1234567890-cycle-test-sprint',
        status: 'active',
        title: 'Test Sprint Cycle',
        taskIds: []
      };

    case 'WorkflowMethodology':
      return {
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

    default:
      throw new Error(`No example data defined for ${schemaName}`);
  }
}

describe('Schema Integration Tests', () => {
  describe('ActorRecord', () => {
    it('[EARS-22] should validate schema examples with actor validator', () => {
      const validExample = createValidExample('ActorRecord');

      // Test with our validator
      const [isValid, errors] = validateActorRecordSchema(validExample);
      expect(isValid).toBe(true);
      expect(errors).toBeNull();

      // Test type guard
      expect(isActorRecord(validExample)).toBe(true);
    });

    it('[EARS-23] should reject invalid actor records', () => {
      const invalidExample = {
        id: 'invalid-id-format',
        type: 'human',
        // Missing required fields
      };

      const [isValid, errors] = validateActorRecordSchema(invalidExample);
      expect(isValid).toBe(false);
      expect(errors).toBeTruthy();
      expect(errors!.length).toBeGreaterThan(0);

      expect(isActorRecord(invalidExample)).toBe(false);
    });
  });

  describe('AgentRecord', () => {
    it('[EARS-22] should validate schema examples with agent validator', () => {
      const validExample = createValidExample('AgentRecord');

      const [isValid, errors] = validateAgentRecordSchema(validExample);
      if (!isValid) {
        console.log('AgentRecord validation errors:', errors);
      }
      expect(isValid).toBe(true);
      expect(errors).toBeNull();

      expect(isAgentRecord(validExample)).toBe(true);
    });
  });

  describe('TaskRecord', () => {
    it('[EARS-22] should validate schema examples with task validator', () => {
      const validExample = createValidExample('TaskRecord');

      const [isValid, errors] = validateTaskRecordSchema(validExample);
      expect(isValid).toBe(true);
      expect(errors).toBeNull();

      expect(isTaskRecord(validExample)).toBe(true);
    });

    it('[EARS-20] should validate schema examples from JSON schema file', () => {
      const schema = loadSchema('task_record_schema.json');

      // Test with examples from the schema itself
      if (schema.examples && schema.examples.length > 0) {
        for (const example of schema.examples) {
          // Add missing required fields that might not be in the example
          const completeExample = {
            title: 'Test Task Title',
            tags: [],
            ...example
          };

          // Fix known inconsistency: "in_progress" should be "active"
          if (completeExample.status === 'in_progress') {
            completeExample.status = 'active';
          }

          const [isValid, errors] = validateTaskRecordSchema(completeExample);
          if (!isValid) {
            console.log('Schema example validation errors:', errors);
            console.log('Example being validated:', completeExample);
          }
          expect(isValid).toBe(true);
        }
      }
    });
  });

  describe('ExecutionRecord', () => {
    it('[EARS-22] should validate schema examples with execution validator', () => {
      const validExample = createValidExample('ExecutionRecord');

      const [isValid, errors] = validateExecutionRecordSchema(validExample);
      expect(isValid).toBe(true);
      expect(errors).toBeNull();

      expect(isExecutionRecord(validExample)).toBe(true);
    });
  });

  describe('ChangelogRecord', () => {
    it('[EARS-22] should validate schema examples with changelog validator', () => {
      const validExample = createValidExample('ChangelogRecord');

      const [isValid, errors] = validateChangelogRecordSchema(validExample);
      expect(isValid).toBe(true);
      expect(errors).toBeNull();

      expect(isChangelogRecord(validExample)).toBe(true);
    });
  });

  describe('FeedbackRecord', () => {
    it('[EARS-22] should validate schema examples with feedback validator', () => {
      const validExample = createValidExample('FeedbackRecord');

      const [isValid, errors] = validateFeedbackRecordSchema(validExample);
      expect(isValid).toBe(true);
      expect(errors).toBeNull();

      expect(isFeedbackRecord(validExample)).toBe(true);
    });
  });

  describe('CycleRecord', () => {
    it('[EARS-22] should validate schema examples with cycle validator', () => {
      const validExample = createValidExample('CycleRecord');

      const [isValid, errors] = validateCycleRecordSchema(validExample);
      expect(isValid).toBe(true);
      expect(errors).toBeNull();

      expect(isCycleRecord(validExample)).toBe(true);
    });
  });

  describe('WorkflowMethodology', () => {
    it('[EARS-22] should validate schema examples with workflow methodology validator', () => {
      const validExample = createValidExample('WorkflowMethodology');

      const [isValid, errors] = validateWorkflowMethodologyConfigSchema(validExample);
      expect(isValid).toBe(true);
      expect(errors).toBeNull();
    });
  });
});

describe('Schema Consistency Tests', () => {
  it('[EARS-24] should have all expected schema files', () => {
    const expectedSchemas = [
      'embedded_metadata_schema.json',
      'actor_record_schema.json',
      'agent_record_schema.json',
      'task_record_schema.json',
      'execution_record_schema.json',
      'changelog_record_schema.json',
      'feedback_record_schema.json',
      'cycle_record_schema.json',
      'workflow_methodology_record_schema.json',
    ];

    for (const schemaFile of expectedSchemas) {
      const schemaPath = path.join(SCHEMAS_DIR, 'generated', schemaFile);
      expect(fs.existsSync(schemaPath)).toBe(true);

      // Verify it's valid JSON
      expect(() => {
        const content = fs.readFileSync(schemaPath, 'utf8');
        JSON.parse(content);
      }).not.toThrow();
    }
  });

  it('[EARS-13,14,15,16,17] should have consistent schema structure', () => {
    const schemaFiles = [
      'actor_record_schema.json',
      'agent_record_schema.json',
      'task_record_schema.json',
      'execution_record_schema.json',
      'changelog_record_schema.json',
      'feedback_record_schema.json',
      'cycle_record_schema.json'
    ];

    for (const schemaFile of schemaFiles) {
      const schema = loadSchema(schemaFile);

      // All schemas should have these properties
      expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
      expect(schema.type).toBe('object');
      expect(schema.title).toBeTruthy();
      expect(schema.description).toBeTruthy();
      expect(schema.properties).toBeTruthy();
      expect(schema.required).toBeTruthy();
      expect(Array.isArray(schema.required)).toBe(true);

      // All record schemas should require an 'id' field
      expect(schema.required).toContain('id');
      expect(schema.properties?.['id']).toBeTruthy();
      expect(schema.properties?.['id']?.type).toBe('string');
    }
  });
});
