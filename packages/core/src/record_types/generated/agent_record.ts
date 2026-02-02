/**
 * This file was automatically generated from agent_record_schema.json.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source schema,
 * and run 'pnpm compile:types' to regenerate this file.
 */

/**
 * Canonical schema for agent operational manifests.
 */
export interface AgentRecord<TMetadata = object> {
  /**
   * Unique identifier for the agent, linking to an ActorRecord.
   */
  id: string;
  status?: 'active' | 'archived';
  /**
   * Optional list of triggers that activate the agent.
   * Additional fields are allowed and depend on trigger type:
   * - webhook triggers: 'event' (event identifier), 'filter' (condition)
   * - scheduled triggers: 'cron' (cron expression)
   * - manual triggers: 'command' (example CLI command)
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
  prompt_engine_requirements?: {
    roles?: string[];
    skills?: string[];
  };
  /**
   * Optional framework-specific or deployment-specific metadata for agent extensions.
   * Common use cases: framework identification (langchain, google-adk), deployment info (provider, image, region),
   * cost tracking (cost_per_invocation, currency), tool capabilities, maintainer info.
   * This field does NOT affect agent execution - it is purely informational.
   *
   */
  metadata?: TMetadata;
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
         * Name of the MCP tool to invoke. If not specified, defaults to agentId without 'agent:' prefix.
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
}
