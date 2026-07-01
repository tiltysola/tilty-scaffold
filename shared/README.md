# tilty-scaffold/shared

Runtime-neutral TypeScript utilities shared by the frontend and backend.

## Commands

Install dependencies from the repository root.
Run commands from `shared/`.

| Command                | Description                                           |
| ---------------------- | ----------------------------------------------------- |
| `npm run build`        | Clean and build ESM and CommonJS outputs into `dist/` |
| `npm run format`       | Format shared files with Prettier                     |
| `npm run format:check` | Check shared formatting                               |
| `npm run fix`          | Format shared files                                   |
| `npm run typecheck`    | Run TypeScript checks                                 |
| `npm run clean`        | Remove generated build output                         |

## Exports

| Export                         | Purpose                             |
| ------------------------------ | ----------------------------------- |
| `@tilty/shared`                | Package entry point                 |
| `@tilty/shared/access-control` | Built-in permission and role keys   |
| `@tilty/shared/auth`           | Auth value contracts                |
| `@tilty/shared/i18n`           | Locale keys and negotiation helpers |
| `@tilty/shared/paths`          | Safe redirect and path helpers      |
| `@tilty/shared/setup`          | Setup option value contracts        |
| `@tilty/shared/validation`     | Runtime-neutral validation helpers  |

Package exports include a `development` condition that points to `src/` for
development tooling. Standard import and require conditions use built `dist/`
outputs.

Keep browser-only behavior in `frontend/` and server-only behavior in
`backend/`. Add shared code only when both applications need the same contract
or utility.

## Tooling

Shared development tooling lives outside the runtime package exports. ESLint
helpers are kept under `eslint/` and imported directly by workspace ESLint
configuration files.

Generated package output is written to `dist/` and should be recreated with
`npm run build`. Do not edit generated output manually.
