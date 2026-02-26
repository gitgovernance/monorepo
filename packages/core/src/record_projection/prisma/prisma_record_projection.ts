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
} from './prisma_record_projection.types';

export class PrismaRecordProjection implements IRecordProjection {
  private readonly client: ProjectionClient;
  private readonly repoId: string;
  private readonly projectionType: string;

  constructor(options: PrismaRecordProjectionOptions) {
    this.client = options.client;
    this.repoId = options.repoId;
    this.projectionType = options.projectionType ?? 'index';
  }

  async persist(data: IndexData, context: ProjectionContext): Promise<void> {
    const where = { repoId: this.repoId, projectionType: this.projectionType };

    const taskRows = data.enrichedTasks.map((t) => this.buildTaskRow(t, data));
    const cycleRows = data.cycles.map((c) => ({
      repoId: this.repoId,
      projectionType: this.projectionType,
      recordId: c.payload.id,
      title: c.payload.title,
      status: c.payload.status,
      taskIds: c.payload.taskIds ?? [],
      childCycleIds: c.payload.childCycleIds ?? [],
      tags: c.payload.tags ?? [],
      notes: c.payload.notes ?? null,
      metadataJson: c.payload.metadata ? toJson(c.payload.metadata) : null,
      headerJson: toJson(c.header),
    }));
    const actorRows = data.actors.map((a) => ({
      repoId: this.repoId,
      projectionType: this.projectionType,
      recordId: a.payload.id,
      actorType: a.payload.type,
      displayName: a.payload.displayName,
      publicKey: a.payload.publicKey,
      roles: [...a.payload.roles],
      status: a.payload.status ?? null,
      supersededBy: a.payload.supersededBy ?? null,
      headerJson: toJson(a.header),
    }));
    const feedbackRows = data.feedback.map((f) => ({
      repoId: this.repoId,
      projectionType: this.projectionType,
      recordId: f.payload.id,
      entityType: f.payload.entityType,
      entityId: f.payload.entityId,
      feedbackType: f.payload.type,
      status: f.payload.status,
      content: f.payload.content,
      assignee: f.payload.assignee ?? null,
      resolvesFeedbackId: f.payload.resolvesFeedbackId ?? null,
      metadataJson: f.payload.metadata ? toJson(f.payload.metadata) : null,
      headerJson: toJson(f.header),
    }));
    const activityRows = data.activityHistory.map((ev) => ({
      repoId: this.repoId,
      projectionType: this.projectionType,
      timestamp: ev.timestamp,
      eventType: ev.type,
      entityId: ev.entityId,
      entityTitle: ev.entityTitle,
      actorId: ev.actorId ?? null,
      metadataJson: ev.metadata ? toJson(ev.metadata) : null,
    }));

    const ops: PromiseLike<unknown>[] = [
      this.client.gitgovTask.deleteMany({ where }),
      this.client.gitgovCycle.deleteMany({ where }),
      this.client.gitgovActor.deleteMany({ where }),
      this.client.gitgovFeedback.deleteMany({ where }),
      this.client.gitgovActivity.deleteMany({ where }),
      this.client.gitgovMeta.upsert({
        where: { repoId_projectionType: where },
        create: {
          repoId: this.repoId,
          projectionType: this.projectionType,
          lastCommitHash: context.lastCommitHash ?? null,
          generatedAt: data.metadata.generatedAt,
          integrityStatus: data.metadata.integrityStatus,
          recordCountsJson: toJson(data.metadata.recordCounts),
          generationTime: data.metadata.generationTime,
          derivedStatesJson: toJson(data.derivedStates),
          metricsJson: toJson(data.metrics),
        },
        update: {
          lastCommitHash: context.lastCommitHash ?? null,
          generatedAt: data.metadata.generatedAt,
          integrityStatus: data.metadata.integrityStatus,
          recordCountsJson: toJson(data.metadata.recordCounts),
          generationTime: data.metadata.generationTime,
          derivedStatesJson: toJson(data.derivedStates),
          metricsJson: toJson(data.metrics),
        },
      }),
    ];

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

    await this.client.$transaction(ops);
  }

