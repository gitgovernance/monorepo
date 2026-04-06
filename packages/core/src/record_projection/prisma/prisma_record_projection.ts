import type { IRecordProjection, IndexData, ProjectionContext, EnrichedTaskRecord } from '../record_projection.types';
import type {
  JsonValue,
  ProjectionClient,
  PrismaRecordProjectionOptions,
  GitgovTaskRow,
  GitgovCycleRow,
  GitgovActorRow,
  GitgovFeedbackRow,
  GitgovActivityRow,
  GitgovExecutionRow,
  GitgovAgentRow,
} from './prisma_record_projection.types';

export class PrismaRecordProjection implements IRecordProjection {
  private readonly client: ProjectionClient;
  private readonly tenantFields: Record<string, string>;

  constructor(options: PrismaRecordProjectionOptions) {
    this.client = options.client;
    this.tenantFields = options.tenantFields ?? {};
  }

  private buildWhere(): Record<string, string> {
    return { ...this.tenantFields };
  }

  private buildMetaWhere(): Record<string, unknown> {
    const keys = Object.keys(this.tenantFields);
    if (keys.length > 0) {
      return { [keys.join('_')]: { ...this.tenantFields } };
    }
    return {};
  }

  async persist(data: IndexData, context: ProjectionContext): Promise<void> {
    const where = this.buildWhere();
    const tenantFields = this.tenantFields;

    const taskRows = data.enrichedTasks.map((t) => this.buildTaskRow(t, data));
    const cycleRows = data.cycles.map((c) => ({
      ...tenantFields,
      recordId: c.payload.id,
      title: c.payload.title,
      status: c.payload.status,
      taskIds: c.payload.taskIds ?? [],
      childCycleIds: c.payload.childCycleIds ?? [],
      tags: c.payload.tags ?? [],
      notes: c.payload.notes ?? null,
      metadata: c.payload.metadata ? toJson(c.payload.metadata) : null,
      header: toJson(c.header),
    }));
    const actorRows = data.actors.map((a) => ({
      ...tenantFields,
      recordId: a.payload.id,
      type: a.payload.type,
      displayName: a.payload.displayName,
      publicKey: a.payload.publicKey,
      roles: [...a.payload.roles],
      status: a.payload.status ?? null,
      supersededBy: a.payload.supersededBy ?? null,
      metadata: a.payload.metadata ? toJson(a.payload.metadata) : null,
      header: toJson(a.header),
    }));
    const feedbackRows = data.feedback.map((f) => ({
      ...tenantFields,
      recordId: f.payload.id,
      entityType: f.payload.entityType,
      entityId: f.payload.entityId,
      type: f.payload.type,
      status: f.payload.status,
      content: f.payload.content,
      assignee: f.payload.assignee ?? null,
      resolvesFeedbackId: f.payload.resolvesFeedbackId ?? null,
      metadata: f.payload.metadata ? toJson(f.payload.metadata) : null,
      header: toJson(f.header),
    }));
    const activityRows = data.activityHistory.map((ev) => ({
      ...tenantFields,
      timestamp: ev.timestamp,
      eventType: ev.type,
      entityId: ev.entityId,
      entityTitle: ev.entityTitle,
      actorId: ev.actorId ?? null,
      metadata: ev.metadata ? toJson(ev.metadata) : null,
    }));
    const executionRows = data.executions.map((e) => ({
      ...tenantFields,
      recordId: e.payload.id,
      taskId: e.payload.taskId,
      type: e.payload.type,
      title: e.payload.title,
      result: e.payload.result,
      notes: e.payload.notes ?? null,
      metadata: e.payload.metadata ? toJson(e.payload.metadata) : null,
      references: e.payload.references ?? [],
      header: toJson(e.header),
    }));
    const agentRows = data.agents.map((a) => ({
      ...tenantFields,
      recordId: a.payload.id,
      engine: toJson(a.payload.engine),
      status: a.payload.status ?? null,
      triggers: a.payload.triggers ? toJson(a.payload.triggers) : null,
      metadata: a.payload.metadata ? toJson(a.payload.metadata) : null,
      knowledgeDependencies: a.payload.knowledge_dependencies ? toJson(a.payload.knowledge_dependencies) : null,
      promptEngineRequirements: a.payload.prompt_engine_requirements ? toJson(a.payload.prompt_engine_requirements) : null,
      header: toJson(a.header),
    }));

    const ops: PromiseLike<unknown>[] = [
      this.client.gitgovTask.deleteMany({ where }),
      this.client.gitgovCycle.deleteMany({ where }),
      this.client.gitgovActor.deleteMany({ where }),
      this.client.gitgovFeedback.deleteMany({ where }),
      this.client.gitgovActivity.deleteMany({ where }),
      this.client.gitgovExecution.deleteMany({ where }),
      this.client.gitgovAgent.deleteMany({ where }),
      this.client.gitgovWorkflow.deleteMany({ where }),
    ];

    const metaData = {
      ...tenantFields,
      lastCommitHash: context.lastCommitHash ?? null,
      generatedAt: data.metadata.generatedAt,
      integrityStatus: data.metadata.integrityStatus,
      recordCountsJson: toJson(data.metadata.recordCounts),
      generationTime: data.metadata.generationTime,
      derivedStatesJson: toJson(data.derivedStates),
      metricsJson: toJson(data.metrics),
    };

    const metaWhere = this.buildMetaWhere();
    // In single-tenant (no tenantFields), meta was already deleted above.
    // Use upsert with empty where — findUnique returns null after delete, so it creates.
    // In multi-tenant, upsert with composite key as before.
    ops.push(this.client.gitgovMeta.upsert({ where: metaWhere, create: metaData, update: metaData }));

    if (taskRows.length > 0) {
      ops.push(this.client.gitgovTask.createMany({ data: taskRows }));
    }
    if (cycleRows.length > 0) {
      ops.push(this.client.gitgovCycle.createMany({ data: cycleRows }));
    }
    if (actorRows.length > 0) {
      ops.push(this.client.gitgovActor.createMany({ data: actorRows }));
    }
    if (feedbackRows.length > 0) {
      ops.push(this.client.gitgovFeedback.createMany({ data: feedbackRows }));
    }
    if (activityRows.length > 0) {
      ops.push(this.client.gitgovActivity.createMany({ data: activityRows }));
    }
    if (executionRows.length > 0) {
      ops.push(this.client.gitgovExecution.createMany({ data: executionRows }));
    }
    if (agentRows.length > 0) {
      ops.push(this.client.gitgovAgent.createMany({ data: agentRows }));
    }

    await this.client.$transaction(ops);
  }

