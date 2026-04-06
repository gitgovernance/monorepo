export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

// --- Where clauses (generic — tenant fields injected by consumer) ---

type WhereClause = Record<string, unknown>;

// --- Base row types (shared across all Gitgov tables) ---

type PrismaRowBase = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaRecordRowBase = PrismaRowBase & {
  recordId: string;
  header: JsonValue;
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
  metadata: JsonValue | null;
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
  relationships: JsonValue;
};

export type GitgovCycleRow = PrismaRecordRowBase & {
  title: string;
  status: string;
  taskIds: string[];
  childCycleIds: string[];
  tags: string[];
  notes: string | null;
  metadata: JsonValue | null;
};

export type GitgovActorRow = PrismaRecordRowBase & {
  type: string;
  displayName: string;
  publicKey: string;
  roles: string[];
  status: string | null;
  supersededBy: string | null;
  metadata: JsonValue | null;
};

export type GitgovFeedbackRow = PrismaRecordRowBase & {
  entityType: string;
  entityId: string;
  type: string;
  status: string;
  content: string;
  assignee: string | null;
  resolvesFeedbackId: string | null;
  metadata: JsonValue | null;
};

export type GitgovActivityRow = PrismaRowBase & {
  timestamp: number;
  eventType: string;
  entityId: string;
  entityTitle: string;
  actorId: string | null;
  metadata: JsonValue | null;
};

export type GitgovExecutionRow = PrismaRecordRowBase & {
  taskId: string;
  type: string;
  title: string;
  result: string;
  notes: string | null;
  metadata: JsonValue | null;
  references: string[];
};

export type GitgovAgentRow = PrismaRecordRowBase & {
  engine: JsonValue;
  status: string | null;
  triggers: JsonValue | null;
  metadata: JsonValue | null;
  knowledgeDependencies: JsonValue | null;
  promptEngineRequirements: JsonValue | null;
};

export type GitgovWorkflowRow = PrismaRecordRowBase & {
  name: string;
  description: string | null;
  stateTransitions: JsonValue;
  customRules: JsonValue | null;
  agentIntegration: JsonValue | null;
};

// --- Delegate types (duck typing for Prisma-generated delegates) ---

export type SingletonDelegate<TRow> = {
  upsert(args: {
    where: WhereClause;
    create: Omit<TRow, 'id' | 'createdAt' | 'updatedAt'> & Record<string, unknown>;
    update: Partial<Omit<TRow, 'id' | 'createdAt' | 'updatedAt'>>;
  }): PromiseLike<unknown>;
  findUnique(args: {
    where: WhereClause;
    select?: { id: true };
  }): PromiseLike<TRow | { id: string } | null>;
  findFirst?(args: {
    where?: WhereClause;
    select?: { id: true };
  }): PromiseLike<TRow | { id: string } | null>;
  deleteMany(args: { where: WhereClause }): PromiseLike<unknown>;
};

export type RecordDelegate<TRow> = {
  createMany(args: {
    data: Array<Omit<TRow, 'id' | 'createdAt' | 'updatedAt'> & Record<string, unknown>>;
  }): PromiseLike<unknown>;
  findMany(args: { where: WhereClause }): PromiseLike<TRow[]>;
  deleteMany(args: { where: WhereClause }): PromiseLike<unknown>;
};

// --- Client type ---

export type ProjectionClient = {
  gitgovMeta: SingletonDelegate<GitgovMetaRow>;
  gitgovTask: RecordDelegate<GitgovTaskRow>;
  gitgovCycle: RecordDelegate<GitgovCycleRow>;
  gitgovActor: RecordDelegate<GitgovActorRow>;
  gitgovFeedback: RecordDelegate<GitgovFeedbackRow>;
  gitgovActivity: RecordDelegate<GitgovActivityRow>;
  gitgovExecution: RecordDelegate<GitgovExecutionRow>;
  gitgovAgent: RecordDelegate<GitgovAgentRow>;
  gitgovWorkflow: RecordDelegate<GitgovWorkflowRow>;
  $transaction(operations: PromiseLike<unknown>[]): PromiseLike<unknown>;
};

export type PrismaRecordProjectionOptions = {
  client: ProjectionClient;
  tenantFields?: Record<string, string>;
};
