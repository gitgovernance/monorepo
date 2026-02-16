import { Command } from 'commander';
import { BaseCommand } from '../../base/base-command';
import type { BaseCommandOptions } from '../../interfaces/command';

export interface ActorNewOptions extends BaseCommandOptions {
  type: 'human' | 'agent';
  name: string;
  role: string[];
  scope?: string;
}

export interface ActorRotateKeyOptions extends BaseCommandOptions {}

export class ActorCommand extends BaseCommand {

  register(_program: Command): void {
    // Registration handled by registerActorCommands() in actor.ts
  }

  // [EARS-1] Create ActorRecord with keys
  async executeNew(options: ActorNewOptions): Promise<void> {
    try {
      const identityAdapter = await this.dependencyService.getIdentityAdapter();

      const actor = await identityAdapter.createActor(
        {
          type: options.type,
          displayName: options.name,
          roles: options.role as [string, ...string[]],
        },
        'self'
      );

      this.handleSuccess(
        { actorId: actor.id, type: actor.type, displayName: actor.displayName, roles: actor.roles },
        options,
        `Actor created: ${actor.id}\n   Type: ${actor.type}\n   Roles: ${actor.roles.join(', ')}`
      );
    } catch (error) {
      this.handleError(
        `Failed to create actor: ${error instanceof Error ? error.message : String(error)}`,
        options
      );
    }
  }

  // [EARS-4] Rotate key creating versioned successor
  async executeRotateKey(actorId: string, options: ActorRotateKeyOptions): Promise<void> {
    try {
      const identityAdapter = await this.dependencyService.getIdentityAdapter();

      const { oldActor, newActor } = await identityAdapter.rotateActorKey(actorId);

      this.handleSuccess(
        { oldActorId: oldActor.id, newActorId: newActor.id, status: 'rotated' },
        options,
        `Key rotated: ${oldActor.id} → ${newActor.id}\n   Old actor revoked. New key generated.`
      );
    } catch (error) {
      this.handleError(
        `Failed to rotate key: ${error instanceof Error ? error.message : String(error)}`,
        options
      );
    }
  }
}
