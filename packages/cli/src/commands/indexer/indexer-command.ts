import { Command } from 'commander';
import { SimpleCommand } from '../../base/base-command';
import type { Adapters } from '@gitgov/core';
import type { BaseCommandOptions } from '../../interfaces/command';

/**
 * IndexerCommand Options - CLI flags and arguments
 */
export interface IndexerCommandOptions extends BaseCommandOptions {
  validateOnly?: boolean;  // --validate-only, -c
  force?: boolean;         // --force, -f
}

/**
 * IndexerCommand - Cache Control CLI Interface
 * 
 * Pure CLI implementation (NO Ink) that delegates all business logic
 * to the IndexerAdapter from @gitgov/core.
 * 
 * Responsibilities:
 * - Parse CLI flags and validate combinations
 * - Delegate to IndexerAdapter methods
 * - Format output (text/JSON) for user consumption
 * - Handle errors with user-friendly messages
 * - Provide progress feedback during operations
 */
export class IndexerCommand extends SimpleCommand<IndexerCommandOptions> {

  /**
   * Register the indexer command with Commander.js
   */
  register(program: Command): void {
    program
      .command('indexer')
      .description('Cache management and validation')
      .option('-c, --validate-only', 'Validate integrity only')
      .option('-f, --force', 'Force regeneration')
      .option('--json', 'JSON output')
      .option('--verbose', 'Verbose output')
      .option('--quiet', 'Quiet mode')
      .action(async (options) => {
        await this.execute(options);
      });
  }

  /**
   * [EARS-1] Main execution method for gitgov indexer command
   */
  async execute(options: IndexerCommandOptions): Promise<void> {
    try {
      // Get indexer adapter from dependency injection
      const indexerAdapter = await this.dependencyService.getIndexerAdapter();

      // 1. Validate flag combinations
      this.validateOptions(options);

      // 2. Execute appropriate operation based on flags
      if (options.validateOnly) {
        await this.executeValidateOnly(indexerAdapter, options);
      } else if (options.force) {
        await this.executeForceRegeneration(indexerAdapter, options);
      } else {
        await this.executeGeneration(indexerAdapter, options);
      }

    } catch (error) {
      // 3. Handle errors with user-friendly messages
      this.handleIndexerError(error, options);
      process.exit(1);
    }
  }

  /**
   * [EARS-2] Validates integrity without regenerating cache
   */
  private async executeValidateOnly(indexerAdapter: Adapters.IIndexerAdapter, options: IndexerCommandOptions): Promise<void> {
    if (!options.quiet) {
      console.log("🔍 Validating cache integrity...");
    }

    const report = await indexerAdapter.validateIntegrity();
    this.formatIntegrityReport(report, options);
  }

  /**
   * [EARS-3] Forces cache invalidation before regeneration
   */
  private async executeForceRegeneration(indexerAdapter: Adapters.IIndexerAdapter, options: IndexerCommandOptions): Promise<void> {
    if (!options.quiet) {
      console.log("🗑️  Invalidating existing cache...");
    }

    await indexerAdapter.invalidateCache();

    if (!options.quiet) {
      console.log("🔄 Generating fresh index...");
    }

    const report = await indexerAdapter.generateIndex();
    this.formatGenerationReport(report, options);
  }

  /**
   * [EARS-1] Standard cache generation
   */
  private async executeGeneration(indexerAdapter: Adapters.IIndexerAdapter, options: IndexerCommandOptions): Promise<void> {
    if (!options.quiet) {
      console.log("🔄 Generating index...");
    }

    const report = await indexerAdapter.generateIndex();
    this.formatGenerationReport(report, options);
  }

  /**
   * [EARS-9] Validates flag combinations for conflicts
   */
  private validateOptions(options: IndexerCommandOptions): void {
    // Check for conflicting flags
    if (options.validateOnly && options.force) {
      throw new Error("❌ Cannot use --validate-only with --force. Choose one option.");
    }

    if (options.quiet && options.verbose) {
      throw new Error("❌ Cannot use --quiet with --verbose. Choose one option.");
    }
  }

