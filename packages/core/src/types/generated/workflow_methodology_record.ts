/**
 * This file was automatically generated from workflow_methodology_record_schema.json.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source schema,
 * and run 'pnpm compile:types' to regenerate this file.
 */

/**
 * Complete schema for workflow methodology configuration files that define state transitions, signatures, and custom rules
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
          from: [string, ...string[]];
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
             * Signature requirements keyed by role (e.g., 'approver:quality', 'developer:backend')
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
          validation: 'assignment_required' | 'sprint_capacity' | 'epic_complexity' | 'custom';
          /**
           * Optional parameters for the validation rule
           */
          parameters?: {};
          /**
           * Inline validation expression for 'custom' validation type. Implementation determines the runtime and language. Must return boolean or Promise<boolean>.
           */
          expression?: string;
          /**
           * Path to external module for custom validation (alternative to expression)
           */
          module_path?: string;
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
     * References to agents required for this methodology. Agent details (engine, knowledge, etc.) live in their AgentRecord.
     */
    required_agents?: {
      [k: string]: unknown | undefined;
    }[];
  };
}
