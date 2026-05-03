/**
 * ReviewAdvisorAgent Tests — G18 Provider-Agnostic
 *
 * Unit tests for the review-advisor agent implementation.
 * LLM calls are mocked via ILlmProvider mock (not ClaudeAnalyzer).
 *
 * Reference: review_advisor_agent.md §4.1-4.3
 */

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
    reportedBy: ['agent:security-audit'],
    isWaived: false,
    ...overrides,
  };
}

function makePolicyDecision(decision: 'pass' | 'block' = 'block'): PolicyDecision {
  return {
    decision,
    reason: decision === 'block' ? 'Critical findings present' : 'No blocking findings',
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
      const input = makeInput();
      expect(input.findings).toBeDefined();
      expect(Array.isArray(input.findings)).toBe(true);
      expect(input.taskId).toBe('task-test-001');

      const llm = makeMockLlm(makeOpinionsJson([{}]));
      const agent = new ReviewAdvisorAgent({ llm });
      const output = await agent.run(input);
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

      // [RAV-B2] Verify LLM was called with messages containing findings
      expect(llm.query).toHaveBeenCalledTimes(1);
      const callArgs = (llm.query as jest.Mock).mock.calls[0][0] as Array<{ role: string; content: string }>;
      const userMsg = callArgs.find(m => m.role === 'user');
      expect(userMsg?.content).toContain('checkout.ts');
      expect(userMsg?.content).toContain('block');
    });

    it('[RAV-B2] should call LLM query with system + user messages', async () => {
      const llm = makeMockLlm(makeOpinionsJson([{}]));
      const agent = new ReviewAdvisorAgent({ llm });
      await agent.run(makeInput());

      const callArgs = (llm.query as jest.Mock).mock.calls[0][0] as Array<{ role: string; content: string }>;
      expect(callArgs.find(m => m.role === 'system')).toBeDefined();
      expect(callArgs.find(m => m.role === 'user')).toBeDefined();
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

    it('[RAV-B7] should return partial when no LLM provider configured', async () => {
      const agent = new ReviewAdvisorAgent({ llm: undefined });
      const output = await agent.run(makeInput());

      expect(output.data).toEqual(
        expect.objectContaining({
          status: 'partial',
          warning: expect.stringContaining('LLM_API_KEY/LLM_MODEL not configured'),
        }),
      );
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
