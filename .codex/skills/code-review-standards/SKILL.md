---
name: code-review-standards
description: Apply strict code review standards for pull requests and local changes, with emphasis on implementation quality, enterprise-grade security, naming, code placement, contextual ordering, duplication control, robustness, API contract and project documentation consistency, formal wording, and complete, correctly located, appropriately named unit tests. Use when Codex is asked to review code, inspect a pull request, assess implementation quality, or validate documentation and tests before completion.
---

# Code Review Standards

## Overview

Use this skill to perform a strict code review that treats implementation quality, enterprise-grade security, documentation accuracy, formal language, and test quality as required review criteria. Prefer concrete findings with file and line references over general commentary.

## Review Posture

Act as a blocking reviewer. Prioritize correctness, maintainability, security, compatibility, documentation consistency, and test adequacy. Treat weak naming, misplaced code, inconsistent ordering, avoidable duplication, unnecessary complexity, stale documentation, informal wording, incomplete unit coverage, misplaced tests, weak test names, and unclear test descriptions as review findings when they affect changed or directly related behavior.

Do not approve a change based only on build success or apparent implementation correctness. Verify that public contracts, documentation, and tests remain aligned with the code.

## Required Context

Before giving review findings, inspect the changed implementation, directly related existing implementation, nearby similar code, public contracts, project documentation, tests, fixtures, and project instructions. Identify the local source of truth for generated files and do not recommend manual edits to generated artifacts.

When reviewing a pull request, inspect the diff, review comments when relevant, and any related files needed to verify field order, behavior, documentation, and tests. When reviewing local changes, inspect pending changes and directly related files without reverting user work.

## Review Workflow

1. Establish the scope of changed behavior, public interfaces, configuration, data shape, and user-visible output.
2. Review implementation quality, including naming, file placement, ownership boundaries, contextual order, duplication, simplicity, robustness, and security.
3. Compare implementation changes against applicable project documentation and public contracts, including API specifications, README files, generated documentation, examples, setup instructions, configuration references, scripts, routes, CLI help, schemas, and user-facing documentation.
4. Review all added or modified wording for formal, precise, non-colloquial language.
5. Review unit tests for completeness, correct placement, appropriate file names, meaningful descriptions, deterministic behavior, and assertions that verify the changed behavior.
6. Run or request the relevant checks when feasible. Report skipped checks with a concrete reason.

## Implementation Standards

Names must be precise, domain-appropriate, and consistent with local conventions. Flag variables, functions, classes, files, schema fields, test helpers, and fixtures with vague, misleading, overloaded, abbreviated, or inconsistent names. Names must describe intent or business meaning, not merely type or implementation mechanics.

Code must live in the smallest appropriate ownership boundary. Verify that behavior belongs in the selected module, package, layer, component, helper, or test support file. Flag code placed in generic utilities, shared packages, controllers, UI components, middleware, fixtures, or scripts when a narrower or existing owner is more appropriate.

Ordering must preserve local context and field-order conventions. Review imports, declarations, schema fields, DTOs, object literals, route lists, test fixtures, documentation examples, and related code blocks for stable, readable ordering that matches adjacent patterns. Flag new code inserted out of sequence when it obscures ownership, lifecycle, dependency order, or equivalent field order.

Compare new code with nearby and repository-wide similar implementations before accepting it. Flag duplicate logic, parallel abstractions, repeated validation, copied tests, inconsistent helpers, and near-identical branches when an existing implementation can be reused or extended without reducing clarity.

Require code to be as simple as the behavior allows. Flag unnecessary abstraction, deeply nested control flow, broad configuration, excessive parameterization, speculative extension points, unused options, dead code, and transformations that obscure the data path. Prefer direct, locally idiomatic code over generalized code without a concrete current use.

Require robust behavior under expected failure and boundary conditions. Review null or empty inputs, invalid external data, partial failures, retries, timeouts, concurrency, ordering, idempotency, resource cleanup, precision, encoding, and backward compatibility when relevant. Flag changes that handle only the happy path or depend on accidental timing, shared mutable state, or undocumented assumptions.

## Enterprise Security Standards

Review security as a required part of implementation quality. Flag missing or weakened controls for authentication, authorization, request forgery protection, cross-origin or cross-boundary access, input validation, output encoding, content-type validation, rate limiting, secret handling, token or session lifecycle, audit-relevant logging, transport and storage security, path traversal protection, upload or file validation, and dependency boundaries when relevant.

