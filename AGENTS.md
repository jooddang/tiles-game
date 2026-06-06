

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

# Engineering Practices

Use these rules to guide implementation after the four baseline rules above. They are intentionally short; prefer the existing codebase's conventions when they are more specific.

## Naming

- Use names that reveal intent and domain meaning.
- Use searchable names; avoid vague names like `data`, `info`, `temp`, `result`, or `value` by themselves.
- Name booleans as predicates: `is_active`, `has_permission`, `can_retry`.
- Keep vocabulary consistent across code, tests, API payloads, and documentation.

## Functions and Modules

- Give each function one job and one level of abstraction.
- Prefer early returns over deep nesting.
- Keep argument lists small; group related values into a named object when needed.
- Avoid boolean flag parameters that split behavior. Use separate functions, explicit options, or an enum.
- Keep business logic independent from framework, transport, storage, and UI details.

## Error Handling

- Fail fast with useful context.
- Raise or return domain-specific errors where the caller can act on them.
- Do not catch broad errors except at process, request, job, or CLI boundaries.
- Do not swallow errors, log and rethrow the same error, or expose internal details to users.

## Architecture

- Separate presentation, application/business logic, and data access.
- Depend on abstractions at boundaries where the dependency is external or volatile.
- Do not add architecture, patterns, services, or folders for hypothetical future needs.
- Avoid circular dependencies and cross-layer imports that make logic hard to test.
- Colocate files that change together unless the project already has a stronger convention.

## Security and Configuration

- Validate input at system boundaries.
- Use parameterized database queries; never build SQL with string concatenation.
- Keep secrets out of code, logs, tests, and committed config.
- Centralize configuration loading and validate required settings at startup.
- Sanitize user-generated output rendered into HTML or other executable contexts.

## Data and Performance

- Use migrations for schema changes.
- Select only the data needed; avoid `SELECT *` in application queries.
- Use transactions for operations that must be atomic.
- Measure before optimizing, then fix the algorithm, query, or data structure before adding caching.
- Add indexes intentionally for measured or obvious query patterns.

## Dependencies

- Do not add a dependency for trivial code or when an existing project dependency already solves the problem.
- Prefer maintained libraries with clear licenses and reasonable transitive dependency cost.
- Pin versions when reproducibility matters.
- Wrap third-party services behind local adapters when business logic would otherwise depend on vendor APIs.

## Comments and Documentation

- Write clear code first; use comments to explain why, not what.
- Remove commented-out code and debug logging.
- Document public APIs, configuration, and non-obvious operational constraints.
- Keep documentation close to the source of truth and update it with behavior changes.

## Version Control

- Keep commits atomic and buildable.
- Use conventional commit subjects when creating commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
- Do not commit generated artifacts, dependency directories, secrets, or environment-specific files.

# Testing Rules

These rules apply to any agent writing or modifying tests. They override looser testing guidance above.

## Core Philosophy

- Test behavior, not implementation.
- Prefer Classist/Chicago TDD. Use Mockist/London style only at system boundaries.
- Write the failing test from the spec first, then implement the minimum code to pass it.
- Keep tests fast, independent, repeatable, self-validating, and timely.

## Mocking Boundaries

Mock only:
- Database / ORM
- Third-party HTTP APIs
- Filesystem, clock, randomness, network
- Anything crossing a process boundary

Never mock:
- Value objects, DTOs, or entities owned by this repo
- Pure functions and utilities
- Internal collaborators such as services or modules in this codebase
- The unit under test

Prefer realistic boundary fakes such as `msw`, `nock`, `wiremock`, temp filesystems, or test databases over broad internal mocks.

## Assertions

- Assert on return values, rendered output, persisted state, emitted events, or other observable behavior.
- Do not make `toHaveBeenCalledWith(...)`, `verify(...)`, or spy identity checks the primary verification.
- Compare whole objects with `toEqual(expected)` when practical.
- Never snapshot non-deterministic output such as LLM text, timestamps, or ordering-free sets.

## Test Names and Structure

- Name tests by observable behavior: `<subject>_<expected_behavior>_when_<condition>`.
- Use Arrange, Act, Assert structure.
- Keep one behavior per test. Multiple assertions are fine when they verify the same behavior.
- Unit tests cover pure logic, entities, and non-trivial utilities.
- Integration tests cover modules with real databases, queues, or realistic boundary fakes.
- E2E tests cover only critical user journeys.
- Gate expensive or live tests behind explicit env flags such as `LIVE_TEST=true` or `RUN_EXPENSIVE=1`.

## Regression and Flake Policy

- Add a regression test for each fixed bug when the behavior can be stated clearly.
- Never commit flaky tests.
- Do not fix flakes with sleeps, retries, or larger timeouts unless the timeout itself is the behavior under test.
- Quarantine unavoidable flakes with an owner, issue link, and deadline.

## When Not To Write A Test

Do not add tests for plain CRUD with no logic, framework wiring, constants already covered by type or schema validation, throwaway scripts that cannot affect production data, or code that is about to be deleted.

# Definition of Done

Before considering work complete:
- The code builds or type-checks where applicable.
- Existing relevant tests pass.
- New or changed behavior has focused tests unless there is a clear reason not to add them.
- Linting and formatting are clean for touched files where project tooling exists.
- Edge cases and failure paths introduced by the change are handled.
- Naming matches the project's vocabulary.
- No dead code, commented-out code, debug logging, secrets, or unrelated formatting churn were introduced.
- The final diff has been self-reviewed.
