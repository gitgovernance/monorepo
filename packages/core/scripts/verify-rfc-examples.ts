/**
 * Verify RFC-01 §9 Examples — Using @gitgov/core crypto
 *
 * Reproduces ALL cryptographic values from deterministic seeds,
 * then verifies them using core's calculatePayloadChecksum and verifySignatures.
 *
 * Two independent verification paths:
 *   1. Raw Node.js crypto (seed → keypair → sign → compare)
 *   2. @gitgov/core library (calculatePayloadChecksum + verifySignatures)
 *
 * Usage: npx tsx scripts/verify-rfc-examples.ts
 */
import { createHash, createPrivateKey, createPublicKey, sign } from 'crypto';
import { calculatePayloadChecksum } from '../src/crypto/checksum';
import { verifySignatures } from '../src/crypto/signatures';
import type { GitGovRecordPayload, Signature } from '../src/record_types';

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
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
  };
}

function rawSign(payload: object, privateKey: ReturnType<typeof createPrivateKey>, keyId: string, role: string, notes: string, timestamp: number) {
  const canon = JSON.stringify(sortKeys(payload));
  const payloadChecksum = createHash('sha256').update(canon, 'utf8').digest('hex');
  const digest = `${payloadChecksum}:${keyId}:${role}:${notes}:${timestamp}`;
  const digestHash = createHash('sha256').update(digest).digest();
  const signature = sign(null, digestHash, privateKey);
  return { payloadChecksum, signature: signature.toString('base64') };
}

function sortKeys(obj: any): any {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  const sorted: Record<string, any> = {};
  for (const key of Object.keys(obj).sort()) sorted[key] = sortKeys(obj[key]);
  return sorted;
}

// === Verification harness ===

let allPass = true;
function check(label: string, actual: string, expected: string) {
  const pass = actual === expected;
  if (!pass) {
    console.log(`  FAIL ${label}`);
    console.log(`    expected: ${expected}`);
    console.log(`    actual:   ${actual}`);
    allPass = false;
  } else {
    console.log(`  OK   ${label}`);
  }
}

// === RFC §9 expected values ===

const EXPECTED = {
  ex1: {
    payloadChecksum: '063d4ba3505e4d2d3852f6063cbd0b98a8728b2afb4a26a323c5c5c512137398',
    signature: 'yEtlWOGAek8ukP8fycqYZOyogQBudO5XUf4v4BUGaOTogDH4wraanhLvutaJBM7rdilFUS2VvmxZmIy0KjTZAg==',
    publicKey: '0yyrCETtVql51Id+nRKGmpbfsxNxOz+eCYLpWDoutV0=',
  },
  ex2: {
    payloadChecksum: 'bd667ddc8698a50594592ac15d0761e62a9f05cc3ba10a9a853ef0819e5fb2ad',
    agentSignature: '8d9LWTtMlK/Ct4+QWGFpH4iFdZb9T/hlFThAAGKqz8UOPe9qDwPFcv3b4qz9G+NQXh1/PgB1pl8YiQCe6fnjAQ==',
    reviewerSignature: '17xsA75W0zzNZI3DXa8iHmxS5NwedfCwu9DoXwk/vArk9yaHcFsY6EgJHNPUtIX+XeKSVF/lOg6CvVIkcXjjAA==',
    agentPublicKey: 'IadceheUiu6BZ0pvCGUaDcRn4L5UWFyW8ubzcFXl3s4=',
    reviewerPublicKey: 'ugClfzB6ZK1Lo7OAGg3t7facekOrkU158eqtcZCrCcM=',
  },
  ex3: {
    payloadChecksum: '1f9598081fcfcf34732de647de25c8445e68e9320e0c10d3a4bd911c7274a1b3',
    signature: 'W3cSLJnEp+OmKVOwFqjuLTL1S55/OlQyFDzmmxg+vUfETIiQWNr7aDH06/rHUM11g2BLEGRfXZPQPFry6FJeAw==',
    publicKey: 'DDiqTgZimOoChfHVt0neFEFDmi9BvBM23pfwOnh2RNE=',
  },
};

// ========== EXAMPLE 1: ActorRecord ==========
console.log('=== Example 1: ActorRecord ===');
const hk = deriveKeypair('gitgovernance-protocol-example-actor-01');

const actorPayload = {
  id: 'human:lead-dev',
  type: 'human',
  displayName: 'Lead Developer',
  publicKey: hk.publicKey,
  roles: ['developer', 'reviewer'],
  status: 'active',
};

// Path 1: Raw crypto
const raw1 = rawSign(actorPayload, hk.privateKey, 'human:lead-dev', 'author', 'Self-registration of lead developer account', 1752274500);
check('[raw]  publicKey', hk.publicKey, EXPECTED.ex1.publicKey);
check('[raw]  payloadChecksum', raw1.payloadChecksum, EXPECTED.ex1.payloadChecksum);
check('[raw]  signature', raw1.signature, EXPECTED.ex1.signature);

// Path 2: Core library
const coreChecksum1 = calculatePayloadChecksum(actorPayload as unknown as GitGovRecordPayload);
check('[core] payloadChecksum', coreChecksum1, EXPECTED.ex1.payloadChecksum);
check('[core] raw === core checksum', raw1.payloadChecksum, coreChecksum1);

