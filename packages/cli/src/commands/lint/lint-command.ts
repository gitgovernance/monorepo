import { Command } from 'commander';
import { BaseCommand } from '../../base/base-command';
import type { BaseCommandOptions } from '../../interfaces/command';
import type { LintReport, LintResult, ValidatorType, FixReport } from '@gitgov/core';
import type { IFsLintModule, FsLintOptions, FsFixOptions } from '@gitgov/core/fs';
import * as path from 'path';
import { promises as fs } from 'fs';

/**
 * Lint Command Options
 * Maps CLI flags to LintModule options
 */
export interface LintCommandOptions extends BaseCommandOptions {
  /** Directorio o archivo a validar (default: '.gitgov/') */
  path?: string;
  /** Validar referencias tipadas (mapea a validateReferences) */
  references?: boolean;
  /** Validar resolución de actores (mapea a validateActors) */
  actors?: boolean;
  /** Intentar reparar errores automáticamente (default: false) */
  fix?: boolean;
  /** Lista de validadores específicos a arreglar con --fix (separados por comas, ej: SIGNATURE_STRUCTURE) */
  fixValidators?: string;
  /** Solo detectar y listar records obsoletos sin auto-fix (default: false) */
  checkMigrations?: boolean;
  /** Formato de salida (default: 'text') */
  format?: 'text' | 'json';
  /** Modo silencioso - solo errores (default: false) */
  quiet?: boolean;
  /** Lista de validadores a excluir (separados por comas) */
  excludeValidators?: string;
  /** Agrupar output por validator|file|none (default: 'validator') */
  groupBy?: 'validator' | 'file' | 'none';
  /** Mostrar solo resumen sin detalles (default: false) */
  summary?: boolean;
  /** Limitar cantidad de errores mostrados (0 = todos, default: 0) */
  maxErrors?: number;
}

/**
 * Lint Command - Thin wrapper for @gitgov/core/lint module
 * 
 * Implements Quality Model Layer 1 (Structural + Referential Integrity).
 * All validation logic lives in LintModule.
 * 
 * This command is responsible for:
 * - Parsing CLI arguments
 * - Injecting dependencies
 * - Formatting output (text/JSON)
 * - Setting exit codes
 */
export class LintCommand extends BaseCommand {
  protected commandName = 'lint';
  protected description = 'Validate GitGovernance records (Quality Layer 1)';

  constructor() {
    super();
  }

  /**
   * Register the lint command with Commander
   */
  register(program: Command): void {
    const lintCmd = program
      .command('lint [path]')
      .description(this.description)
      .option('-r, --references', 'Validate typed references', false)
      .option('-a, --actors', 'Validate actor resolution', false)
      .option('--fix', 'Auto-fix problems (creates backups)', false)
      .option('--fix-validators <validators>', 'Comma-separated list of validator types to fix (e.g., SIGNATURE_STRUCTURE). If not specified, fixes all fixable problems.', '')
      .option('--check-migrations', 'List legacy records without fixing', false)
      .option('-f, --format <type>', 'Output format (text|json)', 'text')
      .option('-q, --quiet', 'Quiet mode - only errors', false)
      .option('--exclude-validators <validators>', 'Comma-separated list of validator types to exclude (e.g., SCHEMA_VALIDATION)', '')
      .option('--group-by <type>', 'Group output by validator|file|none', 'validator')
      .option('--summary', 'Show only summary without individual error details', false)
      .option('--max-errors <n>', 'Limit the number of errors/warnings displayed (0 = all, default: 0)', '0')
      .action(async (path: string | undefined, options: LintCommandOptions & { maxErrors?: string | number }) => {
        // Parse maxErrors from string to number if provided
        const parsedMaxErrors = options.maxErrors !== undefined
          ? (typeof options.maxErrors === 'string' ? parseInt(options.maxErrors, 10) : options.maxErrors)
          : undefined;

        const parsedOptions: LintCommandOptions = {
          ...options,
          ...(parsedMaxErrors !== undefined && { maxErrors: parsedMaxErrors })
        };
        await this.execute({ path: path || '.gitgov/', ...parsedOptions });
      });
  }

