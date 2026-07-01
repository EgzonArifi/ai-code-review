# Android review rules (Kotlin + Jetpack Compose)

Layers on top of `general.md`. Targets a modular Kotlin + Compose app (Gradle KTS) using
Koin (annotations), Ktor client, Room + DataStore, Coroutines/Flow, Compose Navigation (typed
serializable routes), and MVVM (ViewModel + `StateFlow` + effects `Channel`,
`collectAsStateWithLifecycle`), with `Either<Failure, T>` results. Same objective: high signal,
low noise.

**Applies to:** Android/Kotlin paths (`app/**`, `core/**`, `feature/**`).

Principle: only report what **detekt**, **ktlint**, **Android Lint** (+ Slack compose-lint-checks),
and the Kotlin compiler cannot already catch. If the tooling flags it, stay silent.

## Defer to the toolchain — do NOT flag

- Formatting & style — ktlint / `.editorconfig` (official Kotlin style, 120-col, `@Composable`
  naming exemption).
- Complexity, long method/class, parameter count, `ReturnCount`/`ThrowsCount`, `MaxLineLength`,
  `ForbiddenComment` (TODO/FIXME) — detekt (`config/detekt/detekt.yml`).
- Detekt's **coroutines** ruleset (`InjectDispatcher`, `SleepInsteadOfDelay`,
  `SuspendFunWithFlowReturnType`) and **potential-bugs** (`HasPlatformType`,
  `UnsafeCallOnNullableType`, `UnsafeCast`, `MapGetWithNotNullAssertionOperator`).
- Compose stability / recomposition issues that **Slack compose-lint-checks** catches.

Note: this template has **no CI gate** (no workflows; detekt `warningsAsErrors: false`), so the
tools run locally and non-blocking. Still don't duplicate their domain — devs run them; your value
is the correctness they can't catch, below.

## Focus here — correctness the tooling & compiler miss

- **`GlobalScope` usage:** detekt's `GlobalCoroutineUsage` is **disabled** here, so flag
  `GlobalScope.launch/async` in production — use `viewModelScope` or an injected scope.
- **Unstructured / unscoped coroutines:** work launched in a repository or elsewhere that outlives
  its caller or has no cancellation path; `runBlocking` or blocking IO on the main thread; a
  hardcoded `Dispatchers.*` instead of the injected dispatcher.
- **Compose lifecycle collection:** collecting a `Flow`/`StateFlow` with `collectAsState()` instead
  of `collectAsStateWithLifecycle()` (keeps collecting in the background / wasted work).
- **Side effects & effect keys in Compose:** API / DB / repository calls in a `@Composable` body
  instead of `LaunchedEffect`/ViewModel; `LaunchedEffect(Unit)` that should key on changing inputs
  (or a key that changes every recomposition); `mutableStateOf(...)` without `remember`; a ViewModel
  held via `remember` instead of `koinViewModel()`.
- **Error / loading state modeling:** an `Either<Failure, T>` (or repository result) whose `UiState`
  doesn't represent loading/error → silent failures and stuck spinners.
- **Leaks:** a ViewModel or long-lived scope holding a `Context` / `Activity` / `View`.
- **Secrets:** hardcoded keys / tokens / URLs (use `BuildConfig` / manifest placeholders per
  variant); auth tokens in `SharedPreferences` rather than DataStore.
- **Room:** non-`suspend` DAO queries or `allowMainThreadQueries()`; destructive/non-backward-
  compatible migrations when the schema version bumps.
- **Module boundaries:** `:core:domain` depending on Android/Compose libraries; a `:feature`
  importing another `:feature`; `:core:data` depending on a `:feature`.

## Skip entirely (generated / build / secrets)

Do not review or comment on files matching:

```
**/build/**
**/.gradle/**
**/generated/**
**/.ksp/**
**/*_Impl.kt
**/BuildConfig.*
**/R.java
gradle/wrapper/gradle-wrapper.jar
**/*.iml
.idea/**
local.properties
google-services.json
*.jks
*.keystore
```

(Koin/Dagger/Room/KSP generated code lives under `build/`/`generated/` and is covered above. A
repo's `REVIEW.md` may add to or narrow this list.)
