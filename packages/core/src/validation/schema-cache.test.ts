import { SchemaValidationCache } from './schema-cache';
import path from 'path';
import { ConfigManager } from '../config_manager';

describe('SchemaValidationCache', () => {
  const root = ConfigManager.findProjectRoot();
  const actorSchemaPath = path.join(root!, "packages/blueprints/03_products/protocol/02_actor/actor_record_schema.yaml");
  const agentSchemaPath = path.join(root!, "packages/blueprints/03_products/protocol/03_agent/agent_record_schema.yaml");

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
    const validator1 = SchemaValidationCache.getValidator(actorSchemaPath);
    expect(validator1).toBeDefined();
    expect(typeof validator1).toBe('function');

    // Second call should return cached validator (same reference)
    const validator2 = SchemaValidationCache.getValidator(actorSchemaPath);
    expect(validator2).toBe(validator1); // Same reference = cached
  });

  it('[EARS-2] should handle multiple different schemas', () => {
    const actorValidator = SchemaValidationCache.getValidator(actorSchemaPath);
    const agentValidator = SchemaValidationCache.getValidator(agentSchemaPath);

    expect(actorValidator).toBeDefined();
    expect(agentValidator).toBeDefined();
    expect(actorValidator).not.toBe(agentValidator); // Different validators

    const stats = SchemaValidationCache.getCacheStats();
    expect(stats.cachedSchemas).toBe(2);
    expect(stats.schemasLoaded).toContain(actorSchemaPath);
    expect(stats.schemasLoaded).toContain(agentSchemaPath);
  });

  it('[EARS-3] should validate ActorRecord correctly using cached validator', () => {
    const validator = SchemaValidationCache.getValidator(actorSchemaPath);

    const validActor = {
      id: 'human:test', type: 'human', displayName: 'Test',
      publicKey: 'key', roles: ['author'], status: 'active'
    };

    const invalidActor = { id: 'invalid' }; // Missing required fields

    expect(validator(validActor)).toBe(true);
    expect(validator(invalidActor)).toBe(false);
  });

  it('[EARS-4] should validate AgentRecord correctly using cached validator', () => {
    const validator = SchemaValidationCache.getValidator(agentSchemaPath);

    const validAgent = {
      id: 'agent:test', guild: 'design',
      engine: { type: 'local' }, status: 'active'
    };

    const invalidAgent = { id: 'invalid' }; // Missing required fields

    expect(validator(validAgent)).toBe(true);
    expect(validator(invalidAgent)).toBe(false);
  });

  it('[EARS-5] should clear cache completely', () => {
    // Load some validators
    SchemaValidationCache.getValidator(actorSchemaPath);
    SchemaValidationCache.getValidator(agentSchemaPath);

    expect(SchemaValidationCache.getCacheStats().cachedSchemas).toBe(2);

    // Clear cache
    SchemaValidationCache.clearCache();

    const stats = SchemaValidationCache.getCacheStats();
    expect(stats.cachedSchemas).toBe(0);
    expect(stats.schemasLoaded).toEqual([]);
  });
});
