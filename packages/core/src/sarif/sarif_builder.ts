import Ajv from 'ajv-draft-04';
import addFormats from 'ajv-formats';
import type {
  SarifBuilder,
  SarifBuilderOptions,
  SarifLog,
  SarifRun,
  SarifResult,
  SarifInvocation,
  SarifReportingDescriptor,
  SarifSuppression,
  SarifResultProperties,
  SarifRunProperties,
  ValidationResult,
  SarifActiveWaiver,
} from './sarif.types';
import type { Finding } from '../finding_detector/types';
import {
  buildPartialFingerprints,
  createOccurrenceContext,
} from './sarif_hash';
import sarifSchema from './fixtures/sarif-schema-2.1.0.json';
import { FindingRedactor, DEFAULT_REDACTION_CONFIG } from '../redaction';

/** Official SARIF 2.1.0 Errata 01 schema URL */
const SARIF_SCHEMA_URL =
  'https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json';

/**
 * Maps GitGov FindingSeverity to SARIF level.
 * §3.27.10 level property
 */
function mapSeverityToLevel(severity: Finding['severity']): SarifResult['level'] {
  switch (severity) {
    case 'critical': return 'error';
    case 'high':     return 'error';
    case 'medium':   return 'warning';
    case 'low':      return 'note';
    case 'info':     return 'none';
  }
}

/**
 * Extracts unique rule descriptors from findings.
 * Deduplicates by ruleId — first finding with a given ruleId wins
 * (its message becomes shortDescription).
 */
function extractRules(findings: Finding[]): SarifReportingDescriptor[] {
  const seen = new Set<string>();
  const rules: SarifReportingDescriptor[] = [];

  for (const f of findings) {
    if (!seen.has(f.ruleId)) {
      seen.add(f.ruleId);
      rules.push({
        id: f.ruleId,
        shortDescription: { text: f.message },
        ...(f.fixes && f.fixes.length > 0 && { fullDescription: { text: f.fixes[0]!.description } }),
        ...(f.legalReference && { helpUri: `https://gitgovernance.com/rules/${f.ruleId}` }),
      });
    }
  }

  return rules;
}

/**
 * Finds a waiver matching the given fingerprint.
 * Matching is by partialFingerprint (primaryLocationLineHash/v1).
 */
function findMatchingWaiver(
  fingerprint: string | undefined,
  waivers: SarifActiveWaiver[] | undefined
): SarifActiveWaiver | undefined {
  if (!fingerprint || !waivers || waivers.length === 0) {
    return undefined;
  }
  return waivers.find(w => w.fingerprint === fingerprint);
}

/**
 * Builds a SARIF suppression from a SarifActiveWaiver.
 * FeedbackRecord type: "approval" → kind: "inSource", status: "accepted"
 */
function buildSuppression(waiver: SarifActiveWaiver): SarifSuppression {
  return {
    kind: 'inSource',
    status: 'accepted',
    ...(waiver.content && { justification: waiver.content }),
    properties: {
      'gitgov/feedbackId': waiver.feedbackId,
      ...(waiver.expiresAt && { 'gitgov/expiresAt': waiver.expiresAt }),
      ...(waiver.approvedBy && { 'gitgov/approvedBy': waiver.approvedBy }),
    },
  };
}

/**
 * Builds the invocations array if any invocation fields are present.
 * Note: executionId triggers invocations because it populates
 * invocations[0].properties["gitgov/executionId"] — an invocation-scoped field.
 */
function buildInvocations(options: SarifBuilderOptions): SarifInvocation[] | undefined {
  const hasInvocationData =
    options.executionId !== undefined ||
    options.startTimeUtc !== undefined ||
    options.endTimeUtc !== undefined ||
    options.commandLine !== undefined ||
    options.exitCode !== undefined;

  if (!hasInvocationData) {
    return undefined;
  }

  const invocation: SarifInvocation = {
    executionSuccessful: options.executionSuccessful ?? true,
    ...(options.startTimeUtc && { startTimeUtc: options.startTimeUtc }),
    ...(options.endTimeUtc && { endTimeUtc: options.endTimeUtc }),
    ...(options.commandLine && { commandLine: options.commandLine }),
    ...(options.exitCode !== undefined && { exitCode: options.exitCode }),
    ...(options.executionId && {
      properties: { 'gitgov/executionId': options.executionId },
    }),
  };

  return [invocation];
}

class SarifBuilderImpl implements SarifBuilder {
  private readonly validateFn: ReturnType<Ajv['compile']>;

  constructor() {
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    this.validateFn = ajv.compile(sarifSchema);
  }

