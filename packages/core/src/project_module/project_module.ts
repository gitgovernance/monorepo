import type { ProjectModuleDeps, ProjectInitOptions, ProjectInitResult, ProjectInitialized, ProjectAlreadyInitialized, AddActorInput, AddActorResult } from './project_module.types';
import { AddActorError, ProjectInitError } from './project_module.types';
import type { ActorJoinedEvent } from '../event_bus/types';
// [PROJ-B6] Creation-time engine validation (agent_runner ARUN-M1)
// NOTE: `validateAgentEngine` is NOT imported here on purpose. It reaches
// `backends/local_backend.ts`, which imports `node:path` and `node:module`, so importing
// it dragged both into the @gitgov/core root bundle — the last two violations reported by
// the EARS-CI02 guardrail. The capability now arrives as `deps.engineValidator`
// (IEngineValidator), with its Node-only implementation coming from @gitgov/core/fs.


/**
 * [PROJ-H3b] Bounded wait for the actor to become visible after the store committed it.
 *
 * The store can be backed by an eventually consistent source (GitHubRecordStore commits
 * inside `put()`, then reads go through the GitHub API), so a `null` right after the write
 * is NOT evidence of absence. Measured in production 2026-08-14: the commit landed 1.4s
 * before the guard read null and threw GIT_WRITE_FAILED on an actor that was on the branch.
 *
 * 5s over a measured 1.4s window is ~3.5x margin. The interval is short because the happy
 * path exits on the first read and pays nothing.
 */
const ACTOR_VERIFY_DEADLINE_MS = 5000;
const ACTOR_VERIFY_INTERVAL_MS = 250;

/**
 * [PROJ-B3] The human-readable reason behind an error. An AddActorError's own message is only
 * `AddActorError(<code>)` — the reason is in `context.cause` (PROJ-D4) — so reading `.message`
 * alone would put the code where the cause should be.
 */
function readableCause(err: unknown): string {
  if (err instanceof AddActorError && typeof err.context['cause'] === 'string') return err.context['cause'];
  return err instanceof Error ? err.message : String(err);
}

export class ProjectModule {
  constructor(private readonly deps: ProjectModuleDeps) {}

