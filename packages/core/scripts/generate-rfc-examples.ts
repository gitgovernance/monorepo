/**
 * Generate RFC-01 §9 Examples — Deterministic & Verifiable
 *
 * Same methodology as RFC-01 §10 test vectors:
 * - Seed string → SHA-256 → Ed25519 keypair
 * - Payload → core calculatePayloadChecksum → payloadChecksum
 * - Digest → SHA-256 → Ed25519_Sign → signature
 *
 * Uses @gitgov/core crypto for checksum calculation.
 * Seed-based key derivation uses raw Node.js crypto (deterministic, not random).
 *
 * Usage: npx tsx scripts/generate-rfc-examples.ts
 */
import { createHash, createPrivateKey, createPublicKey, sign } from 'crypto';
import { calculatePayloadChecksum } from '../src/crypto/checksum';
import type { GitGovRecordPayload } from '../src/record_types';

// === Seed-based keypair derivation (same as test vectors) ===

function deriveKeypair(seedString: string) {
  const seed = createHash('sha256').update(seedString).digest();
  const privateKey = createPrivateKey({
    key: Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'),
      seed.slice(0, 32),
    ]),
    format: 'der',
    type: 'pkcs8',
  });
  const publicKeyObj = createPublicKey(privateKey);
  const pubKeyDer = publicKeyObj.export({ type: 'spki', format: 'der' });
  const rawPubKey = (pubKeyDer as Buffer).slice(-32);
  return {
    privateKey,
    publicKey: rawPubKey.toString('base64'),
    seed: seed.slice(0, 32).toString('hex'),
  };
}

function signRecord(
  payload: Record<string, unknown>,
  privateKey: ReturnType<typeof createPrivateKey>,
  keyId: string,
  role: string,
  notes: string,
  timestamp: number,
) {
  const payloadChecksum = calculatePayloadChecksum(payload as unknown as GitGovRecordPayload);
  const digest = `${payloadChecksum}:${keyId}:${role}:${notes}:${timestamp}`;
  const digestHash = createHash('sha256').update(digest).digest();
  const signature = sign(null, digestHash, privateKey);
  return {
    payloadChecksum,
    signature: signature.toString('base64'),
    digest,
    digestHash: digestHash.toString('hex'),
  };
}

// === Generate Examples ===

console.log('=== RFC-01 §9 Examples — Deterministic Generation ===\n');

// --- Example 1: ActorRecord (single signature) ---
const humanKeys = deriveKeypair('gitgovernance-protocol-example-actor-01');

const actorPayload = {
  id: 'human:lead-dev',
  type: 'human',
  displayName: 'Lead Developer',
  publicKey: humanKeys.publicKey,
  roles: ['developer', 'reviewer'],
  status: 'active',
};

const actorTimestamp = 1752274500;
const actor = signRecord(actorPayload, humanKeys.privateKey, 'human:lead-dev', 'author', 'Self-registration of lead developer account', actorTimestamp);

console.log('--- Example 1: ActorRecord ---');
console.log(`Seed: SHA-256("gitgovernance-protocol-example-actor-01") = ${humanKeys.seed}`);
console.log(`Public Key: ${humanKeys.publicKey}`);
console.log(`payloadChecksum: ${actor.payloadChecksum}`);
console.log(`Digest: ${actor.digest}`);
console.log(`SHA-256(digest): ${actor.digestHash}`);
console.log(`Signature: ${actor.signature}`);

const example1 = {
  header: {
    version: '1.1',
    type: 'actor',
    payloadChecksum: actor.payloadChecksum,
    signatures: [{
      keyId: 'human:lead-dev',
      role: 'author',
      notes: 'Self-registration of lead developer account',
      signature: actor.signature,
      timestamp: actorTimestamp,
    }],
  },
  payload: actorPayload,
};

console.log('\nJSON:');
console.log(JSON.stringify(example1, null, 2));

