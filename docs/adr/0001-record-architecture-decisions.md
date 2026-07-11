# ADR 0001 — Record architecture decisions

**Status:** Accepted · 2026-07-11

## Context
This project is being open-sourced. Contributors need to understand why the stack,
storage and ML choices were made without archaeology through commit history.

## Decision
We record every significant architectural decision as a numbered ADR in `docs/adr/`,
using the format **context → decision → consequences**. Superseded ADRs are marked,
never deleted, and link forward to their replacement.

## Consequences
- Each PR that introduces a new pattern, dependency, integration or data model must
  include an ADR in the same change.
- Slight documentation overhead, traded for onboarding speed and reviewable rationale.
