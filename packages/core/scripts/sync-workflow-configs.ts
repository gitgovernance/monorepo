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
const ADAPTER_DIR = path.join(__dirname, '../src/adapters/workflow_methodology_adapter');

// Configuration files to sync
const CONFIG_FILES = [
  'workflow_methodology_default.json',
  'workflow_methodology_scrum.json'
];

function syncWorkflowConfigs() {
  console.log('🔄 Syncing workflow methodology configurations...');

  // Ensure adapter directory exists
  fs.mkdirSync(ADAPTER_DIR, { recursive: true });

  const syncedConfigs: string[] = [];

  for (const configFile of CONFIG_FILES) {
    const sourcePath = path.join(BLUEPRINTS_WORKFLOW_DIR, configFile);
    const targetPath = path.join(ADAPTER_DIR, configFile);

    if (!fs.existsSync(sourcePath)) {
      console.warn(`⚠️  Configuration not found: ${sourcePath}`);
      continue;
    }

    try {
      // Read source configuration
      const configContent = fs.readFileSync(sourcePath, 'utf8');

      // Validate it's valid JSON
      JSON.parse(configContent);

      // Write to adapter directory
      fs.writeFileSync(targetPath, configContent);

      console.log(`✅ ${configFile} → adapters/workflow_methodology_adapter/`);
      syncedConfigs.push(configFile);

    } catch (error) {
      console.error(`❌ Failed to sync ${configFile}:`, error);
      process.exit(1);
    }
  }

  console.log(`🎉 Successfully synced ${syncedConfigs.length} workflow configurations!`);

  if (syncedConfigs.length > 0) {
    console.log(`📁 Configurations available in: ${ADAPTER_DIR}`);
    console.log(`🔗 Synced files: ${syncedConfigs.join(', ')}`);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  syncWorkflowConfigs();
}

export { syncWorkflowConfigs };
