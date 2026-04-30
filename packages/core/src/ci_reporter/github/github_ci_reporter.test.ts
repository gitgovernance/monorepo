jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    rest: {
      issues: { listComments: jest.fn().mockResolvedValue({ data: [] }), createComment: jest.fn().mockResolvedValue({}), updateComment: jest.fn().mockResolvedValue({}) },
      checks: { create: jest.fn().mockResolvedValue({ data: { id: 1 } }) },
    },
  })),
}));

import { GitHubCiReporter } from './github_ci_reporter';
import { DEFAULT_GATE_MARKER } from '../ci_reporter';
import type { Octokit } from '@octokit/rest';
import type { PrContext } from '../ci_reporter';

type MockComment = { id: number; body?: string };

function createMockOctokit(comments: MockComment[] = []) {
  return {
    rest: {
      issues: {
        listComments: jest.fn().mockResolvedValue({ data: comments }),
        createComment: jest.fn().mockResolvedValue({ data: { id: 1 } }),
        updateComment: jest.fn().mockResolvedValue({ data: { id: 1 } }),
      },
      checks: {
        create: jest.fn().mockResolvedValue({ data: { id: 1, html_url: 'https://github.com/check/1' } }),
      },
    },
  };
}

const PR_CONTEXT: PrContext = { owner: 'myorg', repo: 'myrepo', prNumber: 42 };

describe('GitHubCiReporter', () => {
  describe('4.1. Comment Posting (CIREP-A1 to A4)', () => {
    it('[CIREP-A1] should create new comment with marker when none exists', async () => {
      const octokit = createMockOctokit([]);
      const reporter = new GitHubCiReporter(octokit as unknown as Octokit);

      await reporter.postOrUpdateComment('## Findings', PR_CONTEXT);

      expect(octokit.rest.issues.createComment).toHaveBeenCalledWith({
        owner: 'myorg',
        repo: 'myrepo',
        issue_number: 42,
        body: expect.stringContaining('## Findings'),
      });
      expect(octokit.rest.issues.updateComment).not.toHaveBeenCalled();
    });

    it('[CIREP-A2] should update existing comment when marker found', async () => {
      const octokit = createMockOctokit([
        { id: 99, body: `${DEFAULT_GATE_MARKER}\nold content` },
      ]);
      const reporter = new GitHubCiReporter(octokit as unknown as Octokit);

      await reporter.postOrUpdateComment('## New Findings', PR_CONTEXT);

      expect(octokit.rest.issues.updateComment).toHaveBeenCalledWith({
        owner: 'myorg',
        repo: 'myrepo',
        comment_id: 99,
        body: expect.stringContaining('## New Findings'),
      });
      expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
    });

    it('[CIREP-A3] should use default marker when none provided', async () => {
      const octokit = createMockOctokit([]);
      const reporter = new GitHubCiReporter(octokit as unknown as Octokit);

      await reporter.postOrUpdateComment('content', PR_CONTEXT);

      expect(octokit.rest.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining(DEFAULT_GATE_MARKER),
        }),
      );
    });

    it('[CIREP-A4] should not post when markdown is empty', async () => {
      const octokit = createMockOctokit();
      const reporter = new GitHubCiReporter(octokit as unknown as Octokit);

      await reporter.postOrUpdateComment('', PR_CONTEXT);

      expect(octokit.rest.issues.listComments).not.toHaveBeenCalled();
      expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
    });
  });

  describe('4.2. GitHub API Integration (CIREP-B1 to B4)', () => {
    it('[CIREP-B1] should use injected Octokit for API calls', async () => {
      const octokit = createMockOctokit([]);
      const reporter = new GitHubCiReporter(octokit as unknown as Octokit);

      await reporter.postOrUpdateComment('test', PR_CONTEXT);

      expect(octokit.rest.issues.listComments).toHaveBeenCalled();
      expect(octokit.rest.issues.createComment).toHaveBeenCalled();
    });

    it('[CIREP-B2] should search for marker in existing comment bodies', async () => {
      const customMarker = '<!-- custom-marker -->';
      const octokit = createMockOctokit([
        { id: 10, body: 'unrelated comment' },
        { id: 20, body: `${customMarker}\nold` },
      ]);
      const reporter = new GitHubCiReporter(octokit as unknown as Octokit);

      await reporter.postOrUpdateComment('new', PR_CONTEXT, customMarker);

      expect(octokit.rest.issues.updateComment).toHaveBeenCalledWith(
        expect.objectContaining({ comment_id: 20 }),
      );
    });

    it('[CIREP-B3] should target correct PR using context owner/repo/prNumber', async () => {
      const octokit = createMockOctokit([]);
      const reporter = new GitHubCiReporter(octokit as unknown as Octokit);
      const ctx: PrContext = { owner: 'acme', repo: 'api', prNumber: 7 };

      await reporter.postOrUpdateComment('test', ctx);

      expect(octokit.rest.issues.listComments).toHaveBeenCalledWith({
        owner: 'acme', repo: 'api', issue_number: 7,
      });
      expect(octokit.rest.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({ owner: 'acme', repo: 'api', issue_number: 7 }),
      );
    });

    it('[CIREP-B4] should create instance from token without exposing Octokit to consumer', async () => {
      const reporter = await GitHubCiReporter.fromToken('ghp_test123');

      expect(reporter).toBeInstanceOf(GitHubCiReporter);
      expect(reporter.postOrUpdateComment).toBeDefined();
    });
  });

  describe('4.3. Error Handling (CIREP-C1 to C2)', () => {
    it('[CIREP-C1] should warn on API error without throwing', async () => {
      const octokit = createMockOctokit([]);
      octokit.rest.issues.createComment.mockRejectedValueOnce(new Error('403 Forbidden'));
      const reporter = new GitHubCiReporter(octokit as unknown as Octokit);
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await reporter.postOrUpdateComment('test', PR_CONTEXT);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('403 Forbidden'));
      warnSpy.mockRestore();
    });

    it('[CIREP-C2] should fallback to create when list comments fails', async () => {
      const octokit = createMockOctokit([]);
      octokit.rest.issues.listComments.mockRejectedValueOnce(new Error('Network error'));
      const reporter = new GitHubCiReporter(octokit as unknown as Octokit);

      await reporter.postOrUpdateComment('test', PR_CONTEXT);

      expect(octokit.rest.issues.createComment).toHaveBeenCalled();
    });
  });

  describe('4.4. Check Run Lifecycle (CIREP-D1)', () => {
    it('[CIREP-D1] should create check run with in_progress status and return id', async () => {
      const octokit = createMockOctokit();
      const reporter = new GitHubCiReporter(octokit as unknown as Octokit);

      const result = await reporter.startCheckRun('abc123', 'GitGov Audit', { owner: 'myorg', repo: 'myrepo' });

      expect(octokit.rest.checks.create).toHaveBeenCalledWith({
        owner: 'myorg',
        repo: 'myrepo',
        name: 'GitGov Audit',
        head_sha: 'abc123',
        status: 'in_progress',
      });
      expect(result.id).toBe(1);
      expect(result.url).toBe('https://github.com/check/1');
    });
  });
});
