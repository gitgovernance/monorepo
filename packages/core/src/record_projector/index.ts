// Types
export type {
  AllRecords,
  DerivedStates,
  DerivedStateSets,
  EnrichedTaskRecord,
  IndexData,
  RecordProjectorDependencies,
  IntegrityError,
  IntegrityWarning,
  IntegrityReport,
  IndexGenerationReport,
  IRecordProjector,
  IProjectionSink,
  ProjectionContext,
} from './record_projector.types';

// Implementation
export { RecordProjector } from './record_projector';
