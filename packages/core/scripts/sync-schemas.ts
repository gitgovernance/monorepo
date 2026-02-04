#!/usr/bin/env tsx
/**
 * Sync schemas from blueprints to core/src/record_schemas as JSON
 * 
 * This script reads the canonical YAML schemas from blueprints
 * and converts them to JSON for direct import in TypeScript.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { fileURLToPath } from 'url';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const BLUEPRINTS_PROTOCOL_DIR = path.join(__dirname, '../../private/packages/blueprints/03_products/protocol');
const CORE_SCHEMAS_DIR = path.join(__dirname, '../src/record_schemas/generated');

// Schema mappings (blueprint folder → output name)
const SCHEMA_MAPPINGS = {
  '01_embedded': 'embedded_metadata_schema',
  '02_actor': 'actor_record_schema',
  '03_agent': 'agent_record_schema',
  '04_task': 'task_record_schema',
  '06_execution': 'execution_record_schema',
  '07_changelog': 'changelog_record_schema',
  '08_feedback': 'feedback_record_schema',
  '05_cycle': 'cycle_record_schema',
  '09_workflow': 'workflow_record_schema',
};

function syncSchemas() {
  console.log('🔄 Syncing schemas from blueprints to core...');

  // Create schemas directory if it doesn't exist
  fs.mkdirSync(CORE_SCHEMAS_DIR, { recursive: true });

  const syncedSchemas: string[] = [];

  // Process each schema mapping
  for (const [blueprintFolder, schemaName] of Object.entries(SCHEMA_MAPPINGS)) {
    const yamlPath = path.join(BLUEPRINTS_PROTOCOL_DIR, blueprintFolder, `${schemaName}.yaml`);
    const jsonPath = path.join(CORE_SCHEMAS_DIR, `${schemaName}.json`);

    if (!fs.existsSync(yamlPath)) {
      console.warn(`⚠️  Schema not found: ${yamlPath}`);
      continue;
    }

    try {
      // Read and parse YAML
      const yamlContent = fs.readFileSync(yamlPath, 'utf8');
      const schemaObject = yaml.load(yamlContent) as any;

      // Update $id to use .json extension instead of .yaml (for consistency)
      if (schemaObject && typeof schemaObject === 'object' && schemaObject.$id) {
        schemaObject.$id = schemaObject.$id.replace(/\.yaml$/, '.json');
      }

      // Update $ref paths to use schema names without extensions (for AJV aliases)
      updateSchemaRefs(schemaObject);

      // Write as JSON
      fs.writeFileSync(jsonPath, JSON.stringify(schemaObject, null, 2));

      console.log(`✅ ${blueprintFolder}/${schemaName}.yaml → schemas/${schemaName}.json`);
      syncedSchemas.push(schemaName);

    } catch (error) {
      console.error(`❌ Failed to process ${yamlPath}:`, error);
      process.exit(1);
    }
  }

  console.log(`🎉 Successfully synced ${syncedSchemas.length} schemas!`);
}

// Utility function to update $ref paths
function updateSchemaRefs(obj: any): void {
  if (!obj || typeof obj !== 'object') return;

  for (const key in obj) {
    if (key === '$ref' && typeof obj[key] === 'string') {
      // Convert "../02_actor/actor_record_schema.yaml" to "ref:actor_record_schema"
      obj[key] = obj[key].replace(/.*\/([^/]+)_schema\.yaml$/, 'ref:$1_schema');
    } else if (typeof obj[key] === 'object') {
      updateSchemaRefs(obj[key]);
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  syncSchemas();
}

export { syncSchemas };
