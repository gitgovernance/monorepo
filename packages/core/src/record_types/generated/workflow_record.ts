/**
 * This file was automatically generated from workflow_record_schema.json.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source schema,
 * and run 'pnpm compile:types' to regenerate this file.
 */

/**
 * Schema for workflow methodology configuration that defines named state transitions, signatures, and custom rules.
 */
export interface WorkflowRecord {
  /**
   * Unique identifier for the workflow record (10 timestamp + 1 dash + 8 'workflow' + 1 dash + max 50 slug = 70 max)
   */
  id: string;
  /**
   * Human-readable name of the methodology
   */
  name: string;
  /**
   * Brief description of the methodology's purpose and scope
   */
  description?: string;
  /**
   * Map of named transitions to their rules. Keys are transition names (e.g., submit, approve, activate, resume), not target states.
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
          /**
           * Target state for this transition
           */
          to: string;
          requires: {
            /**
             * CLI command that triggers this transition (Command Gate)
             */
            command?: string;
            /**
             * System event that triggers this transition (Event Gate)
             */
            event?: string;
            /**
             * Signature group requirements (Signature Gate)
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
                     * Optional: restrict to specific actor IDs
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
           * Inline validation expression for 'custom' type. Must return boolean.
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
   * Optional agent automation configuration
   */
  agent_integration?: {
    /**
     * Brief description of the agent integration
     */
    description?: string;
    /**
     * Agents required for this methodology
     */
    required_agents?: {
      [k: string]: unknown | undefined;
    }[];
  };
}
