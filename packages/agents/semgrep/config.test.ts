// All EARS prefixes map to semgrep_agent.md §4.4
import { existsSync } from 'node:fs';
import { resolveConfig, buildSemgrepArgs } from './src/config';

jest.mock('node:fs', () => ({
  existsSync: jest.fn(),
}));

const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;

describe('4.4. Config Resolution (SGP-D1 to SGP-D3)', () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
  });

  it('[SGP-D1] should use repo .semgrep.yml when yml present', () => {
    mockExistsSync.mockImplementation((p) => String(p).includes('.semgrep.yml'));

    const config = resolveConfig('/project');
    expect(config.configPath).toBe('/project/.semgrep.yml');
  });

  it('[SGP-D1] should use repo .semgrep.yaml when yaml present', () => {
    mockExistsSync.mockImplementation((p) => String(p).endsWith('.semgrep.yaml'));

    const config = resolveConfig('/project');
    expect(config.configPath).toBe('/project/.semgrep.yaml');
  });

  it('[SGP-D2] should use --config auto when no .semgrep.yml exists', () => {
    mockExistsSync.mockReturnValue(false);

    const config = resolveConfig('/project');
    expect(config.configPath).toBeNull();
  });

  it('[SGP-D3] should pass exclude patterns as --exclude flags', () => {
    const excludes = ['node_modules', 'dist', '*.test.ts'];
    const args = buildSemgrepArgs({ configPath: null, timeout: 120 }, '/project', { exclude: excludes });
    for (const pattern of excludes) {
      expect(args).toContain('--exclude');
      expect(args).toContain(pattern);
    }
  });

  it('[SGP-D3] should use --config auto in args when configPath is null', () => {
    const args = buildSemgrepArgs({ configPath: null, timeout: 120 }, '/project');
    expect(args).toContain('--config');
    expect(args).toContain('auto');
  });

  it('[SGP-D3] should use --config <path> in args when configPath exists', () => {
    const args = buildSemgrepArgs({ configPath: '/project/.semgrep.yml', timeout: 120 }, '/project');
    expect(args).toContain('--config');
    expect(args).toContain('/project/.semgrep.yml');
  });
});
