import { RelationshipAnalyzer, type RelationshipGraph } from './relationship_analyzer';
import { MermaidRenderer, type DiagramOptions } from './mermaid_renderer';
import type { TaskRecord } from '../record_types';
import type { CycleRecord } from '../record_types';
import { promises as fs } from "fs";
import * as path from "path";

const MAX_GENERATION_TIME_HISTORY = 100;

export class DiagramMetrics {
  private cacheHits: number = 0;
  private cacheMisses: number = 0;
  private generationTimes: number[] = [];

  incrementCacheHits(): void {
    this.cacheHits++;
  }

  incrementCacheMisses(): void {
    this.cacheMisses++;
  }

  recordGenerationTime(timeMs: number): void {
    this.generationTimes.push(timeMs);

    // Keep only last N measurements to prevent memory leak
    if (this.generationTimes.length > MAX_GENERATION_TIME_HISTORY) {
      this.generationTimes.shift();
    }
  }

  getCacheHitRatio(): number {
    const total = this.cacheHits + this.cacheMisses;
    return total === 0 ? 0 : this.cacheHits / total;
  }

  getAverageGenerationTime(): number {
    if (this.generationTimes.length === 0) return 0;

    const sum = this.generationTimes.reduce((a, b) => a + b, 0);
    return sum / this.generationTimes.length;
  }

  getStats() {
    return {
      cacheHitRatio: this.getCacheHitRatio(),
      averageGenerationTime: this.getAverageGenerationTime(),
      totalGenerations: this.generationTimes.length,
    };
  }
}

export class DiagramGenerator {
  private readonly options: DiagramOptions;
  private readonly cache: Map<string, RelationshipGraph>;
  private readonly metrics: DiagramMetrics;
  public readonly analyzer: RelationshipAnalyzer;
  private readonly renderer: MermaidRenderer;

  constructor(options: Partial<DiagramOptions> = {}) {
    this.options = Object.freeze({
      layout: 'LR',
      includeEpicTasks: true,
      maxDepth: 4,
      colorScheme: 'default',
      showAssignments: false,
      ...options
    } as DiagramOptions);

    this.cache = new Map();
    this.metrics = new DiagramMetrics();
    this.analyzer = new RelationshipAnalyzer();
    this.renderer = new MermaidRenderer();
  }

  /**
   * Primary API - Performance optimized with caching
   */
  async generateFromRecords(
    cycles: CycleRecord[],
    tasks: TaskRecord[],
    filters?: {
      cycleId?: string;
      taskId?: string;
      packageName?: string;
    },
    showArchived: boolean = false
  ): Promise<string> {
    const cacheKey = this.generateCacheKey(cycles, tasks, showArchived);

    if (this.cache.has(cacheKey)) {
      this.metrics.incrementCacheHits();
      return this.renderFromCache(cacheKey);
    }

    const startTime = performance.now();

    try {
      // Apply filters if provided
      let finalCycles = cycles;
      let finalTasks = tasks;

      // Filter out archived entities by default (EARS-18)
      if (!showArchived) {
        finalCycles = cycles.filter(cycle => cycle.status !== 'archived');
        finalTasks = tasks.filter(task => task.status !== 'archived');
      }

      if (filters && (filters.cycleId || filters.taskId || filters.packageName)) {
        const filtered = this.analyzer.filterEntities(finalCycles, finalTasks, filters);
        finalCycles = filtered.filteredCycles;
        finalTasks = filtered.filteredTasks;
      }

      const graph = this.analyzer.analyzeRelationships(finalCycles, finalTasks);
      const result = this.renderer.renderGraph(graph, this.options);

      this.cache.set(cacheKey, graph);
      this.metrics.recordGenerationTime(performance.now() - startTime);
      this.metrics.incrementCacheMisses();

      return result;
    } catch (error) {
      this.metrics.recordGenerationTime(performance.now() - startTime);
      throw error;
    }
  }

  /**
   * Convenience method to generate from .gitgov/ directory
   */
  async generateFromFiles(
    gitgovPath: string = '.gitgov',
    filters?: {
      cycleId?: string;
      taskId?: string;
      packageName?: string;
    },
    showArchived: boolean = false
  ): Promise<string> {
    const cycles = await this.loadCycleRecords(gitgovPath);
    const tasks = await this.loadTaskRecords(gitgovPath);

    return this.generateFromRecords(cycles, tasks, filters, showArchived);
  }