  /**
   * Execute lint command
   * [EARS-A1, EARS-A2, EARS-A3]
   */
  async execute(options: LintCommandOptions): Promise<void> {
    try {
      const startTime = Date.now();

      // [EARS-A1] Parse and set defaults
      const inputPath = options.path || '.gitgov/';
      const format = options.format || 'text';
      const quiet = options.quiet || false;

      // [EARS-A2] Initialize LintModule with DI
      const lintModule = await this.container.getLintModule();

      // [EARS-A4] Detect if path is a file or directory
      let isFile = false;
      let filePath = inputPath;

      try {
        // Check if it's a file by extension or by checking filesystem
        if (inputPath.endsWith('.json')) {
          isFile = true;
        } else {
          // Check if it's actually a file
          const stats = await fs.stat(inputPath);
          isFile = stats.isFile();
        }
      } catch {
        // If stat fails, assume it's a directory or use extension check
        isFile = inputPath.endsWith('.json');
      }

      // Map CLI options to FsLintModule options
      const lintOptions: Partial<FsLintOptions> = {
        path: isFile ? path.dirname(inputPath) : inputPath,
        validateReferences: options.references || false,
        validateActors: options.actors || false,
        validateFileNaming: true // Always validate file naming conventions
      };

      if (!quiet) {
        if (isFile) {
          this.logger.info(`🔍 Validating file: ${inputPath}...`);
        } else {
          this.logger.info(`🔍 Validating records in ${inputPath}...`);
        }
      }

      // [EARS-A3] Invoke core module - use lintFile for single files, lint for directories
      const report = isFile
        ? await lintModule.lintFile(filePath, lintOptions)
        : await lintModule.lint(lintOptions);

      // [EARS-A5] Filter results by excluded validators
      let filteredReport = report;
      if (options.excludeValidators && options.excludeValidators.length > 0) {
        const excluded = options.excludeValidators.split(',').map(v => v.trim());
        filteredReport = {
          ...report,
          results: report.results.filter((r: LintResult) => !excluded.includes(r.validator)),
          summary: {
            ...report.summary,
            errors: report.results.filter((r: LintResult) => !excluded.includes(r.validator) && r.level === 'error').length,
            warnings: report.results.filter((r: LintResult) => !excluded.includes(r.validator) && r.level === 'warning').length,
            fixable: report.results.filter((r: LintResult) => !excluded.includes(r.validator) && r.fixable).length
          }
        };
      }

      const executionTime = Date.now() - startTime;

      // [EARS-B1, EARS-B2] Format and display output
      if (options.checkMigrations) {
        // [EARS-C1] Migration detection mode
        this.formatMigrationReport(filteredReport, format, quiet);
        // [EARS-D2] Exit code based on filtered report
        const exitCode = filteredReport.summary.errors > 0 ? 1 : 0;
        process.exit(exitCode);
      } else if (options.fix) {
        // [EARS-D1] Fix mode
        const fixReport = await this.handleFixMode(lintModule, filteredReport, options, format, quiet);
        // [EARS-D2] Exit code based on remaining errors after fix
        // If fix failed for some items, exit with code 1
        const exitCode = (fixReport?.summary.failed ?? 0) > 0 ? 1 : 0;
        process.exit(exitCode);
      } else {
        // [EARS-B1, EARS-B2, EARS-E1, EARS-E2] Normal lint mode
        const maxErrors = options.maxErrors !== undefined ? parseInt(options.maxErrors.toString(), 10) : 0;
        this.formatLintReport(
          filteredReport,
          format,
          quiet,
          executionTime,
          options.groupBy || 'validator',
          options.summary || false,
          maxErrors
        );
        // [EARS-D2] Exit code 1 when errors, [EARS-D3] Exit code 0 when no errors
        const exitCode = filteredReport.summary.errors > 0 ? 1 : 0;
        process.exit(exitCode);
      }

    } catch (error) {
      this.logger.error('❌ Lint command failed:', error);
      process.exit(1);
    }
  }

