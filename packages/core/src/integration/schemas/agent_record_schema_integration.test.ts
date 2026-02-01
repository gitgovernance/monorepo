import { validateAgentRecordDetailed } from '../../validation/agent_validator';
import type { AgentRecord } from '../../record_types';

describe('AgentRecord Schema Integration Tests', () => {
  /**
   * Helper function to create a minimal valid AgentRecord for integration tests.
   * This is a plain object creation (not using the factory) to test the validator directly.
   */
  const createValidAgentRecord = (): AgentRecord => ({
    id: 'agent:test',
    engine: {
      type: 'local'
    }
  });

  describe('Root Level & Required Fields (EARS 106-108)', () => {
    it('[EARS-106] should accept additional properties at root level', () => {
      const valid = {
        ...createValidAgentRecord(),
        customField: 'allowed because no additionalProperties: false at root'
      } as AgentRecord & { customField: string };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-107] should reject missing required field: id', () => {
      const invalid = createValidAgentRecord();
      delete (invalid as Partial<AgentRecord>).id;

      const result = validateAgentRecordDetailed(invalid as AgentRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('id') || e.field === 'id'
      )).toBe(true);
    });

    it('[EARS-108] should reject missing required field: engine', () => {
      const invalid = createValidAgentRecord();
      delete (invalid as Partial<AgentRecord>).engine;

      const result = validateAgentRecordDetailed(invalid as AgentRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('engine') || e.field === 'engine'
      )).toBe(true);
    });
  });

  describe('ID Field Validations (EARS 109-111)', () => {
    it('[EARS-109] should reject invalid id pattern', () => {
      const invalid = {
        ...createValidAgentRecord(),
        id: 'invalid-id-format'
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-110] should accept valid id pattern', () => {
      const valid = {
        ...createValidAgentRecord(),
        id: 'agent:scribe'
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-111] should accept id pattern with multiple segments', () => {
      const valid = {
        ...createValidAgentRecord(),
        id: 'agent:team:auditor'
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Status Field Validations (EARS 112-115)', () => {
    it('[EARS-112] should accept status "active"', () => {
      const valid = {
        ...createValidAgentRecord(),
        status: 'active' as const
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-113] should accept status "archived"', () => {
      const valid = {
        ...createValidAgentRecord(),
        status: 'archived' as const
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-114] should reject invalid status enum value', () => {
      const invalid = {
        ...createValidAgentRecord(),
        status: 'suspended' as unknown as 'active' | 'archived'
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('status') &&
        (e.message.includes('enum') || e.message.includes('must be equal to one of'))
      )).toBe(true);
    });

    it('[EARS-115] should accept absence of status field (optional)', () => {
      const valid = createValidAgentRecord();

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Triggers Array Validations (EARS 116-123)', () => {
    it('[EARS-116] should accept absence of triggers field (optional)', () => {
      const valid = createValidAgentRecord();

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-117] should accept empty triggers array', () => {
      const valid = {
        ...createValidAgentRecord(),
        triggers: []
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-118] should accept trigger item with type "manual"', () => {
      const valid = {
        ...createValidAgentRecord(),
        triggers: [{ type: 'manual' as const }]
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-119] should accept trigger item with type "webhook"', () => {
      const valid = {
        ...createValidAgentRecord(),
        triggers: [{ type: 'webhook' as const }]
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-120] should accept trigger item with type "scheduled"', () => {
      const valid = {
        ...createValidAgentRecord(),
        triggers: [{ type: 'scheduled' as const }]
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-121] should reject trigger item with invalid type enum', () => {
      const invalid = {
        ...createValidAgentRecord(),
        triggers: [{ type: 'invalid' as unknown as 'manual' | 'webhook' | 'scheduled' }]
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('triggers') &&
        (e.message.includes('enum') || e.message.includes('must be equal to one of'))
      )).toBe(true);
    });

    it('[EARS-122] should reject trigger item missing required field: type', () => {
      const invalid = {
        ...createValidAgentRecord(),
        triggers: [{}] as unknown as { type: 'manual' | 'webhook' | 'scheduled' }[]
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('triggers') && e.message.includes('type')
      )).toBe(true);
    });

    it('[EARS-123] should accept multiple valid trigger items', () => {
      const valid = {
        ...createValidAgentRecord(),
        triggers: [
          { type: 'manual' as const },
          { type: 'webhook' as const },
          { type: 'scheduled' as const }
        ]
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Knowledge Dependencies Array Validations (EARS 124-126)', () => {
    it('[EARS-124] should accept absence of knowledge_dependencies field (optional)', () => {
      const valid = createValidAgentRecord();

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-125] should accept empty knowledge_dependencies array', () => {
      const valid = {
        ...createValidAgentRecord(),
        knowledge_dependencies: []
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-126] should accept valid strings in knowledge_dependencies', () => {
      const valid = {
        ...createValidAgentRecord(),
        knowledge_dependencies: [
          'packages/blueprints/**/*.md',
          'docs/**/*.yaml'
        ]
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Prompt Engine Requirements Object Validations (EARS 127-132)', () => {
    it('[EARS-127] should accept absence of prompt_engine_requirements field (optional)', () => {
      const valid = createValidAgentRecord();

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-128] should accept empty prompt_engine_requirements object', () => {
      const valid = {
        ...createValidAgentRecord(),
        prompt_engine_requirements: {}
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-129] should accept array of strings in prompt_engine_requirements.roles', () => {
      const valid = {
        ...createValidAgentRecord(),
        prompt_engine_requirements: {
          roles: ['technical-writer', 'code-reviewer']
        }
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-130] should accept empty array in prompt_engine_requirements.roles', () => {
      const valid = {
        ...createValidAgentRecord(),
        prompt_engine_requirements: {
          roles: []
        }
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-131] should accept array of strings in prompt_engine_requirements.skills', () => {
      const valid = {
        ...createValidAgentRecord(),
        prompt_engine_requirements: {
          skills: ['markdown', 'typescript', 'architecture']
        }
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-132] should accept empty array in prompt_engine_requirements.skills', () => {
      const valid = {
        ...createValidAgentRecord(),
        prompt_engine_requirements: {
          skills: []
        }
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Engine Field - Root Validations (EARS 133-134)', () => {
    it('[EARS-133] should reject engine with non-object type', () => {
      const invalid = {
        ...createValidAgentRecord(),
        engine: 'not-an-object' as unknown as { type: 'local' | 'api' | 'mcp' | 'custom' }
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('engine') && e.message.includes('object')
      )).toBe(true);
    });

    it('[EARS-134] should reject engine missing required field: type', () => {
      const invalid = {
        ...createValidAgentRecord(),
        engine: {} as unknown as { type: 'local' | 'api' | 'mcp' | 'custom' }
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('type') || e.message.includes('oneOf')
      )).toBe(true);
    });
  });

  describe('Engine Field - "local" Type Validations (EARS 135-140)', () => {
    it('[EARS-135] should accept engine type "local" with valid schema', () => {
      const valid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'local' as const
        }
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-136] should accept engine type "local" with optional runtime', () => {
      const valid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'local' as const,
          runtime: 'typescript'
        }
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-137] should accept engine type "local" with optional entrypoint', () => {
      const valid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'local' as const,
          entrypoint: 'packages/agents/scribe/index.ts'
        }
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-138] should accept engine type "local" with optional function', () => {
      const valid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'local' as const,
          function: 'runScribe'
        }
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-139] should accept engine type "local" with all optional fields', () => {
      const valid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'local' as const,
          runtime: 'typescript',
          entrypoint: 'packages/agents/scribe/index.ts',
          function: 'runScribe'
        }
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-140] should accept engine type "local" without optional fields', () => {
      const valid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'local' as const
        }
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Engine Field - "api" Type Validations (EARS 141-147)', () => {
    it('[EARS-141] should accept engine type "api" with valid schema (including required url)', () => {
      const valid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'api' as const,
          url: 'https://api.example.com/agent'
        }
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-142] should accept engine type "api" with valid required url (format: uri)', () => {
      const valid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'api' as const,
          url: 'https://api.acme.com/translate'
        }
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-143] should reject engine type "api" with invalid url (not uri format)', () => {
      const invalid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'api' as const,
          url: 'not-a-valid-url'
        }
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('url') && (e.message.includes('format') || e.message.includes('uri'))
      )).toBe(true);
    });

    it('[EARS-144] should accept engine type "api" with method "POST"', () => {
      const valid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'api' as const,
          url: 'https://api.example.com/agent',
          method: 'POST' as const
        }
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-145] should accept engine type "api" with method "GET"', () => {
      const valid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'api' as const,
          url: 'https://api.example.com/agent',
          method: 'GET' as const
        }
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-146] should reject engine type "api" with invalid method enum', () => {
      const invalid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'api' as const,
          url: 'https://api.example.com/agent',
          method: 'PATCH' as unknown as 'POST' | 'GET' | 'PUT'
        }
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('method') &&
        (e.message.includes('enum') || e.message.includes('must be equal to one of'))
      )).toBe(true);
    });

    it('[EARS-147] should accept engine type "api" with optional auth object', () => {
      const valid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'api' as const,
          url: 'https://api.example.com/agent',
          auth: {
            type: 'bearer',
            token: 'secret-token'
          }
        }
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Engine Field - "mcp" Type Validations (EARS 148-152)', () => {
    it('[EARS-148] should accept engine type "mcp" with valid schema (including required url)', () => {
      const valid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'mcp' as const,
          url: 'http://localhost:8081/mcp'
        }
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-149] should accept engine type "mcp" with valid required url (format: uri)', () => {
      const valid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'mcp' as const,
          url: 'http://localhost:8081/mcp'
        }
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-150] should reject engine type "mcp" with invalid url (not uri format)', () => {
      const invalid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'mcp' as const,
          url: 'not-a-valid-url'
        }
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('url') && (e.message.includes('format') || e.message.includes('uri'))
      )).toBe(true);
    });

    it('[EARS-151] should accept engine type "mcp" with optional auth object', () => {
      const valid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'mcp' as const,
          url: 'http://localhost:8081/mcp',
          auth: {
            apiKey: 'secret'
          }
        }
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-152] should accept engine type "mcp" without auth', () => {
      const valid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'mcp' as const,
          url: 'http://localhost:8081/mcp'
        }
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Engine Field - "custom" Type Validations (EARS 153-157)', () => {
    it('[EARS-153] should accept engine type "custom" with valid schema', () => {
      const valid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'custom' as const
        }
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-154] should accept engine type "custom" with optional protocol', () => {
      const valid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'custom' as const,
          protocol: 'a2a'
        }
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-155] should accept engine type "custom" with optional config object', () => {
      const valid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'custom' as const,
          config: {
            endpoint: 'https://agent-hub.example.com/a2a'
          }
        }
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-156] should accept engine type "custom" with both protocol and config', () => {
      const valid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'custom' as const,
          protocol: 'a2a',
          config: {
            endpoint: 'https://agent-hub.example.com/a2a',
            version: '1.0'
          }
        }
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-157] should accept engine type "custom" without optional fields', () => {
      const valid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'custom' as const
        }
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Engine Field - oneOf Constraint Validations (EARS 158-161)', () => {
    it('[EARS-158] should reject engine.type with value not in [local, api, mcp, custom]', () => {
      const invalid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'unknown' as unknown as 'local' | 'api' | 'mcp' | 'custom'
        }
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('oneOf') || e.message.includes('enum') || e.message.includes('must be equal to one of')
      )).toBe(true);
    });

    it('[EARS-159] should reject engine type "local" with fields from other variant (oneOf violation)', () => {
      const invalid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'local' as const,
          url: 'https://should-not-be-here.com' // campo de variante api/mcp
        } as unknown as { type: 'local' | 'api' | 'mcp' | 'custom' }
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('additional') || e.message.includes('oneOf')
      )).toBe(true);
    });

    it('[EARS-160] should reject engine type "api" with fields from other variant (oneOf violation)', () => {
      const invalid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'api' as const,
          url: 'https://api.example.com',
          runtime: 'typescript' // campo de variante local
        } as unknown as { type: 'local' | 'api' | 'mcp' | 'custom' }
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('additional') || e.message.includes('oneOf')
      )).toBe(true);
    });

    it('[EARS-161] should reject engine type "mcp" with fields from other variant (oneOf violation)', () => {
      const invalid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'mcp' as const,
          url: 'http://localhost:8081/mcp',
          protocol: 'a2a' // campo de variante custom
        } as unknown as { type: 'local' | 'api' | 'mcp' | 'custom' }
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('additional') || e.message.includes('oneOf')
      )).toBe(true);
    });
  });

  describe('JSON Schema Type Validations (EARS 162-178)', () => {
    it('[EARS-162] should reject id with non-string type', () => {
      const invalid = {
        ...createValidAgentRecord(),
        id: 123 as unknown as string
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-163] should reject status with non-string type', () => {
      const invalid = {
        ...createValidAgentRecord(),
        status: 123 as unknown as 'active' | 'archived'
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('status') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-164] should reject triggers with non-array type', () => {
      const invalid = {
        ...createValidAgentRecord(),
        triggers: 'not-an-array' as unknown as { type: 'manual' | 'webhook' | 'scheduled' }[]
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('triggers') && e.message.includes('array')
      )).toBe(true);
    });

    it('[EARS-165] should reject trigger item with non-object type', () => {
      const invalid = {
        ...createValidAgentRecord(),
        triggers: ['not-an-object'] as unknown as { type: 'manual' | 'webhook' | 'scheduled' }[]
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('triggers') && e.message.includes('object')
      )).toBe(true);
    });

    it('[EARS-166] should reject trigger item type with non-string type', () => {
      const invalid = {
        ...createValidAgentRecord(),
        triggers: [{ type: 123 }] as unknown as { type: 'manual' | 'webhook' | 'scheduled' }[]
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('triggers') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-167] should reject knowledge_dependencies with non-array type', () => {
      const invalid = {
        ...createValidAgentRecord(),
        knowledge_dependencies: 'not-an-array' as unknown as string[]
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('knowledge_dependencies') && e.message.includes('array')
      )).toBe(true);
    });

    it('[EARS-168] should reject knowledge_dependencies item with non-string type', () => {
      const invalid = {
        ...createValidAgentRecord(),
        knowledge_dependencies: [123] as unknown as string[]
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('knowledge_dependencies') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-169] should reject prompt_engine_requirements with non-object type', () => {
      const invalid = {
        ...createValidAgentRecord(),
        prompt_engine_requirements: 'not-an-object' as unknown as { roles: string[], skills: string[] }
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('prompt_engine_requirements') && e.message.includes('object')
      )).toBe(true);
    });

    it('[EARS-170] should reject prompt_engine_requirements.roles with non-array type', () => {
      const invalid = {
        ...createValidAgentRecord(),
        prompt_engine_requirements: {
          roles: 'not-an-array' as unknown as string[]
        }
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('roles') && e.message.includes('array')
      )).toBe(true);
    });

    it('[EARS-171] should reject prompt_engine_requirements.roles item with non-string type', () => {
      const invalid = {
        ...createValidAgentRecord(),
        prompt_engine_requirements: {
          roles: [123] as unknown as string[]
        }
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('roles') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-172] should reject prompt_engine_requirements.skills with non-array type', () => {
      const invalid = {
        ...createValidAgentRecord(),
        prompt_engine_requirements: {
          skills: 'not-an-array' as unknown as string[]
        }
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('skills') && e.message.includes('array')
      )).toBe(true);
    });

    it('[EARS-173] should reject prompt_engine_requirements.skills item with non-string type', () => {
      const invalid = {
        ...createValidAgentRecord(),
        prompt_engine_requirements: {
          skills: [123] as unknown as string[]
        }
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('skills') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-174] should reject engine with non-object type', () => {
      const invalid = {
        ...createValidAgentRecord(),
        engine: 'not-an-object' as unknown as { type: 'local' | 'api' | 'mcp' | 'custom' }
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('engine') && e.message.includes('object')
      )).toBe(true);
    });

    it('[EARS-175] should reject engine.type with non-string type', () => {
      const invalid = {
        ...createValidAgentRecord(),
        engine: {
          type: 123 as unknown as 'local' | 'api' | 'mcp' | 'custom'
        }
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('string') || e.message.includes('oneOf')
      )).toBe(true);
    });

    it('[EARS-176] should reject engine.runtime (local variant) with non-string type', () => {
      const invalid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'local' as const,
          runtime: 123 as unknown as string
        }
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('runtime') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-177] should reject engine.url (api/mcp variant) with non-string type', () => {
      const invalid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'api' as const,
          url: 123 as unknown as string
        }
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('url') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-178] should reject engine.method (api variant) with non-string type', () => {
      const invalid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'api' as const,
          url: 'https://api.example.com',
          method: 123 as unknown as 'POST' | 'GET'
        }
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('method') && e.message.includes('string')
      )).toBe(true);
    });
  });

  describe('Engine Field - Required URL Validations (EARS 179-180)', () => {
    it('[EARS-179] should reject engine type "api" missing required field: url', () => {
      const invalid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'api' as const
        } as unknown as { type: 'local' | 'api' | 'mcp' | 'custom' }
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('url') || e.message.includes('required')
      )).toBe(true);
    });

    it('[EARS-180] should reject engine type "mcp" missing required field: url', () => {
      const invalid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'mcp' as const
        } as unknown as { type: 'local' | 'api' | 'mcp' | 'custom' }
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('url') || e.message.includes('required')
      )).toBe(true);
    });
  });

  describe('Engine Field - Optional Method with Default (EARS 181)', () => {
    it('[EARS-181] should accept engine type "api" without method (optional with default "POST")', () => {
      const valid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'api' as const,
          url: 'https://api.example.com/agent'
        }
      };

      const result = validateAgentRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Engine Field - additionalProperties False Validations (EARS 182-185)', () => {
    it('[EARS-182] should reject engine type "local" with additional properties', () => {
      const invalid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'local' as const,
          url: 'https://should-not-be-here.com' // campo de otra variante
        } as unknown as { type: 'local' | 'api' | 'mcp' | 'custom' }
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('additional') || e.message.includes('oneOf')
      )).toBe(true);
    });

    it('[EARS-183] should reject engine type "api" with additional properties', () => {
      const invalid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'api' as const,
          url: 'https://api.example.com',
          runtime: 'typescript' // campo de variante local
        } as unknown as { type: 'local' | 'api' | 'mcp' | 'custom' }
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('additional') || e.message.includes('oneOf')
      )).toBe(true);
    });

    it('[EARS-184] should reject engine type "mcp" with additional properties', () => {
      const invalid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'mcp' as const,
          url: 'http://localhost:8081/mcp',
          protocol: 'a2a' // campo de variante custom
        } as unknown as { type: 'local' | 'api' | 'mcp' | 'custom' }
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('additional') || e.message.includes('oneOf')
      )).toBe(true);
    });

    it('[EARS-185] should reject engine type "custom" with additional properties', () => {
      const invalid = {
        ...createValidAgentRecord(),
        engine: {
          type: 'custom' as const,
          url: 'https://should-not-be-here.com' // campo de variante api/mcp
        } as unknown as { type: 'local' | 'api' | 'mcp' | 'custom' }
      };

      const result = validateAgentRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('additional') || e.message.includes('oneOf')
      )).toBe(true);
    });
  });
});

