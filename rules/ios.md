# iOS review rules

Layers on top of `general.md`. Same objective: high signal, low noise. This pack assumes a
Povio-style iOS project (SwiftLint in CI, MVVM + Router architecture, generated OpenAPI client).

The guiding principle: **only report what SwiftLint and the project's own architecture skills
cannot already catch.** Everything the toolchain enforces is noise if you repeat it.

---

## Defer to SwiftLint — do NOT flag these

CI runs `swiftlint --strict` with force-unwrapping and length/complexity rules enabled. Never
post findings for:

- Force unwraps (`!`), `try!`, force casts (`as!`) — `force_unwrapping` is enforced.
- Line length, function/type/file length, cyclomatic complexity.
- `print(...)` in place of a logger, trailing whitespace, modifier order, comment spacing.
- Singleton style, `guard`-vs-`if` return style, one-enum-case-per-line, and other custom
  SwiftLint rules.

If SwiftLint would catch it, stay silent.

## Defer to the project's architecture skills — mention, don't re-derive

Architecture conventions live in the repo's `.agents/skills/` (`povio-arch`, `atlas`,
`swift-concurrency`, `swiftui-*`). If a genuine violation is worth raising, keep it to a brief
🟡 pointer to the relevant convention — do not restate the whole rule. Typical cases:

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
**/AtlasUI/**
**/Onboarding/**
**/.build/**
fastlane/
Scripts/
BuildScripts/
FileTemplates/
**/*Tests/**
*.generated.*
Package.resolved
```

(A repo's `REVIEW.md` may add to or narrow this list.)
