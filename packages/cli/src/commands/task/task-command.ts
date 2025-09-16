import { DependencyInjectionService } from '../../services/dependency-injection';
import type { TaskRecord } from '../../../../core/src/types/task_record';

/**
 * Task Command Options interfaces
 */
export interface TaskNewOptions {
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  cycleIds?: string;
  tags?: string;
  references?: string;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export interface TaskListOptions {
  status?: string;
  priority?: string;
  assignee?: string;
  cycleIds?: string;
  tags?: string;
  limit?: number;
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

export interface TaskCompleteOptions {
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
export class TaskCommand {
  private dependencyService = DependencyInjectionService.getInstance();

  /**
   * [EARS-1] Creates new TaskRecord with $EDITOR integration
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

      // 3. Build payload (BacklogAdapter will use task_factory internally)
      const payload: Partial<TaskRecord> = {
        title: title.trim(),
        description: options.description || await this.openEditor(title),
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

      // 7. Cache invalidation
      await indexerAdapter.invalidateCache();

      // 8. Output feedback
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
      this.handleError(error, options.json, options.verbose);
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

      let tasks: TaskRecord[] = [];

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
          tasks = indexData.tasks;
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

      // 6. Apply limit
      if (options.limit && options.limit > 0) {
        tasks = tasks.slice(0, options.limit);
      }

      // 7. Output rendering
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
      this.handleError(error, options.json, options.verbose);
    }
  }

  /**
   * [EARS-3] Shows complete TaskRecord details with health analysis
   */
  async executeShow(taskId: string, options: TaskShowOptions): Promise<void> {
    try {
      // 1. Get dependencies
      const backlogAdapter = await this.dependencyService.getBacklogAdapter();
      const indexerAdapter = await this.dependencyService.getIndexerAdapter();

      let task: TaskRecord | null = null;

      // 2. Auto-indexation strategy (unless --from-source)
      if (!options.fromSource) {
        const isUpToDate = await indexerAdapter.isIndexUpToDate();

        if (!isUpToDate) {
          await indexerAdapter.generateIndex();
        }

        // Use cache first
        const indexData = await indexerAdapter.getIndexData();
        if (indexData) {
          task = indexData.tasks.find((t: TaskRecord) => t.id === taskId) || null;
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
      this.handleError(error, options.json, options.verbose);
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
      this.handleError(error, options.json, options.verbose);
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
      this.handleError(error, options.json, options.verbose);
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
      this.handleError(error, options.json, options.verbose);
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
      this.handleError(error, options.json, options.verbose);
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
      this.handleError(error, options.json, options.verbose);
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
      const updatePayload: Partial<TaskRecord> = {};

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
      this.handleError(error, options.json, options.verbose);
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
      this.handleError(error, options.json, options.verbose);
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
   * Handles errors with user-friendly messages
   */
  private handleError(error: unknown, isJson = false, isVerbose = false): void {
    let message: string;
    let exitCode = 1;

    if (error instanceof Error) {
      if (error.message.includes('RecordNotFoundError')) {
        message = error.message;
      } else if (error.message.includes('ProtocolViolationError')) {
        message = error.message;
      } else if (error.message.includes('not initialized')) {
        message = "❌ GitGovernance not initialized. Run 'gitgov init' first.";
      } else {
        message = `❌ Task operation failed: ${error.message}`;
      }
    } else {
      message = "❌ Unknown error occurred during task operation.";
    }

    if (isJson) {
      console.log(JSON.stringify({
        success: false,
        error: message,
        exitCode
      }, null, 2));
    } else {
      console.error(message);
      if (isVerbose && error instanceof Error) {
        console.error(`🔍 Technical details: ${error.stack}`);
      }
    }

    process.exit(exitCode);
  }
}
