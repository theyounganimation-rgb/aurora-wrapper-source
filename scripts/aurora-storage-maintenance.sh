#!/usr/bin/env bash
set -euo pipefail

ROOT_HOME="${HOME}"
AURORA_HOME="${ROOT_HOME}/.aurora"
SESSIONS_DIR="${AURORA_HOME}/sessions"
LOGS_DIR="${AURORA_HOME}/logs"
TMP_LOGS_DIR="/tmp/aurora"
WHISPER_DIR="${ROOT_HOME}/.cache/whisper"
TRASH_DIR="${ROOT_HOME}/.Trash"

SESSION_COMPRESS_DAYS="${SESSION_COMPRESS_DAYS:-7}"
TMP_LOG_RETENTION_DAYS="${TMP_LOG_RETENTION_DAYS:-1}"

usage() {
  cat <<'EOF'
Aurora storage maintenance

Defaults:
  SESSION_COMPRESS_DAYS=7
  TMP_LOG_RETENTION_DAYS=1

Behavior:
  - Deletes old /tmp/aurora daily logs
  - Deletes stale Aurora runtime logs
  - Deletes session backup/deleted artifacts
  - Compresses non-stable session transcripts older than SESSION_COMPRESS_DAYS

Options:
  --also-empty-trash
  --also-drop-whisper-cache
  --dry-run
EOF
}

DRY_RUN=0
EMPTY_TRASH=0
DROP_WHISPER=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --also-empty-trash)
      EMPTY_TRASH=1
      ;;
    --also-drop-whisper-cache)
      DROP_WHISPER=1
      ;;
    --dry-run)
      DRY_RUN=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

run_cmd() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[dry-run] %s\n' "$*"
    return 0
  fi
  "$@"
}

run_find_delete() {
  local target="$1"
  shift
  if [[ ! -e "$target" ]]; then
    return 0
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    find "$target" "$@" -print
  else
    find "$target" "$@" -delete
  fi
}

before_avail_kb="$(df -k "${ROOT_HOME}" | awk 'NR==2 { print $4 }')"

if [[ -d "${TMP_LOGS_DIR}" ]]; then
  run_find_delete "${TMP_LOGS_DIR}" -maxdepth 1 -type f -name 'aurora-*.log' -mtime +"${TMP_LOG_RETENTION_DAYS}"
fi

if [[ -d "${LOGS_DIR}" ]]; then
  run_find_delete "${LOGS_DIR}" -maxdepth 1 -type f \( \
    -name 'gateway-manual.log' -o \
    -name 'gateway-manual.err.log' -o \
    -name 'commands.log' -o \
    -name 'gateway-hourly-watchdog.launchd.log' -o \
    -name 'gateway-hourly-watchdog.launchd.err.log' \
  \)
fi

if [[ -d "${SESSIONS_DIR}" ]]; then
  run_find_delete "${SESSIONS_DIR}" -maxdepth 1 -type f \( -name '*.deleted.*' -o -name '*.bak.*' \)
  if [[ "$DRY_RUN" -eq 1 ]]; then
    find "${SESSIONS_DIR}" -maxdepth 1 -type f -name '*.jsonl' -mtime +"${SESSION_COMPRESS_DAYS}" \
      ! -name '__owner_telegram_stable__.jsonl' \
      ! -name '__owner_dashboard_stable__.jsonl' \
      ! -name '__owner_*stable__*' -print
  else
    find "${SESSIONS_DIR}" -maxdepth 1 -type f -name '*.jsonl' -mtime +"${SESSION_COMPRESS_DAYS}" \
      ! -name '__owner_telegram_stable__.jsonl' \
      ! -name '__owner_dashboard_stable__.jsonl' \
      ! -name '__owner_*stable__*' -exec gzip -9 -f {} +
  fi
fi

if [[ "$EMPTY_TRASH" -eq 1 && -d "${TRASH_DIR}" ]]; then
  if [[ "$DRY_RUN" -eq 1 ]]; then
    find "${TRASH_DIR}" -mindepth 1 -maxdepth 1 -print
  else
    find "${TRASH_DIR}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  fi
fi

if [[ "$DROP_WHISPER" -eq 1 && -d "${WHISPER_DIR}" ]]; then
  if [[ "$DRY_RUN" -eq 1 ]]; then
    find "${WHISPER_DIR}" -mindepth 1 -maxdepth 1 -print
  else
    find "${WHISPER_DIR}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  fi
fi

after_avail_kb="$(df -k "${ROOT_HOME}" | awk 'NR==2 { print $4 }')"
freed_kb="$(( after_avail_kb - before_avail_kb ))"

python3 - <<'PY' "${freed_kb}"
import sys
kb = int(sys.argv[1])
print(f"freed_gib={kb / 1024 / 1024:.2f}")
PY