  /**
   * Loads all cycle records from the filesystem
   */
  public async loadCycleRecords(gitgovPath: string): Promise<CycleRecord[]> {
    const cyclesDir = path.join(gitgovPath, 'cycles');

    try {
      const files = await fs.readdir(cyclesDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));

      const cycles: CycleRecord[] = [];

      for (const file of jsonFiles) {
        try {
          const filePath = path.join(cyclesDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const record = JSON.parse(content);

          // Extract payload from EmbeddedMetadata structure
          if (record.payload && record.payload.id) {
            const cycleRecord = record.payload as CycleRecord;
            // Add file source info for better error reporting
            (cycleRecord as any)._sourceFile = file;
            cycles.push(cycleRecord);
          } else {
            console.warn(`⚠️  Cycle file ${file} missing payload or payload.id`);
          }
        } catch (error) {
          console.warn(`❌ Could not parse cycle file ${file}:`, error instanceof Error ? error.message : String(error));
        }
      }

      return cycles;
    } catch (error) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        console.warn(`⚠️  Cycles directory not found: ${cyclesDir}`);
        console.warn(`💡 Run 'gitgov init' to create the .gitgov directory structure`);
      } else {
        console.warn(`❌ Could not read cycles directory:`, error instanceof Error ? error.message : String(error));
      }
      return [];
    }
  }

  /**
   * Loads all task records from the filesystem
   */
  public async loadTaskRecords(gitgovPath: string): Promise<TaskRecord[]> {
    const tasksDir = path.join(gitgovPath, 'tasks');

    try {
      const files = await fs.readdir(tasksDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));

      const tasks: TaskRecord[] = [];

      for (const file of jsonFiles) {
        try {
          const filePath = path.join(tasksDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const record = JSON.parse(content);

          // Extract payload from EmbeddedMetadata structure
          if (record.payload && record.payload.id) {
            const taskRecord = record.payload as TaskRecord;
            // Add file source info for better error reporting
            (taskRecord as any)._sourceFile = file;


            tasks.push(taskRecord);
          } else {
            console.warn(`⚠️  Task file ${file} missing payload or payload.id`);
          }
        } catch (error) {
          console.warn(`❌ Could not parse task file ${file}:`, error instanceof Error ? error.message : String(error));
        }
      }

      return tasks;
    } catch (error) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        console.warn(`⚠️  Tasks directory not found: ${tasksDir}`);
        console.warn(`💡 Run 'gitgov init' to create the .gitgov directory structure`);
      } else {
        console.warn(`❌ Could not read tasks directory:`, error instanceof Error ? error.message : String(error));
      }
      return [];
    }
  }

  /**
   * Renders diagram from cached graph
   */
  private renderFromCache(cacheKey: string): string {
    const graph = this.cache.get(cacheKey)!;
    return this.renderer.renderGraph(graph, this.options);
  }

  /**
   * Generates cache key for efficient lookups
   */
  private generateCacheKey(cycles: CycleRecord[], tasks: TaskRecord[], showArchived: boolean = false): string {
    // Use Set for O(1) deduplication and consistent ordering
    const cycleIds = [...new Set(cycles.map(c => c.id))].sort();
    const taskIds = [...new Set(tasks.map(t => t.id))].sort();

    const cycleHash = this.hashArray(cycleIds);
    const taskHash = this.hashArray(taskIds);
    const optionsHash = this.hashString(JSON.stringify(this.options));
    const archivedFlag = showArchived ? 'with-archived' : 'no-archived';

    return `diagram:${cycleHash}-${taskHash}-${optionsHash}-${archivedFlag}`;
  }

  /**
   * Efficient hash function for arrays
   */
  private hashArray(items: string[]): string {
    let hash = 0;
    for (const item of items) {
      hash = ((hash << 5) - hash) + this.hashString(item);
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * Simple hash function for strings
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }



  /**
   * Get performance metrics
   */
  getMetrics() {
    return this.metrics.getStats();
  }
}
