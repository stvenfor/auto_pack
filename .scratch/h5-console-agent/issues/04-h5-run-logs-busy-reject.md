# 04 — H5 Run + live logs + busy reject

**What to build:** From the H5 Console, a teammate can multi-select Targets, enter optional Install Note, start build / upload / build-and-upload, watch a live log stream, cancel the Run, and get a clear rejection when a build-class Run is already active—parity with desktop Console orchestration (including Harmony release upload skip behaviour already in the engine).

**Blocked by:** 03 — H5 App Root + Branch

**Status:** done

- [x] H5 can start the same lane kinds as desktop Console with multi-Target payloads and optional Install Note
- [x] Live log / started / finished events reach the H5 UI (streaming over the Agent)
- [x] Cancel stops the active Run per existing cancel semantics
- [x] Busy build-class Run → structured reject in API and visible message in H5 (no queue)
- [x] Upload-only vs build-class mutual exclusion follows existing RunScheduler rules
- [x] Product / dart-define behaviour for Runs matches what desktop already passes through
- [x] Tests cover start/busy/cancel and event flow with fake lane starter; no Tunnel required in CI
