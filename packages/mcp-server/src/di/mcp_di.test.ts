import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import { McpDependencyInjectionService } from './mcp_di.js';
import { getWorktreeBasePath } from '@gitgov/core/fs';
import { generateCycleId } from '@gitgov/core';

/**
 * McpDependencyInjectionService tests — Block B (MSRV-B1 to MSRV-B5)
 *
 * These tests use a real temp directory with .gitgov/ structure
 * placed at the worktree path (getWorktreeBasePath), matching production behavior.
 * Core constructors are imported transitively — no mocking of core internals.
 */

let tmpDir: string;
let worktreeDir: string;

async function createTempProject(): Promise<{ projectRoot: string; worktreeBase: string }> {
  const { mkdtemp } = await import('fs/promises');
  const { tmpdir } = await import('os');
  const dir = await mkdtemp(path.join(tmpdir(), 'mcp-di-test-'));
  // realpath for macOS /tmp → /private/tmp symlink
  const realDir = await fs.realpath(dir);

  // .gitgov/ lives in worktree path, not in the repo
  const worktreeBase = getWorktreeBasePath(realDir);
  const gitgovDir = path.join(worktreeBase, '.gitgov');
  await fs.mkdir(gitgovDir, { recursive: true });

  // Create required store directories
  const storeDirs = ['tasks', 'cycles', 'feedback', 'executions', 'actors', 'agents'];
  for (const storeDir of storeDirs) {
    await fs.mkdir(path.join(gitgovDir, storeDir), { recursive: true });
  }

  // Create minimal config.json
  await fs.writeFile(
    path.join(gitgovDir, 'config.json'),
    JSON.stringify({
      protocolVersion: '1.0.0',
      projectId: 'test-project',
      projectName: 'Test Project',
      rootCycle: generateCycleId('root', Date.now()),
    }),
  );

  // Create minimal session.json
  await fs.writeFile(
    path.join(gitgovDir, 'session.json'),
    JSON.stringify({}),
  );

  return { projectRoot: realDir, worktreeBase };
}

describe('McpDependencyInjectionService', () => {
  describe('4.1. DI Lifecycle (MSRV-B1 to MSRV-B5)', () => {
    beforeEach(async () => {
      const project = await createTempProject();
      tmpDir = project.projectRoot;
      worktreeDir = project.worktreeBase;
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
      await fs.rm(worktreeDir, { recursive: true, force: true });
    });

    it('[MSRV-B1] should provide all core adapters and stores via getContainer()', async () => {
      const di = new McpDependencyInjectionService({ projectRoot: tmpDir });
      const container = await di.getContainer();

      // Stores
      expect(container.stores).toBeDefined();
      expect(container.stores.tasks).toBeDefined();
      expect(container.stores.cycles).toBeDefined();
      expect(container.stores.feedbacks).toBeDefined();
      expect(container.stores.executions).toBeDefined();
      expect(container.stores.actors).toBeDefined();
      expect(container.stores.agents).toBeDefined();

      // Adapters
      expect(container.backlogAdapter).toBeDefined();
      expect(container.feedbackAdapter).toBeDefined();
      expect(container.executionAdapter).toBeDefined();
      expect(container.identityModule).toBeDefined();
      expect(container.agentAdapter).toBeDefined();
      expect(container.workflowAdapter).toBeDefined();

      // Modules
      expect(container.lintModule).toBeDefined();
      expect(container.syncModule).toBeDefined();
      expect(container.sourceAuditorModule).toBeDefined();
      expect(container.agentRunner).toBeDefined();
      expect(container.projector).toBeDefined();

      // Infrastructure
      expect(container.configManager).toBeDefined();
      expect(container.sessionManager).toBeDefined();
    });

    it('[MSRV-B2] should discover .gitgov/ from the provided projectRoot', async () => {
      const di = new McpDependencyInjectionService({ projectRoot: tmpDir });
      const container = await di.getContainer();

      // If we got a container without error, .gitgov/ was discovered
      expect(container).toBeDefined();
      expect(container.configManager).toBeDefined();
    });

    it('[MSRV-B3] should throw when .gitgov/ not found at worktree path', async () => {
      // Create a dir without .gitgov/
      const emptyDir = path.join(tmpDir, 'empty-project');
      await fs.mkdir(emptyDir, { recursive: true });

      const di = new McpDependencyInjectionService({ projectRoot: emptyDir });

      await expect(di.getContainer()).rejects.toThrow(/not initialized/i);
    });

    it('[MSRV-B4] should return the same container instance on multiple calls (singleton)', async () => {
      const di = new McpDependencyInjectionService({ projectRoot: tmpDir });
      const container1 = await di.getContainer();
      const container2 = await di.getContainer();

      expect(container1).toBe(container2);
    });

    it('[MSRV-B5] should use the worktree path as base path for all stores', async () => {
      const di = new McpDependencyInjectionService({ projectRoot: tmpDir });
      const container = await di.getContainer();

      // Verify stores can list (empty) without errors — confirms base paths are valid
      const taskIds = await container.stores.tasks.list();
      const cycleIds = await container.stores.cycles.list();
      const actorIds = await container.stores.actors.list();

      expect(taskIds).toEqual([]);
      expect(cycleIds).toEqual([]);
      expect(actorIds).toEqual([]);
    });
  });
});
