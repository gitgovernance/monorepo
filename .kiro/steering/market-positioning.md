---
inclusion: always
---

# Market Positioning & Product Philosophy

Strategic positioning and core principles that guide all product decisions and feature development.

## Core Product Philosophy

When building features or making product decisions, always align with these foundational principles:

### 1. Audit-First Over Productivity-First

- **Rule**: Governance and traceability take priority over task completion speed
- **Implementation**: Every action must be cryptographically signed and auditable
- **Decision Framework**: Ask "Can this be verified and audited?" before "Is this faster?"

### 2. AI-Native Design

- **Rule**: Build for hybrid human-AI teams, not just humans using AI tools
- **Implementation**: All protocols must be LLM-readable; agents are first-class citizens
- **Decision Framework**: Design workflows that work seamlessly for both humans and agents

### 3. Git-Native Architecture

- **Rule**: Leverage Git's distributed trust model rather than reinventing it
- **Implementation**: Use `.gitgov/` directory structure; records are committable JSON
- **Decision Framework**: If it can't be versioned and merged in Git, reconsider the approach

## Target User Context

**Primary User**: "Alex" - AI-first tech lead managing hybrid teams

- Values governance over productivity metrics
- Needs cryptographic proof of work completion
- Manages both human developers and AI agents
- Requires offline-first workflows with sync capabilities

**User Needs Hierarchy**:

1. Trust and verification (audit trails)
2. Seamless human-AI collaboration
3. Local-first operation
4. Team coordination and visibility

## Competitive Differentiation

### vs. Task Management (Jira, Linear, Asana)

- **Their Focus**: Human productivity and project tracking
- **Our Focus**: Governance and cryptographic accountability
- **Key Differentiator**: We provide "GitOps for Work" - immutable, signed records vs mutable task states

### vs. Automation Tools (Zapier, GitHub Actions)

- **Their Focus**: Connecting APIs and triggering workflows
- **Our Focus**: Complete state management with audit trails
- **Key Differentiator**: We manage the entire work lifecycle, not just trigger events

### vs. AI Development Tools (Cursor, GitHub Copilot)

- **Their Focus**: AI-assisted coding
- **Our Focus**: AI-native work orchestration
- **Key Differentiator**: We treat AI agents as autonomous team members, not just tools

## Go-to-Market Strategy

### Product-Led Growth (PLG) Funnel

1. **Developer Adoption**: Free CLI (`gitgov`) drives organic adoption
2. **Team Conversion**: Collaboration needs drive SaaS adoption
3. **Enterprise Sale**: Governance and compliance requirements drive platform adoption

### Feature Prioritization Framework

- **Open Source First**: Core protocol and CLI must be compelling standalone products
- **Freemium Bridge**: SaaS features should create natural upgrade path from CLI
- **Enterprise Value**: Platform features focus on scale, security, and compliance

## Development Implications

### Feature Design Rules

- All features must work in offline-first CLI before adding to SaaS
- Every user action must generate a signed, auditable record
- Agent interactions must be indistinguishable from human interactions in the protocol
- Breaking changes require migration paths that preserve audit history

### Messaging and Documentation

- Emphasize "governance" over "productivity" in all communications
- Position as "operating system for AI-first teams" not "better project management"
- Use "hybrid human-AI collaboration" not "AI-assisted work"
- Reference "cryptographic accountability" as core value proposition
