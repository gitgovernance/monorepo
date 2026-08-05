/**
 * indexer.test.ts — Registro de comandos del indexer (EARS-C3)
 * Spec: cli/specs/index_command.md §3.3
 *
 * Protege la CLASE del bug de s78b-32: registrar comandos NO debe tocar stores.
 * El registro ansioso del projector (`cli/src/index.ts:60`) disparaba
 * initializeStores() → bootstrapWorktree() antes de que Commander parseara
 * ninguna opcion, y por eso `--state-branch` (INIT-L1/L3) y el override de
 * LOGIN-P1 llegaban siempre tarde: el worktree quedaba atado al default.
 *
 * El assert que DISCRIMINA es el segundo: no basta con "no se llamo al
 * registrar" (hoy tampoco se llama, porque el registro recibe un valor ya
 * construido) — hay que probar que la resolucion OCURRE al ejecutar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// El handler construye IndexerCommand: se stubea para que el test verifique
// el contrato del registro, no la indexacion real.
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

    // (a) El comando quedo registrado
    expect(program.commands.map(c => c.name())).toContain('indexer');

    // (b) Registrar NO resuelve nada — ningun store se toca en esta fase
    expect(resolveProjector, 'el registro NO debe resolver el projector').not.toHaveBeenCalled();

    // (c) Ejecutar SI lo resuelve — la resolucion vive en el handler, que es
    //     cuando el comando ya fijo su propio override de state-branch
    await program.parseAsync(['node', 'gitgov', 'indexer']);
    expect(resolveProjector, 'el handler DEBE resolver el projector al ejecutar').toHaveBeenCalledTimes(1);
  });
});
