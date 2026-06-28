---
name: repository-code-audit
description: Perform a strict full-repository code quality audit with temporary per-file Markdown review notes, directory summaries, direct cleanup fixes, validation commands, cleanup of temporary audit files, and one final audit summary. Use when the user asks for exhaustive code review, repo-wide cleanup, naming/style/order audit, removal of redundancy or compatibility baggage, generated per-file audit documentation, or a final CODE_AUDIT_SUMMARY-style report.
---

# Repository Code Audit

## Core Workflow

Use this skill for repo-wide review-and-fix requests where the user wants concrete coverage evidence and a final summary artifact.

1. Read governing instructions first: `AGENTS.md`, README files, package scripts, lint/prettier config, tsconfig, test/build scripts, and project docs that define generated-code boundaries.
2. Inventory scope before editing:
   - Include git-tracked source, tests, config, README/docs, schemas, contracts, and API documentation.
   - Exclude `node_modules`, `dist`, `build`, `coverage`, caches, binary assets, fonts, images, and lockfile machine details.
   - Treat generated/tool-managed files as review-only unless the official generator or user explicitly allows edits.
3. Create temporary audit notes under `.codex-file-audit/`:
   - One per audited file.
   - One per directory path or meaningful directory group.
   - Regenerate affected notes after fixes.
4. Review and fix directly:
   - Prefer existing repo style over new rules.
   - Remove dead code, duplicate logic, temporary branches, no-value fallbacks, and historical compatibility layers unless a real external contract or business data requires them.
   - Keep changes focused; do not hide unrelated refactors inside the audit.
5. Produce one final summary, usually `CODE_AUDIT_SUMMARY.md`.
6. Delete `.codex-file-audit/` before final validation.
7. Run relevant verification and report exact pass/fail output. Never claim skipped or failed commands passed.

## Per-File Markdown Template

Each temporary per-file note must use this structure:

```markdown
# <file path>

## Responsibility

## Local Style

## Declarations

## Naming Review

## Ordering Review

## Placement Review

## Redundancy / Compatibility Review

## Issues Found

## Fixes Applied

## Remaining Risk
```

In `Declarations`, list variables, constants, types, interfaces, classes, functions, and components with a short purpose. Keep the notes factual and concise; they are audit evidence, not permanent documentation.

## Naming And Ordering Rules

Apply repository conventions first. If the repo has no clear convention, enforce these defaults:

- Use business-specific names; avoid vague names such as `temp`, `data`, `info`, `list`, `obj`, `item2`, `newData`, and `finalData` unless the immediate context makes them precise.
- Name functions by action and result, such as `buildXxxPayload`, `resolveXxxConfig`, or `normalizeXxxList`.
- Prefix booleans with `is`, `has`, `can`, `should`, or `enable`.
- Prefix event handlers with `handle`.
- Keep pure utility functions outside components/main flows.
- Keep current-file helpers in the current file; extract only when reused across ownership boundaries.
- Follow repo function ordering. If unclear, keep the main export or component first and local helpers near their use.
- Add abstractions only when they reduce real complexity or meaningful duplication.

For `interface` and `type` fields, keep a stable readable order:

1. `id`, `key`, `name`, `title`
2. `type`, `status`, `state`, `category`
3. core business fields
4. config fields
5. display fields
6. boolean switches
7. callbacks
8. `metadata` or `extra`
9. `createdAt`, `updatedAt`, and other timestamps

Keep object literals aligned with their related type or API contract where practical.

## Directory Summary Template

For each directory summary, record:

- Directory responsibility.
- Main style conventions.
- Ownership of shared helpers, components, APIs, schemas, and tests.
- Issues found and fixes applied.
- Remaining risks.

Merge these directory findings into the final summary before deleting temporary files.

## Required Review Checks

At minimum, inspect for:

- Unused code, dead branches, duplicate checks, swallowed errors, async races, unsafe null handling, and stale state.
- Unclear naming, AI-like wording, temporary compatibility bridges, and no-value fallbacks.
- Broken caller contracts, API/schema/docs drift, field-order drift, generated-file drift, and misplaced ownership.
- Missing tests for behavior changes or a clear reason tests are not practical.
- Security, privacy, data integrity, accessibility, performance, and concurrency impact when relevant.

Useful scans include exact project equivalents of:

```bash
rg -n '\b(newData|finalData|obj|item2)\b|console\.log|debugger|TODO|FIXME|legacy|compat'
rg -n 'as any|unknown as|@ts-ignore|@ts-expect-error|eslint-disable'
rg -n '\btemp\b|\btemporary\b|\bworkaround\b|\bdeprecated\b'
```

Interpret matches before changing them; legitimate SDK casts, tests, generated files, and domain terms may be valid.

## Final Summary Requirements

The final Markdown must include:

1. Audit scope.
2. File coverage checklist.
3. Directory-level summary.
4. Fix summary.
5. Removed redundancy, historical compatibility, and AI traces.
6. Naming, function placement, and field-order adjustments.
7. Validation commands and results.
8. Remaining risk.
9. Explicit statement that temporary per-file and directory Markdown files were deleted.

If `git diff --cached` or `git diff` is too large, run them and capture output to `/tmp`, then report the path, line count, and status.

## Validation

Run the repo's relevant commands, usually:

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

Use project-specific equivalents when the repository uses another stack. If a command fails because of sandbox or environment limitations, preserve the original error and rerun with appropriate approval only when needed for a real result.

Before final response:

- Confirm `.codex-file-audit/` is deleted.
- Confirm the final summary file remains.
- Confirm whether the final summary is staged, unstaged, or untracked.
- Keep the user-facing final answer concise: completion status, final MD path, validation results, and remaining risks.