  // [PROJ-A1] [PROJ-A2] [PROJ-A3]
  async initializeProject(options: ProjectInitOptions): Promise<ProjectInitResult> {
    const joinedVia = options.joinedVia ?? 'cli';
    const repoId = options.repoId ?? '';

    // [PROJ-A2] Idempotency — if already initialized, ensure caller's actor exists
    const isInit = await this.deps.initializer.isInitialized();
    if (isInit) {
      const commitSha = await this.deps.initializer.getHeadSha();
      if (options.login) {
        const ensureInput: AddActorInput = {
          login: options.login,
          type: options.type ?? 'human',
          repoId,
          joinedVia,
        };
        if (options.actorName) ensureInput.displayName = options.actorName;
        const actorResult = await this.addActor(ensureInput);
        // Assigned conditionally rather than spread in: under exactOptionalPropertyTypes an
        // explicit `undefined` is not the same as an absent key, and `commitSha` is genuinely
        // absent when neither the actor commit nor the head read produced one. Same shape as
        // the fresh-init return below.
        const joined: ProjectAlreadyInitialized = { alreadyInitialized: true, actorId: actorResult.actorId, created: actorResult.created };
        const sha = actorResult.commitSha ?? commitSha;
        if (sha) joined.commitSha = sha;
        return joined;
      }
      const idempotent: ProjectAlreadyInitialized = { alreadyInitialized: true };
      if (commitSha) idempotent.commitSha = commitSha;
      return idempotent;
    }

    // [PROJ-A1] [PROJ-H4] Every actor this init joins. addActor with skipFinalize does not publish:
    // the actors are announced once the closing finalize has written them.
    const joined: Array<{ input: AddActorInput; result: AddActorResult }> = [];
    const join = async (input: AddActorInput): Promise<AddActorResult> => {
      const result = await this.addActor(input);
      joined.push({ input, result });
      return result;
    };

    let result: ProjectInitialized;
    try {
      // [PROJ-C1] Structure (dirs + policy.yml) — before actors
      await this.deps.initializer.createProjectStructure();

      // [PROJ-A1] [PROJ-B1] Human actor — via addActor for consistent metadata (events: after finalize, below)
      // skipFinalize: true — initializeProject calls finalize() once at the end
      // [PROJ-A3] Already 'human' | 'agent': ProjectInitOptions.type is that union
      const actorType = options.type ?? 'human';
      const humanResult = await join({
        login: options.login || 'owner',
        type: actorType,
        repoId,
        displayName: options.actorName || options.login || 'Project Owner',
        roles: ['admin', 'author', 'approver:product', 'approver:quality', 'developer'],
        joinedVia,
        skipFinalize: true,
        defer: true,
      });

      // [PROJ-B2] Product agent (G21 Two-Tier Actor Model) — via addActor
      // [GAUD-A1] [GAUD-A2] Both entry points land here: what differs between CLI init and
      // SaaS remote init is the injected IProjectInitializer, not this step.
      let productAgentResult: AddActorResult;
      try {
        productAgentResult = await join({
          login: 'gitgov-audit',
          type: 'agent',
          skipFinalize: true,
          defer: true,
          repoId,
          displayName: 'GitGov Audit',
          roles: ['orchestrator'],
          joinedVia,
        });
      } catch (err) {
        // [PROJ-B3] The step travels as a property and the original intact in `cause`. This
        // used to interpolate the step into a plain Error, which destroyed the original and left
        // repo_state_machine's `step` channel with nothing to read.
        throw new ProjectInitError(`Init failed at step createProductAgent: ${readableCause(err)}`, {
          cause: err,
          step: 'createProductAgent',
        });
      }

      // [PROJ-C2] Config
      // [PROJ-C5] No root cycle is created and `rootCycle` is not written. It had no
      // consumers — `gitgov context` prints the id it reads from config.json, not the record —
      // and the reuse that PROJ-C2c promised was never implemented: createCycle rebuilt and
      // re-signed the record, so a second pass overwrote it with an empty taskIds (D29).
      const config = {
        protocolVersion: '1.0.0',
        projectId: this.generateProjectId(options.name),
        projectName: options.name,
        ...(options.saasUrl && { saasUrl: options.saasUrl }),
        // [INIT-L1] State branch written to config for all commands to read
        state: { branch: options.stateBranch },
      };
      await this.deps.initializer.writeConfig(config);

      // [PROJ-C6] Open the session with the HUMAN actor, so getCurrentActor resolves to the
      // owner and not to the product agent in every later command. Inside the try on purpose:
      // a failure here aborts the init with rollback, like any structural step (PROJ-D1).
      await this.deps.initializer.initializeSession(humanResult.actorId);

      // [PROJ-B4] Register default agents via AgentAdapter
      const agentWarnings: string[] = [];
      if (this.deps.agentAdapter && this.deps.defaultAgents?.length) {
        for (const agentConfig of this.deps.defaultAgents) {
          try {
            // [PROJ-B6] Creation-time engine validation (ARUN-M1): the agent is still
            // registered (valid declaration) but the user learns NOW that it won't run —
            // not 3 steps later at audit time. Non-fatal.
            //
            // [PROJ-B7] No root is passed, and this module knows none. Until 2026-08-27 the
            // call read `validate(engine, process.cwd())` under a comment claiming cwd was
            // "the same anchor the runner uses" — a guarantee the DI did not keep: during
            // `gitgov init` the initializer it hands us writes to ~/.gitgov/worktrees/<hash>
            // while this resolved in the repo. Different trees. cwd happened to be right
            // because init runs from the repo. The validator now arrives already bound to
            // its root (EARS-C16), so there is nothing here left to get wrong.
            // Held until the agent IS registered: pushed before, an agent whose registration then
            // failed carried "registered but not runnable" next to "registration failed".
            let notRunnable: string | undefined;
            try {
              // No validator injected → no validation. Deliberate and covered by its own
              // test: PROJ-B6 degrades silently, so the absence is pinned down rather than
              // discovered later.
              if (this.deps.engineValidator) {
                const validation = await this.deps.engineValidator.validate(agentConfig.engine);
                if (!validation.resolvable) {
                  notRunnable = `${agentConfig.agentId}: registered but not runnable — ${validation.reason}`;
                }
              }
            } catch (err) {
              // Validation itself must never block registration. ARUN-M1 forbids validate() from
              // throwing; if an implementation does anyway, the error is surfaced, not swallowed.
              agentWarnings.push(`${agentConfig.agentId}: engine validation failed — ${readableCause(err)}`);
            }
            // [PROJ-E3] Product agent already has ActorRecord — skip
            // [PROJ-E1] Specialist agents need their own ActorRecord before AgentRecord
            if (agentConfig.agentId !== productAgentResult.actorId) {
              await join({
                login: agentConfig.agentId.replace('agent:', ''),
                type: 'agent',
                repoId,
                displayName: agentConfig.displayName,
                joinedVia,
                skipFinalize: true,
                defer: true,
              });
            }

            const mergedMetadata = { ...agentConfig.metadata, purpose: agentConfig.purpose };

            // [GAUD-E1] Check if AgentRecord already exists — update if config changed, skip if identical
            const existing = await this.deps.agentAdapter.getAgentRecord(agentConfig.agentId);
            if (existing) {
              const engineChanged = JSON.stringify(existing.engine) !== JSON.stringify(agentConfig.engine);
              const metadataChanged = JSON.stringify(existing.metadata) !== JSON.stringify(mergedMetadata);
              if (engineChanged || metadataChanged) {
                // [GAUD-E2] Preserve id, status, triggers — only update engine and metadata
                await this.deps.agentAdapter.updateAgentRecord(agentConfig.agentId, {
                  engine: agentConfig.engine,
                  metadata: mergedMetadata,
                });
              }
            } else {
              // [PROJ-B4] Build+sign without committed-read, then persist via the initializer
              // (homologated FS/GitHub). Avoids createAgentRecord's committed-read of the
              // corresponding ActorRecord, which on the GitHub atomic init is staged-but-not-
              // committed and invisible to the store's get() → throw → swallowed (Bug A).
              const signed = await this.deps.agentAdapter.buildSignedAgentRecord({
                id: agentConfig.agentId,
                engine: agentConfig.engine,
                status: 'active',
                triggers: agentConfig.triggers,
                // [PROJ-E4] Purpose merged into AgentRecord metadata
                metadata: mergedMetadata,
              });
              await this.deps.initializer.addAgent(signed);
            }
            // [PROJ-B6] Registered: now the warning is true
            if (notRunnable !== undefined) agentWarnings.push(notRunnable);
          } catch (err) {
            // [PROJ-B5] [PROJ-E2] [GAUD-E3] Non-fatal — agent create/update failure doesn't block
            // init, but it is not silent either: the catch was empty until 2026-09-13, so a default
            // agent that never got registered left no trace. Same channel as PROJ-B6.
            agentWarnings.push(`${agentConfig.agentId}: registration failed — ${readableCause(err)}`);
          }
        }
      }

      // [PROJ-C4] Git integration (.gitignore, gitgov.yml)
      await this.deps.initializer.setupGitIntegration();

      // [PROJ-C3] Finalize (commit in GitHub, no-op in Fs)
      const finalized = await this.deps.initializer.finalize();

      // [PROJ-C5] No `cycleId`: the fresh variant stopped carrying it with the root cycle.
      result = {
        actorId: humanResult.actorId,
        productAgentId: productAgentResult.actorId,
      };
      if (finalized) result.commitSha = finalized;
      // [PROJ-B6] Surface non-runnable agent warnings to the caller (CLI prints them)
      if (agentWarnings.length > 0) result.agentWarnings = agentWarnings;
    } catch (err) {
      // [PROJ-D1] [PROJ-D3] Rollback via initializer
      try {
        await this.deps.initializer.rollback();
      } catch (rollbackErr) {
        // [PROJ-D2] The rollback failure is NOT discarded: it is what separates an init that left
        // the state clean from one that left a half-written branch (ROLLBACK_FAILED, PSVC-B6).
        // The original's message stays on top; an existing ProjectInitError keeps its step/cause.
        const rollbackError = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
        if (err instanceof ProjectInitError) {
          throw new ProjectInitError(err.message, {
            cause: err.cause,
            ...(err.step !== undefined && { step: err.step }),
            rollbackError,
          });
        }
        throw new ProjectInitError(err instanceof Error ? err.message : String(err), { cause: err, rollbackError });
      }
      // [PROJ-D1] Nothing to add: rethrow unwrapped
      throw err;
    }

    // [PROJ-A1] [PROJ-H4] Outside the try: the init is written, so an event stream that throws
    // must not be able to roll it back. A rollback above leaves this loop unreached.
    for (const { input, result: joinResult } of joined) {
      this.publishActorJoined(joinResult.actorId, input, joinResult.created);
    }
    return result;
  }

