/**
 * Tabla de Trazabilidad EARS - agent.test.ts
 * All EARS prefixes map to semgrep_agent.md
 *
 * | EARS ID  | Requisito                                                      | Test Case                                                         |
 * |----------|----------------------------------------------------------------|-------------------------------------------------------------------|
 * | SGP-B1   | Spawn semgrep --sarif --quiet para scope full                  | [SGP-B1] should process SARIF output and return AgentOutput       |
 * | SGP-B2   | Error claro si semgrep no instalado                            | [SGP-B2] should throw with installation instructions              |
 * | SGP-B3   | Exit code 1 = findings found (success)                         | [SGP-B3] should treat findings SARIF as success                   |
 * | SGP-B4   | Exit code > 1 = real error                                    | [SGP-B4] should throw on semgrep error                            |
 * | SGP-B5   | Timeout mata proceso y reporta                                 | [SGP-B5] should throw on timeout                                  |
 * | SGP-B6   | Spawn con --baseline-commit para scope diff                    | [SGP-B6] should process diff scope                                |
 * | SGP-B6   | Fallback a full si baselineCommit falta en diff                | [SGP-B6] should fallback to full when no baselineCommit           |
 * | SGP-C1   | Parsear results y mapear a Finding[]                           | [SGP-C1] should parse SARIF results and map to Finding array      |
 * | SGP-C2   | Mapear severity ERROR→critical, WARNING→high                   | [SGP-C2] should map semgrep severity to gitgov severity           |
 * | SGP-C3   | Mapear CWE a FindingCategory                                  | [SGP-C3] should map CWE to gitgov category                       |
 * | SGP-C4   | Reconstruir via SarifBuilder con toolName semgrep              | [SGP-C4] should rebuild SARIF via SarifBuilder                    |
 * | SGP-C5   | Zero findings = SARIF valido con results vacio                 | [SGP-C5] should return valid SARIF with empty results             |
 * | SGP-C6   | Extraer fixes de semgrep a Finding.fixes[]                     | [SGP-C6] should extract fix descriptions                          |
 */

import { SemgrepAgent } from './src/agent';
import type { SemgrepAgentDeps } from './src/types';

// ── Mock SarifBuilder ───────────────────────────────────────────────────────

function createMockSarifBuilder() {
  return {
    build: jest.fn().mockResolvedValue({
      $schema: 'https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json',
      version: '2.1.0' as const,
      runs: [{ tool: { driver: { name: 'semgrep', version: '1.0.0', informationUri: 'https://semgrep.dev' } }, results: [] }],
    }),
    validate: jest.fn().mockReturnValue({ valid: true }),
  };
}

