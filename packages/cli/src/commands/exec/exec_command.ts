import { Command } from 'commander';
import { BaseCommand } from '../../base/base-command';
import type { BaseCommandOptions } from '../../interfaces/command';
import type { ExecNewOptions, ExecListOptions, ExecShowOptions } from './exec_command.types';

/**
 * ExecCommand — Registers proof-of-work via ExecutionRecords.
 *
 * Delegates all business logic to ExecutionAdapter.
 * Blueprint: exec_command.md
 */
export class ExecCommand extends BaseCommand<BaseCommandOptions> {

  register(program: Command): void {
    // Not used — registration happens via registerExecCommands()
  }

  async execute(options: BaseCommandOptions): Promise<void> {
    this.handleError('No action specified. Use --help for available options.', options);
  }

  /**
   * gitgov exec new <taskId> — Create a new ExecutionRecord
   * EARS: ICOMP-A1..A5
   */
  async executeNew(taskId: string, options: ExecNewOptions): Promise<void> {
    try {
      // [ICOMP-A1] Validate --result is provided
      if (!options.result || options.result.trim().length === 0) {
        this.handleError('--result is required', options);
        return;
      }

      const executionAdapter = await this.dependencyService.getExecutionAdapter();
      const projector = await this.dependencyService.getRecordProjector();
      const { actorId } = await this.requireActor(options);

      // Build payload
      const payload: Record<string, unknown> = {
        taskId,
        result: options.result,
        type: options.type || 'progress', // [ICOMP-A5] default progress
        title: options.title || '',
        notes: options.notes,
        references: options.reference || [], // [ICOMP-A4] multiple references
      };

      // [ICOMP-A2] + [ICOMP-A3] Delegate to adapter (adapter validates taskId exists)
      const execution = await executionAdapter.create(payload, actorId);

      // Invalidate projector cache
      await projector.invalidateCache();

      // Output
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          data: {
            id: execution.id,
            taskId: execution.taskId,
            type: execution.type,
            title: execution.title,
            result: execution.result,
            references: execution.references || [],
          }
        }, null, 2));
      } else if (!options.quiet) {
        console.log(`✅ Execution created: ${execution.id}`);
        console.log(`   Task:  ${execution.taskId}`);
        console.log(`   Type:  ${execution.type}`);
        if (execution.title) {
          console.log(`   Title: ${execution.title}`);
        }
      }
    } catch (error) {
      this.handleExecError(error, options);
    }
  }

  /**
   * gitgov exec list [taskId] — List executions
   * EARS: ICOMP-A6..A7
   */
  async executeList(taskId: string | undefined, options: ExecListOptions): Promise<void> {
    try {
      const executionAdapter = await this.dependencyService.getExecutionAdapter();

      // [ICOMP-A6] + [ICOMP-A7]
      let executions = taskId
        ? await executionAdapter.getExecutionsByTask(taskId)
        : await executionAdapter.getAllExecutions();

      // Apply type filter
      if (options.type) {
        executions = executions.filter(e => e.type === options.type);
      }

      // Apply limit
      const limit = options.limit || 50;
      executions = executions.slice(0, limit);

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          data: {
            total: executions.length,
            executions: executions.map(e => ({
              id: e.id,
              taskId: e.taskId,
              type: e.type,
              title: e.title,
              result: e.result,
            })),
          }
        }, null, 2));
      } else if (options.quiet) {
        executions.forEach(e => console.log(e.id));
      } else {
        if (executions.length === 0) {
          console.log(taskId
            ? `No executions found for task: ${taskId}`
            : 'No executions found.');
          return;
        }

        const header = taskId
          ? `EXECUTIONS (Task: ${taskId})`
          : 'ALL EXECUTIONS';
        console.log(header);
        console.log(`${'ID'.padEnd(50)} ${'TYPE'.padEnd(12)} TITLE`);

        for (const e of executions) {
          console.log(`${e.id.padEnd(50)} ${e.type.padEnd(12)} ${e.title || '(untitled)'}`);
        }
      }
    } catch (error) {
      this.handleExecError(error, options);
    }
  }

  /**
   * gitgov exec show <executionId> — Show execution details
   * EARS: ICOMP-A8..A9
   */
  async executeShow(executionId: string, options: ExecShowOptions): Promise<void> {
    try {
      const executionAdapter = await this.dependencyService.getExecutionAdapter();

      // [ICOMP-A8] + [ICOMP-A9]
      const execution = await executionAdapter.getExecution(executionId);

      if (!execution) {
        this.handleError(`Execution not found: ${executionId}`, options);
        return;
      }

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          data: {
            id: execution.id,
            taskId: execution.taskId,
            type: execution.type,
            title: execution.title,
            result: execution.result,
            notes: execution.notes || null,
            references: execution.references || [],
          }
        }, null, 2));
      } else if (!options.quiet) {
        console.log(`Execution: ${execution.id}`);
        console.log(`Task:      ${execution.taskId}`);
        console.log(`Type:      ${execution.type}`);
        console.log(`Title:     ${execution.title || '(untitled)'}`);
        console.log(`Result:    ${execution.result}`);
        if (execution.notes) {
          console.log(`Notes:     ${execution.notes}`);
        }
        if (execution.references && execution.references.length > 0) {
          console.log(`References:`);
          for (const ref of execution.references) {
            console.log(`  - ${ref}`);
          }
        }
      }
    } catch (error) {
      this.handleExecError(error, options);
    }
  }

  private handleExecError(error: unknown, options: BaseCommandOptions): void {
    let message: string;

    if (error instanceof Error) {
      if (error.message.includes('not found') || error.message.includes('Not found')) {
        message = `❌ ${error.message}`;
      } else {
        message = `❌ Execution operation failed: ${error.message}`;
      }
    } else {
      message = `❌ Execution operation failed: ${String(error)}`;
    }

    if (options.json) {
      console.log(JSON.stringify({ success: false, error: message, exitCode: 1 }, null, 2));
    } else {
      console.error(message);
      if (options.verbose && error instanceof Error) {
        console.error(`🔍 Technical details: ${error.stack}`);
      }
    }

    process.exit(1);
  }
}
