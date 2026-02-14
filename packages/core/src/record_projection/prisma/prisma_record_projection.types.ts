export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type ProjectionWhereUnique = {
  repoId_projectionType: { repoId: string; projectionType: string };
};

type ProjectionRow = {
  id: string;
  repoId: string;
  projectionType: string;
  data: JsonValue;
  lastCommitHash: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ProjectionDelegate = {
  upsert(args: {
    where: ProjectionWhereUnique;
    create: {
      repoId: string;
      projectionType: string;
      data: JsonValue;
      lastCommitHash: string | null;
    };
    update: { data: JsonValue; lastCommitHash: string | null };
  }): PromiseLike<unknown>;

  findUnique(args: {
    where: ProjectionWhereUnique;
    select?: { id: true };
  }): PromiseLike<ProjectionRow | { id: string } | null>;

  deleteMany(args: {
    where: { repoId: string; projectionType: string };
  }): PromiseLike<unknown>;
};

export type ProjectionClient = {
  projection: ProjectionDelegate;
};

export type PrismaRecordProjectionOptions = {
  client: ProjectionClient;
  repoId: string;
  projectionType?: string;
};
