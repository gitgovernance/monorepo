/**
 * This file was automatically generated from agent_record_schema.json.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source schema,
 * and run 'pnpm compile:types' to regenerate this file.
 */

/**
 * Canonical schema for agent operational manifests.
 */
export interface AgentRecord {
  /**
   * Unique identifier for the agent, linking to an ActorRecord.
   */
  id: string;
  status?: 'active' | 'archived';
  guild: 'design' | 'intelligence' | 'strategy' | 'operations' | 'quality';
  triggers?: {
    type: 'manual' | 'webhook' | 'scheduled';
  }[];
  knowledge_dependencies?: string[];
  prompt_engine_requirements?: {
    roles?: string[];
    skills?: string[];
  };
  engine:
    | {
        type: 'local';
        runtime?: string;
        entrypoint?: string;
        function?: string;
      }
    | {
        type: 'api';
        url?: string;
        method?: 'POST' | 'GET';
        auth?: {};
      }
    | {
        type: 'mcp';
        url?: string;
        auth?: {};
      };
}
