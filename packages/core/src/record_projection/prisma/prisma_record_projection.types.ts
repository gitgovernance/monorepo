export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

// --- Where clauses ---

type WhereRepoProjection = { repoId: string; projectionType: string };
type WhereRepoProjectionUnique = {
  repoId_projectionType: { repoId: string; projectionType: string };
};

// --- Base row types (shared across all Gitgov tables) ---

type PrismaRowBase = {
  id: string;
  repoId: string;
  projectionType: string;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaRecordRowBase = PrismaRowBase & {
  recordId: string;
  headerJson: JsonValue;
};

// --- Row types (match Prisma model fields) ---

export type GitgovMetaRow = PrismaRowBase & {
  lastCommitHash: string | null;
  generatedAt: string;
  integrityStatus: string;
  recordCountsJson: JsonValue;
  generationTime: number;
  derivedStatesJson: JsonValue;
  metricsJson: JsonValue;
};

export type GitgovTaskRow = PrismaRecordRowBase & {
  title: string;
  status: string;
  priority: string;
  description: string;
  tags: string[];
  references: string[];
  cycleIds: string[];
  notes: string | null;
  metadataJson: JsonValue | null;
  isStalled: boolean;
  isAtRisk: boolean;
  needsClarification: boolean;
  isBlockedByDependency: boolean;
  healthScore: number;
  timeInCurrentStage: number;
  executionCount: number;
  blockingFeedbackCount: number;
  openQuestionCount: number;
  timeToResolution: number | null;
  isReleased: boolean;
  lastReleaseVersion: string | null;
  lastUpdated: number;
  lastActivityType: string;
  recentActivity: string | null;
  relationshipsJson: JsonValue;
};

export type GitgovCycleRow = PrismaRecordRowBase & {
  title: string;
  status: string;
  taskIds: string[];
  childCycleIds: string[];
  tags: string[];
  notes: string | null;
  metadataJson: JsonValue | null;
};

export type GitgovActorRow = PrismaRecordRowBase & {
  actorType: string;
  displayName: string;
  publicKey: string;
  roles: string[];
  status: string | null;
  supersededBy: string | null;
};

export type GitgovFeedbackRow = PrismaRecordRowBase & {
  entityType: string;
  entityId: string;
  feedbackType: string;
  status: string;
  content: string;
  assignee: string | null;
  resolvesFeedbackId: string | null;
  metadataJson: JsonValue | null;
};

export type GitgovActivityRow = PrismaRowBase & {
  timestamp: number;
  eventType: string;
  entityId: string;
  entityTitle: string;
  actorId: string | null;
  metadataJson: JsonValue | null;
};

// --- Delegate types (duck typing for Prisma-generated delegates) ---

export type SingletonDelegate<TRow> = {
  upsert(args: {
    where: WhereRepoProjectionUnique;
    create: Omit<TRow, 'id' | 'createdAt' | 'updatedAt'>;
    update: Partial<Omit<TRow, 'id' | 'repoId' | 'projectionType' | 'createdAt' | 'updatedAt'>>;
  }): PromiseLike<unknown>;
  findUnique(args: {
    where: WhereRepoProjectionUnique;
    select?: { id: true };
  }): PromiseLike<TRow | { id: string } | null>;
  deleteMany(args: { where: WhereRepoProjection }): PromiseLike<unknown>;
};

export type RecordDelegate<TRow> = {
  createMany(args: {
    data: Array<Omit<TRow, 'id' | 'createdAt' | 'updatedAt'>>;
  }): PromiseLike<unknown>;
  findMany(args: { where: WhereRepoProjection }): PromiseLike<TRow[]>;
  deleteMany(args: { where: WhereRepoProjection }): PromiseLike<unknown>;
};

// --- Client type ---

export type ProjectionClient = {
  gitgovMeta: SingletonDelegate<GitgovMetaRow>;
  gitgovTask: RecordDelegate<GitgovTaskRow>;
  gitgovCycle: RecordDelegate<GitgovCycleRow>;
  gitgovActor: RecordDelegate<GitgovActorRow>;
  gitgovFeedback: RecordDelegate<GitgovFeedbackRow>;
  gitgovActivity: RecordDelegate<GitgovActivityRow>;
  $transaction(operations: PromiseLike<unknown>[]): PromiseLike<unknown>;
};

export type PrismaRecordProjectionOptions = {
  client: ProjectionClient;
  repoId: string;
  projectionType?: string;
};