  async build(options: SarifBuilderOptions): Promise<SarifLog> {
    const rules = extractRules(options.findings);

    // Build partialFingerprints per finding
    // IMPORTANT: Process sequentially to avoid race conditions on occurrence counters.
    // Promise.all + shared Map = corrupted occurrence counts.
    const fileContexts = new Map<string, Map<string, number>>();
    const results: SarifResult[] = [];

    for (const finding of options.findings) {
        // Get or create occurrence context for this file
        if (!fileContexts.has(finding.file)) {
          fileContexts.set(finding.file, createOccurrenceContext());
        }
        const context = fileContexts.get(finding.file)!;

        const partial = await buildPartialFingerprints(
          finding.file,
          finding.line,
          options.getLineContent,
          context
        );

        // Note: if getLineContent is not provided, partial is {} and fingerprint is undefined,
        // so waivers cannot match. Callers MUST provide getLineContent for waiver matching to work.
        const waiver = findMatchingWaiver(
          partial['primaryLocationLineHash/v1'],
          options.activeWaivers
        );

        // result.properties — only defined keys (no undefined values)
        const props: SarifResultProperties = {
          'gitgov/category': finding.category,
          'gitgov/detector': finding.detector,
          'gitgov/confidence': finding.confidence,
        };
        if (options.executionId)     props['gitgov/executionId']     = options.executionId;
        if (options.taskId)          props['gitgov/taskId']          = options.taskId;
        if (options.actorId)         props['gitgov/actorId']         = options.actorId;
        if (options.payloadChecksum) props['gitgov/payloadChecksum'] = options.payloadChecksum;
        if (options.protocolVersion) props['gitgov/protocolVersion'] = options.protocolVersion;
        if (finding.legalReference)  props['gitgov/legalReference']  = finding.legalReference;

        const region: SarifResult['locations'][0]['physicalLocation']['region'] = {
          startLine: finding.line,
        };
        if (finding.column !== undefined) {
          region.startColumn = finding.column;
        }
        // Finding.snippet is string (required) but empty string means "no snippet" — omit from SARIF
        if (finding.snippet) {
          region.snippet = { text: finding.snippet };
        }

        const result: SarifResult = {
          ruleId: finding.ruleId,
          level: mapSeverityToLevel(finding.severity),
          message: { text: finding.message },
          locations: [{
            physicalLocation: {
              artifactLocation: { uri: finding.file },
              region,
            },
          }],
          properties: props,
        };

        if (Object.keys(partial).length > 0) {
          result.partialFingerprints = partial;
        }
        // SARIF §3.55.4 — text-only fixes go in rules[].fullDescription (SARIF-C9)
        // result.fixes[] requires artifactChanges (schema mandates it)
        // Only emit result.fixes when concrete diffs are provided (future)
        if (waiver) {
          result.suppressions = [buildSuppression(waiver)];
        }

        results.push(result);
    }

    // run.properties — only defined keys
    const runProps: SarifRunProperties = {};
    if (options.policyDecision !== undefined)  runProps['gitgov/policyDecision']  = options.policyDecision;
    if (options.signatureCount !== undefined)  runProps['gitgov/signatureCount']  = options.signatureCount;
    if (options.agentId)                       runProps['gitgov/agentId']          = options.agentId;
    if (options.scanScope)                     runProps['gitgov/scanScope']        = options.scanScope;
    if (options.scannedFiles !== undefined)    runProps['gitgov/scannedFiles']     = options.scannedFiles;
    if (options.scannedLines !== undefined)    runProps['gitgov/scannedLines']     = options.scannedLines;
    if (options.redactionLevel)                runProps['gitgov/redactionLevel']   = options.redactionLevel;

    const invocations = buildInvocations(options);

    const run: SarifRun = {
      tool: {
        driver: {
          name: options.toolName,
          version: options.toolVersion,
          informationUri: options.informationUri,
          rules,
        },
      },
      results,
    };

    if (invocations) {
      run.invocations = invocations;
    }
    if (Object.keys(runProps).length > 0) {
      run.properties = runProps;
    }

    // SARIF-L1/L2/L3: versionControlProvenance §3.14.16
    // repositoryUri is required per SARIF spec — only create provenance when it's provided
    if (options.repositoryUri) {
      run.versionControlProvenance = [{
        repositoryUri: options.repositoryUri,
        ...(options.commitHash ? { revisionId: options.commitHash } : {}),
        ...(options.branch ? { branch: options.branch } : {}),
      }];
    }

    const sarifLog: SarifLog = {
      $schema: SARIF_SCHEMA_URL,
      version: '2.1.0',
      runs: [run],
    };

    // Apply redaction when redactionLevel is set (SARIF-M1..M4)
    if (options.redactionLevel) {
      const config = options.redactionConfig ?? DEFAULT_REDACTION_CONFIG;
      const redactor = new FindingRedactor(config);
      return redactor.redactSarif(sarifLog, options.redactionLevel);
    }

    return sarifLog;
  }

  validate(sarif: SarifLog): ValidationResult {
    const valid = this.validateFn(sarif);

    if (valid) {
      return { valid: true };
    }

    const errors = (this.validateFn.errors ?? []).map(
      (e) => `${e.instancePath || '/'} ${e.message ?? 'unknown error'}`
    );

    return { valid: false, errors };
  }
}

/**
 * Factory function for SarifBuilder.
 * Creates a new instance with embedded JSON Schema validator.
 *
 * Why factory instead of direct functions (buildSarif/validateSarif):
 * The constructor pre-compiles the SARIF JSON Schema with ajv (~50ms).
 * Reusing the instance between calls avoids re-compilation on each validate().
 * The builder has internal state (compiled ajv instance) — that justifies the factory pattern.
 */
export function createSarifBuilder(): SarifBuilder {
  return new SarifBuilderImpl();
}

/**
 * Maps ActiveWaiver (from WaiverReader in source_auditor) to SarifActiveWaiver.
 *
 * ActiveWaiver has: fingerprint, ruleId, expiresAt (Date), feedback (FeedbackRecord complete).
 * SarifActiveWaiver has: fingerprint, feedbackId (string), content (string), expiresAt (ISO string), approvedBy.
 *
 * The caller (orchestrator) uses it when building the final consolidated SARIF with --output sarif.
 */
export function toSarifWaiver(waiver: {
  fingerprint: string;
  feedback: { id: string; content?: string; };
  expiresAt?: Date;
  approvedBy?: string;
}): SarifActiveWaiver {
  const result: SarifActiveWaiver = {
    fingerprint: waiver.fingerprint,
    feedbackId: waiver.feedback.id,
    content: waiver.feedback.content ?? '',
  };
  if (waiver.expiresAt !== undefined) {
    result.expiresAt = waiver.expiresAt.toISOString();
  }
  if (waiver.approvedBy !== undefined) {
    result.approvedBy = waiver.approvedBy;
  }
  return result;
}
