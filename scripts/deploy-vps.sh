#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# FletesOstrit VPS deploy — safe, single-attempt, deterministic.
#
# Safety model:
#   * A flock lock is acquired BEFORE any production mutation (env-file writes,
#     systemd drop-in, daemon-reload) and is released naturally on process exit.
#   * The running API is NEVER restarted before dependencies and the build
#     succeed. Builds happen in a clean staging checkout owned by APP_USER,
#     never in the live checkout, so a failed fetch/build leaves the running
#     service completely untouched.
#   * Dependencies are installed deterministically with `npm ci` (root + PWA),
#     never `npm install`, and only inside the staging checkout.
#   * The live checkout is only mutated AFTER a successful staging build.
#     Tracked modifications or unexpected untracked files are refused up front
#     instead of being silently discarded.
#   * Activation swaps directories fail-closed (atomic, and it refuses to
#     continue if the destination ends up absent).
#   * Health checks use bounded curl timeouts with a small retry loop and also
#     validate the frontend: index must return 200 and every JS/CSS asset it
#     references must return 200.
#   * An opt-in test gate (RUN_DEPLOY_TESTS=1) runs `npm test` in staging before
#     activation. By default tests are skipped with an explicit warning (never a
#     silent pretend-pass). Known baseline failures documented below.
#   * Before any live reset/activation, an explicit rollback ref (uniquely named
#     local branch owned by APP_USER) is pinned to CURRENT_SHA and validated.
#     The rollback build uses that ref, so it never depends on an implicitly
#     reachable commit. Stale refs are cleaned only after successful activation.
#   * On activation/health failure there is exactly ONE rollback attempt
#     (rebuild + restart + verify). There is no recursive rollback loop; if the
#     rollback itself fails, the script stops and asks for manual intervention.
#   * Ownership of swapped artifacts (node_modules/dist) is REQUIRED: a chown
#     failure aborts activation (never restarts on wrong ownership). Only
#     nonessential cleanup is best-effort.
#   * Activation swaps are crash-recoverable: an explicit on-disk state file is
#     written before any destination mutation; the TERM/INT/EXIT traps restore
#     the previous destination if interrupted, and the previous destination is
#     preserved as .old until activation + health verification succeeds.
#
# Limitation (documented): with this single-checkout layout there is no fully
# atomic power-loss guarantee. There is a tiny window (between moving the old
# directory aside and moving the new one into place) where the destination is
# absent on disk. That window is covered by the traps for shell-handled signals
# (TERM/INT/EXIT) and by next-run recovery (recover_pending_swaps, run before any
# production mutation and again from preflight) for SIGKILL/power-loss, but a
# hard power cut in that exact window leaves the destination absent until the
# next deploy run restores it.
#
# Test gate policy: the autodeploy unit sets RUN_DEPLOY_TESTS=1 and
# REQUIRE_TESTS=strict (see deploy/systemd/fletes-ostrit-autodeploy.service).
# This FAILS CLOSED: any test failure blocks activation, so auto-deploy remains
# effectively paused until the known baseline failures below are fixed. Tests
# still RUN and their result is logged; the script never claims "passed" when
# tests are skipped or failed.
#
# Known baseline test failures (documented so the test gate is not silently
# impossible; these are NOT related to deploy/auth/payment and are out of scope
# for this script):
#   * API: tests/service-area.test.js — 1 failure
#     (expected 'openmaps-routed', got 'approximate').
#   * PWA: fletes-driver-pwa/src/lib/jobPricing.test.ts — 2 failures.
# ---------------------------------------------------------------------------

