import type { ValidateFunction } from "ajv";
import * as path from "path";
import type { WorkflowMethodologyRecord } from "../types/workflow_methodology_record";
import { ConfigManager } from "../config_manager";
import { SchemaValidationCache } from "./schema-cache";
import { SchemaValidationError, ProjectRootError } from "./common";

// --- Schema Validation ---
let _schemaPath: string | null = null;

function getSchemaPath(): string {
  if (!_schemaPath) {
    const root = ConfigManager.findProjectRoot();
    if (!root) {
      throw new ProjectRootError();
    }
    _schemaPath = path.join(root, "packages/blueprints/03_products/protocol/09_workflow_methodology/workflow_methodology_schema.yaml");
  }
  return _schemaPath;
}

export function validateWorkflowMethodologyConfigSchema(
  data: unknown
): [boolean, ValidateFunction["errors"]] {
  const validateSchema = SchemaValidationCache.getValidator(getSchemaPath());
  const isValid = validateSchema(data) as boolean;
  return [isValid, validateSchema.errors];
}

/**
 * Type guard to check if data is a valid WorkflowMethodologyConfig.
 */
export function isWorkflowMethodologyConfig(data: unknown): data is WorkflowMethodologyRecord {
  const validateSchema = SchemaValidationCache.getValidator(getSchemaPath());
  return validateSchema(data) as boolean;
}

/**
 * Validates a WorkflowMethodologyConfig and returns detailed validation result.
 * Use this in factories and adapters for comprehensive error reporting.
 */
export function validateWorkflowMethodologyConfigDetailed(data: unknown): {
  isValid: boolean;
  errors: Array<{
    field: string;
    message: string;
    value: unknown;
  }>;
} {
  const [isValid, ajvErrors] = validateWorkflowMethodologyConfigSchema(data);

  const formattedErrors = ajvErrors ? ajvErrors.map(error => ({
    field: error.instancePath || error.schemaPath || 'root',
    message: error.message || 'Validation failed',
    value: error.data
  })) : [];

  return {
    isValid,
    errors: formattedErrors
  };
}

/**
 * Validates configuration structure and business rules
 * @param config The workflow methodology configuration to validate
 */
export function validateWorkflowMethodologyConfigBusinessRules(
  config: WorkflowMethodologyRecord
): {
  isValid: boolean;
  errors: Array<{
    field: string;
    message: string;
    value: unknown;
  }>;
} {
  const errors: Array<{ field: string; message: string; value: unknown }> = [];

  // Validate state_transitions have valid structure
  const validStates = ['draft', 'review', 'ready', 'active', 'done', 'archived', 'paused', 'discarded'];

  for (const [targetState, transition] of Object.entries(config.state_transitions)) {
    if (!validStates.includes(targetState)) {
      errors.push({
        field: `state_transitions.${targetState}`,
        message: `Invalid target state: ${targetState}`,
        value: targetState
      });
    }

    // Validate 'from' states are valid
    if (transition.from) {
      for (const fromState of transition.from) {
        if (!validStates.includes(fromState)) {
          errors.push({
            field: `state_transitions.${targetState}.from`,
            message: `Invalid source state: ${fromState}`,
            value: fromState
          });
        }
      }
    }

    // Validate custom_rules reference existing rules
    if (transition.requires.custom_rules && config.custom_rules) {
      for (const ruleId of transition.requires.custom_rules) {
        if (!config.custom_rules[ruleId]) {
          errors.push({
            field: `state_transitions.${targetState}.requires.custom_rules`,
            message: `Custom rule '${ruleId}' not defined in custom_rules section`,
            value: ruleId
          });
        }
      }
    }
  }

  // Validate custom_rules have valid validation types
  if (config.custom_rules) {
    const validValidationTypes = ['assignment_required', 'sprint_capacity', 'epic_complexity', 'custom'];

    for (const [ruleId, rule] of Object.entries(config.custom_rules)) {
      if (!validValidationTypes.includes(rule.validation)) {
        errors.push({
          field: `custom_rules.${ruleId}.validation`,
          message: `Invalid validation type: ${rule.validation}`,
          value: rule.validation
        });
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