  async read(_context: ProjectionContext): Promise<IndexData | null> {
    const metaWhere = this.buildMetaWhere();
    const meta = Object.keys(metaWhere).length > 0
      ? await this.client.gitgovMeta.findUnique({ where: metaWhere })
      : (this.client.gitgovMeta.findFirst ? await this.client.gitgovMeta.findFirst({}) : null);
    if (!meta || !('generatedAt' in meta)) return null;

    const whereMany = this.buildWhere();
    const [taskRows, cycleRows, actorRows, feedbackRows, activityRows, executionRows, agentRows, /* workflowRows */] = await Promise.all([
      this.client.gitgovTask.findMany({ where: whereMany }),
      this.client.gitgovCycle.findMany({ where: whereMany }),
      this.client.gitgovActor.findMany({ where: whereMany }),
      this.client.gitgovFeedback.findMany({ where: whereMany }),
      this.client.gitgovActivity.findMany({ where: whereMany }),
      this.client.gitgovExecution.findMany({ where: whereMany }),
      this.client.gitgovAgent.findMany({ where: whereMany }),
      this.client.gitgovWorkflow.findMany({ where: whereMany }),
    ]);

    return this.reconstructIndexData(meta, taskRows, cycleRows, actorRows, feedbackRows, activityRows, executionRows, agentRows);
  }

  async exists(_context: ProjectionContext): Promise<boolean> {
    const metaWhere = this.buildMetaWhere();
    const row = Object.keys(metaWhere).length > 0
      ? await this.client.gitgovMeta.findUnique({ where: metaWhere, select: { id: true } })
      : (this.client.gitgovMeta.findFirst ? await this.client.gitgovMeta.findFirst({ select: { id: true } }) : null);
    return row !== null;
  }

