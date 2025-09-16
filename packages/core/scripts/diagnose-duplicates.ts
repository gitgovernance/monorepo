#!/usr/bin/env tsx

/**
 * Diagnostic script to detect duplicate nodes and edges in GitGovernance data
 * Usage: npx tsx packages/core/scripts/diagnose-duplicates.ts
 */

import { DiagramGenerator } from '../src/modules/diagram_generator/index.js';
import { ConfigManager } from '../src/config_manager/index.js';
import * as path from 'path';

async function diagnoseDuplicates() {
  console.log('🔍 Diagnosing duplicates in GitGovernance data...');

  try {
    // Find project root
    const projectRoot = ConfigManager.findProjectRoot();
    if (!projectRoot) {
      throw new Error("Could not find project root.");
    }

    // Initialize generator
    const generator = new DiagramGenerator({
      layout: 'LR',
      includeEpicTasks: true,
      maxDepth: 4,
      colorScheme: 'default',
      showAssignments: false,
    });

    // Load records
    const gitgovPath = path.join(projectRoot, '.gitgov');
    const cycles = await generator.loadCycleRecords(gitgovPath);
    const tasks = await generator.loadTaskRecords(gitgovPath);

    console.log(`📊 Loaded ${cycles.length} cycles and ${tasks.length} tasks`);

    // Detect duplicates using our new method
    const duplicates = generator.analyzer.detectDuplicates(cycles, tasks);

    if (duplicates.duplicateNodes.length === 0 && duplicates.duplicateEdges.length === 0) {
      console.log('✅ No duplicates found!');
    } else {
      console.log('\n🔴 Duplicates detected:');

      if (duplicates.duplicateNodes.length > 0) {
        console.log('\n📦 Duplicate Nodes:');
        duplicates.duplicateNodes.forEach(dup => {
          console.log(`  • ${dup.id} (appears ${dup.count} times)`);
          console.log(`    Sources: ${dup.sources.join(', ')}`);
        });
      }

      if (duplicates.duplicateEdges.length > 0) {
        console.log('\n🔗 Duplicate Edges:');
        duplicates.duplicateEdges.forEach(dup => {
          console.log(`  • ${dup.edge} (appears ${dup.count} times)`);
        });
      }
    }

    // Generate graph with deduplication
    console.log('\n🔄 Generating deduplicated graph...');
    const graph = generator.analyzer.analyzeRelationships(cycles, tasks);

    if (graph.metadata.duplicatesRemoved) {
      const { nodes: nodesDup, edges: edgesDup } = graph.metadata.duplicatesRemoved;
      if (nodesDup > 0 || edgesDup > 0) {
        console.log(`✂️  Removed ${nodesDup} duplicate nodes and ${edgesDup} duplicate edges`);
      } else {
        console.log('✅ No duplicates were removed (clean data)');
      }
    }

    console.log(`📈 Final graph: ${graph.metadata.nodeCount} nodes, ${graph.metadata.edgeCount} edges`);

  } catch (error) {
    console.error('❌ Error during diagnosis:', error);
    process.exit(1);
  }
}

// Run the diagnostic
diagnoseDuplicates();
