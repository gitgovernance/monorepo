import { Command } from 'commander';
import { LoginCommand } from './login-command';

export function registerLoginCommands(program: Command): void {
  const loginCommand = new LoginCommand();

  const login = program
    .command('login')
    .description('Connect CLI to GitGovernance SaaS — authenticate and sync keys')
    .option('-u, --url <url>', 'SaaS base URL')
    .option('-s, --status', 'Show current login status')
    .option('--logout', 'Remove session token (keys are preserved)')
    .option('--no-key-sync', 'Login without syncing keys')
    .option('--force-local', 'On key conflict: keep local key, upload to cloud')
    .option('--force-cloud', 'On key conflict: keep cloud key, download to local')
    .option('--json', 'Output as JSON')
    .option('-v, --verbose', 'Verbose output')
    .option('-q, --quiet', 'Quiet output')
    .action(async (options) => {
      if (options.status) {
        await loginCommand.executeStatus(options);
      } else if (options.logout) {
        await loginCommand.executeLogout(options);
      } else {
        await loginCommand.executeLogin(options);
      }
    });
}
