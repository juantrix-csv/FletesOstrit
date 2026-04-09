#!/usr/bin/env bash
set -euo pipefail

LOCK_FILE="${LOCK_FILE:-/tmp/fletes-ostrit-deploy.lock}"
REPO_DIR="${REPO_DIR:-/opt/fletes-ostrit}"
APP_USER="${APP_USER:-fletes}"
BRANCH="${BRANCH:-main}"
APP_SERVICE="${APP_SERVICE:-fletes-ostrit-api}"
ENV_FILE="${ENV_FILE:-/etc/fletes-ostrit.env}"
HEALTHCHECK_API_URL="${HEALTHCHECK_API_URL:-http://127.0.0.1/api/v1/health}"
HEALTHCHECK_JOBS_URL="${HEALTHCHECK_JOBS_URL:-http://127.0.0.1/api/v1/jobs}"
RESTART_WAIT_SECONDS="${RESTART_WAIT_SECONDS:-5}"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "[deploy] another deployment is already running"
  exit 0
fi

run_as_app() {
  runuser -u "${APP_USER}" -- "$@"
}

if [[ ! -d "${REPO_DIR}/.git" ]]; then
  echo "[deploy] repo not found at ${REPO_DIR}"
  exit 1
fi

deploy_started=0
CURRENT_SHA="$(run_as_app git -C "${REPO_DIR}" rev-parse HEAD)"
REMOTE_SHA="$(run_as_app git -C "${REPO_DIR}" ls-remote origin -h "refs/heads/${BRANCH}" | awk '{print $1}')"

verify_runtime() {
  curl --fail --silent --show-error "${HEALTHCHECK_API_URL}" >/dev/null
  curl --fail --silent --show-error "${HEALTHCHECK_JOBS_URL}" >/dev/null
}

build_and_restart() {
  run_as_app npm --prefix "${REPO_DIR}" ci
  run_as_app npm --prefix "${REPO_DIR}/fletes-driver-pwa" install
  run_as_app npm --prefix "${REPO_DIR}" run build
  systemctl restart "${APP_SERVICE}"
  sleep "${RESTART_WAIT_SECONDS}"
  verify_runtime
}

rollback() {
  if [[ "${deploy_started}" -ne 1 ]]; then
    return 0
  fi

  echo "[deploy] rolling back to ${CURRENT_SHA}"
  run_as_app git -C "${REPO_DIR}" reset --hard "${CURRENT_SHA}"
  build_and_restart
  echo "[deploy] rollback finished"
}

if [[ -z "${REMOTE_SHA}" ]]; then
  echo "[deploy] could not resolve remote sha for ${BRANCH}"
  exit 1
fi

if [[ "${CURRENT_SHA}" == "${REMOTE_SHA}" ]]; then
  echo "[deploy] no changes detected"
  exit 0
fi

echo "[deploy] updating ${CURRENT_SHA} -> ${REMOTE_SHA}"

run_as_app git -C "${REPO_DIR}" fetch origin "${BRANCH}"
deploy_started=1
run_as_app git -C "${REPO_DIR}" reset --hard "${REMOTE_SHA}"

if build_and_restart; then
  echo "[deploy] deployment finished for ${REMOTE_SHA}"
  exit 0
fi

echo "[deploy] deployment failed for ${REMOTE_SHA}"
rollback
exit 1
