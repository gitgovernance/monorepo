#!/usr/bin/env tsx

/**
 * Quick script to update gitgov_content_map_diagram.md using the new DiagramGenerator
 * Usage: npx tsx packages/core/scripts/update-diagram.ts
 */

import { DiagramGenerator } from '../src/diagram_generator/index.js';
import { ConfigManager } from '../src/config_manager/index.js';
import { promises as fs } from 'fs';
import * as path from 'path';

async function updateDiagram() {
  console.log('🔄 Updating GitGovernance workflow diagram...');

  try {
    const startTime = performance.now();

    // Find project root (where .gitgov/ is located)
    const projectRoot = ConfigManager.findProjectRoot();
    if (!projectRoot) {
      throw new Error("Could not find project root. Make sure you are inside a GitGovernance repository.");
    }

    // Initialize diagram generator with canonical options
    const generator = new DiagramGenerator({
      layout: 'LR',
      includeEpicTasks: true,
      maxDepth: 4,
      colorScheme: 'default',
      showAssignments: false,
    });

    // Generate diagram from .gitgov/ files
    const gitgovPath = path.join(projectRoot, '.gitgov');
    const diagramContent = await generator.generateFromFiles(gitgovPath);

    // Write to output file at project root
    const outputPath = path.join(projectRoot, 'gitgov_content_map_diagram.md');
    await fs.writeFile(outputPath, diagramContent);

    const endTime = performance.now();
    const metrics = generator.getMetrics();

    console.log('✅ Diagram updated successfully!');
    console.log(`📊 Generation time: ${(endTime - startTime).toFixed(2)}ms`);
    console.log(`📈 Cache hit ratio: ${(metrics.cacheHitRatio * 100).toFixed(1)}%`);
    console.log(`📄 Output: ${outputPath}`);

  } catch (error) {
    console.error('❌ Error updating diagram:', error);
    process.exit(1);
  }
}

// Run the script
updateDiagram();
