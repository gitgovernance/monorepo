/**
 * Core Integration Test Helpers — Level 2.
 *
 * Provides temp .gitgov/ project creation, actor seeding with Ed25519 keys,
 * and ToolResult parsing for testing handlers with real DI + real filesystem.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { execSync } from 'child_process';
import { generateKeyPairSync } from 'crypto';
import { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { ToolResult } from '../../server/mcp_server.types.js';
import type { TempGitgovProject, ParsedToolResult } from './mcp_core_integration.types.js';

const STORE_DIRS = ['tasks', 'cycles', 'feedback', 'executions', 'changelogs', 'actors', 'agents'];

// ─── Crypto Helpers ───

/** Generate an Ed25519 key pair in the format core expects */
function generateTestKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // Extract raw Ed25519 public key (last 32 bytes of SPKI DER)
  const rawPublicKey = publicKey.subarray(-32);

  return {
    publicKey: rawPublicKey.toString('base64'),
    privateKey: Buffer.from(privateKey).toString('base64'),
  };
}

// ─── Temp Project Factory ───

/**
 * Creates a minimal .gitgov/ structure in a temp directory with git init.
 * Includes a seeded test-actor with Ed25519 key pair and session pointing to it.
 */
export async function createTempGitgovProject(): Promise<TempGitgovProject> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-core-test-'));
  const projectRoot = await fs.realpath(dir); // macOS /tmp → /private/tmp
  const gitgovPath = path.join(projectRoot, '.gitgov');

  // git init (needed for source auditor and sync)
  execSync('git init', { cwd: projectRoot, stdio: 'ignore' });
  execSync('git config user.email "test@test.com"', { cwd: projectRoot, stdio: 'ignore' });
  execSync('git config user.name "Test"', { cwd: projectRoot, stdio: 'ignore' });

  // Create .gitgov/ structure
  await fs.mkdir(gitgovPath, { recursive: true });
  for (const storeDir of STORE_DIRS) {
    await fs.mkdir(path.join(gitgovPath, storeDir), { recursive: true });
  }

  // Create config.json
  await fs.writeFile(
    path.join(gitgovPath, 'config.json'),
    JSON.stringify({
      protocolVersion: '1.0.0',
      projectId: 'test-project',
      projectName: 'Test Project',
      rootCycle: 'root',
    }),
  );

  // Create .session.json with test-actor (dot-prefixed — required by core SessionManager)
  await fs.writeFile(
    path.join(gitgovPath, '.session.json'),
    JSON.stringify({
      lastSession: {
        actorId: 'test-actor',
        timestamp: new Date().toISOString(),
      },
    }),
  );

  // Generate Ed25519 key pair for the test actor
  const keys = generateTestKeyPair();

  // Seed the test-actor record with real public key
  // Roles must include approver:product (approve) and approver:quality (complete)
  // per the default Kanban workflow config signature requirements
  await seedActor(gitgovPath, {
    id: 'test-actor',
    displayName: 'Test Actor',
    type: 'human',
    roles: ['admin', 'author', 'approver:product', 'approver:quality'],
    publicKey: keys.publicKey,
  });

  // Store private key in .gitgov/actors/test-actor.key (FsKeyProvider format)
  await fs.writeFile(
    path.join(gitgovPath, 'actors', 'test-actor.key'),
    keys.privateKey,
    { mode: 0o600 },
  );

  const cleanup = async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  };

  return { projectRoot, gitgovPath, cleanup };
}

// ─── Seed Helpers ───

/** Writes an actor record directly to .gitgov/actors/ */
export async function seedActor(
  gitgovPath: string,
  actor: {
    id: string;
    displayName: string;
    type: 'human' | 'agent';
    roles?: string[];
    publicKey?: string;
  },
): Promise<void> {
  const record = {
    header: {
      createdAt: new Date().toISOString(),
      createdBy: actor.id,
      version: 1,
    },
    payload: {
      id: actor.id,
      displayName: actor.displayName,
      type: actor.type,
      publicKey: actor.publicKey ?? '',
      roles: actor.roles ?? ['contributor'],
      status: 'active',
    },
  };

  await fs.writeFile(
    path.join(gitgovPath, 'actors', `${actor.id}.json`),
    JSON.stringify(record, null, 2),
  );
}

// ─── DI Factory ───

/** Creates a real McpDependencyInjectionService for a temp project */
export function createDI(projectRoot: string): McpDependencyInjectionService {
  return new McpDependencyInjectionService({ projectRoot });
}

// ─── Result Parser ───

/** Parses a ToolResult into typed data and isError flag */
export function parseToolResult<T = Record<string, unknown>>(result: ToolResult): ParsedToolResult<T> {
  const text = result.content[0]?.text ?? '{}';
  const data = JSON.parse(text) as T;
  return { data, isError: result.isError ?? false };
}
