import type { IProjectInitializer } from '../project_initializer';
import type { IdentityModule } from '../identity/identity_module';
import type { IBacklogAdapter } from '../adapters/backlog_adapter/backlog_adapter.types';

export type ProjectModuleDeps = {
  initializer: IProjectInitializer;
  identity: IdentityModule;
  backlog: Pick<IBacklogAdapter, 'createCycle'>;
};

export type ProjectInitOptions = {
  name: string;
  login?: string;
  actorName?: string;
  type?: 'human' | 'agent';
  saasUrl?: string;
};

export type ProjectInitResult = {
  actorId: string;
  productAgentId: string;
  cycleId: string;
  commitSha?: string;
  alreadyInitialized?: boolean;
};