LOCK_FILE="${LOCK_FILE:-/tmp/fletes-ostrit-deploy.lock}"
REPO_DIR="${REPO_DIR:-/opt/fletes-ostrit}"
STAGING_DIR="${STAGING_DIR:-/opt/fletes-ostrit.staging}"
APP_USER="${APP_USER:-fletes}"
BRANCH="${BRANCH:-main}"
APP_SERVICE="${APP_SERVICE:-fletes-ostrit-api}"
ENV_FILE="${ENV_FILE:-/etc/fletes-ostrit.env}"
HEALTHCHECK_API_URL="${HEALTHCHECK_API_URL:-http://127.0.0.1/api/v1/health}"
HEALTHCHECK_JOBS_URL="${HEALTHCHECK_JOBS_URL:-http://127.0.0.1/api/v1/jobs}"
FINANCE_SUMMARY_URL="${FINANCE_SUMMARY_URL:-http://127.0.0.1/api/v1/finance/summary}"
FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1/}"
RESTART_WAIT_SECONDS="${RESTART_WAIT_SECONDS:-5}"
CURL_CONNECT_TIMEOUT="${CURL_CONNECT_TIMEOUT:-5}"
CURL_TIMEOUT="${CURL_TIMEOUT:-10}"
HEALTH_RETRIES="${HEALTH_RETRIES:-5}"
HEALTH_RETRY_DELAY="${HEALTH_RETRY_DELAY:-2}"
# Test gate: RUN_DEPLOY_TESTS=1 to run `npm test` in staging before activation.
# REQUIRE_TESTS: 'strict' (default, any failure blocks) or 'best-effort'.
RUN_DEPLOY_TESTS="${RUN_DEPLOY_TESTS:-0}"
REQUIRE_TESTS="${REQUIRE_TESTS:-strict}"
PWA_DIR="${REPO_DIR}/fletes-driver-pwa"
# Temporary staging for atomic directory swaps. Kept OUTSIDE the live checkout
# so a crash mid-swap can never leave stray files inside the git worktree.
SWAP_TMP_ROOT="${REPO_DIR}.deploy-swap"
# Known swap destinations (name -> live path) used for crash recovery.
SWAP_ROOT_NODE_MODULES_NAME="root_node_modules"
SWAP_PWA_NODE_MODULES_NAME="pwa_node_modules"
SWAP_PWA_DIST_NAME="pwa_dist"
# Explicit rollback ref: a uniquely named local branch owned by APP_USER, pinned
# to CURRENT_SHA before activation, so the rollback build never depends on an
# implicitly reachable (or unreachable) commit. Stale refs are cleaned only after
# a successful activation.
ROLLBACK_BRANCH_PREFIX="deploy-rollback"
ROLLBACK_BRANCH="${ROLLBACK_BRANCH_PREFIX}-$$"

APP_GROUP="$(id -gn "${APP_USER}" 2>/dev/null || echo "${APP_USER}")"
APP_UID="$(id -u "${APP_USER}" 2>/dev/null || echo "")"

log()  { echo "[deploy] $*"; }
warn() { echo "[deploy] WARNING: $*" >&2; }
fail() { echo "[deploy] ERROR: $*" >&2; }

log "test gate policy: RUN_DEPLOY_TESTS=${RUN_DEPLOY_TESTS:-0} REQUIRE_TESTS=${REQUIRE_TESTS:-strict}"

# Acquire the lock BEFORE any production mutation. fd 9 stays open for the life
# of the process; the lock is released naturally when the shell exits.
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "[deploy] another deployment is already running"
  exit 0
fi

# Map a swap name to its live destination path.
swap_dst() {
  case "$1" in
    "${SWAP_ROOT_NODE_MODULES_NAME}") printf '%s\n' "${REPO_DIR}/node_modules" ;;
    "${SWAP_PWA_NODE_MODULES_NAME}")  printf '%s\n' "${PWA_DIR}/node_modules" ;;
    "${SWAP_PWA_DIST_NAME}")          printf '%s\n' "${PWA_DIR}/dist" ;;
    *) return 1 ;;
  esac
}

