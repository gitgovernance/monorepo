/**
 * FS Helpers — Read .gitgov/ records, list IDs, resolve worktree paths.
 * [HLP-C1] Worktree path resolution, [HLP-C2] Record reading via FsRecordStore.
 */
import * as path from 'path';
import { FsRecordStore, DEFAULT_ID_ENCODER, getWorktreeBasePath } from '@gitgov/core/fs';
import { FsRecordProjection } from '@gitgov/core/fs';

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
