// Core interfaces - backend-agnostic
export { DEFAULT_ID_ENCODER } from './record_store';
export type { RecordStore, IdEncoder } from './record_store';
export * from './record_store.types';

// NOTE: Implementations are exported via subpaths:
// - @gitgov/core/fs -> FsRecordStore
// - @gitgov/core/memory -> MemoryRecordStore
// ConfigStore is now in its own module: @gitgov/core/config_store
