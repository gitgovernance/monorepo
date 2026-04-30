import type { Octokit } from '@octokit/rest';
import type { ICiReporter, PrContext, RepoContext, CheckInfo } from '../ci_reporter';
import { DEFAULT_GATE_MARKER } from '../ci_reporter';

export class GitHubCiReporter implements ICiReporter {
  // [CIREP-B1]
  constructor(private readonly octokit: Octokit) {}

  // [CIREP-B4] Convenience factory — consumer passes token string, SDK stays encapsulated
  static async fromToken(token: string): Promise<GitHubCiReporter> {
    const { Octokit: OctokitClass } = await import('@octokit/rest');
    return new GitHubCiReporter(new OctokitClass({ auth: token }) as unknown as Octokit);
  }

  // [CIREP-A1] [CIREP-A2] [CIREP-A3] [CIREP-A4]
  async postOrUpdateComment(markdown: string, context: PrContext, marker?: string): Promise<void> {
    // [CIREP-A4]
    if (!markdown) return;

    // [CIREP-A3]
    const effectiveMarker = marker ?? DEFAULT_GATE_MARKER;
    const body = `${effectiveMarker}\n${markdown}`;

    try {
      // [CIREP-B2] [CIREP-B3]
      let existingCommentId: number | undefined;

      try {
        const { data: comments } = await this.octokit.rest.issues.listComments({
          owner: context.owner,
          repo: context.repo,
          issue_number: context.prNumber,
        });
        const existing = comments.find((c: { body?: string }) =>
          c.body?.includes(effectiveMarker),
        );
        if (existing) {
          existingCommentId = existing.id;
        }
      } catch {
        // [CIREP-C2] List failed — fall back to create
      }

      if (existingCommentId) {
        // [CIREP-A2]
        await this.octokit.rest.issues.updateComment({
          owner: context.owner,
          repo: context.repo,
          comment_id: existingCommentId,
          body,
        });
      } else {
        // [CIREP-A1]
        await this.octokit.rest.issues.createComment({
          owner: context.owner,
          repo: context.repo,
          issue_number: context.prNumber,
          body,
        });
      }
    } catch (error) {
      // [CIREP-C1]
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`⚠ Failed to post PR comment: ${msg}`);
    }
  }

  // [CIREP-D1] Create Check Run in_progress — two-step lifecycle
  async startCheckRun(
    sha: string,
    name: string,
    context: RepoContext,
  ): Promise<CheckInfo> {
    const { data } = await this.octokit.rest.checks.create({
      owner: context.owner,
      repo: context.repo,
      name,
      head_sha: sha,
      status: 'in_progress',
    });
    const result: CheckInfo = { id: data.id, conclusion: 'pass' };
    if (data.html_url) result.url = data.html_url;
    return result;
  }

  async createCheckStatus(
    sha: string,
    conclusion: 'pass' | 'fail',
    summary: string,
    context: RepoContext,
  ): Promise<CheckInfo> {
    const { data } = await this.octokit.rest.checks.create({
      owner: context.owner,
      repo: context.repo,
      name: 'GitGov Gate',
      head_sha: sha,
      status: 'completed',
      conclusion: conclusion === 'pass' ? 'success' : 'failure',
      output: { title: 'GitGov Gate', summary },
    });
    const result: CheckInfo = { id: data.id, conclusion };
    if (data.html_url) result.url = data.html_url;
    return result;
  }
}
