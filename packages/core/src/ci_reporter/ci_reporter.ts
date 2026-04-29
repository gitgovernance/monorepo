// [CIREP-B3] PR context for targeting comments
export type PrContext = {
  owner: string;
  repo: string;
  prNumber: number;
};

// [CIREP-B3] Repo context for check status
export type RepoContext = {
  owner: string;
  repo: string;
};

export type CheckInfo = {
  id: number;
  conclusion: 'pass' | 'fail';
  url?: string;
};

// [CIREP-A3] Default marker for idempotent PR comments
export const DEFAULT_GATE_MARKER = '<!-- gitgov-gate -->';

// [CIREP-A1] [CIREP-A2] [CIREP-A3] [CIREP-A4] [CIREP-B1] [CIREP-B2] [CIREP-B3] [CIREP-C1] [CIREP-C2]
export interface ICiReporter {
  // [CIREP-A1] POST new comment / [CIREP-A2] PATCH existing / [CIREP-A3] default marker / [CIREP-A4] skip empty
  postOrUpdateComment(markdown: string, context: PrContext, marker?: string): Promise<void>;
  // [CIREP-C1] API errors non-blocking
  createCheckStatus?(sha: string, conclusion: 'pass' | 'fail', summary: string, context: RepoContext): Promise<CheckInfo>;
  postInlineSuggestion?(file: string, line: number, suggestion: string, context: PrContext): Promise<void>;
}
