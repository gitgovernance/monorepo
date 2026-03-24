/**
 * ReviewAdvisorAgent Tests
 *
 * Unit tests for the review-advisor agent implementation.
 * All Claude SDK calls are mocked via analyzer override.
 *
 * Reference: review_advisor_agent.md §4.1-4.3
 */

import { ReviewAdvisorAgent } from './src/agent';
import type { ClaudeAnalyzer } from './src/agent';
import type { ReviewAdvisorInput, ReviewOpinion } from './src/types';
import type { AuditOrchestrator } from '@gitgov/core';

// ============================================================================
// Test helpers
// ============================================================================

function makeFinding(overrides: Partial<AuditOrchestrator.ConsolidatedFinding> = {}): AuditOrchestrator.ConsolidatedFinding {
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

function makePolicyDecision(decision: 'pass' | 'block' = 'block'): AuditOrchestrator.PolicyDecision {
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

function makeOpinion(overrides: Partial<ReviewOpinion> = {}): ReviewOpinion {
  return {
    findingFingerprint: 'fp-test-001',
    riskExplanation: 'Hardcoded API key can be extracted from source',
    regulations: ['PCI-DSS Req 6.5.3'],
    remediationAdvice: 'Use environment variables or secret management',
    confidence: 'high',
    isFalsePositive: false,
    ...overrides,
  };
}

function mockAnalyzer(opinions: ReviewOpinion[]): ClaudeAnalyzer {
  return jest.fn().mockResolvedValue(opinions);
}

// ============================================================================
// Tests
// ============================================================================

describe('ReviewAdvisorAgent', () => {
  describe('4.1. Package y Estructura (RAV-A3 to RAV-A4)', () => {
    it('[RAV-A3] should require findings and taskId in ReviewAdvisorInput', async () => {
      const input = makeInput();

      // Verify input has required fields
      expect(input.findings).toBeDefined();
      expect(Array.isArray(input.findings)).toBe(true);
      expect(input.taskId).toBe('task-test-001');

      const agent = new ReviewAdvisorAgent({
        anthropicApiKey: 'test-key',
        analyzer: mockAnalyzer([makeOpinion()]),
      });

      const output = await agent.run(input);
      expect(output).toBeDefined();
    });

    it('[RAV-A4] should return metadata.kind feedback-review and metadata.data as ReviewResult', async () => {
      const agent = new ReviewAdvisorAgent({
        anthropicApiKey: 'test-key',
        analyzer: mockAnalyzer([makeOpinion()]),
      });

      const output = await agent.run(makeInput());

      const metadata = output.metadata as Record<string, unknown>;
      expect(metadata['kind']).toBe('feedback-review');
      expect(metadata['data']).toBeDefined();

      const data = metadata['data'] as Record<string, unknown>;
      expect(data['opinions']).toBeDefined();
      expect(data['summary']).toBeDefined();
      expect(data['model']).toBe('claude-sonnet-4');
    });
  });

  describe('4.2. Claude Analysis (RAV-B1 to RAV-B5)', () => {
    it('[RAV-B1] should build prompt with finding details, file context, and policy decision', async () => {
      const analyzerFn = jest.fn().mockResolvedValue([makeOpinion()]);

      const agent = new ReviewAdvisorAgent({
        anthropicApiKey: 'test-key',
        analyzer: analyzerFn,
      });

      const input = makeInput({
        findings: [makeFinding({ file: 'checkout.ts', line: 47, category: 'data-transfer' })],
        policyDecision: makePolicyDecision('block'),
      });

      await agent.run(input);

      // Verify analyzer received findings and policy decision
      expect(analyzerFn).toHaveBeenCalledWith(
        input.findings,
        input.policyDecision,
      );
    });

    it('[RAV-B2] should call Claude Agent SDK query with Read tool enabled', async () => {
      // This test verifies the analyzer is called — real SDK test is in integration
      const analyzerFn = jest.fn().mockResolvedValue([makeOpinion()]);

      const agent = new ReviewAdvisorAgent({
        anthropicApiKey: 'test-key',
        analyzer: analyzerFn,
      });

      await agent.run(makeInput());

      expect(analyzerFn).toHaveBeenCalledTimes(1);
    });

    it('[RAV-B3] should parse Claude response into ReviewOpinion with risk, regulations, and confidence', async () => {
      const opinion = makeOpinion({
        riskExplanation: 'GDPR Art. 44 violation — PII sent to third party',
        regulations: ['GDPR Art. 44', 'GDPR Art. 6'],
        confidence: 'high',
      });

      const agent = new ReviewAdvisorAgent({
        anthropicApiKey: 'test-key',
        analyzer: mockAnalyzer([opinion]),
      });

      const output = await agent.run(makeInput());
      const data = (output.metadata as Record<string, unknown>)['data'] as Record<string, unknown>;
      const opinions = data['opinions'] as ReviewOpinion[];

      expect(opinions).toHaveLength(1);
      expect(opinions[0]!.riskExplanation).toBe('GDPR Art. 44 violation — PII sent to third party');
      expect(opinions[0]!.regulations).toEqual(['GDPR Art. 44', 'GDPR Art. 6']);
      expect(opinions[0]!.confidence).toBe('high');
    });

    it('[RAV-B4] should set isFalsePositive true with reason when Claude identifies false positive', async () => {
      const opinion = makeOpinion({
        isFalsePositive: true,
        falsePositiveReason: 'This is a test fixture, not production code',
      });

      const agent = new ReviewAdvisorAgent({
        anthropicApiKey: 'test-key',
        analyzer: mockAnalyzer([opinion]),
      });

      const output = await agent.run(makeInput());
      const data = (output.metadata as Record<string, unknown>)['data'] as Record<string, unknown>;
      const opinions = data['opinions'] as ReviewOpinion[];

      expect(opinions[0]!.isFalsePositive).toBe(true);
      expect(opinions[0]!.falsePositiveReason).toBe('This is a test fixture, not production code');
    });

    it('[RAV-B5] should return status partial with empty opinions when Claude fails', async () => {
      const failingAnalyzer: ClaudeAnalyzer = jest.fn().mockRejectedValue(
        new Error('Claude API unavailable'),
      );

      const agent = new ReviewAdvisorAgent({
        anthropicApiKey: 'test-key',
        analyzer: failingAnalyzer,
      });

      const output = await agent.run(makeInput());

      // Should not throw — graceful degradation
      expect(output.data).toEqual({
        status: 'partial',
        warning: 'Claude analysis failed: Claude API unavailable',
      });

      const data = (output.metadata as Record<string, unknown>)['data'] as Record<string, unknown>;
      const opinions = data['opinions'] as ReviewOpinion[];
      expect(opinions).toHaveLength(0);
    });
  });

  describe('4.3. FeedbackRecord Production (RAV-C1 to RAV-C2)', () => {
    it('[RAV-C1] should produce AgentOutput compatible with FeedbackRecord type suggestion', async () => {
      const agent = new ReviewAdvisorAgent({
        anthropicApiKey: 'test-key',
        analyzer: mockAnalyzer([makeOpinion()]),
      });

      const output = await agent.run(makeInput());

      // AgentOutput must have metadata that AgentRunner can persist as FeedbackRecord
      expect(output.metadata).toBeDefined();
      const metadata = output.metadata as Record<string, unknown>;
      expect(metadata['kind']).toBe('feedback-review');
      expect(metadata['data']).toBeDefined();
      expect(output.message).toBeDefined();
      expect(typeof output.message).toBe('string');
    });

    it('[RAV-C2] should include finding fingerprints in FeedbackRecord references', async () => {
      const opinions = [
        makeOpinion({ findingFingerprint: 'fp-001' }),
        makeOpinion({ findingFingerprint: 'fp-002' }),
      ];

      const agent = new ReviewAdvisorAgent({
        anthropicApiKey: 'test-key',
        analyzer: mockAnalyzer(opinions),
      });

      const output = await agent.run(makeInput({
        findings: [
          makeFinding({ fingerprint: 'fp-001' }),
          makeFinding({ fingerprint: 'fp-002' }),
        ],
      }));

      const data = (output.metadata as Record<string, unknown>)['data'] as Record<string, unknown>;
      const resultOpinions = data['opinions'] as ReviewOpinion[];

      expect(resultOpinions).toHaveLength(2);
      expect(resultOpinions[0]!.findingFingerprint).toBe('fp-001');
      expect(resultOpinions[1]!.findingFingerprint).toBe('fp-002');
    });
  });

  describe('4.4. Entry Point y Error Handling (RAV-D2 to RAV-D3)', () => {
    it('[RAV-D2] should return status partial when ANTHROPIC_API_KEY is not set', async () => {
      const agent = new ReviewAdvisorAgent({ anthropicApiKey: undefined });

      const output = await agent.run(makeInput());

      expect(output.data).toEqual(
        expect.objectContaining({
          status: 'partial',
          warning: expect.stringContaining('ANTHROPIC_API_KEY'),
        }),
      );
    });

    it('[RAV-D3] should return empty opinions when findings array is empty', async () => {
      const agent = new ReviewAdvisorAgent({ anthropicApiKey: 'test-key' });

      const output = await agent.run(makeInput({ findings: [] }));

      const data = (output.metadata as Record<string, unknown>)['data'] as Record<string, unknown>;
      const opinions = data['opinions'] as unknown[];
      expect(opinions).toHaveLength(0);
      expect(data['summary']).toBe('No findings to review');
    });
  });
});
