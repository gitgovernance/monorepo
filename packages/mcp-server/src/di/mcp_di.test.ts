import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import { McpDependencyInjectionService } from './mcp_di.js';

/**
 * McpDependencyInjectionService tests — Block B (MSRV-B1 to MSRV-B5)
 *
 * These tests use a real temp directory with .gitgov/ structure.
 * Core constructors are imported transitively — no mocking of core internals.
 */

let tmpDir: string;

async function createTempProject(): Promise<string> {
  const { mkdtemp } = await import('fs/promises');
  const { tmpdir } = await import('os');
  const dir = await mkdtemp(path.join(tmpdir(), 'mcp-di-test-'));
  // realpath for macOS /tmp → /private/tmp symlink
  const realDir = await fs.realpath(dir);

  // Create minimal .gitgov/ structure
  const gitgovDir = path.join(realDir, '.gitgov');
  await fs.mkdir(gitgovDir, { recursive: true });

  // Create required store directories
  const storeDirs = ['tasks', 'cycles', 'feedback', 'executions', 'changelogs', 'actors', 'agents'];
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
      rootCycle: 'root',
    }),
  );

  // Create minimal session.json
  await fs.writeFile(
    path.join(gitgovDir, 'session.json'),
    JSON.stringify({}),
  );

  return realDir;
}

describe('McpDependencyInjectionService', () => {
  describe('4.1. DI Lifecycle (MSRV-B1 to MSRV-B5)', () => {
    beforeEach(async () => {
      tmpDir = await createTempProject();
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
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
      expect(container.stores.changelogs).toBeDefined();
      expect(container.stores.actors).toBeDefined();
      expect(container.stores.agents).toBeDefined();

      // Adapters
      expect(container.backlogAdapter).toBeDefined();
      expect(container.feedbackAdapter).toBeDefined();
      expect(container.executionAdapter).toBeDefined();
      expect(container.identityAdapter).toBeDefined();

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

    it('[MSRV-B3] should throw when .gitgov/ not found and no gitgov-state branch', async () => {
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

    it('[MSRV-B5] should use the project root as base path for all stores', async () => {
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