  async read(_context: ProjectionContext): Promise<IndexData | null> {
    const where = {
      repoId_projectionType: {
        repoId: this.repoId,
        projectionType: this.projectionType,
      },
    };

    const meta = await this.client.gitgovMeta.findUnique({ where });
    if (!meta || !('generatedAt' in meta)) return null;

    const whereMany = { repoId: this.repoId, projectionType: this.projectionType };
    const [taskRows, cycleRows, actorRows, feedbackRows, activityRows] = await Promise.all([
      this.client.gitgovTask.findMany({ where: whereMany }),
      this.client.gitgovCycle.findMany({ where: whereMany }),
      this.client.gitgovActor.findMany({ where: whereMany }),
      this.client.gitgovFeedback.findMany({ where: whereMany }),
      this.client.gitgovActivity.findMany({ where: whereMany }),
    ]);

    return this.reconstructIndexData(meta, taskRows, cycleRows, actorRows, feedbackRows, activityRows);
  }

  async exists(_context: ProjectionContext): Promise<boolean> {
    const row = await this.client.gitgovMeta.findUnique({
      where: {
        repoId_projectionType: {
          repoId: this.repoId,
          projectionType: this.projectionType,
        },
      },
      select: { id: true },
    });
    return row !== null;
  }

  async clear(_context: ProjectionContext): Promise<void> {
    const where = { repoId: this.repoId, projectionType: this.projectionType };
    await this.client.$transaction([
      this.client.gitgovTask.deleteMany({ where }),
      this.client.gitgovCycle.deleteMany({ where }),
      this.client.gitgovActor.deleteMany({ where }),
      this.client.gitgovFeedback.deleteMany({ where }),
      this.client.gitgovActivity.deleteMany({ where }),
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
      repoId: this.repoId,
      projectionType: this.projectionType,
      recordId: enriched.id,
      title: enriched.title,
      status: enriched.status,
      priority: enriched.priority,
      description: enriched.description,
      tags: enriched.tags ?? [],
      references: enriched.references ?? [],
      cycleIds: enriched.cycleIds ?? [],
      notes: enriched.notes ?? null,
      metadataJson: enriched.metadata ? toJson(enriched.metadata) : null,
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
      relationshipsJson: toJson(enriched.relationships),
      headerJson: toJson(header),
    };
  }

  private reconstructIndexData(
    meta: { generatedAt: string; integrityStatus: string; recordCountsJson: JsonValue; generationTime: number; derivedStatesJson: JsonValue; metricsJson: JsonValue; lastCommitHash: string | null },
    taskRows: GitgovTaskRow[],
    cycleRows: GitgovCycleRow[],
    actorRows: GitgovActorRow[],
    feedbackRows: GitgovFeedbackRow[],
    activityRows: GitgovActivityRow[],
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
        ...opt('metadata', a.metadataJson as Record<string, string> | null),
      })),
      tasks: taskRows.map((r) => ({
        header: r.headerJson as unknown as IndexData['tasks'][0]['header'],
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
          ...opt('metadata', r.metadataJson as Record<string, unknown> | null),
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
        ...opt('metadata', r.metadataJson as Record<string, unknown> | null),
        derivedState: {
          isStalled: r.isStalled,
          isAtRisk: r.isAtRisk,
          needsClarification: r.needsClarification,
          isBlockedByDependency: r.isBlockedByDependency,
          healthScore: r.healthScore,
          timeInCurrentStage: r.timeInCurrentStage,
        },
        relationships: r.relationshipsJson as unknown as EnrichedTaskRecord['relationships'],
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
        header: c.headerJson as unknown as IndexData['cycles'][0]['header'],
        payload: {
          id: c.recordId,
          title: c.title,
          status: c.status as 'active',
          taskIds: c.taskIds,
          childCycleIds: c.childCycleIds,
          tags: c.tags,
          ...opt('notes', c.notes),
          ...opt('metadata', c.metadataJson as Record<string, unknown> | null),
        },
      })),
      actors: actorRows.map((a) => ({
        header: a.headerJson as unknown as IndexData['actors'][0]['header'],
        payload: {
          id: a.recordId,
          type: a.actorType as 'human',
          displayName: a.displayName,
          publicKey: a.publicKey,
          roles: a.roles as [string, ...string[]],
          ...opt('status', a.status as 'active' | 'revoked' | null),
          ...opt('supersededBy', a.supersededBy),
        },
      })),
      feedback: feedbackRows.map((f) => ({
        header: f.headerJson as unknown as IndexData['feedback'][0]['header'],
        payload: {
          id: f.recordId,
          entityType: f.entityType as 'task',
          entityId: f.entityId,
          type: f.feedbackType as 'blocking',
          status: f.status as 'open',
          content: f.content,
          ...opt('assignee', f.assignee),
          ...opt('resolvesFeedbackId', f.resolvesFeedbackId),
          ...opt('metadata', f.metadataJson as Record<string, unknown> | null),
        },
      })),
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
