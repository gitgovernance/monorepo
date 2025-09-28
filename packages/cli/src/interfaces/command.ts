/**
 * Standard Command Interface for GitGovernance CLI
 * 
 * All commands must implement this interface to ensure consistency
 * and enable proper dependency injection and testing.
 */

import { Command } from 'commander';

/**
 * Base options that all commands should support
 */
export interface BaseCommandOptions {
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

/**
 * Command registration interface for Commander.js integration
 */
export interface ICommand {
  /**
   * Register the command with Commander.js program
   * @param program - The Commander.js program instance
   */
  register(program: Command): void;
}

/**
 * Executable command interface
 */
export interface IExecutableCommand<TOptions extends BaseCommandOptions = BaseCommandOptions> {
  /**
   * Execute the command with given options
   * @param options - Command-specific options
   */
  execute(options: TOptions): Promise<void>;
}

/**
 * Sub-command handler interface for commands with multiple actions
 */
export interface ISubCommandHandler<TOptions extends BaseCommandOptions = BaseCommandOptions> {
  /**
   * Execute a sub-command with arguments
   * @param subcommand - The sub-command name
   * @param args - Arguments for the sub-command
   * @param options - Command options
   */
  executeSubCommand(subcommand: string, args: string[], options: TOptions): Promise<void>;
}

/**
 * Complete command interface combining all capabilities
 */
export interface ICompleteCommand<TOptions extends BaseCommandOptions = BaseCommandOptions>
  extends ICommand, IExecutableCommand<TOptions>, ISubCommandHandler<TOptions> { }
