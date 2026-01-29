import path from "node:path";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import {
  LocalBackend,
  ApiBackend,
  McpBackend,
  CustomBackend,
} from "../backends";
import {
  AgentNotFoundError,
  UnsupportedEngineTypeError,
  EngineConfigError,
  MissingDependencyError,
} from "../errors";
import type { AgentRecord } from "../../types";
import type { IEventStream } from "../../event_bus";
import type { IExecutionAdapter } from "../../adapters/execution_adapter";
import type { IIdentityAdapter } from "../../adapters/identity_adapter";
import type {
  LocalEngine,
  ApiEngine,
  McpEngine,
  CustomEngine,
  AgentRunnerDependencies,
  AgentExecutionContext,
  AgentOutput,
  AgentResponse,
  AgentRunnerEvent,
  RunOptions,
  ProtocolHandlerRegistry,
  RuntimeHandlerRegistry,
  IAgentRunner,
} from "../agent_runner.types";

const VALID_ENGINE_TYPES = ["local", "api", "mcp", "custom"] as const;

/**
 * Filesystem-based Agent Runner - Executes agents based on their engine.type.
 *
 * Responsibilities:
 * - Load AgentRecords from .gitgov/agents/
 * - Execute via appropriate backend (local, api, mcp, custom)
 * - Capture responses and write ExecutionRecords
 * - Emit events via EventBus
 */
export class FsAgentRunner implements IAgentRunner {
  private gitgovPath: string;
  private projectRoot: string;
  private identityAdapter: IIdentityAdapter | undefined;
  private executionAdapter: IExecutionAdapter;
  private eventBus: IEventStream | undefined;
  /** Protocol handlers for CustomBackend */
  public readonly protocolHandlers: ProtocolHandlerRegistry | undefined;
  private runtimeHandlers: RuntimeHandlerRegistry | undefined;

  // Engine backends
  private localBackend: LocalBackend;
  private apiBackend: ApiBackend;
  private mcpBackend: McpBackend;
  private customBackend: CustomBackend;

  constructor(deps: AgentRunnerDependencies) {
    // [EARS-H4] Validate ExecutionAdapter is provided
    if (!deps.executionAdapter) {
      throw new MissingDependencyError("ExecutionAdapter", "required");
    }

    this.projectRoot = deps.projectRoot;
    this.gitgovPath = deps.gitgovPath ?? path.join(this.projectRoot, ".gitgov");
    this.identityAdapter = deps.identityAdapter ?? undefined;
    this.executionAdapter = deps.executionAdapter;
    this.eventBus = deps.eventBus ?? undefined;
    this.protocolHandlers = deps.protocolHandlers ?? undefined;
    this.runtimeHandlers = deps.runtimeHandlers ?? undefined;

    // Initialize all engine backends
    this.localBackend = new LocalBackend(this.projectRoot, this.runtimeHandlers);
    this.apiBackend = new ApiBackend(this.identityAdapter);
    this.mcpBackend = new McpBackend(this.identityAdapter);
    this.customBackend = new CustomBackend(this.protocolHandlers);
  }

