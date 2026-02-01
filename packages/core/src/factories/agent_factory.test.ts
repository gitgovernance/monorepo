import { createAgentRecord } from './agent_factory';
import type { AgentRecord } from '../record_types';
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

  describe('AgentRecord Metadata Factory Operations (EARS-AG 1-4)', () => {
    it('[EARS-AG-1] should preserve metadata field when provided', async () => {
      const payload: Partial<AgentRecord> = {
        id: 'agent:with-metadata',
        engine: { type: 'local' },
        metadata: {
          description: 'Test agent with metadata',
          purpose: 'testing'
        }
      };

      const result = createAgentRecord(payload);

      expect(result.metadata).toEqual({
        description: 'Test agent with metadata',
        purpose: 'testing'
      });
    });

    it('[EARS-AG-2] should preserve complex metadata with nested structures', async () => {
      const payload: Partial<AgentRecord> = {
        id: 'agent:complex-metadata',
        engine: { type: 'api', url: 'https://api.example.com' },
        metadata: {
          description: 'Complex agent',
          config: {
            timeout: 30000,
            retries: 3
          },
          capabilities: ['search', 'analyze', 'report']
        }
      };

      const result = createAgentRecord(payload);

      expect(result.metadata).toEqual({
        description: 'Complex agent',
        config: {
          timeout: 30000,
          retries: 3
        },
        capabilities: ['search', 'analyze', 'report']
      });
    });

    it('[EARS-AG-3] should accept AgentRecord without metadata', async () => {
      const payload: Partial<AgentRecord> = {
        id: 'agent:no-metadata',
        engine: { type: 'local' }
      };

      const result = createAgentRecord(payload);

      expect(result.metadata).toBeUndefined();
    });

    it('[EARS-AG-4] should accept empty metadata object', async () => {
      const payload: Partial<AgentRecord> = {
        id: 'agent:empty-metadata',
        engine: { type: 'local' },
        metadata: {}
      };

      const result = createAgentRecord(payload);

      expect(result.metadata).toEqual({});
    });
  });

  describe('AgentRecord Typed Metadata Helpers (EARS-AG 5-9)', () => {
    it('[EARS-AG-5] should allow AgentRecord with typed description metadata', () => {
      type AgentMetadata = {
        description: string;
        purpose: string;
        version: string;
      };

      const agentMetadata: AgentMetadata = {
        description: 'Code review agent',
        purpose: 'automated code review',
        version: '1.0.0'
      };

      const typedRecord: AgentRecord<AgentMetadata> = {
        id: 'agent:code-reviewer',
        engine: { type: 'local', entrypoint: 'src/index.ts' },
        metadata: agentMetadata
      };

      const result = createAgentRecord(typedRecord);

      expect(result.metadata).toEqual(agentMetadata);
      expect(result.metadata?.description).toBe('Code review agent');
      expect(result.metadata?.version).toBe('1.0.0');
    });

    it('[EARS-AG-6] should allow AgentRecord with typed config metadata', () => {
      type ConfigMetadata = {
        description: string;
        maxTokens: number;
        model: string;
        capabilities: string[];
      };

      const configMetadata: ConfigMetadata = {
        description: 'LLM-powered agent',
        maxTokens: 4096,
        model: 'claude-3',
        capabilities: ['code-generation', 'analysis']
      };

      const typedRecord: AgentRecord<ConfigMetadata> = {
        id: 'agent:llm-agent',
        engine: { type: 'api', url: 'https://api.anthropic.com' },
        metadata: configMetadata
      };

      const result = createAgentRecord(typedRecord);

      expect(result.metadata).toEqual(configMetadata);
      expect(result.metadata?.maxTokens).toBe(4096);
      expect(result.metadata?.capabilities).toContain('code-generation');
    });

    it('[EARS-AG-7] should allow Partial<AgentRecord<T>> for factory input', () => {
      type MinimalMetadata = {
        description: string;
        owner?: string;
      };

      const payload: Partial<AgentRecord<MinimalMetadata>> = {
        id: 'agent:partial-input',
        engine: { type: 'local' },
        metadata: { description: 'Partial input agent', owner: 'team-a' }
      };

      const result = createAgentRecord(payload);

      expect(result.metadata?.description).toBe('Partial input agent');
      expect(result.metadata?.owner).toBe('team-a');
    });

    it('[EARS-AG-8] should allow custom metadata types defined by consumers', () => {
      type CustomAgentContext = {
        description: string;
        source: string;
        priority: number;
        tags: string[];
      };

      const customMetadata: CustomAgentContext = {
        description: 'Custom context agent',
        source: 'external-system',
        priority: 1,
        tags: ['integration', 'external']
      };

      const typedRecord: AgentRecord<CustomAgentContext> = {
        id: 'agent:custom-context',
        engine: { type: 'mcp', url: 'https://mcp.example.com' },
        metadata: customMetadata
      };

      const result = createAgentRecord(typedRecord);

      expect(result.metadata).toEqual(customMetadata);
      expect(result.metadata?.source).toBe('external-system');
      expect(result.metadata?.priority).toBe(1);
      expect(result.metadata?.tags).toEqual(['integration', 'external']);
    });

    it('[EARS-AG-9] should allow AgentRecord<T> without metadata (optional)', () => {
      type SomeMetadata = {
        field: string;
      };

      const typedRecord: AgentRecord<SomeMetadata> = {
        id: 'agent:no-metadata-typed',
        engine: { type: 'local' }
      };

      const result = createAgentRecord(typedRecord);

      expect(result.metadata).toBeUndefined();
    });
  });
});
