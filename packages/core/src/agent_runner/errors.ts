/**
 * Custom Error Classes for AgentRunnerModule
 *
 * These errors provide typed exceptions for better error handling
 * and diagnostics in the agent runner operations.
 */

/**
 * Base error class for all Runner-related errors
 */
export class RunnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunnerError";
    Object.setPrototypeOf(this, RunnerError.prototype);
  }
}

/**
 * Error thrown when an agent file is not found in .gitgov/agents/
 */
export class AgentNotFoundError extends RunnerError {
  public readonly agentId: string;

  constructor(agentId: string) {
    super(`AgentNotFound: ${agentId}`);
    this.name = "AgentNotFoundError";
    this.agentId = agentId;
    Object.setPrototypeOf(this, AgentNotFoundError.prototype);
  }
}

/**
 * Error thrown when the specified function is not exported from entrypoint
 */
export class FunctionNotExportedError extends RunnerError {
  public readonly functionName: string;
  public readonly entrypoint: string;

  constructor(functionName: string, entrypoint: string) {
    super(`FunctionNotExported: ${functionName} not found in ${entrypoint}`);
    this.name = "FunctionNotExportedError";
    this.functionName = functionName;
    this.entrypoint = entrypoint;
    Object.setPrototypeOf(this, FunctionNotExportedError.prototype);
  }
}

/**
 * Error thrown when local engine has neither entrypoint nor runtime
 */
export class LocalEngineConfigError extends RunnerError {
  constructor() {
    super("LocalEngineConfigError: entrypoint or runtime required for execution");
    this.name = "LocalEngineConfigError";
    Object.setPrototypeOf(this, LocalEngineConfigError.prototype);
  }
}

/**
 * Error thrown when engine.type is not supported
 */
export class UnsupportedEngineTypeError extends RunnerError {
  public readonly engineType: string;

  constructor(engineType: string) {
    super(`UnsupportedEngineType: ${engineType}`);
    this.name = "UnsupportedEngineTypeError";
    this.engineType = engineType;
    Object.setPrototypeOf(this, UnsupportedEngineTypeError.prototype);
  }
}

/**
 * Error thrown when engine configuration is invalid
 */
export class EngineConfigError extends RunnerError {
  public readonly engineType: string;
  public readonly missingField: string;

  constructor(engineType: string, missingField: string) {
    super(`EngineConfigError: ${missingField} required for ${engineType}`);
    this.name = "EngineConfigError";
    this.engineType = engineType;
    this.missingField = missingField;
    Object.setPrototypeOf(this, EngineConfigError.prototype);
  }
}

/**
 * Error thrown when a required dependency is missing
 */
export class MissingDependencyError extends RunnerError {
  public readonly dependency: string;
  public readonly reason: string;

  constructor(dependency: string, reason: string) {
    super(`MissingDependency: ${dependency} ${reason}`);
    this.name = "MissingDependencyError";
    this.dependency = dependency;
    this.reason = reason;
    Object.setPrototypeOf(this, MissingDependencyError.prototype);
  }
}

/**
 * Error thrown when runtime handler is not found in registry
 */
export class RuntimeNotFoundError extends RunnerError {
  public readonly runtime: string;

  constructor(runtime: string) {
    super(`RuntimeNotFound: ${runtime}`);
    this.name = "RuntimeNotFoundError";
    this.runtime = runtime;
    Object.setPrototypeOf(this, RuntimeNotFoundError.prototype);
  }
}
