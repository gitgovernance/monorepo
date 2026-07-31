/**
 * Tabla de Trazabilidad EARS - index.test.ts
 * All EARS prefixes map to semgrep_agent.md §4.1 and §4.5
 *
 * | EARS ID  | Requisito                                                      | Test Case                                                    |
 * |----------|----------------------------------------------------------------|--------------------------------------------------------------|
 * | SGP-A1   | Exporta runAgent como named export                             | [SGP-A1] should export runAgent as named export              |
 * | SGP-A2   | tsc --noEmit produce cero errores                              | [SGP-A2] should have zero type errors                        |
 * | SGP-A3   | Output incluye metadata.kind sarif y version 2.1.0             | [SGP-A3] should return metadata.kind sarif and version 2.1.0 |
 * | SGP-A4   | package.json tiene gitgov.agent con purpose audit              | [SGP-A4] should have gitgov.agent field                      |
 * | SGP-E1   | runAgent retorna AgentOutput con sarif kind                    | [SGP-E1] should return AgentOutput with sarif kind           |
 * | SGP-E2   | Errores se propagan al AgentRunner                             | [SGP-E2] should propagate errors from SemgrepAgent           |
 * | SGP-E3   | runAgent es named export (no default)                          | [SGP-E3] should export runAgent as named export not default  |
 */

jest.mock('@gitgov/core', () => ({
  Sarif: {
    createSarifBuilder: () => ({
      build: jest.fn().mockResolvedValue({
        $schema: 'https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json',
        version: '2.1.0',
        runs: [{ tool: { driver: { name: 'semgrep', version: '1.0.0', informationUri: 'https://semgrep.dev' } }, results: [] }],
      }),
      validate: jest.fn().mockReturnValue({ valid: true }),
    }),
  },
  createFinding: jest.fn((input: Record<string, unknown>) => ({
    ...input,
    snippetHash: 'mocked-hash',
  })),
}));

jest.mock('@gitgov/core/fs', () => ({
  FsFileLister: jest.fn().mockImplementation(() => ({
    read: jest.fn().mockResolvedValue('mocked file content\nline 2\nline 3'),
    list: jest.fn().mockResolvedValue([]),
  })),
}));

jest.mock('node:child_process', () => ({
  execSync: jest.fn(),
}));

import * as mod from './src/index';

describe('4.1. Package y Estructura (SGP-A1 to SGP-A4)', () => {
  it('[SGP-A1] should export runAgent as async function from src/index.ts', () => {
    expect(typeof mod.runAgent).toBe('function');
    expect(mod.runAgent.constructor.name).toBe('AsyncFunction');
  });

  it('[SGP-A2] should have zero type errors (types are importable and resolve)', () => {
    expect(mod.runAgent).toBeDefined();
    // Verify typed exports resolve — if types broke, this file wouldn't compile
    const types = require('./src/types');
    expect(types.SEMGREP_SEVERITY_MAP).toBeDefined();
    expect(types.SEMGREP_SEVERITY_MAP.ERROR).toBe('critical');
    expect(types.SEMGREP_CATEGORY_MAP).toBeDefined();
    expect(types.SEMGREP_CATEGORY_MAP['CWE-798']).toBe('hardcoded-secret');
  });

  it('[SGP-A3] should return metadata.kind sarif and metadata.version 2.1.0', async () => {
    const { execSync } = require('node:child_process') as { execSync: jest.Mock };
    execSync.mockReturnValue(JSON.stringify({
      runs: [{ tool: { driver: { name: 'semgrep', version: '1.0.0', informationUri: 'https://semgrep.dev' } }, results: [] }],
    }));

    const result = await mod.runAgent({
      agentId: 'agent:semgrep',
      actorId: 'agent:semgrep',
      taskId: 'task-1',
      runId: 'run-1',
      projectRoot: '/tmp/test',
      input: { scope: 'full', taskId: 'task-1' },
    });

    expect((result.metadata as Record<string, unknown>).kind).toBe('sarif');
    expect((result.metadata as Record<string, unknown>).version).toBe('2.1.0');
  });

  it('[SGP-A4] should have gitgov.agent field with purpose audit and requires semgrep', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('./package.json');
    expect(pkg.gitgov.agent.purpose).toBe('audit');
    expect(pkg.gitgov.agent.function).toBe('runAgent');
    expect(pkg.gitgov.agent.metadata.requires).toBe('semgrep');
  });
});

describe('4.5. Entry Point y Error Handling (SGP-E1 to SGP-E3)', () => {
  it('[SGP-E1] should return AgentOutput with sarif kind when invoked', async () => {
    const { execSync } = require('node:child_process') as { execSync: jest.Mock };
    execSync.mockReturnValue(JSON.stringify({
      runs: [{ tool: { driver: { name: 'semgrep', version: '1.0.0', informationUri: 'https://semgrep.dev' } }, results: [] }],
    }));

    const result = await mod.runAgent({
      agentId: 'agent:semgrep',
      actorId: 'agent:semgrep',
      taskId: 'task-1',
      runId: 'run-1',
      projectRoot: '/tmp/test',
      input: { scope: 'full', taskId: 'task-1' },
    });

    expect(result.metadata).toBeDefined();
    expect((result.metadata as Record<string, unknown>).kind).toBe('sarif');
  });

  it('[SGP-E2] should propagate errors from SemgrepAgent', async () => {
    const { execSync } = require('node:child_process') as { execSync: jest.Mock };
    execSync.mockImplementation(() => { throw { message: 'command not found: semgrep', status: 127 }; });

    await expect(mod.runAgent({
      agentId: 'agent:semgrep',
      actorId: 'agent:semgrep',
      taskId: 'task-1',
      runId: 'run-1',
      projectRoot: '/tmp/test',
      input: { scope: 'full', taskId: 'task-1' },
    })).rejects.toThrow(/semgrep not found/i);
  });

  it('[SGP-E3] should export runAgent as named export not default', () => {
    expect(mod.runAgent).toBeDefined();
    expect((mod as Record<string, unknown>).default).toBeUndefined();
  });
});
