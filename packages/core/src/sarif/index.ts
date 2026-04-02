// Public API of @gitgov/core/sarif
export { createSarifBuilder } from './sarif_builder';
export { toSarifSuppression } from './sarif_builder';
export {
  normalizeLineContent,
  computePrimaryLocationLineHash,
  buildPartialFingerprints,
  createOccurrenceContext,
} from './sarif_hash';
export type { OccurrenceContext } from './sarif.types';
export type {
  SarifLog,
  SarifRun,
  SarifTool,
  SarifToolDriver,
  SarifResult,
  SarifLevel,
  SarifLocation,
  SarifPhysicalLocation,
  SarifRegion,
  SarifSuppression,
  SarifInvocation,
  SarifReportingDescriptor,
  SarifResultProperties,
  SarifRunProperties,
  SarifBuilderOptions,
  SarifBuilder,
  ValidationResult,
  RedactionLevel,
  GetLineContentFn,
  SarifVersionStrategy,
  SarifExecutionMetadata,
} from './sarif.types';
