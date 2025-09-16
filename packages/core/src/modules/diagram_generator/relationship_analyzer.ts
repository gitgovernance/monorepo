// Local interfaces that match the actual GitGovernance protocol implementation
interface CycleRecord {
  id: string;
  title: string;
  status: 'planning' | 'active' | 'completed' | 'archived';
  taskIds?: string[];
  childCycleIds?: string[];
  tags?: string[];
  notes?: string;
}

interface TaskRecord {
  id: string;
  status: 'draft' | 'audit_oracle_create' | 'pending' | 'in_progress' | 'audit_oracle_close' | 'validated' | 'paused' | 'discarded' | 'ready' | 'review' | 'active' | 'done' | 'completed' | 'archived' | 'blocked' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  tags: string[];
  cycleIds?: string[];
  references?: string[];
  notes?: string;
}

export interface DiagramNode {
  id: string;
  type: 'cycle' | 'epic-task' | 'task';
  title: string;
  status?: string;
  tags?: string[];
  originalId: string;
}

export interface DiagramEdge {
  from: string;
  to: string;
  type: 'hierarchy';
}

export interface RelationshipGraph {
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

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class CircularDependencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircularDependencyError';
  }
}

export class RelationshipAnalyzer {

  /**
   * Analyzes relationships between cycles and tasks to build a complete graph
   */
  analyzeRelationships(cycles: CycleRecord[], tasks: TaskRecord[]): RelationshipGraph {
    if (!Array.isArray(cycles) || !Array.isArray(tasks)) {
      throw new ValidationError('Cycles and tasks must be arrays');
    }

    // Validate record integrity
    this.validateRecordIntegrity(cycles, tasks);

    const rawNodes = this.buildNodes(cycles, tasks);
    const rawEdges = this.buildEdges(cycles, tasks, rawNodes);

    // Detect and report duplicates as warnings
    this.reportDuplicateWarnings(rawNodes, rawEdges);

    // Deduplicate nodes and edges
    const nodes = this.deduplicateNodes(rawNodes);
    const edges = this.deduplicateEdges(rawEdges);

    // Detect circular dependencies
    this.detectCircularDependencies(edges);

    return {
      nodes,
      edges,
      metadata: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        generatedAt: new Date().toISOString(),
        duplicatesRemoved: {
          nodes: rawNodes.length - nodes.length,
          edges: rawEdges.length - edges.length,
        },
      },
    };
  }

  /**
   * Detects epic tasks based on tags containing "epic:" pattern
   */
  detectEpicTasks(tasks: TaskRecord[]): TaskRecord[] {
    return tasks.filter(task =>
      task.tags?.some(tag => tag.startsWith('epic:'))
    );
  }

  /**
   * Generates clean node ID for Mermaid syntax (removes timestamp, converts hyphens)
   */
  generateNodeId(record: CycleRecord | TaskRecord): string {
    return record.id
      .replace(/^\d+-/, '') // Remove timestamp prefix
      .replace(/-/g, '_');   // Convert hyphens to underscores
  }

  /**
   * Validates record integrity before processing
   */
  private validateRecordIntegrity(cycles: CycleRecord[], tasks: TaskRecord[]): void {
    // Validate cycles
    for (let i = 0; i < cycles.length; i++) {
      const cycle = cycles[i];
      if (!cycle) {
        throw new ValidationError(`Cycle at index ${i} is undefined`);
      }
      try {
        if (!cycle.id || typeof cycle.id !== 'string') {
          throw new ValidationError(`Invalid cycle ID: ${cycle.id} (expected string, got ${typeof cycle.id})`);
        }

        if (!cycle.title || typeof cycle.title !== 'string') {
          throw new ValidationError(`Invalid cycle title: ${cycle.title} (expected string, got ${typeof cycle.title})`);
        }
      } catch (error) {
        throw new ValidationError(`Cycle validation error at index ${i} (id: ${cycle.id || 'unknown'}): ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Validate tasks
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      if (!task) {
        throw new ValidationError(`Task at index ${i} is undefined`);
      }
      const sourceFile = (task as any)._sourceFile || 'unknown';

      try {
        if (!task.id || typeof task.id !== 'string') {
          throw new ValidationError(`Invalid task ID: ${task.id} (expected string, got ${typeof task.id})`);
        }

        if (!task.description || typeof task.description !== 'string') {
          throw new ValidationError(`Invalid task description: ${task.description} (expected string, got ${typeof task.description})`);
        }
      } catch (error) {
        const fileInfo = sourceFile !== 'unknown' ? `\n📁 File: .gitgov/tasks/${sourceFile}` : '';
        throw new ValidationError(`Task validation error at index ${i} (id: ${task?.id || 'unknown'}): ${error instanceof Error ? error.message : String(error)}${fileInfo}\n💡 Check this file for missing or invalid 'description' field in payload.`);
      }
    }
  }

  /**
   * Builds all nodes from cycles and tasks
   */
  private buildNodes(cycles: CycleRecord[], tasks: TaskRecord[]): DiagramNode[] {
    const nodes: DiagramNode[] = [];

    // Add cycle nodes
    for (const cycle of cycles) {
      nodes.push({
        id: this.generateNodeId(cycle),
        type: 'cycle',
        title: cycle.title,
        status: cycle.status,
        tags: cycle.tags || [],
        originalId: cycle.id,
      });
    }

    // Add task nodes (both epic and regular)
    for (const task of tasks) {
      const isEpic = this.isEpicTask(task);

      // Use description field for task display
      const title = this.extractTitleFromDescription(task.description);

      nodes.push({
        id: this.generateNodeId(task),
        type: isEpic ? 'epic-task' : 'task',
        title,
        status: task.status,
        tags: task.tags,
        originalId: task.id,
      });
    }

    return nodes;
  }

  /**
   * Extracts a short title from task description
   */
  private extractTitleFromDescription(description: string): string {
    // Take first line or first 60 characters as title
    const firstLine = description.split('\n')[0];
    if (!firstLine) return 'Untitled Task';
    return firstLine.length > 60 ? firstLine.substring(0, 57) + '...' : firstLine;
  }

  /**
   * Builds all hierarchical edges from protocol relationships
   */
  private buildEdges(cycles: CycleRecord[], tasks: TaskRecord[], nodes: DiagramNode[]): DiagramEdge[] {
    const edges: DiagramEdge[] = [];
    const nodeMap = new Map(nodes.map(n => [n.originalId, n.id]));

    // Build cycle -> child cycle relationships
    for (const cycle of cycles) {
      if (cycle.childCycleIds) {
        for (const childId of cycle.childCycleIds) {
          const fromId = nodeMap.get(cycle.id);
          const toId = nodeMap.get(childId);

          if (fromId && toId) {
            edges.push({
              from: fromId,
              to: toId,
              type: 'hierarchy',
            });
          }
        }
      }

      // Build cycle -> task relationships  
      if (cycle.taskIds) {
        for (const taskId of cycle.taskIds) {
          const fromId = nodeMap.get(cycle.id);
          const toId = nodeMap.get(taskId);

          if (fromId && toId) {
            edges.push({
              from: fromId,
              to: toId,
              type: 'hierarchy',
            });
          }
        }
      }
    }

    return edges;
  }

  /**
   * Checks if a task is an epic based on tags
   */
  private isEpicTask(task: TaskRecord): boolean {
    return task.tags?.some(tag => tag.startsWith('epic:')) ?? false;
  }

  /**
   * Detects circular dependencies in the graph
   */
  private detectCircularDependencies(edges: DiagramEdge[]): void {
    const graph = new Map<string, string[]>();

    // Build adjacency list
    for (const edge of edges) {
      if (!graph.has(edge.from)) {
        graph.set(edge.from, []);
      }
      graph.get(edge.from)!.push(edge.to);
    }

    // DFS to detect cycles with path tracking
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        const cyclePath = this.findCycleDFS(node, graph, visited, recursionStack, path);
        if (cyclePath.length > 0) {
          const cycleDescription = this.formatCycleError(cyclePath, edges);
          throw new CircularDependencyError(cycleDescription);
        }
      }
    }
  }

  /**
   * DFS helper for circular dependency detection with path tracking
   */
  private findCycleDFS(
    node: string,
    graph: Map<string, string[]>,
    visited: Set<string>,
    recursionStack: Set<string>,
    path: string[]
  ): string[] {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        const cyclePath = this.findCycleDFS(neighbor, graph, visited, recursionStack, path);
        if (cyclePath.length > 0) {
          return cyclePath;
        }
      } else if (recursionStack.has(neighbor)) {
        // Found a cycle - extract the cycle path
        const cycleStartIndex = path.indexOf(neighbor);
        return path.slice(cycleStartIndex).concat([neighbor]);
      }
    }

    recursionStack.delete(node);
    path.pop();
    return [];
  }

  /**
   * Formats a circular dependency error with helpful context
   */
  private formatCycleError(cyclePath: string[], edges: DiagramEdge[]): string {
    const cycleNodes = cyclePath.slice(0, -1); // Remove duplicate at end
    const nodeNames = cycleNodes.map(nodeId => {
      // Try to extract readable name from node ID
      const cleanId = nodeId.replace(/^(cycle_|task_)/, '').replace(/_/g, '-');
      return cleanId;
    });

    let message = `Circular dependency detected in GitGovernance entities:\n\n`;
    message += `🔄 Dependency Cycle:\n`;

    for (let i = 0; i < cycleNodes.length; i++) {
      const current = nodeNames[i];
      const next = nodeNames[(i + 1) % nodeNames.length];
      message += `   ${current} → ${next}\n`;
    }

    message += `\n💡 To fix this issue:\n`;
    message += `   1. Review the childCycleIds in these cycle files:\n`;
    cycleNodes.forEach(nodeId => {
      const cleanId = nodeId.replace(/^cycle_/, '').replace(/_/g, '-');
      message += `      - .gitgov/cycles/${cleanId}.json\n`;
    });
    message += `   2. Remove one of the circular references to break the cycle\n`;
    message += `   3. Consider if the dependency relationship is actually needed\n`;

    return message;
  }

  /**
   * Reports duplicate nodes and edges as console warnings
   */
  private reportDuplicateWarnings(nodes: DiagramNode[], edges: DiagramEdge[]): void {
    // Analyze node duplicates
    const nodeCount = new Map<string, { count: number, sources: string[] }>();
    for (const node of nodes) {
      const current = nodeCount.get(node.id) || { count: 0, sources: [] };
      current.count++;
      current.sources.push(node.originalId);
      nodeCount.set(node.id, current);
    }

    const duplicateNodes = Array.from(nodeCount.entries())
      .filter(([_, data]) => data.count > 1);

    // Analyze edge duplicates
    const edgeCount = new Map<string, number>();
    for (const edge of edges) {
      const edgeKey = `${edge.from}->${edge.to}`;
      edgeCount.set(edgeKey, (edgeCount.get(edgeKey) || 0) + 1);
    }

    const duplicateEdges = Array.from(edgeCount.entries())
      .filter(([_, count]) => count > 1);

    // Report warnings if duplicates found
    if (duplicateNodes.length > 0 || duplicateEdges.length > 0) {
      console.warn('\n⚠️  GitGovernance Data Quality Warnings:');

      if (duplicateNodes.length > 0) {
        console.warn('\n📦 Duplicate Nodes Detected:');
        duplicateNodes.forEach(([id, data]) => {
          const cleanSources = [...new Set(data.sources)]; // Remove duplicate sources
          console.warn(`   • ${id} (appears ${data.count} times)`);
          if (cleanSources.length > 1) {
            console.warn(`     Sources: ${cleanSources.join(', ')}`);
            console.warn(`     💡 Fix: Check for duplicate cycle/task IDs in .gitgov/ files`);
          } else {
            console.warn(`     Source: ${cleanSources[0]} (same ID referenced multiple times)`);
            console.warn(`     💡 Fix: Check for duplicate childCycleIds/taskIds references`);
          }
        });
      }

      if (duplicateEdges.length > 0) {
        console.warn('\n🔗 Duplicate Edges Detected:');
        duplicateEdges.forEach(([edge, count]) => {
          console.warn(`   • ${edge} (appears ${count} times)`);
        });
        console.warn('     💡 Fix: Check for duplicate references in childCycleIds/taskIds arrays');
      }

      console.warn('\n✂️  Auto-deduplication: Duplicates will be removed from the generated diagram');
      console.warn('📋 Recommendation: Run `gitgov lint` to identify and fix data quality issues\n');
    }
  }

  /**
   * Removes duplicate nodes based on their ID
   */
  private deduplicateNodes(nodes: DiagramNode[]): DiagramNode[] {
    const seen = new Set<string>();
    const deduplicated: DiagramNode[] = [];

    for (const node of nodes) {
      if (!seen.has(node.id)) {
        seen.add(node.id);
        deduplicated.push(node);
      }
    }

    return deduplicated;
  }

  /**
   * Removes duplicate edges based on from-to combination
   */
  private deduplicateEdges(edges: DiagramEdge[]): DiagramEdge[] {
    const seen = new Set<string>();
    const deduplicated: DiagramEdge[] = [];

    for (const edge of edges) {
      const edgeKey = `${edge.from}->${edge.to}`;
      if (!seen.has(edgeKey)) {
        seen.add(edgeKey);
        deduplicated.push(edge);
      }
    }

    return deduplicated;
  }

  /**
   * Detects and reports duplicate nodes/edges for diagnostic purposes
   */
  detectDuplicates(cycles: CycleRecord[], tasks: TaskRecord[]): {
    duplicateNodes: Array<{ id: string, count: number, sources: string[] }>;
    duplicateEdges: Array<{ edge: string, count: number }>;
  } {
    const rawNodes = this.buildNodes(cycles, tasks);
    const rawEdges = this.buildEdges(cycles, tasks, rawNodes);

    // Analyze node duplicates
    const nodeCount = new Map<string, { count: number, sources: string[] }>();
    for (const node of rawNodes) {
      const current = nodeCount.get(node.id) || { count: 0, sources: [] };
      current.count++;
      current.sources.push(node.originalId);
      nodeCount.set(node.id, current);
    }

    const duplicateNodes = Array.from(nodeCount.entries())
      .filter(([_, data]) => data.count > 1)
      .map(([id, data]) => ({ id, count: data.count, sources: data.sources }));

    // Analyze edge duplicates
    const edgeCount = new Map<string, number>();
    for (const edge of rawEdges) {
      const edgeKey = `${edge.from}->${edge.to}`;
      edgeCount.set(edgeKey, (edgeCount.get(edgeKey) || 0) + 1);
    }

    const duplicateEdges = Array.from(edgeCount.entries())
      .filter(([_, count]) => count > 1)
      .map(([edge, count]) => ({ edge, count }));

    return { duplicateNodes, duplicateEdges };
  }

  /**
   * Filters cycles and tasks based on specified criteria
   */
  filterEntities(
    cycles: CycleRecord[],
    tasks: TaskRecord[],
    filters: {
      cycleId?: string;
      taskId?: string;
      packageName?: string;
    }
  ): { filteredCycles: CycleRecord[], filteredTasks: TaskRecord[] } {
    let filteredCycles = [...cycles];
    let filteredTasks = [...tasks];

    // Filter by specific cycle ID
    if (filters.cycleId) {
      const targetCycle = cycles.find(c => c.id === filters.cycleId);
      if (targetCycle) {
        // Include the target cycle and its related entities
        const relatedCycleIds = new Set([filters.cycleId]);
        const relatedTaskIds = new Set<string>();

        // Add child cycles
        if (targetCycle.childCycleIds) {
          targetCycle.childCycleIds.forEach(id => relatedCycleIds.add(id));
        }

        // Add tasks from the target cycle
        if (targetCycle.taskIds) {
          targetCycle.taskIds.forEach(id => relatedTaskIds.add(id));
        }

        // Find tasks that belong to related cycles
        cycles.forEach(cycle => {
          if (relatedCycleIds.has(cycle.id) && cycle.taskIds) {
            cycle.taskIds.forEach(taskId => relatedTaskIds.add(taskId));
          }
        });

        filteredCycles = cycles.filter(c => relatedCycleIds.has(c.id));
        filteredTasks = tasks.filter(t => relatedTaskIds.has(t.id));
      }
    }

    // Filter by specific task ID
    if (filters.taskId) {
      const targetTask = tasks.find(t => t.id === filters.taskId);
      if (targetTask) {
        filteredTasks = [targetTask];

        // Find cycles that contain this task
        filteredCycles = cycles.filter(c =>
          c.taskIds && c.taskIds.includes(filters.taskId!)
        );
      }
    }

    // Filter by package name (using tags)
    if (filters.packageName) {
      const packageTag = `package:${filters.packageName}`;

      filteredCycles = filteredCycles.filter(c =>
        c.tags && c.tags.includes(packageTag)
      );

      filteredTasks = filteredTasks.filter(t =>
        t.tags && t.tags.includes(packageTag)
      );
    }

    return { filteredCycles, filteredTasks };
  }
}