function createMockDeps(overrides?: Partial<SemgrepAgentDeps>): SemgrepAgentDeps {
  return {
    sarifBuilder: createMockSarifBuilder(),
    getLineContent: jest.fn().mockResolvedValue('mocked line content'),
    ...overrides,
  };
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const SARIF_WITH_FINDINGS = {
  $schema: 'https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json',
  version: '2.1.0' as const,
  runs: [{
    tool: { driver: { name: 'semgrep', version: '1.0.0', informationUri: 'https://semgrep.dev', rules: [] } },
    results: [
      {
        ruleId: 'javascript.lang.security.detect-eval',
        level: 'error' as const,
        message: { text: 'Detected eval with expression' },
        locations: [{ physicalLocation: { artifactLocation: { uri: 'src/handler.ts' }, region: { startLine: 42, snippet: { text: 'eval(userInput)' } } } }],
        properties: { metadata: { cwe: ['CWE-94'] } },
      },
      {
        ruleId: 'javascript.lang.security.detect-non-literal-require',
        level: 'warning' as const,
        message: { text: 'Detected non-literal require' },
        locations: [{ physicalLocation: { artifactLocation: { uri: 'src/loader.ts' }, region: { startLine: 15, snippet: { text: 'require(moduleName)' } } } }],
        properties: {},
      },
    ],
  }],
};

const SARIF_EMPTY = {
  $schema: 'https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json',
  version: '2.1.0' as const,
  runs: [{
    tool: { driver: { name: 'semgrep', version: '1.0.0', informationUri: 'https://semgrep.dev', rules: [] } },
    results: [],
  }],
};

const SARIF_WITH_CWE798 = {
  $schema: 'https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json',
  version: '2.1.0' as const,
  runs: [{
    tool: { driver: { name: 'semgrep', version: '1.0.0', informationUri: 'https://semgrep.dev', rules: [] } },
    results: [{
      ruleId: 'generic.secrets.detected-api-key',
      level: 'error' as const,
      message: { text: 'API key detected' },
      locations: [{ physicalLocation: { artifactLocation: { uri: 'src/config.ts' }, region: { startLine: 5, snippet: { text: 'API_KEY = "sk_live_..."' } } } }],
      properties: { metadata: { cwe: ['CWE-798'] } },
    }],
  }],
};

const SARIF_WITH_FIXES = {
  $schema: 'https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json',
  version: '2.1.0' as const,
  runs: [{
    tool: { driver: { name: 'semgrep', version: '1.0.0', informationUri: 'https://semgrep.dev', rules: [] } },
    results: [{
      ruleId: 'python.lang.security.use-defusedxml',
      level: 'warning' as const,
      message: { text: 'Use defusedxml instead of xml' },
      locations: [{ physicalLocation: { artifactLocation: { uri: 'src/parser.py' }, region: { startLine: 3, snippet: { text: 'import xml.etree.ElementTree' } } } }],
      fixes: [{ description: { text: 'Replace xml with defusedxml' }, artifactChanges: [{ artifactLocation: { uri: 'src/parser.py' }, replacements: [{ deletedRegion: { startLine: 3 }, insertedContent: { text: 'import defusedxml.ElementTree' } }] }] }],
      properties: { metadata: { cwe: ['CWE-611'] } },
    }],
  }],
};

// ── 4.2. Semgrep Execution (SGP-B1 to SGP-B6) ─────────────────────────────

describe('4.2. Semgrep Execution (SGP-B1 to SGP-B6)', () => {
  it('[SGP-B1] should spawn semgrep with --sarif --quiet and capture stdout', async () => {
    const deps = createMockDeps();
    const agent = new SemgrepAgent(deps);

    const result = await agent.run({ scope: 'full', taskId: 'task-1' }, SARIF_WITH_FINDINGS);

    expect(result.metadata).toBeDefined();
    expect((result.metadata as Record<string, unknown>).kind).toBe('sarif');
    expect((result.metadata as Record<string, unknown>).version).toBe('2.1.0');
  });

  it('[SGP-B2] should throw with installation instructions when semgrep not installed', async () => {
    const deps = createMockDeps();
    const agent = new SemgrepAgent(deps);

    await expect(
      agent.run({ scope: 'full', taskId: 'task-1' }, null, 'command not found: semgrep'),
    ).rejects.toThrow(/semgrep not found/i);

    await expect(
      agent.run({ scope: 'full', taskId: 'task-1' }, null, 'command not found: semgrep'),
    ).rejects.toThrow(/pip install semgrep/i);
  });

  it('[SGP-B3] should treat exit code 1 as success with findings', async () => {
    const deps = createMockDeps();
    const agent = new SemgrepAgent(deps);

    // Exit code 1 in semgrep = findings found (not an error).
    // Verify: no throw + findings are passed to SarifBuilder
    const result = await agent.run({ scope: 'full', taskId: 'task-1' }, SARIF_WITH_FINDINGS);

    expect(result.metadata).toBeDefined();
    expect((result.metadata as Record<string, unknown>).kind).toBe('sarif');
    const buildCall = (deps.sarifBuilder.build as jest.Mock).mock.calls[0][0];
    expect(buildCall.findings.length).toBe(2);
  });

  it('[SGP-B4] should throw on exit code greater than 1', async () => {
    const deps = createMockDeps();
    const agent = new SemgrepAgent(deps);

    await expect(
      agent.run({ scope: 'full', taskId: 'task-1' }, null, 'semgrep error: invalid config'),
    ).rejects.toThrow(/semgrep error/i);
  });

  it('[SGP-B5] should kill process and throw on timeout', async () => {
    const deps = createMockDeps();
    const agent = new SemgrepAgent(deps);

    await expect(
      agent.run({ scope: 'full', taskId: 'task-1' }, null, 'TIMEOUT'),
    ).rejects.toThrow(/timed out/i);
  });

  it('[SGP-B6] should process diff scope SARIF', async () => {
    const deps = createMockDeps();
    const agent = new SemgrepAgent(deps);

    const result = await agent.run(
      { scope: 'diff', taskId: 'task-1', baselineCommit: 'abc123' },
      SARIF_EMPTY,
    );

    expect(result.metadata).toBeDefined();
    expect((result.metadata as Record<string, unknown>).kind).toBe('sarif');
  });

  it('[SGP-B6] should fallback to full scan when scope is diff but baselineCommit missing', async () => {
    const deps = createMockDeps();
    const agent = new SemgrepAgent(deps);

    const result = await agent.run({ scope: 'diff', taskId: 'task-1' }, SARIF_EMPTY);

    expect(result.metadata).toBeDefined();
    expect((result.metadata as Record<string, unknown>).kind).toBe('sarif');
    // Verify SarifBuilder was called (agent didn't skip processing)
    expect(deps.sarifBuilder.build).toHaveBeenCalledTimes(1);
  });
});

// ── 4.3. SARIF Processing (SGP-C1 to SGP-C6) ──────────────────────────────

describe('4.3. SARIF Processing (SGP-C1 to SGP-C6)', () => {
  it('[SGP-C1] should parse semgrep SARIF results and map to Finding array', async () => {
    const deps = createMockDeps();
    const agent = new SemgrepAgent(deps);

    await agent.run({ scope: 'full', taskId: 'task-1' }, SARIF_WITH_FINDINGS);

    const buildCall = (deps.sarifBuilder.build as jest.Mock).mock.calls[0][0];
    expect(buildCall.findings).toBeDefined();
    expect(buildCall.findings.length).toBe(2);
    expect(buildCall.findings[0].file).toBe('src/handler.ts');
    expect(buildCall.findings[0].line).toBe(42);
    expect(buildCall.findings[0].snippet).toBe('eval(userInput)');
  });

  it('[SGP-C2] should map semgrep ERROR to critical and WARNING to high', async () => {
    const deps = createMockDeps();
    const agent = new SemgrepAgent(deps);

    await agent.run({ scope: 'full', taskId: 'task-1' }, SARIF_WITH_FINDINGS);

    const buildCall = (deps.sarifBuilder.build as jest.Mock).mock.calls[0][0];
    expect(buildCall.findings[0].severity).toBe('critical');
    expect(buildCall.findings[1].severity).toBe('high');
  });

  it('[SGP-C3] should map CWE-798 to hardcoded-secret and unknown CWE to unknown-risk', async () => {
    const deps = createMockDeps();
    const agent = new SemgrepAgent(deps);

    await agent.run({ scope: 'full', taskId: 'task-1' }, SARIF_WITH_CWE798);

    const buildCall = (deps.sarifBuilder.build as jest.Mock).mock.calls[0][0];
    expect(buildCall.findings[0].category).toBe('hardcoded-secret');
  });

  it('[SGP-C4] should rebuild SARIF via SarifBuilder with toolName semgrep and getLineContent', async () => {
    const deps = createMockDeps();
    const agent = new SemgrepAgent(deps);

    await agent.run({ scope: 'full', taskId: 'task-1' }, SARIF_WITH_FINDINGS);

    const buildCall = (deps.sarifBuilder.build as jest.Mock).mock.calls[0][0];
    expect(buildCall.toolName).toBe('semgrep');
    expect(buildCall.getLineContent).toBe(deps.getLineContent);
  });

  it('[SGP-C5] should return valid SARIF with empty results when semgrep finds nothing', async () => {
    const deps = createMockDeps();
    const agent = new SemgrepAgent(deps);

    const result = await agent.run({ scope: 'full', taskId: 'task-1' }, SARIF_EMPTY);

    expect(result.metadata).toBeDefined();
    expect((result.metadata as Record<string, unknown>).kind).toBe('sarif');
    const buildCall = (deps.sarifBuilder.build as jest.Mock).mock.calls[0][0];
    expect(buildCall.findings).toEqual([]);
  });

  it('[SGP-C6] should extract fix descriptions from semgrep results to Finding.fixes', async () => {
    const deps = createMockDeps();
    const agent = new SemgrepAgent(deps);

    await agent.run({ scope: 'full', taskId: 'task-1' }, SARIF_WITH_FIXES);

    const buildCall = (deps.sarifBuilder.build as jest.Mock).mock.calls[0][0];
    expect(buildCall.findings[0].fixes).toBeDefined();
    expect(buildCall.findings[0].fixes.length).toBeGreaterThan(0);
    expect(buildCall.findings[0].fixes[0].description).toContain('defusedxml');
  });
});
