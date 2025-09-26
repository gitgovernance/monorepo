#!/usr/bin/env tsx
/**
 * JSON Schema Validation
 * 
 * This script validates that our JSON Schema files are:
 * 1. Valid JSON syntax
 * 2. Valid JSON Schema format
 * 3. Complete (no broken $ref references)
 * 4. Consistent with our naming conventions
 * 
 * Note: Integration testing with src/validation is handled in the test suite.
 */

import * as fs from 'fs';
import * as path from 'path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { fileURLToPath } from 'url';

// No imports from src/validation - this script only validates JSON Schema format

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const SCHEMAS_DIR = path.join(__dirname, '../src/schemas');

// JSON Schema meta-schema for validation
const JSON_SCHEMA_META_SCHEMA = 'http://json-schema.org/draft-07/schema#';

// Expected schema configurations
const EXPECTED_SCHEMAS = [
  {
    name: 'EmbeddedMetadata',
    file: 'embedded_metadata_schema.json',
    expectedTitle: 'EmbeddedMetadataRecord',
    description: 'Wrapper structure for all GitGovernance records'
  },
  {
    name: 'ActorRecord',
    file: 'actor_record_schema.json',
    expectedTitle: 'ActorRecord',
    description: 'Actor records as defined in actor_protocol.md'
  },
  {
    name: 'AgentRecord',
    file: 'agent_record_schema.json',
    expectedTitle: 'AgentRecord',
    description: 'Agent records for AI agents'
  },
  {
    name: 'TaskRecord',
    file: 'task_record_schema.json',
    expectedTitle: 'TaskRecord',
    description: 'Task records as defined in task_protocol.md'
  },
  {
    name: 'ExecutionRecord',
    file: 'execution_record_schema.json',
    expectedTitle: 'ExecutionRecord',
    description: 'Execution records for task executions'
  },
  {
    name: 'ChangelogRecord',
    file: 'changelog_record_schema.json',
    expectedTitle: 'ChangelogRecord',
    description: 'Changelog records for tracking changes'
  },
  {
    name: 'FeedbackRecord',
    file: 'feedback_record_schema.json',
    expectedTitle: 'FeedbackRecord',
    description: 'Feedback records for collaborative review'
  },
  {
    name: 'CycleRecord',
    file: 'cycle_record_schema.json',
    expectedTitle: 'CycleRecord',
    description: 'Cycle records for strategic planning'
  },
  {
    name: 'WorkflowMethodology',
    file: 'workflow_methodology_schema.json',
    expectedTitle: 'WorkflowMethodologyRecord',
    description: 'Workflow methodology configuration'
  }
];

/**
 * Create AJV instance for JSON Schema validation
 */
function createAjvValidator(): Ajv {
  const ajv = new Ajv({
    strict: false, // Allow additional properties in meta-schema
    validateFormats: true
    // Note: We skip loadSchema since we're not resolving $ref automatically
  });

  addFormats(ajv);
  return ajv;
}

/**
 * Validate JSON syntax and basic structure
 */
function validateJsonSyntax(schemaPath: string, schemaName: string): [boolean, any] {
  console.log(`🔍 Validating JSON syntax for ${schemaName}...`);

  if (!fs.existsSync(schemaPath)) {
    console.error(`❌ Schema file not found: ${schemaPath}`);
    return [false, null];
  }

  try {
    const content = fs.readFileSync(schemaPath, 'utf8');
    const parsed = JSON.parse(content);

    console.log(`✅ JSON syntax OK for ${schemaName}`);
    return [true, parsed];
  } catch (error) {
    console.error(`❌ JSON syntax error in ${schemaName}:`, error);
    return [false, null];
  }
}

/**
 * Validate that the schema is a valid JSON Schema
 */
function validateJsonSchemaFormat(schema: any, schemaName: string, ajv: Ajv): boolean {
  console.log(`🔍 Validating JSON Schema format for ${schemaName}...`);

  try {
    // Compile the schema to check if it's valid JSON Schema
    ajv.compile(schema);
    console.log(`✅ JSON Schema format OK for ${schemaName}`);
    return true;
  } catch (error) {
    console.error(`❌ Invalid JSON Schema format for ${schemaName}:`, error);
    return false;
  }
}

/**
 * Validate schema metadata and conventions
 */
function validateSchemaMetadata(schema: any, config: any, schemaName: string): boolean {
  console.log(`🔍 Validating metadata for ${schemaName}...`);

  let isValid = true;
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check required metadata
  if (!schema.$schema) {
    errors.push('Missing $schema property');
  } else if (schema.$schema !== JSON_SCHEMA_META_SCHEMA) {
    warnings.push(`$schema is ${schema.$schema}, expected ${JSON_SCHEMA_META_SCHEMA}`);
  }

  if (!schema.title) {
    errors.push('Missing title property');
  } else if (schema.title !== config.expectedTitle) {
    warnings.push(`Title is "${schema.title}", expected "${config.expectedTitle}"`);
  }

  if (!schema.description) {
    warnings.push('Missing description property');
  }

  if (!schema.type) {
    errors.push('Missing type property');
  } else if (schema.type !== 'object') {
    warnings.push(`Type is "${schema.type}", most records should be "object"`);
  }

  // Check for additionalProperties setting
  if (schema.additionalProperties === undefined) {
    warnings.push('additionalProperties not explicitly set (consider setting to false for strict validation)');
  }

  // Check for required properties
  if (schema.type === 'object' && !schema.required) {
    warnings.push('No required properties defined');
  }

  // Report warnings
  if (warnings.length > 0) {
    console.log(`⚠️  Metadata warnings for ${schemaName}:`);
    warnings.forEach(warning => console.log(`   • ${warning}`));
  }

  // Report errors
  if (errors.length > 0) {
    console.error(`❌ Metadata errors for ${schemaName}:`);
    errors.forEach(error => console.error(`   • ${error}`));
    isValid = false;
  }

  if (isValid && warnings.length === 0) {
    console.log(`✅ Metadata OK for ${schemaName}`);
  } else if (isValid) {
    console.log(`✅ Metadata OK for ${schemaName} (with warnings)`);
  }

  return isValid;
}

