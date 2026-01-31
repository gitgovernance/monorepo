import {
  createWorkflowMethodologyConfig,
  createDefaultWorkflowMethodologyConfig
} from './workflow_methodology_factory';
import type { WorkflowMethodologyRecord } from '../types';
import { DetailedValidationError } from '../validation/common';

// Manual mock for validateWorkflowMethodologyConfigDetailed
jest.mock('../validation/workflow_methodology_validator', () => ({
  validateWorkflowMethodologyConfigDetailed: jest.fn()
    .mockReturnValue({ isValid: true, errors: [] }),
  validateWorkflowMethodologyConfigBusinessRules: jest.fn()
    .mockReturnValue({ isValid: true, errors: [] }),
}));

describe('createWorkflowMethodologyConfig', () => {
  beforeEach(() => {
    // Reset mocks to default success state before each test
    const {
      validateWorkflowMethodologyConfigDetailed,
      validateWorkflowMethodologyConfigBusinessRules
    } = require('../validation/workflow_methodology_validator');

    (validateWorkflowMethodologyConfigDetailed as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
    (validateWorkflowMethodologyConfigBusinessRules as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
  });

  it('[EARS-1] should create a valid workflow methodology config with defaults', async () => {
    const payload: Partial<WorkflowMethodologyRecord> = {
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

    const config = await createWorkflowMethodologyConfig(payload);

    expect(config.version).toBe('1.0.0'); // Default version
    expect(config.name).toBe('Custom Test Methodology');
    expect(config.state_transitions).toBeDefined();
  });

  it('[EARS-2] should throw DetailedValidationError for invalid schema', async () => {
    const { validateWorkflowMethodologyConfigDetailed } = require('../validation/workflow_methodology_validator');
    (validateWorkflowMethodologyConfigDetailed as jest.Mock).mockReturnValue({
      isValid: false,
      errors: [
        { field: 'name', message: 'must be a non-empty string', value: '' },
        { field: 'state_transitions', message: 'is required', value: undefined }
      ]
    });

    const payload: Partial<WorkflowMethodologyRecord> = {
      name: '',
      // Missing state_transitions
    };

    expect(() => createWorkflowMethodologyConfig(payload)).toThrow(DetailedValidationError);
  });

  it('[EARS-3] should throw DetailedValidationError for business rule violations', () => {
    const { validateWorkflowMethodologyConfigBusinessRules } = require('../validation/workflow_methodology_validator');
    (validateWorkflowMethodologyConfigBusinessRules as jest.Mock).mockReturnValue({
      isValid: false,
      errors: [
        { field: 'state_transitions.invalid_state', message: 'Invalid target state: invalid_state', value: 'invalid_state' }
      ]
    });

    const payload: Partial<WorkflowMethodologyRecord> = {
      name: 'Test Methodology',
      state_transitions: {
        invalid_state: {
          from: ['draft'],
          requires: {}
        }
      } as any
    };

    expect(() => createWorkflowMethodologyConfig(payload)).toThrow(DetailedValidationError);
  });

  it('[EARS-4] should preserve all provided fields', async () => {
    const payload: Partial<WorkflowMethodologyRecord> = {
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

    const config = await createWorkflowMethodologyConfig(payload);

    expect(config.version).toBe('2.0.0');
    expect(config.name).toBe('Advanced Methodology');
    expect(config.description).toBe('Advanced workflow with custom rules');
    expect(config.custom_rules).toEqual(payload.custom_rules);
  });

  it('[EARS-5] should create config with minimal required fields', async () => {
    const payload: Partial<WorkflowMethodologyRecord> = {
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

    const config = await createWorkflowMethodologyConfig(payload);

    expect(config.name).toBe('Minimal Methodology');
    expect(config.version).toBe('1.0.0'); // Default
    expect(config.state_transitions).toEqual(payload.state_transitions);
  });

  it('[EARS-6] should handle empty payload with all defaults', async () => {
    const config = await createWorkflowMethodologyConfig({});

    expect(config.version).toBe('1.0.0');
    expect(config.name).toBe('Custom Methodology');
    expect(config.state_transitions).toBeDefined();
  });

  it('[EARS-8] should validate and create complex methodology config', async () => {
    const complexPayload: Partial<WorkflowMethodologyRecord> = {
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

    const config = await createWorkflowMethodologyConfig(complexPayload);

    expect(config.version).toBe('1.5.0');
    expect(config.name).toBe('Enterprise Methodology');
    expect(config.description).toBe('Complex enterprise workflow with multiple approval gates');
    expect(config.state_transitions['ready']?.requires.signatures?.['quality']?.min_approvals).toBe(2);
    expect(config.custom_rules?.['security_scan_required']?.validation).toBe('custom');
  });
});

describe('createDefaultWorkflowMethodologyConfig', () => {
  beforeEach(() => {
    // Reset mocks to default success state before each test
    const {
      validateWorkflowMethodologyConfigDetailed,
      validateWorkflowMethodologyConfigBusinessRules
    } = require('../validation/workflow_methodology_validator');

    (validateWorkflowMethodologyConfigDetailed as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
    (validateWorkflowMethodologyConfigBusinessRules as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
  });

  it('[EARS-9] should create default GitGovernance methodology config', async () => {
    const config = await createDefaultWorkflowMethodologyConfig();

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

  it('[EARS-10] should create config that matches workflow_methodology_default.json structure', async () => {
    const config = await createDefaultWorkflowMethodologyConfig();

    // Verify structure matches what's expected by BacklogAdapter
    expect(config.state_transitions['review']?.from).toEqual(['draft']);
    expect(config.state_transitions['review']?.requires.command).toBe('gitgov task submit');

    expect(config.state_transitions['ready']?.requires.signatures?.['design']?.capability_roles).toEqual(['approver:design']);
    expect(config.state_transitions['active']?.requires.custom_rules).toContain('task_must_have_valid_assignment_for_executor');
  });
});
