import type { RelationshipGraph, DiagramNode, DiagramEdge } from './relationship_analyzer';

export interface DiagramOptions {
  layout: 'LR' | 'TD' | 'RL' | 'BT';
  includeEpicTasks: boolean;
  maxDepth: number;
  colorScheme: 'default' | 'dark' | 'minimal' | 'corporate';
  showAssignments: boolean;
  filterByStatus?: string[];
}

export class RenderingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RenderingError';
  }
}

export class ContentSanitizer {
  sanitizeNodeTitle(title: string): string {
    // Remove potentially dangerous characters for Mermaid, but preserve <br/> tags
    return title
      .replace(/<(?!br\/?>)[^>]*>/g, '') // Remove HTML tags except <br/> and <br>
      .replace(/["']/g, '')  // Remove quotes that could break syntax
      .substring(0, 150);    // Increased limit to accommodate line breaks
  }

  sanitizeNodeId(id: string): string {
    // Ensure valid Mermaid node ID
    return id.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  sanitizeStatus(status: string): string {
    const allowedStatuses = [
      'pending', 'in-progress', 'done', 'blocked',
      'cancelled', 'draft', 'planning', 'active',
      'completed', 'archived', 'paused', 'discarded',
      'validated', 'audit_oracle_create', 'audit_oracle_close',
      'ready', 'review', 'in_progress'
    ];
    return allowedStatuses.includes(status) ? status : 'unknown';
  }

  sanitizeGraph(graph: RelationshipGraph): RelationshipGraph {
    return {
      nodes: graph.nodes.map(node => {
        const sanitizedNode: DiagramNode = {
          id: this.sanitizeNodeId(node.id),
          type: node.type,
          title: this.sanitizeNodeTitle(node.title),
          originalId: node.originalId,
        };

        if (node.status) {
          sanitizedNode.status = this.sanitizeStatus(node.status);
        }

        if (node.tags) {
          sanitizedNode.tags = node.tags;
        }

        return sanitizedNode;
      }),
      edges: graph.edges.filter(edge => edge.from && edge.to),
      metadata: graph.metadata,
    };
  }
}

export class MermaidValidator {
  isValidMermaidSyntax(content: string): boolean {
    // Basic Mermaid syntax validation
    const lines = content.split('\n');

    // Must start with flowchart declaration
    const flowchartLine = lines.find(line => line.trim().startsWith('flowchart'));
    if (!flowchartLine) {
      return false;
    }

    // Check for balanced brackets in node definitions
    const nodeLines = lines.filter(line => line.includes('["') && line.includes('"]'));
    for (const line of nodeLines) {
      const openBrackets = (line.match(/\["/g) || []).length;
      const closeBrackets = (line.match(/"\]/g) || []).length;
      if (openBrackets !== closeBrackets) {
        return false;
      }
    }

    return true;
  }
}

export class MermaidRenderer {
  private readonly sanitizer: ContentSanitizer;
  private readonly validator: MermaidValidator;

  constructor() {
    this.sanitizer = new ContentSanitizer();
    this.validator = new MermaidValidator();
  }

  /**
   * Main rendering method with input sanitization and output validation
   */
  renderGraph(graph: RelationshipGraph, options: DiagramOptions): string {
    if (!graph || !graph.nodes || !graph.edges) {
      throw new RenderingError('Invalid graph structure');
    }

    const sanitizedGraph = this.sanitizer.sanitizeGraph(graph);
    const content = this.generateMermaidContent(sanitizedGraph, options);

    // Validate generated Mermaid syntax
    if (!this.validator.isValidMermaidSyntax(content)) {
      throw new RenderingError('Generated invalid Mermaid syntax');
    }

    return content;
  }

  /**
   * Generates the complete Mermaid diagram content
   */
  private generateMermaidContent(graph: RelationshipGraph, options: DiagramOptions): string {
    const header = this.generateHeader(options);
    const nodes = this.generateNodes(graph.nodes);
    const edges = this.generateEdges(graph.edges);
    const styling = this.generateStyling();
    const statusClasses = this.generateStatusClasses(graph.nodes);

    return [
      '```mermaid',
      header,
      '',
      nodes,
      '',
      edges,
      '',
      styling,
      '',
      statusClasses,
      '```'
    ].join('\n');
  }

  /**
   * Generates the diagram header with metadata
   */
  private generateHeader(options: DiagramOptions): string {
    const timestamp = new Date().toISOString();
    return [
      `flowchart ${options.layout}`,
      `    %% Auto-generated on ${timestamp}`,
      `    %% Source: .gitgov/ entities`,
    ].join('\n');
  }

  /**
   * Generates node syntax for all nodes
   */
  private generateNodes(nodes: DiagramNode[]): string {
    const nodeLines = nodes.map(node => this.generateNodeSyntax(node));
    return nodeLines.join('\n');
  }

  /**
   * Generates edge syntax for all relationships
   */
  private generateEdges(edges: DiagramEdge[]): string {
    if (edges.length === 0) {
      return '    %% No relationships found';
    }

    const edgeLines = [
      '    %% ONLY hierarchical relationships from protocol',
      '    %% Source: CycleRecord.childCycleIds and CycleRecord.taskIds',
      ...edges.map(edge => this.generateEdgeSyntax(edge))
    ];

    return edgeLines.join('\n');
  }

  /**
   * Wraps a title string to a specified max width, using <br/> for line breaks.
   * Also sanitizes the title.
   * @param title The title to wrap.
   * @param maxWidth The maximum width of a line.
   * @returns The wrapped and sanitized title string.
   */
  private wrapTitle(title: string, maxWidth: number = 30): string {
    // The sanitizer already limits total length, so this is for readability.
    const sanitizedTitle = this.sanitizer.sanitizeNodeTitle(title);
    if (sanitizedTitle.length <= maxWidth) {
      return sanitizedTitle;
    }

    const words = sanitizedTitle.split(' ');
    const lines = [];
    let currentLine = words.shift() || '';

    for (const word of words) {
      if ((currentLine + ' ' + word).length > maxWidth) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine += ` ${word}`;
      }
    }
    lines.push(currentLine);

    return lines.join('<br/>');
  }

  /**
   * Node generation with word wrapping for better readability.
   * Uses different shapes for different node types:
   * - Cycles: Hexagonal shape {{text}} for strategic importance
   * - Tasks: Rectangular shape [text] for implementation details
   */
  generateNodeSyntax(node: DiagramNode): string {
    const wrappedTitle = this.wrapTitle(node.title);
    const sanitizedId = this.sanitizer.sanitizeNodeId(node.id);

    const icon = this.getNodeIcon(node.type);

    // Use hexagonal shape for cycles (strategic level)
    if (node.type === 'cycle') {
      return `    ${sanitizedId}{{"${icon}<br/>${wrappedTitle}"}}`;
    }

    // Use rectangular shape for tasks (implementation level)
    if (node.type === 'epic-task' && node.status === 'paused') {
      return `    ${sanitizedId}["${icon}<br/>${wrappedTitle}<br/>(PAUSED)"]`;
    }

    return `    ${sanitizedId}["${icon}<br/>${wrappedTitle}"]`;
  }

  /**
   * Edge generation with relationship validation
   */
  generateEdgeSyntax(edge: DiagramEdge): string {
    if (!edge.from || !edge.to) {
      throw new RenderingError('Edge must have valid from and to nodes');
    }

    const sanitizedFrom = this.sanitizer.sanitizeNodeId(edge.from);
    const sanitizedTo = this.sanitizer.sanitizeNodeId(edge.to);

    return `    ${sanitizedFrom} --> ${sanitizedTo}`;
  }

  /**
   * Gets the appropriate icon for each node type
   */
  private getNodeIcon(type: string): string {
    const icons = {
      'cycle': '🎯',
      'epic-task': '📦',
      'task': '📋',
    };
    return icons[type as keyof typeof icons] || '📋';
  }

  /**
   * Generates the mandatory color scheme CSS
   */
  private generateStyling(): string {
    return [
      '    %% Status styling (mandatory color scheme)',
      '    classDef statusDraft fill:#ffffff,stroke:#cccccc,stroke-width:2px,color:#666666',
      '    classDef statusReady fill:#ffffeb,stroke:#cccc00,stroke-width:2px,color:#666600',
      '    classDef statusInProgress fill:#ebf5ff,stroke:#0066cc,stroke-width:2px,color:#003366',
      '    classDef statusDone fill:#ebffeb,stroke:#00cc00,stroke-width:2px,color:#006600',
      '    classDef statusBlocked fill:#ffebeb,stroke:#cc0000,stroke-width:2px,color:#660000',
      '    classDef statusEpicPaused fill:#f3e5f5,stroke:#9c27b0,stroke-width:2px,color:#4a148c',
      '    classDef statusArchived fill:#f5f5f5,stroke:#666666,stroke-width:2px,color:#333333',
    ].join('\n');
  }

  /**
   * Applies status-based CSS classes to nodes
   */
  private generateStatusClasses(nodes: DiagramNode[]): string {
    const statusGroups = new Map<string, string[]>();

    // Group nodes by status
    for (const node of nodes) {
      const statusClass = this.getStatusClass(node.status || 'draft', node);


      if (!statusGroups.has(statusClass)) {
        statusGroups.set(statusClass, []);
      }
      statusGroups.get(statusClass)!.push(node.id);
    }

    // Generate class applications
    const classLines: string[] = [];
    for (const [statusClass, nodeIds] of statusGroups.entries()) {
      if (nodeIds.length > 0) {
        const sanitizedIds = nodeIds.map(id => this.sanitizer.sanitizeNodeId(id));
        classLines.push(`    class ${sanitizedIds.join(',')} ${statusClass}`);
      }
    }

    return [
      '    %% Apply styles based on entity status',
      ...classLines
    ].join('\n');
  }

  /**
   * Maps entity status to CSS class name with cycle and epic task special handling
   */
  private getStatusClass(status: string, node?: DiagramNode): string {
    // Special case: Epic task paused (waiting for parent cycle)
    if (status === 'paused' && node?.type === 'epic-task') {
      return 'statusEpicPaused'; // Purple - not a real blockage
    }

    // Handle cycle statuses
    if (node?.type === 'cycle') {
      const cycleStatusMap: Record<string, string> = {
        'planning': 'statusDraft',     // White - being planned
        'active': 'statusInProgress',  // Blue - sprint/milestone running
        'completed': 'statusDone',     // Green - all tasks finished
        'archived': 'statusArchived',  // Gray - historical record
      };
      return cycleStatusMap[status] || 'statusDraft';
    }

    // Handle task statuses
    const taskStatusMap: Record<string, string> = {
      // Completed states - Green
      'done': 'statusDone',
      'validated': 'statusDone',

      // Active states - Blue  
      'active': 'statusInProgress',
      'in_progress': 'statusInProgress',

      // Ready states - Yellow (only for tasks)
      'ready': 'statusReady',
      'pending': 'statusReady',

      // Preparation states - White
      'draft': 'statusDraft',
      'review': 'statusDraft',

      // Real blockages - Red (only for NON-epic tasks)
      'blocked': 'statusBlocked',
      'paused': 'statusBlocked',
      'cancelled': 'statusBlocked',
      'discarded': 'statusBlocked',

      // Archived states - Gray
      'archived': 'statusArchived',

      // Legacy oracle states - White (preparation)
      'audit_oracle_create': 'statusDraft',
      'audit_oracle_close': 'statusDraft',
    };

    return taskStatusMap[status] || 'statusDraft';
  }
}