/**
 * Check for $ref references and their resolution
 */
function validateSchemaReferences(schema: any, schemaName: string): boolean {
  console.log(`🔍 Checking references for ${schemaName}...`);

  const jsonString = JSON.stringify(schema);
  const refMatches = jsonString.match(/"\$ref":\s*"([^"]+)"/g);

  if (!refMatches) {
    console.log(`✅ No external references in ${schemaName}`);
    return true;
  }

  console.log(`📋 Found ${refMatches.length} $ref references in ${schemaName}`);

  let hasIssues = false;
  const referencedFiles = new Set<string>();

  for (const refMatch of refMatches) {
    const refPath = refMatch.match(/"([^"]+)"/)?.[1];
    if (!refPath) continue;

    if (refPath.startsWith('#')) {
      // Internal reference - OK
      continue;
    }

    if (refPath.includes('.yaml')) {
      // External YAML reference - should be resolved to JSON
      console.warn(`⚠️  External YAML reference: ${refPath}`);
      const jsonRef = refPath.replace('.yaml', '.json');
      const referencedFile = path.basename(jsonRef);
      referencedFiles.add(referencedFile);
    } else if (refPath.includes('.json')) {
      // External JSON reference
      const referencedFile = path.basename(refPath);
      referencedFiles.add(referencedFile);
    }
  }

  // Check if referenced files exist
  for (const referencedFile of referencedFiles) {
    const referencedPath = path.join(SCHEMAS_DIR, referencedFile);
    if (!fs.existsSync(referencedPath)) {
      console.error(`❌ Referenced schema not found: ${referencedFile}`);
      hasIssues = true;
    }
  }

  if (!hasIssues) {
    console.log(`✅ References OK for ${schemaName}`);
  }

  return !hasIssues;
}

// Integration testing removed - handled in test suite

/**
 * Validate all schemas
 */
async function validateAllSchemas(): Promise<boolean> {
  console.log('🔄 Starting comprehensive JSON Schema validation...\n');

  if (!fs.existsSync(SCHEMAS_DIR)) {
    console.error(`❌ Schemas directory not found: ${SCHEMAS_DIR}`);
    console.log('💡 Run "pnpm sync:schemas" first to generate schemas');
    return false;
  }

  const ajv = createAjvValidator();

  let allValid = true;
  let syntaxErrors = 0;
  let formatErrors = 0;
  let metadataErrors = 0;
  let referenceErrors = 0;

  for (const config of EXPECTED_SCHEMAS) {
    const schemaPath = path.join(SCHEMAS_DIR, config.file);

    console.log(`📋 Validating ${config.name}:`);

    // 1. Validate JSON syntax
    const [syntaxValid, schema] = validateJsonSyntax(schemaPath, config.name);
    if (!syntaxValid) {
      syntaxErrors++;
      allValid = false;
      console.log(''); // Empty line for readability
      continue;
    }

    // 2. Validate JSON Schema format
    const formatValid = validateJsonSchemaFormat(schema, config.name, ajv);
    if (!formatValid) {
      formatErrors++;
      allValid = false;
    }

    // 3. Validate metadata and conventions
    const metadataValid = validateSchemaMetadata(schema, config, config.name);
    if (!metadataValid) {
      metadataErrors++;
      allValid = false;
    }

    // 4. Validate references
    const referencesValid = validateSchemaReferences(schema, config.name);
    if (!referencesValid) {
      referenceErrors++;
      allValid = false;
    }

    console.log(''); // Empty line for readability
  }

  // Summary
  console.log('📊 Validation Summary:');
  console.log(`   • Total schemas: ${EXPECTED_SCHEMAS.length}`);
  console.log(`   • Syntax errors: ${syntaxErrors}`);
  console.log(`   • Format errors: ${formatErrors}`);
  console.log(`   • Metadata errors: ${metadataErrors}`);
  console.log(`   • Reference errors: ${referenceErrors}`);

  if (allValid) {
    console.log('🎉 All schemas are valid JSON Schemas!');
    console.log('💡 Run tests to verify integration with src/validation');
  } else {
    const totalErrors = syntaxErrors + formatErrors + metadataErrors + referenceErrors;
    console.log(`❌ Found ${totalErrors} validation errors`);
  }

  return allValid;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  validateAllSchemas()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Validation script failed:', error);
      process.exit(1);
    });
}

export { validateAllSchemas };