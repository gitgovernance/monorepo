#!/usr/bin/env tsx
/**
 * Compile JSON schemas to TypeScript types
 * 
 * This script reads the JSON schemas from src/schemas/ (with $ref references)
 * and generates TypeScript types using json-schema-to-typescript.
 * It handles $ref resolution automatically.
 */

import * as fs from 'fs';
import * as path from 'path';
import { compile } from 'json-schema-to-typescript';
import { fileURLToPath } from 'url';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const SCHEMAS_DIR = path.join(__dirname, '../src/schemas/generated');
const OUTPUT_DIR = path.join(__dirname, '../src/types/generated');

/**
 * Generate schema mappings by reading all JSON files in the schemas directory
 */
function generateSchemaMappings(schemasDir: string): Record<string, string> {
  const mappings: Record<string, string> = {};

  if (!fs.existsSync(schemasDir)) {
    console.warn(`⚠️  Schemas directory not found: ${schemasDir}`);
    return mappings;
  }

  const files = fs.readdirSync(schemasDir)
    .filter(file => file.endsWith('.json'))
    .sort();

  for (const jsonFile of files) {
    // Convert all schemas consistently: "actor_record_schema.json" → "actor_record.ts"
    const tsFileName = jsonFile.replace('_schema.json', '.ts');
    mappings[jsonFile] = tsFileName;
  }

  return mappings;
}

/**
 * Custom resolver for $ref references within our schemas directory
 */
function createRefResolver(schemasDir: string) {
  return {
    order: 1,
    canRead: (file: any) => {
      return typeof file.url === 'string' && file.url.startsWith('ref:');
    },
    read: (file: any) => {
      const schemaName = file.url.replace('ref:', '');
      const jsonPath = path.join(schemasDir, `${schemaName}.json`);

      if (fs.existsSync(jsonPath)) {
        const content = fs.readFileSync(jsonPath, 'utf8');
        return JSON.parse(content);
      } else {
        console.warn(`⚠️  Referenced schema not found: ${jsonPath}`);
        return {}; // Return empty schema as fallback
      }
    }
  };
}

async function compileSchemas() {
  console.log('🔄 Compiling JSON schemas to TypeScript types...');

  // Create output directory if it doesn't exist
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const compiledTypes: string[] = [];

  // Generate schema mappings dynamically
  const schemaMappings = generateSchemaMappings(SCHEMAS_DIR);

  // Process each schema mapping
  for (const [jsonFile, tsFile] of Object.entries(schemaMappings)) {
    const jsonPath = path.join(SCHEMAS_DIR, jsonFile);
    const tsPath = path.join(OUTPUT_DIR, tsFile);

    if (!fs.existsSync(jsonPath)) {
      console.warn(`⚠️  Schema not found: ${jsonPath}`);
      continue;
    }

    try {
      // Read JSON schema
      const schemaContent = fs.readFileSync(jsonPath, 'utf8');
      const schema = JSON.parse(schemaContent);

      // Generate TypeScript type name
      const typeName = path.basename(tsFile, '.ts')
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');

      // Compile to TypeScript with custom options
      const tsContent = await compile(schema, typeName, {
        bannerComment: `/**
 * This file was automatically generated from ${jsonFile}.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source schema,
 * and run 'pnpm compile:types' to regenerate this file.
 */`,
        style: {
          singleQuote: true,
        },
        // Custom resolver for handling $ref to other schemas
        $refOptions: {
          resolve: {
            // Custom resolver for our schema references
            file: createRefResolver(SCHEMAS_DIR)
          }
        },
        // Additional options for better type generation
        additionalProperties: false,
        enableConstEnums: true,
        strictIndexSignatures: true,
      });

      // Write TypeScript file
      fs.writeFileSync(tsPath, tsContent);

      console.log(`✅ ${jsonFile} → types/${tsFile}`);
      compiledTypes.push(path.basename(tsFile, '.ts'));

    } catch (error) {
      console.error(`❌ Failed to compile ${jsonFile}:`, error);
      // Don't exit on error, continue with other schemas
      console.log(`   Continuing with other schemas...`);
    }
  }

  console.log(`🎉 Successfully compiled ${compiledTypes.length} schema types!`);

  if (compiledTypes.length > 0) {
    console.log(`📁 Types generated in: ${OUTPUT_DIR}`);
    console.log(`🔗 Available types: ${compiledTypes.join(', ')}`);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  compileSchemas().catch(console.error);
}

export { compileSchemas };