Do not accept implementations that expose secrets, credentials, tokens, session identifiers, personally identifiable information, internal stack traces, sensitive configuration, or privileged operational details through logs, errors, public responses, client-side state, documentation examples, fixtures, snapshots, or generated artifacts.

Require least privilege and fail-closed behavior. Access checks must happen at the authoritative enforcement boundary, must be covered by tests when behavior changes, and must not rely only on client-side navigation, UI hiding, or caller discipline. Error handling must avoid security bypasses while preserving diagnosability.

## Documentation Standards

API specifications, such as OpenAPI, GraphQL schemas, RPC contracts, CLI references, message schemas, or project-specific contract files, must match the implementation when present or applicable. Verify changed endpoints, commands, events, methods, parameters, headers, request bodies, response bodies, status codes, error responses, authentication requirements, authorization rules, content types, schema fields, enum values, default values, validation rules, and examples. Flag any mismatch as a finding. If contract files are generated, require the official generator or documented workflow.

README files and equivalent project documentation must match the current project behavior. Verify commands, setup steps, configuration keys, environment variables, feature descriptions, routes, public APIs, generated-code locations, limitations, and examples. If behavior changes without documentation updates, report the missing update. If documentation is not required, state the specific reason.

Documentation changes must preserve consistent field ordering across equivalent schemas, DTOs, object literals, examples, fixtures, clients, and tests. When a new field appears in one representation, verify directly related representations for the same order and presence.

## Wording Standards

Require formal, strict, and unambiguous wording in API descriptions, README files, project documentation, comments intended as documentation, test descriptions, release notes, and user-facing text touched by the change. Flag colloquial language, jokes, emojis, casual reassurance, marketing filler, vague modifiers, unexplained abbreviations, contractions, and imprecise phrases such as `stuff`, `things`, `just`, `easy`, `simple`, `obviously`, or `etc.` when they reduce professionalism or clarity.

Prefer neutral, factual wording that states behavior, requirements, constraints, and outcomes. Do not require verbosity; concise formal language is acceptable.

## Unit Test Standards

Unit tests must fully cover changed behavior at the smallest appropriate ownership boundary. Review success paths, failure paths, boundary cases, validation, authorization or permission behavior, null or empty inputs, data ordering, error messages, and regression scenarios when relevant. Flag tests that only assert implementation details, rely on external services unnecessarily, use unstable timing, share mutable state unsafely, or omit meaningful assertions.

Tests must be placed according to the repository's established conventions. Inspect adjacent modules before judging placement. Test files, fixtures, helper files, and snapshots must live in the appropriate test or fixture directories, not in arbitrary scratch locations.

Test file names must identify the subject under test and follow local naming patterns, such as `*.test.ts`, `*.spec.ts`, `FooTest.java`, or the convention already used by the project. Test case descriptions must be specific, formal, and behavior-focused. Flag vague names such as `works`, `handles stuff`, `test1`, or descriptions that do not identify the expected behavior.

Do not accept broad integration or end-to-end tests as a substitute for unit tests when the behavior can be verified at unit level. Recommend higher-level tests only when the behavior crosses boundaries that unit tests cannot validate reliably.

## Blocking Conditions

Report a blocking finding when any of the following applies:

- Naming, placement, ordering, ownership, or abstraction is inconsistent with local conventions or obscures intent.
- Similar code already exists and the change introduces avoidable duplication or parallel behavior.
- Code is unnecessarily complex, speculative, brittle, or insufficiently robust for realistic failure and boundary conditions.
- Authentication, authorization, input handling, secret handling, logging, upload or file handling, session or token handling, dependency boundaries, or other security-sensitive behavior is incomplete or weakened.
- API contracts, README files, or related project documentation do not match changed behavior.
- Generated contract or API documentation is edited manually instead of through the documented generator.
- Added or modified wording is informal, vague, or inconsistent with project terminology.
- Required unit tests are missing, incomplete, nondeterministic, misplaced, misnamed, or described unclearly.
- Equivalent structures use inconsistent field order across code, schemas, API documentation, clients, fixtures, or tests.

## Findings Format

Lead with findings, ordered by severity. For each finding, include the file and line when available, the issue, the impact, and the required remediation. Include open questions only after findings. Keep summaries brief and secondary to actionable issues.

If no issues are found, state that clearly and include any residual risk, skipped checks, or areas that could not be verified.