# Recover any interrupted swap. Idempotent. Used by the TERM/INT/EXIT traps AND
# run before any production mutation (right after acquiring the lock), so even a
# SIGKILL/power-loss that bypasses traps is repaired before the next deploy.
# Returns 1 if any restore failed or a destination is absent with no backup
# (MANUAL INTERVENTION REQUIRED); 0 otherwise.
recover_pending_swaps() {
  [[ -d "${SWAP_TMP_ROOT}" ]] || return 0

  local state_file name stage dst old new recovery_failed=0 n

  # 1. State-file-driven recovery (in-progress swaps).
  for state_file in "${SWAP_TMP_ROOT}"/*.state; do
    [[ -e "${state_file}" ]] || continue
    name="$(basename "${state_file}" .state 2>/dev/null)"
    stage="$(sed -n '1p' "${state_file}" 2>/dev/null)"
    # Derive the destination from the known name -> path mapping (the state file
    # records only the stage; the name is authoritative and never partial).
    if ! dst="$(swap_dst "${name}" 2>/dev/null)"; then
      fail "unknown swap name '${name}' in ${state_file}; MANUAL INTERVENTION REQUIRED"
      recovery_failed=1
      continue
    fi
    old="${SWAP_TMP_ROOT}/${name}.old"
    new="${SWAP_TMP_ROOT}/${name}.new"

    # Only these stages are valid; anything else (empty/partial/corrupt) fails
    # closed, preserving the state file and backups.
    case "${stage}" in
      prepared|moved_old|done) ;;
      *)
        fail "unknown swap state '${stage}' in ${state_file}; MANUAL INTERVENTION REQUIRED"
        recovery_failed=1
        continue
        ;;
    esac

    # For every valid stage, a missing destination must be restored from .old or
    # fail closed (state preserved). A present destination is safe to clean up.
    if [[ ! -e "${dst}" && ! -L "${dst}" ]]; then
      if [[ -e "${old}" || -L "${old}" ]]; then
        if mv "${old}" "${dst}" 2>/dev/null; then
          log "recovered swap (${stage}): restored ${dst} from ${old}"
        else
          fail "COULD NOT restore ${dst} from ${old}; MANUAL INTERVENTION REQUIRED"
          recovery_failed=1
          continue
        fi
      else
        fail "destination ${dst} is absent and backup ${old} is missing; MANUAL INTERVENTION REQUIRED"
        recovery_failed=1
        continue
      fi
    fi

    # Destination present: drop the staged .new and clear the state marker.
    # Preserve .old (removed only by cleanup_swap_backups or the next swap).
    rm -rf "${new}" 2>/dev/null || true
    rm -f "${state_file}" 2>/dev/null || true
  done

  # 2. Defensive sweep: drop orphaned .new dirs (safe) and restore an orphaned
  #    .old whose destination is absent. An orphaned .old with a present
  #    destination is preserved.
  for n in "${SWAP_ROOT_NODE_MODULES_NAME}" "${SWAP_PWA_NODE_MODULES_NAME}" "${SWAP_PWA_DIST_NAME}"; do
    dst="$(swap_dst "${n}" 2>/dev/null)" || continue
    old="${SWAP_TMP_ROOT}/${n}.old"
    new="${SWAP_TMP_ROOT}/${n}.new"
    if [[ -e "${old}" || -L "${old}" ]]; then
      if [[ ! -e "${dst}" && ! -L "${dst}" ]]; then
        if mv "${old}" "${dst}" 2>/dev/null; then
          log "recovered orphaned backup: restored ${dst} from ${old}"
        else
          fail "COULD NOT restore ${dst} from orphaned ${old}; MANUAL INTERVENTION REQUIRED"
          recovery_failed=1
        fi
      fi
    fi
    rm -rf "${new}" 2>/dev/null || true
  done

  return "${recovery_failed}"
}

# Install crash-recovery traps (no-op when no swap is in progress). On any exit
# or TERM/INT, recover an interrupted swap so node_modules/dist are never left
# absent.
trap 'recover_pending_swaps' EXIT
trap 'recover_pending_swaps; exit 1' INT TERM

# Recover any interrupted swap from a prior crashed/power-loss run BEFORE any
# production mutation (env file, systemd drop-in, daemon-reload).
if ! recover_pending_swaps; then
  fail "could not recover interrupted swap state; MANUAL INTERVENTION REQUIRED"
  exit 1
fi

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return 0
  fi
  od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
}

ensure_finance_read_api_key() {
  if [[ -n "${FINANCE_READ_API_KEY:-}" ]]; then
    return 0
  fi

  local generated_key
  generated_key="$(generate_secret)"
  install -d -m 0750 "$(dirname "${ENV_FILE}")"
  touch "${ENV_FILE}"
  chmod 0600 "${ENV_FILE}" || true

  if grep -q '^FINANCE_READ_API_KEY=' "${ENV_FILE}"; then
    sed -i "s/^FINANCE_READ_API_KEY=.*/FINANCE_READ_API_KEY=${generated_key}/" "${ENV_FILE}"
  else
    printf '\nFINANCE_READ_API_KEY=%s\n' "${generated_key}" >> "${ENV_FILE}"
  fi

  export FINANCE_READ_API_KEY="${generated_key}"
  echo "[deploy] generated FINANCE_READ_API_KEY in ${ENV_FILE}"
}

ensure_finance_read_api_key