  /**
   * Handle fix mode
   * [EARS-D1]
   * @returns FixReport for exit code calculation
   */
  private async handleFixMode(
    lintModule: IFsLintModule,
    lintReport: LintReport,
    options: LintCommandOptions,
    format: string,
    quiet: boolean
  ): Promise<FixReport | undefined> {
    const fixableCount = lintReport.summary.fixable;

    if (fixableCount === 0) {
      if (!quiet) {
        this.logger.info('\x1b[32m✓ No fixable problems found\x1b[0m');
      }
      this.formatLintReport(lintReport, format, quiet, lintReport.summary.executionTime, 'validator', false, 0);
      return undefined;
    }

    if (!quiet) {
      this.logger.info(`\n🔧 Attempting to fix ${fixableCount} problem(s)...`);
    }

    // Get current actor for signing fixed records
    const identityAdapter = await this.container.getIdentityAdapter();
    const currentActor = await identityAdapter.getCurrentActor();

    // Load private key via KeyProvider (DI)
    let privateKey: string | undefined;
    try {
      const keyProvider = this.container.getKeyProvider();
      const key = await keyProvider.getPrivateKey(currentActor.id);
      privateKey = key ?? undefined;
    } catch (error) {
      // Private key not found - this is okay for non-legacy fixes
      if (!quiet) {
        this.logger.warn(`⚠️  Private key not found for ${currentActor.id}`);
        this.logger.warn('   Legacy record fixes will not be available. Other fixes will still work.');
      }
    }

    // [EARS-A7] Parse fix-validators option - fix only specified validators
    let fixTypes: ValidatorType[] | undefined;
    if (options.fixValidators) {
      const validators = options.fixValidators.split(',').map(v => v.trim() as ValidatorType);
      fixTypes = validators.filter(v => v.length > 0);
    }

    // [EARS-A8] Fix all fixable when no --fix-validators specified
    const fixOptions: Partial<FsFixOptions> = {
      createBackups: true,
      keyId: currentActor.id,
      ...(privateKey && { privateKey }),
      ...(fixTypes && fixTypes.length > 0 && { fixTypes }),
    };

    const fixReport = await lintModule.fix(lintReport, fixOptions);

    // [EARS-E3] Regenerate index after fix if records were modified
    // This ensures the index reflects the fixed records
    if (fixReport.summary.fixed > 0) {
      if (!quiet) {
        this.logger.info('🔄 Regenerating index after fix...');
      }
      try {
        const indexerAdapter = await this.container.getIndexerAdapter();
        await indexerAdapter.generateIndex();
        if (!quiet) {
          this.logger.info('✅ Index regenerated');
        }
      } catch (indexError) {
        this.logger.warn(`⚠️  Failed to regenerate index: ${indexError}`);
      }
    }

    // Display fix results
    if (format === 'json') {
      console.log(JSON.stringify({ lintReport, fixReport }, null, 2));
    } else {
      this.formatFixReport(fixReport, quiet);

      // Show remaining errors after fix
      if (fixReport.summary.failed > 0) {
        this.logger.warn(`\n\x1b[33m⚠️  ${fixReport.summary.failed} problem(s) could not be fixed\x1b[0m`);
      }
    }

    return fixReport;
  }

