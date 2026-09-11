# Electron app lives at Auto Pack repo root

The Console is an Electron app whose `package.json` sits at the Auto Pack repository root, alongside Fastlane and `bin/`. Rejected a nested `desktop/` package so “opening the project” is the desktop app; Fastlane remains a sibling toolchain, not deleted or relocated into `node_modules`.
