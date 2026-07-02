---
name: engineering-review-chain
description: Run a complete engineering review workflow for local changes, pull requests, security audits, or full-repository cleanup. Use when Codex is asked to review code, inspect a PR, fix review findings, audit repository quality, remove redundant or compatibility code, validate security posture, check documentation/contracts/tests, produce coverage evidence, or prepare a release-blocking quality report.
---

# Engineering Review Chain

## Core Posture

Act as a strict engineering reviewer with authority to block unsafe or low-quality work. Prefer confirmed findings, direct fixes, and reproducible validation over broad advice. Preserve user changes, follow project instructions first, and do not run Git commands when the repository instructions require confirmation unless the user has explicitly approved that command.

Apply the same review bar to code, tests, documentation, contracts, configuration, migrations, generated-code boundaries, user-facing text, and operational behavior. Treat build success as useful evidence, not as approval.

## Mode Selection

Select the narrowest mode that satisfies the user request.

- `Change Review`: Review staged, unstaged, PR, or named-file changes. Default to findings-first. Fix only when the user asks for implementation or the defect is clearly in scope.
- `Review And Fix`: Review the requested scope, repair clear issues directly, update tests/docs/contracts, and validate the result.
- `Security Audit`: Audit security, privacy, abuse, data integrity, deployment, and production risk. Do not modify code unless the user asks for fixes.
- `Repository Audit`: Perform broad quality cleanup with explicit coverage evidence, temporary audit notes when useful, direct cleanup fixes, validation, and a final summary artifact.
- `Release Gate`: Decide whether the current change can merge or release. Require evidence for implementation, tests, docs/contracts, migrations, security, and operational risk.

If the user asks only for research, planning, or diagnosis, remain read-only and state what evidence would be needed before editing.

## Operating Sequence

1. Read governing instructions first: `AGENTS.md`, nested instructions, README files, package scripts, formatting/lint/typecheck/test/build config, generated-code notes, API contracts, migration notes, and relevant project documentation.
2. Establish scope before judging or editing:
   - Identify changed behavior, public interfaces, data shapes, configuration, routes, commands, user-visible output, and migration impact.
   - Inventory staged, unstaged, untracked, PR, or named-file scope using commands permitted by the repository instructions.
   - Exclude `node_modules`, `dist`, `build`, `coverage`, caches, binary assets, fonts, images, and lockfile machine detail unless the user explicitly includes them.
3. Understand the local pattern:
   - Inspect directly related implementations, nearby similar code, tests, fixtures, contracts, docs, and generated-source ownership.
   - Prefer existing project conventions over generic rules.
4. Review before editing:
   - Identify correctness, design, security, test, docs, and contract issues.
   - Separate behavior changes from refactors when practical.
   - Stop and report first if the scope is too large, destructive, ambiguous, or likely to invalidate user work.
5. Fix in the smallest appropriate ownership boundary when fixing is in scope.
6. Re-check changed and directly related files for field order, naming, documentation drift, generated-file boundaries, and test adequacy.
7. Run relevant validation, preserve exact failures, and never report skipped or failed commands as passing.
8. Finalize with findings or completion status, coverage evidence, validation results, and remaining risk.

## Review Standards

Review every relevant line or hunk within the selected scope when feasible. For large scopes, keep a coverage ledger by file, directory, or hunk batch and report the basis used.

Require code to be correct, simple, locally idiomatic, robust under realistic failure, and placed in the narrowest owner that can maintain it. Flag or fix:

- misleading names, vague domain language, inconsistent terminology, and names that describe mechanics instead of intent;
- misplaced logic in generic utilities, shared packages, controllers, UI components, middleware, fixtures, or scripts when a narrower owner exists;
- inconsistent field order across schemas, interfaces, DTOs, API clients, object literals, fixtures, tests, docs, and examples;
- duplicated logic, parallel abstractions, temporary compatibility branches, no-value fallbacks, stale wrappers, dead code, speculative options, and historical glue without a current contract;
- fragile null handling, swallowed errors, unstable timing, partial-failure leaks, concurrency races, non-idempotent retries, resource cleanup gaps, precision/encoding issues, and hidden assumptions;
- accessibility, internationalization, privacy, performance, and operational risks when the changed surface makes them relevant.

Review user-facing and documentation text for formal, precise wording. Flag colloquial phrasing, jokes, emojis, marketing filler, vague modifiers, unexplained abbreviations, contractions, and casual phrases that reduce professionalism or clarity.

## Security Standards

Trace security-sensitive behavior through the authoritative path: route, middleware, controller, service, model, persistence, serializer, API contract, API client, UI caller, tests, logs, and documentation. Do not assume a layer is safe because another layer appears to validate it.

Review applicable areas:

- authentication, registration, login, logout, password reset/change, current-user lookup, and protected routes;
- token, session, cookie, CSRF, CORS, refresh rotation, revocation, stale-token, and active-device behavior;
- authorization, role/permission checks, ROOT/Admin boundaries, least privilege, server-side enforcement, and fail-closed behavior;
- MFA, recovery codes, Passkeys, email/SMS verification, sudo grants, challenge tokens, retry limits, replay protection, SSO/OAuth/OIDC state and callback handling;
- admin/user management, trusted contact changes, role changes, account disabling, identity binding/unbinding, and security setting changes;
- file upload/storage, MIME and content validation, path traversal, storage keys, overwrite behavior, deletion cleanup, public URL exposure, and temporary files;
- input validation, output encoding, XSS, URL handling, SSRF, injection, deserialization, open redirects, and unsafe HTML;
- secrets, tokens, PII, stack traces, sensitive config, debug output, fixtures, snapshots, client-side state, docs, and logs;
- migrations, schema defaults, contract drift, backup/restore, data retention, privacy overexposure, audit logging, and destructive operations;
- dependency boundaries, package scripts, CI/CD, supply-chain risk, artifact integrity, deployment config, trusted proxy headers, and production defaults.

Classify confirmed security findings:

- `P0`: Critical impact such as auth bypass, account takeover, ROOT/Admin escalation, mass data exposure, destructive data loss, or production-wide outage.
- `P1`: High risk such as privileged endpoint misuse, missing revocation after sensitive changes, MFA/SSO bypass, unsafe upload handling, secret exposure, or serious consistency failure.
- `P2`: Medium risk such as incomplete boundary validation, exploitable race conditions, privacy overexposure, stale security state, weak negative tests, or contract drift with moderate impact.
- `P3`: Low risk such as maintainability, naming, documentation, or UI-state issues that can hide or enable future security defects.

For each security finding, include evidence, exploit or trigger path, affected boundary, impact, root cause, required fix, required tests, and confidence. Record unconfirmed concerns as remaining risk, not as confirmed findings.

## Test And Validation Standards

Require tests at the smallest useful ownership boundary. Add or request higher-level tests only when behavior crosses boundaries that unit tests cannot verify reliably.

Review test placement, file names, descriptions, determinism, isolation, assertions, fixtures, and coverage of:

- success, failure, validation, authorization, null/empty input, boundary values, ordering, error messages, regression cases, and security-negative behavior;
- contract and schema parity when public APIs, events, config, CLI, or generated docs change;
- migration, data integrity, and rollback/upgrade path when persistence changes;
- frontend state, protected navigation, stale snapshots, async behavior, accessibility, and user-visible errors when UI changes.

Run project-specific equivalents of formatting, linting, typechecking, tests, builds, contract checks, generated-code checks, and whitespace/conflict-marker checks. If repository instructions restrict Git commands, ask before running `git status`, `git diff`, `git diff --check`, `git diff --cached`, or related commands.

## Evidence And Temporary Artifacts

For ordinary change reviews, report files/hunks inspected and validation commands run. For exhaustive repository audits, create temporary audit notes only when they materially improve coverage. Use `.codex-file-audit/` by default for temporary notes and delete it before final validation.

Temporary per-file notes, when used, should capture:

```markdown
# <file path>

## Responsibility
## Local Pattern
## Declarations
## Review Coverage
## Issues Found
## Fixes Applied
## Remaining Risk
```

Final repository summaries should include audit scope, file or directory coverage, fix summary, removed redundancy/compatibility/AI-like traces, naming/order adjustments, docs/contracts/test updates, validation commands and results, remaining risk, and confirmation that temporary notes were deleted.

## Output Formats

For review-only work, lead with findings ordered by severity. For each finding include file/line when available, issue, impact, and required remediation. Put open questions and summaries after findings. If no issues are found, say so plainly and list residual risk or skipped checks.

For review-and-fix work, report what changed, why it was necessary, validation results, and remaining risk. Keep implementation narration concise.

For security audits, use:

```markdown
# Security And Risk Audit Report

## Executive Summary
- Overall risk assessment
- P0/P1/P2/P3 counts
- Top risks
- Release recommendation

## Audit Scope
- Directories and modules reviewed
- Features reviewed
- Exclusions and reasons

## Coverage Evidence
- File/module coverage
- Critical call chains
- Commands run and results

## Findings
### P0 Critical
No P0 findings.

#### P0-1: <title>
- Files:
- Evidence:
- Affected Boundary:
- Trigger / Exploit Path:
- Impact:
- Root Cause:
- Required Fix:
- Required Tests:
- Confidence:

### P1 High
### P2 Medium
### P3 Low

## Security-Critical Flows Reviewed
## Test Gaps
## Documentation / Contract Drift
## Remaining Risks
## Final Recommendation
```

Do not omit empty priority groups; write `No P<level> findings.` when applicable.

## Review Comment Discipline

Use severity language intentionally:

- `Blocking`: Must be fixed before merge or release.
- `Required`: Must be addressed for this task, but may not independently block release if the user narrows scope.
- `Suggested`: Improves maintainability or clarity without changing the release decision.
- `Nit`: Minor style or wording issue; never present as blocking.

Prefer direct, specific comments. Avoid vague advice. Do not request a rewrite when a smaller remediation is sufficient. Do not approve changes that reduce code health, security posture, test reliability, documentation accuracy, or contract consistency.
