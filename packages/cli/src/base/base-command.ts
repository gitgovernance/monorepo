/**
 * Base Command Class for GitGovernance CLI
 * 
 * Provides common functionality and enforces standards across all commands.
 * Follows the Command Pattern and provides dependency injection support.
 */

import { Command } from 'commander';
import { DependencyInjectionService } from '../services/dependency-injection';
import type { BaseCommandOptions, ICompleteCommand } from '../interfaces/command';

/**
 * Abstract base class for all CLI commands
 */
export abstract class BaseCommand<TOptions extends BaseCommandOptions = BaseCommandOptions>
  implements ICompleteCommand<TOptions> {

  protected readonly dependencyService = DependencyInjectionService.getInstance();
  protected readonly container = DependencyInjectionService.getInstance();
  protected readonly logger = console;

  /**
   * Register the command with Commander.js
   * Must be implemented by each command
   */
  abstract register(program: Command): void;

  /**
   * Execute the main command action
   * Default implementation delegates to sub-command handling
   */
  async execute(options: TOptions): Promise<void> {
    // Default behavior: show help if no sub-command specified
    this.handleError('No action specified. Use --help for available options.', options);
  }

  /**
   * Execute a sub-command with arguments
   * Default implementation routes to specific handler methods
   */
  async executeSubCommand(subcommand: string, args: string[], options: TOptions): Promise<void> {
    const methodName = `execute${this.capitalize(subcommand)}`;
    const handler = (this as any)[methodName];

    if (typeof handler === 'function') {
      try {
        await handler.call(this, ...args, options);
      } catch (error) {
        this.handleError(
          `Failed to execute ${subcommand}: ${error instanceof Error ? error.message : String(error)}`,
          options,
          error instanceof Error ? error : undefined
        );
      }
    } else {
      this.handleError(`Unknown sub-command: ${subcommand}`, options);
    }
  }

  /**
   * Handle errors consistently across all commands
   */
  protected handleError(message: string, options: TOptions, error?: Error, exitCode: number = 1): void {
    const isJson = options.json || false;
    const isVerbose = options.verbose || false;

    if (isJson) {
      console.log(JSON.stringify({
        success: false,
        error: message,
        exitCode
      }, null, 2));
    } else {
      // Only add ❌ if message doesn't already have it
      const formattedMessage = message.startsWith('❌') ? message : `❌ ${message}`;
      console.error(formattedMessage);
      if (isVerbose && error) {
        console.error(`🔍 Technical details: ${error.stack}`);
      }
    }

    process.exit(exitCode);
  }

  /**
   * Guard: require active actor identity for write operations.
   * Returns actor ID or exits with user-friendly error message.
   */
  protected async requireActor(options: TOptions): Promise<{ actorId: string }> {
    try {
      const identityAdapter = await this.dependencyService.getIdentityAdapter();
      const currentActor = await identityAdapter.getCurrentActor();
      return { actorId: currentActor.id };
    } catch {
      const message = await this.buildNoIdentityMessage();
      this.handleError(message, options);
      throw new Error('unreachable');
    }
  }

  /**
   * Build contextual "no identity" error message.
   * If actor records exist (but no key), suggests rotate-key.
   * If no actors exist, suggests actor new.
   */
  protected async buildNoIdentityMessage(): Promise<string> {
    try {
      const projectRoot = await this.dependencyService.getProjectRoot();
      const { promises: fsPromises } = await import('fs');
      const path = await import('path');
      const actorsDir = path.join(projectRoot, '.gitgov', 'actors');
      const files = await fsPromises.readdir(actorsDir);
      const actorFiles = files.filter((f: string) => f.endsWith('.json'));

      if (actorFiles.length > 0) {
        // Actors exist but no key — suggest rotate-key
        const actorIds = actorFiles.map((f: string) => f.replace('.json', '').replace(/_/g, ':'));
        const actorList = actorIds.map((id: string) => `  - ${id}`).join('\n');
        return [
          'No active identity. You have actor(s) but no private key on this machine.',
          '',
          'Existing actors:',
          actorList,
          '',
          'To generate a new key for an existing actor:',
          `  gitgov actor rotate-key ${actorIds[0]}`,
          '',
          'Or to create a new actor:',
          '  gitgov actor new -t human -n "Your Name" -r developer',
        ].join('\n');
      }
    } catch {
      // Fall through to generic message
    }

    return 'No active identity. Run `gitgov actor new -t human -n "Your Name" -r developer` to create one.';
  }

  /**
   * Handle successful output consistently
   */
  protected handleSuccess(data: any, options: TOptions, message?: string): void {
    const isJson = options.json || false;
    const isQuiet = options.quiet || false;

    if (isJson) {
      console.log(JSON.stringify({
        success: true,
        data
      }, null, 2));
    } else {
      if (message && !isQuiet) {
        console.log(`✅ ${message}`);
      }
    }
  }

  /**
   * Utility method to capitalize strings for method name generation
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

/**
 * Simple command class for commands without sub-commands
 */
export abstract class SimpleCommand<TOptions extends BaseCommandOptions = BaseCommandOptions>
  extends BaseCommand<TOptions> {

  /**
   * Simple commands must implement execute directly
   */
  abstract execute(options: TOptions): Promise<void>;

  /**
   * Simple commands don't support sub-commands
   */
  async executeSubCommand(subcommand: string, args: string[], options: TOptions): Promise<void> {
    this.handleError(`This command does not support sub-commands. Got: ${subcommand}`, options);
  }
}
