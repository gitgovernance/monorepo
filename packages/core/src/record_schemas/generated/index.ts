/**
 * GitGovernance Protocol Schemas
 * 
 * Auto-generated from blueprints. Do not edit manually.
 * Run 'pnpm sync:schemas' to update.
 */

import actorRecordSchema from "./actor_record_schema.json";
import agentRecordSchema from "./agent_record_schema.json";
import cycleRecordSchema from "./cycle_record_schema.json";
import embeddedMetadataSchema from "./embedded_metadata_schema.json";
import executionRecordSchema from "./execution_record_schema.json";
import feedbackRecordSchema from "./feedback_record_schema.json";
import taskRecordSchema from "./task_record_schema.json";
import workflowRecordSchema from "./workflow_record_schema.json";

/**
 * All GitGovernance protocol schemas
 */
export const Schemas = {
  ActorRecord: actorRecordSchema,
  AgentRecord: agentRecordSchema,
  CycleRecord: cycleRecordSchema,
  EmbeddedMetadata: embeddedMetadataSchema,
  ExecutionRecord: executionRecordSchema,
  FeedbackRecord: feedbackRecordSchema,
  TaskRecord: taskRecordSchema,
  WorkflowRecord: workflowRecordSchema,
} as const;

/**
 * Schema names for type safety
 */
export type SchemaName = 
  | "ActorRecord"
  | "AgentRecord"
  | "CycleRecord"
  | "EmbeddedMetadata"
  | "ExecutionRecord"
  | "FeedbackRecord"
  | "TaskRecord"
  | "WorkflowRecord";

/**
 * Get a schema by name
 */
export function getSchema(name: SchemaName) {
  return Schemas[name];
}

/**
 * Get all schema names
 */
export function getSchemaNames(): SchemaName[] {
  return Object.keys(Schemas) as SchemaName[];
}

/**
 * Check if a schema exists
 */
export function hasSchema(name: string): name is SchemaName {
  return name in Schemas;
}
