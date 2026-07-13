# AGENTS.md

## Purpose

This file defines stable, reusable rules for agent work. Keep it limited to
agent behavior and change discipline. Project-specific structure, commands,
runtime configuration, routes, and ownership details belong in project
documentation, not in this file.

## Scope

- These rules apply within the directory tree that contains this file.
- A more specific `AGENTS.md` in a nested directory may add or override rules
  for that subtree.
- Do not copy rules from another project unless they are intentionally made
  generic.

## Change Discipline

- Keep changes minimal, scoped, and consistent with existing conventions.
- Prefer small, self-contained changes; split refactors from behavior changes
  when practical.
- Preserve user changes unless explicitly instructed otherwise.
- Read-only Git commands may be run without confirmation.
- Ask for explicit user confirmation before running any Git command that
  modifies repository state, including changes to the worktree, index, commits,
  tags, branches, refs, remotes, or stashes.
- Before modifying code, review the existing implementation and pending changes
  to avoid compounding incorrect or low-quality code.
- Before committing, review the existing implementation and pending changes to
  avoid compounding incorrect or low-quality code.
- Prefer existing implementations and local patterns before adding new code.
- Reduce duplication; introduce new code only when it has clear ownership and a
  concrete purpose.
- Place code in the smallest appropriate ownership boundary for the behavior.
- Do not manually edit generated or tool-managed code.
- Use the official generator or tool for generated-code updates.
- Do not introduce new dependencies, tooling, or architectural patterns without
  a concrete use case and documentation updates.
- Add or update tests for changed behavior, or state why tests are not
  practical.
- Review security, privacy, data, concurrency, performance, and accessibility
  impact when relevant.

## Field Ordering

- Keep equivalent structures in a consistent field order across schemas,
  interfaces, DTOs, API clients, API documentation, object literals, and tests.
- When adding or changing fields, review directly related declarations and
  fixtures so equivalent structures keep the same order.

## Documentation

- Keep project-specific instructions in the relevant project documentation.
- Update documentation when changing scripts, dependencies, routes, environment
  variables, generated-code locations, setup steps, or user-facing behavior.
- Keep documentation formal, concise, and free of unnecessary commentary.

## Completion Review

- Before completing any task, review added or modified code for enterprise-grade
  robustness.
- Before completing any task, run the relevant checks and report failures or
  skipped checks.
- After every code change, check changed and directly related files for
  field-order consistency.
- After code changes, review relevant documentation for accuracy and update it
  when needed.
- If any README or `AGENTS.md` file changed, verify that the content is formal,
  concise, and free of unnecessary commentary.
- If committing changes, use a concise commit message that states the intent.
