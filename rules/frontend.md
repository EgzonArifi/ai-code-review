# Frontend review rules (React + Vite + TanStack)

Layers on top of `general.md`. Targets React 19 + Vite apps using TanStack Router (file-based) +
TanStack Query + Zustand + React Hook Form + Zod + Tailwind + React Aria — e.g. `apps/fe`,
`apps/admin`, and `packages/ui` in the monorepo. Same objective: high signal, low noise.

**Applies to:** frontend paths (`apps/fe/**`, `apps/admin/**`, `packages/ui/**`).

Principle: only report what **Biome**, **Oxlint** (type-aware, with `react` / `react-perf` /
`jsx-a11y`), and **tsc strict** cannot already catch. If the toolchain flags it, stay silent.

## Defer to the toolchain — do NOT flag

CI runs `oxlint --type-aware --type-check` (correctness + style + react + jsx-a11y + import +
unicorn) and `biome check`, with TypeScript strict mode on. Never post findings for:

- Formatting, import order, type-only imports, Tailwind class sorting (`useSortedClasses`) — Biome.
- Type errors, unused vars, import correctness, unicorn conventions, most `react` / `jsx-a11y`
  rules, code style — Oxlint / tsc.

## The big exception — hook dependencies are NOT linted

`react/exhaustive-deps` is turned **off** in this repo's Oxlint config. So the reviewer OWNS this,
and it is a primary focus:

- **Stale-closure / missing-dependency bugs** in `useEffect`, `useCallback`, `useMemo` — deps
  arrays that omit a referenced value (stale data / missed updates) or include an unstable value
  (render loops / refetch storms).

## Focus here — correctness the linter & tsc miss

- **Effect cleanup:** `useEffect` that subscribes, sets a timer, or adds a listener without a
  cleanup return → leaks and duplicate handlers.
- **Async / error UI states:** a TanStack Query `useQuery` result consumed without handling
  `isLoading` / `isError` → blank or stale UI and silent failures; mutations with no error feedback.
- **Query invalidation:** a mutation that changes server state but doesn't invalidate/refetch the
  right query keys → stale UI after writes.
- **List keys:** `key={index}` or unstable/duplicate keys on dynamic, reorderable lists → wrong
  item state after reorder.
- **Client-side secrets:** secrets/tokens in `import.meta.env.VITE_*` or hardcoded → shipped in the
  browser bundle.
- **XSS:** `dangerouslySetInnerHTML` with unsanitized or user-controlled content.
- **Auth guards are not security:** route-group guards (e.g. `(authenticated)/route.tsx`) only hide
  UI — confirm the backend enforces auth on the data being fetched; never treat a client guard as
  protection.
- **Form lifecycle:** React Hook Form state not reset on cancel/navigation where stale values would
  leak into the next use.

## Skip entirely (generated / build)

Do not review or comment on files matching:

```
**/node_modules/**
**/dist/**
**/build/**
**/.turbo/**
**/.tanstack/**
**/coverage/**
pnpm-lock.yaml
**/routeTree.gen.ts
**/src/openapi/**
*.gen.ts
*.generated.*
```

(`**/src/openapi/**` is the generated OpenAPI client — models, queries, ACL. A repo's `REVIEW.md`
may add to or narrow this list.)
