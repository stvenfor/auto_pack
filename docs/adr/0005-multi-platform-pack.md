# Multi-platform artifacts; Harmony upload deferred

## Status

Accepted

## Context

Auto Pack previously only produced Android debug APK (`artifacts/app-debug.apk`) and uploaded it to Pgyer. The Console now needs local Branch checkout, debug/release Modes, and Android / iOS / Harmony Platforms, with CLI parity.

## Decision

- Parameterize Fastlane lanes `build` / `upload_pgyer` / `distribute` via `PACK_PLATFORM` and `PACK_MODE` (still invoked as `fastlane android <lane>`).
- Artifact names: `artifacts/{platform}-{mode}.{apk|ipa|hap|app}` (Harmony release → `.app`).
- Android and iOS support build + Pgyer upload; Harmony supports build only in this phase (no Pgyer `.p12` API wiring). Console hides upload actions for Harmony.
- Branch selection checks out immediately in App Root; dirty worktrees are refused; no fetch; branch switch blocked while a build Run is active.

## Consequences

- Callers must pass platform/mode (Console selectors or CLI `--platform` / `--mode`); defaults remain `android` / `debug`.
- Old `app-debug.apk` path is no longer the contract; migrate scripts to `android-debug.apk`.
- Harmony automatic distribute remains a future change (needs Pgyer HAP + `.p12` flow).
