import type { IIdentityModule } from '../identity/identity_module.types';
import type { ISessionManager } from '../session_manager';
import type { ActorRecord } from '../record_types';

// [GCA-A1] Return actor from session when active
// [GCA-A2] Follow succession chain when session actor is revoked
// [GCA-A3] Fallback to first active actor when no session
// [GCA-A4] Throw when no active actors exist
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

  // [GCA-A3] Fallback to first active actor
  const actors = await identity.listActors();
  const active = actors.find(a => a.status === 'active');
  if (active) return active;

  // [GCA-A4] No active actors
  throw new Error("No active actors found. Run 'gitgov init' first.");
}
