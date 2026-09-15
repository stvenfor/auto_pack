# 01 — Extract Console control API

**What to build:** Desktop Console keeps working as today, but Readiness, App Root, Branch, Run start/cancel, Run events, and busy-build rejection are driven through one shared Console control API (with a cross-process lock so a later Agent process cannot start a second build-class Run). Operators and developers can verify behaviour via tests without opening Electron.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] Electron desktop Console still performs Readiness, Branch, Run, and cancel through a thin adapter over the control API
- [x] Control API covers get Readiness, set/persist App Root, checkout Branch, start Run, cancel Run, and Run event subscription with contracts aligned to today’s desktop bridge
- [x] Starting a build-class Run while another is active is rejected with a clear reason; the busy signal is safe across separate processes on the same Build Host
- [x] Automated tests exercise the control API (including busy rejection) without spawning Fastlane (fake lane starter / existing composite-run seam)
- [x] No intentional change to Fastlane lanes, CLI `bin/*`, or domain rules for Platform / Mode / Target
