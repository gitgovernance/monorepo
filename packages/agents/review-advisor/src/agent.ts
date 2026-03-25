// All EARS prefixes map to review_advisor_agent.md

import type {
  ReviewAdvisorInput,
  ReviewAdvisorAgentDeps,
  ReviewResult,
  ReviewOpinion,
  ReviewAdvisorMetadata,
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
 * Interface for the Claude analysis function.
 * Abstracted for testability — real impl uses Claude Agent SDK.
 */
export type ClaudeAnalyzer = (
  findings: ReviewAdvisorInput['findings'],
  policyDecision: ReviewAdvisorInput['policyDecision'],
) => Promise<ReviewOpinion[]>;

/**
 * Agente de review semantico.
 *
 * Analiza findings con Claude y produce opiniones contextuales.
 * No detecta findings — los recibe del scanner. Solo opina.
 * No aprueba waivers — solo genera opiniones.
 * AgentRunner firma el FeedbackRecord automaticamente (EARS-L1).
 */
export class ReviewAdvisorAgent {
  private readonly apiKey: string | undefined;
  private readonly analyzerOverride: ClaudeAnalyzer | undefined;

  constructor(deps: ReviewAdvisorAgentDeps & { analyzer?: ClaudeAnalyzer }) {
    this.apiKey = deps.anthropicApiKey;
    this.analyzerOverride = deps.analyzer;
  }

  // [RAV-A4, RAV-C1] Return AgentOutput with feedback-review metadata
  async run(input: ReviewAdvisorInput): Promise<AgentOutput> {
    // [RAV-D3] Empty findings → return immediately without calling Claude
    if (!input.findings || input.findings.length === 0) {
      return this.buildOutput({
        opinions: [],
        summary: 'No findings to review',
        model: 'none',
      });
    }

    // [RAV-D2] No API key → return partial with warning
    if (!this.apiKey && !this.analyzerOverride) {
      return this.buildPartialOutput('ANTHROPIC_API_KEY not set — review skipped');
    }

    // [RAV-B1] Build analysis context with findings + policy decision
    const opinions: ReviewOpinion[] = [];

    try {
      // [RAV-B2] Call Claude (or mock analyzer for tests)
      const analyzer = this.analyzerOverride ?? this.createClaudeAnalyzer();
      const results = await analyzer(input.findings, input.policyDecision);

      // [RAV-B3] Parse response into ReviewOpinion[]
      for (const opinion of results) {
        opinions.push(opinion);
      }
    } catch (err) {
      // [RAV-B5] Claude failure → return partial with empty opinions
      const message = err instanceof Error ? err.message : String(err);
      return this.buildPartialOutput(`Claude analysis failed: ${message}`);
    }

    // [RAV-C2] Include finding fingerprints in result
    const reviewedFingerprints = opinions.map(o => o.findingFingerprint);

    const result: ReviewResult = {
      opinions,
      summary: `Reviewed ${opinions.length} finding(s). ${reviewedFingerprints.length} opinions generated.`,
      model: 'claude-sonnet-4',
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

  // [RAV-B5, RAV-D2] Build partial output for graceful degradation
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

  // [RAV-B2] Create real Claude analyzer using Agent SDK
  private createClaudeAnalyzer(): ClaudeAnalyzer {
    return async (findings, policyDecision) => {
      // Dynamic import to avoid bundling SDK when not used
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      const prompt = this.buildPrompt(findings, policyDecision);

      const opinions: ReviewOpinion[] = [];

      const systemPrompt = `You are a security compliance reviewer. Analyze each finding and respond with a JSON array of ReviewOpinion objects. Each opinion must have: findingFingerprint, riskExplanation, regulations (array of strings like "GDPR Art. 44"), remediationAdvice, confidence ("high"|"medium"|"low"), isFalsePositive (boolean), and optionally falsePositiveReason.`;

      // [RAV-B2] Query Claude with Read tool enabled for file context
      // SDK uses ANTHROPIC_API_KEY from environment automatically
      for await (const message of query({
        prompt,
        options: {
          model: 'claude-sonnet-4-20250514',
          systemPrompt,
          // [RAV-B2] Enable Read tool so Claude can access repo files for context
          tools: ['Read'],
          permissionMode: 'default',
        },
      }) as AsyncIterable<unknown>) {
        const msg = message as Record<string, unknown>;
        if (msg['type'] === 'assistant') {
          try {
            // Extract text content from message (SDK format varies)
            const content = msg['content'];
            const text = typeof content === 'string'
              ? content
              : Array.isArray(content)
                ? (content as Array<Record<string, unknown>>).map(b => b['text'] ?? '').join('')
                : '';
            if (!text) continue;

            const parsed: unknown = JSON.parse(text);
            if (Array.isArray(parsed)) {
              for (const item of parsed as Record<string, unknown>[]) {
                // [RAV-B3] Parse into ReviewOpinion
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
            // Not parseable JSON — skip
          }
        }
      }

      return opinions;
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
