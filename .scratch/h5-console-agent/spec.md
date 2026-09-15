# H5 Console via local Agent (ops Tunnel)

Status: ready-for-agent

## Problem Statement

Team members need to drive Auto Pack from a phone or desktop browser (H5 Console), not only from the Electron desktop Console on the Build Host. Builds must still run on a shared macOS Build Host with the real App Root, signing, and Fastlane toolchain. Today there is no HTTP Agent, no Access Token gate, and no browser-reachable control surface—only Electron IPC and a bash CLI. Pure remote CI does not replace this local model for the current need.

## Solution

Run a loopback-only Agent on the Build Host that exposes the same Console control surface the desktop shell uses today. Operators expose that port with an external Tunnel (e.g. cpolar); Auto Pack does not embed or manage the Tunnel. Callers authenticate with a shared Access Token. The H5 Console is a browser UI with capability parity to the desktop Console (Readiness, Branch, multi-Target Run, logs, QR / Merged Install Page). Electron stays; phase one keeps Electron on IPC while H5 talks HTTP to shared libraries; later both converge on one HTTP Agent. One build-class Run at a time—if busy, reject with a clear message (no queue). Windows Build Host is out of scope.

## User Stories

1. As a Build Host operator, I want an Agent that listens only on loopback, so that nothing is reachable until I deliberately open a Tunnel.
2. As a Build Host operator, I want to start and stop the Agent independently of Electron, so that the shared machine can serve H5 without someone sitting at the desktop shell.
3. As a Build Host operator, I want to configure a shared Access Token for the Agent, so that knowing the Tunnel URL alone is not enough to trigger Runs.
4. As a Build Host operator, I want rejected unauthenticated requests, so that anonymous callers cannot read Readiness or start builds.
5. As a Build Host operator, I want Tunnel setup to remain outside Auto Pack (e.g. cpolar), so that tunnel accounts and renewals stay an ops concern.
6. As a teammate on my phone, I want to open the H5 Console over the Tunnel URL, so that I can pack without being at the Mac.
7. As a teammate on a laptop browser, I want the same H5 Console, so that I am not forced onto Electron or SSH.
8. As a teammate, I want to enter or supply the Access Token once per session, so that subsequent Console actions succeed without re-pasting every click.
9. As a teammate, I want to see Readiness for the Targets I select, so that I know whether build or upload will work before I start.
10. As a teammate, I want to see the current App Root and Branch, so that I know what the shared machine will build.
11. As a teammate, I want to switch Branch on the App Root when no build-class Run is active and the worktree is clean, so that I can pack the right code.
12. As a teammate, I want Branch switch to fail clearly when the worktree is dirty or a build is running, so that I do not corrupt a shared checkout.
13. As a teammate, I want to multi-select Platforms and Modes (Targets), so that one Run can cover Android / iOS / Harmony as today.
14. As a teammate, I want to enter an optional Install Note, so that Pgyer update text and the QR view show the same note.
15. As a teammate, I want to start build, upload, or build-and-upload, so that I can do the same lanes as the desktop Console.
16. As a teammate, I want a clear rejection when another build-class Run is already active, so that I know to wait rather than queue silently.
17. As a teammate, I want to cancel the active Run I started (or the active Run on the machine, per existing cancel semantics), so that a stuck or wrong build can be stopped.
18. As a teammate, I want a live log stream with platform prefixes (and `[shared]` for prep), so that I can follow progress remotely.
19. As a teammate, I want to see Run finished status (success / failure / cancelled) per the existing composite behavior, so that partial multi-Target outcomes are understandable.
20. As a teammate, after a successful upload Run, I want Merged Install Page when configured, otherwise per-Target QR cards, so that installers match desktop Console behavior.
21. As a teammate, I want Install Note shown on the QR / result UI when provided, so that testers see the note.
22. As a teammate, I want Harmony release Targets to build but skip Pgyer upload with a clear hint, so that market `.app` packages are not falsely treated as uploadable.
23. As a desktop Console user on the Build Host, I want Electron to keep working as today during phase one, so that local operators are not blocked by the H5 work.
24. As a desktop Console user, I want the same one-active-build rule shared with the Agent, so that Electron and H5 cannot start two build-class Runs at once.
25. As a desktop Console user, I want pick-App-Root via native dialog to remain available, so that local setup stays convenient.
26. As an H5 user, I want to set App Root by path string (not native dialog), so that remote clients can still point the Build Host at the Flutter project when allowed.
27. As a Build Host operator, I want H5 App Root writes to go through the same persistence as today, so that CLI / Fastlane / Console agree on `APP_ROOT`.
28. As a teammate, I want Readiness and Run gates to respect Pgyer key presence the same way as desktop, so that upload affordances are honest.
29. As a future maintainer, I want Electron and H5 to eventually share one HTTP Agent, so that the control surface does not permanently fork.
30. As a future maintainer, I want phase one to avoid rewriting Fastlane into Node, so that ADR 0002 remains intact.
31. As a teammate, I want upload-only Runs to still be allowed alongside documentation of interaction with an active build, consistent with existing scheduler rules, so that upload-only work is not accidentally banned.
32. As a Build Host operator, I want Agent process logs for auth failures and bind address, so that misconfigured Tunnel or Token issues are diagnosable on the machine.
33. As a teammate, I want the H5 UI to work on mobile viewport sizes, so that phone use is practical for the core flows.
34. As a teammate, I want the H5 UI to work on desktop browser widths, so that laptop use matches phone capability.
35. As a security-conscious operator, I want the Agent never to bind to all interfaces by default, so that LAN exposure requires an explicit future decision (out of this spec’s default).
36. As a teammate, I want no requirement to install Electron on my phone or laptop, so that H5 is sufficient for remote control.
37. As a CLI user on the Build Host, I want existing `bin/*` Fastlane flows unchanged, so that automation and debugging stay available beside Agent/H5.
38. As a teammate, I want product/dart-define behavior for Runs to match what desktop Console already passes through, so that H5 does not silently drop packaging defines.
39. As a Build Host operator, I want a documented ops checklist (start Agent, set Token, start Tunnel), so that onboarding the shared machine is repeatable.
40. As an agent implementer, I want tests against the Console control API and composite Run seams, so that HTTP wiring can stay thin and regressions are caught without spawning Fastlane.