ensure_app_service_environment_file() {
  local dropin_dir="/etc/systemd/system/${APP_SERVICE}.service.d"
  local dropin_file="${dropin_dir}/10-env-file.conf"
  install -d -m 0755 "${dropin_dir}"
  cat >"${dropin_file}" <<EOF
[Service]
EnvironmentFile=${ENV_FILE}
EOF
  systemctl daemon-reload
}

ensure_app_service_environment_file

run_as_app() {
  runuser -u "${APP_USER}" -- "$@"
}

# Single HTTP GET with bounded timeouts. Body to stdout, exit status = curl's.
http_get() {
  curl --fail --silent --show-error \
    --connect-timeout "${CURL_CONNECT_TIMEOUT}" \
    --max-time "${CURL_TIMEOUT}" \
    "$@"
}

# Retry a URL until it returns 2xx (body discarded). Extra args passed to curl.
http_ok() {
  local attempt
  for ((attempt=1; attempt<=HEALTH_RETRIES; attempt++)); do
    if http_get --output /dev/null "$@"; then
      return 0
    fi
    if (( attempt < HEALTH_RETRIES )); then
      sleep "${HEALTH_RETRY_DELAY}"
    fi
  done
  return 1
}

check_frontend() {
  local html assets asset missing=0 asset_url attempt

  # Fetch the index with bounded retries, capturing the body for asset parsing.
  html=""
  for ((attempt=1; attempt<=HEALTH_RETRIES; attempt++)); do
    if html="$(http_get "${FRONTEND_URL}")"; then
      break
    fi
    if (( attempt < HEALTH_RETRIES )); then
      sleep "${HEALTH_RETRY_DELAY}"
    fi
  done

  if [[ -z "${html}" ]]; then
    fail "frontend index ${FRONTEND_URL} did not return 200 within ${HEALTH_RETRIES} attempts"
    return 1
  fi

  # Extract referenced JS/CSS asset paths (Vite emits <script src>/<link href>).
  assets="$(printf '%s\n' "${html}" \
    | grep -oE '(src|href)="[^"]+\.(js|css)"' \
    | sed -E 's/^(src|href)="([^"]+)"/\2/' \
    | sort -u)" || true

  if [[ -z "${assets}" ]]; then
    log "frontend index OK (200); no parseable JS/CSS asset references, skipping per-asset checks"
    return 0
  fi

  while IFS= read -r asset; do
    [[ -z "${asset}" ]] && continue
    if [[ "${asset}" == http://* || "${asset}" == https://* ]]; then
      asset_url="${asset}"
    else
      asset_url="${FRONTEND_URL%/}/${asset#/}"
    fi
    if http_ok "${asset_url}"; then
      log "frontend asset OK: ${asset}"
    else
      fail "frontend asset returned non-200: ${asset} (${asset_url})"
      missing=$((missing+1))
    fi
  done <<<"${assets}"

  if (( missing > 0 )); then
    fail "${missing} frontend asset(s) failed to load"
    return 1
  fi
  return 0
}

verify_runtime() {
  if ! http_ok "${HEALTHCHECK_API_URL}"; then
    fail "API health check failed: ${HEALTHCHECK_API_URL}"
    return 1
  fi

  if ! http_ok "${HEALTHCHECK_JOBS_URL}"; then
    fail "jobs health check failed: ${HEALTHCHECK_JOBS_URL}"
    return 1
  fi

  if ! http_ok -H "Authorization: Bearer ${FINANCE_READ_API_KEY}" "${FINANCE_SUMMARY_URL}"; then
    fail "finance summary check failed: ${FINANCE_SUMMARY_URL}"
    return 1
  fi

  if ! check_frontend; then
    fail "frontend availability check failed"
    return 1
  fi

  return 0
}

preflight() {
  # Recover any interrupted swap from a prior crashed/power-loss run first, so a
  # broken live checkout is repaired before we touch anything else.
  if ! recover_pending_swaps; then
    fail "could not recover interrupted swap state; MANUAL INTERVENTION REQUIRED"
    exit 1
  fi

  if [[ ! -d "${REPO_DIR}/.git" ]]; then
    fail "repo not found at ${REPO_DIR}"
    exit 1
  fi

  if ! run_as_app git -C "${REPO_DIR}" rev-parse HEAD >/dev/null 2>&1; then
    fail "cannot read git repo at ${REPO_DIR} as ${APP_USER}; check ownership/permissions"
    exit 1
  fi

  local probe="${REPO_DIR}/.deploy-write-probe"
  if ! run_as_app touch "${probe}" 2>/dev/null; then
    fail "worktree at ${REPO_DIR} is not writable by ${APP_USER}; refusing to deploy"
    exit 1
  fi
  rm -f "${probe}"

  # Refuse if any tracked file is owned by another user (typically root). This
  # would make `git reset --hard` or future APP_USER writes fail mid-deploy.
  local app_uid
  app_uid="$(id -u "${APP_USER}")"

  # Enumerate tracked files to a temp file with an explicitly checked command
  # (no unchecked process substitution), then clean it up.
  local ls_tmp
  ls_tmp="$(mktemp "${TMPDIR:-/tmp}/deploy-ls-files.XXXXXX")" || {
    fail "could not create temporary file for tracked-file enumeration"
    exit 1
  }
  if ! run_as_app git -C "${REPO_DIR}" ls-files -z >"${ls_tmp}"; then
    fail "could not enumerate tracked files (git ls-files failed)"
    rm -f "${ls_tmp}"
    exit 1
  fi

  local owner root_owned=0 stat_failed=0 f
  while IFS= read -r -d '' f; do
    # Fail closed: if ownership cannot be determined, do not assume it is fine.
    if ! owner="$(stat -c '%u' "${REPO_DIR}/${f}" 2>/dev/null)"; then
      fail "cannot verify ownership of tracked file ${f} (stat failed); refusing to deploy"
      stat_failed=1
      break
    fi
    if [[ "${owner}" != "${app_uid}" ]]; then
      log "tracked file owned by another user: ${f}"
      root_owned=1
    fi
  done <"${ls_tmp}"

  rm -f "${ls_tmp}"

  if [[ "${stat_failed}" -eq 1 ]]; then
    exit 1
  fi
  if [[ "${root_owned}" -eq 1 ]]; then
    fail "tracked files are owned by another user; fix with: chown -R ${APP_USER}:${APP_GROUP} ${REPO_DIR}"
    exit 1
  fi
}

# The live checkout must be pristine before we touch it. `git status --porcelain`
# only reports tracked changes and non-ignored untracked files, so ignored build
# artifacts (node_modules/, dist/, .env) do not trigger this guard.
guard_clean_checkout() {
  local status
  status="$(run_as_app git -C "${REPO_DIR}" status --porcelain)" || {
    fail "could not inspect git status as ${APP_USER}"
    return 1
  }

  if [[ -n "${status}" ]]; then
    fail "live checkout is not clean; refusing to overwrite local changes:"
    printf '%s\n' "${status}" | sed 's/^/  /' >&2
    fail "commit, stash, or remove these changes (or add them to .gitignore) and retry."
    return 1
  fi
  return 0
}

# Build a specific commit in a clean staging checkout owned by APP_USER.
# $1 = commit SHA to check out.
# $2 = optional refspec to explicitly fetch from the live repo into staging
#      (used for the rollback branch so the commit's availability never depends
#      on clone's default branch transfer).
# Never touches the live checkout and never restarts the service.
build_version() {
  local sha="$1"
  local fetch_refspec="${2:-}"
  local staging="${STAGING_DIR}"

  if [[ -z "${staging}" || "${staging}" == "/" || "${staging}" == "${REPO_DIR}" ]]; then
    fail "unsafe STAGING_DIR: ${staging}"
    return 1
  fi

  log "preparing clean checkout of ${sha} in ${staging}"

  rm -rf "${staging}"
  if ! install -d -o "${APP_USER}" -g "${APP_GROUP}" "${staging}"; then
    fail "could not create staging directory ${staging}"
    return 1
  fi

  if ! run_as_app git clone --no-checkout "${REPO_DIR}" "${staging}"; then
    fail "could not clone ${REPO_DIR} into ${staging}"
    return 1
  fi

  # Explicitly fetch a specific ref when requested (e.g. the rollback branch),
  # so the commit's presence does not depend on clone's default ref transfer.
  if [[ -n "${fetch_refspec}" ]]; then
    if ! run_as_app git -C "${staging}" fetch "${REPO_DIR}" "${fetch_refspec}"; then
      fail "could not fetch ${fetch_refspec} into staging"
      return 1
    fi
  fi

  if ! run_as_app git -C "${staging}" cat-file -e "${sha}^{commit}"; then
    fail "commit ${sha} not available in staging clone (run git fetch first)"
    return 1
  fi

  if ! run_as_app git -C "${staging}" checkout --detach "${sha}"; then
    fail "could not check out ${sha} in staging"
    return 1
  fi

  # Fail closed: the checked-out commit must equal the requested SHA.
  local checked_out
  checked_out="$(run_as_app git -C "${staging}" rev-parse HEAD)" || {
    fail "could not resolve checked-out commit in staging"
    return 1
  }
  if [[ "${checked_out}" != "${sha}" ]]; then
    fail "staging checkout is ${checked_out}, expected ${sha}"
    return 1
  fi

  if ! run_as_app npm --prefix "${staging}" ci; then
    fail "npm ci failed for root package at ${sha}"
    return 1
  fi

  if ! run_as_app npm --prefix "${staging}/fletes-driver-pwa" ci; then
    fail "npm ci failed for PWA package at ${sha}"
    return 1
  fi

  if ! run_as_app npm --prefix "${staging}" run build; then
    fail "build failed for ${sha}"
    return 1
  fi

  log "build of ${sha} succeeded"
  return 0
}

# Remove preserved .old backups only after activation + health verification has
# succeeded. Best-effort cleanup.
cleanup_swap_backups() {
  rm -rf "${SWAP_TMP_ROOT}" 2>/dev/null || true
}

# Atomically replace $dst with a copy of directory $src (same filesystem).
# Crash-recoverable: an explicit on-disk state file records the swap stage before
# any destination mutation; the TERM/INT/EXIT traps (plus the next run) call
# recover_pending_swaps so $dst is never left absent. The previous $dst is kept
# as .old until cleanup_swap_backups (after activation+health success).
swap_dir() {
  local src="$1" dst="$2" name="$3"
  local new_dir old_dir state_file owner
  new_dir="${SWAP_TMP_ROOT}/${name}.new"
  old_dir="${SWAP_TMP_ROOT}/${name}.old"
  state_file="${SWAP_TMP_ROOT}/${name}.state"

  if ! install -d "${SWAP_TMP_ROOT}"; then
    fail "could not create swap temp root ${SWAP_TMP_ROOT}"
    return 1
  fi
  rm -rf "${new_dir}" "${old_dir}" "${state_file}"

  # Stage the new directory (destination still intact).
  if ! cp -a "${src}" "${new_dir}"; then
    fail "failed to copy ${src} -> ${new_dir}"
    rm -rf "${new_dir}" 2>/dev/null || true
    return 1
  fi
  # Required ownership: fatal BEFORE the directory goes live.
  if ! chown -R "${APP_USER}:${APP_GROUP}" "${new_dir}"; then
    fail "chown ${new_dir} failed; refusing to swap (ownership required)"
    rm -rf "${new_dir}" 2>/dev/null || true
    return 1
  fi

  # Record state BEFORE touching the destination so any interruption is
  # recoverable. Only the stage is recorded; the destination is derived from the
  # name (see swap_dst) so a partial write can never lose the target path.
  printf 'prepared\n' >"${state_file}"

  if [[ -e "${dst}" || -L "${dst}" ]]; then
    # Critical window: mark moved_old, then move the old destination aside.
    printf 'moved_old\n' >"${state_file}"
    if ! mv "${dst}" "${old_dir}"; then
      fail "failed to move existing ${dst} aside"
      rm -f "${state_file}" 2>/dev/null || true
      rm -rf "${new_dir}" 2>/dev/null || true
      return 1
    fi
  fi

  if ! mv "${new_dir}" "${dst}"; then
    fail "failed to move new build into place as ${dst}"
    recover_pending_swaps
    return 1
  fi

  # Destination must be present before the swap is considered done.
  if [[ ! -e "${dst}" && ! -L "${dst}" ]]; then
    fail "destination ${dst} is absent after swap; refusing to continue"
    recover_pending_swaps
    return 1
  fi

  # Ownership must be correct (fail closed).
  if ! owner="$(stat -c '%u' "${dst}" 2>/dev/null)"; then
    fail "cannot verify ownership of ${dst} after swap; refusing to continue"
    recover_pending_swaps
    return 1
  fi
  if [[ "${owner}" != "${APP_UID}" ]]; then
    fail "ownership of ${dst} is ${owner}, expected ${APP_UID}"
    recover_pending_swaps
    return 1
  fi

  # Mark done (destination present + owned). Keep .old until post-verify cleanup.
  printf 'done\n' >"${state_file}"
  return 0
}

install_node_modules() {
  local staging="${STAGING_DIR}"

  if ! swap_dir "${staging}/node_modules" "${REPO_DIR}/node_modules" "${SWAP_ROOT_NODE_MODULES_NAME}"; then
    fail "failed to install root node_modules"
    return 1
  fi
  if ! swap_dir "${staging}/fletes-driver-pwa/node_modules" "${PWA_DIR}/node_modules" "${SWAP_PWA_NODE_MODULES_NAME}"; then
    fail "failed to install PWA node_modules"
    return 1
  fi
}

install_dist() {
  local staging="${STAGING_DIR}"

  if ! swap_dir "${staging}/fletes-driver-pwa/dist" "${PWA_DIR}/dist" "${SWAP_PWA_DIST_NAME}"; then
    fail "failed to install PWA dist"
    return 1
  fi
}

# Opt-in test gate. Default (RUN_DEPLOY_TESTS != 1) skips tests with an explicit
# warning so we never silently pretend tests pass. With RUN_DEPLOY_TESTS=1 the
# suite runs in staging before activation; REQUIRE_TESTS=strict (default) blocks
# on any failure, REQUIRE_TESTS=best-effort logs and continues.
run_deploy_tests() {
  if [[ "${RUN_DEPLOY_TESTS}" != "1" ]]; then
    warn "deploy tests SKIPPED (RUN_DEPLOY_TESTS=${RUN_DEPLOY_TESTS:-unset}, not '1')."
    warn "Known baseline test failures are NOT gated here and remain unfixed:"
    warn "  - API : tests/service-area.test.js — 1 failure (expected 'openmaps-routed', got 'approximate')"
    warn "  - PWA : fletes-driver-pwa/src/lib/jobPricing.test.ts — 2 failures"
    warn "To run the suite before activation, set RUN_DEPLOY_TESTS=1."
    return 0
  fi

  log "running deploy tests (npm test) in staging ${STAGING_DIR}"
  if run_as_app npm --prefix "${STAGING_DIR}" test; then
    log "deploy tests passed"
    return 0
  fi

  if [[ "${REQUIRE_TESTS}" == "best-effort" ]]; then
    warn "deploy tests FAILED but REQUIRE_TESTS=best-effort; continuing activation (NOT recommended)"
    return 0
  fi

  fail "deploy tests FAILED and REQUIRE_TESTS=${REQUIRE_TESTS:-strict}; blocking activation"
  return 1
}

activate_version() {
  local sha="$1"

  # Order matters: dependencies first (old code + refreshed deps is safer than
  # new code + stale deps), then source, then frontend dist, then restart.
  if ! install_node_modules; then
    fail "artifact install failed; service left at previous commit"
    return 1
  fi

  if ! run_as_app git -C "${REPO_DIR}" reset --hard "${sha}"; then
    fail "git reset --hard ${sha} failed; service left untouched"
    return 1
  fi

  if ! install_dist; then
    fail "dist install failed"
    return 1
  fi

  if ! systemctl restart "${APP_SERVICE}"; then
    fail "systemctl restart ${APP_SERVICE} failed"
    return 1
  fi

  sleep "${RESTART_WAIT_SECONDS}"

  if ! verify_runtime; then
    fail "post-restart health check failed for ${sha}"
    return 1
  fi

  # Activation + health verified; now safe to remove preserved backups.
  cleanup_swap_backups

  log "activated ${sha} and verified health"
  return 0
}

# Pin an explicit, validated rollback ref to CURRENT_SHA before any live
# reset/activation. Owned by APP_USER (created via run_as_app git). This makes
# CURRENT_SHA reachable even after `git reset --hard` moves the branch, so the
# rollback build never depends on an implicitly reachable commit.
create_rollback_ref() {
  if ! run_as_app git -C "${REPO_DIR}" branch -f "${ROLLBACK_BRANCH}" "${CURRENT_SHA}"; then
    fail "could not create rollback branch ${ROLLBACK_BRANCH} at ${CURRENT_SHA}"
    return 1
  fi

  local resolved
  resolved="$(run_as_app git -C "${REPO_DIR}" rev-parse "refs/heads/${ROLLBACK_BRANCH}")" || {
    fail "could not verify rollback branch ${ROLLBACK_BRANCH}"
    return 1
  }

  if [[ "${resolved}" != "${CURRENT_SHA}" ]]; then
    fail "rollback branch ${ROLLBACK_BRANCH} resolved to ${resolved}, expected ${CURRENT_SHA}"
    return 1
  fi

  log "rollback ref created: refs/heads/${ROLLBACK_BRANCH} -> ${CURRENT_SHA}"
  return 0
}

# Remove this deploy's rollback ref plus any stale ones left by prior crashed
# runs. Called ONLY after a successful activation. Best-effort cleanup, but the
# ref enumeration is explicitly checked (no unchecked process substitution).
cleanup_rollback_refs() {
  local ref refs_tmp
  run_as_app git -C "${REPO_DIR}" branch -D "${ROLLBACK_BRANCH}" 2>/dev/null || true

  refs_tmp="$(mktemp "${TMPDIR:-/tmp}/deploy-refs.XXXXXX")" || {
    warn "could not create temporary file for rollback ref cleanup"
    return
  }
  if ! run_as_app git -C "${REPO_DIR}" for-each-ref \
      --format='%(refname:short)' "refs/heads/${ROLLBACK_BRANCH_PREFIX}-*" >"${refs_tmp}"; then
    warn "could not enumerate rollback refs; skipping stale-ref cleanup"
    rm -f "${refs_tmp}"
    return
  fi

  while IFS= read -r ref; do
    [[ -z "${ref}" ]] && continue
    run_as_app git -C "${REPO_DIR}" branch -D "${ref}" 2>/dev/null || true
  done <"${refs_tmp}"

  rm -f "${refs_tmp}"
}

# Exactly one rollback attempt. Never recursive. Uses the explicit rollback ref
# so the previous commit is guaranteed reachable.
do_rollback() {
  log "deployment failed; attempting single rollback to ${CURRENT_SHA}"

  if ! build_version "${CURRENT_SHA}" "refs/heads/${ROLLBACK_BRANCH}"; then
    fail "rollback build failed for ${CURRENT_SHA}; MANUAL INTERVENTION REQUIRED"
    return 1
  fi

  if ! activate_version "${CURRENT_SHA}"; then
    fail "rollback activation failed for ${CURRENT_SHA}; MANUAL INTERVENTION REQUIRED"
    return 1
  fi

  log "rollback to ${CURRENT_SHA} completed and verified"
  return 0
}

preflight

if ! CURRENT_SHA="$(run_as_app git -C "${REPO_DIR}" rev-parse HEAD)"; then
  fail "could not resolve current sha"
  exit 1
fi

if ! REMOTE_SHA="$(run_as_app git -C "${REPO_DIR}" ls-remote origin -h "refs/heads/${BRANCH}" | awk '{print $1}')"; then
  fail "could not resolve remote sha for ${BRANCH}"
  exit 1
fi

if [[ -z "${REMOTE_SHA}" ]]; then
  fail "could not resolve remote sha for ${BRANCH}"
  exit 1
fi

if [[ "${CURRENT_SHA}" == "${REMOTE_SHA}" ]]; then
  log "no changes detected"
  exit 0
fi

log "updating ${CURRENT_SHA} -> ${REMOTE_SHA}"

if ! guard_clean_checkout; then
  fail "aborting; running service untouched at ${CURRENT_SHA}"
  exit 1
fi

if ! run_as_app git -C "${REPO_DIR}" fetch origin "${BRANCH}"; then
  fail "git fetch failed; running service untouched at ${CURRENT_SHA}"
  exit 1
fi

if ! build_version "${REMOTE_SHA}"; then
  fail "build failed; running service untouched at ${CURRENT_SHA}"
  exit 1
fi

if ! run_deploy_tests; then
  fail "deploy tests blocked activation; running service untouched at ${CURRENT_SHA}"
  exit 1
fi

if ! create_rollback_ref; then
  fail "could not establish rollback ref; running service untouched at ${CURRENT_SHA}"
  exit 1
fi

if activate_version "${REMOTE_SHA}"; then
  cleanup_rollback_refs
  log "deployment finished for ${REMOTE_SHA}"
  exit 0
fi

fail "deployment failed for ${REMOTE_SHA}"

if do_rollback; then
  fail "deployment failed; rolled back to ${CURRENT_SHA}"
else
  fail "deployment AND rollback failed; MANUAL INTERVENTION REQUIRED"
fi
exit 1