  async clear(_context: ProjectionContext): Promise<void> {
    const where = this.buildWhere();
    await this.client.$transaction([
      this.client.gitgovTask.deleteMany({ where }),
      this.client.gitgovCycle.deleteMany({ where }),
      this.client.gitgovActor.deleteMany({ where }),
      this.client.gitgovFeedback.deleteMany({ where }),
      this.client.gitgovActivity.deleteMany({ where }),
      this.client.gitgovExecution.deleteMany({ where }),
      this.client.gitgovAgent.deleteMany({ where }),
      this.client.gitgovWorkflow.deleteMany({ where }),
      this.client.gitgovMeta.deleteMany({ where }),
    ]);
  }

  private buildTaskRow(
    enriched: EnrichedTaskRecord,
    data: IndexData,
  ): Omit<GitgovTaskRow, 'id' | 'createdAt' | 'updatedAt'> {
    const gitgovTask = data.tasks.find((t) => t.payload.id === enriched.id);
    if (!gitgovTask) throw new Error(`Invariant: enrichedTask ${enriched.id} has no matching task record`);
    const header = gitgovTask.header;

    return {
      ...this.tenantFields,
      recordId: enriched.id,
      title: enriched.title,
      status: enriched.status,
      priority: enriched.priority,
      description: enriched.description,
      tags: enriched.tags ?? [],
      references: enriched.references ?? [],
      cycleIds: enriched.cycleIds ?? [],
      notes: enriched.notes ?? null,
      metadata: enriched.metadata ? toJson(enriched.metadata) : null,
      isStalled: enriched.derivedState.isStalled,
      isAtRisk: enriched.derivedState.isAtRisk,
      needsClarification: enriched.derivedState.needsClarification,
      isBlockedByDependency: enriched.derivedState.isBlockedByDependency,
      healthScore: enriched.derivedState.healthScore,
      timeInCurrentStage: enriched.derivedState.timeInCurrentStage,
      executionCount: enriched.metrics.executionCount,
      blockingFeedbackCount: enriched.metrics.blockingFeedbackCount,
      openQuestionCount: enriched.metrics.openQuestionCount,
      timeToResolution: enriched.metrics.timeToResolution ?? null,
      isReleased: enriched.release.isReleased,
      lastReleaseVersion: enriched.release.lastReleaseVersion ?? null,
      lastUpdated: enriched.lastUpdated,
      lastActivityType: enriched.lastActivityType,
      recentActivity: enriched.recentActivity ?? null,
      relationships: toJson(enriched.relationships),
      header: toJson(header),
    };
  }

