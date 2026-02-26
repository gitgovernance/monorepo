import {
  isWorkflowConfig,
  validateWorkflowConfigDetailed,
  validateWorkflowConfigBusinessRules
} from './workflow_validator';
import type { WorkflowRecord } from '../record_types';

describe('WorkflowValidator Module', () => {
  const validWorkflowConfig: WorkflowRecord = {
    id: '1234567890-workflow-default-methodology',
    name: 'GitGovernance Default Methodology',
    description: 'Standard GitGovernance workflow with quality gates',
    state_transitions: {
      submit: {
        from: ['draft'],
        to: 'review',
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
      approve: {
        from: ['review'],
        to: 'ready',
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
      }
    },
    custom_rules: {
      'task_must_have_valid_assignment_for_executor': {
        description: 'Task must have valid assignment',
        validation: 'assignment_required'
      }
    }
  };

  const invalidConfigWithoutId = {
    name: 'Test Methodology',
    state_transitions: {}
    // Missing required 'id' field
  };

  describe('isWorkflowConfig', () => {
    it('[EARS-1] should return true for valid workflow methodology config', () => {
      const result = isWorkflowConfig(validWorkflowConfig);
      expect(result).toBe(true);
    });

    it('[EARS-2] should return false for invalid workflow methodology config', () => {
      const result = isWorkflowConfig(invalidConfigWithoutId);
      expect(result).toBe(false);
    });

    it('[EARS-3] should return false for null input', () => {
      const result = isWorkflowConfig(null);
      expect(result).toBe(false);
    });

    it('[EARS-4] should return false for undefined input', () => {
      const result = isWorkflowConfig(undefined);
      expect(result).toBe(false);
    });

    it('[EARS-5] should return false for non-object input', () => {
      const result = isWorkflowConfig('not an object');
      expect(result).toBe(false);
    });
  });

  describe('Schema Cache Integration', () => {
    it('[EARS-7] should use schema cache for validation performance', () => {
      const { SchemaValidationCache } = require('../record_schemas/schema_cache');
      const cacheSpy = jest.spyOn(SchemaValidationCache, 'getValidatorFromSchema');

      validateWorkflowConfigDetailed(validWorkflowConfig);

      expect(cacheSpy).toHaveBeenCalled();
      cacheSpy.mockRestore();
    });

    it('[EARS-8] should reuse compiled validators from cache', () => {
      const { SchemaValidationCache } = require('../record_schemas/schema_cache');
      const cacheSpy = jest.spyOn(SchemaValidationCache, 'getValidatorFromSchema');

      // First call
      validateWorkflowConfigDetailed(validWorkflowConfig);
      const firstCallResult = cacheSpy.mock.results[0];

      // Second call should reuse the same validator
      validateWorkflowConfigDetailed({ ...validWorkflowConfig, name: 'Another Methodology' });
      const secondCallResult = cacheSpy.mock.results[1];

      expect(cacheSpy).toHaveBeenCalledTimes(2);
      // Both calls should return the same cached validator
      expect(firstCallResult?.value).toBe(secondCallResult?.value);
      cacheSpy.mockRestore();
    });

    it('[EARS-9] should produce identical results with or without cache', () => {
      const result1 = validateWorkflowConfigDetailed(validWorkflowConfig);
      const result2 = validateWorkflowConfigDetailed(validWorkflowConfig);
      expect(result1).toEqual(result2);
    });

    it('[EARS-10] should support cache clearing', () => {
      const { SchemaValidationCache } = require('../record_schemas/schema_cache');
      expect(() => SchemaValidationCache.clearCache()).not.toThrow();
    });

    it('[EARS-11] should provide cache statistics', () => {
      const { SchemaValidationCache } = require('../record_schemas/schema_cache');
      const stats = SchemaValidationCache.getCacheStats();
      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('cachedSchemas');
    });
  });

  describe('validateWorkflowConfigDetailed', () => {
    it('[EARS-6] should return valid result for correct config', () => {
      const result = validateWorkflowConfigDetailed(validWorkflowConfig);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-7] should return detailed errors for missing required fields', () => {
      const result = validateWorkflowConfigDetailed(invalidConfigWithoutId);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual(
        expect.objectContaining({
          field: expect.stringMatching(/(id|required)/),
          message: expect.stringContaining('id')
        })
      );
      expect(result.errors[0]).toHaveProperty('value');
    });

    it('[EARS-8] should return detailed errors for invalid state transitions', () => {
      const configWithInvalidFrom = {
        id: '1234567890-workflow-test',
        name: 'Test Methodology',
        state_transitions: {
          review: {
            from: ['INVALID_STATE'],
            to: 'review',
            requires: {}
          }
        }
      };

      const result = validateWorkflowConfigDetailed(configWithInvalidFrom);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toHaveProperty('field');
      expect(result.errors[0]).toHaveProperty('message');
      expect(result.errors[0]).toHaveProperty('value');
    });

    it('[EARS-9] should return detailed errors for missing state_transitions', () => {
      const configWithoutTransitions = {
        id: '1234567890-workflow-test',
        name: 'Test Methodology'
        // Missing required state_transitions
      };

      const result = validateWorkflowConfigDetailed(configWithoutTransitions);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual(
        expect.objectContaining({
          field: expect.stringMatching(/(state_transitions|required)/),
          message: expect.stringContaining('state_transitions')
        })
      );
    });

    it('[EARS-10] should validate complex config with all optional fields', () => {
      const complexConfig = {
        ...validWorkflowConfig,
        custom_rules: {
          'complex_rule': {
            description: 'Complex validation rule',
            validation: 'custom',
            parameters: {
              threshold: 5,
              enabled: true
            }
          }
        }
      };

      const result = validateWorkflowConfigDetailed(complexConfig);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-16] should return all errors when multiple fields are invalid', () => {
      const configWithMultipleErrors = {
        // Missing id AND state_transitions — 2 required fields absent
        name: 'Broken Methodology'
      };

      const result = validateWorkflowConfigDetailed(configWithMultipleErrors);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('validateWorkflowConfigBusinessRules', () => {
    it('[EARS-11] should validate business rules for valid config', () => {
      const result = validateWorkflowConfigBusinessRules(validWorkflowConfig);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('[EARS-12] should detect invalid target states in transitions', () => {
      const configWithInvalidState = {
        ...validWorkflowConfig,
        state_transitions: {
          invalid_state: {
            from: ['draft'] as ['draft'],
            to: 'invalid_state',
            requires: {}
          }
        }
      } as any; // Use any to test validation behavior

      const result = validateWorkflowConfigBusinessRules(configWithInvalidState);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0]?.field).toContain('state_transitions.invalid_state.to');
      expect(result.errors?.[0]?.message).toContain('Invalid target state: invalid_state');
    });

    it('[EARS-13] should detect invalid source states in transitions', () => {
      const configWithInvalidFromState = {
        ...validWorkflowConfig,
        state_transitions: {
          review: {
            from: ['invalid_from_state'] as ['invalid_from_state'],
            to: 'review',
            requires: {}
          }
        }
      } as any; // Use any to test validation behavior

      const result = validateWorkflowConfigBusinessRules(configWithInvalidFromState);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0]?.message).toContain('Invalid source state: invalid_from_state');
    });

    it('[EARS-14] should detect undefined custom rules in transitions', () => {
      const configWithUndefinedCustomRule = {
        ...validWorkflowConfig,
        state_transitions: {
          activate: {
            from: ['ready'] as ['ready'],
            to: 'active',
            requires: {
              custom_rules: ['undefined_rule']
            }
          }
        }
      } as any; // Use any to test validation behavior

      const result = validateWorkflowConfigBusinessRules(configWithUndefinedCustomRule);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0]?.message).toContain('Custom rule \'undefined_rule\' not defined');
    });

    it('[EARS-15] should detect invalid validation types in custom rules', () => {
      const configWithInvalidValidationType = {
        ...validWorkflowConfig,
        custom_rules: {
          'bad_rule': {
            description: 'Rule with invalid validation type',
            validation: 'invalid_validation_type' as 'assignment_required'
          }
        }
      };

      const result = validateWorkflowConfigBusinessRules(configWithInvalidValidationType);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0]?.message).toContain('Invalid validation type: invalid_validation_type');
    });

    it('[EARS-16] should validate config with no custom rules', () => {
      const configWithoutCustomRules = {
        id: '1234567890-workflow-simple',
        name: 'Simple Methodology',
        state_transitions: {
          submit: {
            from: ['draft'] as ['draft'],
            to: 'review',
            requires: {
              command: 'gitgov task submit'
            }
          }
        }
      } as any; // Use any to test validation behavior

      const result = validateWorkflowConfigBusinessRules(configWithoutCustomRules);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });
});
