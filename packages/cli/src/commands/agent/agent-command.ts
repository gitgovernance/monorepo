import { Command, Option } from 'commander';
import { BaseCommand } from '../../base/base-command';
import type { BaseCommandOptions } from '../../interfaces/command';
import type { RunOptions, AgentResponse } from '@gitgov/core';
import type { AgentRecord } from '@gitgov/core';
import { DEFAULT_ID_ENCODER } from '@gitgov/core/fs';

/**
 * CLI-specific options for agent run command
 */
export interface RunCommandOptions extends BaseCommandOptions {
  /** TaskRecord ID to use (if not provided, auto-creates one) */
  task?: string;
  /** Input JSON inline */
  input?: string;
  /** File with input JSON */
  inputFile?: string;
  /** Specific tool to invoke (MCP only) */
  tool?: string;
  /** Simulate without executing */
  dryRun?: boolean;
  /** Output format */
  output: 'text' | 'json';
  /** Quiet mode */
  quiet?: boolean;
  /** Verbose mode */
  verbose?: boolean;
}

/**
 * CLI-specific options for agent list command
 */
export interface ListCommandOptions extends BaseCommandOptions {
  /** Filter by engine type */
  engine?: 'local' | 'api' | 'mcp' | 'custom';
  /** Output JSON */
  json?: boolean;
  /** Only names */
  quiet?: boolean;
}

/**
 * CLI-specific options for agent show command
 */
export interface ShowCommandOptions extends BaseCommandOptions {
  /** Output JSON */
  json?: boolean;
  /** Include full schema */
  verbose?: boolean;
}


/**
 * CLI-specific options for agent new command (G20 — package-driven only)
 * EARS: E1..E7
 */
export type AgentNewOptions = BaseCommandOptions & {
  json?: boolean;
  quiet?: boolean;
};

/**
 * Agent Command - Thin wrapper for @gitgov/core module
 *
 * Responsibilities (CLI only):
 * - Parse CLI arguments
 * - Format output (text/json)
 * - Exit codes
 *
 * All execution logic lives in agent_runner_module (core).
 */
export class AgentCommand extends BaseCommand<RunCommandOptions> {
  protected commandName = 'agent';
  protected description = 'Manage and run GitGov agents';

  constructor() {
    super();
  }

  /**
   * Register the agent command with Commander
   */
  register(program: Command): void {
    const agentCmd = program
      .command('agent')
      .description(this.description);


    // Subcommand: new (G20 — package-driven, reads package.json.gitgov.agent)
    agentCmd
      .command('new <package>')
      .alias('n')
      .description('Register agent from package.json gitgov.agent field')
      .option('--json', 'Output as JSON', false)
      .option('-q, --quiet', 'Quiet output', false)
      .action(async (pkg: string, options: AgentNewOptions) => {
        await this.executeNew(pkg, options);
      });

    // Subcommand: run
    agentCmd
      .command('run <name>')
      .alias('r')
      .description('Execute an agent by name')
      .option('-t, --task <id>', 'TaskRecord ID to use (auto-creates if not provided)')
      .option('-i, --input <json>', 'Input JSON for the agent')
      .option('--input-file <path>', 'File with input JSON')
      .option('--tool <name>', 'Specific tool to invoke (MCP only)')
      .option('--dry-run', 'Simulate execution without running', false)
      .addOption(new Option('-o, --output <format>', 'Output format').choices(['text', 'json']).default('text'))
      .option('-q, --quiet', 'Quiet mode - only errors', false)
      .option('-v, --verbose', 'Verbose mode with metadata', false)
      .option('--json', 'Alias for --output json', false)
      .action(async (name: string, options: RunCommandOptions & { json?: boolean }) => {
        if (options.json) {
          options.output = 'json';
        }
        await this.executeRun(name, options);
      });

    // Subcommand: list
    agentCmd
      .command('list')
      .alias('ls')
      .description('List available agents in .gitgov/agents/')
      .addOption(new Option('-e, --engine <type>', 'Filter by engine type').choices(['local', 'api', 'mcp', 'custom']))
      .option('-q, --quiet', 'Only show agent names', false)
      .option('--json', 'Output as JSON', false)
      .action(async (options: ListCommandOptions) => {
        await this.executeList(options);
      });

    // Subcommand: show
    agentCmd
      .command('show <name>')
      .alias('s')
      .description('Show details of an agent')
      .option('-v, --verbose', 'Include full schema', false)
      .option('--json', 'Output as JSON', false)
      .action(async (name: string, options: ShowCommandOptions) => {
        await this.executeShow(name, options);
      });
  }

