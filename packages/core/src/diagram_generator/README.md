# DiagramGenerator Module - Data Quality & Deduplication

## Overview

This module generates Mermaid diagrams from GitGovernance entities with built-in data quality validation and automatic deduplication.

## Key Features

### ✅ Automatic Duplicate Detection & Removal

- **Duplicate Nodes**: Detects when the same entity appears multiple times
- **Duplicate Edges**: Detects when the same relationship is defined multiple times
- **Auto-deduplication**: Automatically removes duplicates from the generated diagram
- **User Warnings**: Shows clear warnings about data quality issues

### ✅ Advanced Filtering

- **Cycle Filtering**: Show only a specific cycle and its related entities
- **Task Filtering**: Show only a specific task and its containing cycles
- **Package Filtering**: Show only entities tagged with a specific package
- **CLI Integration**: Direct command-line filtering support

### ✅ Data Quality Warnings

When duplicates are detected, the system shows:

```
⚠️  GitGovernance Data Quality Warnings:

📦 Duplicate Nodes Detected:
   • cycle_identity_adapter (appears 2 times)
     Source: 1757321600-cycle-identity-adapter (same ID referenced multiple times)
     💡 Fix: Check for duplicate childCycleIds/taskIds references

🔗 Duplicate Edges Detected:
   • cycle_identity_adapter->task_implement_actor_operations (appears 2 times)
   • cycle_identity_adapter->task_create_identity_adapter_comprehensive_tests (appears 2 times)
     💡 Fix: Check for duplicate references in childCycleIds/taskIds arrays

✂️  Auto-deduplication: Duplicates will be removed from the generated diagram
📋 Recommendation: Run `gitgov lint` to identify and fix data quality issues
```

## Architecture

### Core Classes

#### `RelationshipAnalyzer`

- **Purpose**: Analyzes relationships between cycles and tasks
- **Key Methods**:
  - `analyzeRelationships()` - Main analysis with deduplication
  - `filterEntities(cycles, tasks, filters)` - Apply filtering logic
  - `detectDuplicates()` - Public method for diagnostic purposes
  - `reportDuplicateWarnings()` - Shows warnings to users
  - `deduplicateNodes()` - Removes duplicate nodes
  - `deduplicateEdges()` - Removes duplicate edges

#### `DiagramGenerator`

- **Purpose**: Main orchestrator for diagram generation
- **Key Methods**:
  - `generateFromRecords(cycles, tasks, filters?)` - Generate from in-memory data with optional filtering
  - `generateFromFiles(gitgovPath, filters?)` - Generate from .gitgov/ directory with optional filtering
  - `loadCycleRecords()` - Load cycle files
  - `loadTaskRecords()` - Load task files

### Data Flow

1. Load records from `.gitgov/` files
2. Build raw nodes and edges
3. **Detect and report duplicates as warnings**
4. **Deduplicate nodes and edges**
5. Detect circular dependencies
6. Generate Mermaid diagram

## CLI Integration

### TUI Warnings Display

The `DiagramDashboard` component captures and displays warnings:

- Warnings appear in **yellow text** in the TUI
- Both generation and watch mode show warnings
- Warnings are cleared on each new generation

### Fixed Issues

- **Button "q" now works properly** - Fixed exit handling
- **Warnings visible in TUI** - Previously only showed in console

## Common Issues & Solutions

### Duplicate Nodes

**Cause**: Multiple files with the same entity ID
**Example**: Two files both containing `"id": "1757321600-cycle-identity-adapter"`
**Solution**: Remove duplicate files or fix ID conflicts

### Duplicate Edges

**Cause**: Same relationship defined multiple times
**Example**: Cycle references the same child twice in `childCycleIds`
**Solution**: Remove duplicate references in arrays

## Diagnostic Tools

### Built-in Diagnostics

```typescript
const duplicates = generator.analyzer.detectDuplicates(cycles, tasks);
console.log(duplicates.duplicateNodes);
console.log(duplicates.duplicateEdges);
```

### Available Scripts

- `packages/core/scripts/diagnose-duplicates.ts` - Detailed duplicate analysis
- `packages/core/scripts/update-diagram.ts` - Direct diagram generation
- `packages/cli/scripts/test-generation.ts` - CLI testing

## Future Integration Points

### For `gitgov lint` Command

The duplicate detection can be integrated into the lint command:

```typescript
import { DiagramGenerator } from "@gitgovernance/core";

const generator = new DiagramGenerator();
const duplicates = generator.analyzer.detectDuplicates(cycles, tasks);
// Report as lint errors
```

### For `gitgov audit` Command

Similar integration for workflow validation.

## Metadata Tracking

The generated graph includes metadata about deduplication:

```typescript
interface RelationshipGraph {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  metadata: {
    nodeCount: number;
    edgeCount: number;
    generatedAt: string;
    duplicatesRemoved?: {
      nodes: number;
      edges: number;
    };
  };
}
```

## Testing

### Duplicate Detection Test

1. Create duplicate files in `.gitgov/cycles/`
2. Run `gitgov diagram`
3. Press 'g' to generate
4. Observe warnings in yellow text
5. Clean up duplicate files

### Filtering Test

```bash
# Filter by specific cycle
gitgov diagram --cycle 1756365288-cycle-core-mvp

# Filter by specific task
gitgov diagram --task 1757321602-task-implement-actor-operations

# Filter by package
gitgov diagram --package core
```

## Implementation Notes

- **Non-breaking**: Duplicates are removed automatically, diagram still generates
- **User-friendly**: Clear warnings with actionable fixes
- **Performance**: Deduplication adds minimal overhead
- **Extensible**: Easy to add new types of validations
