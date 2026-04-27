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
 * CLI-specific options for agent new command
 * EARS: E1..E6
 */
export interface AgentNewOptions extends BaseCommandOptions {
  /** Engine type */
  engineType: 'local' | 'api' | 'mcp' | 'custom';
  /** [EARS-E1] Inline JSON config to merge with defaults */
  config?: string;
  /** [EARS-E2] Path to JSON config file */
  configFile?: string;
}

/**
 * CLI-specific options for agent add command
 * EARS: F1..F8
 */
export type AgentAddOptions = BaseCommandOptions & {
  config?: string;
  set?: string[];
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

    // Subcommand: add (package-driven registration)
    agentCmd
      .command('add <package>')
      .alias('a')
      .description('Register agent from package.json gitgov field')
      .option('-c, --config <json>', 'JSON config to merge over package.json defaults')
      .option('-s, --set <key=value>', 'Set env/config value (repeatable)', (val: string, prev: string[]) => [...prev, val], [] as string[])
      .option('--json', 'Output as JSON', false)
      .option('-q, --quiet', 'Quiet output', false)
      .action(async (pkg: string, options: AgentAddOptions) => {
        await this.executeAdd(pkg, options);
      });

    // Subcommand: new
    agentCmd
      .command('new <actorId>')
      .alias('n')
      .description('Create a new AgentRecord for an actor of type agent')
      .addOption(new Option('-e, --engine-type <type>', 'Execution engine type').choices(['local', 'api', 'mcp', 'custom']))
      .option('-c, --config <json>', 'Inline JSON config to merge with defaults (engine, metadata, triggers)')
      .option('--config-file <path>', 'Path to JSON config file')
      .option('--json', 'Output as JSON', false)
      .option('-v, --verbose', 'Verbose output', false)
      .option('-q, --quiet', 'Quiet output', false)
      .action(async (actorId: string, options: AgentNewOptions) => {
        await this.executeNew(actorId, options);
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
   * Execute agent new subcommand
   * [EARS-E1 to E6]
   */
  async executeNew(actorId: string, options: AgentNewOptions): Promise<void> {
    try {
      const agentAdapter = await this.container.getAgentAdapter();

      // [EARS-E1, E2, E3, E4] Build payload from config sources
      let configPayload: Record<string, unknown> = {};

      // [EARS-E2] Read from config file first (lowest priority)
      if (options.configFile) {
        const { readFileSync } = await import('node:fs');
        try {
          const fileContent = readFileSync(options.configFile, 'utf-8');
          configPayload = JSON.parse(fileContent) as Record<string, unknown>;
        } catch (err) {
          // [EARS-E4] Invalid JSON or file not found
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(`Failed to read --config-file: ${message}`);
        }
      }

      // [EARS-E1] Merge inline config (higher priority than file)
      if (options.config) {
        try {
          const inlineConfig = JSON.parse(options.config) as Record<string, unknown>;
          configPayload = { ...configPayload, ...inlineConfig };
        } catch {
          // [EARS-E4] Invalid JSON
          throw new Error('Invalid JSON in --config. Provide valid JSON string.');
        }
      }

      // [EARS-E3] Engine type shortcut has highest priority
      // Build engine: start from config, override type if -e provided
      const configEngine = (configPayload['engine'] ?? {}) as Record<string, unknown>;
      const engineType = options.engineType ?? (configEngine['type'] as string) ?? 'local';
      const engine = { ...configEngine, type: engineType } as AgentRecord['engine'];

      // Build full payload: merge config fields + engine
      const payload: Partial<AgentRecord> & { id: string } = {
        id: actorId,
        engine,
      };

      // Merge metadata if provided in config
      if (configPayload['metadata']) {
        (payload as Record<string, unknown>)['metadata'] = configPayload['metadata'];
      }

      // Merge triggers if provided in config
      if (configPayload['triggers']) {
        (payload as Record<string, unknown>)['triggers'] = configPayload['triggers'];
      }

      // Merge knowledge_dependencies if provided
      if (configPayload['knowledge_dependencies']) {
        (payload as Record<string, unknown>)['knowledge_dependencies'] = configPayload['knowledge_dependencies'];
      }

      // [EARS-E1b] Create AgentRecord via adapter
      // If actor doesn't exist, auto-create it first, then retry
      let agent: AgentRecord;
      try {
        agent = await agentAdapter.createAgentRecord(payload);
      } catch (createErr) {
        const msg = createErr instanceof Error ? createErr.message : '';
        if (msg.includes('ActorRecord') && msg.includes('not found')) {
          // Auto-create ActorRecord — eliminates need for separate `gitgov actor new`
          const identityAdapter = await this.container.getIdentityAdapter();
          const role = (configPayload['metadata'] as Record<string, unknown> | undefined)?.['role'] as string
            ?? (configPayload['gitgov'] as Record<string, unknown> | undefined)?.['role'] as string
            ?? 'agent';
          const actorName = actorId.replace(/^agent:/, '');
          await identityAdapter.createActor(
            { type: 'agent', displayName: actorName, roles: [role] as [string, ...string[]] },
            'self',
          );
          if (!options.quiet) {
            console.log(`  ActorRecord auto-created: ${actorId}`);
          }
          // Retry after actor creation
          agent = await agentAdapter.createAgentRecord(payload);
        } else {
          throw createErr;
        }
      }

      // [EARS-E4b] Output
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          data: {
            id: agent.id,
            actorId: agent.id,
            engine: agent.engine,
          }
        }, null, 2));
      } else if (!options.quiet) {
        console.log(`✅ AgentRecord created: ${agent.id}`);
        console.log(`   Engine: ${agent.engine.type}`);
      }

    } catch (error) {
      // [EARS-E3b] Error handling
      const message = error instanceof Error ? error.message : String(error);

      if (options.json) {
        console.log(JSON.stringify({ success: false, error: message, exitCode: 1 }, null, 2));
      } else {
        console.error(`❌ Failed to create agent: ${message}`);
      }

      process.exit(1);
    }
  }

  /**
   * Execute agent add subcommand
   * [EARS-F1 to F8]
   */
  async executeAdd(pkg: string, options: AgentAddOptions): Promise<void> {
    try {
      const { readFileSync, existsSync } = await import('node:fs');
      const { createRequire } = await import('node:module');
      const { resolve, isAbsolute, join } = await import('node:path');

      // [EARS-F1, F2] Resolve package.json path
      let pkgJsonPath: string;
      let entrypoint: string;

      if (pkg.startsWith('.') || pkg.startsWith('/')) {
        // [EARS-F2] Local path — resolve entry file from package.json main
        const absPath = isAbsolute(pkg) ? pkg : resolve(process.cwd(), pkg);
        pkgJsonPath = join(absPath, 'package.json');
        if (!existsSync(pkgJsonPath)) {
          throw new Error(`Cannot find package.json at ${pkgJsonPath}`);
        }
        const localPkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as Record<string, unknown>;
        const mainFile = (localPkg['main'] as string) ?? 'index.js';
        entrypoint = join(absPath, mainFile);
      } else {
        // [EARS-F1] NPM package — try to resolve, auto-install if not found
        const req = createRequire(join(process.cwd(), 'package.json'));
        try {
          pkgJsonPath = req.resolve(join(pkg, 'package.json'));
        } catch {
          // [EARS-F2b] Package not installed — auto-install
          const { execSync } = await import('node:child_process');
          const pm = existsSync(join(process.cwd(), 'pnpm-lock.yaml')) ? 'pnpm'
            : existsSync(join(process.cwd(), 'yarn.lock')) ? 'yarn'
            : 'npm';
          const installCmd = pm === 'yarn' ? `yarn add ${pkg}` : `${pm} install ${pkg}`;
          if (!options.quiet) {
            console.log(`📦 Installing ${pkg}...`);
          }
          execSync(installCmd, { cwd: process.cwd(), stdio: options.quiet ? 'pipe' : 'inherit' });
          pkgJsonPath = req.resolve(join(pkg, 'package.json'));
        }
        entrypoint = pkg;
      }

      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as Record<string, unknown>;
      const gitgovField = pkgJson['gitgov'] as Record<string, unknown> | undefined;
      const agentConfig = gitgovField?.['agent'] as Record<string, unknown> | undefined;

      // [EARS-F3] Validate gitgov.agent field exists
      if (!agentConfig) {
        throw new Error(`Package ${pkgJson['name'] ?? pkg} does not have a gitgov.agent field in package.json`);
      }

      // [EARS-F4] Merge --config override
      let mergedConfig = { ...agentConfig };
      if (options.config) {
        try {
          const overrides = JSON.parse(options.config) as Record<string, unknown>;
          mergedConfig = { ...mergedConfig, ...overrides };
        } catch {
          throw new Error('Invalid JSON in --config');
        }
      }

      // Derive actorId from package name
      const pkgName = (pkgJson['name'] as string) ?? pkg;
      const actorId = `agent:${pkgName.replace(/^@gitgov\/agent-/, '').replace(/^@.*\//, '')}`;

      // [EARS-F4] Build engine — mergedConfig overrides have priority
      const configEngine = (mergedConfig['engine'] as Record<string, unknown>) ?? {};
      const engineType = ((configEngine['type'] as string) ?? 'local') as AgentRecord['engine']['type'];
      const engine = {
        type: engineType,
        entrypoint: (configEngine['entrypoint'] as string) ?? entrypoint,
        function: (mergedConfig['function'] as string) ?? (configEngine['function'] as string) ?? 'runAgent',
      } as AgentRecord['engine'];

      // Build metadata
      const metadata: Record<string, unknown> = {};
      if (mergedConfig['metadata']) {
        Object.assign(metadata, mergedConfig['metadata']);
      }
      if (mergedConfig['purpose']) {
        metadata['purpose'] = mergedConfig['purpose'];
      }

      // [EARS-F5] Process --set KEY=VALUE
      if (options.set && options.set.length > 0) {
        const envMap: Record<string, string> = {};
        for (const pair of options.set) {
          const eqIdx = pair.indexOf('=');
          if (eqIdx === -1) throw new Error(`Invalid --set format: "${pair}". Use KEY=VALUE`);
          envMap[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
        }
        metadata['env'] = envMap;
      }

      // [EARS-F6] Validate required env vars
      const requiredEnv = agentConfig['env'] as string[] | undefined;
      if (requiredEnv && requiredEnv.length > 0) {
        const setKeys = Object.keys((metadata['env'] as Record<string, string>) ?? {});
        for (const key of requiredEnv) {
          if (!process.env[key] && !setKeys.includes(key)) {
            console.warn(`⚠️  Warning: ${key} is required by this agent. Set it with --set ${key}=value`);
          }
        }
      }

      // [EARS-F8] Check if agent already exists → update
      const agentAdapter = await this.container.getAgentAdapter();
      const agentStore = await this.container.getAgentStore();
      const existingIds = await agentStore.list();
      const alreadyExists = existingIds.includes(DEFAULT_ID_ENCODER.encode(actorId));

      const payload: Partial<AgentRecord> & { id: string } = {
        id: actorId,
        engine,
      };
      if (Object.keys(metadata).length > 0) {
        (payload as Record<string, unknown>)['metadata'] = metadata;
      }

      let agent: AgentRecord;
      if (alreadyExists) {
        // [EARS-F8] Update existing
        agent = await agentAdapter.createAgentRecord(payload);
        if (!options.quiet) {
          console.log(`✅ Agent updated: ${actorId}`);
        }
      } else {
        // Create new — auto-create ActorRecord if needed (same pattern as executeNew)
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

      // [EARS-F7] Output
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          action: alreadyExists ? 'updated' : 'created',
          data: { id: agent.id, actorId, engine: agent.engine },
        }, null, 2));
      } else if (!options.quiet) {
        console.log(`✅ Agent ${alreadyExists ? 'updated' : 'registered'}: ${actorId} [${engine.type}]`);
        console.log(`   Package: ${pkgName}`);
        console.log(`   Function: ${'function' in engine ? engine.function : 'runAgent'}`);
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (options.json) {
        console.log(JSON.stringify({ success: false, error: message, exitCode: 1 }, null, 2));
      } else {
        console.error(`❌ Failed to add agent: ${message}`);
      }
      process.exit(1);
    }
  }

  /**
   * Execute agent run subcommand
   * [EARS-A1 to A6]
   */
  async executeRun(name: string, options: RunCommandOptions): Promise<void> {
    try {
      // Get dependencies
      const runner = await this.container.getAgentRunnerModule();
      const backlogAdapter = await this.container.getBacklogAdapter();
      const identityAdapter = await this.container.getIdentityAdapter();
      const currentActor = await identityAdapter.getCurrentActor();

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