## Implementation Decisions

- Honor ADR 0009: local Agent + ops Tunnel; no Windows Build Host; no in-product Tunnel; Fastlane remains the engine.
- Extract a shared Console control API that mirrors today’s desktop bridge contracts: get Readiness (optional Targets), set/persist App Root, checkout Branch, start Run, cancel Run, subscribe to Run events (started / log / finished), and fetch last-upload / QR presentation data (including Merged Install Page preference).
- Phase one: H5 Console speaks HTTP to the Agent over that API; Electron continues to use IPC and calls the same underlying libraries / scheduler instance where feasible so mutual exclusion is real, not per-process optimistic.
- If Electron and Agent cannot yet share one process, they must still share one RunScheduler (or equivalent lock) on the Build Host so only one build-class Run runs; document the chosen process topology in the implementation ticket.
- Agent binds to 127.0.0.1 only; port configurable via env/config.
- Access Token: shared secret from env/config; every mutating and sensitive read endpoint requires it (header or equivalent). Missing/wrong Token → 401. No per-user accounts in this phase.
- Busy build-class Run: start Run returns a structured rejection (not queue, not preempt).
- H5 App Root: accept an absolute path write through the control API; do not require native file dialogs. Desktop keeps native pick.
- H5 serves static Console UI from the Agent (or co-located static files from the same origin as the API) so Tunnel maps one origin. Avoid a separate public static host that would complicate Token and CORS.
- Run log delivery: streaming over the Agent (SSE or WebSocket). Prefer one streaming mechanism; keep event payloads aligned with existing started/log/finished shapes.
- QR / Merged Install Page: H5 displays results in-page (link + QR image or embedded HTML equivalent). Do not depend on Electron BrowserWindow for remote users.
- Reuse existing composite Run orchestration, readiness assessment, git checkout rules, upload-result aggregation, and Target normalization. Do not reimplement multi-Target scheduling in the HTTP layer.
- Secondary test seam remains injectable lane start under composite Run for engine behavior; Agent HTTP tests should fake or avoid real Fastlane spawn.
- Later convergence (out of phase-one delivery but designed toward): Electron becomes another HTTP client of the same Agent; IPC adapters shrink to OS-only helpers (dialogs).
- CLI bash entrypoints remain as-is; multi-Target composite remains Console/Agent path unless a later spec ports it to CLI.

## Testing Decisions

- Good tests assert external behavior of the Console control API and composite Run outcomes (acceptance/rejection, event order, busy rejection, Token gate), not Electron IPC wiring or Tunnel binaries.
- Primary module under test: the shared Console control API (and thin HTTP adapter if kept stupid).
- Secondary: existing composite Run tests with fake lane starter remain the engine regression suite; extend only when Agent changes orchestration rules.
- Prior art: Node’s built-in test runner under `test/`; composite Run with injectable lane starter; readiness assessment over fake probes; RunScheduler unit tests; temp-dir tests for env/git/upload-result.
- Add HTTP-level tests for Access Token required/rejected and busy Run rejection without spawning Fastlane.
- Do not require end-to-end Tunnel or real device browsers in automated CI for this phase; manual ops checklist covers Tunnel.

## Out of Scope

- Windows (or non-macOS) Build Host support
- Embedding or automating cpolar/ngrok inside Auto Pack
- Personal accounts / SSO (Access Token only)
- Run queue, fair scheduling, or preempt/cancel-another-user flows beyond existing cancel
- Multiple isolated App Root worktrees for parallel teammates
- Rewriting Fastlane lanes into Node
- Migrating Electron fully onto HTTP in phase one (designed for later)
- Changing Pgyer, artifact naming, or Platform/Mode domain rules except where H5 must mirror them
- Pure remote CI as a substitute for the Build Host Agent
- Binding Agent to 0.0.0.0 / LAN by default

## Further Notes

- Domain language: CONTEXT.md (Build Host, Agent, Access Token, Tunnel, Console, H5 Console, Run, Target, etc.).
- Decision record: docs/adr/0009-h5-via-local-agent-and-ops-tunnel.md; also respect ADR 0002 (Electron/shell over Fastlane).
- GitHub remote exists (`stvenfor/auto_pack`) but `gh` was not authenticated at publish time; this spec lives on the local markdown tracker. After `gh auth login`, it may be mirrored to a GitHub Issue with label `ready-for-agent` if desired.
- Suggested next step: `/to-tickets` to split into tracer-bullet issues under `.scratch/h5-console-agent/issues/`.
