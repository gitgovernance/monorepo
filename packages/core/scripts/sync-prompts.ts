#!/usr/bin/env tsx
/**
 * Sync Agent Prompts Script
 * 
 * Copies agent prompts from monorepo root docs/ to packages/core/prompts/
 * for inclusion in npm package publication.
 * 
 * Usage:
 *   pnpm sync:prompts
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONOREPO_ROOT = path.resolve(__dirname, '../../..');
const SOURCE_DIR = path.join(MONOREPO_ROOT, 'docs');
const TARGET_DIR = path.join(__dirname, '../prompts');

// Agent prompts to sync (official prompts that ship with @gitgov/core)
const PROMPTS_TO_SYNC = [
  'gitgov_agent_prompt.md',
];

async function syncPrompts(): Promise<void> {
  console.log('🔄 Syncing agent prompts...\n');

  // Ensure target directory exists
  try {
    await fs.mkdir(TARGET_DIR, { recursive: true });
  } catch (error) {
    console.error(`❌ Failed to create target directory: ${TARGET_DIR}`);
    throw error;
  }

  let successCount = 0;
  let errorCount = 0;

  for (const promptFile of PROMPTS_TO_SYNC) {
    const sourcePath = path.join(SOURCE_DIR, promptFile);
    const targetPath = path.join(TARGET_DIR, promptFile);

    try {
      // Check if source exists
      await fs.access(sourcePath);

      // Copy file
      await fs.copyFile(sourcePath, targetPath);

      console.log(`✅ ${promptFile}`);
      successCount++;
    } catch (error) {
      console.error(`❌ ${promptFile} - ${error instanceof Error ? error.message : 'Unknown error'}`);
      errorCount++;
    }
  }

  console.log(`\n🎉 Sync complete: ${successCount} prompts synced, ${errorCount} errors`);
  console.log(`📁 Target directory: ${TARGET_DIR}\n`);

  if (errorCount > 0) {
    process.exit(1);
  }
}

// Run sync
syncPrompts().catch((error) => {
  console.error('❌ Sync failed:', error);
  process.exit(1);
});