// Path 2b: Core verifySignatures
const signatures1: Signature[] = [{
  keyId: 'human:lead-dev',
  role: 'author',
  notes: 'Self-registration of lead developer account',
  signature: EXPECTED.ex1.signature,
  timestamp: 1752274500,
}];

const coreVerify1 = await verifySignatures(
  { header: { payloadChecksum: EXPECTED.ex1.payloadChecksum, signatures: signatures1 }, payload: actorPayload as unknown as GitGovRecordPayload },
  async (keyId) => keyId === 'human:lead-dev' ? hk.publicKey : null,
);
check('[core] verifySignatures', String(coreVerify1), 'true');

// ========== EXAMPLE 2: ExecutionRecord ==========
console.log('\n=== Example 2: ExecutionRecord ===');
const ak = deriveKeypair('gitgovernance-protocol-example-agent-01');
const rk = deriveKeypair('gitgovernance-protocol-example-reviewer-01');

const execPayload = {
  id: '1752274600-exec-implement-oauth',
  taskId: '1752274500-task-implement-oauth',
  type: 'progress',
  title: 'OAuth 2.0 flow implemented',
  result: 'Completed the OAuth 2.0 authentication flow with GitHub provider. Token refresh and session management included.',
};

// Path 1: Raw crypto
const rawAgent = rawSign(execPayload, ak.privateKey, 'agent:camilo:cursor', 'author', 'OAuth 2.0 flow completed with GitHub provider integration', 1752274600);
const rawReviewer = rawSign(execPayload, rk.privateKey, 'human:camilo', 'reviewer', 'Reviewed and tested locally. LGTM.', 1752274650);
check('[raw]  agent publicKey', ak.publicKey, EXPECTED.ex2.agentPublicKey);
check('[raw]  reviewer publicKey', rk.publicKey, EXPECTED.ex2.reviewerPublicKey);
check('[raw]  payloadChecksum', rawAgent.payloadChecksum, EXPECTED.ex2.payloadChecksum);
check('[raw]  agent signature', rawAgent.signature, EXPECTED.ex2.agentSignature);
check('[raw]  reviewer signature', rawReviewer.signature, EXPECTED.ex2.reviewerSignature);

// Path 2: Core library
const coreChecksum2 = calculatePayloadChecksum(execPayload as unknown as GitGovRecordPayload);
check('[core] payloadChecksum', coreChecksum2, EXPECTED.ex2.payloadChecksum);
check('[core] raw === core checksum', rawAgent.payloadChecksum, coreChecksum2);

const signatures2: Signature[] = [
  { keyId: 'agent:camilo:cursor', role: 'author', notes: 'OAuth 2.0 flow completed with GitHub provider integration', signature: EXPECTED.ex2.agentSignature, timestamp: 1752274600 },
  { keyId: 'human:camilo', role: 'reviewer', notes: 'Reviewed and tested locally. LGTM.', signature: EXPECTED.ex2.reviewerSignature, timestamp: 1752274650 },
];

const keyMap: Record<string, string> = {
  'agent:camilo:cursor': ak.publicKey,
  'human:camilo': rk.publicKey,
};
const coreVerify2 = await verifySignatures(
  { header: { payloadChecksum: EXPECTED.ex2.payloadChecksum, signatures: signatures2 }, payload: execPayload as unknown as GitGovRecordPayload },
  async (keyId) => keyMap[keyId] ?? null,
);
check('[core] verifySignatures', String(coreVerify2), 'true');

// ========== EXAMPLE 3: Custom Record ==========
console.log('\n=== Example 3: Custom Record ===');
const dk = deriveKeypair('gitgovernance-protocol-example-deploy-01');

const deployPayload = {
  deploymentId: 'deploy-2025-07-12-v2.1.0',
  environment: 'production',
  status: 'success',
};

// Path 1: Raw crypto
const raw3 = rawSign(deployPayload, dk.privateKey, 'agent:deploy-bot', 'author', 'Production deployment of v2.1.0', 1752274700);
check('[raw]  publicKey', dk.publicKey, EXPECTED.ex3.publicKey);
check('[raw]  payloadChecksum', raw3.payloadChecksum, EXPECTED.ex3.payloadChecksum);
check('[raw]  signature', raw3.signature, EXPECTED.ex3.signature);

// Path 2: Core library
const coreChecksum3 = calculatePayloadChecksum(deployPayload as unknown as GitGovRecordPayload);
check('[core] payloadChecksum', coreChecksum3, EXPECTED.ex3.payloadChecksum);
check('[core] raw === core checksum', raw3.payloadChecksum, coreChecksum3);

const signatures3: Signature[] = [{
  keyId: 'agent:deploy-bot',
  role: 'author',
  notes: 'Production deployment of v2.1.0',
  signature: EXPECTED.ex3.signature,
  timestamp: 1752274700,
}];

const coreVerify3 = await verifySignatures(
  { header: { payloadChecksum: EXPECTED.ex3.payloadChecksum, signatures: signatures3 }, payload: deployPayload as unknown as GitGovRecordPayload },
  async (keyId) => keyId === 'agent:deploy-bot' ? dk.publicKey : null,
);
check('[core] verifySignatures', String(coreVerify3), 'true');

// ========== RESULT ==========
console.log(`\n${'='.repeat(50)}`);
if (allPass) {
  console.log('ALL CHECKS PASSED — raw crypto and @gitgov/core agree on every value.');
} else {
  console.log('SOME CHECKS FAILED — see above.');
  process.exit(1);
}
