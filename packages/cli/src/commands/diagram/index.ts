import { Command } from 'commander';
import { render } from 'ink';
import React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import { DiagramDashboard } from '../../components/diagram/DiagramDashboard';
import type { DiagramCommandOptions } from '../../types/command-options';

/**
 * Register diagram commands following GitGovernance CLI standard
 */
export function registerDiagramCommands(program: Command): void {
  const diagram = program
    .command('diagram')
    .description('Generate and manage workflow diagrams (Interactive TUI)')
    .alias('d');

  // Main diagram command (TUI) - no default action for help to work
  diagram
    .option('-o, --output <file>', 'Output file (default: gitgov_content_map_diagram.md at project root)', 'gitgov_content_map_diagram.md')
    .option('-v, --verbose', 'Show detailed information')
    .option('-q, --quiet', 'Suppress non-essential output');

  // Generate subcommand (default behavior)
  diagram
    .command('generate', { isDefault: true })
    .description('Generate workflow diagram (launches TUI)')
    .option('-w, --watch', 'Start in watch mode')
    .option('--cycle <cycleId>', 'Filter to show only a specific cycle and its related entities')
    .option('--task <taskId>', 'Filter to show only a specific task and its related entities')
    .option('--package <packageName>', 'Filter to show only entities related to a specific package')
    .action(async (options: DiagramCommandOptions) => {
      // NEW LOGIC:
      // - If --watch is specified: show TUI (with or without filters)
      // - If no --watch: generate diagram directly (with or without filters)
      // This allows both filtered and full diagrams to be generated without TUI

      if (options.watch) {
        // Show TUI with watch mode (with or without filters)
        const { ConfigManager } = await import('../../../../core/src/config_manager');

        const projectRoot = ConfigManager.findProjectRoot();
        if (!projectRoot) {
          console.error('❌ Could not find project root');
          process.exit(1);
        }

        const gitgovPath = ConfigManager.getGitgovPath();

        const props = {
          gitgovPath,  // ✅ USING ConfigManager consistently
          outputPath: options.output || 'gitgov_content_map_diagram.md',
          watchMode: true as const, // Always true when --watch is specified
          verbose: options.verbose || false,
          quiet: options.quiet || false,
          ...(options.cycle && { filterCycle: options.cycle }),
          ...(options.task && { filterTask: options.task }),
          ...(options.package && { filterPackage: options.package }),
        };

        render(React.createElement(DiagramDashboard, props));
      } else {
        // Generate diagram directly (with or without filters)
        console.log('🎯 Generating diagram...');
        const { DiagramGenerator } = await import('../../../../core/src/modules/diagram_generator');
        const { ConfigManager } = await import('../../../../core/src/config_manager');

        try {
          const projectRoot = ConfigManager.findProjectRoot();
          if (!projectRoot) {
            console.error('❌ Could not find project root');
            process.exit(1);
          }

          const generator = new DiagramGenerator();
          const gitgovPath = ConfigManager.getGitgovPath();

          // Build filters (may be empty for full diagram)
          const filters: Record<string, string> = {};
          if (options.cycle) filters['cycleId'] = options.cycle;
          if (options.task) filters['taskId'] = options.task;
          if (options.package) filters['packageName'] = options.package;

          const outputPath = options.output || 'gitgov_content_map_diagram.md';
          const fullOutputPath = path.join(projectRoot, outputPath);

          // Build filters with rootCycle logic
          let finalFilters = Object.keys(filters).length > 0 ? filters : undefined;

          // If no filters specified, try to use rootCycle from config using core ConfigManager
          if (!finalFilters) {
            try {
              const { Config } = await import('../../../../core/src');
              const configManager = Config.createConfigManager(projectRoot);
              const rootCycle = await configManager.getRootCycle();

              if (rootCycle) {
                console.log(`🎯 Using root cycle: ${rootCycle}`);
                finalFilters = { cycleId: rootCycle };
              } else {
                console.log('📊 Root cycle not defined in config, showing full diagram');
              }
            } catch (error) {
              console.log('❌ Error loading config via core:', error instanceof Error ? error.message : String(error));
              console.log('📊 Falling back to full diagram (no filters)');
            }
          }

          const diagramContent = await generator.generateFromFiles(gitgovPath, finalFilters);
          await fs.promises.writeFile(fullOutputPath, diagramContent, 'utf-8');

          let filterInfo = '📊 Full diagram (no filters)';
          if (Object.keys(filters).length > 0) {
            filterInfo = `📊 Filters applied: ${JSON.stringify(filters)}`;
          } else if (finalFilters?.['cycleId']) {
            filterInfo = `🎯 Root cycle applied: ${finalFilters['cycleId']}`;
          }

          console.log(`✅ Diagram generated: ${fullOutputPath}`);
          console.log(filterInfo);

        } catch (error) {
          console.error('❌ Error generating diagram:', error);
          process.exit(1);
        }
      }
    });
}
