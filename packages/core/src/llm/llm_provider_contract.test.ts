/**
 * Contract tests for the `ILlmProvider` interface — [LLM-D1], [LLM-D2]
 *
 * Spec: llm_provider_module.md §4.2
 *
 * These verify what EVERY implementation must honour, not what any one of them does.
 * They live here, next to the interface, and NOT in the resolver's test file, because
 * the contract belongs to `llm_provider.ts` — which ships from `@gitgov/core` — while
 * `resolveLlmProvider` ships from `@gitgov/core/fs`. Leaving D1/D2 in `resolve.test.ts`
 * would have dragged two interface requirements into the implementation spec when the
 * module was split.
 *
 * This file imports a Node-only implementation (`CliLlmProvider`) even though its spec
 * is the pure one. That is fine and deliberate: the EARS-CI02 guardrail measures
 * `dist/src/index.js`, and tests never reach the bundle. Same shape as
 * `file_lister_contract.test.ts` (EARS-FL05).
 *
 * Previously D1/D2 were asserted THROUGH `resolveLlmProvider`, which made them depend on
 * the resolver rather than on the contract, and D2 never called `query()` at all — it
 * asserted `typeof provider.query === 'function'` for a requirement about the SHAPE of
 * what `query()` returns.
 */

import { execSync } from 'node:child_process';
import { AnthropicLlmProvider } from './anthropic/anthropic_llm_provider';
import { CliLlmProvider } from './fs/cli_llm_provider';
import type { ILlmProvider } from './llm_provider';

const mockCreate = jest.fn().mockResolvedValue({
  content: [{ type: 'text', text: 'contract-content' }],
  model: 'contract-model',
  usage: { input_tokens: 1, output_tokens: 1 },
});

jest.mock('@anthropic-ai/sdk', () => {
  const MockAnthropicClass = jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
  return { default: MockAnthropicClass, __esModule: true };
});

jest.mock('node:child_process', () => ({
  execSync: jest.fn(),
  exec: jest.fn(),
}));

const mockExecSync = execSync as unknown as jest.Mock;

/**
 * Every implementation of the interface, with a factory that builds it with the
 * cheapest valid input. Adding a provider here is NOT optional — a new class that
 * does not satisfy D1/D2 must fail this file, not slip past it.
 *
 * `CliLlmProvider` can be constructed freely: [LLM-C1] defers binary detection to the
 * first `query()`, so no CLI needs to be installed to build one.
 */
const IMPLEMENTATIONS: Array<{ name: string; make: () => ILlmProvider }> = [
  { name: 'AnthropicLlmProvider', make: () => new AnthropicLlmProvider({ apiKey: 'sk-contract', model: 'contract-model' }) },
  { name: 'CliLlmProvider', make: () => new CliLlmProvider({ model: 'contract-model' }) },
];

describe('ILlmProvider contract', () => {
  beforeEach(() => {
    // Both mocks, not just execSync: `mockCreate` is a module-level jest.fn() shared by
    // every test in this file, so its call history leaks across them. Harmless while the
    // assertions only read the resolved value, but the first `toHaveBeenCalledTimes` added
    // here would fail for reasons that have nothing to do with the test that added it.
    mockCreate.mockClear();
    mockExecSync.mockReset();
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === 'claude --version') return 'claude 1.0.0\n';
      if (cmd.startsWith('claude -p')) return 'contract-content';
      throw new Error(`Unexpected command: ${cmd}`);
    });
  });

  describe('4.2. Interface Contract (LLM-D1 to LLM-D2)', () => {
    // Anti-vacuity: `it.each` over an empty table would register no test at all and the
    // suite would still report green. This guards the table itself.
    it('should cover every ILlmProvider implementation', () => {
      expect(IMPLEMENTATIONS.length).toBeGreaterThan(1);
    });

    // `it.each` rather than a loop inside one `it()`: the name goes in the title, so a
    // failure says WHICH implementation broke instead of just which requirement.
    it.each(IMPLEMENTATIONS)(
      '[LLM-D1] should expose providerName and modelName on $name',
      ({ make }) => {
        const provider = make();

        expect(typeof provider.providerName).toBe('string');
        expect(provider.providerName.length).toBeGreaterThan(0);
        expect(typeof provider.modelName).toBe('string');
        expect(provider.modelName).toBe('contract-model');
      }
    );

    it.each(IMPLEMENTATIONS)(
      '[LLM-D2] should always return content and model in LlmResponse from $name',
      async ({ make }) => {
        const provider = make();
        const response = await provider.query([{ role: 'user', content: 'contract probe' }]);

        // The EARS is about the SHAPE of what query() returns, so query() must be
        // called. Checking that the method exists proves nothing about the response.
        expect(typeof response.content).toBe('string');
        expect(response.content.length).toBeGreaterThan(0);
        expect(typeof response.model).toBe('string');
        expect(response.model.length).toBeGreaterThan(0);

        // `usage` is explicitly optional — present or absent, both satisfy D2.
        if (response.usage !== undefined) {
          expect(typeof response.usage.inputTokens).toBe('number');
          expect(typeof response.usage.outputTokens).toBe('number');
        }
      }
    );
  });
});