  // [PROJ-H1] [PROJ-H2] [PROJ-H3] [PROJ-H4] [PROJ-H5] [PROJ-H6]
  async addActor(input: AddActorInput): Promise<AddActorResult> {
    const actorId = `${input.type}:${input.login}`;

    // [PROJ-H6] authzCheck — invoke before any creation
    if (input.authzCheck) {
      const allowed = await input.authzCheck(input);
      if (!allowed) {
        throw new AddActorError('UNAUTHORIZED', { login: input.login, type: input.type, reason: 'authz check denied' });
      }
    }

    // [PROJ-H2] [PROJ-H3] Check if actor already exists in store
    const existing = await this.deps.identity.getActor(actorId);
    if (existing) {
      // [PROJ-H3] Detect-and-resume: actor in store but maybe not in git.
      let commitSha: string | undefined;
      if (!input.skipFinalize) {
        try {
          const finalized = await this.deps.initializer.finalize();
          if (finalized) commitSha = finalized;
        } catch {
          // [PROJ-H3] finalize failed on the resume path — not thrown: the missing commitSha is the
          // caller's signal that the commit is still pending and can be retried.
        }
      }

      // [PROJ-H4] The actor already existed; it joined this repo. With skipFinalize the caller
      // closes the unit of work and announces it.
      if (!input.skipFinalize) this.publishActorJoined(actorId, input, false);

      const result: AddActorResult = { actorId, created: false };
      if (commitSha) result.commitSha = commitSha;
      return result;
    }

    // [PROJ-H1] Create actor — with joinedVia + joinedAt metadata
    // [PROJ-H5] Writes only to the repo where called (lazy per-repo)
    // The non-empty tuple is built, not asserted: a cast here claimed input.roles was non-empty.
    const [firstRole, ...otherRoles] = input.roles ?? [];
    const roles: [string, ...string[]] = firstRole !== undefined
      ? [firstRole, ...otherRoles]
      : input.type === 'human' ? ['author', 'developer'] : ['specialist'];
    await this.deps.identity.createActor({
      id: actorId,
      type: input.type,
      displayName: input.displayName || input.login,
      roles,
      metadata: {
        joinedVia: input.joinedVia,
        joinedAt: new Date().toISOString(),
      },
    }, 'bootstrap', input.defer ? { defer: true } : undefined);

    // [PROJ-H3] Finalize commits the actor to git.
    // When skipFinalize is set (called from initializeProject), the caller
    // will finalize once at the end for all staged files atomically.
    let commitSha: string | undefined;
    if (!input.skipFinalize) {
      try {
        const finalized = await this.deps.initializer.finalize();
        if (finalized) commitSha = finalized;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('Nothing to commit')) {
          // [PROJ-H3b] The guard stays: it distinguishes "the store committed directly"
          // from "nothing was written at all". What changes is that a single null no
          // longer settles it — the store may be reading an eventually consistent source
          // that has not caught up with its OWN write yet. Poll with a bounded deadline:
          // the legitimate case converges and returns success, the case this guard exists
          // to catch exhausts the deadline and still throws.
          const verifyDeadline = Date.now() + ACTOR_VERIFY_DEADLINE_MS;
          let verified = await this.deps.identity.getActor(actorId);
          while (!verified && Date.now() < verifyDeadline) {
            await new Promise(resolve => setTimeout(resolve, ACTOR_VERIFY_INTERVAL_MS));
            verified = await this.deps.identity.getActor(actorId);
          }
          if (!verified) {
            // [PROJ-D4] No rollback: addActor joins an EXISTING project
            throw new AddActorError('GIT_WRITE_FAILED', { actorId, cause: message });
          }
        } else {
          // [PROJ-D4] No rollback: addActor joins an EXISTING project, and the initializer's
          // rollback undoes the init's structure, not this actor.
          throw new AddActorError('GIT_WRITE_FAILED', { actorId, cause: message });
        }
      }
    }

    // [PROJ-H4] The actor was minted here. With skipFinalize it is not written yet: the caller
    // announces it after its own finalize (PROJ-A1).
    if (!input.skipFinalize) this.publishActorJoined(actorId, input, true);

    const result: AddActorResult = { actorId, created: true };
    if (commitSha) result.commitSha = commitSha;
    return result;
  }

  /**
   * [PROJ-H4] Publishes `project.actor.joined` when a bus is configured.
   *
   * Three call sites — the two branches of `addActor`, and `initializeProject` announcing the
   * actors of its unit of work after the closing finalize (PROJ-A1) — so the event is built once
   * here. `type` and `timestamp` come from the `BaseEvent` contract, not from the actor.
   */
  private publishActorJoined(actorId: string, input: AddActorInput, wasCreated: boolean): void {
    if (!this.deps.eventBus) return;
    const event: ActorJoinedEvent = {
      type: 'project.actor.joined',
      timestamp: Date.now(),
      source: 'project_module',
      payload: {
        actorId,
        repoId: input.repoId,
        joinedVia: input.joinedVia,
        wasCreated,
      },
    };
    this.deps.eventBus.publish(event);
  }

  private generateProjectId(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  }
}
