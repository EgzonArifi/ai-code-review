# Backend review rules (NestJS + Prisma)

Layers on top of `general.md`. Targets NestJS + Prisma (PostgreSQL) services with
class-validator, Passport/JWT auth, and CASL authorization — e.g. `apps/be` in the monorepo.
Same objective: high signal, low noise.

**Applies to:** backend service paths (`apps/be/**` and similar NestJS services).

Principle: only report what **Biome**, **Oxlint** (type-aware), and **tsc strict** cannot already
catch. If the toolchain flags it, stay silent.

## Defer to the toolchain — do NOT flag

CI runs `oxlint --type-aware --type-check` (correctness + perf + typescript + import + promise +
unicorn rules as errors) and `biome check`, with TypeScript strict mode on. Never post findings
for:

- Formatting, import ordering/grouping, type-only imports (`useImportType`) — Biome.
- Type errors, unused vars/expressions, import correctness, unicorn conventions, promise-plugin
  issues — Oxlint / tsc.
- General code style and naming the linter owns.

Two known relaxations in this stack (so these *are* fair game — see focus): `no-floating-promises`
is **off at the root**, and several `typescript/no-unsafe-*` are relaxed on legacy backend code.

## Focus here — correctness the linter & tsc miss

High-value 🔴 for a NestJS + Prisma backend:

- **Authorization scoping:** a `@UserAclCheck(...)` / CASL scope parameter (e.g. `$query.ownerId`)
  that does not match what the service actually queries → broken tenant/owner isolation. Cross-check
  the decorator against the query it guards.
- **Unscoped DB queries / data leakage:** Prisma `findMany` / `findFirst` / `update` / `delete`
  missing an owner/tenant filter, or filtering on unvalidated input → cross-tenant reads/writes.
- **Missing or weakened validation:** request DTOs without class-validator decorators, or custom
  transformers (e.g. `TransformInputToArray`) that munge or bypass validation.
- **Unhandled async:** fire-and-forget promises that can reject unobserved (queue jobs, email,
  webhooks). `no-floating-promises` is off here, so this is the reviewer's job.
- **Transaction integrity:** multi-step mutations not wrapped in `$transaction` → partial writes on
  failure.
- **Secrets / PII in logs:** logging tokens, passwords, emails, or full request bodies.
- **N+1 queries:** a per-row query inside a loop/`map` over a result set (e.g. resolving media per
  item) instead of a batched query or Prisma `include`.
- **Migration safety:** destructive or non-backward-compatible schema changes (DROP COLUMN, adding
  NOT NULL without a default, renames) that break rolling deploys. Review the *intent* of the
  change; don't nitpick generated SQL.
- **Queue-job idempotency:** handlers that aren't safe to run twice under retry.

## Skip entirely (generated / vendored / alt-providers)

Do not review or comment on files matching:

```
**/node_modules/**
**/dist/**
**/build/**
**/.turbo/**
**/.tmp/**
**/coverage/**
pnpm-lock.yaml
**/src/database/prisma/generated/**
**/*.scaffold.ts
**/.scaffold/**
**/.*.scaffold.ts
**/src/common/logger/{pino,otel,sentry}/**
**/src/common/queues/providers/**
**/src/common/email/providers/sendgrid/**
*.generated.*
```

(A repo's `REVIEW.md` may add to or narrow this list. Prisma migrations are *not* skipped — review
their backward-compatibility per the focus list above.)
