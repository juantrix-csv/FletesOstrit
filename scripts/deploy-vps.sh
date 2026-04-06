#!/usr/bin/env bash
set -euo pipefail

LOCK_FILE="${LOCK_FILE:-/tmp/fletes-ostrit-deploy.lock}"
REPO_DIR="${REPO_DIR:-/opt/fletes-ostrit}"
APP_USER="${APP_USER:-fletes}"
BRANCH="${BRANCH:-main}"
APP_SERVICE="${APP_SERVICE:-fletes-ostrit-api}"

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

CURRENT_SHA="$(run_as_app git -C "${REPO_DIR}" rev-parse HEAD)"
REMOTE_SHA="$(run_as_app git -C "${REPO_DIR}" ls-remote origin -h "refs/heads/${BRANCH}" | awk '{print $1}')"

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
run_as_app git -C "${REPO_DIR}" reset --hard "${REMOTE_SHA}"

run_as_app npm --prefix "${REPO_DIR}" ci
run_as_app npm --prefix "${REPO_DIR}/fletes-driver-pwa" install
run_as_app npm --prefix "${REPO_DIR}" run build

systemctl restart "${APP_SERVICE}"
echo "[deploy] restart finished for ${APP_SERVICE}"
