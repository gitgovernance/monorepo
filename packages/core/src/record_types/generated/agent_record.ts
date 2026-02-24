/**
 * This file was automatically generated from agent_record_schema.json.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source schema,
 * and run 'pnpm compile:types' to regenerate this file.
 */

/**
 * Canonical schema for agent operational manifests — the work contract that defines how an agent is invoked.
 */
export interface AgentRecord<TMetadata = object> {
  /**
   * Unique identifier for the agent, linking 1:1 to an ActorRecord of type agent.
   */
  id: string;
  /**
   * Operational status. An archived agent cannot be invoked.
   */
  status?: 'active' | 'archived';
  /**
   * Invocation specification — defines how the agent is executed. Uses oneOf with 4 variants: local, api, mcp, custom.
   */
  engine:
    | {
        type: 'local';
        /**
         * Runtime environment (typescript, python, etc.)
         */
        runtime?: string;
        /**
         * Path to the agent entry file
         */
        entrypoint?: string;
        /**
         * Function name to invoke
         */
        function?: string;
      }
    | {
        type: 'api';
        /**
         * HTTP endpoint for the agent
         */
        url: string;
        /**
         * HTTP method
         */
        method?: 'POST' | 'GET' | 'PUT';
        /**
         * Authentication configuration for API requests
         */
        auth?: {
          /**
           * Authentication type. 'actor-signature' uses the agent's ActorRecord keypair to sign requests.
           */
          type?: 'bearer' | 'oauth' | 'api-key' | 'actor-signature';
          /**
           * Reference to secret in Secret Manager (for bearer/api-key/oauth auth types)
           */
          secret_key?: string;
          /**
           * Direct token value (not recommended for production, use secret_key instead)
           */
          token?: string;
          [k: string]: unknown | undefined;
        };
      }
    | {
        type: 'mcp';
        /**
         * MCP server endpoint
         */
        url: string;
        /**
         * Name of the MCP tool to invoke. If omitted, the agent has access to all tools on the server.
         */
        tool?: string;
        /**
         * Authentication configuration for MCP server
         */
        auth?: {
          /**
           * Authentication type. 'actor-signature' uses the agent's ActorRecord keypair to sign requests.
           */
          type?: 'bearer' | 'oauth' | 'api-key' | 'actor-signature';
          /**
           * Reference to secret in Secret Manager (for bearer/api-key/oauth auth types)
           */
          secret_key?: string;
          /**
           * Direct token value (not recommended for production, use secret_key instead)
           */
          token?: string;
          [k: string]: unknown | undefined;
        };
      }
    | {
        type: 'custom';
        /**
         * Custom protocol identifier (e.g., 'a2a', 'grpc')
         */
        protocol?: string;
        /**
         * Protocol-specific configuration
         */
        config?: {};
      };
  /**
   * Optional list of triggers that activate the agent.
   * Additional fields are allowed and depend on trigger type:
   * - manual: 'command' (example CLI command)
   * - webhook: 'event' (event identifier), 'filter' (condition)
   * - scheduled: 'cron' (cron expression)
   *
   */
  triggers?: {
    /**
     * Type of trigger that activates the agent
     */
    type: 'manual' | 'webhook' | 'scheduled';
    [k: string]: unknown | undefined;
  }[];
  knowledge_dependencies?: string[];
  /**
   * Requirements for prompt composition — roles and skills the agent needs.
   */
  prompt_engine_requirements?: {
    roles?: string[];
    skills?: string[];
  };
  /**
   * Optional framework-specific or deployment-specific metadata.
   * Common use cases: framework identification (langchain, google-adk), deployment info,
   * cost tracking, tool capabilities, maintainer info.
   * This field does NOT affect agent execution — it is purely informational.
   *
   */
  metadata?: TMetadata;
}
