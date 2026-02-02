import { promises as fs, existsSync } from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { GitGovConfig } from '../../config_manager';
import type { IProjectInitializer, EnvironmentValidation } from '../project_initializer';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { getImportMetaUrl } from '../../utils/esm_helper';
import { createLogger } from '../../logger';

const logger = createLogger('[FsProjectInitializer] ');

/**
 * Canonical directory structure for .gitgov/
 */
const GITGOV_DIRECTORIES = [
  'actors',
  'cycles',
  'tasks',
  'executions',
  'feedbacks',
  'changelogs',
] as const;

/**
 * FsProjectInitializer - Filesystem implementation of IProjectInitializer.
 *
 * Initializes GitGovernance projects on the local filesystem,
 * creating the .gitgov/ directory structure and configuration files.
 *
 * The projectRoot is injected at construction time (DI from CLI/bootstrap).
 *
 * @example
 * ```typescript
 * const initializer = new FsProjectInitializer('/path/to/project');
 *
 * const validation = await initializer.validateEnvironment();
 * if (!validation.isValid) {
 *   console.log(validation.warnings);
 *   return;
 * }
 *
 * await initializer.createProjectStructure();
 * await initializer.writeConfig(config);
 * await initializer.initializeSession(actorId);
 * await initializer.copyAgentPrompt();
 * await initializer.setupGitIntegration();
 * ```
 */
export class FsProjectInitializer implements IProjectInitializer {
  private readonly projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  // ==================== IProjectInitializer Interface Methods ====================

  /**
   * Creates the .gitgov/ directory structure.
   */
  async createProjectStructure(): Promise<void> {
    const gitgovPath = path.join(this.projectRoot, '.gitgov');

    await fs.mkdir(gitgovPath, { recursive: true });

    for (const dir of GITGOV_DIRECTORIES) {
      await fs.mkdir(path.join(gitgovPath, dir), { recursive: true });
    }
  }

