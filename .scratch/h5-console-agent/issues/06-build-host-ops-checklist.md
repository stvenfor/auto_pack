# 06 — Build Host ops checklist

**What to build:** An operator following a short checklist can bring up the shared macOS Build Host for remote H5 use: configure Access Token, start Agent, start external Tunnel, and smoke-test from a phone browser.

**Blocked by:** 05 — H5 result page (QR / Merged Install Page)

**Status:** done

- [x] Checklist documents Token config, Agent start/stop, loopback bind expectation, and external Tunnel (e.g. cpolar) as ops-owned
- [x] Checklist includes a phone-browser smoke path (Token → Readiness → optional Run) and common failure notes (401, busy Run, Tunnel down)
- [x] Explicitly states Windows Build Host and in-product Tunnel are out of scope
- [x] Lives with the feature scratch/docs the team will actually open (no requirement to change product runtime behaviour)
