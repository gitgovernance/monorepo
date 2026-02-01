#!/usr/bin/env tsx
/**
 * Generate index.ts files for schemas and types directories
 * 
 * This script creates appropriate index files for both:
 * - schemas/: Complex object exports with JSON imports
 * - types/: Simple re-exports of TypeScript types
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const SCHEMAS_GENERATED_DIR = path.join(__dirname, '../src/record_schemas/generated');
const TYPES_GENERATED_DIR = path.join(__dirname, '../src/types/generated');

/**
 * Convert filename to camelCase variable name
 */
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert filename to PascalCase type name
 */
function toPascalCase(str: string): string {
  return str.replace(/(^|_)([a-z])/g, (_, __, letter) => letter.toUpperCase());
}

/**
 * Generate schemas/index.ts with JSON imports and object exports
 */
function generateSchemasIndex() {
  console.log('🔄 Generating schemas/index.ts...');

  if (!fs.existsSync(SCHEMAS_GENERATED_DIR)) {
    console.warn(`⚠️  Schemas generated directory not found: ${SCHEMAS_GENERATED_DIR}`);
    return;
  }

  // Find all JSON schema files in generated/
  const jsonFiles = fs.readdirSync(SCHEMAS_GENERATED_DIR)
    .filter(file => file.endsWith('.json') && file.includes('_schema'))
    .sort();

  if (jsonFiles.length === 0) {
    console.warn('⚠️  No schema JSON files found');
    return;
  }

  // Generate imports (from same directory since we're in generated/)
  const imports = jsonFiles.map(file => {
    const baseName = path.basename(file, '.json');
    const varName = toCamelCase(baseName);
    return `import ${varName} from "./${file}";`;
  }).join('\n');

  // Generate exports object
  const exports = jsonFiles.map(file => {
    const baseName = path.basename(file, '.json');
    const varName = toCamelCase(baseName);
    const exportName = toPascalCase(baseName.replace('_schema', ''));
    return `  ${exportName}: ${varName},`;
  }).join('\n');

  // Generate schema names type
  const schemaTypes = jsonFiles.map(file => {
    const baseName = path.basename(file, '.json');
    const exportName = toPascalCase(baseName.replace('_schema', ''));
    return `  | "${exportName}"`;
  }).join('\n');

  const indexContent = `/**
 * GitGovernance Protocol Schemas
 * 
 * Auto-generated from blueprints. Do not edit manually.
 * Run 'pnpm sync:schemas' to update.
 */

${imports}

/**
 * All GitGovernance protocol schemas
 */
export const Schemas = {
${exports}
} as const;

/**
 * Schema names for type safety
 */
export type SchemaName = 
${schemaTypes};

/**
 * Get a schema by name
 */
export function getSchema(name: SchemaName) {
  return Schemas[name];
}

/**
 * Get all schema names
 */
export function getSchemaNames(): SchemaName[] {
  return Object.keys(Schemas) as SchemaName[];
}

/**
 * Check if a schema exists
 */
export function hasSchema(name: string): name is SchemaName {
  return name in Schemas;
}
`;

  const indexPath = path.join(SCHEMAS_GENERATED_DIR, 'index.ts');
  fs.writeFileSync(indexPath, indexContent);

  console.log(`✅ Generated schemas/generated/index.ts with ${jsonFiles.length} schemas`);
}

/**
 * Generate types/index.ts with simple re-exports
 */
function generateTypesIndex() {
  console.log('🔄 Generating types/index.ts...');

  if (!fs.existsSync(TYPES_GENERATED_DIR)) {
    console.warn(`⚠️  Types generated directory not found: ${TYPES_GENERATED_DIR}`);
    return;
  }

  // Find all TypeScript type files in generated/ (excluding embedded_metadata.ts)
  const tsFiles = fs.readdirSync(TYPES_GENERATED_DIR)
    .filter(file => file.endsWith('.ts') && file !== 'index.ts' && file !== 'embedded_metadata.ts')
    .sort();

  if (tsFiles.length === 0) {
    console.warn('⚠️  No TypeScript type files found');
    return;
  }

  // Generate simple re-exports (from same directory since we're in generated/)
  const exports = tsFiles.map(file => {
    const baseName = path.basename(file, '.ts');
    return `export * from "./${baseName}";`;
  }).join('\n');

  const indexContent = `/**
 * GitGovernance Protocol Types
 * 
 * Auto-generated from JSON schemas. Do not edit manually.
 * Run 'pnpm compile:types' to update.
 */

${exports}
`;

  const indexPath = path.join(TYPES_GENERATED_DIR, 'index.ts');
  fs.writeFileSync(indexPath, indexContent);

  console.log(`✅ Generated types/generated/index.ts with ${tsFiles.length} type files`);
}

/**
 * Generate both index files
 */
async function generateIndexes() {
  console.log('📁 Generating index files...');

  try {
    generateSchemasIndex();
    generateTypesIndex();
    console.log('🎉 Successfully generated all index files!');
  } catch (error) {
    console.error('❌ Failed to generate index files:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateIndexes().catch(console.error);
}

export { generateIndexes, generateSchemasIndex, generateTypesIndex };
