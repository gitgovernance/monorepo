import { Command } from 'commander';
import { AuditCommand } from './audit-command';

/**
 * Register the audit command
 */
export function registerAuditCommand(program: Command): void {
  const auditCommand = new AuditCommand();
  auditCommand.register(program);
}