  /**
   * Execute agent new subcommand (G20 — package-driven only)
   * [EARS-E1 to E7]
   */
  async executeNew(pkg: string, options: AgentNewOptions): Promise<void> {
    try {
      const { readFileSync, existsSync } = await import('node:fs');
      const { createRequire } = await import('node:module');
      const { resolve, isAbsolute, join } = await import('node:path');

      // [EARS-E1, E2] Resolve package.json path
      let pkgJsonPath: string;
      let entrypoint: string;

      if (pkg.startsWith('.') || pkg.startsWith('/')) {
        // [EARS-E2] Local path
        const absPath = isAbsolute(pkg) ? pkg : resolve(process.cwd(), pkg);
        pkgJsonPath = join(absPath, 'package.json');
        if (!existsSync(pkgJsonPath)) {
          throw new Error(`Cannot find package.json at ${pkgJsonPath}`);
        }
        const localPkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as Record<string, unknown>;
        const mainFile = (localPkg['main'] as string) ?? 'index.js';
        entrypoint = join(absPath, mainFile);
      } else {
        // [EARS-E1] NPM package
        const req = createRequire(join(process.cwd(), 'package.json'));
        try {
          pkgJsonPath = req.resolve(join(pkg, 'package.json'));
        } catch {
          // [EARS-E2b] Auto-install
          const { execSync } = await import('node:child_process');
          const pm = existsSync(join(process.cwd(), 'pnpm-lock.yaml')) ? 'pnpm'
            : existsSync(join(process.cwd(), 'yarn.lock')) ? 'yarn' : 'npm';
          const installCmd = pm === 'yarn' ? `yarn add ${pkg}` : `${pm} install ${pkg}`;
          if (!options.quiet) console.error(`  Installing ${pkg}...`);
          execSync(installCmd, { cwd: process.cwd(), stdio: 'pipe' });
          pkgJsonPath = req.resolve(join(pkg, 'package.json'));
        }
        entrypoint = pkg;
      }

      // Read package.json
      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as Record<string, unknown>;
      const pkgName = (pkgJson['name'] as string) ?? pkg;
      const gitgovField = (pkgJson['gitgov'] as Record<string, unknown> | undefined)?.['agent'] as Record<string, unknown> | undefined;

      // [EARS-E3] Require gitgov.agent field
      if (!gitgovField) {
        throw new Error(`Package ${pkgName} does not have a gitgov.agent field in package.json`);
      }

      const purpose = (gitgovField['purpose'] as string) ?? 'agent';
      const fnName = (gitgovField['function'] as string) ?? 'runAgent';
      const metadata = (gitgovField['metadata'] as Record<string, unknown>) ?? {};
      const envVars = (gitgovField['env'] as string[]) ?? [];

      // [EARS-E4] Warn about missing env vars
      for (const envVar of envVars) {
        if (!process.env[envVar]) {
          console.error(`  Warning: ${envVar} is required by this agent`);
        }
      }

      // Derive actorId from package name
      const actorId = `agent:${pkgName.replace(/^@[^/]+\/agent-/, '').replace(/^@[^/]+\//, '')}`;
      const engine = { type: 'local' as const, entrypoint, function: fnName };

      // Build payload
      const agentAdapter = await this.container.getAgentAdapter();
      const payload: Partial<AgentRecord> & { id: string } = {
        id: actorId,
        engine,
        metadata: { ...metadata, purpose },
      };

      // [EARS-E5, E6] Create or update
      const agentStore = await this.container.getAgentStore();
      const existingIds = await agentStore.list();
      const alreadyExists = existingIds.includes(DEFAULT_ID_ENCODER.encode(actorId));

      let agent: AgentRecord;
      if (alreadyExists) {
        // [EARS-E6] Update existing
        agent = await agentAdapter.createAgentRecord(payload);
        if (!options.quiet) console.log(`✅ Agent updated: ${actorId}`);
      } else {
        // [EARS-E5] Create new — auto-create ActorRecord if needed
        try {
          agent = await agentAdapter.createAgentRecord(payload);
        } catch (createErr) {
          const msg = createErr instanceof Error ? createErr.message : '';
          if (msg.includes('ActorRecord') && msg.includes('not found')) {
            const identityAdapter = await this.container.getIdentityAdapter();
            const actorName = actorId.replace(/^agent:/, '');
            await identityAdapter.createActor(
              { type: 'agent', displayName: actorName, roles: ['agent'] as [string, ...string[]] },
              'self',
            );
          } else {
            throw createErr;
          }
          agent = await agentAdapter.createAgentRecord(payload);
        }
      }

      // [EARS-E7] Output
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          action: alreadyExists ? 'updated' : 'created',
          data: { id: agent.id, actorId, engine: agent.engine },
        }, null, 2));
      } else if (!options.quiet) {
        console.log(`✅ Agent ${alreadyExists ? 'updated' : 'registered'}: ${actorId} [${engine.type}]`);
        console.log(`   Package: ${pkgName}`);
        console.log(`   Function: ${fnName}`);
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (options.json) {
        console.log(JSON.stringify({ success: false, error: message, exitCode: 1 }, null, 2));
      } else {
        console.error(`❌ Failed to register agent: ${message}`);
      }
      process.exit(1);
    }
  }

  async executeRun(name: string, options: RunCommandOptions): Promise<void> {
    try {
      // Get dependencies
      const runner = await this.container.getAgentRunnerModule();
      const backlogAdapter = await this.container.getBacklogAdapter();
      const currentActor = await this.container.getCurrentActor();

      // Build agentId
      const agentId = name.startsWith('agent:') ? name : `agent:${name}`;

      // Parse input if provided
      let input: unknown;
      if (options.input) {
        try {
          input = JSON.parse(options.input);
        } catch {
          this.handleError('Invalid JSON in --input', options as any);
          return;
        }
      } else if (options.inputFile) {
        const { promises: fs } = await import('fs');
        try {
          const content = await fs.readFile(options.inputFile, 'utf-8');
          input = JSON.parse(content);
        } catch (err) {
          this.handleError(`Failed to read --input-file: ${(err as Error).message}`, options as any);
          return;
        }
      }

      // [EARS-D6] Dry run mode
      if (options.dryRun) {
        if (options.output === 'json') {
          console.log(JSON.stringify({
            dryRun: true,
            agentId,
            taskId: options.task || '(auto-create)',
            input: input || null,
            tool: options.tool || null,
          }, null, 2));
        } else {
          console.log('\n--- DRY RUN ---');
          console.log(`Agent: ${agentId}`);
          console.log(`Task: ${options.task || '(will auto-create)'}`);
          if (input) console.log(`Input: ${JSON.stringify(input)}`);
          if (options.tool) console.log(`Tool: ${options.tool}`);
          console.log('---------------\n');
        }
        process.exit(0);
        return;
      }

      // Create TaskRecord if not provided
      let taskId = options.task;
      if (!taskId) {
        const task = await backlogAdapter.createTask({
          title: `Agent run: ${name}`,
          description: `Automated task for agent execution: ${name}`,
          priority: 'medium',
          tags: ['agent', 'automated'],
        }, currentActor.id);
        taskId = task.id;
        // [EARS-D3] Suppress output in quiet mode
        if (!options.quiet && options.output !== 'json') {
          console.log(`Created TaskRecord: ${taskId}`);
        }
      }

      // Execute agent
      const runOptions: RunOptions = {
        agentId,
        taskId,
        actorId: currentActor.id,
        input,
      };
      if (options.tool) {
        runOptions.tool = options.tool;
      }
      const response: AgentResponse = await runner.runOnce(runOptions);

      // [EARS-D1, D2] Format output
      if (options.output === 'json') {
        // [EARS-D2] JSON output
        console.log(JSON.stringify(response, null, 2));
      } else {
        // [EARS-D1] Text output with formatting
        this.formatTextResponse(response, options);
      }

      // [EARS-D4, D5] Exit code based on status
      process.exit(response.status === 'success' ? 0 : 1);

    } catch (error) {
      if (options.output === 'json') {
        console.log(JSON.stringify({
          success: false,
          error: (error as Error).message,
        }, null, 2));
      } else {
        console.error(`\n❌ ${(error as Error).message}\n`);
      }
      process.exit(1);
    }
  }

  /**
   * Format AgentResponse for text output
   */
  private formatTextResponse(response: AgentResponse, options: RunCommandOptions): void {
    const statusIcon = response.status === 'success' ? '✅' : '❌';
    const statusText = response.status === 'success' ? 'success' : 'error';

    console.log('\n' + '─'.repeat(60));
    console.log('AGENT EXECUTION RESULT');
    console.log('─'.repeat(60));
    console.log(`  Agent:    ${response.agentId}`);
    console.log(`  Run ID:   ${response.runId}`);
    console.log(`  Status:   ${statusIcon} ${statusText}`);
    console.log(`  Duration: ${response.durationMs}ms`);

    if (response.status === 'success' && response.output) {
      console.log('\n  Output:');
      if (response.output.message) {
        console.log(`    ${response.output.message}`);
      }
      if (response.output.data) {
        console.log(`    Data: ${JSON.stringify(response.output.data, null, 2).split('\n').join('\n    ')}`);
      }
      if (response.output.artifacts && response.output.artifacts.length > 0) {
        console.log(`    Artifacts: ${response.output.artifacts.join(', ')}`);
      }
    }

    if (response.status === 'error' && response.error) {
      console.log(`\n  Error: ${response.error}`);
    }

    console.log(`\n  ExecutionRecord: ${response.executionRecordId}`);
    console.log('─'.repeat(60));
    console.log(`\n${statusIcon} Agent ${response.status === 'success' ? 'completed successfully' : 'failed'}`);

    if (options.verbose) {
      console.log(`\nStarted:   ${response.startedAt}`);
      console.log(`Completed: ${response.completedAt}`);
    }
  }

  /**
   * Execute agent list subcommand
   * [EARS-B1 to B3]
   */
  async executeList(options: ListCommandOptions): Promise<void> {
    try {
      const agentStore = await this.container.getAgentStore();
      const agentIds = await agentStore.list();

      // Load all agents
      const agents: Array<{ id: string; name: string; engine: string; description: string | undefined }> = [];
      for (const id of agentIds) {
        const agent = await agentStore.get(id);
        if (agent) {
          const engineType = agent.payload.engine.type;

          // Filter by engine if specified
          if (options.engine && engineType !== options.engine) {
            continue;
          }

          const meta = agent.payload.metadata as Record<string, unknown> | undefined;
          agents.push({
            id: agent.payload.id,
            name: id.replace('agent-', ''),
            engine: engineType,
            description: meta?.['description'] as string | undefined,
          });
        }
      }

      // Output
      if (options.json) {
        console.log(JSON.stringify({ agents, total: agents.length }, null, 2));
      } else if (options.quiet) {
        agents.forEach(a => console.log(a.name));
      } else {
        if (agents.length === 0) {
          console.log('\nNo agents found in .gitgov/agents/');
          console.log('Create an AgentRecord to get started.\n');
        } else {
          console.log(`\nAvailable Agents (${agents.length}):\n`);
          for (const agent of agents) {
            console.log(`  ${agent.name.padEnd(24)} [${agent.engine}]`);
            if (agent.description) {
              console.log(`    ${agent.description}`);
            }
          }
          console.log('');
        }
      }

    } catch (error) {
      if (options.json) {
        console.log(JSON.stringify({ success: false, error: (error as Error).message }, null, 2));
      } else {
        console.error(`❌ ${(error as Error).message}`);
      }
      process.exit(1);
    }
  }

  /**
   * Execute agent show subcommand
   * [EARS-C1 to C3]
   */
  async executeShow(name: string, options: ShowCommandOptions): Promise<void> {
    try {
      const agentStore = await this.container.getAgentStore();

      // Try to load the agent — encode the ID for store lookup
      const agentId = name.startsWith('agent:') ? DEFAULT_ID_ENCODER.encode(name) : `agent-${name}`;
      const agent = await agentStore.get(agentId);

      if (!agent) {
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: `Agent not found: ${name}` }, null, 2));
        } else {
          console.error(`❌ Agent not found: ${name}`);
        }
        process.exit(1);
      }

      const engine = agent.payload.engine;
      const metadata = agent.payload.metadata as Record<string, unknown> | undefined;

      // Output
      if (options.json) {
        console.log(JSON.stringify(agent, null, 2));
      } else {
        console.log('\n' + '─'.repeat(60));
        console.log(`AGENT: ${name}`);
        console.log('─'.repeat(60));
        console.log(`  ID:          ${agent.payload.id}`);
        console.log(`  Status:      ${agent.payload.status || 'active'}`);

        if (metadata && 'description' in metadata) {
          console.log(`  Description: ${metadata['description']}`);
        }

        console.log('\n  Engine:');
        console.log(`    Type: ${engine.type}`);
        if ('entrypoint' in engine && engine.entrypoint) {
          console.log(`    Entrypoint: ${engine.entrypoint}`);
        }
        if ('function' in engine && engine.function) {
          console.log(`    Function: ${engine.function}`);
        }
        if ('url' in engine && engine.url) {
          console.log(`    URL: ${engine.url}`);
        }

        if (agent.payload.triggers && agent.payload.triggers.length > 0) {
          console.log('\n  Triggers:');
          agent.payload.triggers.forEach((t) => console.log(`    - ${t.type}${t['event'] ? `: ${t['event']}` : ''}`));
        }

        console.log('─'.repeat(60) + '\n');
      }

    } catch (error) {
      if (options.json) {
        console.log(JSON.stringify({ success: false, error: (error as Error).message }, null, 2));
      } else {
        console.error(`❌ ${(error as Error).message}`);
      }
      process.exit(1);
    }
  }
}
