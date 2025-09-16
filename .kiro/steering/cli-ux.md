---
inclusion: fileMatch
fileMatchPattern: ["packages/cli/src/**/*.ts", "packages/cli/src/**/*.tsx"]
---

# CLI User Experience Guidelines

Core UX principles and implementation patterns for the `gitgov` CLI. All CLI commands must follow these conventions.

## Core UX Principles

### Progressive Disclosure

- Commands default to essential output only
- Use `--verbose` for detailed information, `--json` for machine-readable output
- Complex workflows use interactive TUIs, not overwhelming option lists

### Offline-First Performance

- **MANDATORY**: CLI must work 100% offline with local `.gitgov/` directory
- Read operations use `.gitgov/index.json` cache for instant responses
- Write operations invalidate cache and trigger background regeneration
- Graceful fallback to direct file reads if cache unavailable

### Safety & Composability

- Destructive operations require `--force` flag for confirmation
- All read commands support `--json` flag for scripting integration
- Commands return appropriate exit codes (0 = success, 1 = error)

## Command Implementation Patterns

### Command Structure (Commander.js)

```typescript
// ✅ Correct command structure
program
  .command("task list")
  .option("--json", "Output as JSON")
  .option("--status <status>", "Filter by status")
  .action(async (options) => {
    const result = await taskAdapter.listTasks(options);
    if (options.json) {
      console.log(JSON.stringify(result.data));
    } else {
      renderTaskTable(result.data);
    }
  });
```

### Directory Organization

- Commands grouped by domain: `packages/cli/src/commands/{domain}/`
- Shared components in `packages/cli/src/components/`
- Services for business logic in `packages/cli/src/services/`

### Standard Options (Apply to All Commands)

- `--json`: Machine-readable JSON output
- `--verbose`: Detailed human-readable output
- `--quiet`: Minimal output (errors only)
- `--force`: Skip confirmations for destructive operations

## Interactive UI Patterns (Ink)

### TUI Components

```typescript
// ✅ Use Ink for complex interactions
import { Box, Text } from 'ink';
import { StatusBadge } from '../components/StatusBadge';

const TaskDashboard = ({ tasks }) => (
  <Box flexDirection="column">
    {tasks.map(task => (
      <Box key={task.id}>
        <StatusBadge status={task.status} />
        <Text>{task.title}</Text>
      </Box>
    ))}
  </Box>
);
```

### When to Use TUIs

- Multi-step workflows (`gitgov init`, `gitgov dashboard`)
- Real-time data display with updates
- Complex data visualization (task boards, cycle timelines)
- User input with validation and confirmation

## Performance Requirements

### Cache Strategy

- Use `IndexerAdapter` to maintain `.gitgov/index.json`
- Read commands check cache first, fall back to direct file access
- Write commands invalidate cache immediately
- Manual cache control via `gitgov indexer rebuild`

### Response Time Targets

- Cached reads: < 50ms
- Direct file reads: < 200ms
- Write operations: < 500ms
- Interactive TUI startup: < 1s

## Error Handling & User Feedback

### Error Messages

```typescript
// ✅ Actionable error messages
if (!fs.existsSync(".gitgov")) {
  console.error("No .gitgov directory found. Run `gitgov init` first.");
  process.exit(1);
}
```

### Success Feedback

- Minimal for simple operations: "Task created: task:123"
- Detailed for complex operations: Show what was created/modified
- Use colors and icons for visual clarity (green ✓, red ✗, yellow ⚠)

## Implementation Checklist

When creating new CLI commands:

- [ ] Use Commander.js with consistent option naming
- [ ] Support `--json` flag for machine-readable output
- [ ] Implement proper error handling with exit codes
- [ ] Use `IndexerAdapter` for read operations when possible
- [ ] Add interactive TUI for complex workflows
- [ ] Include help text and examples
- [ ] Test offline functionality
- [ ] Validate input and provide clear error messages
