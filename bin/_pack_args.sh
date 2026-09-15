#!/usr/bin/env bash
# Shared arg parsing for Auto Pack CLI: --platform / --mode / --product / --dart-define
# shellcheck shell=bash

# Resolve pack root at source time — inside functions BASH_SOURCE points at the caller.
_PACK_ARGS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PACK_PLATFORM="${PACK_PLATFORM:-android}"
PACK_MODE="${PACK_MODE:-debug}"
PACK_PRODUCT="${PACK_PRODUCT:-0}"
PACK_DART_DEFINES="${PACK_DART_DEFINES:-}"
_PACK_DEFINE_SPECS=()

usage_pack_args() {
  cat <<'EOF'
Options:
  --platform <android|ios|harmony>           default: android
  --mode <debug|release|profile>             default: debug
      profile is Harmony-only (hap --release --flavor profile)
      Harmony release builds .app (not uploadable to Pgyer)
  --product                                  add --dart-define=TF_NET_PRODUCT=true
  --dart-define <KEY=value>                  pass through to flutter build (repeatable)
  --dart-define=<KEY=value>
  -h, --help
EOF
}

# Resolve --product + --dart-define into PACK_DART_DEFINES / PACK_PRODUCT via Node.
# Prints to stdout: line1=0|1 (ok), line2=0|1 (product), line3+=envValue (may be empty).
_resolve_pack_dart_defines() {
  local result
  result="$(
    node - "$_PACK_ARGS_ROOT" "$PACK_PRODUCT" "${_PACK_DEFINE_SPECS[@]}" <<'NODE'
const path = require("node:path");
const { resolveDartDefines } = require(path.join(process.argv[2], "src/lib/dart-defines.js"));
const product = process.argv[3] === "1";
const defines = process.argv.slice(4);
try {
  const resolved = resolveDartDefines({ product, defines });
  process.stdout.write(`1\n${resolved.product ? "1" : "0"}\n${resolved.envValue}`);
} catch (err) {
  process.stderr.write(String(err.message || err) + "\n");
  process.stdout.write("0\n0\n");
  process.exit(1);
}
NODE
  )" || return 1

  local ok product_flag
  ok="$(printf '%s\n' "$result" | sed -n '1p')"
  product_flag="$(printf '%s\n' "$result" | sed -n '2p')"
  if [[ "$ok" != "1" ]]; then
    return 1
  fi
  PACK_PRODUCT="$product_flag"
  PACK_DART_DEFINES="$(printf '%s\n' "$result" | sed -n '3,$p')"
  export PACK_DART_DEFINES PACK_PRODUCT
}

parse_pack_args() {
  _PACK_DEFINE_SPECS=()
  PACK_PRODUCT=0
  PACK_DART_DEFINES=""

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
      --product)
        PACK_PRODUCT=1
        shift
        ;;
      --dart-define=*)
        _PACK_DEFINE_SPECS+=("${1#--dart-define=}")
        shift
        ;;
      --dart-define)
        if [[ -z "${2:-}" ]]; then
          echo "--dart-define requires KEY=value" >&2
          return 1
        fi
        _PACK_DEFINE_SPECS+=("$2")
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

  if ! _resolve_pack_dart_defines; then
    return 1
  fi

  export PACK_PLATFORM PACK_MODE PACK_PRODUCT PACK_DART_DEFINES
}
