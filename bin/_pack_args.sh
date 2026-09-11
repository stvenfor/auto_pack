#!/usr/bin/env bash
# Shared arg parsing for Auto Pack CLI: --platform / --mode
# shellcheck shell=bash

PACK_PLATFORM="${PACK_PLATFORM:-android}"
PACK_MODE="${PACK_MODE:-debug}"

usage_pack_args() {
  cat <<'EOF'
Options:
  --platform <android|ios|harmony>           default: android
  --mode <debug|release|profile>             default: debug
      profile is Harmony-only (hap --release --flavor profile)
      Harmony release builds .app (not uploadable to Pgyer)
  -h, --help
EOF
}

parse_pack_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --platform)
        PACK_PLATFORM="${2:-}"
        shift 2
        ;;
      --mode)
        PACK_MODE="${2:-}"
        shift 2
        ;;
      -h|--help)
        return 2
        ;;
      *)
        echo "Unknown argument: $1" >&2
        return 1
        ;;
    esac
  done

  case "$PACK_PLATFORM" in
    android|ios|harmony) ;;
    *)
      echo "Invalid --platform: $PACK_PLATFORM (expected android|ios|harmony)" >&2
      return 1
      ;;
  esac

  case "$PACK_PLATFORM" in
    harmony)
      case "$PACK_MODE" in
        debug|release|profile) ;;
        *)
          echo "Invalid --mode for harmony: $PACK_MODE (expected debug|release|profile)" >&2
          return 1
          ;;
      esac
      ;;
    *)
      case "$PACK_MODE" in
        debug|release) ;;
        *)
          echo "Invalid --mode for $PACK_PLATFORM: $PACK_MODE (expected debug|release)" >&2
          return 1
          ;;
      esac
      ;;
  esac
  export PACK_PLATFORM PACK_MODE
}
