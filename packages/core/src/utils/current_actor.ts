import type { IIdentityModule } from '../identity/identity_module.types';
import type { ISessionManager } from '../session_manager';
import type { ActorRecord } from '../record_types';

// [GCA-A3b] Thrown when multiple local keys exist and no session choice has been made
export class ActorSelectionRequiredError extends Error {
  constructor(public readonly actorIds: string[]) {
    super(`Multiple active actors found (${actorIds.join(', ')}). Select one and save to session.`);
    this.name = 'ActorSelectionRequiredError';
  }
}

// [GCA-A1] Return actor from session when active
// [GCA-A2] Follow succession chain when session actor is revoked
// [GCA-A3] 1 local key → return that actor
// [GCA-A3b] N local keys → throw ActorSelectionRequiredError
// [GCA-A4] 0 local keys → throw error
export async function getCurrentActor(
  identity: IIdentityModule,
  sessionManager: ISessionManager,
): Promise<ActorRecord> {
  const session = await sessionManager.loadSession();

  if (session?.lastSession?.actorId) {
    // [GCA-A2] Resolve succession chain
    const currentId = await identity.resolveCurrentActorId(session.lastSession.actorId);
    // [GCA-A1] Return if found
    const actor = await identity.getActor(currentId);
    if (actor) return actor;
  }

  // [GCA-A3] Fallback: local private keys are the source of truth for "who am I"
  const localActorIds = await sessionManager.detectActorFromKeyFiles();

  if (localActorIds.length === 1) {
    const actor = await identity.getActor(localActorIds[0]!);
    if (actor) return actor;
  }

  // [GCA-A3b] Multiple keys — caller must choose
  if (localActorIds.length > 1) {
    throw new ActorSelectionRequiredError(localActorIds);
  }

  // [GCA-A4] No local keys
  throw new Error("No active actors found. Run 'gitgov init' first.");
}
