#!/bin/bash

set -e

PROTOCOL_SCHEMA_DIR_BASE="../../packages/blueprints/03_products/protocol"

# Function to check if a file is a valid YAML. This is a simpler check.
validate_schema_syntax() {
  local schema_path=$1
  echo "🔍 Syntactically validating $schema_path..."
  if [ ! -f "$schema_path" ]; then
    echo "❌ Error: Schema file not found at '$schema_path'."
    exit 1
  fi
  # Use js-yaml to parse the file. If it fails, the script will exit.
  pnpm js-yaml "$schema_path" > /dev/null
  echo "✅ Syntax OK for $schema_path"
}

# --- Validate Syntax of All Schemas ---
validate_schema_syntax "$PROTOCOL_SCHEMA_DIR_BASE/01_embedded/embedded_metadata_schema.yaml"
validate_schema_syntax "$PROTOCOL_SCHEMA_DIR_BASE/02_actor/actor_record_schema.yaml"
validate_schema_syntax "$PROTOCOL_SCHEMA_DIR_BASE/03_agent/agent_record_schema.yaml"
validate_schema_syntax "$PROTOCOL_SCHEMA_DIR_BASE/04_task/task_record_schema.yaml"
validate_schema_syntax "$PROTOCOL_SCHEMA_DIR_BASE/05_execution/execution_record_schema.yaml"
validate_schema_syntax "$PROTOCOL_SCHEMA_DIR_BASE/06_changelog/changelog_record_schema.yaml"
validate_schema_syntax "$PROTOCOL_SCHEMA_DIR_BASE/07_feedback/feedback_record_schema.yaml"
validate_schema_syntax "$PROTOCOL_SCHEMA_DIR_BASE/08_cycle/cycle_record_schema.yaml"

echo "✅ All schemas are syntactically valid YAML!"