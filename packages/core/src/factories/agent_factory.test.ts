import { createAgentRecord } from './agent_factory';
import type { AgentRecord } from '../types';
import { DetailedValidationError } from '../validation/common';

// Mock the validator to control test outcomes
jest.mock('../validation/agent_validator', () => ({
  validateAgentRecordDetailed: jest.fn(() => ({ isValid: true, errors: [] })),
}));

describe('createAgentRecord', () => {
  beforeEach(() => {
    // Reset mock to default success state before each test
    const { validateAgentRecordDetailed } = require('../validation/agent_validator');
    (validateAgentRecordDetailed as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
  });

  it('[EARS-2 & EARS-3] should create a valid agent record with defaults', async () => {
    const payload: Partial<AgentRecord> = {
      id: 'agent:test-agent',
      engine: {
        type: 'local',
        runtime: 'typescript',
        entrypoint: 'packages/agents/test/index.ts',
        function: 'runTestAgent'
      },
    };
    const agent = createAgentRecord(payload);
    expect(agent.id).toBe('agent:test-agent');
    expect(agent.status).toBe('active'); // Default status
    expect(agent.engine.type).toBe('local');
    expect(agent.triggers).toEqual([]); // Default empty array
    expect(agent.knowledge_dependencies).toEqual([]); // Default empty array
    expect(agent.prompt_engine_requirements).toEqual({}); // Default empty object
  });

  it('[EARS-1] should throw DetailedValidationError for invalid id (empty string)', async () => {
    const { validateAgentRecordDetailed } = require('../validation/agent_validator');
    (validateAgentRecordDetailed as jest.Mock).mockReturnValue({
      isValid: false,
      errors: [
        { field: 'id', message: 'must match pattern "^agent:[a-z0-9:-]+$"', value: '' }
      ]
    });

    const payload: Partial<AgentRecord> = {
      engine: { type: 'local' },
    };
    expect(() => createAgentRecord(payload)).toThrow(DetailedValidationError);
  });

  it('[EARS-1] should throw DetailedValidationError for missing engine properties', async () => {
    const { validateAgentRecordDetailed } = require('../validation/agent_validator');
    (validateAgentRecordDetailed as jest.Mock).mockReturnValue({
      isValid: false,
      errors: [
        { field: 'engine', message: 'must have required property based on type', value: { type: 'local' } }
      ]
    });

    const payload: Partial<AgentRecord> = {
      id: 'agent:test-agent',
    };
    expect(() => createAgentRecord(payload)).toThrow(DetailedValidationError);
  });


  it('[EARS-5] should throw DetailedValidationError if the created record fails validation', async () => {
    // Override the mock for this specific test
    const { validateAgentRecordDetailed } = require('../validation/agent_validator');
    (validateAgentRecordDetailed as jest.Mock).mockReturnValue({
      isValid: false,
      errors: [
        { field: 'engine', message: 'invalid engine configuration', value: { type: 'local' } }
      ]
    });

    const payload: Partial<AgentRecord> = {
      id: 'agent:test-agent',
      engine: { type: 'local' },
    };
    expect(() => createAgentRecord(payload)).toThrow(DetailedValidationError);

    // Restore the mock
    (validateAgentRecordDetailed as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
  });

  it('[EARS-6] should set default values for optional fields', async () => {
    const payload: Partial<AgentRecord> = {
      id: 'agent:minimal-agent',
      engine: { type: 'local' },
    };

    const agent = createAgentRecord(payload);

    expect(agent.status).toBe('active'); // Default status
    expect(agent.triggers).toEqual([]); // Default empty array
    expect(agent.knowledge_dependencies).toEqual([]); // Default empty array
    expect(agent.prompt_engine_requirements).toEqual({}); // Default empty object
  });

  it('[EARS-7] should preserve provided optional fields', async () => {
    const payload: Partial<AgentRecord> = {
      id: 'agent:complex-agent',
      engine: { type: 'api', url: 'https://api.example.com', method: 'POST' },
      status: 'archived',
      triggers: [{ type: 'manual' }],
      knowledge_dependencies: ['blueprints/core'],
      prompt_engine_requirements: { roles: ['analyst'], skills: ['research'] }
    };

    const agent = createAgentRecord(payload);

    expect(agent.status).toBe('archived'); // Custom status preserved
    expect(agent.triggers).toEqual([{ type: 'manual' }]);
    expect(agent.knowledge_dependencies).toEqual(['blueprints/core']);
    expect(agent.prompt_engine_requirements).toEqual({ roles: ['analyst'], skills: ['research'] });
  });

  it('[EARS-8] should require explicit ID (no generation - must correspond to existing ActorRecord)', async () => {
    const payload: Partial<AgentRecord> = {
      engine: { type: 'local' },
    };

    const agent = createAgentRecord(payload);

    // AgentRecord uses empty string as default ID because it MUST correspond to an existing ActorRecord
    // According to agent_protocol.md: "AgentRecord ID debe corresponder 1:1 con un ActorRecord existente"
    expect(agent.id).toBe('');
    expect(agent.engine.type).toBe('local');
  });

  describe('AgentRecord Specific Factory Operations (EARS 12-14)', () => {
    it('[EARS-14] should throw DetailedValidationError when engine is missing', async () => {
      const { validateAgentRecordDetailed } = require('../validation/agent_validator');
      (validateAgentRecordDetailed as jest.Mock).mockReturnValue({
        isValid: false,
        errors: [
          { field: 'engine', message: 'must have required property engine', value: undefined }
        ]
      });

      const payload: Partial<AgentRecord> = {
        id: 'agent:test-agent',
        // engine missing - should trigger validation error
      };

      expect(() => createAgentRecord(payload)).toThrow(DetailedValidationError);

      // Restore mock
      (validateAgentRecordDetailed as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
    });
  });
});
