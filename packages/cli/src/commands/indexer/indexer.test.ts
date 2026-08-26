/**
 * indexer.test.ts — Indexer command registration (EARS-C3)
 * Spec: cli/specs/index_command.md §3.3
 *
 * Protects the CLASS of the bug: registering commands must NOT touch stores.
 * Eager projector registration (`cli/src/index.ts:60`) fired
 * initializeStores() → bootstrapWorktree() before Commander had parsed a single
 * option, so `--state-branch` (INIT-L1/L3) and the LOGIN-P1 override always
 * arrived too late: the worktree stayed bound to the default.
 *
 * The assertion that DISCRIMINATES is the second one. "It was not called during
 * registration" is not enough — it is not called today either, because
 * registration receives an already-built value. What has to be proven is that
 * resolution HAPPENS on execution.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// The handler builds IndexerCommand: it is stubbed so the test verifies the
// registration contract, not real indexing.
vi.mock('./indexer-command', () => ({
  IndexerCommand: class {
    async execute(): Promise<void> { /* no-op */ }
  },
}));

import { registerIndexerCommands } from './indexer';

describe('registerIndexerCommands (EARS-C3)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    vi.spyOn(process, 'exit').mockImplementation(vi.fn());
  });

  it('[EARS-C3] should receive a lazy resolver and not invoke it during registration', async () => {
    const program = new Command();
    const resolveProjector = vi.fn().mockResolvedValue({});

    registerIndexerCommands(program, resolveProjector);

    // (a) The command was registered
    expect(program.commands.map(c => c.name())).toContain('indexer');

    // (b) Registering resolves NOTHING — no store is touched in this phase
    expect(resolveProjector, 'registration must NOT resolve the projector').not.toHaveBeenCalled();

    // (c) Executing DOES resolve it — resolution lives in the handler, which runs
    //     after the command has set its own state-branch override
    await program.parseAsync(['node', 'gitgov', 'indexer']);
    expect(resolveProjector, 'the handler MUST resolve the projector on execution').toHaveBeenCalledTimes(1);
  });
});
