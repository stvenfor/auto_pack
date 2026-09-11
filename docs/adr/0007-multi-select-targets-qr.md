# Multi-select Targets and QR presentation

## Status

Accepted

## Context

Console originally forced one Platform × Mode per Run via dropdowns. Users need to pack several platforms in one click, each with its own Mode, share one Install Note, and prefer a single install QR when Pgyer has a merged install page. Pgyer’s upload API still returns per-build QR URLs; a true shared QR only exists after manual「应用合并」in the Pgyer dashboard.

Multi-Target wall-clock time was dominated by sequential `flutter pub get` + per-platform `flutter build`. Naive full-lane parallelism races on App Root (`.dart_tool`, Flutter startup lock, `last-upload.json`).

## Decision

- Replace the Platform dropdown with three selectable rows (android / ios / harmony), each with its own Mode control.
- One Console action = one composite Run; one log stream with platform prefixes; cancel aborts the batch.
- **Multi-Target build / distribute:** run Fastlane `prep_deps` once (`flutter pub get`), then **parallel** `build` lanes with `PACK_SKIP_PUB_GET=1`, then **parallel** `upload_pgyer` (each Target writes `artifacts/last-upload-{platform}-{mode}.json`; Node aggregates `last-upload.json` after all settle). Wait for all uploads — keep successes if some fail.
- Multi-Target **upload-only** also runs uploads in parallel.
- Single-Target Runs stay one Fastlane lane (includes its own `pub get`; Fastlane still writes shared `last-upload.json` for CLI `open-qr`).
- Upload result isolation: Console sets `PACK_UPLOAD_RESULT_PATH` + `PACK_SKIP_SHARED_UPLOAD_RESULT=1` so parallel Fastlane processes do not race the shared JSON.
- Install Note is optional; when non-empty it is sent as Pgyer update description and shown on the QR window; when empty the QR UI omits that block.
- After successful upload(s): if `PGYER_MERGED_INSTALL_URL` is set in `.env`, open that page; otherwise open one multi-card QR window (one card per uploaded platform). Console does not edit the merged URL.
- On「构建并上传」, Targets that cannot upload (e.g. Harmony release → `.app`) are built only; upload is skipped with an explicit log/hint; other Targets continue.

## Consequences

- Scheduler still allows at most one App Root–mutating build batch at a time; the batch owns the slot for the whole multi-Target sequence.
- Parallel `flutter build` may still serialize briefly on Flutter’s startup lock; wall-clock usually still improves vs full sequential pub-get+build.
- CLI may remain single-Target via `--platform` / `--mode`; multi-select is a Console concern unless later extended.
- Operators who want one physical QR must create a Merged Install Page in Pgyer once and put its URL in `.env`.
