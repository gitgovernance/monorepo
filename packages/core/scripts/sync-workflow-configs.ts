#!/usr/bin/env tsx
/**
 * Sync workflow methodology configurations from blueprints to adapters
 * 
 * This script copies the canonical workflow methodology JSON files
 * from blueprints to the workflow_methodology_adapter directory
 * so they can be packaged with the published npm package.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const BLUEPRINTS_WORKFLOW_DIR = path.join(
  __dirname,
  '../../blueprints/03_products/core/specs/adapters/workflow_methodology_adapter'
);
const GENERATED_DIR = path.join(
  __dirname,
  '../src/adapters/workflow_methodology_adapter/generated'
);

// Configuration files to sync: [source relative to BLUEPRINTS_WORKFLOW_DIR, target filename in generated/]
const CONFIG_FILES: [string, string][] = [
  ['templates/kanban_workflow.json', 'kanban_workflow.json'],
  ['templates/scrum_workflow.json', 'scrum_workflow.json']
];

function syncWorkflowConfigs() {
  console.log('🔄 Syncing workflow methodology configurations...');

  // Ensure generated directory exists
  fs.mkdirSync(GENERATED_DIR, { recursive: true });

  const syncedConfigs: string[] = [];

  for (const [sourceRelative, targetFile] of CONFIG_FILES) {
    const sourcePath = path.join(BLUEPRINTS_WORKFLOW_DIR, sourceRelative);
    const targetPath = path.join(GENERATED_DIR, targetFile);

    if (!fs.existsSync(sourcePath)) {
      console.warn(`⚠️  Configuration not found: ${sourcePath}`);
      continue;
    }

    try {
      // Read source configuration
      const configContent = fs.readFileSync(sourcePath, 'utf8');

      // Validate it's valid JSON
      JSON.parse(configContent);

      // Write to generated directory
      fs.writeFileSync(targetPath, configContent);

      console.log(`✅ ${sourceRelative} → generated/${targetFile}`);
      syncedConfigs.push(targetFile);

    } catch (error) {
      console.error(`❌ Failed to sync ${sourceRelative}:`, error);
      process.exit(1);
    }
  }

  console.log(`🎉 Successfully synced ${syncedConfigs.length} workflow configurations!`);

  if (syncedConfigs.length > 0) {
    console.log(`📁 Configurations available in: ${GENERATED_DIR}`);
    console.log(`🔗 Synced files: ${syncedConfigs.join(', ')}`);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  syncWorkflowConfigs();
}

export { syncWorkflowConfigs };
