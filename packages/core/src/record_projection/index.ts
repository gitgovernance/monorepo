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
  IRecordProjection,
  ProjectionContext,
} from './record_projection.types';

// Implementation
export { RecordProjector } from './record_projection';
