/**
 * GitHubPolicyConfigLoader — GitHub Contents API implementation of PolicyConfigLoader.
 *
 * Reads .gitgov/policy.yml from a GitHub repository via Octokit,
 * parses YAML, validates, and returns PolicyConfig.
 *
 * Same validation logic as FsPolicyConfigLoader but reads from GitHub API
 * instead of filesystem. Used by SaaS environments.
 */

import type { Octokit } from '@octokit/rest';
import * as yaml from 'js-yaml';
import type {
  PolicyConfig,
  PolicyConfigFile,
  PolicyConfigLoader,
  FindingSeverity,
} from '../policy_evaluator.types';
import { isOctokitRequestError, mapOctokitError } from '../../github';

const VALID_SEVERITIES = new Set<string>(['critical', 'high', 'medium', 'low']);

const DEFAULT_CONFIG: PolicyConfig = {
  failOn: 'critical',
};

export type GitHubPolicyConfigLoaderOptions = {
  owner: string;
  repo: string;
  /** Branch to read from (default: 'gitgov-state') */
  ref?: string;
  /** Base path within repo (default: '.gitgov') */
  basePath?: string;
};

export class GitHubPolicyConfigLoader implements PolicyConfigLoader {
  private readonly owner: string;
  private readonly repo: string;
  private readonly ref: string;
  private readonly basePath: string;
  private readonly octokit: Octokit;

  constructor(options: GitHubPolicyConfigLoaderOptions, octokit: Octokit) {
    this.owner = options.owner;
    this.repo = options.repo;
    this.ref = options.ref ?? 'gitgov-state';
    this.basePath = options.basePath ?? '.gitgov';
    this.octokit = octokit;
  }

  /**
   * Load policy configuration from GitHub Contents API.
   * Returns default config (failOn: "critical") when policy.yml is absent.
   */
  // [GPCL-A1] Fetch policy.yml from GitHub API and parse into PolicyConfig
  // [GPCL-A4] Uses configured owner, repo, ref, basePath
  async loadPolicyConfig(): Promise<PolicyConfig> {
    const path = `${this.basePath}/policy.yml`;

    let content: string;
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref: this.ref,
      });

      // [GPCL-A3] Non-file content → default
      if (Array.isArray(data) || data.type !== 'file' || !data.content) {
        return { ...DEFAULT_CONFIG };
      }

      content = Buffer.from(data.content, 'base64').toString('utf-8');
    } catch (error: unknown) {
      // [GPCL-A2] 404 → default config (fail-safe)
      if (isOctokitRequestError(error) && error.status === 404) {
        return { ...DEFAULT_CONFIG };
      }
      throw mapOctokitError(error, `loadPolicyConfig ${this.owner}/${this.repo}/${path}`);
    }

    // Parse YAML — same logic as FsPolicyConfigLoader
    let parsed: PolicyConfigFile | undefined;
    try {
      parsed = yaml.load(content) as PolicyConfigFile | undefined;
    } catch {
      // [GPCL-A3] Malformed YAML syntax — return default config (fail-safe)
      return { ...DEFAULT_CONFIG };
    }

    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_CONFIG };
    }

    // [GPCL-B3] Missing version → throw
    if (typeof parsed.version !== 'string') {
      throw new Error('policy.yml: missing or invalid "version" field');
    }

    if (!VALID_SEVERITIES.has(parsed.failOn)) {
      throw new Error(
        `Invalid failOn value "${String(parsed.failOn)}" in policy.yml. Must be one of: critical, high, medium, low`,
      );
    }

    const config: PolicyConfig = {
      failOn: parsed.failOn as FindingSeverity,
    };

    // [GPCL-B2] Parse blockCategories and opa config
    if (parsed.blockCategories) {
      config.blockCategories = parsed.blockCategories;
    }

    // [GPCL-B1] Parse waiverRequirements, [GPCL-B4] validate minApprovals
    if (parsed.waiverRequirements) {
      for (const [category, req] of Object.entries(parsed.waiverRequirements)) {
        if (
          !req ||
          typeof req.role !== 'string' ||
          typeof req.minApprovals !== 'number' ||
          req.minApprovals < 1
        ) {
          throw new Error(
            `Invalid waiverRequirement for category "${category}": requires role (string) and minApprovals (number >= 1)`,
          );
        }
      }
      config.waiverRequirements = parsed.waiverRequirements;
    }

    if (parsed.opa?.policies) {
      config.opa = { policies: parsed.opa.policies };
    }

    return config;
  }
}
