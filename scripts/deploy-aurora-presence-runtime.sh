#!/bin/bash
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_ROOT="${AURORA_PRESENCE_RUNTIME_ROOT:-$HOME/.aurora-presence-runtime}"
NODE_BIN="${AURORA_NODE_PATH:-/opt/homebrew/opt/node@22/bin/node}"
RUNTIME_MODE="${AURORA_PRESENCE_RUNTIME_MODE:-dev}"

if [[ ! -x "$NODE_BIN" ]]; then
  NODE_BIN="$(command -v node)"
fi

NPM_BIN="${AURORA_NPM_PATH:-${NODE_BIN%/node}/npm}"
if [[ ! -x "$NPM_BIN" ]]; then
  NPM_BIN="$(command -v npm)"
fi

mkdir -p "$RUNTIME_ROOT"

rsync -a --delete \
  --exclude '.git' \
  --exclude '.next' \
  --exclude '.eslintcache' \
  --exclude '.DS_Store' \
  --exclude '.aurora' \
  --exclude 'node_modules' \
  --exclude '.next.*' \
  --exclude '.tmp-*' \
  "$SOURCE_ROOT/" "$RUNTIME_ROOT/"

mkdir -p "$RUNTIME_ROOT/.aurora"
rm -rf "$RUNTIME_ROOT/.next"

(cd "$RUNTIME_ROOT" && "$NPM_BIN" ci --no-audit --no-fund)

if [[ "$RUNTIME_MODE" == "start" ]]; then
  "$NODE_BIN" "$RUNTIME_ROOT/node_modules/next/dist/bin/next" build --no-lint
fi

printf 'Deployed Aurora presence runtime to %s using %s and %s in %s mode\n' "$RUNTIME_ROOT" "$NODE_BIN" "$NPM_BIN" "$RUNTIME_MODE"
