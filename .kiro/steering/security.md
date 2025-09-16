---
inclusion: always
---

# Security Guidelines

Security is foundational to GitGovernance. All code must implement cryptographic primitives and follow the trust model defined here.

## Trust Model

### Root of Trust

- System trust bootstraps from the first `ActorRecord` created during `gitgov init`
- This initial actor (typically project founder) holds ultimate authority via Ed25519 keypair
- All subsequent actors must be created via signed transactions from existing actors with admin privileges
- Creates unbroken, auditable chain of trust

### Key Management Rules

- **Cryptography**: Ed25519 for all digital signatures (performance + security)
- **Private Keys**: NEVER store in Git repository
  - Store locally per actor
  - Configure path via `git config --local` (not committed)
- **Public Keys**: Store in Base64 format within `ActorRecord` (committed to governance ledger)
- **Key Rotation**: Revoke compromised keys, don't delete
  - Create new `ActorRecord` with new key
  - Update old record to point to successor
  - Preserves historical signature integrity

## Signature Implementation

### Signature Digest Formula

NEVER sign data payload directly. Always sign digest string:

```
digest = <payloadChecksum>:<keyId>:<role>:<timestamp>
```

- `payloadChecksum`: SHA-256 hash of data payload (integrity)
- `keyId`: ID of signing actor (authenticity)
- `role`: Signature context (`author`, `approver`, etc.) (intent)
- `timestamp`: Unix timestamp (timeliness)

### Verification Process

All `GitGovRecord` types use `EmbeddedMetadata` wrapper with `header` and `payload`.

**Two-step verification (both must pass):**

1. **Integrity Check**: Recalculate SHA-256 of `payload`, verify matches `header.payloadChecksum`
2. **Signature Check**: For each signature in `header.signatures`:
   - Reconstruct digest using header data
   - Fetch `publicKey` from `ActorRecord` by `keyId`
   - Verify signature against reconstructed digest

## Implementation Requirements

### Code Generation Rules

- Use `CryptoModule` for all cryptographic operations
- Implement signature verification in all adapters that read records
- Never bypass verification for "performance" reasons
- All record creation must go through signing process

### Error Handling

- Invalid signatures must fail fast with clear error messages
- Missing keys should provide guidance on key setup
- Verification failures must be logged for audit purposes

### Testing Requirements

- Test signature verification with valid and invalid signatures
- Test key rotation scenarios
- Test digest reconstruction accuracy
- Mock cryptographic operations for unit tests only
