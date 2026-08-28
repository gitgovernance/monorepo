/**
 * ReviewAdvisorAgent Tests — G18 Provider-Agnostic
 *
 * Unit tests for the review-advisor agent implementation.
 * LLM calls are mocked via ILlmProvider mock (not ClaudeAnalyzer).
 *
 * Reference: review_advisor_agent.md §4.1-4.3
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ReviewAdvisorAgent } from './src/agent';
import type { ReviewAdvisorInput, ReviewOpinion, LlmProvider } from './src/types';
import type { Finding, PolicyDecision } from '@gitgov/core';

// ============================================================================
// Test helpers
// ============================================================================

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    fingerprint: 'fp-test-001',
    ruleId: 'SEC-001',
    message: 'Secret detected in source',
    severity: 'critical',
    category: 'secrets',
    file: 'config.ts',
    line: 3,
    // snippet/snippetHash/detector/confidence/executionId are REQUIRED by Finding.
    // They were missing, so the helper only type-checked as a partial and the file
    // failed `tsc --noEmit` — the very thing [RAV-A2] requires to be clean.
    snippet: 'const apiKey = "sk-live-redacted"',
    snippetHash: 'a'.repeat(64),
    detector: 'regex',
    confidence: 0.95,
    executionId: '1700000000-exec-review-advisor-test',
    reportedBy: ['agent:security-audit'],
    isWaived: false,
    ...overrides,
  };
}

function makePolicyDecision(decision: 'pass' | 'block' = 'block'): PolicyDecision {
  return {
    decision,
    reason: decision === 'block' ? 'Critical findings present' : 'No blocking findings',
    // Required by PolicyDecision — the ExecutionRecord the decision was persisted in.
    executionId: '1700000000-exec-policy-test',
    blockingFindings: [],
    waivedFindings: [],
    summary: { critical: 1, high: 0, medium: 0, low: 0 },
    rulesEvaluated: [],
    evaluatedAt: new Date().toISOString(),
  };
}

function makeInput(overrides: Partial<ReviewAdvisorInput> = {}): ReviewAdvisorInput {
  return {
    findings: [makeFinding()],
    policyDecision: makePolicyDecision(),
    taskId: 'task-test-001',
    ...overrides,
  };
}

function makeMockLlm(responseContent: string): LlmProvider {
  return {
    query: jest.fn().mockResolvedValue({ content: responseContent, model: 'test-model' }),
    providerName: 'test',
    modelName: 'test-model',
  };
}

function makeOpinionsJson(opinions: Partial<ReviewOpinion>[]): string {
  return JSON.stringify(opinions.map(o => ({
    findingFingerprint: o.findingFingerprint ?? 'fp-test-001',
    riskExplanation: o.riskExplanation ?? 'Risk explanation',
    regulations: o.regulations ?? ['PCI-DSS Req 6.5.3'],
    remediationAdvice: o.remediationAdvice ?? 'Use env vars',
    confidence: o.confidence ?? 'high',
    isFalsePositive: o.isFalsePositive ?? false,
    ...(o.falsePositiveReason ? { falsePositiveReason: o.falsePositiveReason } : {}),
  })));
}

// ============================================================================
// Tests
// ============================================================================

describe('ReviewAdvisorAgent', () => {
  describe('4.1. Package y Estructura (RAV-A3 to RAV-A4)', () => {
    it('[RAV-A3] should require findings and taskId in ReviewAdvisorInput', async () => {
      // "Require" is a compile-time property, so it needs a compile-time assert.
      // ts-jest type-checks this file: if either field became optional, the
      // suppression directives below turn unused and the SUITE FAILS to compile.
      // Asserting on a fixture we just built (`expect(input.findings).toBeDefined()`)
      // would only prove the fixture has what we put in it.

      // @ts-expect-error — `findings` is required by ReviewAdvisorInput
      const withoutFindings: ReviewAdvisorInput = { policyDecision: makePolicyDecision(), taskId: 't' };

      // @ts-expect-error — `taskId` is required by ReviewAdvisorInput
      const withoutTaskId: ReviewAdvisorInput = { findings: [], policyDecision: makePolicyDecision() };

      // @ts-expect-error — `findings` must be Finding[], not string[]
      const wrongFindingsType: ReviewAdvisorInput = { findings: ['not-a-finding'], policyDecision: makePolicyDecision(), taskId: 't' };

      expect(withoutFindings).toBeDefined();
      expect(withoutTaskId).toBeDefined();
      expect(wrongFindingsType).toBeDefined();

      // And the well-formed input still runs end to end.
      const llm = makeMockLlm(makeOpinionsJson([{}]));
      const output = await new ReviewAdvisorAgent({ llm }).run(makeInput());
      expect(output).toBeDefined();
    });

    it('[RAV-A4] should return metadata.kind feedback-review and metadata.data as ReviewResult', async () => {
      const llm = makeMockLlm(makeOpinionsJson([{}]));
      const agent = new ReviewAdvisorAgent({ llm });
      const output = await agent.run(makeInput());

      const metadata = output.metadata as Record<string, unknown>;
      expect(metadata['kind']).toBe('feedback-review');
      expect(metadata['data']).toBeDefined();

      const data = metadata['data'] as Record<string, unknown>;
      expect(data['opinions']).toBeDefined();
      expect(data['summary']).toBeDefined();
      expect(data['model']).toBe('test-model');
    });
  });

  describe('4.2. LLM Analysis — G18 (RAV-B1 to RAV-B7)', () => {
    it('[RAV-B1] should build prompt with finding details, file context, and policy decision', async () => {
      const llm = makeMockLlm(makeOpinionsJson([{}]));
      const agent = new ReviewAdvisorAgent({ llm });

      await agent.run(makeInput({
        findings: [makeFinding({ file: 'checkout.ts', line: 47, category: 'data-transfer' })],
        policyDecision: makePolicyDecision('block'),
      }));

      expect(llm.query).toHaveBeenCalledTimes(1);
      const callArgs = (llm.query as jest.Mock).mock.calls[0][0] as Array<{ role: string; content: string }>;
      const userMsg = callArgs.find(m => m.role === 'user');

      // finding details
      expect(userMsg?.content).toContain('checkout.ts');
      expect(userMsg?.content).toContain('47');
      expect(userMsg?.content).toContain('data-transfer');
      // file context — the EARS asks for it and buildPrompt supplies it via `snippet`.
      // Without this assert the prompt could stop carrying the evidence and stay green.
      expect(userMsg?.content).toContain('const apiKey = "sk-live-redacted"');
      // policy decision
      expect(userMsg?.content).toContain('block');
      expect(userMsg?.content).toContain('Critical findings present');
    });

    it('[RAV-B2] should call LLM query with system + user messages', async () => {
      const llm = makeMockLlm(makeOpinionsJson([{}]));
      const agent = new ReviewAdvisorAgent({ llm });
      await agent.run(makeInput());

      const callArgs = (llm.query as jest.Mock).mock.calls[0][0] as Array<{ role: string; content: string }>;
      expect(callArgs.find(m => m.role === 'system')).toBeDefined();
      expect(callArgs.find(m => m.role === 'user')).toBeDefined();
    });

    it('[RAV-B2] should not reference any LLM SDK in src/ or in the manifest', () => {
      // The other half of the EARS: "without importing or naming any LLM SDK".
      // The agent must stay provider-agnostic — the SDK belongs to the provider
      // inside core. A static assert, because no runtime path can prove absence.
      const SDKS = [
        '@anthropic-ai/claude-agent-sdk',
        '@anthropic-ai/sdk',
        'openai',
        '@google/genai',
        'node:child_process',
        'child_process',
      ];
      const esc = (s: string) => s.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&');

      // Every way a module can enter, not just `from '...'`. A `require('openai')`
      // or a bare `import 'openai'` is the exact shape a shortcut would take.
      const forms = (sdk: string) => [
        new RegExp(`from\\s*['"\`]${esc(sdk)}['"\`]`),
        new RegExp(`import\\s*\\(\\s*['"\`]${esc(sdk)}['"\`]`),
        new RegExp(`require\\s*\\(\\s*['"\`]${esc(sdk)}['"\`]`),
        new RegExp(`import\\s+['"\`]${esc(sdk)}['"\`]`),
      ];

      // Recursive: `src/` is flat today, but a new `src/providers/x.ts` must not
      // slip past the scan and turn this zero into a false one.
      const walk = (dir: string): string[] =>
        fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
          const full = path.join(dir, e.name);
          return e.isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
        });

      const srcDir = path.join(__dirname, 'src');
      const files = walk(srcDir);

      // Anti-vacuity: an empty scan would satisfy the assert without reading anything.
      expect(files.length).toBeGreaterThan(0);

      const offenders: string[] = [];
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        for (const sdk of SDKS) {
          if (forms(sdk).some(re => re.test(content))) {
            offenders.push(`${path.relative(srcDir, file)} → ${sdk}`);
          }
        }
      }

      // The manifest is the harder evidence: code that names no SDK while
      // package.json ships one is still not provider-agnostic.
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8')) as {
        dependencies?: Record<string, string>;
      };
      const deps = Object.keys(pkg.dependencies ?? {});
      expect(deps.length).toBeGreaterThan(0); // anti-vacuity on the manifest read
      for (const dep of deps) {
        if (SDKS.includes(dep)) offenders.push(`package.json dependencies → ${dep}`);
      }

      // Control: the same detector does find an import that IS expected to be there.
      const agentSrc = fs.readFileSync(path.join(srcDir, 'agent.ts'), 'utf-8');
      expect(/from\s*['"]\.\/types['"]/.test(agentSrc)).toBe(true);

      expect(offenders).toEqual([]);
    });

    it('[RAV-B3] should parse LLM response into ReviewOpinion with risk, regulations, and confidence', async () => {
      const llm = makeMockLlm(makeOpinionsJson([{
        riskExplanation: 'GDPR Art. 44 violation — PII sent to third party',
        regulations: ['GDPR Art. 44', 'GDPR Art. 6'],
        confidence: 'high',
      }]));

      const agent = new ReviewAdvisorAgent({ llm });
      const output = await agent.run(makeInput());
      const data = (output.metadata as Record<string, unknown>)['data'] as Record<string, unknown>;
      const opinions = data['opinions'] as ReviewOpinion[];

      expect(opinions).toHaveLength(1);
      expect(opinions[0]!.riskExplanation).toBe('GDPR Art. 44 violation — PII sent to third party');
      expect(opinions[0]!.regulations).toEqual(['GDPR Art. 44', 'GDPR Art. 6']);
      expect(opinions[0]!.confidence).toBe('high');
    });

    it('[RAV-B4] should set isFalsePositive true with reason when LLM identifies false positive', async () => {
      const llm = makeMockLlm(makeOpinionsJson([{
        isFalsePositive: true,
        falsePositiveReason: 'This is a test fixture, not production code',
      }]));

      const agent = new ReviewAdvisorAgent({ llm });
      const output = await agent.run(makeInput());
      const data = (output.metadata as Record<string, unknown>)['data'] as Record<string, unknown>;
      const opinions = data['opinions'] as ReviewOpinion[];

      expect(opinions[0]!.isFalsePositive).toBe(true);
      expect(opinions[0]!.falsePositiveReason).toBe('This is a test fixture, not production code');
    });

    it('[RAV-B5] should return status partial with empty opinions when LLM fails', async () => {
      const llm: LlmProvider = {
        query: jest.fn().mockRejectedValue(new Error('LLM API unavailable')),
        providerName: 'test',
        modelName: 'test-model',
      };

      const agent = new ReviewAdvisorAgent({ llm });
      const output = await agent.run(makeInput());

      expect(output.data).toEqual({
        status: 'partial',
        warning: 'LLM analysis failed: LLM API unavailable',
      });

      const data = (output.metadata as Record<string, unknown>)['data'] as Record<string, unknown>;
      expect((data['opinions'] as unknown[]).length).toBe(0);
    });

    it('[RAV-B5] should return status partial when the LLM times out', async () => {
      // The EARS covers "fails OR times out". A timeout reaches the agent as a
      // rejected promise like any other failure, but nothing proved that until now.
      const llm: LlmProvider = {
        query: jest.fn().mockRejectedValue(new Error('Request timed out after 180000ms')),
        providerName: 'test',
        modelName: 'test-model',
      };

      const output = await new ReviewAdvisorAgent({ llm }).run(makeInput());

      expect(output.data).toEqual({
        status: 'partial',
        warning: 'LLM analysis failed: Request timed out after 180000ms',
      });
      const data = (output.metadata as Record<string, unknown>)['data'] as Record<string, unknown>;
      expect((data['opinions'] as unknown[]).length).toBe(0);
    });

    it('[RAV-B7] should return partial when no LLM provider configured', async () => {
      const agent = new ReviewAdvisorAgent({ llm: undefined });
      const output = await agent.run(makeInput());

      expect(output.data).toEqual(
        expect.objectContaining({
          status: 'partial',
          warning: expect.stringContaining('LLM_API_KEY/LLM_MODEL not configured'),
        }),
      );

      // The EARS says "partial AND empty opinions". Without this the second half
      // was unasserted — a degradation that returned junk opinions stayed green.
      const data = (output.metadata as Record<string, unknown>)['data'] as Record<string, unknown>;
      expect(data['opinions']).toEqual([]);
    });
  });

  describe('4.3. FeedbackRecord Production (RAV-C1 to RAV-C2)', () => {
    it('[RAV-C1] should produce AgentOutput compatible with FeedbackRecord type suggestion', async () => {
      const llm = makeMockLlm(makeOpinionsJson([{}]));
      const agent = new ReviewAdvisorAgent({ llm });
      const output = await agent.run(makeInput());

      expect(output.metadata).toBeDefined();
      const metadata = output.metadata as Record<string, unknown>;
      expect(metadata['kind']).toBe('feedback-review');
      expect(output.message).toBeDefined();
      expect(typeof output.message).toBe('string');
    });

    it('[RAV-C2] should include finding fingerprints in FeedbackRecord references', async () => {
      const llm = makeMockLlm(makeOpinionsJson([
        { findingFingerprint: 'fp-001' },
        { findingFingerprint: 'fp-002' },
      ]));

      const agent = new ReviewAdvisorAgent({ llm });
      const output = await agent.run(makeInput({
        findings: [
          makeFinding({ fingerprint: 'fp-001' }),
          makeFinding({ fingerprint: 'fp-002' }),
        ],
      }));

      const data = (output.metadata as Record<string, unknown>)['data'] as Record<string, unknown>;
      const opinions = data['opinions'] as ReviewOpinion[];

      expect(opinions).toHaveLength(2);
      expect(opinions[0]!.findingFingerprint).toBe('fp-001');
      expect(opinions[1]!.findingFingerprint).toBe('fp-002');
    });

    it('[RAV-C2] should derive the fingerprint from the input when the LLM returns no JSON', async () => {
      // The assert above only proves pass-through: the mock WRITES fp-001 and the
      // test reads fp-001 back, so an agent that ignored `input.findings` entirely
      // would still pass. This one closes that hole — on the raw-text fallback the
      // fingerprint can only come from the INPUT, never from the response.
      const llm = makeMockLlm('The finding looks like a hardcoded credential.');

      const output = await new ReviewAdvisorAgent({ llm }).run(makeInput({
        findings: [makeFinding({ fingerprint: 'fp-from-input-only' })],
      }));

      const data = (output.metadata as Record<string, unknown>)['data'] as Record<string, unknown>;
      const opinions = data['opinions'] as ReviewOpinion[];

      expect(opinions).toHaveLength(1);
      expect(opinions[0]!.findingFingerprint).toBe('fp-from-input-only');
      expect(opinions[0]!.riskExplanation).toBe('The finding looks like a hardcoded credential.');
    });
  });

  describe('4.4. Entry Point y Error Handling (RAV-D2 to RAV-D3)', () => {
    it('[RAV-D3] should return empty opinions when findings array is empty', async () => {
      const llm = makeMockLlm('[]');
      const agent = new ReviewAdvisorAgent({ llm });
      const output = await agent.run(makeInput({ findings: [] }));

      const data = (output.metadata as Record<string, unknown>)['data'] as Record<string, unknown>;
      expect((data['opinions'] as unknown[]).length).toBe(0);
      expect(data['summary']).toBe('No findings to review');
    });
  });
});
