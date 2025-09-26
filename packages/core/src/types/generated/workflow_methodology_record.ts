/**
 * This file was automatically generated from workflow_methodology_record_schema.json.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source schema,
 * and run 'pnpm compile:types' to regenerate this file.
 */

/**
 * Complete schema for workflow methodology configuration files that define state transitions, signatures, and view configurations
 */
export interface WorkflowMethodologyRecord {
  /**
   * JSON Schema reference
   */
  $schema?: string;
  /**
   * Semantic version of the methodology configuration
   */
  version: string;
  /**
   * Human-readable name of the methodology
   */
  name: string;
  /**
   * Brief description of the methodology's purpose and scope
   */
  description?: string;
  /**
   * Defines valid state transitions and their requirements
   */
  state_transitions: {
    [k: string]:
      | {
          /**
           * Valid source states for this transition
           *
           * @minItems 1
           */
          from: [
            'draft' | 'review' | 'ready' | 'active' | 'done' | 'archived' | 'paused' | 'discarded',
            ...('draft' | 'review' | 'ready' | 'active' | 'done' | 'archived' | 'paused' | 'discarded')[]
          ];
          requires: {
            /**
             * CLI command that triggers this transition
             */
            command?: string;
            /**
             * System event that triggers this transition
             */
            event?: string;
            /**
             * Signature requirements keyed by guild
             */
            signatures?: {
              [k: string]:
                | {
                    /**
                     * Required signature role
                     */
                    role: string;
                    /**
                     * Required capability roles in actor record
                     *
                     * @minItems 1
                     */
                    capability_roles: [string, ...string[]];
                    /**
                     * Minimum number of required approvals
                     */
                    min_approvals: number;
                    /**
                     * Optional: restrict to specific actor type
                     */
                    actor_type?: 'human' | 'agent';
                    /**
                     * Optional: specific actors that can sign
                     */
                    specific_actors?: string[];
                  }
                | undefined;
            };
            /**
             * List of custom rule identifiers to validate
             */
            custom_rules?: string[];
          };
        }
      | undefined;
  };
  /**
   * Definitions for custom validation rules
   */
  custom_rules?: {
    [k: string]:
      | {
          /**
           * Human-readable description of the rule
           */
          description: string;
          /**
           * Validation type identifier
           */
          validation: 'assignment_required' | 'sprint_capacity' | 'epic_complexity' | 'custom' | 'javascript';
          /**
           * Optional parameters for the validation rule
           */
          parameters?: {};
          /**
           * JavaScript function code for 'javascript' validation type. Must return Promise<boolean>
           */
          javascript_function?: string;
          /**
           * Path to external module for custom validation (alternative to javascript_function)
           */
          module_path?: string;
        }
      | undefined;
  };
  /**
   * Visual representation configurations for different view types
   */
  view_configs?: {
    [k: string]:
      | {
          /**
           * Column definitions mapping visual names to task states
           */
          columns: {
            /**
             * @minItems 1
             */
            [k: string]:
              | [
                  'draft' | 'review' | 'ready' | 'active' | 'done' | 'archived' | 'paused' | 'discarded',
                  ...('draft' | 'review' | 'ready' | 'active' | 'done' | 'archived' | 'paused' | 'discarded')[]
                ]
              | undefined;
          };
          /**
           * Visual theme for this view configuration
           */
          theme?: 'default' | 'dark' | 'minimal' | 'corporate';
          /**
           * Layout direction for the view
           */
          layout?: 'horizontal' | 'vertical' | 'grid';
        }
      | undefined;
  };
  /**
   * Optional agent automation configuration for methodology
   */
  agent_integration?: {
    /**
     * Brief description of the agent integration
     */
    description?: string;
    /**
     * List of agents required for this methodology
     */
    required_agents?: {
      /**
       * Unique agent identifier
       */
      id: string;
      /**
       * Agent guild classification
       */
      gremio: 'design' | 'intelligence' | 'strategy' | 'operations' | 'quality';
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
      /**
       * Event triggers for this agent
       */
      triggers?: {
        /**
         * Event that triggers the agent
         */
        event: string;
        /**
         * Action the agent should perform
         */
        action: string;
      }[];
      /**
       * Knowledge files this agent depends on
       */
      knowledge_dependencies?: string[];
    }[];
    /**
     * Automation rules linking triggers to agents
     */
    automation_rules?: {
      /**
       * Event or condition that triggers automation
       */
      trigger: string;
      /**
       * Agent ID that handles this automation
       */
      agent: string;
      /**
       * Specific action the agent should perform
       */
      action: string;
    }[];
  };
}
