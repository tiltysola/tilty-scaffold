---
name: project-security-audit
description: Perform a strict full-project security, privacy, robustness, and production-risk audit with P0-P3 findings. Use when the user asks to inspect vulnerabilities, hidden risks, security posture, authentication or authorization weaknesses, session or token safety, upload safety, configuration risks, API contract drift, test gaps, or wants a detailed release-blocking security review report.
---

# Project Security Audit

## Core Posture

Act as a blocking security and production-risk reviewer. Audit the whole project unless the user explicitly narrows scope. Do not modify code unless the user explicitly asks for fixes.

Do not rely on assumptions that a layer is safe. Trace security-critical behavior through the authoritative enforcement path: route, middleware, controller, service, model, persistence, response contract, API client, UI caller, tests, and documentation.

Every finding must include concrete evidence. Prefer exact files, symbols, endpoints, and line references. If a risk cannot be fully confirmed, record it as remaining risk and state what evidence is missing.

## Priority Model

- `P0`: Critical impact, such as authentication bypass, arbitrary account takeover, ROOT/Admin privilege escalation, mass data exposure, destructive data loss, or production-wide outage.
- `P1`: High risk, such as privileged endpoint misuse, missing session revocation after sensitive changes, MFA/TOTP/Passkey/SSO bypass, unsafe upload handling, secret exposure, or serious data consistency failure.
- `P2`: Medium risk, such as incomplete boundary validation, exploitable race conditions, weak error handling, privacy overexposure, stale state, missing negative tests for sensitive behavior, or contract drift with moderate impact.
- `P3`: Low risk, such as maintainability issues that can hide security bugs, minor documentation drift, weak naming around sensitive logic, or low-impact UI state defects.

## Required Setup

1. Read governing instructions before judging code:
   - `AGENTS.md`
   - README files
   - package scripts
   - lint, prettier, TypeScript, test, build, Vite, Vitest, or equivalent config
   - API contracts, OpenAPI, migration docs, generated-code notes, and environment configuration docs
2. Build a project map of critical modules and functions before writing findings.
3. Inventory the audit scope:
   - Include git-tracked source, tests, config, docs, schemas, contracts, API documentation, migrations, and scripts.
   - Exclude `node_modules`, `dist`, `build`, `coverage`, caches, binary assets, images, fonts, and lockfile machine detail.
   - Treat generated or tool-managed files as review-only unless the official generator or the user allows edits.

## Full-Coverage Audit Areas

Review all applicable areas. If one does not exist in the project, state that it is not present.

- Authentication: registration, login, logout, password reset, password change, current-user lookup, route protection.
- Token and session lifecycle: access token verification, refresh token rotation, session family revocation, active device sessions, logout, stale token handling.
- Authorization: role and permission checks, ROOT/Admin protection, least privilege, fail-closed behavior, server-side enforcement, frontend-only assumptions.
- MFA and identity verification: TOTP, recovery codes, Passkeys, email/SMS verification, sudo grants, challenge tokens, retry limits, replay protection.
- SSO/OAuth/OIDC: login, binding, unlinking, callback validation, state handling, provider configuration, local MFA requirements after provider verification.
- Admin/user management: managed user edits, password resets, role changes, availability changes, trusted contact changes, device visibility, security bindings.
- File upload and storage: MIME validation, size limits, compression, content sniffing, storage keys, path traversal, overwrite behavior, deletion cleanup, public URL exposure.
- Input validation: params, query, body schemas, DTOs, model constraints, frontend validation parity, API clients.
- Error handling and privacy: status codes, error bodies, stack traces, sensitive messages, logging, leaked identifiers, debug output.
- Data integrity: migrations, model fields, serialization, API contracts, frontend types, fixtures, field order, default values.
- Concurrency and transactions: role updates, disabling users, password changes, binding/unbinding identities, token/session revocation, file replacement cleanup.
- Configuration and deployment: environment variables, defaults, CORS, cookies, CSRF, trusted proxy headers, secret requirements, storage/cache/database setup.
- Frontend risk: protected routes, local/session storage, API 401/403 handling, stale auth snapshots, Dialog/Popover state, image preview/upload state, XSS and URL handling.
- Tests and documentation: positive and negative tests, authorization tests, boundary tests, README/API/OpenAPI drift, migration/schema parity.

## Review Method

For each critical flow:

1. Identify the entry points and user-visible behavior.
2. Trace the full call chain through server enforcement and client usage.
3. Confirm the authoritative security boundary is server-side and fail-closed.
4. Check whether state changes update every related representation, including database fields, API serializers, clients, UI state, tests, and documentation.
5. Compare behavior against nearby established patterns.
6. Inspect both success and failure paths, including nulls, empty values, invalid input, repeated requests, stale state, and partial failures.
7. Verify test coverage for the behavior. Missing security-negative tests should be reported when they leave sensitive behavior unproven.

Useful scans include project equivalents of:

```bash
rg -n "TODO|FIXME|debugger|console\\.log|legacy|compat|temporary|workaround|deprecated"
rg -n "as any|unknown as|@ts-ignore|@ts-expect-error|eslint-disable"
rg -n "password|token|secret|session|cookie|csrf|cors|upload|mfa|totp|passkey|sso|role|permission"
rg -n "innerHTML|dangerouslySetInnerHTML|localStorage|sessionStorage|window\\.location|URL\\.createObjectURL"
```

Interpret every match before reporting it. Legitimate tests, SDK casts, generated files, and domain terms may be valid.

## Validation

Run or attempt the repository's relevant commands and preserve exact failures:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check
git diff --cached --check
git diff --cached
git diff
```

Use project-specific equivalents for other stacks. If a command fails because of sandbox or environment restrictions, keep the original error and rerun with approval only when a real result is needed. Never claim a failed or skipped command passed.

## Report Format

Write a detailed Markdown report with this structure:

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

- File/module coverage checklist
- Critical call-chain coverage checklist
- Commands run and results

## Findings

### P0 Critical

No P0 findings.

#### P0-1: <title>

- Files:
- Evidence:
- Impact:
- Trigger / Exploit Path:
- Root Cause:
- Recommended Fix:
- Required Tests:

### P1 High

Use the same structure.

### P2 Medium

Use the same structure.

### P3 Low

Use the same structure.

## Security-Critical Flows Reviewed

- Authentication
- Password reset/change
- Session refresh/revoke
- MFA/TOTP/Passkey
- SSO
- Admin user management
- File uploads
- Permissions/RBAC
- System settings
- Frontend protected routes
- API clients and error handling

For each flow, list reviewed files, safe behavior, risky behavior, tests present, and tests missing.

## Test Gaps

- Missing test
- Risk level
- Suggested test name and assertions

## Documentation / Contract Drift

- Drift found
- Files requiring updates

## Remaining Risks

- Unknowns
- Required evidence to close them

## Final Recommendation

- Can merge/release or must block
- Required fixes before release
- Follow-up fixes
```

If there are no findings in a priority group, explicitly write `No P<level> findings.` Do not omit empty priority groups.

## Output Rules

- Lead with findings, not general commentary.
- Order findings by severity and exploitability.
- Include specific remediation and test requirements for each finding.
- Do not include vague advice without file-level evidence.
- Distinguish confirmed findings from remaining risks.
- Keep wording formal, precise, and security-focused.