  /**
   * Executes an agent once and returns the response.
   * TaskRecord must exist before calling this method.
   */
  async runOnce(opts: RunOptions): Promise<AgentResponse> {
    const startedAt = new Date().toISOString();
    const runId = randomUUID(); // [EARS-C3]
    let output: AgentOutput | undefined;
    let error: string | undefined;
    let status: "success" | "error" = "success";

    // [EARS-A1, A2, A3] Load AgentRecord
    const agent = await this.loadAgent(opts.agentId);

    // [EARS-A3] Extract engine from payload
    const engine = agent.engine;
    const engineType = engine.type as string;

    // [EARS-G1] Validate engine.type
    if (!VALID_ENGINE_TYPES.includes(engineType as typeof VALID_ENGINE_TYPES[number])) {
      throw new UnsupportedEngineTypeError(engineType);
    }

    // [EARS-G2] Validate url for api/mcp
    if ((engineType === "api" || engineType === "mcp") && !("url" in engine)) {
      throw new EngineConfigError(engineType, "url");
    }

    // [EARS-G3] Validate IdentityAdapter for actor-signature auth
    if (engineType === "api" || engineType === "mcp") {
      const engineWithAuth = engine as { auth?: { type?: string } };
      if (
        engineWithAuth.auth?.type === "actor-signature" &&
        !this.identityAdapter
      ) {
        throw new MissingDependencyError(
          "IdentityAdapter",
          "required for actor-signature auth"
        );
      }
    }

    // [EARS-C1, C2] Build context
    const ctx: AgentExecutionContext = {
      agentId: opts.agentId,
      actorId: opts.actorId ?? opts.agentId, // [EARS-C2]
      taskId: opts.taskId,
      runId,
      input: opts.input,
    };

    // [EARS-I1] Emit agent:started event
    this.emitEvent({
      type: "agent:started",
      payload: { runId, agentId: opts.agentId, taskId: opts.taskId, startedAt },
    });

    try {
      // Execute via appropriate backend and CAPTURE output
      switch (engineType) {
        case "local":
          output = await this.localBackend.execute(engine as LocalEngine, ctx);
          break;
        case "api":
          output = await this.apiBackend.execute(engine as ApiEngine, ctx);
          break;
        case "mcp":
          output = await this.mcpBackend.execute(
            engine as McpEngine,
            ctx,
            opts.tool // Pass tool override from RunOptions
          );
          break;
        case "custom":
          output = await this.customBackend.execute(engine as CustomEngine, ctx);
          break;
      }
    } catch (err) {
      status = "error";
      error = (err as Error).message;
    }

    const completedAt = new Date().toISOString();
    const durationMs =
      new Date(completedAt).getTime() - new Date(startedAt).getTime();

    // [EARS-H1, H2] Write ExecutionRecord
    // Build result message (min 10 chars required by schema)
    const resultMessage = status === "success"
      ? output?.message || `Agent ${opts.agentId} completed successfully`
      : `Agent ${opts.agentId} failed: ${error || 'Unknown error'}`;

    const executionRecord = await this.executionAdapter.create(
      {
        taskId: opts.taskId,
        type: status === "success" ? "completion" : "blocker",
        title: `Agent execution: ${opts.agentId}`,
        result: resultMessage.length >= 10 ? resultMessage : resultMessage.padEnd(10, '.'),
        metadata: {
          agentId: opts.agentId,
          runId,
          status,
          output: status === "success" ? output : undefined,
          error: status === "error" ? error : undefined,
          startedAt,
          completedAt,
          durationMs,
        },
      },
      ctx.actorId
    );

    // [EARS-H3] executionRecordId in response
    const executionRecordId = executionRecord.id;

    // [EARS-I2, I3] Emit completion event
    if (status === "success") {
      this.emitEvent({
        type: "agent:completed",
        payload: {
          runId,
          agentId: opts.agentId,
          taskId: opts.taskId,
          status,
          durationMs,
          executionRecordId,
        },
      });
    } else {
      this.emitEvent({
        type: "agent:error",
        payload: {
          runId,
          agentId: opts.agentId,
          taskId: opts.taskId,
          status,
          error: error!,
          durationMs,
          executionRecordId,
        },
      });
    }

    // [EARS-J1, J2, J3] Return AgentResponse
    const response: AgentResponse = {
      runId,
      agentId: opts.agentId,
      status,
      executionRecordId,
      startedAt,
      completedAt,
      durationMs,
    };

    // [EARS-J2] Include output only on success
    if (status === "success" && output) {
      response.output = output;
    }

    // [EARS-J3] Include error only on failure
    if (status === "error" && error) {
      response.error = error;
    }

    return response;
  }

  /**
   * [EARS-A1, A2] Loads AgentRecord from .gitgov/agents/agent-{id}.json
   */
  private async loadAgent(agentId: string): Promise<AgentRecord> {
    // Remove "agent:" prefix if present
    const id = agentId.startsWith("agent:") ? agentId.slice(6) : agentId;
    const agentPath = path.join(this.gitgovPath, "agents", `agent-${id}.json`);

    try {
      const content = await fs.readFile(agentPath, "utf-8");
      const record = JSON.parse(content);
      // Return payload if wrapped in GitGovRecord structure
      return record.payload ?? record;
    } catch {
      throw new AgentNotFoundError(agentId);
    }
  }

  /**
   * [EARS-I4] Emits event via EventBus if available.
   * Works silently without EventBus.
   */
  private emitEvent(event: AgentRunnerEvent): void {
    if (this.eventBus) {
      this.eventBus.publish({
        type: event.type,
        timestamp: Date.now(),
        source: "agent_runner_module",
        payload: event.payload,
      });
    }
  }
}

/**
 * [EARS-K1] Factory function for FsAgentRunner.
 *
 * Creates a filesystem-based agent runner with injected dependencies.
 * Recommended for dependency injection scenarios.
 */
export function createFsAgentRunner(deps: AgentRunnerDependencies): IAgentRunner {
  return new FsAgentRunner(deps);
}
