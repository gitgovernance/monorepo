#!/usr/bin/env node
// Bundle schemas for production CLI

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sourceDir = path.resolve(__dirname, '../../blueprints/03_products/protocol');
const targetDir = path.resolve(__dirname, '../dist/schemas');

console.log('📦 Bundling schemas for production...');

// Create target directory
fs.mkdirSync(targetDir, { recursive: true });

// Copy only the schemas we need
const schemas = [
  '01_embedded/embedded_metadata_schema.yaml',
  '02_actor/actor_record_schema.yaml',
  '03_agent/agent_record_schema.yaml',
  '04_task/task_record_schema.yaml',
  '05_execution/execution_record_schema.yaml',
  '06_changelog/changelog_record_schema.yaml',
  '07_feedback/feedback_record_schema.yaml',
  '08_cycle/cycle_record_schema.yaml',
  '09_workflow_methodology/workflow_methodology_schema.yaml'
];

schemas.forEach(schema => {
  const source = path.join(sourceDir, schema);
  const target = path.join(targetDir, path.basename(schema));

  if (fs.existsSync(source)) {
    fs.copyFileSync(source, target);
    console.log(`✅ Bundled: ${path.basename(schema)}`);
  } else {
    console.warn(`⚠️  Missing: ${schema}`);
  }
});

console.log('🎉 Schemas bundled successfully!');
