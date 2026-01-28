/**
 * Filesystem SessionStore implementation
 */
export {
  FsSessionStore,
  // Factory with explicit projectRoot (for DI containers)
  createSessionManager,
} from './fs_session_store';
