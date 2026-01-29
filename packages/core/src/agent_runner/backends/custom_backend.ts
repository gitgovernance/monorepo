/**
 * Backend for executing agents via custom protocol handlers (engine.type: "custom").
 *
 * EARS Coverage:
 * - [EARS-F1] Lookup handler in ProtocolHandlerRegistry
 * - [EARS-F2] Throw CustomEngineConfigError when protocol missing
 * - [EARS-F3] Throw ProtocolHandlerNotFound when handler not registered
 * - [EARS-F4] Invoke handler with engine and context
 *
 * Reference: agent_protocol.md §5.1.4
 */

import type {
  CustomEngine,
  AgentExecutionContext,
  AgentOutput,
  ProtocolHandlerRegistry,
  ProtocolHandler,
} from "../agent_runner.types";

/**
 * Error thrown when custom engine configuration is invalid.
 * [EARS-F2]
 */
export class CustomEngineConfigError extends Error {
  constructor(message: string) {
    super(`CustomEngineConfigError: ${message}`);
    this.name = "CustomEngineConfigError";
  }
}

/**
 * Error thrown when protocol handler is not found in registry.
 * [EARS-F3]
 */
export class ProtocolHandlerNotFoundError extends Error {
  public readonly protocol: string;

  constructor(protocol: string) {
    super(`ProtocolHandlerNotFound: ${protocol}`);
    this.name = "ProtocolHandlerNotFoundError";
    this.protocol = protocol;
  }
}

/**
 * Backend for executing agents via custom protocol handlers.
 *
 * Allows extensibility without modifying the runner core.
 * Protocol handlers MUST return AgentOutput.
 *
 * Reference: agent_protocol.md §5.1.4
 */
export class CustomBackend {
  constructor(private registry?: ProtocolHandlerRegistry) {}

  /**
   * Executes an agent via protocol handler.
   *
   * @param engine - Custom engine configuration
   * @param ctx - Execution context
   * @returns AgentOutput from handler
   *
   * @throws CustomEngineConfigError - When protocol is not defined [EARS-F2]
   * @throws ProtocolHandlerNotFoundError - When handler not registered [EARS-F3]
   */
  async execute(
    engine: CustomEngine,
    ctx: AgentExecutionContext
  ): Promise<AgentOutput> {
    // [EARS-F2] Validate protocol is defined
    if (!engine.protocol) {
      throw new CustomEngineConfigError("protocol required for execution");
    }

    // [EARS-F1] Lookup handler in registry
    if (!this.registry) {
      throw new ProtocolHandlerNotFoundError(engine.protocol);
    }

    const handler = this.registry.get(engine.protocol);

    // [EARS-F3] Error if handler not registered
    if (!handler) {
      throw new ProtocolHandlerNotFoundError(engine.protocol);
    }

    // [EARS-F4] Invoke handler with engine and context, capture output
    const output = await handler(engine, ctx);

    return output;
  }
}

/**
 * Default implementation of ProtocolHandlerRegistry.
 * In-memory registry for protocol handlers.
 */
export class DefaultProtocolHandlerRegistry implements ProtocolHandlerRegistry {
  private handlers = new Map<string, ProtocolHandler>();

  register(protocol: string, handler: ProtocolHandler): void {
    this.handlers.set(protocol, handler);
  }

  get(protocol: string): ProtocolHandler | undefined {
    return this.handlers.get(protocol);
  }
}
