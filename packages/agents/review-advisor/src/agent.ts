// All EARS prefixes map to review_advisor_agent.md

import type {
  ReviewAdvisorInput,
  ReviewAdvisorAgentDeps,
  ReviewResult,
  ReviewOpinion,
  ReviewAdvisorMetadata,
  LlmProvider,
} from './types';

/**
 * AgentOutput from the framework (Runner namespace).
 * Defined locally to avoid deep namespace import — shape is stable.
 */
type AgentOutput = {
  data?: unknown;
  message?: string;
  artifacts?: string[];
  metadata?: Record<string, unknown>;
};

/**
 * Agente de review semantico (G18 — provider-agnostic).
 *
 * Analiza findings con LLM y produce opiniones contextuales.
 * No detecta findings — los recibe del scanner. Solo opina.
 * No aprueba waivers — solo genera opiniones.
 * AgentRunner firma el FeedbackRecord automaticamente (EARS-L1).
 */
export class ReviewAdvisorAgent {
  private readonly llm: LlmProvider | undefined;

  constructor(deps: ReviewAdvisorAgentDeps) {
    this.llm = deps.llm;
  }

  // [RAV-A4, RAV-C1] Return AgentOutput with feedback-review metadata
  async run(input: ReviewAdvisorInput): Promise<AgentOutput> {
    // [RAV-D3] Empty findings → return immediately
    if (!input.findings || input.findings.length === 0) {
      return this.buildOutput({
        opinions: [],
        summary: 'No findings to review',
        model: 'none',
      });
    }

    // [RAV-B7] No LLM provider → return partial with warning
    if (!this.llm) {
      return this.buildPartialOutput('LLM_API_KEY/LLM_MODEL not configured — review skipped');
    }

    // [RAV-B1] Build analysis context with findings + policy decision
    const opinions: ReviewOpinion[] = [];

    try {
      const prompt = this.buildPrompt(input.findings, input.policyDecision);

      // [RAV-B2] [RAV-B2b] Query LLM (provider-agnostic)
      const response = await this.llm.query([
        { role: 'system', content: 'You are a security compliance reviewer. Analyze each finding and respond with a JSON array of ReviewOpinion objects. Each opinion must have: findingFingerprint, riskExplanation, regulations (array of strings like "GDPR Art. 44"), remediationAdvice, confidence ("high"|"medium"|"low"), isFalsePositive (boolean), and optionally falsePositiveReason.' },
        { role: 'user', content: prompt },
      ]);

      // [RAV-B3] Parse response into ReviewOpinion[]
      try {
        const parsed: unknown = JSON.parse(response.content);
        if (Array.isArray(parsed)) {
          for (const item of parsed as Record<string, unknown>[]) {
            opinions.push({
              findingFingerprint: (item['findingFingerprint'] as string) ?? '',
              riskExplanation: (item['riskExplanation'] as string) ?? '',
              regulations: Array.isArray(item['regulations']) ? item['regulations'] as string[] : [],
              remediationAdvice: (item['remediationAdvice'] as string) ?? '',
              confidence: (item['confidence'] as ReviewOpinion['confidence']) ?? 'medium',
              isFalsePositive: item['isFalsePositive'] === true,
              // [RAV-B4] False positive with reason
              ...(item['isFalsePositive'] && item['falsePositiveReason']
                ? { falsePositiveReason: item['falsePositiveReason'] as string }
                : {}),
            });
          }
        }
      } catch {
        // Response not parseable as JSON — treat as raw text opinion
        opinions.push({
          findingFingerprint: input.findings[0]?.fingerprint ?? 'unknown',
          riskExplanation: response.content,
          regulations: [],
          remediationAdvice: '',
          confidence: 'low',
          isFalsePositive: false,
        });
      }
    } catch (err) {
      // [RAV-B5] LLM failure → return partial with empty opinions
      const message = err instanceof Error ? err.message : String(err);
      return this.buildPartialOutput(`LLM analysis failed: ${message}`);
    }

    // [RAV-C2] Include finding fingerprints in result
    const reviewedFingerprints = opinions.map(o => o.findingFingerprint);

    const result: ReviewResult = {
      opinions,
      summary: `Reviewed ${opinions.length} finding(s). ${reviewedFingerprints.length} opinions generated.`,
      model: this.llm.modelName,
    };

    return this.buildOutput(result);
  }

  // [RAV-A4] Build AgentOutput with feedback-review metadata
  private buildOutput(result: ReviewResult): AgentOutput {
    const metadata: ReviewAdvisorMetadata = {
      kind: 'feedback-review',
      data: result,
    };

    return {
      message: result.summary,
      metadata: metadata as unknown as Record<string, unknown>,
    };
  }

  // [RAV-B5, RAV-B7] Build partial output for graceful degradation
  private buildPartialOutput(warning: string): AgentOutput {
    const result: ReviewResult = {
      opinions: [],
      summary: warning,
      model: 'none',
    };

    const metadata: ReviewAdvisorMetadata = {
      kind: 'feedback-review',
      data: result,
    };

    return {
      message: warning,
      data: { status: 'partial', warning },
      metadata: metadata as unknown as Record<string, unknown>,
    };
  }

  // [RAV-B1] Build prompt with finding details + policy decision
  private buildPrompt(
    findings: ReviewAdvisorInput['findings'],
    policyDecision: ReviewAdvisorInput['policyDecision'],
  ): string {
    const findingsList = findings.map((f, i) =>
      `Finding ${i + 1}:\n  Fingerprint: ${f.fingerprint}\n  Severity: ${f.severity}\n  Category: ${f.category}\n  File: ${f.file}:${f.line}\n  Message: ${f.message}${f.snippet ? `\n  Snippet: ${f.snippet}` : ''}`
    ).join('\n\n');

    return `Review these security findings and provide your analysis as a JSON array of ReviewOpinion objects.\n\nPolicy Decision: ${policyDecision.decision} (${policyDecision.reason})\n\nFindings:\n${findingsList}\n\nRespond ONLY with a valid JSON array.`;
  }
}
