# Harmony Pgyer upload enabled

## Status

Accepted

## Context

ADR 0005 deferred Harmony automatic Pgyer upload because HAP distribution needs a matching `.p12` on Pgyer. The account now has `.p12` configured on Pgyer, so Auto Pack can upload HAP the same way as APK/IPA.

## Decision

- Enable Console/CLI `upload_pgyer` and `distribute` for Harmony **`.hap`** builds (`debug` / `profile`).
- Pgyer `buildType` for Harmony is `harmonyos`.
- Do not upload `.p12` from Auto Pack; rely on the certificate already configured in the Pgyer account.
- Harmony **release** builds `flutter build app --release --flavor release` → `.app` (AppGallery). Pgyer does not accept `.app`; Readiness `canUpload` is false for that pair.

## Consequences

- Harmony Readiness `canUpload` follows Key + Fastlane + artifacts, except Harmony release (`.app`).
- If Pgyer rejects a HAP because `.p12` is missing or mismatched, fix it in the Pgyer console rather than in Auto Pack env.
