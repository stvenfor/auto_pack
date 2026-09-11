# Multi-select Targets and QR presentation

## Status

Accepted

## Context

Console originally forced one Platform × Mode per Run via dropdowns. Users need to pack several platforms in one click, each with its own Mode, share one Install Note, and prefer a single install QR when Pgyer has a merged install page. Pgyer’s upload API still returns per-build QR URLs; a true shared QR only exists after manual「应用合并」in the Pgyer dashboard.

## Decision

- Replace the Platform dropdown with three selectable rows (android / ios / harmony), each with its own Mode control.
- One Console action = one composite Run: Targets run sequentially in fixed order android → ios → harmony; one log stream with platform prefixes; cancel aborts the batch.
- Install Note is optional; when non-empty it is sent as Pgyer update description and shown on the QR window; when empty the QR UI omits that block.
- After successful upload(s): if `PGYER_MERGED_INSTALL_URL` is set in `.env`, open that page; otherwise open one multi-card QR window (one card per uploaded platform). Console does not edit the merged URL.
- On「构建并上传」, Targets that cannot upload (e.g. Harmony release → `.app`) are built only; upload is skipped with an explicit log/hint; other Targets continue.

## Consequences

- Scheduler still allows at most one App Root–mutating build batch at a time; the batch owns the slot for the whole multi-Target sequence.
- CLI may remain single-Target via `--platform` / `--mode`; multi-select is a Console concern unless later extended.
- Operators who want one physical QR must create a Merged Install Page in Pgyer once and put its URL in `.env`.