// --- Example 2: ExecutionRecord (agent + human reviewer) ---
const agentKeys = deriveKeypair('gitgovernance-protocol-example-agent-01');
const reviewerKeys = deriveKeypair('gitgovernance-protocol-example-reviewer-01');

const execPayload = {
  id: '1752274600-exec-implement-oauth',
  taskId: '1752274500-task-implement-oauth',
  type: 'progress',
  title: 'OAuth 2.0 flow implemented',
  result: 'Completed the OAuth 2.0 authentication flow with GitHub provider. Token refresh and session management included.',
};

const agentTimestamp = 1752274600;
const reviewerTimestamp = 1752274650;
const execAgent = signRecord(execPayload, agentKeys.privateKey, 'agent:camilo:cursor', 'author', 'OAuth 2.0 flow completed with GitHub provider integration', agentTimestamp);
const execReviewer = signRecord(execPayload, reviewerKeys.privateKey, 'human:camilo', 'reviewer', 'Reviewed and tested locally. LGTM.', reviewerTimestamp);

console.log('\n--- Example 2: ExecutionRecord ---');
console.log(`Agent Seed: SHA-256("gitgovernance-protocol-example-agent-01") = ${agentKeys.seed}`);
console.log(`Agent Public Key: ${agentKeys.publicKey}`);
console.log(`Reviewer Seed: SHA-256("gitgovernance-protocol-example-reviewer-01") = ${reviewerKeys.seed}`);
console.log(`Reviewer Public Key: ${reviewerKeys.publicKey}`);
console.log(`payloadChecksum: ${execAgent.payloadChecksum}`);
console.log(`Agent Signature: ${execAgent.signature}`);
console.log(`Reviewer Signature: ${execReviewer.signature}`);

const example2 = {
  header: {
    version: '1.1',
    type: 'execution',
    payloadChecksum: execAgent.payloadChecksum,
    signatures: [
      {
        keyId: 'agent:camilo:cursor',
        role: 'author',
        notes: 'OAuth 2.0 flow completed with GitHub provider integration',
        signature: execAgent.signature,
        timestamp: agentTimestamp,
      },
      {
        keyId: 'human:camilo',
        role: 'reviewer',
        notes: 'Reviewed and tested locally. LGTM.',
        signature: execReviewer.signature,
        timestamp: reviewerTimestamp,
      },
    ],
  },
  payload: execPayload,
};

console.log('\nJSON:');
console.log(JSON.stringify(example2, null, 2));

// --- Example 3: Custom record (no payload validation, illustrative) ---
const deployKeys = deriveKeypair('gitgovernance-protocol-example-deploy-01');

const deployPayload = {
  deploymentId: 'deploy-2025-07-12-v2.1.0',
  environment: 'production',
  status: 'success',
};

const deployTimestamp = 1752274700;
const deploy = signRecord(deployPayload, deployKeys.privateKey, 'agent:deploy-bot', 'author', 'Production deployment of v2.1.0', deployTimestamp);

console.log('\n--- Example 3: Custom Record ---');
console.log(`Seed: SHA-256("gitgovernance-protocol-example-deploy-01") = ${deployKeys.seed}`);
console.log(`Public Key: ${deployKeys.publicKey}`);
console.log(`payloadChecksum: ${deploy.payloadChecksum}`);
console.log(`Signature: ${deploy.signature}`);

const example3 = {
  header: {
    version: '1.1',
    type: 'custom',
    schemaUrl: 'https://example.com/schemas/deployment-record-v1.json',
    schemaChecksum: 'd4e5f6a1b2c3789012345678901234567890123456789012345678901234abcd',
    payloadChecksum: deploy.payloadChecksum,
    signatures: [{
      keyId: 'agent:deploy-bot',
      role: 'author',
      notes: 'Production deployment of v2.1.0',
      signature: deploy.signature,
      timestamp: deployTimestamp,
    }],
  },
  payload: deployPayload,
};

console.log('\nJSON:');
console.log(JSON.stringify(example3, null, 2));

console.log('\n=== Done ===');
