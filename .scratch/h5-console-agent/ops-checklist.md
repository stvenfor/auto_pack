# Build Host ops checklist — H5 Console via Agent + Tunnel

Status: ready-for-agent (operator doc)

## Scope

- Shared **macOS Build Host** only (no Windows Build Host).
- Auto Pack **Agent** listens on loopback; **Tunnel** (e.g. cpolar) is ops-owned, not in-product.

## Bring-up

1. Install toolchain on the Build Host (Flutter/FVM, Fastlane, Xcode, Android SDK, DevEco as needed) and clone `auto_pack`.
2. Configure `auto_pack/.env`:
   - `APP_ROOT` — absolute path to the Flutter app
   - `PGYER_API_KEY` (and optional `PGYER_MERGED_INSTALL_URL`)
   - `AGENT_ACCESS_TOKEN` — shared Access Token for the team
   - optional `AGENT_PORT` (default `8787`)
3. Start the Agent (from `auto_pack` root):

   ```bash
   npm run agent
   # or: node bin/agent
   ```

   Expect log: `listening on http://127.0.0.1:8787 (loopback only)`.
4. On the same machine, start an external Tunnel that maps a public HTTPS URL to `127.0.0.1:8787` (cpolar / ngrok / etc.). Do **not** change `AGENT_HOST` away from loopback.
5. Open the Tunnel URL on a phone or laptop browser → H5 Console.
6. Enter the Access Token once → should see Readiness.

## Phone smoke path

1. Token → Readiness shows App Root / checks.
2. (Optional) set App Root path / switch Branch when worktree is clean.
3. Select Targets → Build or 构建并上传.
4. Watch live logs; on success open 安装结果 (Merged Install Page or QR cards).
5. If another build is running, expect a clear “already active” / busy message (no queue).

## Common failures

| Symptom | Likely cause |
|--------|----------------|
| 401 / Token 无效 | Wrong `AGENT_ACCESS_TOKEN`, or browser session cleared |
| Page loads but API fails | Tunnel points at wrong port; Agent not running |
| Busy / already active | Another Electron or Agent Run holds the build lock |
| Branch switch rejected | Dirty App Root worktree, or build-class Run active |
| Cannot upload | Missing `PGYER_API_KEY`, or Harmony release-only Targets |

## Out of scope (do not expect)

- Windows Build Host
- One-click Tunnel inside Auto Pack
- Per-user accounts (shared Access Token only)
- Parallel build-class Runs / queue
