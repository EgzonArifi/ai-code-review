# iOS review rules

Layers on top of `general.md`. Same objective: high signal, low noise. This pack assumes a
Povio-style iOS project (SwiftLint in CI, MVVM + Router architecture, generated OpenAPI client).

The guiding principle: **only report what SwiftLint and the project's own architecture skills
cannot already catch.** Everything the toolchain enforces is noise if you repeat it.

---

## Defer to SwiftLint — do NOT flag these

CI runs `swiftlint --strict` with force-unwrapping and length/complexity rules enabled. Never
post findings for:

- Force unwraps (`!`), `try!`, force casts (`as!`) — all enforced (SwiftLint default
  `force_try` / `force_cast` plus opt-in `force_unwrapping`).
- Line length, function / type / file length, parameter count. (Note: `cyclomatic_complexity`
  is **disabled** in this template — don't treat it as linter-covered, and don't flag it either;
  subjective complexity isn't worth a comment per general.md.)
- `print(...)` in place of a logger, trailing whitespace, modifier order, comment spacing.
- Singleton style, `guard`-vs-`if` return style, one-enum-case-per-line, and other custom
  SwiftLint rules.

If SwiftLint would catch it, stay silent.

## Defer to the project's architecture skills — mention, don't re-derive

Architecture conventions live in the repo's `.agents/skills/`: `povio-arch` (MVVM + Router +
Interactor + Mapper, DI, packages), `atlas` (AtlasUI design system / tokens), `swift-concurrency`
(async/await, actors, `@MainActor`, `Sendable`, retain cycles), `swiftui-performance-audit` (view
recomputation / hangs), `swiftui-ui-patterns` (NavigationStack, sheets, lists, etc.), and
`swiftui-view-refactor` (Observation, `@State`/`@Observable`). If a genuine violation is worth
raising, keep it to a brief 🟡 pointer to the relevant skill — do not restate the whole rule.
Typical cases:

- View containing business logic, or navigation performed outside the Router.
- ViewModel missing `@Observable` / `@MainActor`, or injected instead of owned via `@State`.
- Hard-coded colors/spacing/fonts instead of AtlasUI tokens.
- Obvious excessive view recomputation.

## Focus here — what neither SwiftLint nor the compiler catches

These are the high-value 🔴 findings for iOS:

- **Retain cycles / leaks:** closures capturing `self` strongly (escaping closures, Combine
  `sink`/`assign`, `Task {}` captures, notification/observer blocks) without `[weak self]`;
  observers or Combine subscriptions never cancelled.
- **Concurrency correctness (beyond compiler enforcement):** `@MainActor` / actor-isolation
  mistakes that still compile, UI mutation off the main actor, `Sendable` violations, data
  races, misuse of `Task` (unstructured tasks that outlive their scope, missing cancellation,
  `Task.detached` losing actor context).
- **Logic & error handling:** incorrect business logic, swallowed errors, unhandled failure
  paths, off-by-one / boundary bugs, incorrect optional handling that changes behavior.
- **State-machine consistency on error paths:** loading/`isLoading`/pagination flags left in a
  wrong state when an `async` call throws mid-flight, cursors not reset, a `catch` that swallows
  a failure without surfacing or recovering (common in ViewModel `load`/`loadMore` paths).
- **API integration:** Mapper DTO → Domain correctness — especially handling of the OpenAPI
  generator's `unknownDefaultOpenApi` / unknown enum cases; Interactor logic that mishandles
  API results, pagination, or auth/token state.

---

## Skip entirely (generated / vendored / tooling)

Do not review or comment on files matching:

```
**/Packages/OpenAPIClient/**
**/Packages/Lingua/**
**/PovioMacro/**
**/.build/**
fastlane/
Scripts/
BuildScripts/
FileTemplates/
**/*Tests/**
vendor/
*.generated.*
Package.resolved
Packages/*/Package.swift
```

(A repo's `REVIEW.md` may add to or narrow this list.)
