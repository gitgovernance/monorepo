import type { TaskRecord } from '../../types/task_record';
import type { CycleRecord } from '../../types/cycle_record';
import { GraphValidator } from './graph_validator';

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
    // Validate record integrity using specialized validator
    GraphValidator.validateRecordIntegrity(cycles, tasks);

    const rawGraph = this.buildRawGraph(cycles, tasks);
    const cleanGraph = this.processAndValidateGraph(rawGraph);

    return this.createRelationshipGraph(rawGraph, cleanGraph);
  }

  /**
   * Builds the initial graph with potential duplicates
   */
  private buildRawGraph(cycles: CycleRecord[], tasks: TaskRecord[]): { nodes: DiagramNode[], edges: DiagramEdge[] } {
    const rawNodes = this.buildNodes(cycles, tasks);
    const rawEdges = this.buildEdges(cycles, tasks, rawNodes);
    return { nodes: rawNodes, edges: rawEdges };
  }

  /**
   * Processes raw graph to remove duplicates and validate structure
   */
  private processAndValidateGraph(rawGraph: { nodes: DiagramNode[], edges: DiagramEdge[] }): { nodes: DiagramNode[], edges: DiagramEdge[] } {
    // Detect and report duplicates as warnings
    this.reportDuplicateWarnings(rawGraph.nodes, rawGraph.edges);

    // Deduplicate nodes and edges
    const nodes = this.deduplicateNodes(rawGraph.nodes);
    const edges = this.deduplicateEdges(rawGraph.edges);

    // Detect circular dependencies
    this.detectCircularDependencies(edges);

    return { nodes, edges };
  }

  /**
   * Creates the final RelationshipGraph with metadata
   */
  private createRelationshipGraph(
    rawGraph: { nodes: DiagramNode[], edges: DiagramEdge[] },
    cleanGraph: { nodes: DiagramNode[], edges: DiagramEdge[] }
  ): RelationshipGraph {
    return {
      nodes: cleanGraph.nodes,
      edges: cleanGraph.edges,
      metadata: {
        nodeCount: cleanGraph.nodes.length,
        edgeCount: cleanGraph.edges.length,
        generatedAt: new Date().toISOString(),
        duplicatesRemoved: {
          nodes: rawGraph.nodes.length - cleanGraph.nodes.length,
          edges: rawGraph.edges.length - cleanGraph.edges.length,
        },
      },
    };
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

      // Use title field for task display
      const title = task.title || 'Untitled Task';

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
          const cycleDescription = this.formatCycleError(cyclePath);
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
  private formatCycleError(cyclePath: string[]): string {
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
   * Removes duplicate nodes based on their ID (O(n) performance)
   */
  private deduplicateNodes(nodes: DiagramNode[]): DiagramNode[] {
    const nodeMap = new Map<string, DiagramNode>();
    
    // Use Map to automatically handle deduplication while preserving first occurrence
    for (const node of nodes) {
      if (!nodeMap.has(node.id)) {
        nodeMap.set(node.id, node);
      }
    }
    
    return Array.from(nodeMap.values());
  }

  /**
   * Removes duplicate edges based on from-to combination (O(n) performance)
   */
  private deduplicateEdges(edges: DiagramEdge[]): DiagramEdge[] {
    const edgeMap = new Map<string, DiagramEdge>();
    
    for (const edge of edges) {
      const edgeKey = `${edge.from}->${edge.to}`;
      if (!edgeMap.has(edgeKey)) {
        edgeMap.set(edgeKey, edge);
      }
    }
    
    return Array.from(edgeMap.values());
  }

  /**
   * Detects and reports duplicate nodes/edges for diagnostic purposes
   * Useful for testing and debugging data quality issues
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

        // Recursively add all descendant cycles
        const addDescendantCycles = (cycleId: string) => {
          const cycle = cycles.find(c => c.id === cycleId);
          if (cycle?.childCycleIds) {
            cycle.childCycleIds.forEach(childId => {
              if (!relatedCycleIds.has(childId)) {
                relatedCycleIds.add(childId);
                addDescendantCycles(childId); // Recursive call
              }
            });
          }
        };

        // Start recursive traversal from target cycle
        addDescendantCycles(filters.cycleId);

        // Add tasks from all related cycles
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