  /**
   * Format lint report for display
   * [EARS-B1, EARS-B2, EARS-E1, EARS-E2]
   */
  private formatLintReport(
    report: LintReport,
    format: string,
    quiet: boolean,
    executionTime: number,
    groupBy: 'validator' | 'file' | 'none' = 'validator',
    summary: boolean = false,
    maxErrors: number = 0
  ): void {
    if (format === 'json') {
      // [EARS-D1] JSON output - ignore summary and maxErrors flags
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    // [EARS-B1, EARS-E1, EARS-E2] Text output
    const { summary: reportSummary, results } = report;

    // [EARS-E2] Limit results if maxErrors is set (calculate before showing summary)
    let displayResults = results;
    let remainingCount = 0;
    if (maxErrors > 0 && results.length > maxErrors) {
      displayResults = results.slice(0, maxErrors);
      remainingCount = results.length - maxErrors;
    }

    // [EARS-E1] If summary flag is set, show only summary and Validator Types
    if (summary) {
      // Show Lint Report summary only
      if (!quiet) {
        console.log('\n\x1b[1mLint Report:\x1b[0m');
        console.log('─'.repeat(60));
      }
      const errorColor = reportSummary.errors > 0 ? '\x1b[31m' : '\x1b[32m'; // red : green
      console.log(`${errorColor}Errors:\x1b[0m          `, reportSummary.errors);
      console.log('\x1b[33mWarnings:\x1b[0m        ', reportSummary.warnings); // yellow
      console.log('\x1b[36mFixable:\x1b[0m         ', reportSummary.fixable); // cyan
      console.log('Files checked:   ', reportSummary.filesChecked);
      if (!quiet) {
        console.log('Execution time:  ', `${executionTime}ms`);
      }

      // Show Validator Types breakdown even in summary mode
      if (!quiet && results.length > 0) {
        const validatorGroups = results.reduce((acc, result) => {
          if (!acc[result.validator]) {
            acc[result.validator] = { errors: 0, warnings: 0 };
          }
          if (result.level === 'error') {
            acc[result.validator]!.errors++;
          } else {
            acc[result.validator]!.warnings++;
          }
          return acc;
        }, {} as Record<string, { errors: number; warnings: number }>);

        console.log('\n\x1b[1mValidator Types:\x1b[0m');
        console.log('─'.repeat(60));
        Object.entries(validatorGroups).forEach(([validator, counts]) => {
          if (counts.errors > 0) {
            console.log(`❌ ${validator} (${counts.errors} ${counts.errors === 1 ? 'error' : 'errors'})`);
          } else if (counts.warnings > 0) {
            console.log(`⚠️  ${validator} (${counts.warnings} ${counts.warnings === 1 ? 'warning' : 'warnings'})`);
          }
        });
      }

      console.log('');
      return;
    }

    // 1. Issues (show first)
    if (displayResults.length > 0 && !quiet) {
      console.log('\n\x1b[1mIssues:\x1b[0m');
      console.log('─'.repeat(60));

      // [EARS-A6] Group output by validator/file/none
      if (groupBy === 'validator') {
        // Group by validator type
        const grouped = displayResults.reduce((acc, result) => {
          if (!acc[result.validator]) {
            acc[result.validator] = [];
          }
          acc[result.validator]!.push(result);
          return acc;
        }, {} as Record<string, LintResult[]>);

        Object.entries(grouped).forEach(([validator, validatorResults]) => {
          const errorCount = validatorResults.filter(r => r.level === 'error').length;
          const warningCount = validatorResults.filter(r => r.level === 'warning').length;
          const icon = errorCount > 0 ? '❌' : '⚠️ ';
          const color = errorCount > 0 ? '\x1b[31m' : '\x1b[33m';

          // Show only relevant count (errors or warnings, not both)
          const countText = errorCount > 0
            ? `(${errorCount} ${errorCount === 1 ? 'error' : 'errors'})`
            : `(${warningCount} ${warningCount === 1 ? 'warning' : 'warnings'})`;

          console.log(`\n${icon} ${color}${validator}\x1b[0m ${countText}`);
          validatorResults.forEach(result => {
            const levelColor = result.level === 'error' ? '\x1b[31m' : '\x1b[33m';
            console.log(`  - ${levelColor}${result.entity.type}:${result.entity.id}\x1b[0m`);
            console.log(`     File: ${result.filePath}`);
            console.log(`     ${result.message}`);
            if (result.fixable) {
              console.log(`     \x1b[36m✓ Fixable with --fix\x1b[0m`);
            }
          });
        });
      } else if (groupBy === 'file') {
        // Group by file
        const grouped = displayResults.reduce((acc, result) => {
          if (!acc[result.filePath]) {
            acc[result.filePath] = [];
          }
          acc[result.filePath]!.push(result);
          return acc;
        }, {} as Record<string, LintResult[]>);

        Object.entries(grouped).forEach(([filePath, fileResults]) => {
          console.log(`\n📄 ${filePath}`);
          fileResults.forEach(result => {
            const color = result.level === 'error' ? '\x1b[31m' : '\x1b[33m';
            console.log(`  ${color}${result.validator}\x1b[0m`);
            console.log(`   Entity: ${result.entity.type}:${result.entity.id}`);
            console.log(`   ${result.message}`);
            if (result.fixable) {
              console.log(`   \x1b[36m✓ Fixable with --fix\x1b[0m`);
            }
          });
        });
      } else {
        // No grouping (original format)
        displayResults.forEach((result, index) => {
          const icon = result.level === 'error' ? '❌' : '⚠️ ';
          const color = result.level === 'error' ? '\x1b[31m' : '\x1b[33m'; // red : yellow

          console.log(`\n${icon} ${color}${result.validator}\x1b[0m`);
          console.log(`   File: ${result.filePath}`);
          console.log(`   Entity: ${result.entity.type}:${result.entity.id}`);
          console.log(`   Message: ${result.message}`);

          if (result.fixable) {
            console.log(`   \x1b[36m✓ Fixable with --fix\x1b[0m`); // cyan
          }
        });
      }
    }

    // 2. Summary (only if maxErrors is set AND there are more issues than displayed)
    if (maxErrors > 0 && remainingCount > 0 && !quiet) {
      console.log('\n\x1b[1mSummary:\x1b[0m');
      console.log('─'.repeat(60));
      console.log(`\x1b[33m⚠️  ${remainingCount} more issue${remainingCount === 1 ? '' : 's'} not shown (use --max-errors 0 to see all)\x1b[0m`);
      const errorColor = reportSummary.errors > 0 ? '\x1b[31m' : '\x1b[32m';
      const warningColor = reportSummary.warnings > 0 ? '\x1b[33m' : '';
      const resetColor = '\x1b[0m';
      const warningReset = warningColor ? resetColor : '';
      const totalsLine = `${errorColor}${reportSummary.errors} error${reportSummary.errors === 1 ? '' : 's'}${resetColor}, ${warningColor}${reportSummary.warnings} warning${reportSummary.warnings === 1 ? '' : 's'}${warningReset}, \x1b[36m${reportSummary.fixable} fixable${resetColor}`;
      console.log(totalsLine);
    }

    // 3. Lint Report (show at the end)
    if (!quiet) {
      console.log('\n\x1b[1mLint Report:\x1b[0m');
      console.log('─'.repeat(60));
    }
    const errorColor = reportSummary.errors > 0 ? '\x1b[31m' : '\x1b[32m'; // red : green
    console.log(`${errorColor}Errors:\x1b[0m          `, reportSummary.errors);
    console.log('\x1b[33mWarnings:\x1b[0m        ', reportSummary.warnings); // yellow
    console.log('\x1b[36mFixable:\x1b[0m         ', reportSummary.fixable); // cyan
    console.log('Files checked:   ', reportSummary.filesChecked);
    if (!quiet) {
      console.log('Execution time:  ', `${executionTime}ms`);
    }

    // 4. Validator Types Breakdown (show after Lint Report)
    if (!quiet && results.length > 0) {
      const validatorGroups = results.reduce((acc, result) => {
        if (!acc[result.validator]) {
          acc[result.validator] = { errors: 0, warnings: 0 };
        }
        if (result.level === 'error') {
          acc[result.validator]!.errors++;
        } else {
          acc[result.validator]!.warnings++;
        }
        return acc;
      }, {} as Record<string, { errors: number; warnings: number }>);

      console.log('\n\x1b[1mValidator Types:\x1b[0m');
      console.log('─'.repeat(60));
      Object.entries(validatorGroups).forEach(([validator, counts]) => {
        if (counts.errors > 0) {
          console.log(`❌ ${validator} (${counts.errors} ${counts.errors === 1 ? 'error' : 'errors'})`);
        } else if (counts.warnings > 0) {
          console.log(`⚠️  ${validator} (${counts.warnings} ${counts.warnings === 1 ? 'warning' : 'warnings'})`);
        }
      });
    }

    console.log('');
  }

  /**
   * Format migration detection report
   * [EARS-C1]
   */
  private formatMigrationReport(
    report: LintReport,
    format: string,
    quiet: boolean
  ): void {
    const legacyRecords = report.results.filter(
      r => r.validator === 'EMBEDDED_METADATA_STRUCTURE' || r.validator === 'SCHEMA_VERSION_MISMATCH'
    );

    if (format === 'json') {
      console.log(JSON.stringify({ legacyRecords }, null, 2));
      return;
    }

    console.log('\n\x1b[1mMigration Detection Report:\x1b[0m');
    console.log('─'.repeat(60));
    console.log('\x1b[33mLegacy records found:\x1b[0m', legacyRecords.length);

    if (legacyRecords.length > 0 && !quiet) {
      console.log('\n\x1b[1mLegacy Records:\x1b[0m');
      legacyRecords.forEach(record => {
        console.log(`  - \x1b[36m${record.filePath}\x1b[0m`);
        console.log(`    ${record.message}`);
      });

      console.log(`\n\x1b[36m💡 Tip:\x1b[0m Run with \x1b[1m--fix\x1b[0m to automatically migrate these records\n`);
    } else if (legacyRecords.length === 0) {
      console.log('\x1b[32m\n✓ All records are up to date!\n\x1b[0m');
    }
  }

  /**
   * Format fix report for display
   * [EARS-D1]
   */
  private formatFixReport(report: FixReport, quiet: boolean): void {
    const { summary, fixes } = report;

    if (!quiet) {
      console.log('\n\x1b[1mFix Report:\x1b[0m');
      console.log('─'.repeat(60));
    }

    console.log('\x1b[32mFixed:\x1b[0m           ', summary.fixed);
    console.log('\x1b[31mFailed:\x1b[0m          ', summary.failed);
    console.log('\x1b[36mBackups created:\x1b[0m ', summary.backupsCreated);

    if (fixes.length > 0 && !quiet) {
      console.log('\n\x1b[1mDetails:\x1b[0m');
      console.log('─'.repeat(60));

      fixes.forEach(fix => {
        const icon = fix.success ? '✓' : '✗';
        const color = fix.success ? '\x1b[32m' : '\x1b[31m'; // green : red

        console.log(`${icon} ${color}${fix.validator}\x1b[0m - ${fix.filePath}`);
        console.log(`  ${fix.action}`);


        if (fix.backupPath) {
          console.log(`  Backup: ${fix.backupPath}`);
        }

        if (fix.error) {
          console.log(`  \x1b[31mError:\x1b[0m ${fix.error}`);
        }
      });
    }

    console.log('');
  }
}

