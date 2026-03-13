/**
 * HookCommand — Passive governance CLI command.
 *
 * Reads JSON from stdin (sent by Claude Code hooks), delegates to core
 * HookHandler, and creates ExecutionRecords invisibly.
 *
 * DESIGN: Does NOT extend BaseCommand because:
 * - BaseCommand.handleError() calls process.exit(1) — hook must ALWAYS exit 0
 * - Hook has no --json/--quiet flags (it's silent by default)
 * - Hook reads stdin, not CLI flags/positional args
 *
 * All EARS prefixes map to hook_command.md §4.
 */

import { HookHandler as HookHandlerNs } from '@gitgov/core';
import type { HookEvent } from '@gitgov/core';
import { DependencyInjectionService } from '../../services/dependency-injection';
import type { HookCommandOptions, HookCommandResult } from './hook_command.types';

/** Stdin read timeout in milliseconds */
const STDIN_TIMEOUT_MS = 3_000;

export class HookCommand {
  /**
   * Process a hook subcommand end-to-end.
   *
   * Shared flow for all 5 subcommands:
   * 1. Check GITGOV_PASSIVE env var
   * 2. Read + parse stdin JSON
   * 3. Validate .gitgov/ exists
   * 4. Delegate to HookHandler
   * 5. Handle --dry-run / --verbose output
   * 6. Always exit 0
   */
  async processEvent(
    eventType: string,
    options: HookCommandOptions,
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // [EARS-A1] Check GITGOV_PASSIVE toggle
      if (process.env['GITGOV_PASSIVE'] === 'false') {
        return;
      }

      // Read stdin JSON
      const raw = await this.readStdin();
      if (!raw || raw.trim().length === 0) {
        // [EARS-A3] Empty stdin — fail-open
        if (options.verbose) {
          this.diagnostics(eventType, 'skipped', 'empty stdin', startTime);
        }
        return;
      }

      // Parse JSON
      let payload: HookEvent;
      try {
        payload = JSON.parse(raw) as HookEvent;
      } catch {
        // [EARS-A3] Invalid JSON — fail-open
        if (options.verbose) {
          this.diagnostics(eventType, 'skipped', 'invalid JSON payload', startTime);
        }
        return;
      }

      // [EARS-A2] Validate .gitgov/ exists via DI
      const diService = DependencyInjectionService.getInstance();
      const hasProject = await diService.validateDependencies();
      if (!hasProject) {
        if (options.verbose) {
          this.diagnostics(eventType, 'skipped', 'no .gitgov directory', startTime);
        }
        return;
      }

      // Build HookHandler with DI
      const handler = await this.createHookHandler(diService);

      // [EARS-A5] Dry-run: classify without persisting
      if (options.dryRun) {
        const result = await handler.handleEvent(payload, { dryRun: true });
        const output: HookCommandResult = {
          success: true,
          event_type: eventType as HookCommandResult['event_type'],
          action: result.action,
          ...(result.reason !== undefined && { reason: result.reason }),
          ...(result.executionId !== undefined && { executionId: result.executionId }),
        };
        process.stdout.write(JSON.stringify(output, null, 2) + '\n');
        return;
      }

      // Normal flow: delegate to HookHandler
      const result = await handler.handleEvent(payload);

      // [EARS-D1] Verbose diagnostics
      if (options.verbose) {
        this.diagnostics(
          eventType,
          result.action,
          result.action === 'recorded' ? result.executionId : result.reason,
          startTime,
        );
      }
    } catch (error) {
      // [EARS-A4] Catch everything — never fail the hook
      if (options.verbose) {
        const message = error instanceof Error ? error.message : String(error);
        this.diagnostics(eventType, 'skipped', message, startTime);
      }
    }
  }

  // ─── Subcommand Entry Points ─────────────────────────────

  async executeCommandExecuted(options: HookCommandOptions): Promise<void> {
    await this.processEvent('command-executed', options);
  }

  async executeFileChanged(options: HookCommandOptions): Promise<void> {
    await this.processEvent('file-changed', options);
  }

  async executeTaskCompleted(options: HookCommandOptions): Promise<void> {
    await this.processEvent('task-completed', options);
  }

  async executeTeammateIdle(options: HookCommandOptions): Promise<void> {
    await this.processEvent('teammate-idle', options);
  }

  async executeSessionEnd(options: HookCommandOptions): Promise<void> {
    await this.processEvent('session-end', options);
  }

  // ─── Helpers ─────────────────────────────────────────────

  /**
   * Read all of stdin with a timeout.
   * Returns empty string if stdin is not piped or times out.
   */
  private async readStdin(): Promise<string> {
    // If stdin is a TTY (no pipe), return empty immediately
    if (process.stdin.isTTY) {
      return '';
    }

    return new Promise<string>((resolve) => {
      let raw = '';
      const timer = setTimeout(() => {
        process.stdin.destroy();
        resolve(raw);
      }, STDIN_TIMEOUT_MS);

      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk: string) => {
        raw += chunk;
      });
      process.stdin.on('end', () => {
        clearTimeout(timer);
        resolve(raw);
      });
      process.stdin.on('error', () => {
        clearTimeout(timer);
        resolve(raw);
      });
    });
  }

  /**
   * Create HookHandler from DI service.
   */
  private async createHookHandler(
    diService: DependencyInjectionService,
  ): Promise<HookHandlerNs.HookHandler> {
    const executionAdapter = await diService.getExecutionAdapter();
    const sessionManager = await diService.getSessionManager();
    const configManager = await diService.getConfigManager();

    return new HookHandlerNs.HookHandler({
      executionAdapter,
      sessionManager,
      configManager,
    });
  }

  /**
   * [EARS-D1] Output diagnostic information to stderr.
   */
  private diagnostics(
    eventType: string,
    action: string,
    detail: string | undefined,
    startTime: number,
  ): void {
    const elapsed = Date.now() - startTime;
    process.stderr.write(`[hook] event_type: ${eventType}\n`);
    process.stderr.write(`[hook] action: ${action}\n`);
    if (detail) {
      if (action === 'recorded') {
        process.stderr.write(`[hook] executionId: ${detail}\n`);
      } else {
        process.stderr.write(`[hook] reason: ${detail}\n`);
      }
    }
    process.stderr.write(`[hook] elapsed: ${elapsed}ms\n`);
  }
}
