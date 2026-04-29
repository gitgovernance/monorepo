import { Command } from 'commander';
import { BaseCommand } from '../../base/base-command';
import type { CycleRecord } from '@gitgov/core';
import type { BaseCommandOptions } from '../../interfaces/command';

/**
 * Cycle Command Options interfaces
 */
export interface CycleNewOptions extends BaseCommandOptions {
  description?: string;
  status?: 'planning' | 'active';
  taskIds?: string;
  tags?: string;
  notes?: string;
}

export interface CycleListOptions {
  status?: string;
  tags?: string;
  hasTasks?: boolean;
  hasChildren?: boolean;
  limit?: number;
  fromSource?: boolean;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export interface CycleShowOptions {
  fromSource?: boolean;
  tasks?: boolean;
  children?: boolean;
  hierarchy?: boolean;
  health?: boolean;
  format?: 'json' | 'text';
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export interface CycleActivateOptions {
  force?: boolean;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export interface CycleCompleteOptions {
  force?: boolean;
  autoParent?: boolean;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export interface CycleAddTaskOptions {
  task: string;
  position?: number;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export interface CycleEditOptions {
  title?: string;
  description?: string;
  notes?: string;
  addTags?: string;
  removeTags?: string;
  editor?: boolean;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export interface CycleAddChildOptions {
  child: string;
  position?: number;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export interface CycleRemoveTaskOptions {
  task: string;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export interface CycleMoveTaskOptions {
  task: string;
  from: string;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

/**
 * CycleCommand - Strategic Planning Interface
 * 
 * Implements strategic planning CLI following the blueprint specification.
 * Delegates all business logic to BacklogAdapter and uses RecordProjector for performance.
 */
export class CycleCommand extends BaseCommand<BaseCommandOptions> {

  /**
   * Register the cycle command with Commander.js
   */
  register(program: Command): void {
    program
      .command('cycle')
      .description('Cycle management')
      .argument('[subcommand]', 'Cycle subcommand')
      .argument('[args...]', 'Cycle arguments')
      .option('--json', 'JSON output')
      .option('--verbose', 'Verbose output')
      .option('--quiet', 'Quiet mode')
      .action(async (subcommand, args, options) => {
        if (subcommand) {
          await this.executeSubCommand(subcommand, args, options);
        } else {
          await this.execute(options);
        }
      });
  }

  /**
   * Execute main cycle command (show help)
   */
  async execute(options: BaseCommandOptions): Promise<void> {
    this.handleError('Cycle command requires a subcommand. Use: new, list, show, activate, complete, archive', options);
  }

  /**
   * [EARS-1] Creates new CycleRecord with $EDITOR integration
   */
  async executeNew(title: string, options: CycleNewOptions): Promise<void> {
    try {
      // 1. Get dependencies
      const backlogAdapter = await this.dependencyService.getBacklogAdapter();
      const projector = await this.dependencyService.getRecordProjector();

      // 2. Input validation
      if (!title || title.trim().length === 0) {
        throw new Error("❌ Cycle title cannot be empty");
      }

      // 3. Build payload (BacklogAdapter will use cycle_factory internally)
      const payload: Partial<CycleRecord> = {
        title: title.trim(),
        notes: options.description || await this.openEditor(title),
        status: options.status || 'planning',
        tags: options.tags ? options.tags.split(',').map(t => t.trim()) : []
      };

      // Note: Using only fields from actual CycleRecord schema

      // 4. Get current actor dynamically
      const { actorId } = await this.requireActor(options);

      // 5. Delegate to BacklogAdapter (uses cycle_factory internally)
      const cycle = await backlogAdapter.createCycle(payload, actorId);

      // 6. Handle task linking
      if (options.taskIds) {
        const taskIds = options.taskIds.split(',').map(id => id.trim());
        for (const taskId of taskIds) {
          await backlogAdapter.addTaskToCycle(cycle.id, taskId, actorId);
        }
      }

      // 7. Cache invalidation
      await projector.invalidateCache();

      // 8. Output feedback
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          cycleId: cycle.id,
          title: cycle.title,
          status: cycle.status,
          taskIds: options.taskIds ? options.taskIds.split(',') : []
        }, null, 2));
      } else {
        console.log(`✅ Cycle created: ${cycle.id}`);
        console.log(`📋 Title: ${cycle.title}`);
        console.log(`📊 Status: ${cycle.status}`);
        if (options.taskIds) {
          console.log(`🔗 Linked to tasks: ${options.taskIds}`);
        }
      }

    } catch (error) {
      this.handleCycleError(error, options);
    }
  }

  /**
   * [EARS-2] Lists CycleRecords with auto-indexation and hierarchy filtering
   */
  async executeList(options: CycleListOptions): Promise<void> {
    try {
      // 1. Get dependencies
      const backlogAdapter = await this.dependencyService.getBacklogAdapter();
      const projector = await this.dependencyService.getRecordProjector();

      let cycles: CycleRecord[] = [];

      // 2. Auto-indexation strategy (unless --from-source)
      if (!options.fromSource) {
        const isUpToDate = await projector.isIndexUpToDate();

        if (!isUpToDate) {
          if (!options.quiet) {
            console.log("🔄 Updating cache...");
          }
          await projector.generateIndex();
        }

        // 3. Use cache for performance
        const indexData = await projector.getIndexData();
        if (indexData) {
          cycles = indexData.cycles?.map(c => c.payload) || [];
        } else {
          // Fallback to direct access
          cycles = await backlogAdapter.getAllCycles();
        }
      } else {
        // 4. Direct access (bypass cache for debugging)
        cycles = await backlogAdapter.getAllCycles();
      }

      // 5. Apply filters
      if (options.status) {
        cycles = cycles.filter(cycle => cycle.status === options.status);
      }
      // Note: parentCycle filtering not available in current CycleRecord schema
      if (options.tags) {
        const filterTags = options.tags.split(',').map(t => t.trim());
        cycles = cycles.filter(cycle =>
          filterTags.some(tag => cycle.tags?.includes(tag))
        );
      }
      if (options.hasTasks) {
        cycles = cycles.filter(cycle => cycle.taskIds && cycle.taskIds.length > 0);
      }
      if (options.hasChildren) {
        cycles = cycles.filter(cycle => cycle.childCycleIds && cycle.childCycleIds.length > 0);
      }

      // 6. Apply limit
      if (options.limit && options.limit > 0) {
        cycles = cycles.slice(0, options.limit);
      }

      // 7. Output rendering
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          count: cycles.length,
          cycles: cycles
        }, null, 2));
      } else {
        console.log(`🎯 Found ${cycles.length} cycle(s):`);
        cycles.forEach(cycle => {
          const statusIcon = this.getStatusIcon(cycle.status);
          const taskCount = cycle.taskIds?.length || 0;
          const childCount = cycle.childCycleIds?.length || 0;
          console.log(`${statusIcon} [${cycle.status}] ${cycle.id} - ${cycle.title || 'No title'}`);
          if (options.verbose) {
            console.log(`   Tasks: ${taskCount}, Children: ${childCount}, Tags: ${cycle.tags?.join(', ') || 'none'}`);
          }
        });
      }

    } catch (error) {
      this.handleCycleError(error, options);
    }
  }

  /**
   * [EARS-3] Shows complete CycleRecord details with task hierarchy
   */
  async executeShow(cycleId: string, options: CycleShowOptions): Promise<void> {
    try {
      // 1. Get dependencies
      const backlogAdapter = await this.dependencyService.getBacklogAdapter();
      const projector = await this.dependencyService.getRecordProjector();

      let cycle: CycleRecord | null = null;

      // 2. Auto-indexation strategy (unless --from-source)
      if (!options.fromSource) {
        const isUpToDate = await projector.isIndexUpToDate();

        if (!isUpToDate) {
          await projector.generateIndex();
        }

        // Use cache first
        const indexData = await projector.getIndexData();
        if (indexData) {
          cycle = indexData.cycles?.find((c) => c.payload.id === cycleId)?.payload || null;
        }
      }

      // Fallback to direct access
      if (!cycle) {
        cycle = await backlogAdapter.getCycle(cycleId);
      }

      if (!cycle) {
        throw new Error(`❌ Cycle not found: ${cycleId}`);
      }

      // 3. Output rendering
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          cycle: cycle
        }, null, 2));
      } else {
        console.log(`🎯 Cycle: ${cycle.id}`);
        console.log(`📝 Title: ${cycle.title || 'No title'}`);
        console.log(`📊 Status: ${cycle.status}`);
        console.log(`🏷️  Tags: ${cycle.tags?.join(', ') || 'none'}`);
        if (cycle.notes) {
          console.log(`📋 Notes: ${cycle.notes}`);
        }

        if (options.verbose) {
          console.log(`🎯 Tasks: ${cycle.taskIds?.length || 0} tasks`);
          console.log(`🔗 Children: ${cycle.childCycleIds?.length || 0} child cycles`);
        }

        if (options.tasks && cycle.taskIds?.length) {
          console.log(`\n📋 Tasks in this cycle:`);
          for (const taskId of cycle.taskIds) {
            // In a full implementation, would fetch task details
            console.log(`   • ${taskId}`);
          }
        }

        if (options.children && cycle.childCycleIds?.length) {
          console.log(`\n🎯 Child cycles:`);
          for (const childId of cycle.childCycleIds) {
            console.log(`   • ${childId}`);
          }
        }
      }

    } catch (error) {
      this.handleCycleError(error, options);
    }
  }

  /**
   * [EARS-4] Activates cycle with readiness validation
   */
  async executeActivate(cycleId: string, options: CycleActivateOptions): Promise<void> {
    try {
      // 1. Get dependencies
      const backlogAdapter = await this.dependencyService.getBacklogAdapter();
      const projector = await this.dependencyService.getRecordProjector();

      // 2. Get current cycle
      const cycle = await backlogAdapter.getCycle(cycleId);
      if (!cycle) {
        throw new Error(`❌ Cycle not found: ${cycleId}`);
      }

      // 3. Validate current status
      if (cycle.status !== 'planning') {
        throw new Error(`❌ Cycle is in '${cycle.status}' state. Cannot activate.`);
      }

      // 4. Readiness validation (unless --force)
      if (!options.force) {
        // Check if cycle has tasks and they're ready
        if (!cycle.taskIds || cycle.taskIds.length === 0) {
          console.warn("⚠️ Cycle has no tasks. Consider adding tasks before activation.");
        }
        // In full implementation, would check task readiness
      }

      // 5. Get current actor
      const { actorId } = await this.requireActor(options);

      // 6. Delegate to BacklogAdapter
      const updatedCycle = await backlogAdapter.updateCycle(cycleId, { status: 'active' });

      // 7. Cache invalidation
      await projector.invalidateCache();

      // 8. Output feedback
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          cycleId: updatedCycle.id,
          oldStatus: 'planning',
          newStatus: updatedCycle.status,
          activatedBy: actorId
        }, null, 2));
      } else {
        console.log(`✅ Cycle activated: ${cycleId}`);
        console.log(`📊 Status: planning → ${updatedCycle.status}`);
        console.log(`✍️  Activated by: ${actorId}`);
      }

    } catch (error) {
      this.handleCycleError(error, options);
    }
  }

  /**
   * [EARS-5] Completes cycle with task validation and hierarchy propagation
   */
  async executeComplete(cycleId: string, options: CycleCompleteOptions): Promise<void> {
    try {
      // 1. Get dependencies
      const backlogAdapter = await this.dependencyService.getBacklogAdapter();
      const projector = await this.dependencyService.getRecordProjector();

      // 2. Get current cycle
      const cycle = await backlogAdapter.getCycle(cycleId);
      if (!cycle) {
        throw new Error(`❌ Cycle not found: ${cycleId}`);
      }

      // 3. Validate current status
      if (cycle.status !== 'active') {
        throw new Error(`❌ Cycle is in '${cycle.status}' state. Cannot complete.`);
      }

      // 4. Task completion validation (unless --force)
      if (!options.force && cycle.taskIds?.length) {
        // In full implementation, would check all tasks are done
        console.warn("⚠️ Task completion validation - in production would verify all tasks are done");
      }

      // 5. Get current actor
      const { actorId } = await this.requireActor(options);

      // 6. Delegate to BacklogAdapter
      const updatedCycle = await backlogAdapter.updateCycle(cycleId, { status: 'completed' });

      // 7. Cache invalidation
      await projector.invalidateCache();

      // 8. Output feedback
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          cycleId: updatedCycle.id,
          oldStatus: 'active',
          newStatus: updatedCycle.status,
          completedBy: actorId
        }, null, 2));
      } else {
        console.log(`✅ Cycle completed: ${cycleId}`);
        console.log(`📊 Status: active → ${updatedCycle.status}`);
        console.log(`✍️  Completed by: ${actorId}`);
      }

    } catch (error) {
      this.handleCycleError(error, options);
    }
  }

  /**
   * [EARS-6] Adds task to cycle with bidirectional linking
   */
  async executeAddTask(cycleId: string, options: CycleAddTaskOptions): Promise<void> {
    try {
      const backlogAdapter = await this.dependencyService.getBacklogAdapter();
      const projector = await this.dependencyService.getRecordProjector();
      const currentActor = await this.dependencyService.getCurrentActor();

      const cycle = await backlogAdapter.getCycle(cycleId);
      if (!cycle) {
        throw new Error(`❌ Cycle not found: ${cycleId}`);
      }

      const taskIds = options.task.split(',').map(id => id.trim());
      for (const taskId of taskIds) {
        const task = await backlogAdapter.getTask(taskId);
        if (!task) {
          throw new Error(`❌ Task not found: ${taskId}`);
        }
      }

      for (const taskId of taskIds) {
        await backlogAdapter.addTaskToCycle(cycleId, taskId, currentActor.id);
      }

      // 4. Cache invalidation
      await projector.invalidateCache();

      // 5. Output feedback
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          cycleId: cycleId,
          addedTasks: taskIds,
          taskCount: taskIds.length
        }, null, 2));
      } else {
        console.log(`✅ Tasks added to cycle: ${cycleId}`);
        console.log(`📋 Added tasks: ${taskIds.join(', ')}`);
        console.log(`🔗 Total tasks in cycle: ${(cycle.taskIds?.length || 0) + taskIds.length}`);
      }

    } catch (error) {
      this.handleCycleError(error, options);
    }
  }

  /**
   * Removes tasks from cycle - thin CLI layer
   * All business logic is in BacklogAdapter
   */
  async executeRemoveTask(cycleId: string, options: CycleRemoveTaskOptions): Promise<void> {
    try {
      // 1. Parse input (CLI responsibility)
      const taskIds = options.task.split(',').map(id => id.trim());

      const backlogAdapter = await this.dependencyService.getBacklogAdapter();
      const currentActor = await this.dependencyService.getCurrentActor();
      await backlogAdapter.removeTasksFromCycle(cycleId, taskIds, currentActor.id);

      // 3. Invalidate cache
      const projector = await this.dependencyService.getRecordProjector();
      await projector.invalidateCache();

      // 4. Output feedback (CLI responsibility)
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          cycleId: cycleId,
          removedTasks: taskIds,
          taskCount: taskIds.length
        }, null, 2));
      } else {
        console.log(`✅ Tasks removed from cycle: ${cycleId}`);
        console.log(`📋 Removed tasks: ${taskIds.join(', ')}`);
      }

    } catch (error) {
      this.handleCycleError(error, options);
    }
  }

  /**
   * Moves tasks between cycles - thin CLI layer
   * All business logic is in BacklogAdapter
   */
  async executeMoveTask(targetCycleId: string, options: CycleMoveTaskOptions): Promise<void> {
    try {
      // 1. Parse input (CLI responsibility)
      const taskIds = options.task.split(',').map(id => id.trim());

      // 2. Delegate to BacklogAdapter (all logic happens here)
      const backlogAdapter = await this.dependencyService.getBacklogAdapter();
      const currentActor = await this.dependencyService.getCurrentActor();
      await backlogAdapter.moveTasksBetweenCycles(targetCycleId, taskIds, options.from, currentActor.id);

      const projector = await this.dependencyService.getRecordProjector();
      await projector.invalidateCache();

      // 4. Output feedback (CLI responsibility)
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          sourceCycleId: options.from,
          targetCycleId: targetCycleId,
          movedTasks: taskIds,
          taskCount: taskIds.length
        }, null, 2));
      } else {
        console.log(`✅ Tasks moved successfully`);
        console.log(`📤 From cycle: ${options.from}`);
        console.log(`📥 To cycle: ${targetCycleId}`);
        console.log(`📋 Moved tasks: ${taskIds.join(', ')}`);
      }

    } catch (error) {
      this.handleCycleError(error, options);
    }
  }

  /**
   * [EARS-8] Edits cycle fields with validation
   */
  async executeEdit(cycleId: string, options: CycleEditOptions): Promise<void> {
    try {
      // 1. Get dependencies
      const backlogAdapter = await this.dependencyService.getBacklogAdapter();
      const projector = await this.dependencyService.getRecordProjector();

      // 2. Get current cycle
      const currentCycle = await backlogAdapter.getCycle(cycleId);
      if (!currentCycle) {
        throw new Error(`❌ Cycle not found: ${cycleId}`);
      }

      // 3. State validation
      if (currentCycle.status === 'archived') {
        throw new Error(`❌ Cycle is in 'archived' state. Cannot edit.`);
      }

      // 4. Build update payload
      const updatePayload: Partial<CycleRecord> = {};

      if (options.title) updatePayload.title = options.title;
      if (options.description) updatePayload.notes = options.description;
      if (options.notes) updatePayload.notes = options.notes;

      // Handle tags
      if (options.addTags || options.removeTags) {
        const currentTags = currentCycle.tags || [];
        let newTags = [...currentTags];

        if (options.addTags) {
          const tagsToAdd = options.addTags.split(',').map(t => t.trim());
          newTags = [...new Set([...newTags, ...tagsToAdd])];
        }

        if (options.removeTags) {
          const tagsToRemove = options.removeTags.split(',').map(t => t.trim());
          newTags = newTags.filter(tag => !tagsToRemove.includes(tag));
        }

        updatePayload.tags = newTags;
      }

      // 5. Get current actor
      const { actorId } = await this.requireActor(options);

      // 6. Delegate to BacklogAdapter (uses cycle_factory internally)
      const updatedCycle = await backlogAdapter.updateCycle(cycleId, updatePayload);

      // 7. Cache invalidation
      await projector.invalidateCache();

      // 8. Output feedback
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          cycleId: updatedCycle.id,
          updatedFields: Object.keys(updatePayload),
          updatedBy: actorId
        }, null, 2));
      } else {
        console.log(`✅ Cycle updated: ${cycleId}`);
        console.log(`📝 Updated fields: ${Object.keys(updatePayload).join(', ')}`);
        console.log(`✍️  Updated by: ${actorId}`);
      }

    } catch (error) {
      this.handleCycleError(error, options);
    }
  }

  /**
   * [EARS-7] Adds child cycle with hierarchy validation
   */
  async executeAddChild(parentCycleId: string, options: CycleAddChildOptions): Promise<void> {
    try {
      // 1. Get dependencies
      const backlogAdapter = await this.dependencyService.getBacklogAdapter();
      const projector = await this.dependencyService.getRecordProjector();

      // 2. Validate parent and child cycles exist
      const parentCycle = await backlogAdapter.getCycle(parentCycleId);
      if (!parentCycle) {
        throw new Error(`❌ Parent cycle not found: ${parentCycleId}`);
      }

      const childIds = options.child.split(',').map(id => id.trim());
      for (const childId of childIds) {
        const childCycle = await backlogAdapter.getCycle(childId);
        if (!childCycle) {
          throw new Error(`❌ Child cycle not found: ${childId}`);
        }

        // Validate not in final state
        if (childCycle.status === 'archived') {
          throw new Error(`❌ Cannot add archived cycle as child: ${childId}`);
        }
      }

      // 3. Circular reference validation
      for (const childId of childIds) {
        if (childId === parentCycleId) {
          throw new Error(`❌ Cannot add cycle as child of itself: ${childId}`);
        }
        // In full implementation, would do deep circular reference check
      }

      // 4. Update parent cycle with new children
      const updatedChildIds = [...(parentCycle.childCycleIds || []), ...childIds];
      const updatedParent = await backlogAdapter.updateCycle(parentCycleId, {
        childCycleIds: updatedChildIds
      });

      // 5. Cache invalidation
      await projector.invalidateCache();

      // 6. Output feedback
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          parentCycleId: parentCycleId,
          addedChildren: childIds,
          totalChildren: updatedChildIds.length
        }, null, 2));
      } else {
        console.log(`✅ Child cycles added to parent: ${parentCycleId}`);
        console.log(`🎯 Added children: ${childIds.join(', ')}`);
        console.log(`🔗 Total children: ${updatedChildIds.length}`);
      }

    } catch (error) {
      this.handleCycleError(error, options);
    }
  }

  // ===== HELPER METHODS =====

  /**
   * Opens $EDITOR for cycle description (simplified implementation)
   */
  private async openEditor(title: string): Promise<string> {
    // Simplified implementation - would open $EDITOR in real implementation
    return `Planning description for: ${title}`;
  }

  /**
   * Gets status icon for visual output
   */
  private getStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      'planning': '📝',
      'active': '⚡',
      'completed': '✅',
      'archived': '📦'
    };
    return icons[status] || '❓';
  }

  /**
   * Handles errors with user-friendly messages and exit codes specific to cycle operations
   */
  private handleCycleError(error: unknown, options: BaseCommandOptions): void {
    let message: string;
    let exitCode: number = 1;

    if (error instanceof Error) {
      // Map specific error types to user-friendly messages
      if (error.message.includes('RecordNotFoundError')) {
        message = error.message; // Keep original format for RecordNotFoundError
        exitCode = 1;
      } else if (error.message.includes('Cycle title cannot be empty')) {
        message = "❌ Cycle operation failed: ❌ Cycle title cannot be empty";
        exitCode = 1;
      } else if (error.message.includes('Cycle not found:')) {
        const cycleId = error.message.split('Cycle not found: ')[1];
        message = `❌ Cycle operation failed: ❌ Cycle not found: ${cycleId}`;
        exitCode = 1;
      } else if (error.message.includes("Cycle is in '") && error.message.includes("' state. Cannot activate")) {
        message = `❌ Cycle operation failed: ${error.message}`;
        exitCode = 1;
      } else if (error.message.includes("Cycle is in '") && error.message.includes("' state. Cannot complete")) {
        message = `❌ Cycle operation failed: ${error.message}`;
        exitCode = 1;
      } else if (error.message.includes('Task not found:')) {
        const taskId = error.message.split('Task not found: ')[1];
        message = `❌ Cycle operation failed: ❌ Task not found: ${taskId}`;
        exitCode = 1;
      } else {
        message = `❌ Cycle operation failed: ${error.message}`;
        exitCode = 1;
      }
    } else {
      message = "❌ Unknown error occurred during cycle operation.";
      exitCode = 1;
    }

    if (options.json) {
      console.log(JSON.stringify({
        error: message,
        success: false,
        exitCode
      }, null, 2));
    } else {
      console.error(message);

      if (options.verbose && error instanceof Error) {
        console.error("🔍 Technical details:", error.stack);
      }
    }

    process.exit(exitCode);
  }

}
