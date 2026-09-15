# 02 — Agent loopback + Access Token + Readiness H5

**What to build:** An operator can start the Agent on the Build Host independently of Electron. It listens only on loopback, requires a shared Access Token, exposes Readiness over HTTP, and serves a minimal H5 page where a teammate enters the Token and sees Readiness for selected Targets. Tunnel remains ops-only (e.g. cpolar mapping that port).

**Blocked by:** 01 — Extract Console control API

**Status:** done

- [x] Agent process starts/stops without Electron and binds to 127.0.0.1 only (port configurable)
- [x] Requests without a valid Access Token are rejected (401); valid Token can fetch Readiness via the control API
- [x] Same origin serves a minimal H5 Console that accepts Token once per session and displays Readiness (App Root / Branch summary as already provided by Readiness)
- [x] Automated tests cover Token gate and Readiness happy path without Fastlane spawn
- [x] Agent logs bind address and auth failures for operator diagnosis
- [x] No in-product Tunnel integration
