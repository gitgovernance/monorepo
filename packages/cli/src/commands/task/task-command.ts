import { Command } from 'commander';
import { BaseCommand } from '../../base/base-command';
import type { Records } from '@gitgov/core';
import type { BaseCommandOptions } from '../../interfaces/command';

/**
 * Task Command Options interfaces
 */
export interface TaskNewOptions extends BaseCommandOptions {
  description?: string;
  descriptionFile?: string;
  cleanupFile?: boolean;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  cycleIds?: string;
  tags?: string;
  references?: string;
}

export interface TaskListOptions {
  status?: string;
  priority?: string;
  assignee?: string;
  cycleIds?: string;
  tags?: string;
  limit?: number;
  order?: 'asc' | 'desc';
  stalled?: boolean;
  atRisk?: boolean;
  fromSource?: boolean;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export interface TaskShowOptions {
  fromSource?: boolean;
  health?: boolean;
  history?: boolean;
  format?: 'cursor' | 'kiro' | 'json' | 'text';
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export interface TaskSubmitOptions {
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export interface TaskApproveOptions {
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export interface TaskAssignOptions {
  to: string;
  message?: string;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export interface TaskEditOptions {
  title?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  addTags?: string;
  removeTags?: string;
  addRefs?: string;
  editor?: boolean;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export interface TaskPromoteOptions {
  cycleTitle?: string;
  parentCycle?: string;
  noPrompt?: boolean;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export interface TaskActivateOptions {
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export interface TaskPauseOptions {
  reason?: string;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export interface TaskResumeOptions extends BaseCommandOptions {
  force?: boolean;
}

export interface TaskCancelOptions {
  reason?: string;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export interface TaskRejectOptions {
  reason?: string;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export interface TaskCompleteOptions {
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export interface TaskDeleteOptions {
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

/**
 * TaskCommand - Core Operational Interface
 * 
 * Implements the heart of GitGovernance CLI following the blueprint specification.
 * Delegates all business logic to BacklogAdapter and uses IndexerAdapter for performance.
 */
export class TaskCommand extends BaseCommand<BaseCommandOptions> {

  /**
   * Register the task command with Commander.js
   */
  register(program: Command): void {
    program
      .command('task')
      .description('Task management')
      .argument('[subcommand]', 'Task subcommand')
      .argument('[args...]', 'Task arguments')
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
   * Execute main task command (show help)
   */
  async execute(options: BaseCommandOptions): Promise<void> {
    this.handleError('Task command requires a subcommand. Use: new, list, show, submit, approve, activate, pause, resume, complete, cancel, reject, delete, assign, edit, promote', options);
  }

  /**
   * Routes subcommands to their respective execute methods
   */
  async executeSubCommand(subcommand: string, args: string[], options: any): Promise<void> {
    switch (subcommand) {
      case 'new':
      case 'n':
        if (!args[0]) {
          this.handleError('Task title is required for new command', options);
          return;
        }
        await this.executeNew(args[0], options);
        break;

      case 'list':
      case 'ls':
        await this.executeList(options);
        break;

      case 'show':
      case 's':
        if (!args[0]) {
          this.handleError('Task ID is required for show command', options);
          return;
        }
        await this.executeShow(args[0], options);
        break;

      case 'submit':
        if (!args[0]) {
          this.handleError('Task ID is required for submit command', options);
          return;
        }
        await this.executeSubmit(args[0], options);
        break;

      case 'approve':
        if (!args[0]) {
          this.handleError('Task ID is required for approve command', options);
          return;
        }
        await this.executeApprove(args[0], options);
        break;

      case 'activate':
      case 'a':
        if (!args[0]) {
          this.handleError('Task ID is required for activate command', options);
          return;
        }
        await this.executeActivate(args[0], options);
        break;

      case 'pause':
      case 'p':
        if (!args[0]) {
          this.handleError('Task ID is required for pause command', options);
          return;
        }
        await this.executePause(args[0], options);
        break;

      case 'resume':
      case 'r':
        if (!args[0]) {
          this.handleError('Task ID is required for resume command', options);
          return;
        }
        await this.executeResume(args[0], options);
        break;

      case 'complete':
      case 'c':
        if (!args[0]) {
          this.handleError('Task ID is required for complete command', options);
          return;
        }
        await this.executeComplete(args[0], options);
        break;

      case 'cancel':
        if (!args[0]) {
          this.handleError('Task ID is required for cancel command', options);
          return;
        }
        await this.executeCancel(args[0], options);
        break;

      case 'reject':
        if (!args[0]) {
          this.handleError('Task ID is required for reject command', options);
          return;
        }
        await this.executeReject(args[0], options);
        break;

      case 'delete':
      case 'del':
        if (!args[0]) {
          this.handleError('Task ID is required for delete command', options);
          return;
        }
        await this.executeDelete(args[0], options);
        break;

      case 'assign':
        if (!args[0]) {
          this.handleError('Task ID is required for assign command', options);
          return;
        }
        if (!options.to) {
          this.handleError('--to option is required for assign command', options);
          return;
        }
        await this.executeAssign(args[0], options);
        break;

      case 'edit':
      case 'e':
        if (!args[0]) {
          this.handleError('Task ID is required for edit command', options);
          return;
        }
        await this.executeEdit(args[0], options);
        break;

      case 'promote':
        if (!args[0]) {
          this.handleError('Task ID is required for promote command', options);
          return;
        }
        await this.executePromote(args[0], options);
        break;

      default:
        this.handleError(`Unknown subcommand: ${subcommand}. Use: new, list, show, submit, approve, activate, pause, resume, complete, cancel, reject, delete, assign, edit, promote`, options);
    }
  }

  /**
   * [EARS-1] Creates new Records.TaskRecord with $EDITOR integration
   */
  async executeNew(title: string, options: TaskNewOptions): Promise<void> {
    try {
      // 1. Get dependencies
      const backlogAdapter = await this.dependencyService.getBacklogAdapter();
      const indexerAdapter = await this.dependencyService.getIndexerAdapter();

      // 2. Input validation
      if (!title || title.trim().length === 0) {
        throw new Error("❌ Task title cannot be empty");
      }

      // 3. Validate --cleanup-file usage
      if (options.cleanupFile && !options.descriptionFile) {
        throw new Error("❌ --cleanup-file requires --description-file to be specified");
      }

      // 4. Resolve description from multiple sources (priority: file > inline > editor)
      let description: string;
      let descriptionFilePath: string | undefined;
      if (options.descriptionFile) {
        descriptionFilePath = options.descriptionFile;
        description = await this.readDescriptionFromFile(descriptionFilePath);
      } else if (options.description) {
        description = options.description;
      } else {
        description = await this.openEditor(title);
      }

      // 4. Build payload (BacklogAdapter will use task_factory internally)
      const payload: Partial<Records.TaskRecord> = {
        title: title.trim(),
        description,
        priority: options.priority || 'medium',
        tags: options.tags ? options.tags.split(',').map(t => t.trim()) : [],
        references: options.references ? options.references.split(',').map(r => r.trim()) : []
      };

      // 4. Get current actor dynamically
      const identityAdapter = await this.dependencyService.getIdentityAdapter();
      const currentActor = await identityAdapter.getCurrentActor();
      const actorId = currentActor.id;

      // 5. Delegate to BacklogAdapter (uses task_factory internally)
      const task = await backlogAdapter.createTask(payload, actorId);

      // 6. Handle cycle linking
      if (options.cycleIds) {
        const cycleIds = options.cycleIds.split(',').map(id => id.trim());
        for (const cycleId of cycleIds) {
          await backlogAdapter.addTaskToCycle(cycleId, task.id);
        }
      }

      // 7. Cleanup description file if requested
      if (options.cleanupFile && descriptionFilePath) {
        await this.cleanupDescriptionFile(descriptionFilePath, options);
      }

      // 8. Cache invalidation
      await indexerAdapter.invalidateCache();

      // 9. Output feedback
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          taskId: task.id,
          title: task.title,
          status: task.status,
          cycleIds: options.cycleIds ? options.cycleIds.split(',') : []
        }, null, 2));
      } else {
        console.log(`✅ Task created: ${task.id}`);
        console.log(`📋 Title: ${task.title}`);
        console.log(`📊 Status: ${task.status}`);
        if (options.cycleIds) {
          console.log(`🔗 Linked to cycles: ${options.cycleIds}`);
        }
      }

    } catch (error) {
      this.handleTaskError(error, options);
    }
  }

  /**
   * [EARS-2] Lists TaskRecords with auto-indexation and advanced filtering
   */
  async executeList(options: TaskListOptions): Promise<void> {
    try {
      // 1. Get dependencies
      const backlogAdapter = await this.dependencyService.getBacklogAdapter();
      const indexerAdapter = await this.dependencyService.getIndexerAdapter();

      // Use any[] to allow both TaskRecord and EnrichedTaskRecord
      let tasks: any[] = [];

      // 2. Auto-indexation strategy (unless --from-source)
      if (!options.fromSource) {
        const isUpToDate = await indexerAdapter.isIndexUpToDate();

        if (!isUpToDate) {
          if (!options.quiet) {
            console.log("🔄 Updating cache...");
          }
          await indexerAdapter.generateIndex();
        }

        // 3. Use cache for performance
        const indexData = await indexerAdapter.getIndexData();
        if (indexData) {
          // Use enrichedTasks when available (has lastUpdated for sorting)
          tasks = indexData.enrichedTasks && indexData.enrichedTasks.length > 0
            ? indexData.enrichedTasks
            : indexData.tasks;
        } else {
          // Fallback to direct access
          tasks = await backlogAdapter.getAllTasks();
        }
      } else {
        // 4. Direct access (bypass cache for debugging)
        tasks = await backlogAdapter.getAllTasks();
      }

      // 5. Apply filters
      if (options.status) {
        tasks = tasks.filter(task => task.status === options.status);
      }
      if (options.priority) {
        tasks = tasks.filter(task => task.priority === options.priority);
      }
      if (options.tags) {
        const filterTags = options.tags.split(',').map(t => t.trim());
        tasks = tasks.filter(task =>
          filterTags.some(tag => task.tags?.includes(tag))
        );
      }

      // 6. Sort by lastUpdated (DESC by default, or ASC if --order asc)
      // Fallback to task ID timestamp if lastUpdated not available (e.g., when using --from-source)
      const sortOrder = options.order || 'desc';
      tasks = tasks.sort((a, b) => {
        const aTime = (a as any).lastUpdated || this.extractTimestampFromId(a.id);
        const bTime = (b as any).lastUpdated || this.extractTimestampFromId(b.id);
        return sortOrder === 'asc' ? aTime - bTime : bTime - aTime;
      });

      // 7. Apply limit AFTER sorting
      if (options.limit && options.limit > 0) {
        tasks = tasks.slice(0, options.limit);
      }

      // 8. Output rendering
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          count: tasks.length,
          tasks: tasks
        }, null, 2));
      } else {
        console.log(`📋 Found ${tasks.length} task(s):`);
        tasks.forEach(task => {
          const statusIcon = this.getStatusIcon(task.status);
          console.log(`${statusIcon} [${task.status}] ${task.id} - ${task.title || 'No title'}`);
          if (options.verbose) {
            console.log(`   Priority: ${task.priority}, Tags: ${task.tags?.join(', ') || 'none'}`);
          }
        });
      }

    } catch (error) {
      this.handleTaskError(error, options);
    }
  }

  /**
   * [EARS-3] Shows complete Records.TaskRecord details with health analysis
   */
  async executeShow(taskId: string, options: TaskShowOptions): Promise<void> {
    try {
      // 1. Get dependencies
      const backlogAdapter = await this.dependencyService.getBacklogAdapter();
      const indexerAdapter = await this.dependencyService.getIndexerAdapter();

      let task: Records.TaskRecord | null = null;

      // 2. Auto-indexation strategy (unless --from-source)
      if (!options.fromSource) {
        const isUpToDate = await indexerAdapter.isIndexUpToDate();

        if (!isUpToDate) {
          await indexerAdapter.generateIndex();
        }

        // Use cache first
        const indexData = await indexerAdapter.getIndexData();
        if (indexData) {
          task = indexData.tasks.find((t: Records.TaskRecord) => t.id === taskId) || null;
        }
      }

      // Fallback to direct access
      if (!task) {
        task = await backlogAdapter.getTask(taskId);
      }

      if (!task) {
        throw new Error(`❌ Task not found: ${taskId}`);
      }

      // 3. Output rendering
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          task: task
        }, null, 2));
      } else {
        console.log(`📋 Task: ${task.id}`);
        console.log(`📝 Title: ${task.title || 'No title'}`);
        console.log(`📊 Status: ${task.status}`);
        console.log(`⚡ Priority: ${task.priority}`);
        console.log(`🏷️  Tags: ${task.tags?.join(', ') || 'none'}`);
        console.log(`📄 Description: ${task.description || 'No description'}`);

        if (options.verbose) {
          console.log(`🔗 References: ${task.references?.join(', ') || 'none'}`);
          console.log(`🎯 Cycle IDs: ${task.cycleIds?.join(', ') || 'none'}`);
        }
      }

    } catch (error) {
      this.handleTaskError(error, options);
    }
  }

  /**
   * [EARS-4] Submits task for review with workflow validation
   */
  async executeSubmit(taskId: string, options: TaskSubmitOptions): Promise<void> {
    try {
      // 1. Get dependencies
      const backlogAdapter = await this.dependencyService.getBacklogAdapter();
      const indexerAdapter = await this.dependencyService.getIndexerAdapter();

      // 2. Get current actor (simplified for MVP)
      const identityAdapter = await this.dependencyService.getIdentityAdapter();
      const currentActor = await identityAdapter.getCurrentActor();
      const actorId = currentActor.id;

      // 3. Delegate to BacklogAdapter
      const updatedTask = await backlogAdapter.submitTask(taskId, actorId);

      // 4. Cache invalidation
      await indexerAdapter.invalidateCache();

      // 5. Output feedback
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          taskId: updatedTask.id,
          oldStatus: 'draft',
          newStatus: updatedTask.status
        }, null, 2));
      } else {
        console.log(`✅ Task submitted: ${taskId}`);
        console.log(`📊 Status: draft → ${updatedTask.status}`);
      }

    } catch (error) {
      this.handleTaskError(error, options);
    }
  }

  /**
   * [EARS-5] Approves task with signature validation
   */
  async executeApprove(taskId: string, options: TaskApproveOptions): Promise<void> {
    try {
      // 1. Get dependencies
      const backlogAdapter = await this.dependencyService.getBacklogAdapter();
      const indexerAdapter = await this.dependencyService.getIndexerAdapter();

      // 2. Get current actor (simplified for MVP)
      const identityAdapter = await this.dependencyService.getIdentityAdapter();
      const currentActor = await identityAdapter.getCurrentActor();
      const actorId = currentActor.id;

      // 3. Delegate to BacklogAdapter
      const updatedTask = await backlogAdapter.approveTask(taskId, actorId);

      // 4. Cache invalidation
      await indexerAdapter.invalidateCache();

      // 5. Output feedback
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          taskId: updatedTask.id,
          newStatus: updatedTask.status,
          approvedBy: actorId
        }, null, 2));
      } else {
        console.log(`✅ Task approved: ${taskId}`);
        console.log(`📊 New status: ${updatedTask.status}`);
        console.log(`✍️  Approved by: ${actorId}`);
      }

    } catch (error) {
      this.handleTaskError(error, options);
    }
  }

  /**
   * [EARS-7] Activates task from ready to active with permission validation
   */
  async executeActivate(taskId: string, options: TaskActivateOptions): Promise<void> {
    try {
      // 1. Get dependencies
      const backlogAdapter = await this.dependencyService.getBacklogAdapter();
      const indexerAdapter = await this.dependencyService.getIndexerAdapter();

      // 2. Get current actor
      const identityAdapter = await this.dependencyService.getIdentityAdapter();
      const currentActor = await identityAdapter.getCurrentActor();
      const actorId = currentActor.id;

      // 3. Delegate to BacklogAdapter
      const updatedTask = await backlogAdapter.activateTask(taskId, actorId);

      // 4. Cache invalidation
      await indexerAdapter.invalidateCache();

      // 5. Output feedback
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          taskId: updatedTask.id,
          newStatus: updatedTask.status,
          activatedBy: actorId
        }, null, 2));
      } else {
        console.log(`✅ Task activated: ${taskId}`);
        console.log(`📊 Status: ready → active`);
        console.log(`✍️  Activated by: ${currentActor.displayName} (${actorId})`);
      }

    } catch (error) {
      this.handleTaskError(error, options);
    }
  }

  /**
   * [EARS-18] Pauses an active task manually with optional reason tracking
   */
  async executePause(taskId: string, options: TaskPauseOptions): Promise<void> {
    try {
      // 1. Get dependencies
      const backlogAdapter = await this.dependencyService.getBacklogAdapter();
      const indexerAdapter = await this.dependencyService.getIndexerAdapter();

      // 2. Resolve current actor
      const identityAdapter = await this.dependencyService.getIdentityAdapter();
      const currentActor = await identityAdapter.getCurrentActor();
      const actorId = currentActor.id;

      // 3. Pause task (active → paused)
      const pausedTask = await backlogAdapter.pauseTask(taskId, actorId, options.reason);

      // 4. Cache invalidation to keep listings accurate
      await indexerAdapter.invalidateCache();

      // 5. Output feedback according to flags
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          taskId: pausedTask.id,
          newStatus: pausedTask.status,
          pausedBy: actorId,
          reason: options.reason || 'No reason provided'
        }, null, 2));
      } else {
        console.log(`⏸️  Task paused: ${taskId}`);
        console.log(`📊 Status: active → paused`);
        console.log(`✍️  Paused by: ${currentActor.displayName} (${actorId})`);
        if (options.reason) {
          console.log(`📝 Reason: ${options.reason}`);
        }
      }

    } catch (error) {
      this.handleTaskError(error, options);
    }
  }

  /**
   * [EARS-20] Resumes a paused task with blocking validation and optional force override
   */
  async executeResume(taskId: string, options: TaskResumeOptions): Promise<void> {
    try {
      // 1. Get dependencies
      const backlogAdapter = await this.dependencyService.getBacklogAdapter();
      const indexerAdapter = await this.dependencyService.getIndexerAdapter();

      // 2. Resolve current actor
      const identityAdapter = await this.dependencyService.getIdentityAdapter();
      const currentActor = await identityAdapter.getCurrentActor();
      const actorId = currentActor.id;

      // 3. Resume task (paused → active)
      const resumedTask = await backlogAdapter.resumeTask(taskId, actorId, Boolean(options.force));

      // 4. Cache invalidation to keep listings accurate
      await indexerAdapter.invalidateCache();

      // 5. Output feedback according to flags
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          taskId: resumedTask.id,
          newStatus: resumedTask.status,
          resumedBy: actorId,
          forced: Boolean(options.force)
        }, null, 2));
      } else {
        console.log(`✅ Task resumed: ${taskId}`);
        console.log(`📊 Status: paused → active`);
        const forceSuffix = options.force ? ' [force]' : '';
        console.log(`✍️  Resumed by: ${currentActor.displayName} (${actorId})${forceSuffix}`);
      }

    } catch (error) {
      this.handleTaskError(error, options);
    }
  }

  /**
   * Completes a task transitioning from active to done with signature validation
   */
  async executeComplete(taskId: string, options: TaskCompleteOptions): Promise<void> {
    try {
      // 1. Get dependencies
      const backlogAdapter = await this.dependencyService.getBacklogAdapter();
      const indexerAdapter = await this.dependencyService.getIndexerAdapter();

      // 2. Get current actor
      const identityAdapter = await this.dependencyService.getIdentityAdapter();
      const currentActor = await identityAdapter.getCurrentActor();
      const actorId = currentActor.id;

      // 3. Delegate to BacklogAdapter
      const updatedTask = await backlogAdapter.completeTask(taskId, actorId);

      // 4. Cache invalidation
      await indexerAdapter.invalidateCache();

      // 5. Output feedback
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          taskId: updatedTask.id,
          newStatus: updatedTask.status,
          completedBy: actorId
        }, null, 2));
      } else {
        console.log(`✅ Task completed: ${taskId}`);
        console.log(`📊 Status: active → done`);
        console.log(`✍️  Completed by: ${currentActor.displayName} (${actorId})`);
      }

    } catch (error) {
      this.handleTaskError(error, options);
    }
  }

  /**
 * Cancels a task transitioning from ready/active to discarded with reason
 */
  async executeCancel(taskId: string, options: TaskCancelOptions): Promise<void> {
    try {
      // 1. Get dependencies
      const backlogAdapter = await this.dependencyService.getBacklogAdapter();
      const indexerAdapter = await this.dependencyService.getIndexerAdapter();

      // 2. Get current actor
      const identityAdapter = await this.dependencyService.getIdentityAdapter();
      const currentActor = await identityAdapter.getCurrentActor();
      const actorId = currentActor.id;

      // 3. Delegate to BacklogAdapter
      const updatedTask = await backlogAdapter.discardTask(taskId, actorId, options.reason);

      // 4. Cache invalidation
      await indexerAdapter.invalidateCache();

      // 5. Output feedback
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          taskId: updatedTask.id,
          newStatus: updatedTask.status,
          cancelledBy: actorId,
          reason: options.reason || 'No reason provided'
        }, null, 2));
      } else {
        console.log(`❌ Task cancelled: ${taskId}`);
        console.log(`📊 Status: ${updatedTask.status === 'discarded' ? 'ready/active → discarded' : 'cancelled'}`);
        console.log(`✍️  Cancelled by: ${currentActor.displayName} (${actorId})`);
        if (options.reason) {
          console.log(`📝 Reason: ${options.reason}`);
        }
      }

    } catch (error) {
      this.handleTaskError(error, options);
    }
  }

  /**
   * Rejects a task transitioning from review to discarded with reason
   */
  async executeReject(taskId: string, options: TaskRejectOptions): Promise<void> {
    try {
      // 1. Get dependencies
      const backlogAdapter = await this.dependencyService.getBacklogAdapter();
      const indexerAdapter = await this.dependencyService.getIndexerAdapter();

      // 2. Get current actor
      const identityAdapter = await this.dependencyService.getIdentityAdapter();
      const currentActor = await identityAdapter.getCurrentActor();
      const actorId = currentActor.id;

      // 3. Delegate to BacklogAdapter (same method as cancel, but from review state)
      const updatedTask = await backlogAdapter.discardTask(taskId, actorId, options.reason);

      // 4. Cache invalidation
      await indexerAdapter.invalidateCache();

      // 5. Output feedback
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          taskId: updatedTask.id,
          newStatus: updatedTask.status,
          rejectedBy: actorId,
          reason: options.reason || 'No reason provided'
        }, null, 2));
      } else {
        console.log(`🚫 Task rejected: ${taskId}`);
        console.log(`📊 Status: review → discarded`);
        console.log(`✍️  Rejected by: ${currentActor.displayName} (${actorId})`);
        if (options.reason) {
          console.log(`📝 Reason: ${options.reason}`);
        }
      }

    } catch (error) {
      this.handleTaskError(error, options);
    }
  }

  /**
   * Deletes a draft task completely (no discarded state)
   */
  async executeDelete(taskId: string, options: TaskDeleteOptions): Promise<void> {
    try {
      // 1. Get dependencies
      const backlogAdapter = await this.dependencyService.getBacklogAdapter();
      const indexerAdapter = await this.dependencyService.getIndexerAdapter();

      // 2. Get current actor
      const identityAdapter = await this.dependencyService.getIdentityAdapter();
      const currentActor = await identityAdapter.getCurrentActor();
      const actorId = currentActor.id;

      // 3. Delegate to BacklogAdapter
      await backlogAdapter.deleteTask(taskId, actorId);

      // 4. Cache invalidation
      await indexerAdapter.invalidateCache();

      // 5. Output feedback
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          taskId: taskId,
          deletedBy: actorId,
          message: 'Draft task deleted successfully'
        }, null, 2));
      } else {
        console.log(`🗑️  Task deleted: ${taskId}`);
        console.log(`📊 Status: draft → deleted`);
        console.log(`✍️  Deleted by: ${currentActor.displayName} (${actorId})`);
      }

    } catch (error) {
      this.handleTaskError(error, options);
    }
  }

  /**
   * [EARS-6] Assigns task to actor via FeedbackAdapter
   */
  async executeAssign(taskId: string, options: TaskAssignOptions): Promise<void> {
    try {
      // 1. Get dependencies
      const backlogAdapter = await this.dependencyService.getBacklogAdapter();
      const indexerAdapter = await this.dependencyService.getIndexerAdapter();
      const identityAdapter = await this.dependencyService.getIdentityAdapter();

      // 2. Validate task and actor exist
      const task = await backlogAdapter.getTask(taskId);
      if (!task) {
        throw new Error(`❌ Task not found: ${taskId}`);
      }

      const assigneeActor = await identityAdapter.getActor(options.to);
      if (!assigneeActor) {
        throw new Error(`❌ Actor not found: ${options.to}`);
      }

      // 3. Get current actor
      const currentActor = await identityAdapter.getCurrentActor();

      // 4. Create assignment feedback (using factory pattern)
      const assignmentPayload = {
        entityType: 'task' as const,
        entityId: taskId,
        type: 'assignment' as const,
        status: 'resolved' as const, // Assignment feedback is immediately resolved
        content: options.message || `Assigned to ${assigneeActor.displayName}`,
        assignee: options.to // Usar campo assignee en lugar de metadata
      };

      // 5. Delegate to FeedbackAdapter (uses feedback_factory internally)
      const feedbackAdapter = await this.dependencyService.getFeedbackAdapter();
      const feedbackRecord = await feedbackAdapter.create(assignmentPayload, currentActor.id);

      // 6. Cache invalidation
      await indexerAdapter.invalidateCache();

      // 7. Output feedback
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          taskId: taskId,
          assignedTo: options.to,
          feedbackId: feedbackRecord.id,
          assignedBy: currentActor.id
        }, null, 2));
      } else {
        console.log(`✅ Task assigned: ${taskId}`);
        console.log(`👤 Assigned to: ${assigneeActor.displayName} (${options.to})`);
        console.log(`📝 Assignment feedback: ${feedbackRecord.id}`);
        console.log(`✍️  Assigned by: ${currentActor.displayName}`);
      }

    } catch (error) {
      this.handleTaskError(error, options);
    }
  }

  /**
   * [EARS-7] Edits task fields with immutability validation
   */
  async executeEdit(taskId: string, options: TaskEditOptions): Promise<void> {
    try {
      // 1. Get dependencies
      const backlogAdapter = await this.dependencyService.getBacklogAdapter();
      const indexerAdapter = await this.dependencyService.getIndexerAdapter();
      const identityAdapter = await this.dependencyService.getIdentityAdapter();

      // 2. Get current task
      const currentTask = await backlogAdapter.getTask(taskId);
      if (!currentTask) {
        throw new Error(`❌ Task not found: ${taskId}`);
      }

      // 3. Immutability validation for description
      if (options.description && currentTask.description) {
        // Check if task has execution records (immutability rule)
        // For MVP, we'll allow description edits - in production would check executions
        console.warn("⚠️ Description editing - in production would check execution records for immutability");
      }

      // 4. Build update payload
      const updatePayload: Partial<Records.TaskRecord> = {};

      if (options.title) updatePayload.title = options.title;
      if (options.description) updatePayload.description = options.description;
      if (options.priority) updatePayload.priority = options.priority;

      // Handle tags
      if (options.addTags || options.removeTags) {
        const currentTags = currentTask.tags || [];
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

      // Handle references
      if (options.addRefs) {
        const currentRefs = currentTask.references || [];
        const refsToAdd = options.addRefs.split(',').map(r => r.trim());
        updatePayload.references = [...new Set([...currentRefs, ...refsToAdd])];
      }

      // 5. Get current actor
      const currentActor = await identityAdapter.getCurrentActor();

      // 6. Delegate to BacklogAdapter (uses task_factory internally)
      const updatedTask = await backlogAdapter.updateTask(taskId, updatePayload);

      // 7. Cache invalidation
      await indexerAdapter.invalidateCache();

      // 8. Output feedback
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          taskId: updatedTask.id,
          updatedFields: Object.keys(updatePayload),
          updatedBy: currentActor.id
        }, null, 2));
      } else {
        console.log(`✅ Task updated: ${taskId}`);
        console.log(`📝 Updated fields: ${Object.keys(updatePayload).join(', ')}`);
        console.log(`✍️  Updated by: ${currentActor.displayName}`);
      }

    } catch (error) {
      this.handleTaskError(error, options);
    }
  }

  /**
   * [EARS-8] Temporary shortcut for epic promotion (redirects to future planning command)
   */
  async executePromote(taskId: string, options: TaskPromoteOptions): Promise<void> {
    try {
      // 1. Get task to validate it exists and has epic tag
      const backlogAdapter = await this.dependencyService.getBacklogAdapter();
      const task = await backlogAdapter.getTask(taskId);

      if (!task) {
        throw new Error(`❌ Task not found: ${taskId}`);
      }

      const hasEpicTag = task.tags?.some(tag => tag.startsWith('epic:'));
      if (!hasEpicTag) {
        throw new Error(`❌ Task must have 'epic:' tag to be promoted to cycle.`);
      }

      // 2. MVP: Show helpful message about future planning command
      if (options.json) {
        console.log(JSON.stringify({
          success: false,
          error: "Planning methodology not implemented yet",
          suggestion: "Use 'gitgov planning decompose' when available",
          taskId: taskId,
          taskTitle: task.title,
          isEpic: true
        }, null, 2));
      } else {
        console.log(`🔄 Epic task detected: ${task.title}`);
        console.log(`📋 Task ID: ${taskId}`);
        console.log(`🏷️  Epic tags: ${task.tags?.filter(t => t.startsWith('epic:')).join(', ')}`);
        console.log(``);
        console.log(`⚠️  Epic promotion not implemented in MVP.`);
        console.log(`💡 Future command: 'gitgov planning decompose ${taskId}'`);
        console.log(`💡 Alternative: Manually create cycle and link tasks for now.`);
        console.log(``);
        console.log(`🔗 Related commands:`);
        console.log(`   gitgov cycle new "${task.title}" --description "Epic cycle"`);
        console.log(`   gitgov task edit ${taskId} --add-tags "promoted-to-planning"`);
      }

    } catch (error) {
      this.handleTaskError(error, options);
    }
  }

  // ===== HELPER METHODS =====

  /**
   * Opens $EDITOR for task description (simplified implementation)
   */
  private async openEditor(title: string): Promise<string> {
    // Simplified implementation - would open $EDITOR in real implementation
    return `Description for: ${title}`;
  }

  /**
   * Reads description from a file
   */
  private async readDescriptionFromFile(filePath: string): Promise<string> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      // Resolve path (handle relative paths)
      const resolvedPath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(process.cwd(), filePath);

      // Read file content
      const content = await fs.readFile(resolvedPath, 'utf-8');

      if (!content || content.trim().length === 0) {
        throw new Error(`❌ Description file is empty: ${filePath}`);
      }

      return content.trim();
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('ENOENT')) {
          throw new Error(`❌ Description file not found: ${filePath}`);
        }
        if (error.message.includes('EACCES')) {
          throw new Error(`❌ Permission denied reading file: ${filePath}`);
        }
        throw error;
      }
      throw new Error(`❌ Failed to read description file: ${filePath}`);
    }
  }

  /**
   * Cleans up description file after task creation
   */
  private async cleanupDescriptionFile(filePath: string, options: BaseCommandOptions): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      // Resolve path
      const resolvedPath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(process.cwd(), filePath);

      // Delete the file
      await fs.unlink(resolvedPath);

      if (options.verbose) {
        console.log(`🗑️  Cleaned up description file: ${filePath}`);
      }
    } catch (error) {
      // Non-critical error - task was already created successfully
      if (!options.quiet) {
        console.warn(`⚠️  Could not cleanup description file: ${filePath}`);
        if (options.verbose && error instanceof Error) {
          console.warn(`   ${error.message}`);
        }
      }
    }
  }

  /**
   * Gets status icon for visual output
   */
  private getStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      'draft': '📝',
      'review': '👀',
      'ready': '🟢',
      'active': '⚡',
      'done': '✅',
      'paused': '⏸️',
      'archived': '📦'
    };
    return icons[status] || '❓';
  }

  /**
   * Extracts Unix timestamp (in milliseconds) from a task ID
   * Task IDs follow format: {timestamp}-task-{name}
   * Returns timestamp * 1000 to match lastUpdated field (which is in milliseconds)
   */
  private extractTimestampFromId(id: string): number {
    try {
      const parts = id.split('-');
      const timestamp = parseInt(parts[0] || '0', 10);

      if (isNaN(timestamp) || timestamp <= 0) {
        return 0; // Return 0 for invalid timestamps
      }

      return timestamp * 1000; // Convert to milliseconds
    } catch (error) {
      return 0; // Fallback to 0 on error
    }
  }

  /**
   * Handles errors with user-friendly messages and exit codes specific to task operations
   */
  private handleTaskError(error: unknown, options: BaseCommandOptions): void {
    let message: string;
    let exitCode: number = 1;

    if (error instanceof Error) {
      // Map specific error types to user-friendly messages
      if (error.message.includes('RecordNotFoundError')) {
        message = error.message; // Keep original format for RecordNotFoundError
        exitCode = 1;
      } else if (error.message.includes('Task title cannot be empty')) {
        message = "❌ Task operation failed: ❌ Task title cannot be empty";
        exitCode = 1;
      } else if (error.message.includes('Task not found:')) {
        const taskId = error.message.split('Task not found: ')[1];
        message = `❌ Task operation failed: ❌ Task not found: ${taskId}`;
        exitCode = 1;
      } else if (error.message.includes('Actor not found:')) {
        const actorId = error.message.split('Actor not found: ')[1];
        message = `❌ Task operation failed: ❌ Actor not found: ${actorId}`;
        exitCode = 1;
      } else if (error.message.includes("Task must have 'epic:' tag")) {
        message = "❌ Task operation failed: ❌ Task must have 'epic:' tag to be promoted to cycle.";
        exitCode = 1;
      } else {
        message = `❌ Task operation failed: ${error.message}`;
        exitCode = 1;
      }
    } else {
      message = "❌ Unknown error occurred during task operation.";
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
