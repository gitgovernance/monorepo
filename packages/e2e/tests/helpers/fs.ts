/**
 * FS Helpers — Read .gitgov/ records, list IDs, resolve worktree paths.
 * [HLP-C1] Worktree path resolution, [HLP-C2] Record reading via FsRecordStore.
 */
import * as path from 'path';
import { FsRecordStore, DEFAULT_ID_ENCODER, getWorktreeBasePath } from '@gitgov/core/fs';
import { FsRecordProjection } from '@gitgov/core/fs';

import * as fs from 'fs';

export { FsRecordStore, DEFAULT_ID_ENCODER, FsRecordProjection, getWorktreeBasePath };

export type ParsedRecord = {
  header: {
    version: string;
    type: string;
    payloadChecksum: string;
    signatures: Array<{
      keyId: string;
      role: string;
      notes: string;
      signature: string;
      timestamp: number;
    }>;
  };
  payload: {
    id: string;
    [key: string]: unknown;
  };
};

export const SKIP_CLEANUP = process.env['SKIP_CLEANUP'] === '1';

// [HLP-C1] Resolve worktree-based .gitgov/ path
export const getGitgovDir = (repoPath: string): string => {
  return path.join(getWorktreeBasePath(repoPath), '.gitgov');
};

/**
 * Set state branch name in .gitgov/config.json.
 * Used by E2E tests to give each test its own branch, avoiding conflicts.
 * Must be called AFTER `gitgov init` and BEFORE `gitgov sync push`.
 */
export function setStateBranch(repoDir: string, branchName: string): void {
  const configPath = path.join(getGitgovDir(repoDir), 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  if (!config.state) config.state = {};
  config.state.branch = branchName;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// [HLP-C2] List record IDs via FsRecordStore
export const listRecordIds = async (repoDir: string, dir: string): Promise<string[]> => {
  const gitgovDir = getGitgovDir(repoDir);
  const store = new FsRecordStore<ParsedRecord>({ basePath: path.join(gitgovDir, dir) });
  return store.list();
};

// [HLP-C2] Read a single record via FsRecordStore
export const readRecord = async <T = ParsedRecord>(repoDir: string, dir: string, id: string): Promise<T> => {
  const gitgovDir = getGitgovDir(repoDir);
  const store = new FsRecordStore<T>({ basePath: path.join(gitgovDir, dir) });
  const record = await store.get(id);
  if (!record) throw new Error(`Record not found: ${gitgovDir}/${dir}/${id}`);
  return record;
};