  /**
   * Checks if .gitgov/config.json exists.
   */
  async isInitialized(): Promise<boolean> {
    const configPath = path.join(this.projectRoot, '.gitgov', 'config.json');
    try {
      await fs.access(configPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Writes config.json to .gitgov/
   */
  async writeConfig(config: GitGovConfig): Promise<void> {
    const configPath = path.join(this.projectRoot, '.gitgov', 'config.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * Creates .session.json with initial actor state.
   */
  async initializeSession(actorId: string): Promise<void> {
    const sessionPath = path.join(this.projectRoot, '.gitgov', '.session.json');
    const session = {
      lastSession: {
        actorId,
        timestamp: new Date().toISOString(),
      },
      actorState: {
        [actorId]: {
          lastSync: new Date().toISOString(),
          syncStatus: {
            status: 'synced' as const,
          },
        },
      },
    };

    await fs.writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
  }

  /**
   * Reads a file from the filesystem.
   */
  async readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  }

  /**
   * Gets the path for an actor record.
   */
  getActorPath(actorId: string): string {
    return path.join(this.projectRoot, '.gitgov', 'actors', `${actorId}.json`);
  }

  /**
   * Validates environment for GitGovernance initialization.
   * Checks: Git repo exists, write permissions, not already initialized.
   */
  async validateEnvironment(): Promise<EnvironmentValidation> {
    const warnings: string[] = [];
    const suggestions: string[] = [];

    try {
      // Check if it's a Git repository
      const gitPath = path.join(this.projectRoot, '.git');
      const isGitRepo = existsSync(gitPath);

      if (!isGitRepo) {
        warnings.push(`Not a Git repository in directory: ${this.projectRoot}`);
        suggestions.push("Run 'git init' to initialize a Git repository first");
      }

      // Check write permissions
      let hasWritePermissions = false;
      try {
        const testFile = path.join(this.projectRoot, '.gitgov-test');
        await fs.writeFile(testFile, 'test');
        await fs.unlink(testFile);
        hasWritePermissions = true;
      } catch {
        warnings.push('No write permissions in target directory');
        suggestions.push('Ensure you have write permissions in the target directory');
      }

      // Check if already initialized
      const isAlreadyInitialized = await this.isInitialized();
      if (isAlreadyInitialized) {
        warnings.push(`GitGovernance already initialized in directory: ${this.projectRoot}`);
        suggestions.push("Use 'gitgov status' to check current state or choose a different directory");
      }

      // VCS status checks (only if it's a git repo)
      let hasRemote = false;
      let hasCommits = false;
      let currentBranch = '';

      if (isGitRepo) {
        try {
          execSync('git remote get-url origin', {
            cwd: this.projectRoot,
            stdio: 'pipe',
          });
          hasRemote = true;
        } catch {
          hasRemote = false;
        }

        try {
          currentBranch = execSync('git branch --show-current', {
            cwd: this.projectRoot,
            encoding: 'utf-8',
            stdio: 'pipe',
          }).trim();
        } catch {
          currentBranch = '';
        }

        try {
          execSync('git log --oneline -1', {
            cwd: this.projectRoot,
            stdio: 'pipe',
          });
          hasCommits = true;
        } catch {
          hasCommits = false;
        }
      }

      const isValid = isGitRepo && hasWritePermissions && !isAlreadyInitialized;

      const result: EnvironmentValidation = {
        isValid,
        isGitRepo,
        hasWritePermissions,
        isAlreadyInitialized,
        warnings,
        suggestions,
        hasRemote,
        hasCommits,
        currentBranch,
      };

      if (isAlreadyInitialized) {
        result.gitgovPath = path.join(this.projectRoot, '.gitgov');
      }

      return result;
    } catch (error) {
      warnings.push(`Environment validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      suggestions.push('Check file system permissions and try again');

      return {
        isValid: false,
        isGitRepo: false,
        hasWritePermissions: false,
        isAlreadyInitialized: false,
        warnings,
        suggestions,
      };
    }
  }

  /**
   * Copies the @gitgov agent prompt to project root for IDE access.
   */
  async copyAgentPrompt(): Promise<void> {
    const targetPrompt = path.join(this.projectRoot, 'gitgov');
    const potentialSources: string[] = [];

    // 1. Development scenario: search in src/docs/generated/
    potentialSources.push(
      path.join(process.cwd(), 'src/docs/generated/gitgov_agent.md')
    );

    // 2. NPM installation: use require.resolve
    try {
      const metaUrl = getImportMetaUrl();
      if (metaUrl) {
        const require = createRequire(metaUrl);
        const pkgJsonPath = require.resolve('@gitgov/core/package.json');
        const pkgRoot = path.dirname(pkgJsonPath);
        potentialSources.push(path.join(pkgRoot, 'dist/src/docs/generated/gitgov_agent.md'));
      }
    } catch {
      // require.resolve failed - continue
    }

    // 3. Build fallback: relative to compiled __dirname
    try {
      const metaUrl = getImportMetaUrl();
      if (metaUrl) {
        const __filename = fileURLToPath(metaUrl);
        const __dirname = path.dirname(__filename);
        potentialSources.push(path.resolve(__dirname, '../../docs/generated/gitgov_agent.md'));
      }
    } catch {
      // import.meta not available - continue
    }

    // Find and copy the first accessible file
    for (const source of potentialSources) {
      try {
        await fs.access(source);
        await fs.copyFile(source, targetPrompt);
        logger.debug(`@gitgov agent prompt copied to project root (./gitgov)\n`);
        return;
      } catch {
        continue;
      }
    }

    // Graceful degradation
    console.warn(
      'Warning: Could not copy @gitgov agent prompt. Project will work but AI assistant may not have local instructions.'
    );
  }

  /**
   * Sets up .gitignore for GitGovernance files.
   */
  async setupGitIntegration(): Promise<void> {
    const gitignorePath = path.join(this.projectRoot, '.gitignore');
    const gitignoreContent = `
# GitGovernance
# Ignore entire .gitgov/ directory (state lives in gitgov-state branch)
.gitgov/

# Ignore agent prompt file (project-specific, created by gitgov init)
gitgov
`;

    try {
      let existingContent = '';
      try {
        existingContent = await fs.readFile(gitignorePath, 'utf-8');
      } catch {
        // File doesn't exist, will create new
      }

      if (existingContent && !existingContent.includes('# GitGovernance')) {
        await fs.appendFile(gitignorePath, gitignoreContent);
      } else if (!existingContent) {
        await fs.writeFile(gitignorePath, gitignoreContent);
      }
    } catch (error) {
      console.warn('Failed to setup Git integration:', error);
    }
  }

  /**
   * Removes .gitgov/ directory (for rollback on failed init).
   */
  async rollback(): Promise<void> {
    const gitgovPath = path.join(this.projectRoot, '.gitgov');
    try {
      await fs.access(gitgovPath);
      await fs.rm(gitgovPath, { recursive: true, force: true });
    } catch {
      // Directory doesn't exist, nothing to clean up
    }
  }
}
