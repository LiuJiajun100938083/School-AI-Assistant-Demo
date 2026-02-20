#!/usr/bin/env bash
#
# auto_pull.sh — Automatically pull the latest changes from origin/main
#                if the local branch is behind, using fast-forward only.
#
# Usage:
#   ./scripts/auto_pull.sh
#   or via cron:  * * * * * /path/to/scripts/auto_pull.sh
#
# The script determines the project root from its own location so it works
# on any machine without hard-coding paths.

# ---------------------------------------------------------------------------
# Resolve project root (parent directory of the directory containing this script)
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ---------------------------------------------------------------------------
# Ensure PATH includes git and common tools (cron has minimal PATH)
# ---------------------------------------------------------------------------
export PATH="/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:${PATH}"

# ---------------------------------------------------------------------------
# Log file (defined early so error handler can use it)
# ---------------------------------------------------------------------------
LOG_FILE="${SCRIPT_DIR}/auto_pull.log"

# ---------------------------------------------------------------------------
# Logging helper
# ---------------------------------------------------------------------------
log() {
    local timestamp
    timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
    echo "[${timestamp}] $*" >> "${LOG_FILE}"
}

# ---------------------------------------------------------------------------
# Cleanup handler — remove lock file and kill ssh-agent on exit
# ---------------------------------------------------------------------------
LOCK_FILE="${SCRIPT_DIR}/auto_pull.lock"
SSH_AGENT_STARTED=false

cleanup() {
    rm -f "${LOCK_FILE}"
    if $SSH_AGENT_STARTED && [ -n "${SSH_AGENT_PID:-}" ]; then
        kill "${SSH_AGENT_PID}" 2>/dev/null || true
    fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Error handler
# ---------------------------------------------------------------------------
on_error() {
    log "ERROR: An unexpected error occurred on line $1. Exiting."
}
trap 'on_error ${LINENO}' ERR

# Now enable strict mode (after log/trap are defined)
set -euo pipefail

# ---------------------------------------------------------------------------
# Prevent concurrent execution (lock file with PID check)
# ---------------------------------------------------------------------------
if [ -f "${LOCK_FILE}" ]; then
    OLD_PID="$(cat "${LOCK_FILE}" 2>/dev/null || echo "")"
    if [ -n "${OLD_PID}" ] && kill -0 "${OLD_PID}" 2>/dev/null; then
        log "SKIP: Another instance is still running (PID ${OLD_PID}). Exiting."
        # Remove the lock from our cleanup since we didn't create it
        trap - EXIT
        exit 0
    else
        log "WARN: Stale lock file found (PID ${OLD_PID} is dead). Removing."
        rm -f "${LOCK_FILE}"
    fi
fi
echo $$ > "${LOCK_FILE}"

# ---------------------------------------------------------------------------
# SSH key for cron (macOS Keychain)
# ---------------------------------------------------------------------------
if [ -z "${SSH_AUTH_SOCK:-}" ]; then
    eval "$(ssh-agent -s)" > /dev/null 2>&1
    SSH_AGENT_STARTED=true
    ssh-add --apple-use-keychain 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# Log rotation: keep last 500 lines
# ---------------------------------------------------------------------------
if [ -f "${LOG_FILE}" ]; then
    LINE_COUNT="$(wc -l < "${LOG_FILE}" 2>/dev/null || echo 0)"
    if [ "${LINE_COUNT}" -gt 1000 ]; then
        tail -500 "${LOG_FILE}" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "${LOG_FILE}"
    fi
fi

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
log "========== auto_pull started =========="
log "Project directory: ${PROJECT_DIR}"

cd "${PROJECT_DIR}"

# 1. Make sure we are on the main branch
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "${CURRENT_BRANCH}" != "main" ]]; then
    log "WARNING: Current branch is '${CURRENT_BRANCH}', not 'main'. Skipping pull."
    exit 0
fi

# 2. Check for uncommitted changes (staged or unstaged)
if ! git diff --quiet || ! git diff --cached --quiet; then
    log "WARNING: There are uncommitted changes in the working tree. Skipping pull to avoid conflicts."
    log "         Please commit or stash your changes first."
    exit 0
fi

# 3. Fetch the latest state from the remote
log "Fetching origin/main..."
if ! git fetch origin main >> "${LOG_FILE}" 2>&1; then
    log "ERROR: git fetch failed. Check your network connection or remote configuration."
    exit 1
fi

# 4. Determine if local main is behind origin/main
LOCAL_HASH="$(git rev-parse HEAD)"
REMOTE_HASH="$(git rev-parse origin/main)"
BASE_HASH="$(git merge-base HEAD origin/main)"

if [[ "${LOCAL_HASH}" == "${REMOTE_HASH}" ]]; then
    log "Already up to date."
    log "========== auto_pull finished =========="
    exit 0
fi

if [[ "${LOCAL_HASH}" != "${BASE_HASH}" ]]; then
    log "WARNING: Local main has diverged from origin/main (local commits exist that are not on remote)."
    log "         Fast-forward is not possible. Skipping pull."
    log "         LOCAL  = ${LOCAL_HASH}"
    log "         REMOTE = ${REMOTE_HASH}"
    log "         BASE   = ${BASE_HASH}"
    exit 0
fi

# Local is behind origin/main — safe to fast-forward
COMMITS_BEHIND="$(git rev-list --count HEAD..origin/main)"
log "Local main is ${COMMITS_BEHIND} commit(s) behind origin/main. Pulling..."

if git pull --ff-only origin main >> "${LOG_FILE}" 2>&1; then
    log "Pull succeeded. Now at $(git rev-parse --short HEAD)."
else
    log "ERROR: git pull --ff-only failed."
    exit 1
fi

# ---------------------------------------------------------------------------
# 5. Restart the FastAPI server after a successful pull.
# ---------------------------------------------------------------------------
log "Restarting FastAPI server..."

# Kill the existing server process (if any)
# Match both possible launch methods: uvicorn directly or python -m app.main
pkill -f "uvicorn app.main:app" || true
pkill -f "python -m app.main" || true
sleep 2

# Start the server in background (uvicorn on port 8003)
cd "${PROJECT_DIR}"
nohup uvicorn app.main:app --host 0.0.0.0 --port 8003 >> "${SCRIPT_DIR}/server.log" 2>&1 &
log "FastAPI server restarted (PID $!)."

log "========== auto_pull finished =========="
exit 0