  /**
   * [EARS-4] Formats JSON output for generation report
   */
  private formatGenerationReport(report: Adapters.IndexGenerationReport, options: IndexerCommandOptions): void {
    if (options.json) {
      console.log(JSON.stringify({
        success: report.success,
        recordsProcessed: report.recordsProcessed,
        metricsCalculated: report.metricsCalculated,
        generationTime: report.generationTime,
        cacheSize: report.cacheSize,
        cacheStrategy: report.cacheStrategy,
        errors: report.errors,
        performance: report.performance
      }, null, 2));
      return;
    }

    // Text format output
    if (report.success) {
      console.log("✅ Index generated successfully!");

      if (options.verbose || !options.quiet) {
        console.log(`📊 Records processed: ${report.recordsProcessed}`);
        console.log(`🧮 Metrics calculated: ${report.metricsCalculated}`);
        console.log(`⏱️  Generation time: ${report.generationTime.toFixed(0)}ms`);
        console.log(`💾 Cache size: ${this.formatBytes(report.cacheSize)}`);
        console.log(`🔧 Cache strategy: ${report.cacheStrategy}`);
      }

      if (options.verbose) {
        console.log("📈 Performance breakdown:");
        console.log(`  Read time: ${report.performance.readTime.toFixed(0)}ms`);
        console.log(`  Calculation time: ${report.performance.calculationTime.toFixed(0)}ms`);
        console.log(`  Write time: ${report.performance.writeTime.toFixed(0)}ms`);
      }

      if (!options.quiet) {
        console.log("💡 Cache ready for fast queries in other commands");
      }
    } else {
      console.error("❌ Index generation failed");
      if (report.errors.length > 0) {
        console.error("Errors:");
        report.errors.forEach((error: string) => console.error(`  • ${error}`));
      }
    }
  }

  /**
   * [EARS-4] Formats JSON output for integrity report
   */
  private formatIntegrityReport(report: Adapters.IntegrityReport, options: IndexerCommandOptions): void {
    if (options.json) {
      console.log(JSON.stringify({
        status: report.status,
        recordsScanned: report.recordsScanned,
        errorsFound: report.errorsFound,
        warningsFound: report.warningsFound,
        validationTime: report.validationTime,
        checksumFailures: report.checksumFailures,
        signatureFailures: report.signatureFailures
      }, null, 2));
      return;
    }

    // Text format output
    const statusIcon = report.status === 'valid' ? '✅' :
      report.status === 'warnings' ? '⚠️' : '❌';

    console.log(`${statusIcon} Integrity check: ${report.status.toUpperCase()}`);

    if (options.verbose || !options.quiet) {
      console.log(`📊 Records scanned: ${report.recordsScanned}`);
      console.log(`⏱️  Validation time: ${report.validationTime.toFixed(0)}ms`);
    }

    if (report.errorsFound.length > 0) {
      console.log("❌ Errors found:");
      report.errorsFound.forEach((error: any) => {
        console.log(`  • ${error.type}: ${error.message} (${error.recordId})`);
      });
    }

    if (report.warningsFound.length > 0) {
      console.log("⚠️  Warnings found:");
      report.warningsFound.forEach((warning: any) => {
        console.log(`  • ${warning.type}: ${warning.message} (${warning.recordId})`);
      });
    }

    if (report.checksumFailures > 0) {
      console.log(`🔍 Checksum failures: ${report.checksumFailures}`);
    }

    if (report.signatureFailures > 0) {
      console.log(`🔐 Signature failures: ${report.signatureFailures}`);
    }
  }

  /**
   * [EARS-5] Handles errors with user-friendly messages and exit codes
   */
  private handleIndexerError(error: unknown, options: IndexerCommandOptions): void {
    let message: string;
    let exitCode: number = 1;

    if (error instanceof Error) {
      // Map specific error types to user-friendly messages
      if (error.message.includes('ProjectRootError')) {
        message = "❌ GitGovernance not initialized. Run 'gitgov init' first.";
        exitCode = 1;
      } else if (error.message.includes('PermissionError')) {
        message = "❌ Cannot write to .gitgov/index.json. Check file permissions.";
        exitCode = 1;
      } else if (error.message.includes('CorruptedCacheError')) {
        message = "⚠️ Cache corrupted. Use 'gitgov indexer --force' to regenerate.";
        exitCode = 1;
      } else if (error.message.includes('Cannot use --validate-only with --force')) {
        message = error.message;
        exitCode = 2; // Flag conflict error
      } else if (error.message.includes('Cannot use --quiet with --verbose')) {
        message = error.message;
        exitCode = 2; // Flag conflict error
      } else {
        message = `❌ Indexer operation failed: ${error.message}`;
        exitCode = 1;
      }
    } else {
      message = "❌ Unknown error occurred during indexation.";
      exitCode = 1;
    }

    if (options.json) {
      console.log(JSON.stringify({
        error: message,
        success: false,
        exitCode
      }, null, 2));
    } else {
      console.error(message);

      if (options.verbose && error instanceof Error) {
        console.error("🔍 Technical details:", error.stack);
      }
    }

    // Note: process.exit is called in the main execute method
  }

  /**
   * Helper method to format bytes in human-readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}
