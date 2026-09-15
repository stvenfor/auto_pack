# 03 — H5 App Root + Branch

**What to build:** From the H5 Console (after Access Token), a teammate can set App Root by absolute path and switch Branch on that checkout, with the same dirty-worktree and “no switch during build-class Run” rules as the desktop Console.

**Blocked by:** 02 — Agent loopback + Access Token + Readiness H5

**Status:** done

- [x] H5 can set App Root by path; persistence matches existing App Root configuration so CLI / Fastlane / Console agree
- [x] H5 can list/select and checkout Branch when allowed; success refreshes Readiness in the UI
- [x] Dirty worktree and active build-class Run produce clear failures (no silent ignore)
- [x] Desktop native “pick folder” remains available in Electron; H5 does not depend on it
- [x] Tests cover control-API path set + Branch reject/success cases without requiring a browser
