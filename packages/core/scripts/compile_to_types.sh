#!/bin/bash

set -e

# These paths are relative to the execution directory (packages/core)
PROTOCOL_SCHEMA_DIR_BASE="../../packages/blueprints/03_products/protocol"
OUTPUT_DIR="./src/types"

mkdir -p "$OUTPUT_DIR"

process_schema() {
  local schema_file_path=$1
  
  local base_name=$(basename "$schema_file_path" .yaml)
  local type_name=${base_name%_record_schema}
  type_name=${type_name%_schema}
  
  local output_file="$OUTPUT_DIR/${type_name}_record.d.ts"
  if [ "$type_name" == "embedded_metadata" ]; then
    output_file="$OUTPUT_DIR/embedded_metadata.d.ts"
  fi
  
  echo "Processing $schema_file_path -> $output_file"
  
  pnpm json2ts -i "$schema_file_path" -o "$output_file" --cwd="$(dirname "$schema_file_path")"
  
  if [ $? -ne 0 ]; then
    echo "❌ Error generating types for $type_name"
    exit 1
  fi
  echo "✅ Successfully generated types for $type_name"
}

# --- Process all canonical record schemas ---
echo "Processing all protocol schemas..."
process_schema "$PROTOCOL_SCHEMA_DIR_BASE/01_embedded/embedded_metadata_schema.yaml"
process_schema "$PROTOCOL_SCHEMA_DIR_BASE/02_actor/actor_record_schema.yaml"
process_schema "$PROTOCOL_SCHEMA_DIR_BASE/03_agent/agent_record_schema.yaml"
process_schema "$PROTOCOL_SCHEMA_DIR_BASE/04_task/task_record_schema.yaml"
process_schema "$PROTOCOL_SCHEMA_DIR_BASE/05_execution/execution_record_schema.yaml"
process_schema "$PROTOCOL_SCHEMA_DIR_BASE/06_changelog/changelog_record_schema.yaml"
process_schema "$PROTOCOL_SCHEMA_DIR_BASE/07_feedback/feedback_record_schema.yaml"
process_schema "$PROTOCOL_SCHEMA_DIR_BASE/08_cycle/cycle_record_schema.yaml"
process_schema "$PROTOCOL_SCHEMA_DIR_BASE/09_workflow_methodology/workflow_methodology_schema.yaml"
process_schema "$PROTOCOL_SCHEMA_DIR_BASE/10_planning_methodology/planning_methodology_schema.yaml"

echo "✅ All schema files have been processed successfully!"