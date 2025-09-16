---
inclusion: always
---

# Product Roadmap & Development Priorities

Development priorities and feature sequencing for GitGovernance. Use this to understand what to build first and how features relate to business objectives.

## Current Phase: Foundation & Community (Q3 2025)

**Priority Order for Development:**

1. **Core Protocol Foundation** (`packages/protocol/`, `packages/core/`)
   - Complete all 7 record types with JSON schemas
   - Implement `RecordStore<T>` with cryptographic signing
   - Build essential adapters: `BacklogAdapter`, `IdentityAdapter`, `ProjectAdapter`
   - Establish `EventBus` communication pattern

2. **CLI Completeness** (`packages/cli/`)
   - `gitgov init` - Bootstrap governance in any repository
   - `gitgov task` - Complete task lifecycle management
   - `gitgov actor` - Identity and key management
   - `gitgov audit` - Verification and integrity checking

3. **SaaS Preview** (`packages/saas/`)
   - Read-only dashboard for `.gitgov/` visualization
   - Repository connection and sync
   - Basic team collaboration features

**Development Rules:**

- Protocol specifications MUST be written before implementation
- All core adapters MUST use `RecordStore<T>` and `EventBus`
- CLI commands MUST work offline-first
- Focus on developer experience over enterprise features

## Phase 2: Commercial Platform (Q4 2025)

**Key Technical Milestones:**

- `packages/platform/` - Agent orchestration backend
- Real-time collaboration via WebSocket connections
- Agent Factory for custom workflow automation
- Full read/write SaaS capabilities

## Phase 3: Intelligent Orchestration (2026+)

**Advanced Capabilities:**

- Autonomous agents with predictive capabilities
- Enterprise security and compliance features
- Third-party module marketplace
- Advanced analytics and reporting

## Feature Gating Strategy

**Open Source (Always Free):**

- Core protocol and business logic
- Local CLI operations
- Basic record types and validation

**Freemium (SaaS Preview):**

- Read-only dashboard
- Repository visualization
- Basic team features (up to 5 users)

**Premium (Commercial):**

- Real-time collaboration
- Agent orchestration
- Advanced analytics
- Enterprise security features

## Success Metrics by Phase

**Phase 1 Targets:**

- 500+ GitHub stars on core repositories
- 100+ teams using SaaS preview
- 50+ community contributions

**Phase 2 Targets:**

- 20+ paying customers
- $50K+ MRR
- 5+ custom agents deployed

**Phase 3 Targets:**

- Category leadership position
- $5M+ ARR
- 100+ enterprise customers
