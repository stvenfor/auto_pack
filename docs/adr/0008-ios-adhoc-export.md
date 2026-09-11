# iOS Ad Hoc export by default for release

## Status

Accepted

## Context

Pgyer / device install needs an Ad Hoc (or enterprise) IPA, not App Store. Auto Pack previously ran `flutter build ipa --release` with no `--export-method`, leaving export to Xcode defaults. Flutter supports `--export-method ad-hoc` and `--export-options-plist`.

## Decision

- iOS **debug** and **release** builds both pass `--export-method ad-hoc` by default (Pgyer / device install).
- Override with `IOS_EXPORT_METHOD` (`ad-hoc` | `app-store` | `development` | `enterprise`).
- If `IOS_EXPORT_OPTIONS_PLIST` is set to an existing file, use `--export-options-plist` instead of `--export-method`.
- Signing material (Distribution cert, Ad Hoc profile, device UDIDs) remains the App Root / Apple Developer responsibility.
- Development export is opt-in only (`IOS_EXPORT_METHOD=development`) for USB / Xcode-style installs.

## Consequences

- Debug and release IPAs are both suitable for Pgyer without a Console toggle.
- Failures surface clearer hints about Ad Hoc provisioning when no IPA is produced.
- App Store / development exports require an explicit env override.
