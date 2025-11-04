import * as fs from 'fs';
import * as path from 'path';

// Path to schemas (Jest runs in CommonJS mode)
const SCHEMAS_DIR = path.join(__dirname, '../../schemas');

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

describe('Schema Consistency Tests', () => {
  it('should have all expected schema files', () => {
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

  it('should have consistent schema structure', () => {
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
