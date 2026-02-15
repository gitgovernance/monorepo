import { Command } from 'commander';
import { ActorCommand } from './actor-command';
import type { ActorNewOptions, ActorRotateKeyOptions } from './actor-command';

export function registerActorCommands(program: Command): void {
  const actorCommand = new ActorCommand();

  const actor = program
    .command('actor')
    .description('Manage actors (identities for humans and AI agents)')
    .alias('a');

  // gitgov actor new -t human -n "Name" -r developer
  actor
    .command('new')
    .description('Create a new actor identity')
    .alias('n')
    .requiredOption('-t, --type <type>', 'Actor type: human or agent')
    .requiredOption('-n, --name <name>', 'Actor name for ID and displayName')
    .requiredOption('-r, --role <role...>', 'Capability role(s) to assign')
    .option('-s, --scope <scope>', 'Agent scope (e.g., provider name)')
    .option('--json', 'Output as JSON')
    .option('-v, --verbose', 'Verbose output')
    .option('-q, --quiet', 'Quiet output')
    .action(async (options: ActorNewOptions) => {
      await actorCommand.executeNew(options);
    });

  // gitgov actor rotate-key <actorId>
  actor
    .command('rotate-key <actorId>')
    .description('Rotate keys for an existing actor (revokes old, creates successor)')
    .option('--json', 'Output as JSON')
    .option('-v, --verbose', 'Verbose output')
    .option('-q, --quiet', 'Quiet output')
    .action(async (actorId: string, options: ActorRotateKeyOptions) => {
      await actorCommand.executeRotateKey(actorId, options);
    });
}
