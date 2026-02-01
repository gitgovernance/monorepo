import {
  createWorkflowConfig,
  createDefaultWorkflowConfig
} from './workflow_factory';
import type { WorkflowRecord } from '../record_types';
import { DetailedValidationError } from '../validation/common';

// Manual mock for validateWorkflowConfigDetailed
jest.mock('../validation/workflow_validator', () => ({
  validateWorkflowConfigDetailed: jest.fn()
    .mockReturnValue({ isValid: true, errors: [] }),
  validateWorkflowConfigBusinessRules: jest.fn()
    .mockReturnValue({ isValid: true, errors: [] }),
}));

describe('createWorkflowConfig', () => {
  beforeEach(() => {
    // Reset mocks to default success state before each test
    const {
      validateWorkflowConfigDetailed,
      validateWorkflowConfigBusinessRules
    } = require('../validation/workflow_validator');

    (validateWorkflowConfigDetailed as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
    (validateWorkflowConfigBusinessRules as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
  });

  it('[EARS-1] should create a valid workflow methodology config with defaults', async () => {
    const payload: Partial<WorkflowRecord> = {
      name: 'Custom Test Methodology',
      state_transitions: {
        review: {
          from: ['draft'],
          requires: {
            command: 'gitgov task submit'
          }
        }
      }
    };

    const config = await createWorkflowConfig(payload);

    expect(config.version).toBe('1.0.0'); // Default version
    expect(config.name).toBe('Custom Test Methodology');
    expect(config.state_transitions).toBeDefined();
  });

  it('[EARS-2] should throw DetailedValidationError for invalid schema', async () => {
    const { validateWorkflowConfigDetailed } = require('../validation/workflow_validator');
    (validateWorkflowConfigDetailed as jest.Mock).mockReturnValue({
      isValid: false,
      errors: [
        { field: 'name', message: 'must be a non-empty string', value: '' },
        { field: 'state_transitions', message: 'is required', value: undefined }
      ]
    });

    const payload: Partial<WorkflowRecord> = {
      name: '',
      // Missing state_transitions
    };

    expect(() => createWorkflowConfig(payload)).toThrow(DetailedValidationError);
  });

  it('[EARS-3] should throw DetailedValidationError for business rule violations', () => {
    const { validateWorkflowConfigBusinessRules } = require('../validation/workflow_validator');
    (validateWorkflowConfigBusinessRules as jest.Mock).mockReturnValue({
      isValid: false,
      errors: [
        { field: 'state_transitions.invalid_state', message: 'Invalid target state: invalid_state', value: 'invalid_state' }
      ]
    });

    const payload: Partial<WorkflowRecord> = {
      name: 'Test Methodology',
      state_transitions: {
        invalid_state: {
          from: ['draft'],
          requires: {}
        }
      } as any
    };

    expect(() => createWorkflowConfig(payload)).toThrow(DetailedValidationError);
  });

  it('[EARS-4] should preserve all provided fields', async () => {
    const payload: Partial<WorkflowRecord> = {
      version: '2.0.0',
      name: 'Advanced Methodology',
      description: 'Advanced workflow with custom rules',
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
        }
      },
      custom_rules: {
        'custom_rule': {
          description: 'Custom validation rule',
          validation: 'custom'
        }
      }
    };

    const config = await createWorkflowConfig(payload);

    expect(config.version).toBe('2.0.0');
    expect(config.name).toBe('Advanced Methodology');
    expect(config.description).toBe('Advanced workflow with custom rules');
    expect(config.custom_rules).toEqual(payload.custom_rules);
  });

  it('[EARS-5] should create config with minimal required fields', async () => {
    const payload: Partial<WorkflowRecord> = {
      name: 'Minimal Methodology',
      state_transitions: {
        review: {
          from: ['draft'],
          requires: {
            command: 'gitgov task submit'
          }
        }
      }
    };

    const config = await createWorkflowConfig(payload);

    expect(config.name).toBe('Minimal Methodology');
    expect(config.version).toBe('1.0.0'); // Default
    expect(config.state_transitions).toEqual(payload.state_transitions);
  });

  it('[EARS-6] should handle empty payload with all defaults', async () => {
    const config = await createWorkflowConfig({});

    expect(config.version).toBe('1.0.0');
    expect(config.name).toBe('Custom Methodology');
    expect(config.state_transitions).toBeDefined();
  });

  it('[EARS-8] should validate and create complex methodology config', async () => {
    const complexPayload: Partial<WorkflowRecord> = {
      version: '1.5.0',
      name: 'Enterprise Methodology',
      description: 'Complex enterprise workflow with multiple approval gates',
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
            signatures: {
              'design': {
                role: 'approver',
                capability_roles: ['approver:design'],
                min_approvals: 1
              },
              'quality': {
                role: 'approver',
                capability_roles: ['approver:quality'],
                min_approvals: 2
              }
            },
            custom_rules: ['security_scan_required']
          }
        }
      },
      custom_rules: {
        'security_scan_required': {
          description: 'Security scan must pass before approval',
          validation: 'custom'
        }
      }
    };

    const config = await createWorkflowConfig(complexPayload);

    expect(config.version).toBe('1.5.0');
    expect(config.name).toBe('Enterprise Methodology');
    expect(config.description).toBe('Complex enterprise workflow with multiple approval gates');
    expect(config.state_transitions['ready']?.requires.signatures?.['quality']?.min_approvals).toBe(2);
    expect(config.custom_rules?.['security_scan_required']?.validation).toBe('custom');
  });
});

describe('createDefaultWorkflowConfig', () => {
  beforeEach(() => {
    // Reset mocks to default success state before each test
    const {
      validateWorkflowConfigDetailed,
      validateWorkflowConfigBusinessRules
    } = require('../validation/workflow_validator');

    (validateWorkflowConfigDetailed as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
    (validateWorkflowConfigBusinessRules as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
  });

  it('[EARS-9] should create default GitGovernance methodology config', async () => {
    const config = await createDefaultWorkflowConfig();

    expect(config.version).toBe('1.0.0');
    expect(config.name).toBe('GitGovernance Default Methodology');
    expect(config.description).toBe('Standard GitGovernance workflow with quality gates and agent collaboration');

    // Verify key transitions exist
    expect(config.state_transitions['review']).toBeDefined();
    expect(config.state_transitions['ready']).toBeDefined();
    expect(config.state_transitions['active']).toBeDefined();
    expect(config.state_transitions['done']).toBeDefined();
    expect(config.state_transitions['archived']).toBeDefined();
    expect(config.state_transitions['paused']).toBeDefined();

    // Verify custom rules exist
    expect(config.custom_rules?.['task_must_have_valid_assignment_for_executor']).toBeDefined();
    expect(config.custom_rules?.['task_must_be_in_active_sprint']).toBeDefined();
    expect(config.custom_rules?.['epic_promotion_required']).toBeDefined();

  });

  it('[EARS-10] should create config that matches kanban_workflow.json structure', async () => {
    const config = await createDefaultWorkflowConfig();

    // Verify structure matches what's expected by BacklogAdapter
    expect(config.state_transitions['review']?.from).toEqual(['draft']);
    expect(config.state_transitions['review']?.requires.command).toBe('gitgov task submit');

    expect(config.state_transitions['ready']?.requires.signatures?.['design']?.capability_roles).toEqual(['approver:design']);
    expect(config.state_transitions['active']?.requires.custom_rules).toContain('task_must_have_valid_assignment_for_executor');
  });
});
