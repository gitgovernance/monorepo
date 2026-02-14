import type { IRecordProjection, IndexData, ProjectionContext } from '../record_projection.types';
import type { JsonValue, ProjectionClient, PrismaRecordProjectionOptions } from './prisma_record_projection.types';

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
    await this.client.projection.upsert({
      where: {
        repoId_projectionType: {
          repoId: this.repoId,
          projectionType: this.projectionType,
        },
      },
      create: {
        repoId: this.repoId,
        projectionType: this.projectionType,
        data: JSON.parse(JSON.stringify(data)) as JsonValue,
        lastCommitHash: context.lastCommitHash ?? null,
      },
      update: {
        data: JSON.parse(JSON.stringify(data)) as JsonValue,
        lastCommitHash: context.lastCommitHash ?? null,
      },
    });
  }

  async read(_context: ProjectionContext): Promise<IndexData | null> {
    const row = await this.client.projection.findUnique({
      where: {
        repoId_projectionType: {
          repoId: this.repoId,
          projectionType: this.projectionType,
        },
      },
    });
    if (!row || !('data' in row)) return null;
    return row.data as unknown as IndexData;
  }

  async exists(_context: ProjectionContext): Promise<boolean> {
    const row = await this.client.projection.findUnique({
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
    await this.client.projection.deleteMany({
      where: {
        repoId: this.repoId,
        projectionType: this.projectionType,
      },
    });
  }
}
