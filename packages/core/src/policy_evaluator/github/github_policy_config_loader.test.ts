/**
 * GitHubPolicyConfigLoader — 8 EARS (GPCL-A1 to B4)
 * Blueprint: github_policy_evaluator_module.md
 *
 * | EARS ID  | Test Case                                                              | Section |
 * |----------|------------------------------------------------------------------------|---------|
 * | GPCL-A1  | should fetch policy.yml from GitHub API and parse into PolicyConfig    | 4.1     |
 * | GPCL-A2  | should return default PolicyConfig when policy.yml does not exist      | 4.1     |
 * | GPCL-A3  | should return default PolicyConfig for empty YAML content              | 4.1     |
 * | GPCL-A4  | should use correct GitHub API path with basePath and ref               | 4.1     |
 * | GPCL-B1  | should parse waiverRequirements with role and minApprovals             | 4.2     |
 * | GPCL-B2  | should parse blockCategories and opa policies                          | 4.2     |
 * | GPCL-B3  | should throw when version field is missing                             | 4.2     |
 * | GPCL-B4  | should throw when waiverRequirement has invalid minApprovals           | 4.2     |
 */

import { GitHubPolicyConfigLoader } from './github_policy_config_loader';
import type { GitHubPolicyConfigLoaderOptions } from './github_policy_config_loader';

function makeFileResponse(content: string) {
  return {
    data: {
      type: 'file',
      content: Buffer.from(content).toString('base64'),
      sha: 'abc123',
    },
  };
}

function makeOctokit(yamlContent?: string | null) {
  const getContent = jest.fn();

  if (yamlContent === null) {
    const err = new Error('Not Found') as Error & { status: number };
    err.status = 404;
    getContent.mockRejectedValue(err);
  } else if (yamlContent !== undefined) {
    getContent.mockResolvedValue(makeFileResponse(yamlContent));
  }

  return {
    octokit: { rest: { repos: { getContent } } } as unknown as import('@octokit/rest').Octokit,
    getContent,
  };
}

const defaultOpts: GitHubPolicyConfigLoaderOptions = {
  owner: 'test-org',
  repo: 'test-repo',
  ref: 'gitgov-state',
};

describe('GitHubPolicyConfigLoader', () => {
  // ==========================================
  // 4.1. GitHub Contents API Loading (GPCL-A1 to A4)
  // ==========================================

  describe('4.1. GitHub Contents API Loading (GPCL-A1 to A4)', () => {
    it('[GPCL-A1] should fetch policy.yml from GitHub API and parse into PolicyConfig', async () => {
      const yaml = `
version: "1.0"
failOn: high
`;
      const { octokit } = makeOctokit(yaml);
      const loader = new GitHubPolicyConfigLoader(defaultOpts, octokit);

      const config = await loader.loadPolicyConfig();

      expect(config.failOn).toBe('high');
    });

    it('[GPCL-A2] should return default PolicyConfig when policy.yml does not exist', async () => {
      const { octokit } = makeOctokit(null);
      const loader = new GitHubPolicyConfigLoader(defaultOpts, octokit);

      const config = await loader.loadPolicyConfig();

      expect(config.failOn).toBe('critical');
      expect(config.waiverRequirements).toBeUndefined();
    });

    it('[GPCL-A3] should return default PolicyConfig for empty YAML content', async () => {
      const { octokit } = makeOctokit('');
      const loader = new GitHubPolicyConfigLoader(defaultOpts, octokit);

      const config = await loader.loadPolicyConfig();

      expect(config.failOn).toBe('critical');
    });

    it('[GPCL-A4] should use correct GitHub API path with basePath and ref', async () => {
      const { octokit, getContent } = makeOctokit(null);
      const loader = new GitHubPolicyConfigLoader(
        { owner: 'my-org', repo: 'my-repo', ref: 'main', basePath: '.custom' },
        octokit,
      );

      await loader.loadPolicyConfig();

      expect(getContent).toHaveBeenCalledWith({
        owner: 'my-org',
        repo: 'my-repo',
        path: '.custom/policy.yml',
        ref: 'main',
      });
    });
  });

  // ==========================================
  // 4.2. Validation (GPCL-B1 to B4)
  // ==========================================

  describe('4.2. Validation (GPCL-B1 to B4)', () => {
    it('[GPCL-B1] should parse waiverRequirements with role and minApprovals', async () => {
      const yaml = `
version: "1.0"
failOn: high
waiverRequirements:
  pii-email:
    role: ciso
    minApprovals: 1
  hardcoded-secret:
    role: security-lead
    minApprovals: 2
`;
      const { octokit } = makeOctokit(yaml);
      const loader = new GitHubPolicyConfigLoader(defaultOpts, octokit);

      const config = await loader.loadPolicyConfig();

      expect(config.waiverRequirements).toBeDefined();
      expect(config.waiverRequirements!['pii-email']).toEqual({ role: 'ciso', minApprovals: 1 });
      expect(config.waiverRequirements!['hardcoded-secret']).toEqual({ role: 'security-lead', minApprovals: 2 });
    });

    it('[GPCL-B2] should parse blockCategories and opa policies', async () => {
      const yaml = `
version: "1.0"
failOn: critical
blockCategories:
  - hardcoded-secret
  - pii-email
opa:
  policies:
    - policies/custom.rego
`;
      const { octokit } = makeOctokit(yaml);
      const loader = new GitHubPolicyConfigLoader(defaultOpts, octokit);

      const config = await loader.loadPolicyConfig();

      expect(config.blockCategories).toEqual(['hardcoded-secret', 'pii-email']);
      expect(config.opa).toEqual({ policies: ['policies/custom.rego'] });
    });

    it('[GPCL-B3] should throw when version field is missing', async () => {
      const yaml = `failOn: critical`;
      const { octokit } = makeOctokit(yaml);
      const loader = new GitHubPolicyConfigLoader(defaultOpts, octokit);

      await expect(loader.loadPolicyConfig()).rejects.toThrow('missing or invalid "version"');
    });

    it('[GPCL-B4] should throw when waiverRequirement has invalid minApprovals', async () => {
      const yaml = `
version: "1.0"
failOn: critical
waiverRequirements:
  pii-email:
    role: ciso
    minApprovals: 0
`;
      const { octokit } = makeOctokit(yaml);
      const loader = new GitHubPolicyConfigLoader(defaultOpts, octokit);

      await expect(loader.loadPolicyConfig()).rejects.toThrow('Invalid waiverRequirement');
    });
  });
});
