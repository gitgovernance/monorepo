import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SemgrepConfig, SemgrepInput } from './types';

// [SGP-D1] [SGP-D2] Resolve semgrep config from project root
export function resolveConfig(projectRoot: string): SemgrepConfig {
  // [SGP-D1] Check for .semgrep.yml or .semgrep.yaml
  const ymlPath = join(projectRoot, '.semgrep.yml');
  if (existsSync(ymlPath)) {
    return { configPath: ymlPath, timeout: 120 };
  }

  const yamlPath = join(projectRoot, '.semgrep.yaml');
  if (existsSync(yamlPath)) {
    return { configPath: yamlPath, timeout: 120 };
  }

  // [SGP-D2] No config file — use --config auto
  return { configPath: null, timeout: 120 };
}

// [SGP-D3] [SGP-B1] [SGP-B6] Build CLI args for semgrep
export function buildSemgrepArgs(
  config: SemgrepConfig,
  projectRoot: string,
  input?: Pick<SemgrepInput, 'exclude' | 'scope' | 'baselineCommit'>,
): string[] {
  const args = ['--sarif', '--quiet'];

  // Config flag
  if (config.configPath) {
    args.push('--config', config.configPath);
  } else {
    args.push('--config', 'auto');
  }

  // [SGP-D3] Exclude patterns
  if (input?.exclude) {
    for (const pattern of input.exclude) {
      args.push('--exclude', pattern);
    }
  }

  // [SGP-B6] Diff scope with baseline commit
  if (input?.scope === 'diff' && input.baselineCommit) {
    args.push('--baseline-commit', input.baselineCommit);
  }

  // Timeout
  args.push('--timeout', String(config.timeout));

  // Target directory
  args.push(projectRoot);

  return args;
}