  private reconstructIndexData(
    meta: { generatedAt: string; integrityStatus: string; recordCountsJson: JsonValue; generationTime: number; derivedStatesJson: JsonValue; metricsJson: JsonValue; lastCommitHash: string | null },
    taskRows: GitgovTaskRow[],
    cycleRows: GitgovCycleRow[],
    actorRows: GitgovActorRow[],
    feedbackRows: GitgovFeedbackRow[],
    activityRows: GitgovActivityRow[],
    executionRows: GitgovExecutionRow[],
    agentRows: GitgovAgentRow[],
  ): IndexData {
    return {
      metadata: {
        generatedAt: meta.generatedAt,
        lastCommitHash: meta.lastCommitHash ?? '',
        integrityStatus: meta.integrityStatus as IndexData['metadata']['integrityStatus'],
        recordCounts: meta.recordCountsJson as unknown as Record<string, number>,
        generationTime: meta.generationTime,
      },
      metrics: meta.metricsJson as unknown as IndexData['metrics'],
      derivedStates: meta.derivedStatesJson as unknown as IndexData['derivedStates'],
      activityHistory: activityRows.map((a) => ({
        timestamp: a.timestamp,
        type: a.eventType as 'task_created',
        entityId: a.entityId,
        entityTitle: a.entityTitle,
        ...opt('actorId', a.actorId),
        ...opt('metadata', a.metadata as Record<string, string> | null),
      })),
      tasks: taskRows.map((r) => ({
        header: r.header as unknown as IndexData['tasks'][0]['header'],
        payload: {
          id: r.recordId,
          title: r.title,
          status: r.status as 'active',
          priority: r.priority as 'medium',
          description: r.description,
          tags: r.tags,
          references: r.references,
          cycleIds: r.cycleIds,
          ...opt('notes', r.notes),
          ...opt('metadata', r.metadata as Record<string, unknown> | null),
        },
      })),
      enrichedTasks: taskRows.map((r) => ({
        id: r.recordId,
        title: r.title,
        status: r.status as 'active',
        priority: r.priority as 'medium',
        description: r.description,
        tags: r.tags,
        references: r.references,
        cycleIds: r.cycleIds,
        ...opt('notes', r.notes),
        ...opt('metadata', r.metadata as Record<string, unknown> | null),
        derivedState: {
          isStalled: r.isStalled,
          isAtRisk: r.isAtRisk,
          needsClarification: r.needsClarification,
          isBlockedByDependency: r.isBlockedByDependency,
          healthScore: r.healthScore,
          timeInCurrentStage: r.timeInCurrentStage,
        },
        relationships: r.relationships as unknown as EnrichedTaskRecord['relationships'],
        metrics: {
          executionCount: r.executionCount,
          blockingFeedbackCount: r.blockingFeedbackCount,
          openQuestionCount: r.openQuestionCount,
          ...opt('timeToResolution', r.timeToResolution),
        },
        release: {
          isReleased: r.isReleased,
          ...opt('lastReleaseVersion', r.lastReleaseVersion),
        },
        lastUpdated: r.lastUpdated,
        lastActivityType: r.lastActivityType as EnrichedTaskRecord['lastActivityType'],
        ...opt('recentActivity', r.recentActivity),
      })),
      cycles: cycleRows.map((c) => ({
        header: c.header as unknown as IndexData['cycles'][0]['header'],
        payload: {
          id: c.recordId,
          title: c.title,
          status: c.status as 'active',
          taskIds: c.taskIds,
          childCycleIds: c.childCycleIds,
          tags: c.tags,
          ...opt('notes', c.notes),
          ...opt('metadata', c.metadata as Record<string, unknown> | null),
        },
      })),
      actors: actorRows.map((a) => ({
        header: a.header as unknown as IndexData['actors'][0]['header'],
        payload: {
          id: a.recordId,
          type: a.type as 'human',
          displayName: a.displayName,
          publicKey: a.publicKey,
          roles: a.roles as [string, ...string[]],
          ...opt('status', a.status as 'active' | 'revoked' | null),
          ...opt('supersededBy', a.supersededBy),
          ...opt('metadata', a.metadata as Record<string, unknown> | null),
        },
      })),
      feedback: feedbackRows.map((f) => ({
        header: f.header as unknown as IndexData['feedback'][0]['header'],
        payload: {
          id: f.recordId,
          entityType: f.entityType as 'task',
          entityId: f.entityId,
          type: f.type as 'blocking',
          status: f.status as 'open',
          content: f.content,
          ...opt('assignee', f.assignee),
          ...opt('resolvesFeedbackId', f.resolvesFeedbackId),
          ...opt('metadata', f.metadata as Record<string, unknown> | null),
        },
      })),
      executions: executionRows.map((e) => ({
        header: e.header as unknown as IndexData['executions'][0]['header'],
        payload: {
          id: e.recordId,
          taskId: e.taskId,
          type: e.type,
          title: e.title,
          result: e.result,
          ...opt('notes', e.notes),
          ...opt('references', e.references.length > 0 ? e.references : null),
          ...opt('metadata', e.metadata as Record<string, unknown> | null),
        },
      })),
      agents: agentRows.map((a) => {
        const payload: Record<string, unknown> = {
          id: a.recordId,
          engine: a.engine,
        };
        if (a.status !== null) payload['status'] = a.status;
        if (a.triggers !== null) payload['triggers'] = a.triggers;
        if (a.metadata !== null) payload['metadata'] = a.metadata;
        if (a.knowledgeDependencies !== null) payload['knowledge_dependencies'] = a.knowledgeDependencies;
        if (a.promptEngineRequirements !== null) payload['prompt_engine_requirements'] = a.promptEngineRequirements;
        return {
          header: a.header as unknown as IndexData['agents'][0]['header'],
          payload: payload as unknown as IndexData['agents'][0]['payload'],
        };
      }),
    };
  }
}

function toJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function opt<K extends string, V>(key: K, value: V | null): { [P in K]: V } | Record<string, never> {
  if (value === null) return {} as Record<string, never>;
  return { [key]: value } as { [P in K]: V };
}
