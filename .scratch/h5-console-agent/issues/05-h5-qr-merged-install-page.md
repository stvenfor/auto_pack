# 05 — H5 result page (QR / Merged Install Page)

**What to build:** After a successful upload-oriented Run, the H5 Console shows install results in-page: Merged Install Page when configured, otherwise per-Target QR cards, including Install Note when provided—without opening an Electron window.

**Blocked by:** 04 — H5 Run + live logs + busy reject

**Status:** done

- [x] On successful upload result, H5 prefers Merged Install Page when that URL is configured
- [x] Otherwise H5 shows per-Target QR / install links consistent with existing last-upload aggregation
- [x] Install Note appears on the result UI when the Run included one
- [x] Remote users never depend on Electron BrowserWindow for QR
- [x] Tests cover result-data selection (merged vs per-Target) at the control API / presentation-data seam
